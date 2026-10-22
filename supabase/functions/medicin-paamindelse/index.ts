// Kaloriedagbog · påmindelse (medicin/kosttilskud) · v8
//
// Kaldes ubetinget hvert 15. minut af cron. Hver bruger kan have et
// morgen- og/eller aften-slot, hver med eget klokkeslæt; funktionen finder
// selv ud af, hvilke slots der rammer det aktuelle 15-minutters vindue, og
// om det allerede er sendt i dag (data.medicin.<slot>.sidst_sendt).
// Indholdet genereres FRISK hver gang via Gemini (gratis niveau) ud fra
// ugedag, årstid og dagbogen. Retry+model-fallback er portet fra klientens
// proev()/gListe()-mekanisme; thinkingBudget:0 fordi Gemini 3.x ellers
// bruger token-budgettet på intern tænkning før selve svaret.
//
// v8: konkrete kalibrerings-eksempler tilføjet til hudløs-niveauet (portet
// fra klientens tone(), samme tre linjer begge steder, saa de ikke driver
// fra hinanden). Abstrakte regler alene kalibrerede ikke intensiteten godt
// nok paa tværs af modeller.
//
// v7: haard, deterministisk efterkontrol af opfundne klokkeslæt. Modellen
// overtraadte engang reglen "opfind aldrig klokkeslæt" (skrev "klokken otte"
// uden grundlag). En instruktion i prompten er ikke en garanti, saa der er
// nu et faktisk tjek: findes et klokkeslaet-udtryk i svaret, som ikke ogsaa
// findes i selve beskrivelsen, forkastes svaret og der proeves igen — og som
// sidste sikkerhedsnet bruges det faste fallback, der aldrig kan opfinde noget.
//
// OBS: brug ALDRIG Intl-formateret tid som streng til beregning — dansk
// locale bruger punktum ("07.42"), ikke kolon, som separator. formatToParts
// bruges i stedet, saa vi faar rene tal direkte uden at parse en streng.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function hemmelighed(navn: string, reserve = ""): Promise<string> {
  const { data } = await db
    .from("hemmeligheder").select("vaerdi").eq("navn", navn).maybeSingle();
  if (data?.vaerdi) return data.vaerdi as string;
  return Deno.env.get(navn.toUpperCase()) ?? reserve;
}

/* ---------- Tid og kontekst ---------- */

function koebenhavnDele(): Record<string, string> {
  const dele = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const ud: Record<string, string> = {};
  for (const d of dele) ud[d.type] = d.value;
  return ud;
}
function koebenhavnDato(offsetDage = 0): string {
  const d = new Date(Date.now() + offsetDage * 86400000);
  const dele = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const o: Record<string, string> = {};
  for (const x of dele) o[x.type] = x.value;
  return o.year + "-" + o.month + "-" + o.day;
}
function ugedagDansk(): string {
  return new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long" }).format(new Date());
}
function aarstid(maaned: number): string {
  if (maaned === 12 || maaned <= 2) return "vinter";
  if (maaned <= 5) return "forår";
  if (maaned <= 8) return "sommer";
  return "efterår";
}
function floor15FraHM(t: number, m: number): number {
  return Math.floor((t * 60 + m) / 15) * 15;
}
function floor15FraStreng(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number); // HTML <input type="time"> er altid "HH:MM"
  return floor15FraHM(h || 0, m || 0);
}

const VINKLER = [
  "Tag udgangspunkt i selve rutinen — hvad der plejer at komme i vejen.",
  "Gå efter glemsomheden som fænomen, ikke som personlig fejl.",
  "Byg videre på ugedagen og hvad den gør ved disciplinen.",
  "Sammenlign med tidligere på dagen eller i går, hvis det findes.",
  "Tag årstiden med — hvad den gør ved motivationen.",
  "Stil et retorisk spørgsmål om hvorfor det først huskes nu.",
  "Gør selve påmindelsen en anelse absurd — appen der minder om piller."
];
function dagensVinkel(): string {
  const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  return VINKLER[doy % VINKLER.length];
}

function tone(kaekhed: string, navn: string): string {
  const n = navn || "brugeren";
  const hudlos = kaekhed === "hudløs";
  const brutal = hudlos || kaekhed === "brutal";
  const skarp = brutal || kaekhed === "skarp";
  let t = "SPROG: skriv korrekt dansk med æ, ø og å.\n\n"
    + "STEMME — dansk standup-register, tørt og observerende:\n"
    + "1. VÆR KONKRET. Nævn tidspunkt, sted eller detalje — det generelle er ikke morsomt.\n"
    + "2. RYTME: korte sætninger blandet med én der løber en anelse for langt.\n"
    + "3. ESKALATION FREM FOR POINTE. Overdrivelsen er selve vitsen.\n"
    + "4. TAL DIREKTE TIL " + n.toUpperCase() + ".\n"
    + "5. TAG DIG SELV MED — det er også lidt latterligt at en telefon minder om piller.\n"
    + "6. INGEN FORKLARING. Ingen emoji. Højst ét udråbstegn.\n";
  t += skarp
    ? "7. VÆR KONTANT. Bandeord (sgu, fandeme, for helvede) sparsomt, hvor de giver rytme.\n"
    : "7. HOLD DEN TØR. Ingen bandeord.\n";
  if (brutal) t += "8. BRUTAL ÆRLIGHED. Ingen indpakning, ingen trøstepræmie.\n";
  if (hudlos) t += "9. UDEN SPROGLIG BEGRÆNSNING. Bandeord og grafisk billedsprog frit, ingen dosering.\n"
    + "Sådan lyder registret helt konkret — kalibrering af intensiteten, aldrig skabeloner der citeres:\n"
    + "– \"For fanden, " + n + ", klokken 23.40 stod du og åd chips direkte fra posen som en vaskebjørn "
    + "der har mistet troen på Gud — og du skrev 'lidt snack' i dagbogen, din skide løgner.\"\n"
    + "– \"Endnu en portion du har 'glemt at veje'? Din hjerne lyver hurtigere, end din krop kan nå at "
    + "tage skade af det — det er sgu imponerende på en trist måde.\"\n"
    + "– \"Tredje 'sidste gang, det her sker' på en uge. Du er ikke et menneske med gode intentioner, "
    + "du er en fucking tidsløkke.\"\n";
  t += "GRÆNSER: aldrig kommentarer om krop, vægt, figur eller udseende. "
     + "Det handler kun om formen, timingen og glemsomheden — aldrig om at det er ligegyldigt at tage det, "
     + "eller at man lige så godt kan springe det over.";
  return t;
}

async function hentKcal(brugerId: string, offsetDage: number): Promise<number | null> {
  const dato = koebenhavnDato(offsetDage);
  const { data } = await db.from("dagbog").select("poster").eq("bruger_id", brugerId).eq("dato", dato).maybeSingle();
  const poster = (data?.poster ?? []) as Array<{ kalorier?: number }>;
  if (!poster.length) return null;
  return Math.round(poster.reduce((a, p) => a + (Number(p.kalorier) || 0), 0));
}

async function hentVaegtudvikling(brugerId: string): Promise<string | null> {
  const { data } = await db.from("vaegtmaalinger").select("dato, kg")
    .eq("bruger_id", brugerId).order("dato", { ascending: false }).limit(8);
  if (!data || data.length < 2) return null;
  const nyeste = Number(data[0].kg), aeldste = Number(data[data.length - 1].kg);
  const diff = nyeste - aeldste;
  if (Math.abs(diff) < 0.2) return "vægten har ligget stille på det seneste";
  return diff < 0
    ? "vægten er faldet " + Math.abs(diff).toFixed(1) + " kg på det seneste"
    : "vægten er steget " + diff.toFixed(1) + " kg på det seneste";
}

/* ---------- Deterministisk kontrol af opfundne klokkeslæt ----------
   En prompt-regel er en anmodning, ikke en garanti. Dette er den faktiske
   garanti: indeholder svaret et klokkeslaet-udtryk ("kl. 8", "klokken otte"),
   som beskrivelsen ikke selv naevner, er svaret opfundet og forkastes. */
const TIDSUDTRYK = /\bkl\.?\s*\d{1,2}\b|\bklokken\b/i;
function harOpfundetTid(tekst: string, beskrivelse: string): boolean {
  return TIDSUDTRYK.test(tekst) && !TIDSUDTRYK.test(beskrivelse);
}

/* ---------- Gemini, med model-liste + retry/fallback ---------- */

function modelRang(navn: string): number {
  const n = navn.toLowerCase();
  if (/embedding|aqa|gemma|learnlm|tts|audio|live|image|imagen|veo|vision/.test(n)) return -1;
  if (/latest|preview|exp/.test(n)) return -1;
  const m = n.match(/^gemini-(\d+(?:\.\d+)?)-/);
  if (!m) return -1;
  const v = parseFloat(m[1]) * 10;
  if (/flash-lite/.test(n)) return v + 4;
  if (/flash/.test(n)) return v + 6;
  if (/pro/.test(n)) return v + 2;
  return -1;
}
async function modelListe(noegle: string): Promise<string[]> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": noegle }
  });
  const d = await r.json().catch(() => ({}));
  const liste = ((d.models ?? []) as Array<{ name?: string; supportedGenerationMethods?: string[] }>)
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter((n) => modelRang(n) > 0)
    .sort((a, b) => modelRang(b) - modelRang(a));
  return liste.length ? liste.slice(0, 5) : ["gemini-2.5-flash", "gemini-2.0-flash"];
}
function vent(ms: number) { return new Promise((res) => setTimeout(res, ms)); }

async function etGeminiKald(noegle: string, model: string, prompt: string): Promise<string> {
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": noegle },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 300,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }
  );
  if (!r.ok) {
    const e = new Error("Gemini svarede " + r.status) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  const d = await r.json();
  const raa = d.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  const pakke = JSON.parse(raa);
  return String(pakke.tekst || "").trim();
}
async function geminiMedFallback(noegle: string, liste: string[], prompt: string): Promise<{ tekst: string; model: string }> {
  let sidsteFejl: unknown = null;
  for (let i = 0; i < liste.length; i++) {
    for (let forsoeg = 0; forsoeg < 2; forsoeg++) {
      try {
        const tekst = await etGeminiKald(noegle, liste[i], prompt);
        if (tekst) return { tekst, model: liste[i] };
        throw new Error("tomt svar");
      } catch (e) {
        sidsteFejl = e;
        const s = (e as { status?: number })?.status || 0;
        const mellem = s === 429 || s === 500 || s === 503;
        if (mellem && forsoeg === 0) { await vent(1200); continue; }
        break;
      }
    }
  }
  throw sidsteFejl instanceof Error ? sidsteFejl : new Error("Gemini fejlede");
}

/* Genererer en godkendt tekst, eller returnerer null hvis det opfinder
   klokkeslaet to gange i traek. Forsoeg to bruges en skaerpet, ekstra
   direkte version af prompten — forsoeg tre findes ikke, fallback tager over. */
async function genererGodkendtTekst(
  noegle: string, modeller: string[], grundprompt: string, beskrivelse: string
): Promise<{ tekst: string; model: string } | null> {
  for (let forsoeg = 0; forsoeg < 2; forsoeg++) {
    const prompt = forsoeg === 0
      ? grundprompt
      : grundprompt + "\n\nDIT FORRIGE SVAR BLEV AFVIST, FORDI DET INDEHOLDT ET KLOKKESLÆT, DER IKKE "
        + "STÅR I BESKRIVELSEN. Skriv et helt nyt svar UDEN nogen form for klokkeslæt — hverken som "
        + "tal (\"kl. 8\") eller udskrevet (\"klokken otte\"), medmindre det klokkeslæt bogstaveligt "
        + "står i beskrivelsen.";
    const svar = await geminiMedFallback(noegle, modeller, prompt);
    if (!harOpfundetTid(svar.tekst, beskrivelse)) return svar;
  }
  return null;
}

/* ---------- Hovedflow ---------- */

type Slot = "morgen" | "aften";
interface SlotData { aktiv?: boolean; klokkeslaet?: string; beskrivelse?: string; sidst_sendt?: string }

Deno.serve(async () => {
  const gNoegle = await hemmelighed("gemini_noegle");
  const vOffentlig = await hemmelighed("vapid_offentlig");
  const vPrivat = await hemmelighed("vapid_privat");
  const vEmne = await hemmelighed("vapid_emne", "mailto:ingen@eksempel.dk");
  if (!gNoegle || !vOffentlig || !vPrivat) {
    return new Response(JSON.stringify({ fejl: "Gemini- eller VAPID-nøgler mangler i Vault" }), { status: 500 });
  }
  webpush.setVapidDetails(vEmne, vOffentlig, vPrivat);

  const { data: indstillinger, error } = await db.from("dagbog_indstillinger").select("bruger_id, data");
  if (error) return new Response(JSON.stringify({ fejl: error.message }), { status: 500 });

  const dele = koebenhavnDele();
  const nuBucket = floor15FraHM(Number(dele.hour), Number(dele.minute));
  const idagDato = koebenhavnDato(0);

  type Kandidat = { bruger_id: string; slot: Slot; navn: string; kaekhed: string; beskrivelse: string };
  const kandidater: Kandidat[] = [];
  for (const r of indstillinger ?? []) {
    const m = (r.data?.medicin ?? {}) as Partial<Record<Slot, SlotData>>;
    (Object.keys(m) as Slot[]).forEach((slot) => {
      const s = m[slot];
      if (!s?.aktiv || !s.beskrivelse || !s.klokkeslaet) return;
      if (floor15FraStreng(s.klokkeslaet) !== nuBucket) return;
      if (s.sidst_sendt === idagDato) return;
      kandidater.push({ bruger_id: r.bruger_id, slot, navn: r.data.navn || "", kaekhed: r.data.kaekhed || "hudløs", beskrivelse: s.beskrivelse });
    });
  }

  if (kandidater.length === 0) {
    return new Response(JSON.stringify({ sendt: 0, note: "ingen slots rammer dette vindue" }), { headers: { "Content-Type": "application/json" } });
  }

  const modeller = await modelListe(gNoegle);
  const ugedag = ugedagDansk(), sæson = aarstid(Number(dele.month)), vinkel = dagensVinkel();

  const idListe = [...new Set(kandidater.map((k) => k.bruger_id))];
  const { data: abonnenter } = await db.from("push_abonnenter").select("endpoint, p256dh, auth, bruger_id").in("bruger_id", idListe);

  let sendt = 0, fejlet = 0, fjernet = 0, forkastet = 0;
  const eksempler: Array<{ bruger_id: string; slot: Slot; tekst: string; model: string }> = [];

  for (const k of kandidater) {
    const erMorgen = k.slot === "morgen";
    const [kcal, vaegtNote] = await Promise.all([
      hentKcal(k.bruger_id, erMorgen ? -1 : 0),
      hentVaegtudvikling(k.bruger_id)
    ]);

    const kontekst = "KONTEKST: det er " + ugedag + " i " + sæson + ", og det er " + (erMorgen ? "morgen" : "aften") + "."
      + (kcal !== null
          ? (erMorgen ? " I går blev der spist " + kcal + " kcal." : " Der er indtil videre spist " + kcal + " kcal i dag.")
          : (erMorgen ? " Der er ikke registreret noget i går." : " Der er ikke registreret noget i dag endnu."))
      + (vaegtNote ? " " + vaegtNote.charAt(0).toUpperCase() + vaegtNote.slice(1) + "." : "");

    const grundprompt = tone(k.kaekhed, k.navn) + "\n\n" + kontekst + "\n\n"
      + "VINKEL TIL DENNE PÅMINDELSE: " + vinkel + "\n\n"
      + "OPGAVE: Skriv ÉN kort påmindelse (højst 18 ord) der minder " + (k.navn || "brugeren")
      + " om at tage det følgende: \"" + k.beskrivelse + "\"\n\n"
      + "REGEL, UDEN UNDTAGELSE: du kender IKKE noget klokkeslæt for dette — kun beskrivelsen ovenfor "
      + "gør. Står der intet klokkeslæt i beskrivelsen, må du ALDRIG nævne et, hverken som tal (\"kl. 8\") "
      + "eller udskrevet (\"klokken otte\") — heller ikke som gæt, antagelse eller for sjov. Det samme "
      + "gælder doser og ekstra piller/kosttilskud, der ikke står i beskrivelsen. "
      + "Ingen sundhedsråd, ingen bivirkningsadvarsler. Kun selve påmindelsen, i tonen ovenfor.\n\n"
      + "FORMAT: svar KUN med gyldig JSON: {\"tekst\": \"...\"}";

    let tekst = "", brugtModel = "fallback";
    try {
      const svar = await genererGodkendtTekst(gNoegle, modeller, grundprompt, k.beskrivelse);
      if (svar){ tekst = svar.tekst; brugtModel = svar.model; }
      else { tekst = (erMorgen ? "God morgen — husk: " : "God aften — husk: ") + k.beskrivelse; forkastet++; }
    } catch {
      tekst = (erMorgen ? "God morgen — husk: " : "God aften — husk: ") + k.beskrivelse;
    }
    eksempler.push({ bruger_id: k.bruger_id, slot: k.slot, tekst, model: brugtModel });

    const mine = (abonnenter ?? []).filter((a) => a.bruger_id === k.bruger_id);
    for (const a of mine) {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          JSON.stringify({ title: erMorgen ? "God morgen" : "God aften", body: tekst, tag: "medicin-" + k.slot, url: "./" })
        );
        sendt++;
      } catch (fejl: unknown) {
        const kode = (fejl as { statusCode?: number })?.statusCode;
        if (kode === 404 || kode === 410) {
          await db.from("push_abonnenter").delete().eq("endpoint", a.endpoint);
          fjernet++;
        } else fejlet++;
      }
    }

    const raekke = (indstillinger ?? []).find((r) => r.bruger_id === k.bruger_id);
    if (raekke) {
      const nyMedicin = { ...(raekke.data.medicin || {}) };
      nyMedicin[k.slot] = { ...(nyMedicin[k.slot] || {}), sidst_sendt: idagDato };
      await db.from("dagbog_indstillinger").update({ data: { ...raekke.data, medicin: nyMedicin } }).eq("bruger_id", k.bruger_id);
    }
  }

  return new Response(JSON.stringify({ kandidater: kandidater.length, modeller, sendt, fejlet, fjernet, forkastet, eksempler }), {
    headers: { "Content-Type": "application/json" }
  });
});
