import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

PACKAGE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('instalador', PACKAGE / 'instalar.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InstallerTests(unittest.TestCase):
    def test_dry_run_does_not_create_destination(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / 'skills'
            result = module.install(PACKAGE, destination, dry_run=True)
            self.assertEqual(result['novas'], 33)
            self.assertFalse(destination.exists())

    def test_full_install_auxiliaries_and_idempotent_repeat(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / 'skills'
            first = module.install(PACKAGE, destination)
            self.assertEqual(first['novas'], 33)
            self.assertTrue((destination/'sql-schema-designer/scripts/validate_schema.py').is_file())
            self.assertTrue((destination/'tdd-guide/tests/test_local_utilities.py').is_file())
            before = module.hashes(destination)
            second = module.install(PACKAGE, destination)
            self.assertEqual(second['novas'], 0)
            self.assertEqual(second['ja_identicas'], 33)
            self.assertEqual(before, module.hashes(destination))

    def test_conflict_preserves_existing_and_copies_nothing_else(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / 'skills'
            (destination/'tdd').mkdir(parents=True)
            (destination/'tdd/SKILL.md').write_text('custom skill',encoding='utf-8')
            with self.assertRaises(FileExistsError):
                module.install(PACKAGE, destination)
            self.assertEqual((destination/'tdd/SKILL.md').read_text(encoding='utf-8'),'custom skill')
            self.assertEqual([p.name for p in destination.iterdir()],['tdd'])

    def test_modified_package_rejected_before_destination_is_created(self):
        with tempfile.TemporaryDirectory() as folder:
            copied = Path(folder)/'package'
            copied.mkdir()
            shutil.copy2(PACKAGE/'catalogo.json',copied/'catalogo.json')
            (copied/'pacote').mkdir()
            shutil.copytree(PACKAGE/'pacote/tdd',copied/'pacote/tdd')
            (copied/'pacote/tdd/mocking.md').write_text('tampered',encoding='utf-8')
            destination = Path(folder)/'installed'
            with self.assertRaisesRegex(ValueError,'Conteúdo ausente ou alterado'):
                module.install(copied,destination,['tdd'])
            self.assertFalse(destination.exists())


if __name__ == '__main__':
    unittest.main()

