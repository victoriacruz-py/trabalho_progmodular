# Revisão crítica e correções

Base independente: `git diff 87b8eee...234eb58`, depois de 50 testes backend, dois frontend e seis jornadas Playwright passarem. A skill Matt Pocock `code-review` orientou duas revisões paralelas, mantidas separadas abaixo. O PDF foi relido diretamente; documentar uma limitação não foi considerado suficiente para aprovar uma funcionalidade incompleta do incremento.

## Spec — aderência ao PDF

**Três achados P2, corrigidos.**

1. **Cupom existente sem manutenção após sair da tela.** O RF08 exige manter preços/regras (p. 5). A versão estava apenas no estado do formulário. Foram acrescentadas consultas administrativas autenticadas ao módulo de preços, HTTP e painel, recuperando versão, promoção, vigência e escopo. Testes exercitam troca de aba, nova leitura e atualização.
2. **Produto inativo não podia ser reaberto.** RF01 prevê cadastrar/atualizar produtos (p. 4) e preservação do histórico dos inativos (p. 16). A consulta pública continua ocultando inativos, enquanto a consulta administrativa exige GESTOR e os recupera com versão. Edição e reativação são verificadas no navegador.
3. **Preço promocional permanecia após sua validade.** O PDF exclui o instante final da promoção (p. 30). A interface passou a conservar a cotação e invalidar o preço no prazo informado pelo servidor, descontando a duração da consulta e atualizando ao retornar à aba. O teste usa relógio do navegador distinto do servidor e oráculos literais de preço, sem confiar no preço-base riscado.

As consultas de manutenção são adaptadores administrativos adicionais; os contratos `ICatalogo` e `IPrecos` usados entre módulos permanecem preservados. Não foi alterado o SQL já aplicado das migrações iniciais.

## Standards — padrões de código

**Dois achados P2, corrigidos.**

1. **Outbox podia esgotar o pool.** A transação mantinha uma conexão enquanto aguardava o receptor adquirir outra. A prova inicial com 12 entregadores produziu 12 timeouts e nenhum efeito. A leitura do pendente e o ACK agora usam transações curtas, liberando a conexão durante o receptor. Entregas concorrentes podem repetir o evento; inbox e efeito continuam atômicos. A regressão confirma efeitos únicos e mantém o cenário de crash entre commit e ACK.
2. **Conversão de preço alterava um centavo.** `70368744177664.01` virava `7036874417766402` centavos com multiplicação em ponto flutuante. O conversor usa texto decimal e BigInt; a apresentação/formulário usam quociente/resto inteiros. Oráculos literais cobrem esse caso, o limite seguro, casas extras e notação exponencial. O navegador verifica salvar e carregar o mesmo valor.

O possível smell Primitive Obsession da conversão foi resolvido com um pequeno módulo monetário; não foram criadas camadas sem necessidade. Não houve outra violação confirmada dos padrões documentados.

## Design critique — apresentação

Inspeção das capturas desktop e celular seguindo `design-critique`: a hierarquia de título, catálogo e preço estava clara; navegação, filtros e detalhe eram utilizáveis. Foram feitos três ajustes concretos:

- Ilustração padrão por categoria, evitando que produtos de áudio e periféricos pareçam notebooks.
- Texto auxiliar dos produtos maior no celular e botões de detalhes com área de 44×44 pixels.
- Ajuda da senha ligada por `aria-describedby`, separada do nome acessível do campo.

Contrastes calculados nas combinações centrais: marca/produto 4,71:1, texto secundário 5,62:1, disponibilidade 5,91:1 e texto branco no botão azul 8,58:1. Isso não é uma auditoria completa de WCAG nem avaliação com pessoas.

## Verificações adicionais de integração

A reexecução dos dados demonstrativos encontrou um produto desativado como se fosse inexistente, impedindo reiniciar a loja. Um teste reproduziu o conflito; a carga agora consulta a manutenção autenticada e preserva estado/estoque existentes. A API também preserva os quatro motivos seguros de cupom inválido, incluindo expiração.

Resultados finais de revalidação estão em `VALIDATION.md`. Por eixo: Spec teve três achados, sendo a validade do preço o maior risco funcional; Standards teve dois, sendo a interrupção das entregas o maior risco de durabilidade. Todos receberam correções e regressões.
