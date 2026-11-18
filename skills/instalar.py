"""Install the bundled skill folders without downloads or overwriting files."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile


def hashes(folder):
    result = {}
    for file in sorted(folder.rglob('*')):
        if file.is_symlink():
            raise ValueError(f'Link simbólico não permitido: {file}')
        if file.is_file() and '__pycache__' not in file.parts and file.suffix != '.pyc':
            result[file.relative_to(folder).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
    return result


def install(package_root, destination, selected=None, dry_run=False):
    package_root = Path(package_root).resolve()
    destination = Path(destination).expanduser().resolve()
    if destination.is_relative_to(package_root):
        raise ValueError('Escolha um destino fora da pasta do pacote de instalação.')
    catalog = json.loads((package_root / 'catalogo.json').read_text(encoding='utf-8'))['skills']
    by_id = {entry['id']: entry for entry in catalog}
    if selected:
        unknown = sorted(set(selected) - set(by_id))
        if unknown:
            raise ValueError('IDs desconhecidos: ' + ', '.join(unknown))
        excluded = [name for name in selected if not by_id[name]['incluida']]
        if excluded:
            raise ValueError('Instalação pelo plugin: ' + ', '.join(excluded) + '. Leia PDF_SKILL_EXTERNA.md.')
    entries = [entry for entry in catalog if entry['incluida'] and (not selected or entry['id'] in selected)]
    pending, existing, conflicts = [], [], []
    # Verify every source and conflict before creating the destination.
    for entry in entries:
        skill_id = entry['id']
        if not skill_id or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in skill_id):
            raise ValueError('ID inválido no catálogo.')
        source = (package_root / entry['pasta']).resolve()
        if not source.is_relative_to(package_root / 'pacote') or not (source / 'SKILL.md').is_file():
            raise ValueError(f'Origem inválida: {skill_id}')
        if hashes(source) != entry['arquivos']:
            raise ValueError(f'Conteúdo ausente ou alterado: {skill_id}. Extraia novamente o ZIP verificado.')
        target = destination / skill_id
        if target.is_symlink():
            conflicts.append(skill_id)
        elif target.exists():
            if target.is_dir() and hashes(target) == entry['arquivos']:
                existing.append(skill_id)
            else:
                conflicts.append(skill_id)
        else:
            pending.append((entry, source, target))
    if conflicts:
        raise FileExistsError('Nenhum arquivo alterado. Já existem versões diferentes: ' + ', '.join(conflicts) + '. Use outro destino ou --only para selecionar as demais.')
    if not dry_run and pending:
        destination.mkdir(parents=True, exist_ok=True)
        for entry, source, target in pending:
            with tempfile.TemporaryDirectory(prefix='.ecommerce-skill-', dir=destination) as staging_name:
                staging = Path(staging_name).resolve()
                if not staging.is_relative_to(destination):
                    raise ValueError('Pasta temporária fora do destino informado.')
                copied = staging / entry['id']
                shutil.copytree(source, copied)
                if hashes(copied) != entry['arquivos']:
                    raise ValueError(f'Falha de integridade ao copiar {entry["id"]}')
                if target.exists() or target.is_symlink():
                    raise FileExistsError(f'O destino foi criado durante a instalação: {target.name}')
                copied.rename(target)
    return {'modo': 'simulacao' if dry_run else 'instalacao', 'destino': str(destination), 'novas': len(pending), 'ja_identicas': len(existing), 'skills': [entry['id'] for entry, _, _ in pending]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--list', action='store_true', help='Listar IDs, grupos e disponibilidade, sem instalar.')
    parser.add_argument('--dest', type=Path, help='Destino. Padrão: .agents/skills na raiz da entrega.')
    parser.add_argument('--only', nargs='+', help='Instalar somente estes IDs do catálogo.')
    parser.add_argument('--dry-run', action='store_true', help='Verificar integridade e conflitos, sem gravar.')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    if args.list:
        catalog = json.loads((root / 'catalogo.json').read_text(encoding='utf-8'))
        for entry in catalog['skills']:
            print(f'{entry["id"]}: {entry["grupo"]}; ' + ('incluída' if entry['incluida'] else 'via plugin'))
        return 0
    try:
        result = install(root, args.dest or root.parent / '.agents/skills', args.only, args.dry_run)
    except (ValueError, FileExistsError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print('Nenhum script das skills foi executado e nenhuma configuração global foi alterada.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
