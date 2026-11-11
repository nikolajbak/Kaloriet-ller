// UI-kontrol: koerer appen i Chromium med fast testdata og fast ur og tjekker
// fejl, layout, trykflader, kontrast, funktion og (lokalt) skaermbilleder.
//   node test/ui-kontrol.mjs                 alt
//   node test/ui-kontrol.mjs --uden-visuel   uden billedsammenligning (CI)
//   node test/ui-kontrol.mjs --opdater       gem nye referencebilleder
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROD = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = join(ROD, "test", "ui-reference");
const OPDATER = process.argv.includes("--opdater");
const VISUEL = !process.argv.includes("--uden-visuel");
const NU = new Date("2026-11-11T13:00:00Z"); // onsdag 14:00 dansk tid
const MAKS_DIFF = 0.003;

/* Kendte fund i den gamle brugerflade, som en senere fase retter. Moenstre mod
   "skaerm:regel:beskrivelse". Fjern linjen, naar fasen er lavet. */
const KENDT = [
  /:trykflade:(b-indst|I dag|Vægt|Historik|Trends) \d+×(38|43)$/,          // fase 2: navigation
  /^(idag|fejring)@\d+:trykflade:.+ \d+×43$/,                               // fase 3: I dag (maaltidsraekker, maal-link)
  /:trykflade:(Dag|Uge|Måned|7 dage|30 dage|90 dage) \d+×38$/,             // fase 4: periodevaelgere
];

/* ---------- Testdata ---------- */
function dag(forskydning){
  const d = new Date(NU); d.setUTCDate(d.getUTCDate() + forskydning);
  return d.toISOString().slice(0, 10);
}
function maaltid(id, tid, navn, kategori, kcal, p, k, f, kommentar){
  return { id, tid, navn, kategori, kalorier:kcal, protein_g:p, kulhydrat_g:k, fedt_g:f, kommentar: kommentar || "" };
}
export function testdata(){
  const data = {
    "kd:navn": "Nikolaj", "kd:maal": "2200", "kd:auto-reg": "0",
    "kd:profil": JSON.stringify({ hoejde:182, alder:41, maalvaegt:80 }),
    "kd:fejret": dag(-1),  // ellers daekker lykønskningen for i gaar alt
  };
  data["kd:dag:" + dag(0)] = JSON.stringify([
    maaltid("a", "08.12", "Havregryn med banan", "Brød & korn", 420, 14, 70, 9, "Solid start. Ingen undskyldninger nødvendige."),
    maaltid("b", "12.40", "Rugbrød med æg og laks", "Kød & fisk", 610, 34, 45, 28),
    maaltid("c", "15.05", "Cappuccino og kanelsnegl", "Kage & bagværk", 480, 9, 60, 22, "Kanelsneglen var ikke en belønning. Det var en vane, og det ved du godt."),
  ]);
  for (let i = 1; i <= 20; i++){
    data["kd:dag:" + dag(-i)] = JSON.stringify([
      maaltid("m" + i, "08.00", "Skyr med müsli", "Mejeri & æg", 380, 25, 50, 8),
      maaltid("f" + i, "12.30", "Pastasalat", "Kartofler, ris & pasta", 650 + (i % 5) * 60, 22, 80, 24),
      maaltid("a" + i, "19.00", "Kylling i karry med ris", "Kød & fisk", 780 + (i % 3) * 90, 45, 85, 26),
    ]);
  }
  const vaegte = {};
  for (let i = 0; i < 30; i++) vaegte[dag(-i)] = (86.4 - (29 - i) * 0.07 + ((i * 7) % 5 - 2) * 0.15).toFixed(1);
  data["kd:vaegte"] = JSON.stringify(vaegte);
  return data;
}

/* ---------- Server ---------- */
const TYPER = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".css":"text/css",
  ".png":"image/png", ".json":"application/json", ".webmanifest":"application/manifest+json", ".txt":"text/plain" };
function startServer(){
  const srv = createServer(async (req, res) => {
    let sti = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (sti.endsWith("/")) sti += "index.html";
    try {
      const fil = await readFile(join(ROD, sti));
      res.writeHead(200, { "content-type": TYPER[extname(sti)] || "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : fil);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv)));
}

/* ---------- Hjaelpere ---------- */
const fund = [];
let antalTjek = 0;
function rapport(skaerm, regel, besked){
  antalTjek++;
  const noegle = skaerm + ":" + regel + ":" + besked;
  if (KENDT.some(m => m.test(noegle))) return;
  fund.push(noegle);
}
function bekraeft(betingelse, skaerm, regel, besked){
  antalTjek++;
  if (!betingelse) rapport(skaerm, regel, besked); else antalTjek--;
}

let browser, base;
export async function aabn({ skema = "light", bredde = 390, data = testdata(), foer } = {}){
  const kontekst = await browser.newContext({
    viewport: { width: bredde, height: 844 }, colorScheme: skema, locale: "da-DK",
    timezoneId: "Europe/Copenhagen", serviceWorkers: "block", reducedMotion: "reduce",
  });
  await kontekst.route(/supabase|googleapis|anthropic|unsplash|generativelanguage/, r => r.abort());
  const side = await kontekst.newPage();
  side.setDefaultTimeout(8000);
  side.fejl = [];
  side.on("pageerror", e => side.fejl.push("pageerror: " + e.message));
  side.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) side.fejl.push("console: " + m.text()); });
  await side.clock.setFixedTime(NU);
  await side.addInitScript(() => { let x = 42; Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647); });
  await side.addInitScript(d => { if (!sessionStorage.getItem("ui-klar")){ localStorage.clear(); for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem("ui-klar", "1"); } }, data);
  if (foer) await foer(side);
  await side.goto(base);
  await side.waitForTimeout(400);
  return side;
}

async function tjekFejl(side, navn){
  for (const f of side.fejl) rapport(navn, "fejl", f);
  side.fejl.length = 0;
}

async function tjekLayout(side, navn){
  const r = await side.evaluate(() => {
    const ud = { vandret: document.documentElement.scrollWidth > innerWidth + 1, smaa: [], skjult: [] };
    const synlig = el => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05; };
    for (const el of document.querySelectorAll("button, [role=button], [role=tab], a[href], input[type=checkbox]")){
      if (!synlig(el) || el.closest("[aria-hidden=true]")) continue;
      if (el.id && document.querySelector('label[for="' + el.id + '"]')) continue; // labelen er trykfladen
      const b = el.getBoundingClientRect();
      // Kun det, der ligger oeverst (ikke elementer under et ark eller en dug)
      const cx = Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2)), cy = b.top + b.height / 2;
      if (cy < 0 || cy > innerHeight) continue;
      const top = document.elementFromPoint(cx, cy);
      if (!top || !(el === top || el.contains(top) || top.contains(el))) continue;
      // Udvidet trykflade via padding/negativ margin tæller med (b er border-box)
      if (b.width < 44 || b.height < 44) ud.smaa.push((el.id || el.textContent.trim().slice(0, 24) || el.className) + " " + Math.round(b.width) + "×" + Math.round(b.height));
    }
    // Indhold bag en fast bundbjælke: rul helt ned og se om sidste synlige tekst ligger over bjælken
    const bund = document.querySelector(".bund, .bundbjaelke");
    if (bund){
      scrollTo(0, document.documentElement.scrollHeight);
      const top = bund.getBoundingClientRect().top;
      const kandidater = [...document.querySelectorAll(".indhold p, .indhold div, .indhold button")]
        .filter(el => synlig(el) && el.children.length === 0 && el.textContent.trim());
      for (const el of kandidater){
        const b = el.getBoundingClientRect();
        if (b.bottom > top + 1 && b.top < innerHeight) ud.skjult.push(el.textContent.trim().slice(0, 30));
      }
      scrollTo(0, 0);
    }
    return ud;
  });
  if (r.vandret) rapport(navn, "layout", "vandret scroll");
  for (const s of r.smaa) rapport(navn, "trykflade", s);
  for (const s of r.skjult) rapport(navn, "bag-bundbjaelke", s);
}

async function tjekKontrast(side, navn){
  const r = await side.evaluate(() => {
    const rgb = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const bag = el => { for (let e = el; e; e = e.parentElement){ const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return c; if (getComputedStyle(e).backgroundImage !== "none") return null; } return rgb(getComputedStyle(document.body).backgroundColor); };
    const ud = [];
    const set = new Set();
    for (const el of document.querySelectorAll("body *")){
      if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const s = getComputedStyle(el); const b = el.getBoundingClientRect();
      if (!b.width || s.visibility === "hidden" || Number(s.opacity) < 0.5 || el.closest("[aria-hidden=true],.skjul,svg,option")) continue;
      if (el.disabled || el.closest("[disabled]")) continue;
      const fg = rgb(s.color), bg = bag(el); if (!fg || !bg) continue;
      const a = fg.a; const blandet = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
      const L1 = lum(blandet), L2 = lum(bg); const k = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const px = parseFloat(s.fontSize); const stor = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 600);
      const krav = stor ? 3 : 4.5;
      if (k < krav){ const t = el.textContent.trim().slice(0, 24); if (!set.has(t)){ set.add(t); ud.push(t + " " + k.toFixed(2)); } }
    }
    return ud;
  });
  for (const s of r) rapport(navn, "kontrast", s);
}

async function sammenlign(side, navn){
  if (!VISUEL) return;
  const billede = await side.screenshot({ fullPage: true });
  const fil = join(REF, navn + ".png");
  if (OPDATER || !existsSync(fil)){ await mkdir(REF, { recursive: true }); await writeFile(fil, billede); return; }
  const ref = await readFile(fil);
  const p = await browser.newPage();
  const andel = await p.evaluate(async ([a, b]) => {
    const ind = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + src; });
    const [x, y] = await Promise.all([ind(a), ind(b)]);
    if (x.width !== y.width || x.height !== y.height) return 1;
    const c = document.createElement("canvas"); c.width = x.width; c.height = x.height;
    const g = c.getContext("2d"); g.drawImage(x, 0, 0); const dx = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(y, 0, 0); const dy = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < dx.length; i += 4){ if (Math.abs(dx[i] - dy[i]) + Math.abs(dx[i+1] - dy[i+1]) + Math.abs(dx[i+2] - dy[i+2]) > 48) n++; }
    return n / (dx.length / 4);
  }, [billede.toString("base64"), ref.toString("base64")]);
  await p.close();
  if (andel > MAKS_DIFF){
    await mkdir(join(ROD, "test", "ui-afvigelser"), { recursive: true });
    await writeFile(join(ROD, "test", "ui-afvigelser", navn + ".png"), billede);
    rapport(navn, "visuel", (andel * 100).toFixed(2) + " % afviger");
  }
}

/* ---------- Skaerme ---------- */
// Hver skaerm: navn og en funktion, der bringer siden derhen fra opstart.
export const skaerme = [
  { navn: "idag", til: async () => {} },
  { navn: "vaegt", til: async s => { await s.click("[data-skaerm=vaegt]"); } },
  { navn: "historik", til: async s => { await s.click("[data-skaerm=historik]"); } },
  { navn: "trends", til: async s => { await s.click("[data-skaerm=trends]"); } },
  { navn: "indstillinger", til: async s => { await s.click("#b-indst"); } },
  { navn: "skriv", til: async s => { await s.click("#b-skriv"); } },
  { navn: "fejring", data: () => { const d = testdata(); delete d["kd:fejret"]; return d; }, til: async () => {} },
];

/* ---------- Funktionstjek ---------- */
export const funktioner = [];

/* ---------- Koersel ---------- */
async function main(){
  const srv = await startServer();
  base = "http://127.0.0.1:" + srv.address().port + "/";
  browser = await chromium.launch();
  try {
    for (const skema of ["light", "dark"]) for (const bredde of [390, 820]) for (const sk of skaerme){
      const navn = sk.navn + "-" + skema + "-" + bredde;
      if (process.env.UI_LOG) console.log("→ " + navn);
      const side = await aabn({ skema, bredde, data: sk.data ? sk.data() : testdata() });
      try {
        await sk.til(side);
        await side.waitForTimeout(500);
        await tjekFejl(side, sk.navn);
        if (skema === "light" || sk.navn !== "skriv"){
          await tjekLayout(side, sk.navn + "@" + bredde);
          await tjekKontrast(side, sk.navn + "@" + skema);
        }
        await sammenlign(side, navn);
      } catch (e){ rapport(sk.navn, "fejl", "kunne ikke vises: " + e.message.split("\n")[0]); }
      await side.context().close();
    }
    for (const f of funktioner){
      const side = await aabn(f.opsaet || {});
      try { await f.tjek(side, (b, besked) => bekraeft(b, f.navn, "funktion", besked)); await tjekFejl(side, f.navn); }
      catch (e){ rapport(f.navn, "funktion", e.message.split("\n")[0]); }
      await side.context().close();
    }
  } finally { await browser.close(); srv.close(); }
  const unikke = [...new Set(fund)];
  if (unikke.length){
    console.log("UI-kontrol: " + unikke.length + " fund\n  " + unikke.join("\n  "));
    process.exit(1);
  }
  console.log("UI-kontrol grøn" + (VISUEL ? (OPDATER ? " (referencer opdateret)" : " (inkl. visuel)") : " (uden visuel)"));
}
main().catch(e => { console.error(e); process.exit(2); });
