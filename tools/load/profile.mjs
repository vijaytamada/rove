// node tools/load/profile.mjs [seconds=20]
// Samples the CPU of the running load server (start it with LOAD_PROFILE=1) while a load scenario runs in another terminal, then
// prints where the time went: by package, and the heaviest functions. Uses the Node inspector over a WebSocket; no dependencies.
const seconds = Number(process.argv[2] ?? 20);
const list = await (await fetch("http://127.0.0.1:9229/json/list")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg.result);
};
const call = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await call("Profiler.enable");
await call("Profiler.setSamplingInterval", { interval: 200 });
await call("Profiler.start");
console.log(`Profiling for ${seconds}s: run the load now...`);
await new Promise((r) => setTimeout(r, seconds * 1000));
const { profile } = await call("Profiler.stop");
ws.close();

const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((nodeId, i) => self.set(nodeId, (self.get(nodeId) ?? 0) + (dt[i] ?? 0)));
const total = [...self.values()].reduce((a, b) => a + b, 0);

const where = (url) => {
  if (!url) return "(native / V8)";
  const m = url.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[1];
  if (url.startsWith("node:")) return "node internals";
  if (url.includes("/dist/")) return "our code";
  return url.slice(-40);
};
const byPackage = new Map();
const byFunction = new Map();
for (const [nodeId, us] of self) {
  const f = nodes.get(nodeId).callFrame;
  byPackage.set(where(f.url), (byPackage.get(where(f.url)) ?? 0) + us);
  const key = `${f.functionName || "(anonymous)"}  ${f.url.replace(/^.*\/(node_modules|dist)\//, "$1/")}:${f.lineNumber + 1}`;
  byFunction.set(key, (byFunction.get(key) ?? 0) + us);
}
const show = (map, n) =>
  [...map]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .forEach(([k, us]) => console.log(`${((us / total) * 100).toFixed(1).padStart(5)}%  ${k}`));
console.log(`\nBusy time sampled: ${(total / 1e6).toFixed(1)}s of ${seconds}s`);
console.log("\n-- by package --");
show(byPackage, 14);
console.log("\n-- heaviest functions (own time) --");
show(byFunction, 25);
