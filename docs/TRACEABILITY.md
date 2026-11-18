# Rastreabilidade — incremento 1

Fonte: `e-commerce_modular.pdf`, 45 páginas, especificação de 09/10/2026; SHA-256 `fa80c36b52071d5d85a3557972bbd1a46302194909064dbb3e0aae4d31a439b5`. Os grupos da página 45 determinam o incremento. A lista completa de 14 módulos permanece no plano; não se considera concluída a operação de compra.

| Requisito/contrato | Implementação | Evidência automatizada |
|---|---|---|
| M05, TU05.01–08, pp. 24–25 | Cadastro normalizado, senha, sessão, bloqueio, contato restrito | `clientes.test.ts`, `http.test.ts`, navegador |
| M01, TU01.01–06, pp. 16–17 | Produto físico, versão esperada, ativos, filtros/página, evento | `oferta.test.ts`, `http.test.ts`, navegador |
| M08, TU08.01–06, pp. 30–31 | Base/promoção/cupom, elegibilidade, vigência, regra aplicada e retomada da edição | `oferta.test.ts`, `http.test.ts`, `price-expiry.spec.ts`, navegador |
| M09, TU09.01–08, pp. 32–33 | Físico/reservado/disponível, reserva integral, encerramento e movimentos | `estoque.test.ts`, `http.test.ts`, navegador |
| RN02 e RNF02, dinheiro | Centavos, inteiros seguros, half-up uma vez por linha, maior desconto | `money.test.ts`, oráculos literais em `oferta.test.ts` |
| RN03/RN04 e EI04–08 | Prazo confiável, concorrência, última unidade, expiração sem limpador | Testes de estoque, pools distintos e lock real |
| RI, encapsulamento e eventos | Schemas privados, imports públicos, transação+outbox, inbox idempotente | Verificador AST e testes de fundação |
| Persistência/recuperação | Migrações imutáveis, reabertura, crash entre commit e ACK, carga idempotente | `migrations.test.ts`, `foundation.test.ts`, `seed.test.ts`, dois processos reais |
| Segurança da entrada | Validação runtime, papéis, CSRF, sessão, relógio e preço calculados no servidor | `http.test.ts`, `clientes.test.ts` |
| RNF03 carga/latência | Logs com duração de resposta, índices e limites de paginação | Ensaio completo ainda pendente; concorrência funcional não é carga |
| RNF05 disponibilidade e RNF06 usabilidade | Saúde técnica, interface responsiva e acessível por teclado | Disponibilidade mensal e ensaio com pessoas ainda pendentes |

Casos TU possuem múltiplas condições agrupadas em testes de comportamento; quantidade de testes não equivale à quantidade de requisitos. As skills orientam arquitetura e validação, mas não substituem a fonte nem concedem evidência de execução.
