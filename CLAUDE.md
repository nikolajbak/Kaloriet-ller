# Kaloriedagbog

Personlig kaloriedagbog-PWA med AI-madanalyse, bygget til Nikolaj og hans kæreste (delt konto/app, to brugere). Ingen build-proces — hele appen er én fil.

## Arkitektur

- **`index.html`** — hele klienten. Vanilla JS, ingen framework, ingen bundler. Alt (HTML, CSS, JS) i én fil, af historiske årsager (nem udgivelse via en chat-baseret pipeline — se nedenfor, som nu er overflødig med Claude Code).
- **`sw.js`** — service worker. Håndterer offline-cache og push-notifikationer (`push`/`notificationclick`).
- **`manifest.webmanifest`** — PWA-manifest.
- **`genvej-nikolajbak.shortcut` / `genvej-annepande.shortcut`** — Apple Shortcuts-filer til vægtautomatisering (se nedenfor).
- **Backend: Supabase** (projekt-ref `vhkglrrmkdqrjdhbkgbn`), tabeller (vigtigste): `dagbog` (måltider pr. dag/bruger), `dagbog_indstillinger` (indstillinger pr. bruger, jsonb `data`-kolonne — inkl. `kaekhed`, `navn`, `maal`, `medicin`), `vaegtmaalinger`, `push_abonnenter`, `hemmeligheder` (**en VIEW over `vault.decrypted_secrets`** — skriv aldrig direkte til den, brug `vault.create_secret()`).
- **Edge functions:** `daglig-paamindelse` (aften-check-in), `medicin-paamindelse` (morgen/aften medicin-reminder, Gemini-genereret).
- **Cron (pg_cron):** `daglig-paamindelse` kl. 18:00 UTC, `medicin-paamindelse-0700` hvert 15. min (tjekker selv om noget rammer brugerens valgte klokkeslæt — se "DST og tid" nedenfor).

## Sådan udgives ændringer (opdateret arbejdsgang)

Med Claude Code: **rediger filerne direkte, `git commit`, `git push`.** Ingen patch/diff/checksum-ceremoni nødvendig — den eksisterende `udgivelsespipeline` (beskrevet i chattens hukommelse) var en nødløsning for at redigere en fil uden filadgang, og er overflødig nu.

**Det ene, der stadig skal huskes manuelt ved enhver ændring af `index.html`:** øg `APP_BUILD`-konstanten (nær toppen af filen) med 1. Appen bruger den til selv at opdage, om der findes en nyere version (se `tjekOpdatering()`/`hentNyVersion()`), uafhængigt af git. Glemmes det, opdager klienter ikke ændringen.

For ændringer i edge functions: brug Supabase CLI (`supabase functions deploy <navn>`) eller Supabase MCP-connectoren, hvis den er sat op i Claude Code.

## Vigtig, ikke-åbenlys viden

### tone()-funktionen findes ÉN GANG for meget
Måltidskommentarernes personlighed (`function tone()` i `index.html`) og medicin-påmindelsens tilsvarende funktion i `medicin-paamindelse`-edge-functionen er **bevidst duplikeret kode** — Deno og browserens JS deler ikke kildefiler. Ændres tone-reglerne (fx et nyt niveau, ny kalibrering), **skal begge steder opdateres i hånden**. De er pt. holdt synkrone med de samme tre eksempellinjer i hudløs-reglen.

### Dansk locale bruger PUNKTUM som tidsseparator
`Intl.DateTimeFormat` med `da-DK` og `hour12:false` returnerer `"07.42"`, ikke `"07:42"`. Brug **aldrig** en locale-formatteret streng til tidsberegning — brug `formatToParts()` og læs `hour`/`minute` som rene tal. Ramte os hårdt i medicin-påmindelsens tidsvindue-tjek.

### Gemini 3.x kræver `thinkingConfig: { thinkingBudget: 0 }` — men KUN 3.x
Uden det bruger Gemini 3.x-modeller token-budgettet på intern "tænkning" før selve svaret (tomme/afkortede svar, eller for blødt formulerede svar ift. den ønskede tone). MED det, men sendt til en ældre model (2.x, 1.5) i en fallback-kæde, afviser den ældre model sandsynligvis feltet med en fatal fejl. Løsning: byg request-kroppen **pr. model** i fallback-loopet, og tjek modelnavnets versionsnummer før feltet inkluderes (grov: ≥ 3 med budget 0; detalje: ≥ 2.5 med loft 1024; lite-modeller aldrig). Se `geminiKald()` i `index.html` og den tilsvarende funktion i `medicin-paamindelse`.

### Gemini-kapløb og modelhelbred
`geminiKald()` kører modellisten som et kapløb: første model starter straks, den næste efter 2,5 s (grov) / 5 s (detalje) eller med det samme ved fejl — første svar vinder, og taberne afbrydes (AbortController), så de ikke bruger kvote. Kun én ventetimer ad gangen. Modellernes helbred huskes i `kd:gemini-helbred`: 404 = udelukket 7 dage, 429/5xx/timeout = bagerst i 10 min, afvist tænkefelt (400 der nævner thinking/budget) = kør uden i 7 dage. Gælder alle Gemini-kald, ikke kun analysen.

### iOS/WebKit: `notificationclick` → `clients.openWindow(url)` ignorerer `url` ved koldstart
Kendt, uløst WebKit-bug (nr. 263687): er PWA'en helt lukket, navigerer et tryk på en notifikation IKKE til den adresse, service workeren beder om — den åbner altid til roden. Løsning implementeret: `sw.js` gemmer notifikationens fulde tekst i IndexedDB ved selve `push`-eventet (som fungerer upåvirket), og klienten læser denne database ved hver opstart, uanset hvilken adresse den faktisk blev åbnet på. URL-baseret overlevering (`?paamindelse=...`) er bevaret som ekstra vej for desktop/Android og for tilfældet hvor appen allerede var åben (der bruges `postMessage` til det åbne vindue, fordi `focus()` alene ikke navigerer).

### Push-notifikationer skal bruge `renotify: true`
Samme `tag` hver dag + `renotify: false` betyder, at en ny notifikation erstatter gårsdagens **lydløst**, hvis den ikke er blevet lukket. Rettet i `sw.js`.

### Automatisk registrering (kamera → analyse → gemt, uden tryk)
Slås til i Indstillinger (`S.autoreg`). Erstatter det indbyggede kamera (som altid viser sin egen "Brug foto"-bekræftelse) med et selvbygget live-kamera (`startKamera()`, `getUserMedia`), der selv afgør, hvornår billedet er skarpt og stabilt nok til at udløse optagelsen (kantenergi + frame-til-frame-forskel, klassisk billedbehandling, ingen ML-model). Tærskelværdierne (`MIN_SKARPHED`, `MAKS_BEVAEGELSE`, `STABIL_KRAV`) er **ukalibrerede gæt** — de er aldrig testet mod en rigtig kameraramme, kun kodegennemgået. Forvent at skulle justere dem efter faktisk brug. Et midlertidigt "Analyserer…"-element lægges i dagens liste med det samme (samme `id` opdateres på plads, når analysen er færdig), og en 60-sekunders "Ret"-toast vises bagefter.

### Model-strategi
- Kortere, personligheds-tunge kald (måltidskommentar, "lettere alternativer", "resten af dagen"-forslag) kan med fordel køre på en hurtigere/billigere model — `claude-haiku-4-5-20251001` er brugt til dette pt. (uafhængigt af brugerens valgte model i Indstillinger).
- Foto-analyse og opskriftsgenerering bruger fortsat den model, brugeren selv har valgt (`S.model`) — de har brug for kapaciteten.
- Klienten understøtter to udbydere: Claude (Anthropic, direkte browser-kald med brugerens egen nøgle) og Gemini (samme mønster, egen nøgle). `udbyder()` afgør hvilken.

### Tone-niveauer og grænser
Fire niveauer: kæk → skarp → brutal → hudløs (standard for nye/nulstillede konti). **Fast grænse, som ikke må fjernes uden eksplicit anmodning:** ingen kommentarer nogensinde om krop, vægt, figur eller udseende — kun vaner, undskyldninger og tal. Denne grænse er selve pointen i stilen (inspireret af dansk standup-retorik), ikke en dæmpning af den.

### Vægtautomatisering
Zepp Life/Xiaomi-vægt → Apple Sundhed → en Apple Shortcut (se `.shortcut`-filerne) → webhook til Supabase Edge Function `modtag-vaegt` → `vaegtmaalinger`-tabellen. Se `/projects/.../areas/vaegt-automatisering.md` i den chat-baserede hukommelse for fulde detaljer og overvejede alternativer.

## Ting der IKKE findes længere (fjernet bevidst)
- Lokal sikkerhedskopi-funktion (snapshots, fil-eksport/import, sky-webhook) — fjernet, fordi Supabase nu er den reelle datakilde og gør det redundant.
- Faste, hardcodede "kæk"-formuleringer i AI-prompts — erstattet af neutrale referencer til "den fastlagte tone", så `tone()` alene styrer registret.

## Konventioner
- Alt brugervendt tekst er dansk, uformel, "du"-form.
- Funktions- og variabelnavne er danske (`hentDag`, `gemDag`, `tegnArk`, `nulstilAfledt` osv.) — følg denne konvention i nyt kode.
- Ingen eksterne JS-biblioteker i klienten — hold den sådan medmindre andet aftales eksplicit.
