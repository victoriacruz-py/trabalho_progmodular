# Módulos, autoridades e contratos

Mapa dos 14 módulos e 42 operações públicas da seção 4 do PDF. Os requisitos
RFnn e roteiros TUnn correspondem a Mnn. As páginas citadas contêm interface e
testes respectivamente. Convenções gerais ficam em [regras de domínio](domain-rules.md).

## M01 — Catálogo / ICatalogo — RF01, TU01, páginas 16–17

Dono de produtos/SKUs, atributos, imagem, categoria, peso em gramas e dimensões
em milímetros. Sem dependência síncrona de módulo de negócio.

- `salvarProduto(ctx, dados)`: gestor; cria/atualiza com versão esperada, valida
  campos e dados físicos positivos; publica ProdutoAlterado.
- `obterProduto(sku)`: consulta pública de ativo; ausente/inativo dá NAO_ENCONTRADO.
- `listarProdutos(filtro, página)`: ativos compatíveis por categoria/marca,
  ordenados por SKU; consulta não muda estado.

SKU estável/único. Desativar não apaga histórico de pedidos. Preço e saldo são
autoridades distintas: M08/M09.

## M02 — Carrinho / ICarrinho — RF02, TU02, páginas 18–19

Dono de carrinhos e revisões; requer ICatalogo e IPrecos.

- `definirItem(ctx, carrinho, sku, quantidade)`: titular, produto ativo, 0–99.
  Zero remove; ausência de ID permite criar carrinho na primeira operação.
- `obterCarrinho(ctx, carrinho)`: titular/serviço autorizado; subtotal atual de
  M08 e indicação de item indisponível, sem mudar revisão.
- `esvaziar(ctx, carrinho, revisãoEsperada, chave)`: titular/serviço; rejeita
  revisão divergente e preserva itens novos; efeito idempotente.

Carrinho não reserva, cobra ou garante preço futuro.

## M03 — Checkout / ICheckout — RF03, TU03, páginas 20–21

Dono de simulações/tentativas retomáveis. Requer ICarrinho, IPrecos, IEstoque,
IEntregas, IPedidos e IPagamentos.

- `simular(ctx, carrinho, endereço, cupom?)`: titular, carrinho não vazio e
  endereço/CEP válidos; opções de frete, total por opção, revisão e vencimento.
  Não reserva nem cobra.
- `confirmar(ctx, simulação, opçãoFrete, meio, chave)`: revalida revisão, prazo,
  preços/frete e total positivo; reserva, cria pedido e solicita cobrança. Retoma
  a mesma tentativa e chaves após falha; alteração de total pede reconfirmação.

Meio é Pix ou cartão tokenizado. Uma confirmação lógica não gera pedidos/cobranças
duplicados. Checkout coordena regras dos donos, sem recalculá-las por conta própria.

## M04 — Pedidos / IPedidos — RF04, TU04, páginas 22–23

Dono de pedidos, itens preservados, estados e histórico; requer IEstoque,
IEntregas e IPagamentos. Recebe eventos autenticados de M06/M10.

- `criar(ctx, dados, chave)`: somente serviço Checkout; itens não vazios, total
  consistente e reserva válida; AGUARDANDO_PAGAMENTO.
- `consultar(ctx, pedido)`: titular/atendente/serviço autorizado; histórico original.
- `aplicarEvento(ctx, evento)`: valida origem, valores e transição. Confirma
  reserva antes de PAGO; trata expiração e pagamento tardio; operador autorizado
  pode iniciar separação/solicitar expedição via M10.
- `cancelar(ctx, pedido, motivo, chave)`: titular/atendente antes de ENVIADO;
  libera reserva não consumida ou aguarda estorno e repõe não expedidos uma vez.

Estado de devolução pertence a M11, não substitui o histórico do pedido.

## M05 — Clientes / IClientes — RF05, TU05, páginas 24–25

Dono de clientes, credenciais e sessões; sem dependência de outro módulo.

- `cadastrar(dados)`: nome/e-mail/senha; e-mail normalizado único, senha >=12;
  saída Cliente sem senha/hash.
- `autenticar(e-mail, senha)`: sessão opaca com expiração; erros genéricos e
  bloqueio de tentativas conforme política, sem vazamento de existência da conta.
- `validarSessao(token)`: contexto somente quando token ativo; rejeita expiração
  inclusive no instante-limite.
- `obterContato(ctx, cliente)`: titular ou serviço Notificações; nome/e-mail mínimo.

Demais módulos não leem credenciais nem tabelas privadas para obter permissões.

## M06 — Pagamentos / IPagamentos — RF06, TU06, páginas 26–27

Dono de cobranças/estornos; depende de IProvedorPagamento, sem acesso privado a
Pedidos. Identidade interna/externa e estados persistentes.

- `cobrar(ctx, dados, chave)`: serviço Checkout; valor positivo/meio válido,
  chave preservada no provedor; incerteza permanece PENDENTE.
- `processarRetorno(ctx, retorno)`: adaptador autenticado; valida autenticidade,
  IDs, valor/moeda, estado e duplicatas; publica mudança confirmada.
- `estornar(ctx, pagamento, valor, motivo, chave)`: serviços Pedidos/Devoluções;
  limite considera estornos confirmados E pendentes, sob concorrência.
- `consultar(ctx, pagamento)`: titular/serviço autorizado; inclui estornos,
  pode reconciliar pendências sem gerar nova operação financeira.

Solicitar estorno e recebê-lo são efeitos distintos; preservar pendência.

## M07 — Busca / IBusca — RF07, TU07, páginas 28–29

Dono da projeção por SKU; recebe eventos M01/M08/M09, sem chamadas síncronas a
outros módulos de negócio.

- `aplicarEvento(ctx, evento)`: serviço; atualiza campos por origem, deduplica e
  ignora revisão antiga sem regredir outras origens; inativo deixa de aparecer.
- `buscar(filtro, página)`: termo vazio permite navegar; texto ignora caixa e
  acentos; filtros válidos; mínimo <= máximo; preço desempata por SKU.

Resultado inclui preço e atualização conhecidos, sem autoridade sobre checkout.

## M08 — Preços / IPrecos — RF08, TU08, páginas 30–31

Dono de preços/regras; requer ICatalogo para validar cadastro de SKU.

- `configurarRegra(ctx, regra)`: gestor; SKU existe, preço/percentuais válidos,
  início anterior ao fim; versão e PrecoAlterado.
- `calcular(itens, cupom?, instante)`: fonte de tempo confiável; cotação por linha,
  valores/regras/revisões/validade; erros para cupom inválido ou preço ausente.

Aplica RN01/RN02/RNF02; não reserva produtos nem processa pagamentos.

## M09 — Estoque / IEstoque — RF09, TU09, páginas 32–33

Dono de físico vendável, reservas e movimentos; requer ICatalogo para cadastro
inicial. SKU já conhecido continua movimentável se desativado.

- `consultar(sku)`: saldo/versão com expirações consideradas; ausente dá NAO_ENCONTRADO.
- `reservar(ctx, itens, vencimento, chave)`: serviço Checkout; integral, positiva,
  saldo suficiente e proteção da última unidade sob concorrência.
- `movimentar(ctx, movimento, chave)`: logística/serviço autorizado; origem e
  justificativa; saída não consome reservado; publica EstoqueAlterado.
- `encerrarReserva(ctx, reserva, ação, chave)`: serviço; CONFIRMAR antes de vencer
  reduz físico/reservado; LIBERAR reduz reservado; não duplica efeitos.

O banco escolhido deve tornar essas garantias observáveis em concorrência real.

## M10 — Entregas / IEntregas — RF10, TU10, páginas 34–35

Dono de cotações, expedições, rastreio e etiquetas; requer ICatalogo para dados
físicos e ITransportadora externa.

- `cotar(itens, CEP)`: CEP de oito dígitos; opções com valor/prazo/validade.
  Não atendido retorna vazio, diferentemente de provedor indisponível.
- `solicitarEnvio(ctx, dados, chave)`: serviço Pedidos atesta pagamento/liberação
  logística; exige cotação válida/endereço; mesma chave conserva expedição.
- `registrarRastreio(ctx, retorno)`: adaptador autenticado; deduplica, impede
  regressão e publica EntregaAtualizada.
- `gerarReversa(ctx, pedido, endereço, itens, chave)`: serviço Devoluções; etiqueta
  identificada sem alterar estoque/estorno; incerteza mantém chave/pendência.

Uma expedição de ida por pedido nesta versão.

## M11 — Devoluções / IDevolucoes — RF11, TU11, páginas 36–37

Dono de elegibilidade, solicitações, inspeções e pendências; requer IPedidos,
IPagamentos, IEstoque e IEntregas.

- `solicitar(ctx, pedido, itens, motivo, chave)`: titular, entrega/prazo/quantidade
  elegível; compromete limite para impedir solicitações sobrepostas.
- `decidir(ctx, devolução, decisão, chave)`: atendente; AUTORIZAR/REJEITAR com
  justificativa; etiqueta ou liberação de quantidade comprometida.
- `concluirInspecao(ctx, devolução, inspeção, chave)`: logística/conciliador;
  registra resultado, repõe só aptos e solicita restituição. Reexecução consulta
  M06 sem repetir estoque/estorno; CONCLUIDA somente após efeitos obrigatórios.

Estados: SOLICITADA, AUTORIZADA/REJEITADA, EM_INSPECAO,
RESTITUICAO_PENDENTE, CONCLUIDA; falha de etiqueta tem pendência de emissão.

## M12 — Notificações / INotificacoes — RF12, TU12, páginas 38–39

Dono de mensagens/tentativas; requer IClientes e ICanal. Recebe eventos de negócio.

- `processarEvento(ctx, evento)`: serviço; contato autorizado, modelo e campos
  mínimos; identidade evento/destinatário/canal e chave externa estáveis.
- `reenviar(ctx, notificação)`: atendente/serviço; só pendente/falha gera tentativa;
  enviada retorna estado existente sem novo envio.

Aceitação pelo canal não significa leitura. Falha não cancela compra.

## M13 — Avaliações / IAvaliacoes — RF13, TU13, páginas 40–41

Dono de opiniões/moderação; requer IPedidos para titularidade, SKU e entrega.

- `publicar(ctx, pedido, sku, nota, comentário)`: cliente elegível; cria PENDENTE,
  unicidade cliente/pedido/SKU, nota 1–5 e comentário até 2.000 caracteres.
- `moderar(ctx, avaliação, decisão, motivo)`: moderador; PUBLICADA/REJEITADA,
  responsável registrado e nota original preservada.
- `listar(sku, página)`: só publicadas e sua média; sem dados, média indisponível.

Tratar comentário como texto, sem execução no navegador.

## M14 — Analytics / IAnalytics — RF14, TU14, páginas 42–43

Dono de eventos mínimos e agregações; sem consulta síncrona a módulos de negócio.

- `registrar(ctx, evento)`: serviço/coletor; origem/tipo/campos permitidos,
  captura/estorno só de M06; deduplica evento e operação financeira.
- `consultarMetricas(ctx, filtro)`: gestor; início < fim, pedidos pagos distintos,
  capturas e estornos separados, critérios/período/última atualização; vazio=zero.

Preço visto no site não é faturamento. Dados pessoais indevidos são rejeitados
sem serem copiados para logs. Relatórios não representam lucro.

## Fronteiras externas — seção 3.7, página 15

IProvedorPagamento: cobrar(pedido, valor, meio, chave), consultar(transação),
estornar(transação, valor, chave). ITransportadora: cotar(itens físicos, CEP),
expedir(pedido, endereço, opção, chave), gerarReversa(pedido, endereço, itens, chave).
ICanal: enviar(destinatário, modelo, parâmetros mínimos, chave).

Essas interfaces não são módulos adicionais nem ferramentas já disponíveis.
Identificadores, retorno verificável, consulta e idempotência são capacidades a
confirmar no provedor real. Não mascarar indisponibilidade como vazio ou sucesso.
