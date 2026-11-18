# Skills utilizadas e referências para o grupo

Inventário preparado em **09/11/2026**, conferindo o histórico do trabalho, o plano e a revisão do commit `c668cbd`. Uma skill é uma orientação para o assistente: **não é uma dependência npm, um módulo da aplicação nem uma prova de teste executado**.

## Implementação e revisão do primeiro incremento

| Skill | Uso no trabalho |
|---|---|
| **ecommerce-domain-invariants** | Síntese específica do projeto: 14 módulos, contratos, autorização, dinheiro, estoque, pagamentos, devoluções e eventos. Criada durante este trabalho e aplicada como baseline |
| **tdd** — Matt Pocock | Ciclos teste falhando → implementação mínima → teste aprovado, observando comportamento público |
| **codebase-design** — Matt Pocock | Fronteiras e interfaces de módulos, encapsulamento e pontos públicos de teste |
| **domain-modeling** — Matt Pocock | Vocabulário, conceitos e responsabilidades do domínio |
| **implement** — instalação local do conjunto Matt Pocock | Orientação de execução da implementação; o nome pode diferir em versões posteriores do pacote |
| **code-review** — Matt Pocock | Revisão independente nos eixos Spec e Standards; encontrou os cinco problemas corrigidos em `docs/REVIEW.md` |
| **a-team:subagent-driven-development** | Coordenação da implementação por módulos |
| **a-team:dispatching-parallel-agents** | Distribuição de trabalhos independentes com limites de edição |
| **performance-testing** | Consulta sobre evidências e limites do ensaio de desempenho; **o ensaio completo RNF03 não foi executado** |
| **design:design-critique** | Revisão visual de desktop/celular e melhorias de apresentação e acessibilidade |

As leituras dessas orientações foram identificadas no histórico da implementação/revisão ou na documentação produzida. Não se atribui uma correção específica a uma skill sem evidência.

## Preparação, planejamento e apoio ao projeto

Estas skills foram instaladas e/ou consultadas no trabalho anterior, e fazem parte do plano de continuação. Isso **não significa que cada uma tenha sido aplicada a todos os módulos**, nem que suas ferramentas tenham sido executadas.

| Área | Skills | Papel |
|---|---|---|
| Requisitos | `requirements-engineering` | Critérios de aceite, atores, lacunas e rastreabilidade |
| Modularidade/arquitetura | `modular-design-principles`, `architecture-patterns` | Limites, responsabilidades, contratos e propriedade dos dados |
| API e autenticação | `api-design-principles`, `auth-implementation-patterns` | Contratos HTTP, validação, erros, sessão e autorização |
| Banco | `sql-schema-designer`, `sql-optimization-patterns`, `supabase-postgres-best-practices` | Schemas, constraints, migrações, SQL, índices e transações; não exige usar o serviço Supabase |
| Testes e qualidade | `tdd-guide`, `quality-metrics`, `engineering:testing-strategy`, `contract-testing`, `e2e-testing-patterns` | Estratégia de testes, compatibilidade entre consumidores, jornadas e evidências de qualidade |
| Integrações futuras | `saga-orchestration`, `security-threat-model` | Checkout, efeitos distribuídos, reconciliação e análise de ameaças; não representam integrações já prontas |
| Criação da skill própria | `skill-creator` | Estrutura da `ecommerce-domain-invariants` e seus arquivos auxiliares |

`tdd-guide` e `tdd` são skills distintas. A implementação do incremento tem leitura confirmada da `tdd` de Matt Pocock. A instalação de várias orientações de TDD não obriga o grupo a executar fluxos duplicados.

## Skills usadas nesta preparação da entrega

- `engineering:documentation`: guia de entrada, pontos de integração e documentação portátil.
- `adaptive-model-routing`: delegação da conferência do inventário de skills.
- `skill-router`: seleção das orientações pertinentes à tarefa.
- `anthropic-skills:pdf`: leitura e identificação do `Trabalho.pdf` recebido.

Essas orientações de exportação não são dependências do produto nem exigências do trabalho acadêmico.

## O que está incluído e como reutilizar

A **skill própria completa** está em [.agents/skills/ecommerce-domain-invariants](.agents/skills/ecommerce-domain-invariants/SKILL.md), com:

```text
SKILL.md
agents/openai.yaml
references/context-and-decisions.md
references/domain-rules.md
references/module-contracts.md
references/verification-scenarios.md
```

Ela é autocontida. Os caminhos da máquina do autor foram substituídos por referências portáveis. Em um assistente que reconheça skills do projeto, mantenha a pasta `.agents/skills`. Em outro, indique explicitamente o `SKILL.md` e os arquivos de referência, ou instale a pasta completa no local de skills aceito por essa ferramenta.

**O pacote agora contém 33 skills completas em `skills/pacote/`**, com seus auxiliares e as licenças disponíveis. A única entrada obtida separadamente é `anthropic-skills:pdf`, cuja licença proíbe redistribuir os arquivos; as instruções para instalar pelo plugin estão incluídas. Veja [instalação e uso](skills/INSTALAR_E_USAR.md) e o [catálogo com hashes](skills/catalogo.json).

Além das skills do inventário, foram preservadas `superpowers-test-driven-development` como orientação adicional e `a-team-writing-plans`/`a-team-finishing-a-development-branch` como dependências complementares citadas pelo fluxo do A-Team. Isso não significa que esses complementos tenham sido executados no incremento. `skill-installer` orientou as convenções de destino e preservação das instalações existentes nesta nova exportação.

As skills com namespace de plugin receberam IDs portáveis documentados no guia. O instalador copia pastas completas, verifica integridade e recusa sobrescrever versões diferentes. Não é necessário instalar todas para contribuir: use a skill de domínio, o padrão de TDD adotado e as orientações relevantes ao módulo em trabalho.

Prioridades de apoio para o próximo incremento: domínio/modularidade para todos; `saga-orchestration` para Checkout/Pedidos/Pagamentos; contratos, autenticação e banco para as integrações; TDD e revisão para cada contribuição. A fonte funcional continua sendo a especificação do projeto, e a integração deve respeitar os contratos reais do código.
