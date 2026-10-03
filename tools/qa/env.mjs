// Reads the repo-root .env so the QA scripts never hard-code credentials.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";

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
  customer: { phone: ENV.SEED_CUSTOMER_PHONE ?? "+919000000001" },
  manager: ["manager.hyd@rove.local", ENV.SEED_STAFF_PASSWORD],
  employee: ["employee.indiranagar@rove.local", ENV.SEED_STAFF_PASSWORD],
};

/** Clears the resend cooldown and hourly send count for a phone (development only). */
export function clearOtpLimits(phone) {
  execSync(`docker exec rove-redis sh -c "redis-cli del otp:cooldown:login:${phone} otp:sends:${phone}"`, { stdio: "ignore" });
}

/** Signs a customer in with phone + the development mock code (clears resend limits first, dev only). */
export async function loginPhone(api, phone) {
  clearOtpLimits(phone);
  const post = (path, body) => fetch(api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await post("/auth/phone/request", { phone });
  const res = await (await post("/auth/phone/verify", { phone, code: "123456" })).json();
  if (!res.accessToken) throw new Error("phone login failed: " + JSON.stringify(res));
  return res.accessToken;
}
