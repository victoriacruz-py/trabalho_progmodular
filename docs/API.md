# API HTTP — incremento 1

Contrato executável para consulta: [OpenAPI 3.1](openapi.json). Fonte: adaptador
`apps/api/src/http.ts`, interfaces dos módulos e cliente `apps/web/src/api.ts`,
verificados em **23/10/2026**. A especificação descreve o comportamento atual;
não representa validação automática de conformidade de todas as respostas.

## Operações disponíveis

| Método e caminho | Acesso | Sucesso | Corpo/retorno |
|---|---|---|---|
| `GET /api/health` | Público | 200 | `{status:"ok", incremento:1}`; verifica conexão com o banco |
| `POST /api/clientes` | Público | 201 | Nome, e-mail e senha → cliente sem credenciais |
| `POST /api/sessoes` | Público | 201 | E-mail/senha → cookie, cliente, contexto, expiração e CSRF |
| `GET /api/sessoes/atual` | Sessão | 200 | Cliente, contexto, expiração e CSRF; não renova o prazo |
| `DELETE /api/sessoes` | Sessão + CSRF | 204 | Revoga sessão e remove cookie; corpo vazio |
| `GET /api/catalogo` | Público | 200 | Produtos ativos; filtros `categoria`, `marca`, `pagina`, `tamanho` |
| `GET /api/catalogo/{sku}` | Público | 200 | Produto ativo; ausente/inativo resulta em 404 |
| `GET /api/gestao/catalogo/{sku}` | GESTOR + sessão | 200 | Produto completo, inclusive inativo, com versão para edição |
| `GET /api/gestao/precos/{sku}` | GESTOR + sessão | 200 | Preço e promoção configurada, inclusive futura/encerrada, com versão |
| `GET /api/gestao/cupons/{codigo}` | GESTOR + sessão | 200 | Cupom completo, inclusive expirado, com vigência, escopo e versão |
| `PUT /api/catalogo/{sku}` | GESTOR + sessão + CSRF | 200 | Produto completo → produto salvo com versão |
| `POST /api/precos/regras` | GESTOR + sessão + CSRF | 201 | Regra `PRECO` ou `CUPOM` → regra com versão |
| `POST /api/precos/cotacoes` | Público | 200 | Itens e cupom opcional → cotação; sem reserva/cobrança |
| `GET /api/estoque/{sku}` | Público | 200 | Físico, reservado, disponível e versão |
| `POST /api/estoque/movimentos` | LOGISTICA + sessão + CSRF | 201 | Movimento e `Idempotency-Key` → saldo resultante |

`GESTOR` sozinho não autoriza movimentar estoque. Cadastro público cria somente
o papel `CLIENTE`; não há endpoint público para conceder papéis. Os contratos
internos de reservas existem em M09, mas não têm rotas HTTP neste incremento.
O inventário documental contém **15 operações HTTP atuais**; não antecipa
contratos HTTP dos incrementos futuros.

As três consultas administrativas são somente de leitura, exigem papel GESTOR e
não exigem CSRF por serem GETs. Elas recuperam a configuração persistida, sem
alterar estado, publicar eventos ou tornar produtos inativos públicos. Recurso
ausente recebe 404; sessão ausente/expirada, 401; papel insuficiente, 403. Preço
sem promoção omite `promocao`; cupom global omite `skus`. O painel pode carregar
a configuração e enviar sua versão como `versaoEsperada` ao salvar.

## Sessão e proteção de requisições

O navegador usa `credentials: "include"`. A autenticação define
`ecommerce_session` como cookie **HttpOnly**, `SameSite=Lax`, `Path=/api`, com
expiração de 30 minutos; `Secure` é aplicado quando `production=true`. O segredo
de autenticação não aparece no JSON e não deve ser guardado em `localStorage`.

O `csrfToken` vem do login ou de `GET /api/sessoes/atual`. Enviar seu valor no
header `X-CSRF-Token` em logout, gravação de produto/regra e movimentação de
estoque. A resposta `contexto` é informativa: o servidor deriva a identidade da
sessão e rejeita campos extras como `ctx`, `roles` ou `service` no corpo.

Login, cadastro e cotação pública não exigem CSRF. Em todos os métodos diferentes
de GET/HEAD/OPTIONS, um `Origin` presente e diferente da origem configurada recebe
403. A configuração padrão é `http://127.0.0.1:5173`; CORS permite credenciais
para a origem configurada. Omitir `Origin` não dispensa sessão/CSRF nas rotas
protegidas. Cinco falhas de login em 15 minutos bloqueiam tentativas por
15 minutos, mantendo erro 401 genérico. Logout repetido após revogação recebe 401.

## Valores, versões e repetição

- Dinheiro: **centavos inteiros de BRL**; `10000` representa R$ 100,00. Preço-base
  é positivo. Valores/resultados devem caber em `Number.MAX_SAFE_INTEGER`.
- Cotação: até 100 linhas de SKUs distintos por requisição HTTP, quantidades
  positivas, um cupom opcional. Promoção e cupom não acumulam; maior desconto
  elegível por linha, arredondamento único com empate para cima. Frete não entra.
- Períodos: instantes ISO com fuso explícito, início inclusivo e fim exclusivo.
  A cotação usa o relógio do servidor; `instante` no corpo é rejeitado. A validade
  é de até cinco minutos, encurtada pelas fronteiras das regras. Mudanças
  administrativas ainda exigirão recálculo no checkout.
- Versões: criação de produto/regra omite `versaoEsperada`; atualização envia a
  versão corrente. Conflito devolve 409. O corpo do produto deve repetir o SKU
  do caminho. As gravações substituem o conteúdo completo: omitir promoção a
  remove; omitir `skus` torna o cupom global.
- Idempotência: apenas movimentação HTTP de estoque exige `Idempotency-Key`
  (1–200 caracteres). Reutilizar a mesma chave e conteúdo normalizado, no mesmo
  contexto/operação, devolve o resultado original sem repetir efeito. Conteúdo
  diferente recebe 409. Após resposta perdida, repetir a mesma tentativa/chave;
  uma intenção nova precisa de outra chave. O saldo retornado em replay é o
  resultado original; `GET /api/estoque/{sku}` consulta o saldo corrente.
- Catálogo: filtros exatos combinados por AND, ordenação por SKU, página inicial
  1, tamanho padrão 12 e máximo 100. SKU é estável e sensível à caixa. Codificar
  seu valor no caminho com `encodeURIComponent`.

Corpos e query string do catálogo rejeitam propriedades desconhecidas. Os
limites efetivos estão no OpenAPI; ele usa a interseção da validação HTTP e do
domínio. Alguns validadores têm limites intermediários diferentes (por exemplo,
HTTP admite SKU de até 200 caracteres, enquanto M01/M08 limitam a 100).

## Respostas de erro

```json
{
  "codigo": "CONFLITO",
  "mensagem": "Os dados foram alterados. Recarregue antes de tentar novamente.",
  "requestId": "c6f4577f-4731-4680-9e2c-5f64f9f5a201"
}
```

| HTTP | Código usual |
|---|---|
| 400 | `INVALIDO` |
| 401 | `NAO_AUTORIZADO` por sessão ou credenciais inválidas |
| 403 | `NAO_AUTORIZADO` por papel, CSRF ou Origin |
| 404 | `NAO_ENCONTRADO` |
| 409 | `CONFLITO`, `ESTOQUE_INSUFICIENTE`; mapeamento interno também prevê `RESERVA_EXPIRADA` |
| 422 | `PRECO_INDISPONIVEL`, `CUPOM_INVALIDO` |
| 503 | `INDISPONIVEL` quando lançado como erro de domínio |
| 500 | Falha interna não classificada, também com código `INDISPONIVEL` |

As respostas levam `X-Request-Id`, `Cache-Control: no-store` e
`X-Content-Type-Options: nosniff`. Detalhes técnicos não são expostos. Para
`CUPOM_INVALIDO`, quatro mensagens comerciais são preservadas: cupom inexistente,
ainda não ativo, expirado ou inelegível. Outros erros usam mensagens genéricas.

O cliente web também cria erros locais `CONEXAO` (status 0) e `HTTP` quando falta
um corpo de erro reconhecido. Esses códigos não são respostas deste servidor.
