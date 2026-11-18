# Verificação da exportação — 09/11/2026

- Origem conferida: commit `c668cbd51fe317239f57cf81b25a54a45061fba5`, branch `codex/fundacao-incremento-1`, árvore original sem alterações pendentes na conferência.
- Os 76 arquivos versionados foram preservados. Código, testes, scripts, configurações e lockfile têm os mesmos SHA-256 do commit. Apenas `README.md` e `PLANO_DESENVOLVIMENTO.md` tiveram adaptações documentais de entrada/portabilidade.
- Acrescentados guia do grupo, inventário de skills, orientação para agentes, skill própria com seus quatro documentos de referência e metadados, referência dos PDFs, o enunciado `Trabalho.pdf` e este registro.
- Atualização: 33 skills completas com 165 arquivos, instalador offline, quatro testes do instalador e instruções de instalação/uso. Uma skill PDF com restrição explícita de redistribuição é instalada pelo plugin e tem instruções próprias. Os hashes das cópias estão em `skills/catalogo.json` e a auditoria em `skills/VERIFICACAO_SKILLS.md`.
- Links locais Markdown conferidos; documentação do pacote sem caminhos absolutos da máquina do autor.
- Não foram incluídos `.git`, dependências instaladas, builds, caches, banco local, `.env`, credenciais locais nem logs. `.env.example` contém somente parâmetros demonstrativos já versionados.
- PDF recebido copiado integralmente, com SHA-256 conferido. Ele tem uma página e é diferente da especificação anterior de 45 páginas.
- O arquivo `MANIFESTO_SHA256.json` lista hashes de todos os demais arquivos do pacote. O ZIP foi reaberto, teve CRC verificado e cada entrada comparada por SHA-256 à pasta de entrega. O hash do ZIP fica no arquivo `.zip.sha256` ao lado dele.

Esta é uma validação de **conteúdo, integridade e portabilidade da entrega**. Não houve alteração de código do e-commerce nem nova instalação/execução completa de suas suites neste empacotamento. O novo instalador de skills e os auxiliares TDD/SQL foram testados separadamente, conforme `skills/VERIFICACAO_SKILLS.md`. Os 55 testes backend, 4 frontend e 14 jornadas de navegador de `docs/VALIDATION.md` são evidências de **23/10/2026** do mesmo código. Cada integrante deve executar os comandos de validação após instalar as dependências em sua máquina.
