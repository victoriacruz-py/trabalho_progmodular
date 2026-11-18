# Plano de desenvolvimento — E-commerce modular

Plano original: 23/10/2026; links adaptados para a entrega de 09/11/2026. A estrutura proposta adiante é histórica; os caminhos efetivos estão em ENTREGA_GRUPO.md. Situação: fundação e incremento 1 implementados; evidências e limites em `docs/VALIDATION.md`. Demais incrementos permanecem planejados.

## 1. Recomendação e premissas

**Recomendo TypeScript no frontend e no backend, NestJS para a aplicação de negócio e PostgreSQL para persistência, mantendo os 14 módulos em um monólito modular.** A interface web será desenvolvida em React com Vite. Cada incremento entregará um percurso utilizável, com contratos, testes e persistência correspondentes.

A recomendação considera o caráter acadêmico do projeto e a ausência de uma linguagem obrigatória ou de informação sobre a experiência da equipe. Se houver domínio prévio forte de outra stack, esse custo de aprendizagem deve entrar na decisão antes do início do código. Datas e duração dependem da disponibilidade real da equipe; este plano organiza dependências e critérios de conclusão, sem transformar estimativas desconhecidas em compromisso.

Base: [e-commerce_modular.pdf](REFERENCIA_PDF.md), especificação de 09/10/2026, 45 páginas; conferido pelo SHA-256 `fa80c36b52071d5d85a3557972bbd1a46302194909064dbb3e0aae4d31a439b5`. A síntese operacional está na [skill ecommerce-domain-invariants](.agents/skills/ecommerce-domain-invariants/SKILL.md).

**Requisitos preservados:** loja de produtos físicos de tecnologia, estoque próprio, BRL, autenticação para carrinho/compra, Pix ou cartão tokenizado, um meio de pagamento e uma expedição de ida por pedido, histórico de preços/endereço, cancelamentos, devoluções e moderação de avaliações. Marketplace, assinaturas, produtos digitais, recomendação por IA e emissão fiscal integrada ficam fora desta versão.

Os 14 módulos, seus contratos e as regras do PDF são a baseline. Linguagem, banco, organização física, ferramentas e mecanismos abaixo são **decisões recomendadas neste plano**, não exigências atribuídas ao documento. A restrição à documentação na etapa original não impede este planejamento posterior de implementação.

### 1.1 Módulos e prioridade estabelecida pelo PDF

Nomenclatura informada pelo usuário, preservando os IDs do documento. As páginas 4–5 classificam 11 módulos como essenciais para uma operação inicial completa e três como importantes para entrega posterior prioritária, ainda obrigatórios no escopo dos 14 módulos.

| ID | Módulo | Prioridade documental |
|---|---|---|
| M01 | Catálogo | Essencial |
| M02 | Carrinho de compras | Essencial |
| M03 | Checkout | Essencial |
| M04 | Gestão de pedidos | Essencial |
| M05 | Clientes e autenticação | Essencial |
| M06 | Motor de pagamentos | Essencial |
| M07 | Busca e descoberta | Importante |
| M08 | Precificação e promoções | Essencial |
| M09 | Estoque e inventário | Essencial |
| M10 | Cálculo de frete e entregas | Essencial |
| M11 | Devoluções e logística reversa | Essencial |
| M12 | Notificações transacionais | Essencial |
| M13 | Avaliações e reviews | Importante |
| M14 | Analytics e telemetria | Importante |

A página 45 propõe quatro incrementos: **1)** M05, M01, M08 e M09; **2)** M02, M03, M04, M06 e cotação de M10; **3)** completar M10, M11 e M12; **4)** M07, M13 e M14. O piloto de operação completa só deve ser avaliado após o terceiro incremento. Essa é a sequência documental de grupos; a ordem interna detalhada na seção 5 é uma recomendação técnica pelas dependências.

Nomes curtos de pastas e interfaces são identificadores técnicos dos mesmos módulos. A telemetria técnica básica começa na fundação; os indicadores e a consolidação de eventos de M14 entram no quarto incremento, conforme o escopo do módulo.

## 2. Stack recomendada

| Parte | Escolha | Motivo e cuidado principal |
|---|---|---|
| Linguagem | TypeScript, com `strict` | Contratos explícitos, refatoração assistida e uma linguagem para as duas pontas. Validar também dados em execução nas fronteiras. |
| Runtime | Node.js 24 LTS, atualização corretiva suportada | Base LTS verificada na consulta; fixar a versão no bootstrap e conferir compatibilidade das dependências. |
| Backend | NestJS | Módulos, injeção de dependências e adaptadores HTTP; domínio independente de decorators/framework. |
| Frontend | React + Vite + TypeScript | Vitrine, conta, checkout e painel administrativo evoluem por incremento. Rotas, estados de carregamento/erro e navegação por teclado entram desde o início. |
| Banco | PostgreSQL 18, atualização corretiva suportada | Modelo relacional, restrições, transações, controle de concorrência e projeções de consulta. |
| Persistência | `pg` / node-postgres, SQL parametrizado e migrações versionadas | Torna explícitas as transações e consultas relevantes ao trabalho de banco. Repositórios ficam privados em cada módulo. |
| API externa | HTTP/JSON com OpenAPI | Contrato da interface web separado das interfaces internas dos módulos. |
| Testes | Jest no backend; Vitest na interface; Playwright nas jornadas; k6 na carga | Cada ferramenta produz uma evidência distinta. Integração e concorrência usam PostgreSQL real isolado. |
| Ambiente | Docker Compose para PostgreSQL e dependências de teste, quando disponível | Configuração reproduzível; alternativa local documentada caso a máquina não suporte containers. |
| Entrega | Repositório único; CI no serviço adotado pela equipe | Compilação, fronteiras, testes, migrações e relatórios executáveis em ambiente limpo. |

TypeScript verifica tipos estaticamente e suas anotações são removidas na compilação; por isso, DTOs de HTTP, eventos externos e configurações precisam de validação em execução. [Documentação do TypeScript](https://www.typescriptlang.org/docs/handbook/2/basic-types.html).

NestJS encapsula providers por módulo e permite exportar apenas a interface necessária. Isso ajuda a implementar os limites propostos; regras de imports e revisão continuam necessárias para impedir acessos indiretos aos arquivos internos. [Módulos do NestJS](https://docs.nestjs.com/modules). A documentação também descreve suporte a testes com substituição de providers. [Testes no NestJS](https://docs.nestjs.com/fundamentals/testing).

A orientação oficial do Node é usar versões Active LTS ou Maintenance LTS em produção; a linha 24 aparece como LTS na consulta. [Ciclo do Node.js](https://nodejs.org/en/about/previous-releases). Fixar versões compatíveis de NestJS, TypeScript e ferramentas no primeiro incremento, com lockfile; não selecionar versões de prévia automaticamente.

**Tradeoffs:** TypeScript exige cuidado com validação em execução e precisão numérica. SQL explícito exige mais mapeamento do que um ORM, mas torna visíveis locks, consultas e propriedade dos dados. React com Vite atende ao percurso acadêmico proposto; caso SEO e renderização no servidor passem a ser critérios de lançamento público, reavaliar a camada de apresentação antes de expandi-la. A documentação do React explicita esse custo de uma aplicação montada sem um framework completo. [Opções e limitações dessa abordagem](https://react.dev/learn/build-a-react-app-from-scratch).

## 3. Arquitetura e regras de dependência

Um backend, um PostgreSQL e uma base de código. A interface web e os adaptadores de pagamento, transporte e mensagens ficam nas bordas. Jobs de reconciliação e publicação de eventos pertencem à mesma aplicação e podem iniciar no mesmo processo; seus registros são persistentes.

Estrutura proposta:

```text
apps/
  api/src/
    composition/                 # monta módulos e adaptadores
    modules/
      clientes/                 # M05
      catalogo/                 # M01
      precos/                   # M08
      estoque/                  # M09
      carrinho/                 # M02
      entregas/                 # M10
      pagamentos/               # M06
      pedidos/                  # M04
      checkout/                 # M03
      devolucoes/               # M11
      notificacoes/             # M12
      busca/                    # M07
      avaliacoes/                # M13
      analytics/                # M14
    infrastructure/             # logs, configuração, transporte de eventos
  web/                          # consumidores dos contratos HTTP
packages/
  shared-kernel/                # tipos pequenos e estáveis: IDs, Money, Clock
docs/
  adr/                          # decisões e consequências
  contracts/                    # 42 operações, eventos, OpenAPI
  evidence/                     # resultados de testes e medições
tests/
  integration/
  recovery/
  e2e/
  load/
```

Dentro de cada módulo: `public`, `domain`, `application`, `adapters`, `migrations` e testes próximos do comportamento. Módulos simples podem ter poucos arquivos; não criar camadas vazias apenas para preencher a estrutura.

Regras verificáveis:

1. Importação entre módulos somente pela superfície `public`. Exportar contratos/fachadas; repositórios e entidades de persistência continuam privados.
2. Comunicação síncrona por interfaces no mesmo processo. HTTP fica na borda com o navegador e os provedores externos.
3. Projeções e efeitos auxiliares recebem eventos. M07 e M14 não consultam tabelas privadas de outros módulos para reconstruir informação por conveniência.
4. Domínio não importa NestJS, `pg`, React nem SDK de provedor. Adaptadores traduzem entradas/saídas e chamam os casos de uso.
5. A composição conecta interfaces a implementações e identidades de serviço confiáveis. Campos enviados pelo navegador não concedem papel de serviço.
6. CI verifica imports proibidos e ciclos; revisão verifica também SQL e caminhos indiretos de acesso. Nenhuma dessas verificações isoladamente prova todo o encapsulamento.
7. Infraestrutura e apresentação não formam um 15º módulo de negócio. O shared kernel não absorve entidades de cliente, pedido, pagamento ou produto.

M05 fornece autenticação à borda. Os demais módulos recebem contexto validado e aplicam papel/titularidade em cada operação. Eventos M06 → M04 e M10 → M04 são conectados pelo roteador na composição, sem criar dependências circulares entre implementações.

## 4. Banco, dinheiro e consistência

### 4.1 Propriedade dos dados

Adotar um banco PostgreSQL com **um schema lógico por módulo**, criado conforme sua implementação. Cada módulo controla suas tabelas, migrações e consultas. Schemas organizam nomes e permissões; sozinhos não são uma barreira de segurança. [Schemas do PostgreSQL](https://www.postgresql.org/docs/current/ddl-schemas.html).

| Dono | Dados principais a modelar |
|---|---|
| M05 | Clientes, credenciais, sessões e controle de tentativas |
| M01 | Produtos, SKUs, atributos, referências de imagens e medidas |
| M08 | Preços, promoções, cupons e versões |
| M09 | Saldos, reservas, itens reservados e movimentos |
| M02 | Carrinhos, itens e revisões |
| M10 | Cotações, expedições, rastreamentos e etiquetas reversas |
| M06 | Cobranças, estornos, retornos e operações externas pendentes |
| M04 | Pedidos, itens/endereço/valores preservados, histórico e autorizações logísticas |
| M03 | Simulações e tentativas de confirmação retomáveis |
| M11 | Devoluções, quantidades comprometidas, inspeções e restituições pendentes |
| M12 | Notificações, tentativas e identidades de envio |
| M07 | Projeção de busca e versões independentes por origem |
| M13 | Avaliações e histórico de moderação |
| M14 | Eventos permitidos, deduplicação financeira e agregações |

Esses grupos são candidatos ao modelo físico, não um DDL final. Normalizar dados operacionais; preservar snapshots de pedido e desnormalizar projeções explicitamente. Usar FKs dentro do módulo. Para referências entre módulos, a proposta inicial é validar pelo contrato público e conservar IDs/snapshots, sem joins, cascatas ou leitura de tabelas alheias. Documentar como a integridade lógica será mantida; desativação de SKU não elimina histórico.

Aplicar `NOT NULL`, `CHECK`, unicidade e índices conforme cada regra. Exemplos de unicidade: SKU, e-mail normalizado, escopo da chave idempotente, identidade do evento recebido e avaliação por cliente/pedido/SKU. Limites envolvendo várias linhas, como a soma de estornos, precisam também de transação e controle de concorrência; um `CHECK` de coluna não resolve isso sozinho.

Repositórios usam SQL parametrizado e mapeamento explícito de tipos. Em `pg`, todas as consultas de uma transação devem usar o mesmo client; liberar a conexão ao terminar. [Transações](https://node-postgres.com/features/transactions) e [consultas parametrizadas](https://node-postgres.com/features/queries).

### 4.2 Representação monetária e tempo

- PostgreSQL: `BIGINT` para centavos, com restrições conforme o campo. É um tipo inteiro exato de faixa limitada. [Tipos numéricos](https://www.postgresql.org/docs/current/datatype-numeric.html).
- Domínio: objeto `Money` com aritmética inteira usando `bigint`; percentual inteiro e arredondamento uma única vez por linha, empate para cima.
- Fronteira JSON: manter centavos inteiros do contrato. Antes de implementar, documentar uma faixa representável com segurança pelos clientes JavaScript; converter para `number` somente após validar a faixa. Não converter `BIGINT` do driver silenciosamente nem serializar `bigint` diretamente com JSON padrão. Se a faixa exigida ultrapassar isso, versionar a representação de transporte explicitamente.
- Oráculos iniciais: `999` com 10% resulta em `899`; `50` com 1% resulta em `49`; promoção e cupom não se acumulam, prevalecendo o maior desconto elegível por linha.
- Instantes persistidos com fuso; relógio injetável para testes. Decidir o fuso comercial para a janela de sete dias e o calendário usado no frete.

### 4.3 Transações locais e operações externas

PostgreSQL oferece locks de linha e detecta deadlocks. Aplicar locks em ordem estável e manter transações curtas; recuperação de conflitos exige uma política explícita. [Controle de locks](https://www.postgresql.org/docs/current/explicit-locking.html).

| Região crítica | Estratégia a implementar e verificar |
|---|---|
| M09: reserva de vários SKUs | Uma transação; disputar saldos em ordem estável de SKU; validar todos e reservar tudo ou nada. Considerar expirações ao consultar/reservar, sem depender apenas de limpeza periódica. |
| M06: estornos | Serializar a decisão por pagamento; somar compromissos pendentes e confirmados antes de admitir novo estorno. |
| M04: cancelar/expedir | Disputar a mesma versão do pedido e persistir o resultado e a intenção correspondente. Reconciliar solicitações externas incertas antes de admitir ações incompatíveis. |
| M11: quantidade devolvível | Proteger por pedido/itens o compromisso de unidades e o direito de restituição do frete uma única vez. |
| Idempotência | Chave única por contexto/operação, vinculada a hash canônico do conteúdo e resultado persistido; conteúdo diferente retorna CONFLITO. |

O checkout coordena operações públicas, cada uma com sua transação local. Não manter transação de banco aberta durante chamadas ao gateway ou à transportadora. Registrar intenção antes da chamada, reutilizar a identidade externa e reconciliar após timeout/reinício. Falha externa pode significar resultado desconhecido, não recusa.

**Eventos duráveis:** cada produtor grava a mudança e a intenção de evento na mesma transação, usando outbox local. Cada consumidor grava deduplicação e efeito local atomicamente, usando inbox ou equivalente. O publicador entrega novamente quando necessário; o consumidor valida origem, versão e transição. Estado pendente e tentativas sobrevivem a reinício. Implementar esse mecanismo na fundação e provar seu uso real nos primeiros módulos. Não prometer entrega exatamente uma vez; comprovar um único efeito lógico onde exigido.

A outbox de entrega não é automaticamente um histórico permanente. Como M07 e M14 chegam depois dos produtores, definir na fundação como iniciar e reconstruir essas projeções. Proposta: conservar um histórico de eventos necessários, com retenção explícita, em cada módulo produtor e disponibilizar replay por mecanismo de manutenção controlado pelo dono. Reaplicar esses eventos pelas interfaces públicas dos consumidores, mantendo deduplicação e versões; testar a reconstrução desde uma projeção vazia. Se o histórico for compactado, definir snapshots e ponto de retomada antes da remoção. Busca e Analytics não leem tabelas privadas dos produtores para compensar a falta desse mecanismo.

A proposta inicial usa PostgreSQL para essas filas persistentes e busca. Acrescentar cache, broker ou mecanismo externo de busca somente se medições e requisitos justificarem a mudança.

## 5. Ordem de implementação dos módulos

A numeração M01–M14 identifica responsabilidades; a execução segue as dependências. Esta é uma ordem segura de integração. Trabalho independente pode ocorrer em paralelo depois de os contratos estarem definidos, preservando os mesmos marcos.

| Ordem | Módulo | O que entregar | Critério principal antes de avançar |
|---|---|---|---|
| 1 | **M05 — Clientes e autenticação** | Cadastro, autenticação, sessão opaca de 30 min, papéis, contato permitido e bloqueio de tentativas | Sessão inválida/vencida e acesso indevido rejeitados; senha mínima de 12; cinco falhas em 15 min acionam bloqueio de 15 min. |
| 2 | **M01 — Catálogo** | Cadastro administrativo, SKU, variantes, dados físicos, ativação/desativação e consulta pública | Contrato isolado, versão esperada na edição e ProdutoAlterado durável. |
| 3 | **M08 — Precificação e promoções** | Preço-base, promoção, cupom e cálculo por linha | Centavos exatos, maior desconto sem acumular, limites temporais e preço ausente cobertos. |
| 4 | **M09 — Estoque e inventário** | Entrada/saída, consulta, reserva, confirmação e liberação | Disputa real pela última unidade; reserva multi-SKU atômica; expiração exata e reinício verificados. |
| 5 | **M02 — Carrinho de compras** | Inclusão/alteração/remoção, preço atual, revisão e limpeza idempotente | Só titular acessa; carrinho não reserva; limpeza antiga não apaga itens adicionados depois. |
| 6 | **M10 — Cálculo de frete e entregas, parte 1** | Cotação de frete por CEP, medidas, prazo, validade e simulador da transportadora | Área não atendida difere de indisponibilidade; contrato completo definido para as etapas seguintes. |
| 7 | **M06 — Motor de pagamentos** | Pix/cartão tokenizado, cobrança, consulta, retorno autenticado, estorno e reconciliação | Timeout após aceite e reinício não duplicam cobrança; estornos concorrentes respeitam o total capturado. |
| 8 | **M04 — Gestão de pedidos** | Criação com snapshot, consulta, estados, eventos de pagamento e cancelamento | PAGO depende de retorno autêntico e confirmação de reserva; pagamento tardio não reabre venda. |
| 9 | **M03 — Checkout** | Simulação de 5 min, reconfirmação, reserva de 15 min, criação do pedido e cobrança | Jornada real local, duplicação concorrente, mudança de preço/frete e recuperação entre etapas cobertas. |
| 10 | **M10 — Cálculo de frete e entregas, parte 2** | Expedição autorizada, rastreio, entrega e logística reversa; completar integração M04 | Cancelamento versus autorização de expedição; retorno duplicado/antigo; identidade estável da etiqueta. |
| 11 | **M11 — Devoluções e logística reversa** | Elegibilidade, solicitação, autorização, inspeção, reposição e restituição | Janela de sete dias, quantidades concorrentes, retorno parcial, frete uma vez e retomada sem efeito repetido. |
| 12 | **M12 — Notificações transacionais** | Eventos de pedido/pagamento/devolução, contato por M05, envio e reenvio | Falha do canal não desfaz compra; envio aceito e resposta perdida conservam identidade. |
| 13 | **M07 — Busca e descoberta** | Projeção de catálogo/preço/estoque, filtros, texto sem distinção de caixa/acentos e paginação | Atualização em até 60 s em operação normal; versões independentes por origem; reconstrução e reprocessamento. |
| 14 | **M13 — Avaliações e reviews** | Compra entregue, avaliação pendente, moderação e média pública | Uma avaliação por cliente/pedido/SKU; somente publicadas entram na média; comentário é texto seguro. |
| 15 | **M14 — Analytics e telemetria** | Eventos permitidos e relatório de pedidos pagos/capturas/estornos | Origem financeira M06, deduplicação por evento/operação, período explícito e ausência de dados pessoais proibidos. |

**M10 aparece duas vezes porque será entregue em duas partes; continuam existindo 14 módulos.** Em M04, o contrato de expedição pode ser testado com simulador, mas a função de expedir não será anunciada como integrada até a segunda parte de M10. M06 também será testado com simuladores e sandbox identificados; isso não comprova integração em produção.

M07, M13 e M14 podem ser iniciados separadamente após seus produtores/contratos existirem. A ordem acima prioriza primeiro a integridade do ciclo de compra. **Logs, métricas técnicas e persistência de eventos entram na fundação**, embora os relatórios comerciais de M14 venham depois.

## 6. Incrementos e entregas demonstráveis

| Etapa | Trabalho | Entrega que a equipe consegue demonstrar |
|---|---|---|
| **0 — Fundação** | Requisitos rastreáveis, contratos, decisões de arquitetura, estrutura, CI, banco de teste, Money/Clock, eventos duráveis e observabilidade mínima | Ambiente reproduzível; contrato exercitado com substituto; teste que detecta import proibido; evidência de persistência/retomada da infraestrutura mínima. |
| **1 — Identidade e oferta** | M05 → M01 → M08 → M09 | Gestor configura oferta; cliente autentica e vê produtos; duas operações concorrentes disputam a última unidade corretamente. |
| **2 — Compra** | M02 → M10/cotação → M06 → M04 → M03 | Cliente monta carrinho, escolhe frete, confirma e acompanha pagamento/pedido; preço alterado exige novo aceite; reinício não duplica efeitos. |
| **3 — Operação e pós-venda** | Completar M10 e M04; M11 → M12 | Operador expede; cliente acompanha entrega, solicita devolução e recebe atualização; pendências e falhas têm tratamento demonstrável. |
| **4 — Descoberta e gestão** | M07 → M13 → M14 | Cliente busca/filtra, avalia compra entregue; moderador publica; gestor consulta métricas consistentes. |
| **5 — Homologação** | Integração completa, segurança, recuperação, carga, usuários, migrações, backup/restauração e documentação | Candidato à entrega com evidências e limitações explícitas; todas as funcionalidades exigidas verificadas. |

A etapa 2 é uma demonstração do fluxo de compra, não a conclusão do projeto. A etapa 3 completa a base operacional para um piloto controlado. A entrega integral exige também a etapa 4 e os critérios da etapa 5. Disponibilidade mensal depende de observação durante o período e não pode ser dada como comprovada no primeiro dia.

### Interface acompanha cada incremento

- Etapa 1: cadastro/login, listagem/detalhe de produto e páginas administrativas de catálogo/preço/estoque.
- Etapa 2: carrinho, endereço, seleção de frete, reconfirmação, pagamento pendente/aprovado/recusado e consulta do pedido.
- Etapa 3: painel de separação/expedição, rastreio, cancelamento, devolução e atendimento das pendências.
- Etapa 4: busca, avaliação/moderação e relatório gerencial.

Em todas: estados vazio/erro/indisponível, foco visível, labels, mensagens úteis e percurso por teclado. A tela de sucesso não substitui a confirmação do backend.

## 7. Uso das skills instaladas

As skills orientam o trabalho; seus exemplos genéricos não substituem os valores e contratos do projeto. A instalação de uma skill não instala Jest, PostgreSQL, Playwright, k6 ou serviços externos.

| Skill | Aplicação concreta e artefato esperado |
|---|---|
| [ecommerce-domain-invariants](.agents/skills/ecommerce-domain-invariants/SKILL.md) | Em todas as etapas: vincular módulo, RF/RN/RNF/RI e TU; verificar dinheiro, autorização, estoque, eventos e retomada. |
| [requirements-engineering](SKILLS_UTILIZADAS.md) | Baseline, matriz ator/permissão, critérios Given/When/Then e rastreabilidade requisito → teste → evidência. |
| [modular-design-principles](SKILLS_UTILIZADAS.md) e [architecture-patterns](SKILLS_UTILIZADAS.md) | Limites, dono dos dados, interfaces, camadas e verificação de dependências. |
| [api-design-principles](SKILLS_UTILIZADAS.md) | OpenAPI, DTOs, erros, paginação, compatibilidade e separação entre API HTTP e contratos internos. |
| [sql-schema-designer](SKILLS_UTILIZADAS.md) | Modelo físico incremental, restrições, migrações e documentação do schema por dono. O validador estático é complementar à execução no PostgreSQL. |
| [supabase-postgres-best-practices](SKILLS_UTILIZADAS.md) e [sql-optimization-patterns](SKILLS_UTILIZADAS.md) | Revisar tipos, transações, locks, índices, pools e planos de consulta medidos. Aplicáveis ao PostgreSQL escolhido, sem obrigar contratação do Supabase. |
| [auth-implementation-patterns](SKILLS_UTILIZADAS.md) | M05 e operações protegidas: sessão opaca, senha, papel, titularidade, cookies e controles de requisição. |
| [security-threat-model](SKILLS_UTILIZADAS.md) | Atividade prevista na fundação e na revisão de integrações: avaliação de ameaças do desenho e depois do código. Priorizar forja de pagamento, recurso alheio, escalada de papel e exposição de credenciais. Este plano não constitui um laudo de segurança executado. |
| [tdd-guide](SKILLS_UTILIZADAS.md) | Por regra: teste de comportamento falha, implementação mínima passa, refatoração conserva o resultado; adicionar limites e falhas relevantes. |
| [contract-testing](SKILLS_UTILIZADAS.md) | Mesmas expectativas contra simulador e implementação real; matriz de consumidores e compatibilidade. |
| [saga-orchestration](SKILLS_UTILIZADAS.md) | Checkout, cancelamento e devolução: estado persistente, chaves estáveis, compensação, resultado incerto e reconciliação. |
| [e2e-testing-patterns](SKILLS_UTILIZADAS.md) | Jornadas no navegador com backend e banco reais locais; provedores simulados ou sandbox explicitamente identificados. |
| [performance-testing](SKILLS_UTILIZADAS.md) | Experimento reproduzível para RNF03 e medição de atraso de busca; distinguir tempo do servidor e tempo do cliente. |
| [quality-metrics](SKILLS_UTILIZADAS.md) | Painel com invariantes verificadas, falhas, cobertura de caminhos críticos, regressões, flakiness e resultados dos RNFs. Usar metas do projeto, não copiar limites ilustrativos da skill. |

## 8. Estratégia de testes e critérios de qualidade

### 8.1 Ciclo de cada funcionalidade

1. Selecionar a regra e o contrato; escrever um exemplo observável, inclusive falhas relevantes.
2. Criar e executar o teste antes da implementação, verificando que falha pelo motivo esperado.
3. Implementar o mínimo no módulo dono; refatorar com os testes passando.
4. Aplicar o contrato ao simulador e ao provedor local real.
5. Quando houver banco, transação ou evento, testar a integração real. Quando houver disputa, usar conexões independentes e sincronização das operações.
6. Para efeitos duráveis, interromper o processo entre fronteiras reais e reiniciar preservando os dados.
7. Integrar a interface e os percursos de sistema relevantes; atualizar contrato, matriz e evidência.

Jest cobre domínio/contratos/backend; testes de PostgreSQL exercitam migrações, constraints e concorrência. Playwright cobre comportamento visível, dados isolados e seletores por papel/label. [Boas práticas do Playwright](https://playwright.dev/docs/best-practices). Scripts de carga geram tráfego, enquanto instrumentação do backend mede a fronteira de tempo exigida.

### 8.2 Cenários que têm prioridade de implementação

| Risco | Cenários da skill de domínio | Evidência mínima |
|---|---|---|
| Dinheiro incorreto ou compra sem novo aceite | EI01–EI03 | Unidade e integração com preços/frete/revisão alterados |
| Venda acima do disponível | EI04–EI07 | PostgreSQL real, disputa pela última unidade, reserva integral e expiração |
| Cobrança duplicada ou pagamento forjado/tardio | EI08–EI11 | Idempotência concorrente, falha após aceite externo, reinício e validação de retorno |
| Cancelamento incompatível com expedição | EI12 | Disputa sincronizada e verificação dos efeitos no adaptador |
| Restituição excessiva ou repetida | EI13–EI16 | Estornos/quantidades concorrentes, parcial, frete uma vez e retomada |
| Efeito auxiliar repetido ou evento perdido | EI17–EI19 | Perda de resposta, outbox/inbox, reordenação e versões por origem |
| Acesso indevido e dados públicos/sensíveis | EI20–EI22 | Matriz de papéis e titularidade, limites de autenticação, conteúdo de avaliação e eventos permitidos |
| Projeto integrado e qualidade mensurável | EI23–EI27 | Revisão de fronteiras, jornada completa, carga, atraso de busca e participantes reais |

Detalhamento: [27 cenários de verificação](.agents/skills/ecommerce-domain-invariants/references/verification-scenarios.md). Os IDs EI são derivações da skill; os roteiros TU do PDF mantêm sua identificação e evidência própria. Descrever, gerar ou contar testes não significa executá-los.

### 8.3 Metas de aceite

| Critério | Meta e forma de comprovação |
|---|---|
| RNF01 / RI01 / RI04 | Sessão, papel e titularidade verificados; senha com hash/salt/custo; TLS externo no ambiente; sem PAN completo/CVV, credenciais ou dados pessoais proibidos em analytics/logs. |
| RNF02 | Centavos e somas exatos; arredondamento por linha e conservação do valor pago nos reembolsos. |
| RNF03 | 10.000 SKUs; 100 usuários simultâneos sustentados por **15 minutos de medição**, além do aquecimento; pelo menos 95% das consultas catálogo/busca em até **2 s medidos no servidor**, da recepção ao término da resposta. |
| RNF04 | Mesmo comando lógico não duplica reserva/pedido/cobrança/estorno; pendência retoma após reinício real. |
| RNF05 | **99,5% no mês**, em catálogo/carrinho/consulta de pedido, com sondagem por minuto incluindo manutenção. Iniciar coleta no ambiente de homologação; declarar a janela observada. |
| RNF06 | **Pelo menos 4 de 5 participantes** concluem compra simulada sem ajuda em até **5 min após autenticação**; todas as etapas operáveis por teclado. |
| RNF07 / RI03 | Contratos documentados, dependências substituíveis e revisão sem acesso a dados privados de outro módulo. |
| RNF08 | Alterações de catálogo/preço/estoque refletidas na busca em **até 60 s em operação normal**; falha registrada e reprocessamento demonstrado. |

Para carga, configurar população fixa e pacing documentado, registrando requisições efetivamente atingidas, erros, timeouts e grupos de endpoints. O executor de usuários constantes do k6 mantém uma população fixa, mas não define sozinho o perfil de navegação. [Executor constant-vus](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-vus/). O indicador de tempo HTTP do cliente não comprova sozinho o tempo de servidor exigido. Manter falhas visíveis e não descartá-las para melhorar percentis.

Cobertura de linhas/branches é diagnóstico para encontrar lacunas. A liberação depende dos comportamentos críticos e dos critérios acima. Não substituir esses critérios por uma porcentagem genérica de cobertura. Ensaios de quinze minutos não demonstram disponibilidade mensal; automação de navegador não demonstra usabilidade com pessoas.

### 8.4 Definição de concluído

Uma funcionalidade está concluída quando tem requisito/critério associado, contrato atualizado, implementação no módulo dono, migração quando necessária, testes pertinentes aprovados e revisão realizada. Registrar efeitos externos simulados, pendências e limitações. Falha crítica em dinheiro, estoque, autorização ou recuperação impede aceitar o incremento afetado.

CI por alteração: tipos/lint, fronteiras, unidade, contratos, integração e migrações aplicáveis. Jornadas e cenários de recuperação entram conforme o fluxo passa a existir. Carga, avaliação com usuários e exercícios de restauração ficam nos marcos pertinentes, repetidos quando mudanças relevantes invalidarem a evidência.

## 9. Decisões que precisam ser fechadas no momento certo

São propostas ou lacunas de implementação, não novas regras já aprovadas do PDF. Registrar em ADR curto: contexto, decisão, alternativa, consequência e teste que a verifica.

| Decisão | Proposta inicial | Resolver antes de |
|---|---|---|
| Stack e versões | TypeScript/NestJS/PostgreSQL conforme este plano; lockfile e versões suportadas | Bootstrap |
| Limite de valores no JSON | Inteiros em centavos representáveis com segurança; cálculo interno exato e validação da faixa | Contratos executáveis de Money/M08 |
| Sessão e identidade interna | Sessão opaca de M05 em cookie protegido; controles de CSRF; contexto interno criado pela composição confiável; documentar logout/revogação/recuperação sem adicioná-los silenciosamente às 42 operações | M05 e borda HTTP |
| Idempotência e eventos | Escopo, payload canônico, retenção de chaves, outbox/inbox, retries limitados e fila de pendências operacionais | Primeira escrita durável e M06 |
| Taxas e centavos em devolução parcial | Rateio determinístico do valor líquido da linha entre unidades, distribuindo o resto em ordem estável e preservando o total pago; persistir a alocação | Snapshot M04 e testes M11 |
| Frete cotado versus expedição posterior | Registrar a oferta aceita; escolher mecanismo de garantia ou recotação operacional que preserve o total aceito pelo cliente. Resolver quem assume diferença e como tratar falta de serviço | M03/M10 integrado |
| Cancelamento com expedição externa incerta | Estado técnico durável e reconciliação da mesma solicitação; não admitir cancelamento e envio incompatíveis por ausência de resposta | Segunda parte de M10 |
| Fuso e calendário | UTC para instantes e fuso comercial explícito, inicialmente proposto `America/Sao_Paulo`; esclarecer sete dias corridos e prazo logístico | Testes de prazo e M11 |
| Provedores | Comparar capacidades de idempotência, consulta, retorno autenticável e sandbox com H02; selecionar conforme acesso e orçamento reais | Integração externa correspondente |
| Carga e disponibilidade | Fixar navegação/pacing, mistura de endpoints, contabilização de falhas/sondagens, recursos e sincronização de relógios | Ensaios RNF03/RNF05 |

Itens em aberto bloqueiam apenas a implementação que depende da resposta. Contratos, domínio isolado e simuladores podem avançar enquanto a integração externa ainda está sendo decidida, com essa limitação visível.

## 10. Organização do trabalho e primeiro backlog

Usar cartões por comportamento, com RF/RN/RNF, módulo, contrato afetado, critério de aceite e evidência esperada. Evitar cartões enormes como “fazer pagamentos”. Exemplos adequados: “repetir cobrança após timeout conserva a mesma operação” e “duas reservas simultâneas disputam a última unidade”.

Uma pessoa é responsável pelo módulo e outra revisa suas fronteiras; testes acompanham a implementação. Organizar frentes por oferta/estoque, compra/financeiro, identidade/interface e operação/pós-venda, conforme o tamanho real da equipe. Funções de revisão e teste são compartilhadas, evitando concentrar todas as verificações no final.

### Primeiro incremento executável

| Prioridade | Cartão | Resultado verificável |
|---|---|---|
| P0 | Consolidar RF01–14, RN01–08, RNF01–08, RI01–04, contratos e TU | Matriz rastreável sem trocar os IDs originais; decisões abertas identificadas |
| P0 | Registrar stack, fronteiras e propriedade dos dados | ADR e desenho revisáveis; convenção de imports e schemas |
| P0 | Criar estrutura, ambiente e CI | Checkout limpo instala versões fixadas, compila e executa verificações iniciais |
| P0 | Definir Money, Clock, erros, contexto e envelope de eventos | Tipos mínimos e testes de dinheiro/tempo, sem entidades globais de negócio |
| P0 | Implementar suporte mínimo de outbox/inbox e idempotência | Interrupção/retomada e duplicação verificadas em banco isolado |
| P0 | Implementar contratos e TDD de M05 | Autenticação e autorização nos limites especificados |
| P0 | Implementar M01 e primeira tela integrada | Gestor cadastra produto; público consulta ativo; edição disputa versão |
| P1 | Implementar M08 e integrar apresentação de preço | Oráculos de desconto/arredondamento aprovados |
| P1 | Implementar M09 com concorrência real | Última unidade e reserva multi-SKU protegidas |
| P1 | Demonstrar etapa 1 e recalibrar o próximo incremento | Evidências, problemas encontrados e estimativa baseada no ritmo observado |

### Entrega final esperada

Aplicação com os 14 módulos; contratos das 42 operações e eventos; modelo/migrações por módulo; testes e relatórios; interface de cliente e administração; instruções para executar em ambiente limpo; configuração de homologação; guia de reconciliação de pendências; backup/restauração exercitados; decisões documentadas e matriz de requisitos com resultados reais.

Este documento define a sequência e os critérios. Nenhum teste do e-commerce, integração com provedor ou requisito operacional está marcado como aprovado apenas por este planejamento.
