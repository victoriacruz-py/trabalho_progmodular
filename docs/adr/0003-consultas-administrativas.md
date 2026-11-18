# Retomar a edição de produtos e regras

A vitrine pública de M01 só retorna produtos ativos. O cálculo de M08 retorna a oferta vigente, que não contém toda a configuração de uma promoção ou de um cupom. Usar essas consultas no editor impedia reativar produtos e recuperar regras depois de sair da tela, podendo apagar uma promoção ao salvar o preço.

Mantivemos ICatalogo e IPrecos do PDF e acrescentamos interfaces administrativas exportadas pelo index de cada módulo. Elas permitem obter produto por SKU e regra por SKU ou código, incluindo estados inativos e períodos vencidos ou futuros. Exigem Context confiável com papel GESTOR dentro do módulo; autenticar apenas a rota não seria suficiente. Os retornos preservam a versão para o controle otimista das alterações.

O adaptador HTTP oferece essas consultas em /api/gestao. A interface de gestão as utiliza para retomar os formulários. A vitrine continua utilizando os contratos públicos de catálogo e cotação. A carga demonstrativa também consulta produtos pela interface administrativa para preservar desativações em reinicializações.
