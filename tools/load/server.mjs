// node tools/load/server.mjs   -> starts the BUILT backend (backend/dist, run `npm run build` first) against the load database.
// It runs the way a production process would (compiled, no file watching) but with NODE_ENV=development, because production
// refuses the mock providers. Settings can be overridden from the shell:
//   LOAD_INSTANCES=4        run 4 copies on ports 3031, 3032, ... (the load runner spreads requests over them, like a load balancer)
//   DB_POOL_MAX=20          database connections per instance
//   RATE_LIMIT_ENABLED=true see the per-IP limits under load
//   LOAD_PROFILE=1          open the inspector on 9229 (first instance) for tools/load/profile.mjs
import { spawn } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BACKEND, DATABASE_URL, HERE, LOAD_PORT, REDIS_URL } from "./env.mjs";

const instances = Number(process.env.LOAD_INSTANCES ?? 1);
mkdirSync(resolve(HERE, ".run"), { recursive: true });
const children = [];
for (let i = 0; i < instances; i++) {
  const port = Number(LOAD_PORT) + i;
  const log = openSync(resolve(HERE, `.run/server${i ? `-${i + 1}` : ""}.log`), "w");
  const args = ["--enable-source-maps", ...(process.env.LOAD_PROFILE && i === 0 ? ["--inspect=127.0.0.1:9229"] : []), "dist/main.js"];
  const child = spawn(process.execPath, args, {
    cwd: BACKEND,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      DATABASE_URL,
      REDIS_URL,
      CORS_ORIGIN: "http://localhost:3000",
      // Off by default so the test measures capacity; set RATE_LIMIT_ENABLED=true to see the limits under load.
      RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED ?? "false",
      JOBS_ENABLED: process.env.JOBS_ENABLED ?? "true",
      TELEMETRY_PROVIDER: "mock",
      TRUST_PROXY: process.env.TRUST_PROXY ?? "1",
    },
  });
  children.push({ pid: child.pid, port });
  child.on("exit", (code) => {
    console.log(`instance on port ${port} exited (${code})`);
    if (children.every((c) => c.dead)) process.exit(code ?? 0);
  });
}
writeFileSync(resolve(HERE, ".run/server.pid"), children.map((c) => c.pid).join(","));
writeFileSync(resolve(HERE, ".run/instances.json"), JSON.stringify(children));
console.log(`${instances} backend instance(s): ${children.map((c) => `pid ${c.pid} port ${c.port}`).join(", ")} (logs in tools/load/.run). Ctrl+C stops them.`);
const stop = () => children.forEach((c) => process.kill(c.pid));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
