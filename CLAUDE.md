# Kaloriedagbog

Personlig kaloriedagbog-PWA med AI-madanalyse til Nikolaj og hans kæreste
(to brugere, hver sin konto). Klienten er `index.html` (HTML+JS) og `style.css`, uden build.

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
node test/ui-kontrol.mjs                    # UI-kontrol: fejl, layout, trykflader, kontrast, funktion, skærmbilleder (~5 min)
node test/ui-kontrol.mjs --opdater          # nye referencebilleder efter en bevidst visuel ændring (se dem igennem først)
node test/gemini-test.mjs <billede.jpg>     # måler appens ægte Gemini-kode mod API'et (bruger kvote, ingen asserts)
sh tools/gemini-noegle.sh                   # brugeren lægger GEMINI_API_KEY i Supabase fra udklipsholderen
```

## Arkitektur

| Del | Filer |
|---|---|
| Klienten (HTML, JS) | `index.html` |
| Al CSS (tokens øverst, lys/mørk) | `style.css` — linkes `style.css?v=<APP_BUILD>` |
| UI-kontrol og referencebilleder | `test/ui-kontrol.mjs`, `test/ui-reference/`; CI: `.github/workflows/ui-kontrol.yml` (uden visuel) |
| Offline-cache og push (`push`/`notificationclick`) | `sw.js`, `manifest.webmanifest` |
| Gemini-proxy med appens fælles nøgle | `supabase/functions/gemini/` |
| Aften-check-in | `supabase/functions/daglig-paamindelse/` |
| Medicin-påmindelse morgen/aften (Gemini-genereret) + én fast gentagelse 2 t efter | `supabase/functions/medicin-paamindelse/` |
| Medicinliste, afkrydsning, strimlen på »I dag«, tal på app-ikonet | `index.html` blok »Medicin og kosttilskud« (`normMedicin`, `medDag`, `medhuskHtml`, `tegnMedicinIndst`); badge fra push i `sw.js` |
| Vægt: Zepp Life → Apple Sundhed → Shortcut → webhook | `supabase/functions/modtag-vaegt/` (genvejen ligger ikke i repoet; den bærer en personlig nøgle) |

Cron (pg_cron): `daglig-paamindelse` kl. 18:00 UTC; `medicin-paamindelse-0700`
hvert 15. min (tjekker selv, om brugerens klokkeslæt rammes).

## Udrulning

- **Klienten:** rediger, commit, push → GitHub Pages. **Øg `APP_BUILD`**
  (nær toppen af `index.html`) med 1 ved hver ændring af `index.html` eller `style.css`, **og sæt samme tal i
  `style.css?v=`** (UI-kontrollen fejler ellers). `sw.js` henter `.css` netværk først og gemmer den uden `?v`
  til brug uden net. Appen bruger
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
  `push_abonnenter`, `medicin_taget` (afkrydsning pr. medicindøgn og punkt, RLS på egne rækker;
  `supabase/migrations/20261110120000_medicin_taget.sql`).
- `data.medicin` = `{ morgen/aften: { aktiv, klokkeslaet, sidst_sendt, gentaget }, punkter: [{ id, navn, dosis,
  slot, dage (ISO 1–7), paakraevet }] }`. Den gamle fritekst `beskrivelse` migreres til punkter af `normMedicin()`;
  serveren læser stadig `beskrivelse`, hvis `punkter` mangler.
- **Afkrydsninger ligger ikke i `data`** (Nikolaj 2026-11-10): både `medicin-paamindelse` og andre enheder skriver
  hele `data` tilbage og ville overskrive dem. Klienten har en lokal kø (`kd:medicin-koe`) til uden net.
- `hemmeligheder` er **en VIEW over `vault.decrypted_secrets`** — skriv aldrig
  til den; brug `vault.create_secret()`.
- **Kun inviterede** (Nikolaj 2026-11-03: intet offentligt): Auth-tilmelding er slået fra (`disable_signup`), så
  knappen »Opret« i appen afvises af serveren. En ny bruger inviteres fra Supabase. Interne SQL-funktioner
  (`saet_hemmelighed`, `udgiv_nu`, `rul_tilbage`, `ryd_gamle_resultater`, `kald_*`, `saet_aendret`) kan kun kaldes af
  `postgres`/`service_role`; `find_bruger`, `er_ven`, `mit_hold` kun af `authenticated`. Ændringen ligger kun i
  databasen (kun `medicin_taget` har en migrationsfil i repoet).
- Vægtnøglerne (`vaegt_adgang`) skiftes med `sh tools/skift-vaegtnoegler.sh`, som du selv kører. De gamle stod i
  `genvej-*.shortcut` i repoet til 2026-11-03.
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

- **Medicindøgnet løber 06:00–05:59** (Nikolaj 2026-11-10): en påmindelse »for i dag« aktiveres kl. 06, og kl. 03
  hører til gårsdagen. Reglen står to steder — `medDag()` i `index.html` og i `medicin-paamindelse` — ret begge.
  Regn på kalenderdele, ikke »nu minus 6 timer«; ellers flytter sommertid skiftet en time.
- **Tallet på app-ikonet kan ikke skifte kl. 06 af sig selv:** der findes ingen stille push på iOS. Det sættes,
  når appen åbnes, og når en medicin-push lander (`badge` i payloaden → `sw.js`).

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
