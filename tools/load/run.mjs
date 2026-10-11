// node tools/load/run.mjs setup                                  create the fixtures (once, after prepare + server)
// node tools/load/run.mjs run <scenario> [--vus 50] [--seconds 30] [--ramp 5] [--think 0] [--p95 500] [--instances N]
// node tools/load/run.mjs verify                                 check the data left behind by write scenarios
// scenarios: browse quote customer-read staff-read telemetry booking ride mixed
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { HERE } from "./env.mjs";
import { setupFixtures } from "./fixtures.mjs";
import { judge, printReport, runScenario, setBases } from "./lib.mjs";
import { SCENARIOS } from "./scenarios.mjs";
import { verifyData } from "./verify.mjs";

const [command, scenarioName, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(
  (command === "run" ? rest : [scenarioName, ...rest].filter(Boolean))
    .join(" ")
    .split("--")
    .filter(Boolean)
    .map((p) => p.trim().split(/\s+/))
    .map(([k, v]) => [k, v ?? "true"]),
);
const num = (k, d) => (flags[k] === undefined ? d : Number(flags[k]));

if (command === "setup") {
  await setupFixtures({ customers: num("customers", 150), vehicles: num("vehicles", 40) });
} else if (command === "verify") {
  process.exit((await verifyData()) ? 0 : 1);
} else if (command === "run") {
  const make = SCENARIOS[scenarioName];
  if (!make) {
    console.error(`Unknown scenario "${scenarioName}". Choose one of: ${Object.keys(SCENARIOS).join(", ")}`);
    process.exit(2);
  }
  const vus = num("vus", 50);
  const seconds = num("seconds", 30);
  // The instances started by server.mjs: requests go to each in turn, and their CPU is added up.
  const instancesFile = resolve(HERE, ".run/instances.json");
  const instances = existsSync(instancesFile) ? JSON.parse(readFileSync(instancesFile, "utf8")) : [];
  const use = Math.min(instances.length || 1, num("instances", instances.length || 1));
  // --only K sends everything to the Kth instance (1-based): for running several generators side by side.
  const chosen = flags.only ? [instances[Number(flags.only) - 1]] : instances.slice(0, use);
  if (instances.length) setBases(chosen.map((i) => `http://localhost:${i.port}/api/v1`));
  const serverPid = chosen.map((i) => i.pid);
  const result = await runScenario({
    name: scenarioName,
    vus,
    seconds,
    rampSeconds: num("ramp", Math.min(10, Math.round(seconds / 4))),
    thinkMs: num("think", 0),
    serverPid,
    ...make({ vus }),
  });
  printReport(result);
  mkdirSync(resolve(HERE, ".run/results"), { recursive: true });
  writeFileSync(resolve(HERE, `.run/results/${scenarioName}-${vus}vu-${Date.now()}.json`), JSON.stringify(result, null, 2));
  const problems = judge(result, { p95Ms: num("p95", 500), allowLimited: flags.limited === "true" });
  if (problems.length) {
    console.log(`\nFAIL: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("\nPASS: no errors, p95 within the limit");
} else {
  console.error("usage: run.mjs setup | run <scenario> [--vus N --seconds S --ramp S --think MS --p95 MS] | verify");
  process.exit(2);
}
