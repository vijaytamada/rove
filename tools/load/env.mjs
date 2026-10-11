// Settings shared by the load tools. The load test never touches the development data: it uses its own Postgres database
// (rove_load) and Redis database (1), on its own port.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const BACKEND = resolve(ROOT, "backend");
export const HERE = dirname(fileURLToPath(import.meta.url));

/** The repo-root .env (seed credentials and the like). */
export const ENV = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/\s+#.*$/, "")];
    }),
);

export const PG_USER = ENV.POSTGRES_USER ?? "rove";
export const PG_PASSWORD = ENV.POSTGRES_PASSWORD ?? "rove";
export const PG_PORT = ENV.POSTGRES_PORT ?? "5442";
export const LOAD_DB = "rove_load";
export const LOAD_PORT = process.env.LOAD_PORT ?? "3031";
export const DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${LOAD_DB}?schema=public`;
export const REDIS_URL = `redis://localhost:${ENV.REDIS_PORT ?? "6389"}/1`;
export const DEVICE_KEY = ENV.TELEMETRY_INGEST_KEY ?? "dev-only-telemetry-ingest-key";

/** Runs a SQL statement in the load database (through the dev Postgres container). */
export function sql(statement, db = LOAD_DB) {
  return execFileSync("docker", ["exec", "rove-postgres", "psql", "-U", PG_USER, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" }).trim();
}
