// A small load generator with no dependencies: closed-loop virtual users (each does a request, optionally "thinks", repeats),
// latency percentiles per endpoint label, error classification, and CPU / memory samples of the server process.
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

export const API = process.env.LOAD_API ?? "http://localhost:3031/api/v1";
// With several backend instances the requests are spread over them in turn (what a load balancer would do).
let bases = [API];
let turn = 0;
export const setBases = (list) => {
  bases = list;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const randomInt = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[randomInt(arr.length)];
export { sleep };

/** Percentile of an already sorted array. */
const pct = (sorted, p) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]);

/** Collects the outcome of every request, grouped by label. */
export class Stats {
  constructor() {
    this.labels = new Map();
    this.startedAt = performance.now();
  }

  record(label, status, ms, kind) {
    let l = this.labels.get(label);
    if (!l) this.labels.set(label, (l = { lat: [], status: new Map(), kinds: { ok: 0, expected: 0, limited: 0, unexpected: 0, serverError: 0, network: 0 } }));
    l.lat.push(ms);
    l.status.set(status, (l.status.get(status) ?? 0) + 1);
    l.kinds[kind]++;
  }

  summary(seconds) {
    const rows = [];
    const all = [];
    const total = { ok: 0, expected: 0, limited: 0, unexpected: 0, serverError: 0, network: 0 };
    for (const [label, l] of [...this.labels].sort()) {
      const sorted = [...l.lat].sort((a, b) => a - b);
      all.push(...l.lat);
      for (const k of Object.keys(total)) total[k] += l.kinds[k];
      rows.push({
        label,
        count: sorted.length,
        rps: +(sorted.length / seconds).toFixed(1),
        p50: +pct(sorted, 50).toFixed(1),
        p95: +pct(sorted, 95).toFixed(1),
        p99: +pct(sorted, 99).toFixed(1),
        max: +(sorted.at(-1) ?? 0).toFixed(1),
        ...l.kinds,
        status: Object.fromEntries([...l.status].sort()),
      });
    }
    const sortedAll = all.sort((a, b) => a - b);
    return {
      rows,
      total: {
        count: sortedAll.length,
        rps: +(sortedAll.length / seconds).toFixed(1),
        p50: +pct(sortedAll, 50).toFixed(1),
        p95: +pct(sortedAll, 95).toFixed(1),
        p99: +pct(sortedAll, 99).toFixed(1),
        ...total,
      },
    };
  }
}

/**
 * One request. `expect` lists the non-2xx statuses that are a normal outcome here (e.g. 409 when two people want the same
 * scooter); any other 4xx is "unexpected", 429 is "limited", 5xx and dropped connections are errors.
 */
export async function request(stats, label, method, path, { token, body, headers = {}, expect = [], base = bases[turn++ % bases.length], timeoutMs = 30_000 } = {}) {
  const started = performance.now();
  let status = 0;
  let data = null;
  let kind;
  try {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = res.status;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    kind = status >= 500 ? "serverError" : status === 429 ? "limited" : status < 300 ? "ok" : expect.includes(status) ? "expected" : "unexpected";
  } catch {
    kind = "network";
  }
  stats.record(label, status, performance.now() - started, kind);
  return { status, data, kind };
}

/** Takes a CPU/memory reading of a Windows or Unix process now. */
function readProc(pid) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("powershell", ["-NoProfile", "-Command", `$p = Get-Process -Id ${pid}; "$($p.CPU) $($p.WorkingSet64)"`], { encoding: "utf8", timeout: 5000 }).trim().split(" ");
      return { cpuSeconds: Number(out[0].replace(",", ".")), rssMb: Number(out[1]) / 1048576 };
    }
    const out = execFileSync("ps", ["-o", "cputimes=,rss=", "-p", String(pid)], { encoding: "utf8" }).trim().split(/\s+/);
    return { cpuSeconds: Number(out[0]), rssMb: Number(out[1]) / 1024 };
  } catch {
    return null;
  }
}

/** Samples the server process while a scenario runs: average and peak CPU (percent of one core) and peak memory. */
export function watchProcess(pidOrPids, everyMs = 2000) {
  const pids = [pidOrPids].flat().filter(Boolean);
  if (pids.length === 0) return { stop: () => null };
  const samples = [];
  // Several instances are added together: CPU as percent of one core (so 200% = two cores busy), memory summed.
  const read = () => {
    const all = pids.map(readProc).filter(Boolean);
    return all.length ? { cpuSeconds: all.reduce((n, p) => n + p.cpuSeconds, 0), rssMb: all.reduce((n, p) => n + p.rssMb, 0) } : null;
  };
  let last = read();
  let lastAt = performance.now();
  const timer = setInterval(() => {
    const now = read();
    const at = performance.now();
    if (now && last) samples.push({ cpu: ((now.cpuSeconds - last.cpuSeconds) / ((at - lastAt) / 1000)) * 100, rssMb: now.rssMb });
    last = now;
    lastAt = at;
  }, everyMs);
  return {
    stop() {
      clearInterval(timer);
      if (samples.length === 0) return null;
      const cpus = samples.map((s) => s.cpu);
      const q = Math.max(1, Math.floor(samples.length / 4));
      const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
      return {
        avgCpuPercent: +mean(cpus).toFixed(0),
        peakCpuPercent: +Math.max(...cpus).toFixed(0),
        peakRssMb: +Math.max(...samples.map((s) => s.rssMb)).toFixed(0),
        // Memory in the first and the last quarter of the run: a steady climb between them is a leak.
        rssFirstQuarterMb: +mean(samples.slice(0, q).map((s) => s.rssMb)).toFixed(0),
        rssLastQuarterMb: +mean(samples.slice(-q).map((s) => s.rssMb)).toFixed(0),
      };
    },
  };
}

/**
 * Runs `vus` virtual users for `seconds`, starting them evenly over `rampSeconds`. Each user calls `vu(ctx)` over and over;
 * `ctx.req(label, method, path, options)` records a request. An exception inside `vu` counts as a "script error".
 */
export async function runScenario({ name, vus, seconds, rampSeconds = 0, thinkMs = 0, vu, serverPid, setup, ipFor }) {
  const stats = new Stats();
  const state = setup ? await setup(stats) : {};
  const watcher = watchProcess(serverPid);
  const cpuBefore = process.cpuUsage();
  const begin = performance.now();
  const end = begin + seconds * 1000;
  let scriptErrors = 0;
  const firstError = { message: null };
  const users = Array.from({ length: vus }, async (_, id) => {
    if (rampSeconds > 0) await sleep((id / vus) * rampSeconds * 1000);
    // `ipFor` gives each virtual user a client address (sent as X-Forwarded-For, which the API trusts behind its proxy).
    const ip = ipFor?.(id);
    const ctx = {
      id,
      ip,
      iter: 0,
      state,
      stats,
      req: (label, method, path, options = {}) => request(stats, label, method, path, ip ? { ...options, headers: { 'X-Forwarded-For': ip, ...options.headers } } : options),
    };
    while (performance.now() < end) {
      try {
        await vu(ctx);
      } catch (e) {
        scriptErrors++;
        firstError.message ??= e instanceof Error ? e.message : String(e);
        await sleep(200);
      }
      ctx.iter++;
      if (thinkMs > 0) await sleep(thinkMs * (0.5 + Math.random()));
    }
  });
  await Promise.all(users);
  const elapsed = (performance.now() - begin) / 1000;
  const cpu = process.cpuUsage(cpuBefore);
  // If this approaches 100% the load generator, not the server, is the limit and the numbers mean little.
  const generatorCpuPercent = Math.round(((cpu.user + cpu.system) / 1e6 / elapsed) * 100);
  return { name, vus, seconds: +elapsed.toFixed(1), generatorCpuPercent, server: watcher.stop(), scriptErrors, firstScriptError: firstError.message, ...stats.summary(elapsed) };
}

const pad = (v, n) => String(v).padStart(n);
export function printReport(r) {
  console.log(`\n== ${r.name}: ${r.vus} virtual users, ${r.seconds}s ==`);
  console.log(`${"endpoint".padEnd(26)}${pad("count", 8)}${pad("req/s", 8)}${pad("p50", 8)}${pad("p95", 8)}${pad("p99", 8)}${pad("max", 9)}${pad("5xx", 6)}${pad("net", 5)}${pad("429", 6)}${pad("4xx!", 6)}  statuses`);
  for (const row of r.rows) {
    console.log(`${row.label.padEnd(26)}${pad(row.count, 8)}${pad(row.rps, 8)}${pad(row.p50, 8)}${pad(row.p95, 8)}${pad(row.p99, 8)}${pad(row.max, 9)}${pad(row.serverError, 6)}${pad(row.network, 5)}${pad(row.limited, 6)}${pad(row.unexpected, 6)}  ${JSON.stringify(row.status)}`);
  }
  const t = r.total;
  console.log(`${"ALL".padEnd(26)}${pad(t.count, 8)}${pad(t.rps, 8)}${pad(t.p50, 8)}${pad(t.p95, 8)}${pad(t.p99, 8)}${pad("", 9)}${pad(t.serverError, 6)}${pad(t.network, 5)}${pad(t.limited, 6)}${pad(t.unexpected, 6)}`);
  if (r.server) console.log(`server process(es): avg CPU ${r.server.avgCpuPercent}% of one core, peak ${r.server.peakCpuPercent}%, peak memory ${r.server.peakRssMb} MB (first quarter ${r.server.rssFirstQuarterMb} MB, last quarter ${r.server.rssLastQuarterMb} MB)`);
  if (r.generatorCpuPercent !== undefined) console.log(`load generator: ${r.generatorCpuPercent}% of one core${r.generatorCpuPercent > 80 ? '  <-- the generator is the bottleneck, results are not trustworthy' : ''}`);
  if (r.scriptErrors) console.log(`script errors: ${r.scriptErrors} (first: ${r.firstScriptError})`);
}

/** Pass/fail: no server errors, no dropped connections, no unexpected 4xx, p95 under the limit. */
export function judge(r, { p95Ms = 500, allowLimited = false } = {}) {
  const t = r.total;
  const problems = [];
  if (t.serverError) problems.push(`${t.serverError} server errors (5xx)`);
  if (t.network) problems.push(`${t.network} dropped or timed-out requests`);
  if (t.unexpected) problems.push(`${t.unexpected} unexpected 4xx answers`);
  if (r.scriptErrors) problems.push(`${r.scriptErrors} script errors: ${r.firstScriptError}`);
  if (!allowLimited && t.limited) problems.push(`${t.limited} rate-limited answers (429)`);
  if (t.p95 > p95Ms) problems.push(`overall p95 ${t.p95} ms is over ${p95Ms} ms`);
  return problems;
}
