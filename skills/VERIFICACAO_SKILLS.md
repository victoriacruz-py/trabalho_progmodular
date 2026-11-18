# Conferência das skills — 09/11/2026

## Conteúdo e portabilidade

- **33 skills completas**, **165 arquivos**: 33 entradas `SKILL.md` e 132 auxiliares/avisos. Nenhum script auxiliar necessário foi substituído por resumo.
- **34 entradas no catálogo**: 33 incluídas e `anthropic-skills:pdf` com instalação pelo plugin, por restrição explícita de transferência em sua licença.
- Todos os arquivos regulares das origens selecionadas foram copiados, exceto caches Python. Licenças existentes dentro das pastas foram preservadas; licenças ancestrais do A-Team e Superpowers também foram incluídas.
- `catalogo.json` registra SHA-256 por arquivo, origem genérica, grupo e adaptações. Nomes de plugins receberam IDs portáveis; referências a backups pessoais foram generalizadas. O conteúdo da skill específica de domínio é o mesmo na pasta instalável e em `.agents/skills`.
- Referências locais dos documentos foram auditadas. `references/redlining.md`/`references/ooxml.md` em `skill-creator` e `src/ordering|billing|fulfillment/GLOSSARY.md` em `domain-modeling` são exemplos declarados, não arquivos faltantes do pacote.
- As dependências TDD/codebase/review estão presentes. As skills de planejamento e finalização do A-Team foram adicionadas como complementos. Comandos de plugins e integrações externas não são executáveis trazidos por uma pasta `SKILL.md`; veja o guia de compatibilidade.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| Instalador: simulação sem escrita | Passou; destino novo não foi criado |
| Instalador: cópia das 33 skills e repetição | Passou; 33 novas, depois 33 idênticas sem alterações |
| Instalador: versão diferente já existente | Passou; preservou o conteúdo e não copiou as outras skills |
| Instalador: auxiliar adulterado | Passou; rejeitou antes de criar o destino |
| Suite do instalador | **4 testes passaram** |
| `sql-schema-designer` | **22 testes passaram** com Python/biblioteca padrão |
| `tdd-guide` | **18 testes passaram** com Python/biblioteca padrão |
| Simulação no destino padrão do projeto | 32 skills a copiar e uma skill de domínio já idêntica |

Foram usadas pastas temporárias para os testes de instalação; as skills globais da máquina não foram alteradas. Nenhum script de negócio, provedor externo ou runtime de plugin foi iniciado pelo instalador.

Esses testes validam os comportamentos acima, não todos os auxiliares de todas as skills, nem a compatibilidade com todo assistente. Dependências opcionais devem ser instaladas conforme cada recurso utilizado. A suite de SQL não prova que o DDL executa no PostgreSQL, e a suite de métricas não comprova a qualidade do e-commerce.
