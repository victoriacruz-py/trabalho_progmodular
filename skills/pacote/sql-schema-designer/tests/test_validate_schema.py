"""Behavioral tests for the read-only schema linter; run with unittest discovery."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'validate_schema.py'
VALID = '''
CREATE TABLE account (id INTEGER PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE);
CREATE TABLE entry (
    account_id INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
    note VARCHAR(200) DEFAULT 'comma, semicolon; PRIMARY KEY -- not SQL',
    PRIMARY KEY (account_id, sequence),
    FOREIGN KEY (account_id) REFERENCES account(id)
        ON DELETE CASCADE ON UPDATE NO ACTION
);
'''


class SchemaLintTests(unittest.TestCase):
    def run_sql(self, sql, *args):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), '-', '--format', 'json', *args],
            input=sql, text=True, capture_output=True, timeout=10,
        )
        self.assertTrue(result.stdout.strip().startswith('{'),
                        f'Missing JSON report: {result.stderr or result.stdout}')
        return result.returncode, json.loads(result.stdout)

    def codes(self, report):
        return {finding['code'] for finding in report['findings']}

    def test_valid_schema_accepts_pk_prefix_index_and_ignores_literal_punctuation(self):
        code, report = self.run_sql(VALID, '--strict')
        self.assertEqual(code, 0)
        self.assertEqual(report['tables_checked'], 2)
        self.assertEqual(report['findings'], [])

    def test_dialects_accept_their_quoted_names_and_identity_columns(self):
        fixtures = {
            'postgresql': 'CREATE TABLE "Order" (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY);',
            'mysql': 'CREATE TABLE `order` (id BIGINT AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB;',
            'sqlite': 'CREATE TABLE "order" (id INTEGER PRIMARY KEY);',
            'sqlserver': 'CREATE TABLE [dbo].[order] (id BIGINT IDENTITY(1,1) PRIMARY KEY);',
        }
        for dialect, sql in fixtures.items():
            with self.subTest(dialect=dialect):
                code, report = self.run_sql(sql, '--dialect', dialect, '--strict')
                self.assertEqual((code, report['findings']), (0, []))

    def test_named_composite_constraints_and_external_index_resolve(self):
        sql = '''CREATE TABLE parent (a INT NOT NULL, b INT NOT NULL,
            CONSTRAINT pk_parent PRIMARY KEY (a,b));
        CREATE TABLE child (id INT PRIMARY KEY, a INT, b INT,
            CONSTRAINT fk_child FOREIGN KEY (a,b) REFERENCES parent(a,b)
            ON DELETE SET NULL ON UPDATE NO ACTION);
        CREATE INDEX ix_child ON child(b,a,id);'''
        code, report = self.run_sql(sql, '--strict')
        self.assertEqual((code, report['findings']), (0, []))

    def test_missing_pk_warns_and_strict_mode_fails(self):
        sql = 'CREATE TABLE event (message TEXT);'
        code, report = self.run_sql(sql)
        self.assertEqual(code, 0)
        self.assertIn('NO_PRIMARY_KEY', self.codes(report))
        self.assertEqual(self.run_sql(sql, '--strict')[0], 1)

    def test_unknown_local_fk_column_is_error(self):
        code, report = self.run_sql('''CREATE TABLE p (id INT PRIMARY KEY);
        CREATE TABLE c (id INT PRIMARY KEY, FOREIGN KEY (missing) REFERENCES p(id));''')
        self.assertEqual(code, 1)
        self.assertIn('UNKNOWN_COLUMN', self.codes(report))

    def test_unknown_target_column_is_error(self):
        code, report = self.run_sql('''CREATE TABLE p (id INT PRIMARY KEY);
        CREATE TABLE c (id INT PRIMARY KEY REFERENCES p(missing));''')
        self.assertEqual(code, 1)
        self.assertIn('UNKNOWN_REFERENCE_COLUMN', self.codes(report))

    def test_target_must_be_unique_not_just_indexed(self):
        sql = '''CREATE TABLE p (id INT PRIMARY KEY, code INT);
        CREATE INDEX ix_p ON p(code);
        CREATE TABLE c (id INT PRIMARY KEY REFERENCES p(code));'''
        code, report = self.run_sql(sql)
        self.assertEqual(code, 1)
        self.assertIn('REFERENCE_NOT_UNIQUE', self.codes(report))

    def test_later_unique_index_satisfies_target_key(self):
        sql = '''CREATE TABLE p (id INT PRIMARY KEY, code INT);
        CREATE TABLE c (id INT PRIMARY KEY REFERENCES p(code)
            ON DELETE NO ACTION ON UPDATE NO ACTION);
        CREATE UNIQUE INDEX uq_p ON p(code);'''
        code, report = self.run_sql(sql, '--strict')
        self.assertEqual((code, report['findings']), (0, []))

    def test_external_parent_is_reported_without_claiming_invalid_reference(self):
        code, report = self.run_sql('CREATE TABLE c (id INT PRIMARY KEY REFERENCES external_parent(id));')
        self.assertEqual(code, 0)
        self.assertIn('EXTERNAL_REFERENCE', self.codes(report))
        self.assertFalse(report['analysis_complete'])

    def test_fk_arity_mismatch_is_error(self):
        code, report = self.run_sql('''CREATE TABLE p (a INT, b INT, PRIMARY KEY(a,b));
        CREATE TABLE c (id INT PRIMARY KEY REFERENCES p(a,b));''')
        self.assertEqual(code, 1)
        self.assertIn('FK_ARITY_MISMATCH', self.codes(report))

    def test_set_null_conflicts_with_not_null_and_implicit_primary_key(self):
        for definition in ('id INT PRIMARY KEY', 'id INT NOT NULL, PRIMARY KEY(id)'):
            with self.subTest(definition=definition):
                code, report = self.run_sql(f'''CREATE TABLE p (id INT PRIMARY KEY);
                CREATE TABLE c ({definition}, FOREIGN KEY(id) REFERENCES p(id)
                    ON DELETE SET NULL ON UPDATE NO ACTION);''')
                self.assertEqual(code, 1)
                self.assertIn('SET_NULL_NOT_NULL', self.codes(report))

    def test_index_with_fk_only_as_suffix_or_include_does_not_cover_it(self):
        base = '''CREATE TABLE p (id INT PRIMARY KEY);
        CREATE TABLE c (id INT PRIMARY KEY, parent_id INT REFERENCES p(id)
            ON DELETE NO ACTION ON UPDATE NO ACTION);'''
        for index in ('CREATE INDEX ix ON c(id,parent_id);',
                      'CREATE INDEX ix ON c(id) INCLUDE(parent_id);',
                      'CREATE INDEX ix ON c(parent_id) WHERE parent_id > 10;'):
            with self.subTest(index=index):
                _, report = self.run_sql(base + index)
                self.assertIn('FK_INDEX_MISSING', self.codes(report))

    def test_comments_do_not_create_fake_tables_or_constraints(self):
        code, report = self.run_sql('''/* CREATE TABLE fake (id INT); */
        -- PRIMARY KEY(fake)
        CREATE TABLE real_table (id INT PRIMARY KEY, note TEXT DEFAULT 'it''s (fine);');''', '--strict')
        self.assertEqual((code, report['tables_checked']), (0, 1))

    def test_duplicate_columns_tables_and_primary_keys_are_errors(self):
        cases = [
            ('CREATE TABLE a (id INT PRIMARY KEY, id INT);', 'DUPLICATE_COLUMN'),
            ('CREATE TABLE a (id INT PRIMARY KEY); CREATE TABLE a (id INT PRIMARY KEY);', 'DUPLICATE_TABLE'),
            ('CREATE TABLE a (id INT PRIMARY KEY, x INT PRIMARY KEY);', 'MULTIPLE_PRIMARY_KEYS'),
        ]
        for sql, expected in cases:
            with self.subTest(expected=expected):
                code, report = self.run_sql(sql)
                self.assertEqual(code, 1)
                self.assertIn(expected, self.codes(report))

    def test_unclosed_tokens_and_parentheses_fail_with_json_diagnostics(self):
        for sql in ("CREATE TABLE a (id INT PRIMARY KEY, x TEXT DEFAULT 'bad);",
                    'CREATE TABLE a (id INT PRIMARY KEY;', '/* unclosed',
                    'CREATE TABLE a (id INT PRIMARY KEY,);'):
            with self.subTest(sql=sql):
                code, report = self.run_sql(sql)
                self.assertEqual(code, 1)
                self.assertIn('PARSE_ERROR', self.codes(report))

    def test_unhandled_statements_are_visible_and_never_executed(self):
        code, report = self.run_sql('''CREATE TABLE a (id INT PRIMARY KEY);
        ALTER TABLE a ADD x INT; DROP TABLE a;''')
        self.assertEqual(code, 0)
        self.assertFalse(report['analysis_complete'])
        self.assertIn('STATEMENT_NOT_ANALYZED', self.codes(report))

    def test_empty_input_and_non_schema_input_do_not_claim_success(self):
        for sql in ('', '-- only comment', 'SELECT 1;'):
            with self.subTest(sql=sql):
                code, report = self.run_sql(sql)
                self.assertEqual(code, 1)
                self.assertIn('NO_TABLES', self.codes(report))

    def test_money_float_warning_has_table_and_line(self):
        _, report = self.run_sql('CREATE TABLE item (\n id INT PRIMARY KEY,\n unit_price REAL\n);')
        finding = next(f for f in report['findings'] if f['code'] == 'FLOAT_MONEY')
        self.assertEqual((finding['table'], finding['line']), ('item', 3))

    def test_file_input_is_read_only_and_missing_file_has_exit_two(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'schema.sql'
            source.write_text(VALID, encoding='utf-8')
            before = source.read_bytes()
            result = subprocess.run([sys.executable, str(SCRIPT), str(source), '--strict'],
                                    text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(source.read_bytes(), before)
            self.assertEqual(len(list(Path(folder).iterdir())), 1)
            missing = subprocess.run([sys.executable, str(SCRIPT), str(source) + '.missing'],
                                     text=True, capture_output=True, timeout=10)
            self.assertEqual(missing.returncode, 2)

    def test_mysql_inline_reference_is_not_mistaken_for_enforced_constraint(self):
        _, report = self.run_sql('''CREATE TABLE p (id INT PRIMARY KEY) ENGINE=InnoDB;
        CREATE TABLE c (id INT PRIMARY KEY REFERENCES p(id)
          ON DELETE NO ACTION ON UPDATE NO ACTION) ENGINE=InnoDB;''', '--dialect', 'mysql')
        self.assertIn('MYSQL_INLINE_REFERENCE', self.codes(report))
        self.assertFalse(report['analysis_complete'])

    def test_mysql_fk_storage_engine_is_not_assumed_when_unspecified(self):
        _, report = self.run_sql('''CREATE TABLE p (id INT PRIMARY KEY);
        CREATE TABLE c (id INT PRIMARY KEY, parent_id INT,
          FOREIGN KEY(parent_id) REFERENCES p(id) ON DELETE NO ACTION ON UPDATE NO ACTION);''',
          '--dialect', 'mysql')
        self.assertIn('MYSQL_ENGINE_UNVERIFIED', self.codes(report))

    def test_repeated_columns_in_a_key_are_not_accepted(self):
        code, report = self.run_sql('CREATE TABLE t (id INT, PRIMARY KEY(id,id));')
        self.assertEqual(code, 1)
        self.assertIn('DUPLICATE_KEY_COLUMN', self.codes(report))


if __name__ == '__main__':
    unittest.main()
