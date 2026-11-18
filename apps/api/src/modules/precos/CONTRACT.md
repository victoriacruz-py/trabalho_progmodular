# M08 — Precificação e promoções

Interface pública: `IPrecos`, exportada por `index.ts`. Referência: RF08, RN01,
RN02, RNF02 e TU08.01–06, páginas 30–31 do PDF. Os clientes importam somente
o `index.ts`; o módulo consulta M01 pela interface `ICatalogo`.

## Configuração

`configurarRegra` exige contexto confiável de gestor. Preço-base é inteiro
positivo em centavos; promoção e cupom aceitam taxa inteira de 1 a 100. Os
instantes têm fuso explícito, são armazenados como `timestamptz` e devolvidos
em ISO UTC. Intervalos incluem início e excluem fim.

A criação omite `versaoEsperada`; atualização exige a versão corrente. O lock
por identidade e a comparação da versão asseguram um vencedor entre gravações
concorrentes sobre a mesma revisão. Cada atualização substitui a regra inteira:
omitir a promoção remove a promoção anterior; omitir `skus` torna o cupom global.
Lista de SKUs vazia ou repetida é inválida. Cada SKU informado é validado em M01.

Decisão de implementação: códigos de cupom ignoram espaços externos e caixa,
sendo armazenados em maiúsculas. SKUs conservam sua caixa e são identidades
distintas. O schema privado `precos` normaliza o vínculo cupom/SKU em tabela
filha; não contém FK ou join para tabelas privadas de outro módulo.

## Cotação

`calcular` recebe de 1 a 10.000 linhas, com SKUs distintos e quantidades inteiras
positivas. O limite é de entrada técnica; não é requisito comercial do PDF.
Linhas repetidas são rejeitadas para evitar que a divisão artificial de uma
linha altere seu arredondamento. Campos e totais não podem exceder o intervalo
inteiro exato do contrato JSON/TypeScript. Cálculos intermediários usam `bigint`.

Promoção e cupom não se acumulam: vale a maior taxa elegível por linha. Em empate,
a descrição da regra aplicada prefere a promoção; o valor financeiro é igual.
O desconto é arredondado uma vez por linha, com empate para cima. Frete não
participa deste módulo. Um desconto de 100% pode produzir linha zero; a rejeição
de compra com total zero pertence ao checkout.

Cupom informado precisa existir, estar no período e ser elegível para ao menos
uma linha. Em uma cesta mista, só as linhas elegíveis recebem o desconto do cupom.
SKU sem preço devolve `PRECO_INDISPONIVEL`; nunca é substituído por zero.

O cálculo usa uma transação somente de leitura com snapshot `REPEATABLE READ`,
preservando coerência entre preços, cupom e elegibilidade. A resposta informa
versão do preço, regra efetivamente aplicada e revisão do cupom fornecido.
A validade é limitada a cinco minutos e encurtada por início/fim de promoção
ou fim do cupom. Essas fronteiras são conservadoras mesmo quando a promoção
perde para um cupom maior. Validade não bloqueia alterações administrativas:
o checkout deve recalcular antes de cobrar, conforme RN03.

`instante` é opcional para os chamadores internos confiáveis; a apresentação
HTTP deve usar o relógio do servidor e não encaminhar instante do navegador.

## Consulta administrativa

A factory oferece a interface técnica `admin.obterRegra(ctx, selector)`, exclusiva
de gestor autenticado. O seletor é `{tipo: "PRECO", sku}` ou `{tipo: "CUPOM", codigo}`.
Ela recupera a configuração completa e sua versão, incluindo promoção futura ou
encerrada, validade do cupom e escopo de SKUs. Cupom global omite `skus`; preço sem
promoção omite `promocao`. Isso permite preencher a edição sem reconstruir uma
regra a partir de uma cotação. Ausente produz `NAO_ENCONTRADO` e contexto comum
ou forjado produz `NAO_AUTORIZADO`. A leitura não publica eventos nem altera
estado, usa somente o schema próprio e preserva o contrato `IPrecos` do PDF.

## Persistência e eventos

A migração `001_initial` é versionada pelo mecanismo de infraestrutura. Regra
e intenção de publicação `PrecoAlterado` são confirmadas na mesma transação.
O agregado é `sku:<SKU>` ou `cupom:<CODIGO>`, evitando colisão entre namespaces.
O payload contém `tipo` e a identidade original para consumidores; o agregado
não deve ser tratado como um SKU cru. Cada namespace conserva sua própria versão.

As verificações em `tests/integration/oferta.test.ts` observam somente as
interfaces de catálogo, precificação e journal, usando PostgreSQL real. Falha
injetada na construção do evento verifica rollback; reabertura de conexão
verifica persistência. Isso não equivale a matar o servidor durante um commit
nem a uma medição de desempenho ou disponibilidade mensal.
