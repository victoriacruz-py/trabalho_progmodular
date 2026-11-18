# M01 — Catálogo

Interface pública: `ICatalogo`, exportada por `index.ts`. Referência: RF01,
TU01.01–06, páginas 16–17 do PDF. Os clientes importam somente o `index.ts`.

O catálogo é dono da descrição comercial e técnica, dos atributos e dos dados
físicos de cada SKU. Preço e disponibilidade são autoridades de M08 e M09.
Nenhuma consulta do catálogo faz join em tabelas desses módulos.

`salvarProduto` aceita somente o contexto confiável de gestor. Criação omite
`versaoEsperada`; atualização exige a versão corrente. SKU é uma identidade
estável. Atualizações concorrentes sobre a mesma versão têm um único vencedor.
Desativação preserva o registro e publica sua nova versão.

Consultas públicas retornam apenas produtos ativos. Ausente e inativo produzem
`NAO_ENCONTRADO`; filtros por categoria e marca são exatos. A lista é ordenada
por SKU e paginada a partir de 1, com no máximo 100 itens por página.

A factory também oferece a interface técnica `admin.obterProduto(ctx, sku)`.
Somente gestor autenticado recupera por ela produtos ativos ou inativos com todos
os campos e a versão atual. A leitura não altera estado nem publica evento e
permite carregar um produto desativado para edição/reativação sem torná-lo
público. Ausente produz `NAO_ENCONTRADO`; cliente comum/contexto forjado produz
`NAO_AUTORIZADO`. Essa extensão administrativa preserva `ICatalogo` do PDF.

O schema privado `catalogo` conserva produto e evento `ProdutoAlterado` na mesma
transação. Os índices parciais de categoria/SKU e marca/SKU atendem às consultas
de produtos ativos. Atributos são um documento descritivo, sem identidade ou
ciclo de vida independente; não são relacionamentos codificados em JSON.

Os textos são dados, nunca HTML executável. A apresentação deve renderizá-los
como texto e não utilizar `innerHTML`. Imagem aceita URL HTTP(S) sem credenciais
ou caminho local iniciado por `/`, sem `//` inicial nem traversal. Não aceita
URLs `javascript:` ou `data:`.
