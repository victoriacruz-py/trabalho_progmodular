# Orientação para continuar o projeto

Leia `ENTREGA_GRUPO.md`, `CODING_STANDARDS.md`, `GLOSSARY.md` e os ADRs afetados antes de modificar código.

- A fundação e M05/M01/M08/M09 já existem. Implemente somente o incremento/módulo solicitado.
- A skill específica está em `.agents/skills/ecommerce-domain-invariants/SKILL.md`; leia suas referências relevantes para RF/RN/RNF/RI e contratos.
- Use `index.ts` como fronteira pública, schema próprio e dependências explícitas na composição. Não leia dados privados de outros módulos.
- Não invente autorização a partir de DTOs. Preserve centavos exatos, versões, idempotência, expiração e eventos duráveis.
- Migração aplicada é imutável; mudanças de contrato exigem atualizar consumidores, testes e documentação.
- Teste comportamento público, com PostgreSQL real para transações/concorrência e processo real para recuperação. Execute as verificações pertinentes e reporte o que não foi testado.
- Dados demonstrativos e provedores simulados não comprovam operação em produção. Não publique nem execute pagamentos/envios reais sem solicitação específica.
- Skills adicionais e seu papel estão em `SKILLS_UTILIZADAS.md`. A aplicação roda sem skills ou assistente de IA.
