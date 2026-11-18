# Evidências de validação

Execução local em 23/10/2026, Windows, Node 24.19.0, PostgreSQL real 18.4. Pacotes fixados no lockfile. Não foram utilizados SQLite nem banco simulado para as evidências de transação/concorrência.

| Verificação | Resultado observado |
|---|---|
| TypeScript API, web e testes de navegador, modo estrito | Passou |
| Jest, 8 suítes | 55 testes passaram, 38,9 s de execução do Jest |
| Vitest, cliente HTTP e dinheiro no frontend | 4 testes passaram |
| Playwright, Chromium desktop e Pixel 7 | 14 jornadas passaram, aproximadamente 1 minuto |
| Build Vite | Passou; JS 257,66 kB, gzip 79,58 kB |
| Fronteiras AST | 39 arquivos; sem acesso privado detectado; self-test passou |
| Dependências | npm audit reportou 0 vulnerabilidades na instalação |

Os tempos de teste excluem a preparação dos bancos. Os números de testes não são cobertura percentual. CI foi escrita, mas ainda não executada num serviço remoto.

## Evidências relevantes

- Cinco falhas de login, inclusive concorrentes, bloqueiam a conta; limite temporal e persistência do bloqueio exercitados. Dados de contato exigem proprietário ou serviço M12 confiável.
- Catálogo e preços exigem versão esperada; duas atualizações concorrentes têm somente um vencedor. Erros não deixam produto/regra sem evento correspondente.
- Valores monetários têm oráculos literais de arredondamento, elegibilidade e limites numéricos. Promoção e cupom não acumulam desconto.
- Reservas usam PostgreSQL e pools distintos; disputa pela última unidade, listas inversas, expiração exata, confirmação esperando lock e repetição idempotente foram exercitadas.
- Recuperação: um processo Node terminou abruptamente com código 73 após o commit do receptor e antes do ACK. Outro processo retomou o evento: uma entrega, zero efeitos adicionais, nenhuma pendência. Não é apenas reabertura de factory.
- Doze entregadores concorrentes usando o mesmo pool concluem a entrega dos eventos, com um efeito persistido por evento. A conexão do produtor fica livre enquanto o receptor trabalha.
- Migrações serializadas, imutáveis por checksum, retomadas após rollback e preservação de dados confirmadas.
- Reiniciar a carga demonstrativa preserva produto inativo, preço já modificado e quantidade movimentada; não repõe estoque já consumido.
- Navegador: vitrine, filtros, detalhe, cadastro, autenticação, recarregamento da sessão, logout, criação de oferta com estoque e retomada da edição de produto inativo, promoção e cupom. Desktop 1440×1000 e celular; sem overflow horizontal nos cenários testados.
- Expiração de preço: cartão e detalhe removem a oferta antes da renovação, inclusive com diferença entre relógio do navegador e servidor. Resposta que vence no transporte não aparece como oferta válida nem causa loop imediato. O retorno à aba é exercitado pelo evento de visibilidade do navegador. Nesses três cenários, as respostas de cotação são controladas pelo teste; as regras de vigência do servidor são verificadas separadamente com PostgreSQL.
- Entrada, persistência e reabertura do preço `70368744177664.01` preservam os centavos no navegador. Limites seguros e formatos rejeitados também são verificados em testes unitários.
- Demonstração reiniciada após as correções: interface e saúde responderam 200, login 201, consultas administrativas de produto/preço 200 com sessão e 401 sem sessão. Os seis produtos demonstrativos foram preservados; a sessão usada na conferência foi revogada.

## Ciclos de correção observados

Os testes RED→GREEN reproduziram: operação ainda não implementada, falta de bloqueio de login, validação de preço vazando código SQL, perda de atualização, reserva expirada ainda comprometendo saldo, saturação do pool ao consultar outro módulo dentro da transação, UUID inválido, URL com dupla codificação e colisão de identidade de eventos de preço/cupom. Na integração, corrigiram-se o rótulo acessível da senha e a perda da mensagem específica de cupom expirado. A revisão acrescentou regressões para consultas administrativas, entrega concorrente, conversão monetária, oferta vencida e reinicialização com produto inativo.

## Limites

RNF03 completo não foi executado: não há evidência de 10 mil SKUs, 100 usuários por quinze minutos nem aprovação do p95 de catálogo/busca. O módulo de Busca pertence a outro incremento. Logs técnicos registram duração do início do middleware até o término da resposta e identificador de correlação; não registram corpos, credenciais ou dados pessoais.

Disponibilidade mensal, backup/restauração operacional e avaliação com pessoas não foram validados. Navegador automatizado não demonstra o critério humano 4/5 do PDF. Eventos de módulos futuros e integrações externas ainda não estão presentes. Esta entrega é a fundação e o incremento 1, não uma operação completa de compra em produção.

As revisões críticas de especificação, padrões e apresentação estão em `REVIEW.md`. Os cinco achados funcionais e técnicos foram corrigidos; a matriz acima foi reexecutada após as alterações.
