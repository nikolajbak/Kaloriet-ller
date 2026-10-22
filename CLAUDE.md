# Kaloriedagbog

Personlig kaloriedagbog-PWA med AI-madanalyse til Nikolaj og hans kæreste
(to brugere, hver sin konto). Hele klienten er én fil uden build.

## Overblik

| | |
|---|---|
| Repo | `nikolajbak/Kaloriet-ller` · lokalt `~/Kaloriet-ller` · direkte på `main` |
| Kører på | GitHub Pages → https://nikolajbak.github.io/Kaloriet-ller/ · Supabase edge-funktioner + pg_cron |
| Data | Supabase `vhkglrrmkdqrjdhbkgbn` (eget projekt, deles ikke) |
| Stack | Vanilla JS, ingen framework, ingen bundler, ingen eksterne JS-biblioteker · funktioner i Deno/TypeScript |
| Betalte API'er | Gemini (standard; appens fælles nøgle eller brugerens egen) · Anthropic (kun med brugerens egen nøgle) |

## Kommandoer

```bash
python3 -m http.server 5173                 # appen lokalt
node test/gemini-test.mjs <billede.jpg>     # måler appens ægte Gemini-kode mod API'et (bruger kvote, ingen asserts)
sh tools/gemini-noegle.sh                   # brugeren lægger GEMINI_API_KEY i Supabase fra udklipsholderen
```

## Arkitektur

| Del | Filer |
|---|---|
| Hele klienten (HTML, CSS, JS) | `index.html` |
| Offline-cache og push (`push`/`notificationclick`) | `sw.js`, `manifest.webmanifest` |
| Gemini-proxy med appens fælles nøgle | `supabase/functions/gemini/` (i repoet) |
| Aften-check-in | edge-funktion `daglig-paamindelse` — **kun i Supabase** |
| Medicin-påmindelse morgen/aften (Gemini-genereret) | edge-funktion `medicin-paamindelse` — **kun i Supabase** |
| Vægt: Zepp Life → Apple Sundhed → Shortcut → webhook | edge-funktion `modtag-vaegt` — **kun i Supabase**; `genvej-*.shortcut` |

Cron (pg_cron): `daglig-paamindelse` kl. 18:00 UTC; `medicin-paamindelse-0700`
hvert 15. min (tjekker selv, om brugerens klokkeslæt rammes).

## Udrulning

- **Klienten:** rediger, commit, push → GitHub Pages. **Øg `APP_BUILD`**
  (nær toppen af `index.html`) med 1 ved hver ændring af filen. Appen bruger
  den til selv at opdage en nyere version (`tjekOpdatering()`/`hentNyVersion()`);
  glemmes det, opdager klienterne ikke ændringen.
- **Edge-funktioner:** Supabase MCP `deploy_edge_function` (CLI'en er ikke
  installeret). `gemini` udrulles med `verify_jwt: false` (den tjekker selv
  brugertegnet) og videresender kun `/models` og
  `/models/gemini-…:generateContent`. Skal en funktion, der kun ligger i
  Supabase, ændres, så hent kilden med `get_edge_function` og læg den i
  `supabase/functions/` først.

## Data og hemmeligheder

- Tabeller: `dagbog` (måltider pr. dag/bruger), `dagbog_indstillinger` (jsonb
  `data`: `kaekhed`, `navn`, `maal`, `medicin` …), `vaegtmaalinger`,
  `push_abonnenter`.
- `hemmeligheder` er **en VIEW over `vault.decrypted_secrets`** — skriv aldrig
  til den; brug `vault.create_secret()`.
- `GEMINI_API_KEY` (Supabase-secret) lægges ind af brugeren med
  `sh tools/gemini-noegle.sh`; Claude håndterer den ikke selv. Lokale nøgler:
  `kd:gemini-noegle`, `kd:udbyder` i browserens storage.

## Model og tone

- **Gemini er standard for alle** (`udbyder()` giver kun `claude`, hvis
  `kd:udbyder` udtrykkeligt er sat). Egen Gemini-nøgle → Google direkte;
  ellers gennem edge-funktionen `gemini` (kræver login, `gAdgang()`).
- Claude kræver brugerens egen Anthropic-nøgle (Indstillinger). Korte,
  personlighedstunge kald (måltidskommentar, alternativer, »resten af dagen«)
  kører på `claude-haiku-4-5-20251001`; foto-analyse og opskrifter på brugerens
  valgte model (`S.model`).
- **Under analysen nævnes motoren aldrig.** `sjovTekst()` roterer hvert 3. sek.
  gennem `SJOVT`; fejltekster siger »Analysen …«, ikke »Gemini …«.
- **Tone:** fire niveauer, kæk → skarp → brutal → hudløs (standard). **Fast
  grænse, som ikke må fjernes uden eksplicit anmodning:** aldrig kommentarer om
  krop, vægt, figur eller udseende — kun vaner, undskyldninger og tal.
- **`tone()` findes to steder med vilje:** i `index.html` og i
  `medicin-paamindelse` (Deno og browseren deler ikke kode). Ændres
  tonereglerne, opdateres begge i hånden.
- **Automatisk registrering** (`S.autoreg`): eget live-kamera (`startKamera()`)
  udløser selv, når billedet er skarpt og stabilt. Tærsklerne `MIN_SKARPHED`,
  `MAKS_BEVAEGELSE`, `STABIL_KRAV` er **ukalibrerede gæt**.

## Faldgruber

- **Dansk locale bruger punktum i klokkeslæt:** `Intl.DateTimeFormat('da-DK')`
  giver `"07.42"`. Regn aldrig på en formateret streng — brug
  `formatToParts()` og læs `hour`/`minute` som tal. Ramte medicin-påmindelsen.
- **Gemini 3.x kræver `thinkingConfig: { thinkingBudget: 0 }` — men kun 3.x.**
  Uden bruges budgettet på tænkning (tomme/afkortede svar); sendt til 2.x/1.5 i
  fallback-kæden afvises feltet fatalt. Byg kroppen pr. model (grov: ≥ 3 med
  budget 0; detalje: ≥ 2.5 med loft 1024; lite-modeller aldrig). Se
  `geminiKald()` og tilsvarende i `medicin-paamindelse`.
- **Gemini-kapløb og modelhelbred:** `geminiKald()` starter næste model efter
  2,5 s (grov) / 5 s (detalje) eller straks ved fejl; første svar vinder,
  taberne afbrydes. Helbred i `kd:gemini-helbred`: 404 = udelukket 7 dage,
  429/5xx/timeout = bagerst i 10 min, afvist tænkefelt = uden i 7 dage.
- **iOS/WebKit: `clients.openWindow(url)` ignorerer `url` ved koldstart**
  (WebKit-bug 263687). `sw.js` gemmer derfor notifikationens tekst i IndexedDB
  ved `push`, og klienten læser den ved hver opstart. `?paamindelse=…` og
  `postMessage` er bevaret til desktop/Android og åben app.
- **Push skal have `renotify: true`**, ellers erstatter dagens notifikation
  gårsdagens lydløst (samme `tag`).
- **Fire af fem edge-funktioner findes kun i Supabase** (tjekket 2026-10-22):
  `daglig-paamindelse`, `medicin-paamindelse`, `modtag-vaegt` og `udgiv` (rest
  fra den gamle chat-udgivelse). Der er ingen versionsstyring af dem.
- **`backup-modtager.gs` er en rest** fra den fjernede sikkerhedskopi (Supabase
  er datakilden); intet i appen kalder den. Drift-oversigten viser den derfor
  som »Google Apps Script«.

## Konventioner

- Brugervendt tekst: dansk, uformel, du-form.
- Funktions- og variabelnavne på dansk (`hentDag`, `gemDag`, `tegnArk` …).
- Ingen eksterne JS-biblioteker i klienten uden eksplicit aftale.
- Faste »kæk«-formuleringer hører ikke hjemme i prompterne; `tone()` alene
  styrer registret.
