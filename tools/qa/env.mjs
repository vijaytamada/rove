// Reads the repo-root .env so the QA scripts never hard-code credentials.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");

export const ENV = Object.fromEntries(
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/\s+#.*$/, "")];
    }),
);

/** [email, password] for each seeded account used by the scripts. */
export const ACCOUNTS = {
  admin: [ENV.SEED_ADMIN_EMAIL ?? "admin@rove.local", ENV.SEED_ADMIN_PASSWORD],
  customer: [ENV.SEED_CUSTOMER_EMAIL ?? "customer@rove.local", ENV.SEED_CUSTOMER_PASSWORD],
  manager: ["manager.hyd@rove.local", ENV.SEED_STAFF_PASSWORD],
  employee: ["employee.indiranagar@rove.local", ENV.SEED_STAFF_PASSWORD],
};
