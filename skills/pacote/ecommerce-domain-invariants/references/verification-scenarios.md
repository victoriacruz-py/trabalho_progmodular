# Cenários e evidências

O PDF especifica roteiros manuais TUnn por módulo, inicialmente NÃO EXECUTADOS.
Os cenários EI abaixo são derivações locais para implementação/revisão; não são
novos IDs do PDF nem resultados já obtidos. Selecione os relevantes à mudança.

## Escolha da evidência

- Unidade: módulo isolado, relógio/dados controlados e dependências substituídas;
  verificar retorno, estado próprio e efeitos solicitados aos simuladores.
- Contrato: mesma expectativa aplicada ao simulador e ao provedor real relevante;
  formatos, erros, permissões e semântica pública compatíveis.
- Integração: módulos/persistência reais, eventos e adaptadores explicitamente
  identificados. Simulador de PSP não comprova comportamento do PSP real.
- Concorrência: operações alcançam a região de disputa simultaneamente, com
  barreiras/interleavings e conexões/transações independentes quando pertinentes.
  Sequência simples ou mocks de banco não comprovam proteção da última unidade.
- Recuperação: falha/reinício entre fronteiras reais, persistência mantida, nova
  instância retoma; não usar apenas um objeto em memória reinicializado.
- Sistema/UI: jornada pelo navegador, estados visíveis e backend real onde
  alegado; registrar provedores simulados. Avaliação com pessoas é outra evidência.

Para cada execução registrar versão, massa/relógio, dependências, ações,
resultado esperado/obtido, IDs de operação, evidência e situação. Situações úteis:
APROVADO, REPROVADO, NÃO EXECUTADO e BLOQUEADO com motivo. Script criado ou teste
apenas descrito não é execução. Preservar os laudos manuais exigidos pelo projeto.

## Dinheiro, validade e intenção

**EI01 — Preço e arredondamento** (RN01/RN02/RNF02; TU08.03–06).
Exercitar 2 × 10.000 com descontos 10%/15% → 17.000; 999 com 10% → 899;
50 com 1% → 49. Comparar centavos exatos. Cupom às 11:00 com fim 11:00 é inválido.
Testar preço ausente, zero, percentuais inválidos e quantidades não inteiras.

**EI02 — Reconfirmação sem efeito** (RN03; TU03.05–07).
Mudar revisão, preço ou frete depois da simulação, vencer a simulação, ou obter
total zero. Não criar cobrança; total alterado exige aceite novo. Insuficiência
de estoque impede cobrança. Não chamar PSP com um total aceito anteriormente
quando o valor revalidado é diferente.

**EI03 — Carrinho alterado depois da compra** (RF02; TU02.05–06).
Limpar revisão 3 quando atual já é 4. Obter CONFLITO e preservar novos itens.
Repetir limpeza válida com mesma chave: um efeito lógico, sem nova mutação.

## Estoque e concorrência

**EI04 — Última unidade** (RN04/RF09; TU09.04).
Físico=1/reservado=0, dois compradores/chaves diferentes sincronizados na disputa.
Exatamente uma reserva aceita; outra ESTOQUE_INSUFICIENTE; disponível final 0.
Verificar saldos e reservas persistidos, não só respostas HTTP.

**EI05 — Reserva de vários SKUs** (RF09, interface M09 p.32).
A disponível=2, B=0; solicitar A=1/B=1. Operação inteira falha e A continua livre.
Falhar a persistência no meio da operação e verificar ausência de reserva parcial.

**EI06 — Limite de expiração** (RN03/RN04; TU09.02/08).
Antes do vencimento, confirmar conforme saldo; exatamente no vencimento, rejeitar
confirmação e apresentar disponibilidade liberada mesmo sem executar o limpador.
Disputar confirmação/liberação/expiração; apenas uma transição terminal válida.

**EI07 — Ajuste respeita reservado** (RN04; TU09.05–07).
Físico=10/reservado=3, saída de 8 falha. Entrada de 2 repetida uma vez resulta
em físico=12/reservado=3. Confirmar reserva de 2 a partir de físico=10/reservado=2
resulta em 8/0 uma única vez. Restaurar a massa entre cenários independentes.

## Operações financeiras e falhas

**EI08 — Idempotência concorrente** (RNF04, seção 3.6; TU03.04/TU06.01–02).
Enviar simultaneamente a mesma confirmação/chave/contexto/conteúdo. Uma operação
lógica, mesmos IDs, uma reserva/pedido/cobrança efetivos. Alterar valor sob a mesma
chave produz CONFLITO sem efeito. O mesmo texto de chave em outro escopo não deve
vazar dados ou reutilizar a operação de outro cliente.

**EI09 — Cobrança aceita, resposta perdida** (RNF04; TU03.09/TU06.02/07–08).
PSP simulado registra aceite, conexão perde resposta. Interromper processo antes
da atualização local; reiniciar e retomar. Manter identidade, consultar/reusar
chave e reconciliar; nenhuma segunda cobrança. Indisponibilidade persistente
mantém PENDENTE, nunca RECUSADO ou APROVADO inventado.

**EI10 — Falha entre reserva e pedido** (TU03.08).
Reserva aceita e criação de pedido falha definitivamente: liberar uma vez sem
cobrar. Se a criação ficou incerta, primeiro reconciliar a mesma chave; não
liberar estoque de um pedido efetivamente criado como se ele não existisse.

**EI11 — Autenticidade e pagamento tardio** (RI01/RI02; TU04.05–07/TU06.03–04).
Rejeitar assinatura inválida, valor/moeda divergentes e aprovação forjada no
navegador. Aprovação válida duplicada não confirma reserva duas vezes. Aprovação
após expiração/cancelamento solicita estorno sem reabrir pedido/baixar estoque.

**EI12 — Cancelar versus expedir** (RN05; TU04.08–09 e interface M04).
Pedido pago não enviado; sincronizar cancelamento e autorização logística sobre
a mesma versão. Só uma vence; nenhuma expedição externa pode começar depois de
cancelamento vencedor. Se cancelamento vence, aguardar estorno antes de concluir
e repor unidades não expedidas; repetição não repõe novamente.

**EI13 — Estornos concorrentes** (RF06/RN07; TU06.05–06).
Capturado=20.000, já comprometido=5.000. Disputar dois estornos de 10.000 com chaves
distintas: no máximo um novo aceito; total pendente+confirmado nunca >20.000.
Repetir chave não consome mais limite. Repetir evento financeiro não conta duas vezes.

## Pós-venda e efeitos auxiliares

**EI14 — Elegibilidade concorrente e prazo** (RN06; TU11.01–03).
Duas unidades compradas, uma já comprometida; dois pedidos por mais uma unidade
disputam a última elegível. No máximo um aceito. Em bases independentes, entrega
+ sete dias é aceita; um segundo depois é rejeitado pela política simplificada.

**EI15 — Inspeção e retomada** (RN07; TU11.06–08).
Dois itens aprovados pagos a 10.000, frete 2.000; um apto/um inapto. Repor uma
unidade e solicitar 22.000. Reiniciar após reposição e antes da confirmação
financeira; retomar a mesma inspeção/operação sem segunda entrada nem estorno.
CONCLUIDA somente após efeitos obrigatórios confirmados.

**EI16 — Frete restituído uma vez** (RN07).
Devoluções parciais cuja soma cobre todos os itens aprovados, concluídas/repetidas
concorrentemente. No conjunto, restituição do frete original exatamente uma vez;
somar também as solicitações pendentes para evitar dupla concessão. Rateio de
centavos de itens depende da decisão documentada, não de arredondamento improvisado.

**EI17 — Retorno logístico e mensagens incertas** (RF10/RF12; TU10.08/TU12.01–05).
Transportadora/canal aceita e perde resposta. Retomar com mesma identidade; não
gerar nova etiqueta/mensagem lógica. Evento repetido reutiliza registro.
ENVIADA repetida não reenvia e não prova leitura; falha não cancela pedido pago.

## Eventos, segurança e projeções

**EI18 — Durabilidade de estado e evento** (RNF04/RNF08; seção 3.4).
Interromper antes/depois do commit e antes/depois do envio/confirmação do evento.
Após reinício: nenhum estado confirmado sem intenção recuperável de publicação;
nenhum evento de mudança abortada; entrega repetida gera um efeito lógico.
Confirmar também a atomicidade local entre deduplicação do receptor e seu efeito.

**EI19 — Ordem por origem** (TU07.01–03; seção 3.4).
Catálogo v2 e preço v7, depois catálogo v1 e estoque v1. Catálogo não regride;
estoque v1 é válido por ser outra origem. Desativação retira SKU. Revisão de um
módulo não pode invalidar atualização independente de outro. Checkout revalida
fontes oficiais mesmo quando projeção está atrasada.

**EI20 — Titularidade e identidades** (RNF01; TU02.04/TU04.04/TU05.07–08/TU14.06).
Cliente B consulta/edita recursos de A; cliente comum forja papel de gestor ou
serviço; token inválido/expirado. Rejeitar sem vazar dados. Obter contexto somente
da validação confiável. Testar matriz de papéis por operação, não só login.

**EI21 — Autenticação nos limites** (TU05.01–06).
Senha 11 rejeitada/12 aceita; e-mail repetido com caixa diferente conflita. Token
10:00 válido 10:29:59, inválido 10:30:00. Cinco erros em quinze minutos acionam
bloqueio; verificar armazenamento e respostas sem senha/hash, e erros genéricos.

**EI22 — Analytics e conteúdo público** (RI04; TU13.01–06/TU14.01–06).
M14: captura 20.000 +30.000 e estorno 5.000 → 2 pedidos, bruto 50.000, estornos
5.000; repetir IDs e a mesma operação sob evento novo não duplica. Rejeitar origem
financeira indevida e dados sensíveis sem copiá-los para logs. M13: só notas
publicadas 4/5 dão média 4,5; pendente 1 não entra; comentário com marcação é texto.

## Arquitetura e ensaios de sistema

**EI23 — Encapsulamento e contratos** (RNF07/RI03).
Revisar dependências e caminhos de persistência, incluindo queries, imports e
repositórios. Zero acesso a dados internos alheios. Testar cada módulo com
substitutos e conferir substitutos contra contratos. Uma busca textual isolada
não prova ausência de acessos indiretos.

**EI24 — Jornada de compra e pós-venda** (UC01–05; página 8).
Executar navegador → backend → persistência nas fronteiras declaradas; cadastro,
carrinho, reconfirmação, pagamento pendente/aprovado, cancelamento ou entrega,
devolução e avaliação. Registrar simuladores/sandboxes; não confundir tela de
sucesso com cobrança confirmada. Preservar percurso por teclado.

**EI25 — Carga e disponibilidade** (RNF03/RNF05).
Massa de 10.000 SKUs, 100 usuários simultâneos sustentados por 15 minutos de
medição, >=95% de catálogo/busca em até 2 s entre recepção e resposta completa no
servidor. Separar métricas de cliente/rede, endpoints, falhas e carga atingida.
RNF05 exige observação mensal por sondagem a cada minuto, inclusive manutenção;
um benchmark de quinze minutos não comprova 99,5% mensal.

**EI26 — Atualização da busca** (RNF08).
Medir publicação/alteração oficial até consulta refletir o dado em operação normal
em até 60 s. Interromper consumidor, registrar falha, retomar e verificar
reprocessamento sem regressão. Declarar condição de falha separada da meta normal.

**EI27 — Usabilidade** (RNF06).
Cinco participantes representativos, compra simulada; pelo menos quatro concluem
sem ajuda em até cinco minutos após autenticação. Registrar conclusão/tempo por
pessoa e percurso por teclado. Automação visual não substitui essa avaliação.

## Correspondência com a matriz original — página 44

RF01–14 → M01–14 → interfaces → TU01–14. RNF01/RI01/RI04 → TU05/06/12/14 e
revisões adicionais; RNF02 → TU03/08/11; RNF04/RI02 → TU03/04/06/09/10/11 e
integração com falhas/reinício. RNF03/05/06 precisam ensaios próprios. RNF07/RI03
precisam revisão arquitetural e testes isolados. RNF08 combina TU07 e integração.
