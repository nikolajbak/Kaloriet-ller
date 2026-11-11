# Redesign af Kaloriedagbog: navigation, skærme og fundament

Godkendt i dialog med Nikolaj 2026-11-10/11. Prioritet: B (navigation) → C (skærme) → A (fundament); A bygges
løbende, fordi B og C står på det. Registreringsflowet (kamera, analyse-ark) er uden for scope ud over ny stil.

## Brugen, designet bygger på

Relativ hyppighed oplyst af Nikolaj: registrere måltid 10 · vægt 2 · medicin 1 · se »I dag« 1 · historik/trends 1 ·
indstillinger 0 · dyst 0. Begge vejer sig dagligt. Konsekvens: registrering skal sidde under tommelfingeren; alt
andet må ligge længere væk.

## B. Navigation

- **Bundbjælke** fast i bunden (safe area): faner `I dag` og `Udvikling` med en stor kameraknap imellem.
  `S.skaerm` ∈ {`idag`, `udvikling`}; den eksisterende glideanimation bevares. Rigtig `tablist`/`tab`-semantik.
- **Kameraknap:** tryk = som »Tag billede« i dag (`startKamera()` ved `S.autoreg`, ellers `#fil`). Langt tryk =
  »Skriv det«. »+ Skriv et måltid« står desuden synligt under måltiderne.
- **Tidligere dage på I dag:** ‹ › ved datoen skifter `S.visDag`, og den viste dag sættes som `S.maalDag`
  (findes allerede, `maalDag()`); arket forudfyldes med dagens dato og 12.00 (`standardTid()`), begge kan rettes.
  På en tidligere dag vises »Registrerer på <dato>« over bundbjælken og knappen »Til i dag«. › er deaktiveret på
  i dag. Ingen strygebevægelse til dagskift (kolliderer med stryg-for-at-slette).
- **Indstillinger:** tandhjulsikon øverst til højre erstatter tekstlinket.
- **Bred skærm (≥ 760 px):** bundbjælken centreres med maksimal bredde; `.spalter` bevares.

## C1. I dag

- Medicin-strimlen øverst (uændret logik, ny chip-stil).
- Stort tal (Georgia, 64 px) med »kcal tilbage«; »mål 2.200« ved tallet åbner målet som i dag.
- Fremdriftsbjælken viser kalorier under analyse som skraveret segment (erstatter teksten »ca. X under analyse«).
- Makro som tre felter (protein, kulhydrat, fedt). Ingen makromål.
- Måltider: dagens sum ved overskriften; kcal i sans-serif; kommentar op til 2 linjer (fuld i ret-arket);
  tryk = ret, stryg = slet (uændret). Analyserende post: blødt pulserende felt i stedet for mørkt skjold; groft
  skøn med »ca.«.
- »Hvad kan jeg spise nu« bliver en sekundær knap med ikon.
- Fodnoten om estimater flytter til analyse-arket.
- Tom dag: »Intet registreret endnu« med pil mod kameraknappen.
- Alkohol: uændret logik, ny kortstil.

## C2. Udvikling

Samler Vægt, Historik og Trends. Rækkefølge:

1. **Én periodevælger** (7 d · 30 d · 90 d · 1 år) styrer alle grafer og mønstre og erstatter både Historiks
   Dag/Uge/Måned og Trends' 7/30/90.
2. **Vægtkort:** seneste vejning, fremdrift mod mål, kg tilbage, estimeret dato, graf og nøgletal (det
   eksisterende). Grafen følger perioden; trendlinjen tegnes kraftigere end målepunkterne. Under 2 vejninger i
   perioden: »For få vejninger i perioden«. Vejningslisten flyttes til arket »Alle vejninger«; »+ Vej« registrerer
   manuelt. Teksten uden vejninger omformuleres, så den ikke fraråder daglig vejning.
3. **Kalorier:** snit pr. dag mod mål og søjlegraf. Opløsning: dage (7 d, 30 d), uger (90 d), måneder (1 år). Tryk
   på en dagsøjle åbner dagen på I dag (via `S.visDag`); tryk på uge/måned zoomer ind.
4. **Mønstre:** ét kort med Kilder, Højdespringere, Gengangere, Alkohol, Indhold der går igen; fælles
   overskriftsstil, top 3 + »vis flere«.
5. **Vurdering af kosten:** »Lettere alternativer« og »Kost og tilskud« som rækker, der åbner et ark. AI-kald kun
   ved tryk (uændret).
6. **Dysten** nederst, uændret funktion; ikke logget ind = én linje i stedet for den store boks.

## C3. Indstillinger

- Ark med gruppeliste og undersider (‹ tilbage): **Dig og dine mål** (navn, mål, profil, målvægt) · **Tone og
  registrering** (tone, autoreg, alkohol) · **Medicin og kosttilskud** · **Konto og notifikationer** ·
  **Avanceret** (udbyder, nøgler, model, Unsplash, kodelås, søg opdatering, slet data). Øverst navn og mål; nederst
  build og forbrug.
- **Automatisk gem, ingen Gem-knap:** tekst/tal ved `change`/blur, vælgere og kontakter straks; kort »Gemt«.
- Farlige handlinger nederst i Avanceret, røde, med bekræftelse som i dag.
- Alle felter og forklaringer bevares, herunder tonegrænsen (aldrig krop, vægt, figur, udseende).

## A. Fundament

- **Farver:** nuværende palette uændret, lys og mørk.
- **Tokens:** afstand 4/8/12/16/24/32; radius 8/12/16/rund; én skygge i lys, kant i mørk.
- **Typografi:** 12/13/15/17/22 + 64 (Georgia, kun det store tal); vægt 400/600; én afsnitsoverskrift (13/600,
  dæmpet, almindelig skrivemåde).
- **Komponenter:** `kort`, `knap` (primær/sekundær/tekst/fare), `felt`, `ark`, `bundbjaelke`, `segment`,
  `raekke`, `chip`.
- **Ikoner:** inline SVG, ens streg (kamera, tandhjul, ‹ ›, plus, blyant). Ingen base64.
- **Tilgængelighed:** trykflader ≥ 44 px, kontrast ≥ AA, `prefers-reduced-motion` respekteres.
- **CSS ud i `style.css`:** linkes `style.css?v=<APP_BUILD>`; `sw.js` matcher den fil uden `ignoreSearch`, og
  `CACHE` skiftes til `kaloriedagbog-skal-4`; `style.css` tilføjes skallen. JS bliver i `index.html`.
  `CLAUDE.md` opdateres.

## UI-kontrol

`test/ui-kontrol.mjs` med den installerede `playwright` og `node:assert`, ingen nye afhængigheder. Testdata
lægges i `localStorage`; alle netkald til Supabase/Google/Anthropic/Unsplash afbrydes.

1. Ingen JS-fejl eller konsolfejl på: I dag, tidligere dag, Udvikling (alle perioder), Indstillinger og hver
   underside, skriv-arket — i lys og mørk, ved 390 og 820 px.
2. Funktion: faneskift; ‹ › skifter dag og `maalDag()`; skriv-arket forudfyldes med den viste dag; autogem
   skriver til `localStorage`; periodevælger skifter alle grafer.
3. Layout: ingen vandret scroll; sidste indhold ender over bundbjælken; synlige knapper ≥ 44 × 44 px; tekst mod
   baggrund ≥ 4,5:1 (≥ 3:1 for ≥ 18,66 px fed / 24 px).
4. Visuel sammenligning mod `test/ui-reference/*.png` (pixeldiff i browserens canvas); `--opdater` skriver nye
   referencer. Køres kun lokalt i containeren (`--uden-visuel` i CI, da skriftgengivelse varierer).

GitHub Actions (`.github/workflows/ui-kontrol.yml`) kører punkt 1–3 på hver PR.

## Udrulning

Faser, hver en hel, fungerende app: (1) fundament + `style.css` + UI-kontrol, uden synlig ændring · (2) navigation ·
(3) I dag · (4) Udvikling · (5) Indstillinger. Pr. fase: `APP_BUILD` +1, UI-kontrol grøn lokalt og i CI, PR
merges af Claude til `main` (Nikolaj 2026-11-11: ingen indblanding), branchen genstartes fra `main`.

## Uden for scope

Registreringsflowet (kamera, analyse-ark, ret-ark) ud over ny stil · makromål · kalendervælger · JS ud af
`index.html` · ændringer i edge-funktioner.
