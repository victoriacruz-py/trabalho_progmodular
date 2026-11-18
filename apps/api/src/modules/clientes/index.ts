import {
  Clock,
  Context,
  Role,
  check,
  DomainError,
  text,
  trustedContext,
  authenticated,
} from "../../../../../packages/kernel";
import { Database, lock } from "../../infrastructure/database";
import { migrate } from "../../infrastructure/migrations";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

export interface Cliente {
  id: string;
  nome: string;
  email: string;
}
export interface ClienteEntrada {
  nome: string;
  email: string;
  senha: string;
}
export interface Sessao {
  token: string;
  expiraEm: string;
  csrfToken: string;
}
export interface IClientes {
  cadastrar(dados: ClienteEntrada): Promise<Cliente>;
  autenticar(email: string, senha: string): Promise<Sessao>;
  validarSessao(token: string): Promise<Context>;
  obterContato(
    ctx: Context,
    clienteId: string,
  ): Promise<{ nome: string; email: string }>;
}
export interface SessionControl {
  details(token: string): Promise<{
    cliente: Cliente;
    contexto: Context;
    expiraEm: string;
    csrfToken: string;
  }>;
  revoke(token: string): Promise<void>;
  provision(input: ClienteEntrada, roles: Role[]): Promise<Cliente>;
}
function normalizedEmail(value: string): string {
  const email = text(value, 254).toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  return email;
}
function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}
async function hashPassword(password: string): Promise<string> {
  check(
    typeof password === "string" &&
      password.length >= 12 &&
      password.length <= 1024,
  );
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(password, salt)).toString("hex")}`;
}
async function matches(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  check(salt && key);
  return timingSafeEqual(Buffer.from(key, "hex"), await derive(password, salt));
}
type Account = Cliente & { password_hash: string; roles: Role[] };
function publicClient(row: Account): Cliente {
  return { id: row.id, nome: row.nome, email: row.email };
}
const dummyPassword = hashPassword(randomBytes(32).toString("hex"));
export async function createClientes(
  db: Database,
  clock: Clock,
): Promise<{ api: IClientes; sessions: SessionControl }> {
  await migrate(
    db,
    "clientes",
    "001_initial",
    `CREATE SCHEMA IF NOT EXISTS clientes;
    CREATE TABLE IF NOT EXISTS clientes.accounts(id uuid PRIMARY KEY,nome text NOT NULL,email text NOT NULL UNIQUE,password_hash text NOT NULL,roles text[] NOT NULL);
    CREATE TABLE IF NOT EXISTS clientes.sessions(token_hash text PRIMARY KEY,cliente_id uuid NOT NULL REFERENCES clientes.accounts(id),expires_at timestamptz NOT NULL,csrf_token text NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON clientes.sessions(expires_at);
    CREATE TABLE IF NOT EXISTS clientes.login_attempts(account_key text PRIMARY KEY,failures timestamptz[] NOT NULL,blocked_until timestamptz);`,
  );
  async function cadastrar(
    dados: ClienteEntrada,
    roles: Role[] = ["CLIENTE"],
  ): Promise<Cliente> {
    const nome = text(dados.nome, 120),
      email = normalizedEmail(dados.email),
      hash = await hashPassword(dados.senha);
    try {
      const rows = await db.query<Account>(
        "INSERT INTO clientes.accounts VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), nome, email, hash, roles],
      );
      return publicClient(rows[0]!);
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new DomainError("CONFLITO");
      throw error;
    }
  }
  async function details(token: string) {
    check(typeof token === "string" && token.length <= 200, "NAO_AUTORIZADO");
    const [row] = await db.query<
      Account & { expires_at: Date; csrf_token: string }
    >(
      `SELECT a.*,s.expires_at,s.csrf_token FROM clientes.sessions s JOIN clientes.accounts a ON a.id=s.cliente_id WHERE s.token_hash=$1 AND s.expires_at>$2`,
      [tokenHash(token), clock.now()],
    );
    check(row && row.expires_at > clock.now(), "NAO_AUTORIZADO");
    return {
      cliente: publicClient(row),
      contexto: trustedContext(row.id, row.roles),
      expiraEm: row.expires_at.toISOString(),
      csrfToken: row.csrf_token,
    };
  }
  return {
    api: {
      cadastrar: (dados) => cadastrar(dados),
      async autenticar(email, senha) {
        check(
          typeof senha === "string" && senha.length <= 1024,
          "NAO_AUTORIZADO",
        );
        let normalized: string;
        try {
          normalized = normalizedEmail(email);
        } catch {
          throw new DomainError("NAO_AUTORIZADO");
        }
        const accountKey = tokenHash(normalized);
        const session = await db.transaction(async (tx) => {
          await lock(tx, "clientes:login:" + accountKey);
          const now = clock.now();
          const attempt = (
            await tx.query<{ failures: Date[]; blocked_until: Date | null }>(
              "SELECT failures,blocked_until FROM clientes.login_attempts WHERE account_key=$1",
              [accountKey],
            )
          ).rows[0];
          if (attempt?.blocked_until && attempt.blocked_until > now)
            return null;
          const row = (
            await tx.query<Account>(
              "SELECT * FROM clientes.accounts WHERE email=$1",
              [normalized],
            )
          ).rows[0];
          const correct = await matches(
            senha,
            row?.password_hash ?? (await dummyPassword),
          );
          if (!row || !correct) {
            const failures = (attempt?.failures ?? []).filter(
              (date) => date.getTime() > now.getTime() - 15 * 60_000,
            );
            failures.push(now);
            const blocked =
              failures.length >= 5
                ? new Date(now.getTime() + 15 * 60_000)
                : null;
            await tx.query(
              "INSERT INTO clientes.login_attempts VALUES($1,$2,$3) ON CONFLICT(account_key) DO UPDATE SET failures=$2,blocked_until=$3",
              [accountKey, failures, blocked],
            );
            return null;
          }
          await tx.query(
            "DELETE FROM clientes.login_attempts WHERE account_key=$1",
            [accountKey],
          );
          const token = randomBytes(32).toString("base64url"),
            csrfToken = randomBytes(24).toString("base64url");
          const expiraEm = new Date(
            clock.now().getTime() + 30 * 60_000,
          ).toISOString();
          await tx.query("INSERT INTO clientes.sessions VALUES($1,$2,$3,$4)", [
            tokenHash(token),
            row.id,
            expiraEm,
            csrfToken,
          ]);
          return { token, expiraEm, csrfToken };
        });
        // Reject only after the failed-attempt transaction commits.
        check(session, "NAO_AUTORIZADO");
        return session;
      },
      async validarSessao(token) {
        return (await details(token)).contexto;
      },
      async obterContato(ctx, id) {
        authenticated(ctx);
        check(ctx.actorId === id || ctx.service === "M12", "NAO_AUTORIZADO");
        const [row] = await db.query<Cliente>(
          "SELECT nome,email FROM clientes.accounts WHERE id=$1",
          [id],
        );
        check(row, "NAO_ENCONTRADO");
        return { nome: row.nome, email: row.email };
      },
    },
    sessions: {
      details,
      async revoke(token) {
        await db.query("DELETE FROM clientes.sessions WHERE token_hash=$1", [
          tokenHash(token),
        ]);
      },
      provision: cadastrar,
    },
  };
}
