import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
export function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value)
    throw new Error("Configure DATABASE_URL em .env ou use npm run dev.");
  return value;
}
