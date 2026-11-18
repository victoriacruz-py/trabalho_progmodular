# ADR 0002 — Sessão opaca e fronteira HTTP

O PDF define quatro operações de IClientes e contextos confiáveis; não define transporte web. A API usa token aleatório de 256 bits em cookie HttpOnly/SameSite=Lax, armazenando somente seu SHA-256. A expiração é absoluta, de trinta minutos. Senhas usam scrypt com salt aleatório, N=32768, r=8, p=3; a derivação é assíncrona.

O contexto é emitido no servidor e marcado por identidade de objeto. Um JSON com `roles` ou `service` nunca recebe autoridade. O HTTP recupera o contexto da sessão e exige token CSRF para mutações protegidas; origens externas são recusadas. Login inválido e conta bloqueada retornam a mesma resposta. Tentativas são serializadas por e-mail normalizado e seu contador é confirmado antes de retornar falha.

`SessionControl` é uma interface técnica de composição para ler detalhes da sessão, revogar e provisionar equipe. Logout e provisionamento não são apresentados como novas operações de negócio do PDF. O cadastro público sempre atribui CLIENTE. O provisionamento não promove uma conta existente implicitamente.

A lista atual de perfis e o tempo de sessão seguem o documento. Recuperação de senha, MFA, limitação global por origem, rotação operacional e limpeza por retenção não foram acrescentados ao escopo funcional; devem ser definidos antes de uma implantação pública conforme requisitos reais.
