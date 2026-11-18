# Instalar e usar as skills do grupo

## Conteúdo

Este pacote reúne **33 skills completas**, com **165 arquivos** de orientação, referências, scripts, exemplos, templates, testes, metadados e licenças disponíveis. Inclui as skills utilizadas e as de apoio já identificadas no projeto, além de duas dependências complementares do A-Team. `catalogo.json` registra nomes, grupos, IDs, arquivos, SHA-256 e adaptações.

Há **uma skill adicional por instalação externa**: `anthropic-skills:pdf`. Sua licença local proíbe a transferência de arquivos a terceiros; por isso seus arquivos não foram redistribuídos. Veja [PDF_SKILL_EXTERNA.md](PDF_SKILL_EXTERNA.md). O documento do projeto `referencias/Trabalho.pdf` continua incluído normalmente.

As cópias completas estão em `pacote/<id>/`. A skill específica do projeto também já está em `../.agents/skills/ecommerce-domain-invariants/`. Nenhuma instalação global foi feita na máquina do autor para preparar este ZIP.

## Instalação local no projeto — Windows, macOS ou Linux

É necessário **Python 3.10 ou posterior**, somente biblioteca padrão. No Windows, execute na raiz da entrega:

```powershell
python skills/instalar.py --list
python skills/instalar.py --dry-run
python skills/instalar.py
```

No macOS/Linux, use `python3` no lugar de `python`, se esse for o nome disponível. O instalador padrão copia as 33 pastas para `.agents/skills` **deste projeto**; a skill de domínio já idêntica é apenas reconhecida. Abra o projeto no assistente e inicie uma nova conversa/turno para que ele possa atualizar seu catálogo.

O instalador não baixa nada, não roda os scripts das skills, não modifica configurações do assistente e não troca modelos/provedores. Ele confere os hashes antes da cópia. Repetir a instalação com arquivos idênticos não os altera. Se encontrar uma skill diferente no destino, interrompe antes de copiar e informa o conflito; não existe opção de sobrescrita forçada.

Para instalar somente um conjunto inicial:

```powershell
python skills/instalar.py --only ecommerce-domain-invariants modular-design-principles tdd codebase-design domain-modeling code-review
```

## Instalação global opcional no Codex

Só é necessária se quiser disponibilizar as skills também a outros projetos. Pode colidir com versões já instaladas; prefira o destino local para este trabalho.

PowerShell, usando o diretório padrão:

```powershell
python skills/instalar.py --dest "$HOME/.codex/skills" --dry-run
python skills/instalar.py --dest "$HOME/.codex/skills"
```

Se você configurou `CODEX_HOME`, indique seu diretório real de skills com `--dest`; o comando acima não o detecta automaticamente. Para outro assistente, use `--dest` apenas se ele aceitar o formato de pastas `SKILL.md` com auxiliares. Caso contrário, forneça os arquivos como contexto explícito, sem presumir compatibilidade de ferramentas.

## Instalação manual

Copie **a pasta inteira** de cada skill desejada de `pacote/` para o diretório de skills aceito pelo assistente. Preserve `references/`, `scripts/`, `assets/`, `templates/`, `tests/`, `agents/` e arquivos de licença quando existirem. Não copie somente `SKILL.md`. Não substitua uma instalação existente sem comparar as versões.

Algumas skills são apenas documentais e legitimamente contêm somente `SKILL.md` e eventualmente uma licença. Diretórios ilustrativos dentro de exemplos não são dependências ausentes.

## Nomes portáveis e compatibilidade

Skills antes fornecidas por plugins receberam IDs distintos para evitar colisão de nomes:

| Nome no histórico | ID neste pacote |
|---|---|
| `a-team:subagent-driven-development` | `a-team-subagent-driven-development` |
| `a-team:dispatching-parallel-agents` | `a-team-dispatching-parallel-agents` |
| `a-team:writing-plans` | `a-team-writing-plans` |
| `a-team:finishing-a-development-branch` | `a-team-finishing-a-development-branch` |
| `design:design-critique` | `design-design-critique` |
| `engineering:testing-strategy` | `engineering-testing-strategy` |
| `engineering:documentation` | `engineering-documentation` |
| `superpowers:test-driven-development` | `superpowers-test-driven-development` |

O nome no frontmatter foi ajustado para o ID portátil. Caminhos de backups pessoais nos registros históricos foram generalizados para `${CODEX_HOME}`; esses backups não fazem parte do pacote nem são necessários para utilizar as skills. `catalogo.json` registra os arquivos adaptados. A licença ancestral do A-Team/Superpowers foi copiada para cada skill correspondente.

As skills **não incluem o runtime dos plugins**, conectores, ferramentas MCP, agentes nomeados, comandos de barra como `/quality-gate`, nem dependências Python/npm opcionais. Quando uma orientação mencionar um recurso indisponível, adapte o procedimento às ferramentas existentes ou instale o plugin correspondente; não invente que a chamada funcionou. Modelos citados nos exemplos podem não existir na conta do integrante. `adaptive-model-routing` e `skill-router` são opcionais e não habilitam configuração global automaticamente.

As regras do projeto e os pedidos da equipe prevalecem sobre exemplos genéricos. Uma meta ilustrativa de cobertura, uma lista genérica de modelos ou um comando de teste de outro repositório não altera os requisitos deste e-commerce. `tdd` é a referência usada na implementação; `tdd-guide` e a alternativa Superpowers podem complementar a consulta, sem acumular três fluxos obrigatórios.

## Como usar no próximo módulo

Exemplo de pedido ao assistente, com a pasta do projeto aberta:

> Leia `ENTREGA_GRUPO.md`, `CODING_STANDARDS.md` e a skill `ecommerce-domain-invariants`, incluindo os contratos e regras de M02. Implemente o Carrinho usando `tdd` e `codebase-design`, preservando os contratos dos quatro módulos existentes. Teste comportamento público e autorização do titular. Não reserve estoque no carrinho. Depois use `code-review` e registre as evidências.

Para Checkout/Pagamentos/Pedidos, acrescente `saga-orchestration`, `auth-implementation-patterns` e `contract-testing`. Para schema/SQL, consulte `sql-schema-designer`, `supabase-postgres-best-practices` e `sql-optimization-patterns`. Para o navegador, `e2e-testing-patterns` e `design-design-critique`. A escolha deve acompanhar o trabalho, não carregar todas as skills em toda tarefa.

Sem descoberta automática, indique o arquivo explicitamente, por exemplo: `.agents/skills/tdd/SKILL.md`. Os documentos funcionam também como guias para pessoas; não é obrigatório usar IA para implementar o restante.

## Verificações

O instalador tem testes de cópia completa, repetição idempotente, simulação sem escrita, conflito sem sobrescrita e rejeição de conteúdo alterado. Execute:

```powershell
python -B skills/tests/test_instalador.py
```

Os auxiliares Python das skills podem exigir bibliotecas adicionais; confira suas próprias instruções antes de executá-los. `sql-schema-designer` e os utilitários locais de `tdd-guide` têm suites próprias de biblioteca padrão. Passar no linter SQL não valida a execução do DDL no PostgreSQL; métricas estáticas não substituem os testes da aplicação.

Consulte [VERIFICACAO_SKILLS.md](VERIFICACAO_SKILLS.md) para a conferência efetivamente executada. Licenças e avisos disponíveis foram preservados; onde a cópia local não trazia licença, não foi inventada uma licença permissiva nem atribuída autorização de redistribuição pública irrestrita.
