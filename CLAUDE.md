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
| Gemini-proxy med appens fælles nøgle | `supabase/functions/gemini/` |
| Aften-check-in | `supabase/functions/daglig-paamindelse/` |
| Medicin-påmindelse morgen/aften (Gemini-genereret) | `supabase/functions/medicin-paamindelse/` |
| Vægt: Zepp Life → Apple Sundhed → Shortcut → webhook | `supabase/functions/modtag-vaegt/`; `genvej-*.shortcut` |

Cron (pg_cron): `daglig-paamindelse` kl. 18:00 UTC; `medicin-paamindelse-0700`
hvert 15. min (tjekker selv, om brugerens klokkeslæt rammes).

## Udrulning

- **Klienten:** rediger, commit, push → GitHub Pages. **Øg `APP_BUILD`**
  (nær toppen af `index.html`) med 1 ved hver ændring af filen. Appen bruger
  den til selv at opdage en nyere version (`tjekOpdatering()`/`hentNyVersion()`);
  glemmes det, opdager klienterne ikke ændringen.
  Klienterne opdaterer selv: HEAD-tjek hvert minut, mens appen er synlig
  (`tjekOpdateringLet()`), og genindlæser straks — eller så snart intet er i
  gang (`optaget()`: ark, indstillinger eller fokus i et felt).
- **Edge-funktioner:** Supabase MCP `deploy_edge_function` med filen fra
  `supabase/functions/<navn>/`. Det MCP ikke kan (fx sletning), klares med
  Supabase CLI (`brew`, logget ind 2026-10-22):
  `supabase functions delete <navn> --project-ref vhkglrrmkdqrjdhbkgbn`. Repoet er
  kilden; commit ændringen sammen med udrulningen. `verify_jwt` skal sættes
  som nu, ellers stopper kaldene:

  | Funktion | `verify_jwt` | Hvorfor |
  |---|---|---|
  | `gemini` | `false` | tjekker selv brugertegnet; videresender kun `/models` og `/models/gemini-…:generateContent` |
  | `modtag-vaegt` | `false` | Shortcut har intet tegn; tjekker selv `x-noegle` mod `vaegt_adgang` |
  | `daglig-paamindelse` | `true` | kaldes kun af pg_cron |
  | `medicin-paamindelse` | `true` | kaldes kun af pg_cron |

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
- **iOS ignorerer manifestets `orientation` og `screen.orientation.lock()`.**
  Appen følger derfor telefonen og skærmbredden (blok »Bred skærm« i
  CSS'en). Fra 760 px deles hver fane i to spalter via `.spalter` med
  `.s-a`/`.s-b` (I dag også `.s-c`); smalt står de under hinanden i samme
  rækkefølge. Ny fane eller nyt afsnit skal placeres i en spalte. At dreje `body`
  tilbage blev rullet tilbage som »forfærdeligt og uelegant«, og skjoldet
  »Vend telefonen« blev skiftet ud med det responsive layout
  (Nikolaj 2026-10-28). Prøv ikke at låse retningen igen.
- **Push skal have `renotify: true`**, ellers erstatter dagens notifikation
  gårsdagens lydløst (samme `tag`).
- **Edge-funktionerne lå kun i Supabase** indtil 2026-10-22, hvor kilden blev
  hentet ind i `supabase/functions/` uændret (`daglig-paamindelse` v3,
  `medicin-paamindelse` v16, `modtag-vaegt` v3). Udrul aldrig en rettelse
  direkte i Supabase uden at committe den.
- **Supabase MCP kan ikke slette edge-funktioner** (2026-10-22). Brug CLI'en
  (se »Udrulning«); sådan blev resten `udgiv` fra den gamle chat-udgivelse
  slettet.

## Konventioner

- Brugervendt tekst: dansk, uformel, du-form.
- Funktions- og variabelnavne på dansk (`hentDag`, `gemDag`, `tegnArk` …).
- Ingen eksterne JS-biblioteker i klienten uden eksplicit aftale.
- Faste »kæk«-formuleringer hører ikke hjemme i prompterne; `tone()` alene
  styrer registret.
- **Tokenforbrugende kørsler ligger uden for Anthropics spidstid** (Nikolaj 2026-10-23): hverdage 05–11 PT ≈ 14–20 dansk tid. En planlagt kørsel, der kalder en model (routine, Actions, pg_cron → edge-funktion), startes ikke man–fre kl. 12:00–18:59 UTC (dækker både sommer- og vintertid); weekenden er fri. Brugerudløste og tidskritiske kørsler (kundebeskeder, ordrer, påmindelser på et fast klokkeslæt) er undtaget. Påmindelserne (Gemini) går ud på faste klokkeslæt og er undtaget; nye planlagte modelkald følger reglen.
