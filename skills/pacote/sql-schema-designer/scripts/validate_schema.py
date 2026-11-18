#!/usr/bin/env python3
"""Read-only, dependency-free lint for a deliberately limited CREATE TABLE dialect.

This is not a SQL compiler, migration runner, or database connection tool.
See --help and ../SKILL.md for the supported scope and exit-code contract.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import json
from pathlib import Path
import re
import sys


class ParseError(ValueError):
    def __init__(self, message, line=1):
        super().__init__(message)
        self.line = line


@dataclass(frozen=True)
class Token:
    value: str
    kind: str
    line: int

    def is_word(self, word):
        return self.kind in ('word', 'symbol') and self.value.upper() == word.upper()


def tokenize(sql):
    """Keep literal/quoted tokens separate so their punctuation is never SQL."""
    tokens, pos, line = [], 0, 1
    while pos < len(sql):
        char = sql[pos]
        if char.isspace():
            line += char == '\n'
            pos += 1
            continue
        if sql.startswith('--', pos):
            end = sql.find('\n', pos)
            pos = len(sql) if end < 0 else end
            continue
        if sql.startswith('/*', pos):
            start, start_line, depth = pos, line, 1
            pos += 2
            while pos < len(sql) and depth:
                if sql.startswith('/*', pos):
                    depth += 1
                    pos += 2
                elif sql.startswith('*/', pos):
                    depth -= 1
                    pos += 2
                else:
                    pos += 1
            if depth:
                raise ParseError('Unclosed block comment.', start_line)
            line += sql[start:pos].count('\n')
            continue
        dollar = re.match(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$', sql[pos:])
        if dollar:
            tag = dollar.group()
            end = sql.find(tag, pos + len(tag))
            if end < 0:
                raise ParseError('Unclosed dollar-quoted literal.', line)
            value = sql[pos:end + len(tag)]
            tokens.append(Token(value, 'literal', line))
            line += value.count('\n')
            pos = end + len(tag)
            continue
        if char in "'\"`[":
            start, start_line = pos, line
            close = ']' if char == '[' else char
            pos += 1
            value = ''
            while pos < len(sql):
                if sql[pos] == close:
                    if pos + 1 < len(sql) and sql[pos + 1] == close:
                        value += close
                        pos += 2
                    else:
                        pos += 1
                        break
                else:
                    # Backslash quoting depends on server modes; do not guess.
                    if char == "'" and sql[pos] == '\\':
                        raise ParseError('Backslash string escapes are not supported; use standard doubled quotes.', start_line)
                    value += sql[pos]
                    pos += 1
            else:
                raise ParseError('Unclosed quoted identifier or string.', start_line)
            tokens.append(Token(value, 'literal' if char == "'" else 'identifier', start_line))
            line += sql[start:pos].count('\n')
            continue
        word = re.match(r'[\w$#@]+', sql[pos:], re.UNICODE)
        if word:
            value = word.group()
            tokens.append(Token(value, 'number' if value[0].isdigit() else 'word', line))
            pos += len(value)
        else:
            tokens.append(Token(char, 'symbol', line))
            pos += 1
    return tokens


def split_top(tokens, delimiter):
    result, start, depth = [], 0, 0
    for index, token in enumerate(tokens):
        if token.is_word('('):
            depth += 1
        elif token.is_word(')'):
            depth -= 1
            if depth < 0:
                raise ParseError('Unexpected closing parenthesis.', token.line)
        elif depth == 0 and token.is_word(delimiter):
            result.append(tokens[start:index])
            start = index + 1
    if depth:
        raise ParseError('Unclosed parenthesis.', tokens[-1].line)
    if start < len(tokens) or delimiter == ',':
        result.append(tokens[start:])
    return result


def top_tokens(tokens):
    depth = 0
    result = []
    for index, token in enumerate(tokens):
        if token.is_word('('):
            depth += 1
        elif token.is_word(')'):
            depth -= 1
        elif depth == 0:
            result.append((index, token))
    return result


def match(tokens, index, *words):
    return all(index + offset < len(tokens) and tokens[index + offset].is_word(word)
               for offset, word in enumerate(words))


class Cursor:
    def __init__(self, tokens, dialect):
        self.tokens, self.pos, self.dialect = tokens, 0, dialect

    @property
    def line(self):
        return self.tokens[min(self.pos, len(self.tokens) - 1)].line if self.tokens else 1

    def take(self, *words):
        if match(self.tokens, self.pos, *words):
            self.pos += len(words)
            return True
        return False

    def expect(self, *words):
        if not self.take(*words):
            raise ParseError('Expected ' + ' '.join(words) + '.', self.line)

    def identifier(self):
        if self.pos >= len(self.tokens) or self.tokens[self.pos].kind not in ('word', 'identifier'):
            raise ParseError('Expected identifier.', self.line)
        token = self.tokens[self.pos]
        self.pos += 1
        if token.kind == 'identifier' and self.dialect == 'postgresql':
            return token.value
        return token.value.lower()

    def name(self):
        parts = [self.identifier()]
        while self.take('.'):
            parts.append(self.identifier())
        return tuple(parts)

    def group(self):
        self.expect('(')
        start, depth = self.pos, 1
        while self.pos < len(self.tokens):
            token = self.tokens[self.pos]
            self.pos += 1
            if token.is_word('('):
                depth += 1
            elif token.is_word(')'):
                depth -= 1
                if depth == 0:
                    return self.tokens[start:self.pos - 1]
        raise ParseError('Unclosed parenthesis.', self.line)

    def columns(self):
        columns = []
        for part in split_top(self.group(), ','):
            item = Cursor(part, self.dialect)
            columns.append(item.identifier())
            item.take('ASC') or item.take('DESC')
            if item.pos != len(part):
                raise ParseError('Only simple column names are supported in key/index lists.', item.line)
        return tuple(columns)


@dataclass
class Column:
    name: str
    type_name: str
    not_null: bool
    line: int


@dataclass
class ForeignKey:
    columns: tuple
    target: tuple
    target_columns: tuple | None
    actions: dict
    line: int


@dataclass
class Table:
    name: tuple
    line: int
    columns: dict = field(default_factory=dict)
    primary_keys: list = field(default_factory=list)
    unique_keys: list = field(default_factory=list)
    indexes: list = field(default_factory=list)
    foreign_keys: list = field(default_factory=list)
    sqlite_strict_key: bool = False
    mysql_innodb: bool = False


class Linter:
    def __init__(self, dialect):
        self.dialect, self.tables, self.pending_indexes = dialect, {}, []
        self.findings, self.complete = [], True

    def add(self, code, message, line, table=None, severity='warning', incomplete=False):
        self.findings.append(dict(code=code, severity=severity, line=line,
                                  table='.'.join(table) if table else None, message=message))
        if incomplete:
            self.complete = False

    def foreign_key(self, tokens, columns, line):
        cursor = Cursor(tokens, self.dialect)
        target = cursor.name()
        target_columns = cursor.columns() if match(tokens, cursor.pos, '(') else None
        flat = [token for _, token in top_tokens(tokens[cursor.pos:])]
        actions = {}
        for index in range(len(flat)):
            for operation in ('DELETE', 'UPDATE'):
                if match(flat, index, 'ON', operation):
                    for action in ('NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'):
                        if match(flat, index + 2, *action.split()):
                            actions[operation] = action
                            break
                    else:
                        raise ParseError('Unrecognized referential action.', flat[index].line)
        return ForeignKey(columns, target, target_columns, actions, line)

    def parse_table(self, cursor):
        cursor.take('IF', 'NOT', 'EXISTS')
        line, name = cursor.line, cursor.name()
        table = Table(name, line)
        body = cursor.group()
        suffix = cursor.tokens[cursor.pos:]
        table.sqlite_strict_key = any(token.is_word('STRICT') or token.is_word('WITHOUT') for token in suffix)
        table.mysql_innodb = any(match(suffix, i, 'ENGINE', '=', 'INNODB') or
                                 match(suffix, i, 'ENGINE', 'INNODB') for i in range(len(suffix)))
        if suffix and not (self.dialect == 'mysql' and match(suffix, 0, 'ENGINE')) and not (
                self.dialect == 'sqlite' and (match(suffix, 0, 'STRICT') or match(suffix, 0, 'WITHOUT', 'ROWID'))):
            self.add('TABLE_OPTIONS_NOT_ANALYZED', 'Trailing table options need engine validation.', suffix[0].line, name, incomplete=True)
        for part in split_top(body, ','):
            if not part:
                raise ParseError('Empty column or constraint definition.', line)
            item = Cursor(part, self.dialect)
            if item.take('CONSTRAINT'):
                item.identifier()
            if item.take('PRIMARY', 'KEY'):
                item.take('CLUSTERED') or item.take('NONCLUSTERED')
                table.primary_keys.append(item.columns())
            elif item.take('UNIQUE'):
                item.take('KEY') or item.take('INDEX') or item.take('CLUSTERED') or item.take('NONCLUSTERED')
                if not match(part, item.pos, '('):
                    item.identifier()
                table.unique_keys.append(item.columns())
            elif item.take('FOREIGN', 'KEY'):
                if not match(part, item.pos, '('):
                    item.identifier()
                columns = item.columns()
                item.expect('REFERENCES')
                table.foreign_keys.append(self.foreign_key(part[item.pos:], columns, part[0].line))
            elif item.take('CHECK'):
                item.group()  # Deliberately do not evaluate check expressions.
            elif item.take('INDEX') or item.take('KEY'):
                if not match(part, item.pos, '('):
                    item.identifier()
                table.indexes.append(item.columns())
            elif item.take('EXCLUDE') or item.take('LIKE'):
                self.add('DEFINITION_NOT_ANALYZED', 'This table definition needs manual review.', part[0].line, name, incomplete=True)
            else:
                column_name = item.identifier()
                if item.pos >= len(part):
                    raise ParseError('Column type is missing.', item.line)
                type_name = part[item.pos].value.upper()
                if type_name == 'AS':
                    self.add('DEFINITION_NOT_ANALYZED', 'Computed column expression is not analyzed.', item.line, name, incomplete=True)
                flat_pairs = top_tokens(part[item.pos:])
                flat = [token for _, token in flat_pairs]
                not_null = any(match(flat, i, 'NOT', 'NULL') for i in range(len(flat)))
                if column_name in table.columns:
                    self.add('DUPLICATE_COLUMN', f'Duplicate column {column_name}.', part[0].line, name, 'error')
                table.columns[column_name] = Column(column_name, type_name, not_null, part[0].line)
                for i, (original, token) in enumerate(flat_pairs):
                    if match(flat, i, 'PRIMARY', 'KEY'):
                        table.primary_keys.append((column_name,))
                    elif token.is_word('UNIQUE'):
                        table.unique_keys.append((column_name,))
                    elif token.is_word('REFERENCES'):
                        if self.dialect == 'mysql':
                            self.add('MYSQL_INLINE_REFERENCE', 'MySQL inline REFERENCES does not enforce this FK; use a table-level FOREIGN KEY declaration.', token.line, name, incomplete=True)
                        table.foreign_keys.append(self.foreign_key(part[item.pos + original + 1:], (column_name,), token.line))
                if type_name in ('REAL', 'FLOAT', 'DOUBLE') and re.search(r'(^|_)(amount|price|cost|salary|money|balance)(_|$)', column_name):
                    self.add('FLOAT_MONEY', f'{column_name} may represent money; prefer exact decimal or integer minor units.', part[0].line, name)
        if name in self.tables:
            self.add('DUPLICATE_TABLE', 'Duplicate CREATE TABLE; final state is ambiguous.', line, name, 'error')
        else:
            self.tables[name] = table

    def parse_index(self, cursor, unique):
        cursor.take('CONCURRENTLY')
        cursor.take('IF', 'NOT', 'EXISTS')
        cursor.name()
        cursor.expect('ON')
        name = cursor.name()
        if cursor.take('USING'):
            method = cursor.identifier()
            if method != 'btree':
                self.add('INDEX_NOT_ANALYZED', f'Index method {method} is not analyzed.', cursor.line, name, incomplete=True)
                return
        try:
            columns = cursor.columns()
        except ParseError:
            self.add('INDEX_NOT_ANALYZED', 'Expression/prefix index is not analyzed.', cursor.line, name, incomplete=True)
            return
        suffix = cursor.tokens[cursor.pos:]
        partial = any(token.is_word('WHERE') for _, token in top_tokens(suffix))
        if partial:
            self.add('PARTIAL_INDEX_NOT_COUNTED', 'Partial index cannot generally cover all FK rows or referenced key values.', cursor.line, name, incomplete=True)
        else:
            self.pending_indexes.append((name, columns, unique, cursor.line))

    def parse(self, statement):
        cursor = Cursor(statement, self.dialect)
        if cursor.take('CREATE'):
            cursor.take('TEMPORARY') or cursor.take('TEMP') or cursor.take('UNLOGGED')
            if cursor.take('TABLE'):
                self.parse_table(cursor)
                return
            unique = cursor.take('UNIQUE')
            cursor.take('CLUSTERED') or cursor.take('NONCLUSTERED')
            if cursor.take('INDEX'):
                self.parse_index(cursor, unique)
                return
        self.add('STATEMENT_NOT_ANALYZED', 'Only CREATE TABLE and simple CREATE INDEX are analyzed; SQL was not executed.', statement[0].line, incomplete=True)

    def analyze(self):
        for name, columns, unique, line in self.pending_indexes:
            if name not in self.tables:
                self.add('EXTERNAL_INDEX_TABLE', 'Index table is not declared in this input.', line, name, incomplete=True)
            else:
                table = self.tables[name]
                (table.unique_keys if unique else table.indexes).append(columns)
        for table in self.tables.values():
            if not table.primary_keys:
                self.add('NO_PRIMARY_KEY', 'No primary key declared; document an exception or add one.', table.line, table.name)
            elif len(table.primary_keys) > 1:
                self.add('MULTIPLE_PRIMARY_KEYS', 'A table cannot have multiple primary keys.', table.line, table.name, 'error')
            keys = table.primary_keys + table.unique_keys + table.indexes
            for columns in keys + [fk.columns for fk in table.foreign_keys]:
                if len(columns) != len(set(columns)):
                    self.add('DUPLICATE_KEY_COLUMN', 'Column occurs more than once in a key/index.', table.line, table.name, 'error')
                for column in columns:
                    if column not in table.columns:
                        self.add('UNKNOWN_COLUMN', f'Constraint/index uses undeclared column {column}.', table.line, table.name, 'error')
            primary_columns = {column for key in table.primary_keys for column in key}
            if self.dialect == 'mysql' and table.foreign_keys and not table.mysql_innodb:
                self.add('MYSQL_ENGINE_UNVERIFIED', 'FK enforcement/index creation assumes InnoDB; confirm the child storage engine.', table.line, table.name, incomplete=True)
            for fk in table.foreign_keys:
                missing_actions = {'DELETE', 'UPDATE'} - fk.actions.keys()
                if missing_actions:
                    self.add('FK_ACTION_UNSPECIFIED', 'Review default ON ' + '/'.join(sorted(missing_actions)) + ' behavior; explicit actions document intent.', fk.line, table.name)
                if 'SET NULL' in fk.actions.values():
                    for name in fk.columns:
                        column = table.columns.get(name)
                        implicit_not_null = name in primary_columns and (
                            self.dialect != 'sqlite' or table.sqlite_strict_key or (
                                len(primary_columns) == 1 and column is not None and column.type_name == 'INTEGER'))
                        if column and (column.not_null or implicit_not_null):
                            self.add('SET_NULL_NOT_NULL', f'SET NULL conflicts with NOT NULL/primary key on {name}.', fk.line, table.name, 'error')
                if not any(len(key) >= len(fk.columns) and set(key[:len(fk.columns)]) == set(fk.columns) for key in keys):
                    # InnoDB creates a supporting index automatically; no missing-index claim.
                    if self.dialect != 'mysql' or not table.mysql_innodb:
                        self.add('FK_INDEX_MISSING', 'No full index with these FK columns as its leading keys: ' + ', '.join(fk.columns), fk.line, table.name)
                parent = self.tables.get(fk.target)
                if parent is None:
                    self.add('EXTERNAL_REFERENCE', 'Referenced table is outside this input; verify it in the intended schema/search path.', fk.line, table.name, incomplete=True)
                    continue
                if self.dialect == 'mysql' and not parent.mysql_innodb:
                    self.add('MYSQL_ENGINE_UNVERIFIED', 'Confirm the referenced parent storage engine supports this FK.', fk.line, table.name, incomplete=True)
                target = fk.target_columns
                if target is None:
                    target = parent.primary_keys[0] if parent.primary_keys else ()
                if len(target) != len(fk.columns):
                    self.add('FK_ARITY_MISMATCH', 'Local and referenced key column counts differ.', fk.line, table.name, 'error')
                for column in target:
                    if column not in parent.columns:
                        self.add('UNKNOWN_REFERENCE_COLUMN', f'Referenced column {column} is not declared.', fk.line, table.name, 'error')
                if not any(len(key) == len(target) and set(key) == set(target) for key in parent.primary_keys + parent.unique_keys):
                    self.add('REFERENCE_NOT_UNIQUE', 'Referenced columns have no full primary/unique key in this input.', fk.line, table.name, 'error')


def validate_schema(sql, dialect='postgresql'):
    linter = Linter(dialect)
    try:
        statements = split_top(tokenize(sql.lstrip('\ufeff')), ';')
        for statement in statements:
            if not statement:
                continue
            try:
                linter.parse(statement)
            except ParseError as error:
                linter.add('PARSE_ERROR', str(error), error.line, severity='error', incomplete=True)
        linter.analyze()
    except ParseError as error:
        linter.add('PARSE_ERROR', str(error), error.line, severity='error', incomplete=True)
    if not linter.tables:
        linter.add('NO_TABLES', 'No supported CREATE TABLE definitions were analyzed.', 1, severity='error', incomplete=True)
    return dict(dialect=dialect, tables_checked=len(linter.tables),
                analysis_complete=linter.complete, findings=linter.findings,
                scope='Static checks only; database syntax, types, CHECK expressions, collation and runtime behavior are not validated.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', help='UTF-8 SQL file, or - for standard input. Never modified or executed.')
    parser.add_argument('--dialect', choices=('postgresql', 'mysql', 'sqlite', 'sqlserver'), default='postgresql')
    parser.add_argument('--format', choices=('text', 'json'), default='text')
    parser.add_argument('--strict', action='store_true', help='Return 1 for warnings as well as errors.')
    args = parser.parse_args(argv)
    try:
        sql = sys.stdin.read() if args.file == '-' else Path(args.file).read_text(encoding='utf-8-sig')
    except (OSError, UnicodeError) as error:
        parser.exit(2, f'Input error: {error}\n')
    report = validate_schema(sql, args.dialect)
    if args.format == 'json':
        print(json.dumps(report, ensure_ascii=True, indent=2))
    else:
        print(f"Tables checked: {report['tables_checked']}; analysis complete within supported scope: {report['analysis_complete']}")
        for finding in report['findings']:
            print(f"{finding['severity'].upper()} {finding['code']} line {finding['line']} [{finding['table'] or '-'}]: {finding['message']}")
        print(report['scope'])
    return int(any(f['severity'] == 'error' or args.strict for f in report['findings']))


if __name__ == '__main__':
    sys.exit(main())
