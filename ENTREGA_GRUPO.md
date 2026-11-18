# Entrega para o grupo — fundação e incremento 1

Preparada em **09/11/2026**, a partir do commit **c668cbd51fe317239f57cf81b25a54a45061fba5**, branch `codex/fundacao-incremento-1`. O código executável é o mesmo da entrega validada em 23/10/2026. Foram acrescentados guia, lista de skills, síntese do domínio e links portáveis.

## Começar

1. Extraia o ZIP inteiro e abra esta pasta, que contém `package.json`. Mantenha a fundação junto aos módulos: copiar só `apps/api/src/modules` não produz uma aplicação executável.
2. Instale Node **24.9 ou superior dentro da linha 24**, com npm. A instalação inicial precisa de internet para as dependências. Não é necessário ter as skills nem Codex para compilar ou executar.
3. No terminal desta pasta, rode:

```powershell
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`. A API fica em `http://127.0.0.1:3000/api`. O comando prepara PostgreSQL local e seis produtos fictícios; Docker é opcional. **Não crie `.env` para o primeiro uso com banco automático.** Se definir `DATABASE_URL`, o runner espera um banco existente e não inicia o portátil.

As credenciais administrativas são geradas na máquina de cada integrante em `.local/dev-credentials.json`. Não há conta/senha pessoal neste pacote. O cadastro público cria somente CLIENTE. Encerre com `Ctrl+C`; os dados locais são preservados. As portas 5173, 3000 e 15432 precisam estar disponíveis. A alternativa Docker/banco existente está no [README](README.md).

Para utilizar as skills no assistente, leia [skills/INSTALAR_E_USAR.md](skills/INSTALAR_E_USAR.md). Com Python 3.10+, `python skills/instalar.py` instala as 33 cópias completas em `.agents/skills` deste projeto, sem downloads nem sobrescrita de versões diferentes. A skill PDF com restrição de redistribuição possui instruções de instalação externa. As skills não são necessárias para rodar o e-commerce.

## O que está pronto

| Módulo | Pasta | Interface pública | Responsabilidade entregue |
|---|---|---|---|
| M05 — Clientes e autenticação | `apps/api/src/modules/clientes/` | `IClientes` em `index.ts` | Cadastro, autenticação, sessão, bloqueio de tentativas e autorização de contato |
| M01 — Catálogo | `apps/api/src/modules/catalogo/` | `ICatalogo` em `index.ts` | Produtos, ativos/inativos, atributos físicos, filtros/paginação, versão e evento |
| M08 — Precificação e promoções | `apps/api/src/modules/precos/` | `IPrecos` em `index.ts` | Preço, promoção, cupom, vigência, maior desconto e cálculo exato |
| M09 — Estoque e inventário | `apps/api/src/modules/estoque/` | `IEstoque` em `index.ts` | Movimentos, reserva integral, confirmação/liberação, expiração e idempotência |

Também foram entregues vitrine e painel de gestão, HTTP, PostgreSQL, migrações com checksum, outbox/inbox, contexto confiável, testes e CI configurada. O primeiro incremento não inclui o percurso de compra completo.

## Onde integrar os novos módulos

| Ponto real do código | Uso |
|---|---|
| `apps/api/src/composition.ts` | Conectar factories, interfaces, relógio e banco; registrar novos serviços |
| `apps/api/src/modules/<modulo>/index.ts` | Superfície pública entre módulos; implementar internamente sem importar privados alheios |
| `packages/kernel/index.ts` | Contexto, autorização, relógio, eventos, erros e aritmética compartilhada |
| `apps/api/src/infrastructure/` | Database, transações, locks, migrações, entrega e deduplicação |
| `apps/api/src/http.ts` | Adaptador NestJS: entradas validadas, sessão, papel, CSRF e erros |
| `apps/web/src/api.ts` e `types.ts` | Cliente HTTP e tipos de transporte usados pela interface |
| `docs/openapi.json` e `docs/API.md` | Contrato HTTP a manter sincronizado com os endpoints |
| `tests/integration`, `tests/unit`, `tests/e2e` | Comportamentos públicos, banco real e jornadas de navegador |

Os diagramas de estrutura no plano são propostas anteriores. A implementação atual usa `composition.ts`, `packages/kernel` e `index.ts` público; não crie pastas/camadas vazias só para reproduzir o desenho inicial.

## Ordem de continuação e divisão do trabalho

Ordem de integração do plano, preservando os incrementos documentados:

| Incremento | Módulos pendentes | Dependências e atenção principal |
|---|---|---|
| 2 — Compra | **M02 Carrinho → M10 cotação de frete → M06 Pagamentos → M04 Pedidos → M03 Checkout** | Interfaces acordadas permitem trabalho paralelo; integrar a jornada nesta sequência. Carrinho não reserva estoque; pagamento precisa lidar com resultado incerto e reenvio |
| 3 — Operação/pós-venda | **Completar M10 e M04 → M11 Devoluções → M12 Notificações** | Disputa cancelamento/expedição, restituição parcial, estoque e envio idempotente |
| 4 — Descoberta/gestão | **M07 Busca → M13 Avaliações → M14 Analytics** | Projeções por eventos, compra entregue para avaliar e deduplicação financeira |

São **dez módulos restantes**. M10 e M04 aparecem em mais de um incremento porque sua integração operacional é completada depois. Não significa criar módulos duplicados.

O grupo pode dividir M02, M10 e M06 após fechar seus contratos. M04 e M03 devem usar essas interfaces, com substitutos identificados durante o desenvolvimento. Definam um responsável por integração para alterações concorrentes em `composition.ts`, `http.ts`, OpenAPI e kernel. Cada integrante deve trabalhar em uma branch; integrem mudanças pequenas e executáveis.

## Regras para preservar a integração

1. Leia [CODING_STANDARDS.md](CODING_STANDARDS.md), [GLOSSARY.md](GLOSSARY.md), [ADRs](docs/adr/) e os [contratos dos 14 módulos](.agents/skills/ecommerce-domain-invariants/references/module-contracts.md).
2. Cada módulo é dono do seu schema. Não faça joins, consultas privadas ou transações entre repositórios de outros módulos. Passe dependências pelas interfaces públicas.
3. Não altere SQL de migração já aplicada; acrescente outra versão com `migrate`. Preserve assinaturas consumidas ou revise todos os consumidores e testes.
4. Módulos recebem `Context` confiável, emitido pelo servidor. Nunca aceite identidade de serviço, papel ou total financeiro enviados pelo navegador. M03/M04/M11/M12 só ganham acesso pelos adaptadores/composição autorizados.
5. Dinheiro em centavos inteiros seguros; half-up por linha. Promoção e cupom não se acumulam. Reserve tudo ou nada e valide expiração após esperar locks.
6. Estado e evento pertencem ao mesmo commit. Receptores deduplicam com seu efeito local. Não mantenha conexão/transação aberta enquanto aguarda outro consumidor ou provedor externo.
7. `Journal.deliver` marca o evento publicado após o callback concluir: ao adicionar vários consumidores, componha o roteamento e a deduplicação por consumidor. Consumidores novos precisam de replay/backfill explícito; um ACK global antigo não prova que receberam o histórico. A expiração espontânea para a futura Busca também precisa ser integrada.
8. Checkout, pagamentos e devoluções precisam de intenção durável, identidade estável e reconciliação após timeout. Não crie nova cobrança para resolver uma resposta incerta.

## Antes de integrar uma contribuição

```powershell
npm run typecheck
npm run lint:boundaries
npm test
npm run test:web
npx playwright install chromium
npm run test:e2e
npm run build
```

Crie primeiro o teste de comportamento que demonstra a regra; confirme a falha, implemente e confirme a aprovação. Inclua casos de erro, concorrência e reinício quando aplicáveis. Atualize OpenAPI, rastreabilidade e evidências. As suites usam banco isolado; `TEST_DATABASE_URL`, se fornecida, deve apontar para um banco exclusivo de testes.

## Evidências e pendências

Em **23/10/2026** passaram 55 testes backend, 4 frontend e 14 jornadas Playwright, tipos, build e fronteiras. São evidências históricas do commit exportado, **não uma nova execução completa em 09/11/2026**. A conferência desta entrega está em `VERIFICACAO_EXPORTACAO.md`; detalhes e limitações estão em [docs/VALIDATION.md](docs/VALIDATION.md).

Continuam pendentes os próximos módulos, ensaio de carga completo, disponibilidade mensal, avaliação com pessoas, operação de backup/restauração e integrações externas reais. [docs/REVIEW.md](docs/REVIEW.md) registra os cinco achados corrigidos na revisão inicial.

O [Trabalho.pdf](referencias/Trabalho.pdf) recebido foi incluído: ele é o enunciado T2 de uma página. A especificação anterior de 45 páginas não foi localizada; sua síntese de regras, contratos e cenários está incluída. Veja a distinção em [REFERENCIA_PDF.md](REFERENCIA_PDF.md). As skills apoiam o trabalho, mas não substituem o código, a especificação ou as evidências.
