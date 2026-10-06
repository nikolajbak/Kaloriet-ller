// Tester appens ægte Gemini-kode (analyserGrov / analyser) fra index.html i Node.
// Nøglen kan ligge i test/.noegle (git-ignoreret) eller i GEMINI_API_KEY.
// Brug:  node test/gemini-test.mjs <billede.jpg> [claude-model-ignoreres]
// Nøglen læses kun fra miljøvariablen — den gemmes aldrig i filer.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const nøgleFil = path.join(dir, ".noegle");
const nøgle = process.env.GEMINI_API_KEY || (fs.existsSync(nøgleFil) ? fs.readFileSync(nøgleFil, "utf8").trim() : "");
const billede = process.argv[2];
if (!nøgle || !billede) { console.error("Brug: node test/gemini-test.mjs <billede.jpg>  (nøgle i test/.noegle eller GEMINI_API_KEY)"); process.exit(2); }

const html = fs.readFileSync(path.join(dir, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const kode = scripts.sort((a, b) => b.length - a.length)[0];

const lager = new Map([["kd:udbyder", "gemini"], ["kd:gemini-noegle", nøgle]]);
const stub = () => new Proxy(function () {}, {
  get: (_, k) => k === Symbol.toPrimitive ? () => "" : k === "length" ? 0 : stub(),
  apply: () => stub(), construct: () => stub(), set: () => true,
});
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + " s";
const loggetFetch = async (url, opt) => {
  const kort = String(url).replace(/key=[^&]+/, "key=…").replace(/\?.*/, "");
  console.log(ts(), "→", kort.split("/").slice(-1)[0] || kort);
  try {
    const r = await fetch(url, opt);
    console.log(ts(), "←", r.status, kort.split("/").slice(-1)[0]);
    return r;
  } catch (e) { console.log(ts(), "✗", e.name, e.message); throw e; }
};
const ctx = vm.createContext({
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  AbortController, URL, URLSearchParams, TextEncoder, TextDecoder, fetch: loggetFetch,
  localStorage: { getItem: k => lager.has(k) ? lager.get(k) : null, setItem: (k, v) => lager.set(k, v), removeItem: k => lager.delete(k) },
  document: stub(), window: stub(), navigator: { serviceWorker: undefined, mediaDevices: undefined, userAgent: "node" },
  location: stub(), requestAnimationFrame: f => setTimeout(f, 0), Notification: undefined, indexedDB: undefined,
  Image: function () {}, FileReader: function () {}, HTMLElement: function () {},
});
ctx.self = ctx; ctx.globalThis = ctx;
try { vm.runInContext(kode, ctx, { filename: "index.html" }); }
catch (e) { console.log("(app-opstart stoppede som forventet i Node:", e.message.slice(0, 80) + ")"); }

const b64 = "data:image/jpeg;base64," + fs.readFileSync(billede).toString("base64");
ctx.__b64 = b64;
const kør = async (navn, udtryk) => {
  const s = Date.now();
  try {
    const r = await vm.runInContext(udtryk, ctx);
    console.log(`\n=== ${navn}: OK efter ${((Date.now() - s) / 1000).toFixed(1)} s`);
    console.log(JSON.stringify(r, null, 1).slice(0, 1400));
  } catch (e) { console.log(`\n=== ${navn}: FEJL efter ${((Date.now() - s) / 1000).toFixed(1)} s —`, e.message); }
};
await kør("GROV", "analyserGrov(__b64)");
await kør("DETALJE", "analyser(__b64, '', null, null, maalDag ? maalDag() : '2026-01-01', '12:00', function(t){ console.log('   status:', t); })");
process.exit(0);
