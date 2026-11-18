# Fundação e incremento 1

Escopo autorizado: M05, M01, M08 e M09, respectivas interfaces HTTP e interface web; infraestrutura de persistência, eventos, testes e documentação. M02–04, M06–07 e M10–14 não são implementados nesta entrega.

## Interfaces de teste previamente definidas

O pedido autoriza seguir os contratos públicos do PDF: IClientes (cadastro/sessão/contato), ICatalogo (salvar/obter/listar), IPrecos (configurar/calcular) e IEstoque (consultar/reservar/movimentar/encerrar). Os testes observam essas interfaces. Elas cobrem comportamento do módulo, não toda a apresentação. A interface HTTP cobre validação e autorização da entrada; o navegador cobre os percursos visíveis. Concorrência e recuperação exigem PostgreSQL real e processos reiniciados. Simuladores de catálogo/relógio permitem isolamento onde o PDF pede dependências substituíveis.

Fonte: PDF, páginas 14–17, 24–25, 30–33. Critérios TU manuais permanecem distintos da automação. Referência de revisão: commit inicial do plano, 87b8eee.

## Execução

- [x] Fundação, contratos, tipos monetários e infraestrutura durável.
- [x] M05: cadastro, autenticação e proteção de contato.
- [x] M01 e M08: produto e preço com versões/eventos.
- [x] M09: movimentações/reservas com concorrência e idempotência.
- [x] HTTP e interface web utilizável.
- [x] Verificações completas, revisão de especificação e revisão de qualidade; corrigir achados.

Decisões e evidências registradas em `adr/`, `TRACEABILITY.md`, `REVIEW.md` e `VALIDATION.md`. Não foram instalados serviços de produção nem enviadas comunicações/cobranças reais.
