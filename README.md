# E-commerce modular — incremento 1

**Entrega para o grupo:** comece por [ENTREGA_GRUPO.md](ENTREGA_GRUPO.md). A lista de skills está em [SKILLS_UTILIZADAS.md](SKILLS_UTILIZADAS.md).

As skills completas e seus auxiliares estão em `skills/pacote/`. Consulte [instalação e uso](skills/INSTALAR_E_USAR.md); a aplicação continua executável sem skills ou IA.

Loja demonstrativa de produtos de tecnologia, com fundação e quatro módulos do primeiro incremento do PDF: **Clientes e autenticação (M05), Catálogo (M01), Precificação e promoções (M08), Estoque e inventário (M09)**.

TypeScript estrito, Node.js 24.9+, NestJS 12, PostgreSQL 18, React e Vite. Monólito modular: cada módulo controla seu schema e é acessado pelo contrato público do seu `index.ts`. O painel web usa exclusivamente HTTP. Carrinho, checkout, pedidos, pagamento e os demais incrementos ainda não estão implementados.

## Executar localmente

Requisitos: Node.js **24.9 ou posterior na linha 24**, npm e Git. Na primeira instalação, há download das dependências e do PostgreSQL portátil; Docker não é necessário para o modo local.

```powershell
npm ci
npm run dev
```

Abra **http://127.0.0.1:5173**. O comando compila a API, inicia PostgreSQL local, aplica as migrações, prepara seis produtos fictícios e inicia a loja. O acesso de gestão fica em **`.local/dev-credentials.json`**, criado com senha aleatória e ignorado pelo Git. O cadastro na loja cria somente clientes. `Ctrl+C` encerra os processos iniciados pelo comando, preservando os dados. Repita o comando para retomar a loja.

O pacote usa uma instalação normal de Node/npm. Não depende do runtime particular do Codex nem de ferramentas instaladas na máquina do autor.

O PostgreSQL escuta somente em `127.0.0.1:15432`. No Windows, runtime e dados ficam em `%LOCALAPPDATA%/ecommerce-modular/<identificador-do-projeto>` para evitar a incompatibilidade dos binários nativos com caminhos acentuados. `ECOMMERCE_DATA_DIR` permite escolher outro diretório **sem acentos**. O runtime utiliza os binários PostgreSQL 18.4 do pacote `embedded-postgres`; o sufixo beta pertence ao empacotador. Essa alternativa é de desenvolvimento e testes.

### Banco existente ou Docker

Crie `.env` a partir de `.env.example` e ajuste `DATABASE_URL`, ou informe a variável no ambiente. Com `DATABASE_URL` definido, `npm run dev` usa esse banco e não inicia outro. Use um banco dedicado ao projeto. O modo de desenvolvimento prepara dados demonstrativos por interfaces públicas e mantém a carga inicial idempotente.

Para Docker, defina `POSTGRES_PASSWORD`, rode `docker compose up -d`, configure a mesma senha em `DATABASE_URL` e execute:

```powershell
npm run build
npm run db:migrate
$env:SEED_ADMIN_EMAIL = 'gestor@example.test'
$env:SEED_ADMIN_PASSWORD = 'escolha-uma-senha-local-forte'
npm run seed
npm start
# Em outro terminal:
npm run dev:web
```

`npm run db:start` e `npm run db:stop` controlam somente o PostgreSQL portátil de desenvolvimento. Não execute dois controladores sobre o mesmo cluster. Credenciais demonstrativas não devem ser usadas em implantação pública.

## Verificar

```powershell
npm run typecheck
npm run lint:boundaries
npm test
npm run test:web
npx playwright install chromium
npm run test:e2e
npm run build
```

`npm test` compila e cria um cluster PostgreSQL isolado por execução. Alternativamente, `TEST_DATABASE_URL` pode indicar um banco exclusivo de testes, cujo nome precisa conter `test`. Nenhum banco da loja é apagado pelo runner. Clusters locais de teste são encerrados ao final; seus diretórios ficam no cache para diagnóstico. `initdb --no-sync` é usado somente na preparação descartável dos testes; o servidor mantém `fsync` e transações reais.

O teste de navegador prepara seu próprio banco e servidores em portas livres. Inclui desktop e celular, cadastro/login/logout, publicação de produto, preço e estoque, retomada da edição de produtos inativos e cupons, e expiração de ofertas. Relatórios ficam em `playwright-report/` e `test-results/`. O Jest utiliza `--experimental-vm-modules` para consumir os pacotes ESM do NestJS 12; o runtime da aplicação não precisa dessa flag.

## Organização

- `apps/api/src/modules/`: contratos e implementações privadas dos quatro módulos.
- `apps/api/src/infrastructure/`: transações, locks, migrações, outbox, inbox e idempotência.
- `apps/api/src/composition.ts`: composição explícita das dependências.
- `apps/api/src/http.ts`: validação de entradas, cookie, CSRF, erros e rotas.
- `apps/web/`: vitrine e painel de gestão responsivos.
- `packages/kernel/`: tipos compartilhados, autorização e aritmética monetária.
- `tests/`: regras públicas, PostgreSQL, concorrência, recuperação e navegador.
- `docs/`: decisões, contrato HTTP, rastreabilidade, evidências e revisão crítica.

As migrações são imutáveis após aplicação: versão e checksum ficam em `_migrations` no schema proprietário. Mudanças futuras exigem nova versão; nunca edite o SQL já aplicado. A composição inicializa os módulos em ordem e fecha o pool se a inicialização falhar.

## Limites desta entrega

Sessões opacas duram 30 minutos; senhas usam scrypt com salt; cinco falhas em quinze minutos bloqueiam a conta por quinze minutos. Papéis de equipe são provisionados pela composição, não pelo cadastro público. Escritas pelo navegador exigem sessão, papel e CSRF. `NODE_ENV=production` habilita cookie Secure; uma implantação real ainda exige HTTPS, gestão de segredos, backup/restauração e operação monitorada.

Os eventos persistem com a alteração e podem ser reenviados com deduplicação durável. Ainda não há consumidores de Busca, Notificações ou Analytics. Reservas são chamadas internas destinadas a Checkout/Pedidos e não têm endpoint público. A expiração é aplicada no acesso ao estoque; a propagação espontânea à futura Busca será integrada com M07.

A gestão permite retomar produtos ativos ou inativos pelo SKU e cupons pelo código, preservando versões e períodos de promoção. Essas consultas exigem papel GESTOR e são separadas da vitrine pública. A cotação usa o maior desconto elegível por linha, sem acumular promoção e cupom, com centavos inteiros e arredondamento half-up. A vitrine retira preços vencidos antes de renovar a cotação e revalida a oferta ao retornar à aba.

Os testes automatizados não substituem o ensaio completo de carga do PDF (10 mil SKUs, 100 usuários, 15 minutos), a disponibilidade mensal nem a avaliação com pessoas. Consulte `docs/VALIDATION.md` para o que foi efetivamente executado.
