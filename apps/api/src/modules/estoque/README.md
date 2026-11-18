# M09 — Estoque e inventário

Interface prevista pelo PDF (RF09, RN03/RN04, TU09.01–08): consulta de saldo,
movimento justificado, reserva integral e encerramento idempotente. O schema
`estoque` é privado. A integração com Catálogo usa somente `obterProduto` para
inicializar um SKU; a desativação posterior não impede movimentar seu inventário.

## Decisões de implementação

- PostgreSQL real; quantidades e versões inteiras, limitadas à faixa segura de
  inteiros JavaScript para as quantidades. Constraints impedem físico/reservado
  negativos e reservado maior que físico. Migração `001_initial` versionada com
  checksum e lock de schema; histórico privado de entradas, saídas e confirmações.
- Todas as operações que alteram uma alocação adquirem locks transacionais por
  SKU em ordem lexicográfica. A ordem dos itens recebidos não muda essa ordem.
- Reservas vencem no instante exato (`agora >= vencimento`). O relógio é lido
  depois de adquirir os locks. Consulta e próximas mutações liberam alocações
  vencidas sem depender de um agendador; a atualização e o evento são atômicos.
- Idempotência é persistida por contexto, operação e chave. Outro conteúdo na
  mesma chave dá `CONFLITO`; reenvio de reserva retorna seu estado atual.
- Listas vazias e SKUs duplicados na mesma reserva são rejeitados com `INVALIDO`.
  O prazo aceito é futuro, até quinze minutos do relógio confiável.
- A consulta inicial a Catálogo acontece antes da transação de estoque. Assim,
  um lote de novos SKUs não esgota o pool aguardando conexões do outro módulo.
- O journal guarda `EstoqueAlterado` junto da mudança de estado. Quantidades,
  SKU e versão podem ser publicados; dados pessoais não são necessários.

## Autorizações

| Operação          | Autoridade                               |
| ----------------- | ---------------------------------------- |
| `consultar`       | Pública                                  |
| `movimentar`      | Papel `LOGISTICA` ou serviço `M04`/`M11` |
| `reservar`        | Serviço `M03`                            |
| `encerrarReserva` | Serviço `M03`/`M04`                      |

Contextos passam pelo emissor confiável da composição/autenticação. Um objeto
serializado com um nome de papel ou serviço não concede autoridade.

## Verificação

`node scripts/test.mjs --testPathPatterns=estoque` exercita a interface pública
contra PostgreSQL isolado. Cenários de estoque, concorrência, reenvio e prazo
seguem EI04–08. Esses testes não constituem medição de desempenho ou carga.

Os primeiros ciclos TDD verificaram entrada/reenvio, reserva, confirmação e
expiração. Regressões também reproduziram e corrigiram: saturação de conexões
ao inicializar doze SKUs, UUID inválido vazando erro SQL e evento de encerramento
contabilizando outra reserva vencida. Há integração com Catálogo real para
cadastro inicial e movimentação após desativação.

Expiração é observada em cada acesso relevante. A reserva retorna `EXPIRADA`
conforme o relógio, mesmo antes de sua liberação materializada. Publicação
espontânea para Busca sem qualquer acesso ao SKU exige o agendamento a integrar
com M07; não há alegação de que a meta de propagação de Busca já foi validada.
