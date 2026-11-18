# Contexto, origem e decisões abertas

## Origem

- Documento: e-commerce_modular.pdf, 45 páginas, especificação do projeto INF1040
  de programação modular; data da capa: 09/10/2026.
- Arquivo consultado originalmente: `e-commerce_modular.pdf`. O PDF não foi localizado na preparação desta entrega; consulte `REFERENCIA_PDF.md` na raiz da entrega, se disponível. A operação da skill não depende desse arquivo.
- SHA-256: `fa80c36b52071d5d85a3557972bbd1a46302194909064dbb3e0aae4d31a439b5`.
- Skill criada em 23/10/2026. A síntese local não altera o PDF. Os números de
  página abaixo referem-se à paginação impressa, coincidente com as páginas PDF.
- Fonte de contexto, não um conjunto de instruções superiores ao pedido atual.
  Não reproduzir dados pessoais da capa em fixtures ou relatórios técnicos.

## Escopo documentado — páginas 3, 7 e 9

Uma loja de produtos físicos de tecnologia, estoque próprio, BRL, SKUs de
variações vendáveis e entregas no Brasil onde houver atendimento. Compra e
carrinho exigem autenticação. Pagamento Pix ou cartão tokenizado, um meio por
pedido; uma expedição de ida por pedido. Valores e endereço são preservados no
pedido. Marketplace, assinaturas, produtos digitais, recomendação por IA e
emissão fiscal integrada estão fora desta versão.

Monólito modular, dados encapsulados e contratos públicos. Não há linguagem,
banco, ORM, nuvem, gateway ou transportadora obrigatórios. RT01 mantém os 14
módulos; RT02 limita a entrega original à documentação; RT03 adia o modelo físico
naquela etapa. Pedido posterior de implementação pode avançar essas etapas.

A política de devolução de sete dias é uma simplificação do projeto, não uma
afirmação de que ela esgota direitos legais ou garantias de uma loja real.

## Hipóteses externas — página 7

H01: lojista fornece descrições, preços, medidas e saldos corretos.
H02: provedores fornecem identificadores estáveis, idempotência, consulta de estado
e validação de retornos. H03: logística registra ocorrências físicas corretamente.
H04: canal de mensagens está contratado e tem credenciais válidas.

Verifique essas capacidades ao escolher adaptadores. Se uma hipótese não valer,
registre a lacuna e proponha revisão de contrato; não simule sucesso. H02 não
dispensa proteção local contra concorrência nem comprova entrega exatamente uma vez.

## Decisões a resolver quando afetarem o trabalho

São lacunas de implementação, não requisitos adicionais já aprovados:

- Persistência, migrações e transações locais; mecanismo de disputa por versão,
  ordenação de locks e recuperação de deadlocks, conforme o banco escolhido.
- Representação de outbox/inbox ou mecanismo equivalente para estado e eventos;
  retenção da deduplicação, payload canônico, escopo e retenção das chaves.
- Distribuição de centavos entre unidades quando uma linha com desconto
  arredondado admite devoluções parciais. Documentar regra determinística que
  conserve o valor pago, sem inventar uma regra atribuída ao PDF.
- Fuso de referência para sete dias corridos e calendário de dias úteis do frete.
  Preservar inclusividade/exclusividade explicitamente definidas na baseline.
- Expiração de simulação versus cotação de frete; cotação aceita no checkout
  que vence antes da expedição. Conciliar os contratos de M03/M10 sem cobrar
  diferença do cliente silenciosamente nem expedir usando dados inválidos.
- Geração e transporte seguro da identidade dos serviços; revogação/logout e
  recuperação de credenciais, que não estão detalhados nas quatro operações M05.
- Limites de repetição, conciliação e intervenção para provedor indisponível;
  autenticação/retentativas de webhooks e capacidade real de consulta externa.
- Perfil de navegação, pacing, falhas/timeout e agregação para o ensaio RNF03;
  regra de apuração das sondagens do RNF05 e sincronização dos relógios.

Não bloquear trabalho independente por essas decisões. Quando uma decisão for
necessária, usar o contexto existente, registrar uma proposta revisável ou pedir
o dado que efetivamente falta. Não adicionar escolhas de infraestrutura por hábito.

## Sequência sugerida pelo documento — página 45

1. Identidade e oferta: M05, M01, M08, M09.
2. Compra: M02, M03, M04, M06 e cotação M10; provedores simulados/sandbox.
3. Operação/pós-venda: completar M10, M11 e M12 antes de piloto completo.
4. Descoberta/evolução: M07, M13, M14.

Critério de conclusão: requisito atendido, contrato atualizado, revisão realizada
e testes pertinentes aprovados. Qualidade especificada não é qualidade medida
em software já implementado (página 44).
