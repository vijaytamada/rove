// node tools/load/prepare.mjs   -> a fresh load database (migrated and seeded) and an empty Redis database 1.
// node tools/load/prepare.mjs --drop   -> removes both again.
import { execFileSync, execSync } from "node:child_process";
import { BACKEND, DATABASE_URL, ENV, LOAD_DB, PG_USER, REDIS_URL, sql } from "./env.mjs";

const drop = process.argv.includes("--drop");
sql(`DROP DATABASE IF EXISTS ${LOAD_DB} WITH (FORCE)`, "postgres");
execFileSync("docker", ["exec", "rove-redis", "redis-cli", "-n", "1", "FLUSHDB"], { stdio: "ignore" });
if (drop) {
  console.log("Load database and Redis database 1 removed.");
  process.exit(0);
}
sql(`CREATE DATABASE ${LOAD_DB} OWNER ${PG_USER}`, "postgres");
const env = { ...process.env, DATABASE_URL, REDIS_URL, SEED_ADMIN_EMAIL: ENV.SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD: ENV.SEED_ADMIN_PASSWORD, SEED_STAFF_PASSWORD: ENV.SEED_STAFF_PASSWORD, SEED_CUSTOMER_PHONE: ENV.SEED_CUSTOMER_PHONE };
execSync("npm run prisma:deploy", { cwd: BACKEND, env, stdio: "inherit", shell: true });
execSync("npm run prisma:seed", { cwd: BACKEND, env, stdio: "inherit", shell: true });
console.log(`\nReady: database ${LOAD_DB}, Redis database 1. Next: node tools/load/server.mjs (in another terminal), then node tools/load/run.mjs setup`);
