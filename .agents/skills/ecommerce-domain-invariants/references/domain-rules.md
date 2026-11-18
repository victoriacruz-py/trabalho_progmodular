# Regras de domínio e invariantes

Índice: contratos; dinheiro; estoque; compra/cancelamento; devoluções; identidade;
eventos; requisitos de qualidade. As regras vêm do PDF; sugestões de mecanismo
são identificadas como decisões de implementação.

## Contratos comuns — seção 3.6, páginas 14–15

- IDs opacos não vazios; SKU identifica uma variação, não o nome exibido.
- Interfaces v1; mudança incompatível requer nova versão e revisão de consumidores.
- ctx contém identidade autenticada, papel e ID de requisição, derivado de M05
  ou identidade interna verificada. O navegador não fabrica ctx confiável.
- Paginação: página a partir de 1, tamanho 1–100; resposta com itens/total/página.
- Instantes com fuso explícito; relatórios usam [início, fim).
- Erros gerais: INVALIDO, NAO_ENCONTRADO, NAO_AUTORIZADO, CONFLITO, INDISPONIVEL.
  Erros específicos constam dos contratos e testes; não substituir por sucesso.
- Validação inválida não altera estado de negócio. Auditoria técnica sem dados
  sensíveis pode registrar uma tentativa rejeitada.
- Mesma chave + contexto + operação + conteúdo identifica a mesma operação
  lógica. Reutilização incompatível dá CONFLITO. Retomar pendência pode atualizar
  seu estado, mantendo IDs; não precisa repetir eternamente a resposta inicial.
- Com efeito externo incerto, manter PENDENTE e a identidade original para
  consulta/retomada. Timeout não prova ausência de cobrança, etiqueta ou mensagem.

## Dinheiro e precificação — RN01/RN02, RNF02; páginas 6–7, 30–31

Dinheiro é inteiro não negativo em centavos de BRL; preço-base é estritamente
positivo. Quantidades são inteiras positivas, salvo zero na remoção do carrinho.
Preço já inclui tributos. Total = soma das linhas após desconto + frete.

Há no máximo uma promoção por SKU e um cupom por compra. Não acumular ambos:
usar o maior desconto elegível por linha. Cupom percentual tem taxa inteira de
1 a 100%; desconto não excede o subtotal e não incide no frete. Cupom informado
inexistente, expirado ou inelegível é recusado; não ignorá-lo silenciosamente.

Arredondar o desconto percentual uma vez por linha, ao centavo mais próximo,
empate para cima. Para subtotal inteiro não negativo S e percentual inteiro r,
uma formulação equivalente é divisão inteira de (S × r + 50) por 100.
Evitar ponto flutuante binário e overflow do tipo escolhido. A fórmula é uma
derivação da regra, não uma escolha de linguagem.

Oráculos: 2 × 10.000 com promoção 10% e cupom 15% resulta em desconto 3.000 e
subtotal 17.000 (TU08.03). S=999, r=10 dá desconto 100 e líquido 899 (TU08.04).
S=50, r=1 dá desconto 1 e líquido 49 (caso adicional de empate).

Promoção inclui início e exclui fim. Cotação informa regras/revisões e validade.
SKU sem preço produz PRECO_INDISPONIVEL. Checkout rejeita total zero antes de
criar pedido/cobrança, mesmo se os descontos forem individualmente válidos.
Preservar os valores efetivamente pagos no pedido. Rateio para devolução parcial
de uma linha arredondada exige decisão explícita (context-and-decisions.md).

## Carrinho, simulação e reserva — RN03/RN04; páginas 18–21, 32–33

Carrinho é do titular, aceita 0–99 por SKU, incrementa revisão quando alterado e
não reserva estoque nem fixa preço futuro. esvaziar exige revisão esperada e
idempotência; preservar alterações feitas depois da compra.

Simulação vale cinco minutos. Reserva vale quinze minutos a partir da confirmação.
Antes de cobrar, conferir revisão do carrinho, preço, frete e validade, e obter
nova confirmação se valores mudaram. Não aceitar total fornecido pelo navegador.

Para cada SKU: disponível = físico vendável − reservado efetivo, sempre >= 0.
Reservar vários itens é uma operação integral. Falha em um não deixa reservas
parciais. Duas solicitações pela última unidade não podem ambas ter sucesso.

CONFIRMAR reserva válida reduz físico e reservado na mesma quantidade. LIBERAR
reduz apenas reservado. Reserva com agora >= vencimento já está expirada e não
pode ser confirmada; consulta de saldo deve desconsiderá-la sem depender de uma
limpeza assíncrona. Reenvios não repetem efeitos; estados finais conflitantes
não devem transformar liberação em confirmação.

Saída manual não consome saldo reservado. Ajustes exigem justificativa e papel
autorizado. Desativação do produto não elimina inventário de SKU já conhecido.
Mecanismo de locks/versões e transação é decisão posterior, não regra de schema.

## Compra, pagamentos e cancelamento — RF03/04/06, RN05; páginas 8, 20–27

Sequência: revalidar simulação → reservar → criar pedido aguardando pagamento →
solicitar cobrança. Cada confirmação lógica liga um pedido, reserva e cobrança.
Falha definitiva em criar pedido após reservar exige liberação da reserva sem
cobrar. Resposta incerta exige retomada, não compensação cega de efeito desconhecido.

Pedido preserva itens, valores e endereço. Fluxo principal:
AGUARDANDO_PAGAMENTO → PAGO → EM_SEPARACAO → ENVIADO → ENTREGUE.
Só marcar PAGO após aprovação válida do provedor e confirmação da reserva.
Validar autenticidade, operação, valor, moeda e transição dos retornos. Página de
sucesso do navegador não comprova pagamento. Nunca armazenar PAN completo/CVV.

Pagamento tem PENDENTE/APROVADO/RECUSADO; estornos têm registros/estados próprios.
Um pedido pode ter tentativas, mas no máximo uma cobrança bem-sucedida deve
representar a venda. Sucesso adicional indevido exige restituição. Não gerar
tentativas novas para contornar resultado ainda incerto.

Estornar exige pagamento aprovado e valor positivo. Soma dos estornos confirmados
e pendentes não pode exceder capturado, inclusive em solicitações concorrentes.
Pedidos e Devoluções compartilham esse limite financeiro controlado por M06.

Cancelamento antes de ENVIADO e autorização de expedição são mutuamente exclusivos
sobre a mesma versão. Pedido pago entra em CANCELAMENTO_PENDENTE e só conclui
CANCELADO após restituição confirmada. Repor unidades não expedidas uma vez após
essa confirmação; para reserva não consumida, apenas liberar. Não repor algo
que nunca saiu do físico. Depois de ENVIADO, orientar devolução.

Pagamento aprovado depois de reserva expirada/cancelamento: restituir, sem reabrir
a venda e sem consumir estoque. Operações financeiras pendentes permanecem
consultáveis após reinício. Uma compensação solicitada não é uma compensação feita.

## Devoluções — RN06/RN07; páginas 7–8, 36–37

Titular, pedido entregue e quantidade elegível. Janela simplificada de sete dias
corridos após entrega inclui o instante final. Um instante posterior não é aceito
por essa política. Não generalizar essa regra como toda a legislação aplicável.

Solicitações abertas ou concluídas comprometem o limite de unidades; somar também
pedidos concorrentes. Rejeição libera o compromisso. AUTORIZAR solicita etiqueta;
incerteza na emissão mantém identidade e pendência. Etiqueta não é estorno/entrada.

concluirInspecao registra quantidades e responsável, repõe apenas unidades aptas
e solicita restituição. Não aceitar recebido acima do autorizado. Esse fluxo pode
ter estoque já atualizado e estorno pendente: retomada não repete nenhum efeito.
Não confundir com a ordem de reposição específica do cancelamento em RN05.

Restituir o valor efetivamente pago por itens aprovados. Quando todos os itens
tiverem devolução aprovada, incluir frete original uma única vez no conjunto das
solicitações. Proteger esse direito contra aprovações concorrentes. Não concluir
M11 enquanto um estorno obrigatório estiver pendente.

Oráculo TU11.06: retorno integral de dois itens pagos a 10.000 e frete 2.000,
um apto/um inapto: entrada de uma unidade vendável e estorno de 22.000. Aptidão
para revenda não deve, por si só, retirar restituição de item cuja devolução foi aprovada.

## Identidade e avaliações — RNF01, RN08; páginas 24–25, 40–41

E-mail normalizado único; senha com no mínimo 12 caracteres, hash com salt/fator
de custo. Sessão de 30 minutos, inválida no instante de expiração. Cinco falhas
em quinze minutos bloqueiam novas tentativas por quinze minutos. Erros de login
genéricos; respostas não incluem senha/hash. Não inventar detalhes de normalização
ou bloqueio que o contrato não especifica; registrar decisão quando necessário.

Verificar papel e titularidade por operação, inclusive identidades internas.
Contato de M05 só para titular ou serviço Notificações e só nome/e-mail necessário.
Gestor, logística, atendente/moderação e serviço são permissões distintas.

Avaliação exige compra entregue, titularidade e SKU comprado; unicidade por
cliente/pedido/SKU, nota inteira 1–5, comentário até 2.000 caracteres, texto sem
execução no navegador. Começa PENDENTE; só PUBLICADA aparece na lista/média.
Moderador não muda nota. Sem publicadas: lista vazia e média indisponível, não zero.

## Eventos, busca, mensagens e analytics — páginas 9, 12, 28–29, 38–43

Envelope: ID único, tipo, versão do esquema, origem, agregado, versão do agregado,
instante e dados mínimos. Validar origem e tipos aceitos. Estado e registro do
evento duráveis em conjunto; entrega retomável. Outbox/inbox são opções de
implementação, não licença para introduzir tecnologia sem decisão.

Receptor deduplica ID; não regredir por versão antiga. Busca mantém versões por
origem/agregado, pois catálogo, preço e estoque têm sequências independentes.
Busca é projeção, não autoridade; checkout consulta fontes oficiais. Produto
inativo sai da pesquisa; filtro inválido é recusado; texto ignora caixa/acentos;
preço empata por SKU.

Notificação tem identidade evento + destinatário + canal e chave estável externa.
ENVIADA significa aceitação pelo canal, não leitura. Reenvio de enviada não envia
de novo. Mensagens/analytics/busca falhos não desfazem compra válida. Eventos e
logs não carregam senhas, tokens, cartão completo ou dados pessoais desnecessários.

M14 aceita captura/estorno só de M06; deduplica por evento e operação financeira.
Pedidos pagos = pedidos distintos; bruto = capturas aprovadas; estornos confirmados
são separados pela data de confirmação. Isso não é lucro. Período [início,fim),
sem eventos retorna zeros; informar critério e última atualização. Dados sensíveis
fora da lista permitida são rejeitados sem persistência/log do conteúdo.

## Critérios de qualidade — RNF01–08 e RI01–04, página 6

| ID | Critério da baseline e evidência necessária |
|---|---|
| RNF01 | Rejeitar sessão inválida, papel insuficiente e recurso alheio; hash adequado e TLS externo. Testes e inspeção do ambiente. |
| RNF02 | Centavos inteiros e soma exata; testes de arredondamento/limites. |
| RNF03 | Homologação: 10.000 SKUs, 100 usuários simultâneos por 15 min, >=95% de consultas de catálogo/busca até 2 s no servidor. |
| RNF04 | Reenvio sem duplicação; pendências persistem e retomam após reinício. |
| RNF05 | Meta mensal 99,5% para catálogo/carrinho/consulta de pedidos, sondagem por minuto incluindo manutenção; falha externa sem sucesso falso. |
| RNF06 | Pelo menos 4 de 5 participantes concluem compra simulada sem ajuda em até 5 min após autenticação; todas etapas por teclado. |
| RNF07 | Contratos documentados, dependências substituíveis; revisão encontra zero acesso a dados privados de outro módulo. |
| RNF08 | Em operação normal, eventos de oferta refletem na busca em até 60 s; falhas registradas e reprocessáveis. |

RI01 proíbe PAN completo/CVV. RI02 proíbe venda sem reserva e pagamento baseado
no navegador. RI03 proíbe acesso direto entre dados privados. RI04 proíbe dados
sensíveis em analytics e desfazer compra por falha de analytics/notificação.
