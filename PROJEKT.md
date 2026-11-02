# Kaloriedagbog: projektbeskrivelse

Designet af Nikolaj Bak og bygget sammen med Claude Code som kodeassistent. Del af en portefølje på otte systemer
bygget fra september til november 2026.

- App (PWA) til kostregistrering med AI-analyse af måltider ud fra billeder; brugerkonti, data synkroniseret i skyen
- Analysen sker i to faser: et øjeblikkeligt groft skøn fra en hurtig model, derefter en detaljeret analyse af kalorier, protein og fødevaregrupper
- Automatisk registrering, hvor appens eget kamera selv tager billedet, når det er skarpt og stabilt; fejlede analyser prøves automatisk igen
- AI-kommentarer med hukommelse for mønstre i vanerne, forslag til alternativer og til resten af dagen samt opskrifter; tonen kan vælges i fire niveauer
- Kost- og tilskudsvurdering ud fra fødevaregrupper og vitaminer; alkohol vurderet mod Sundhedsstyrelsens anbefalinger
- Vægt hentes automatisk fra en smartvægt via Apple Sundhed og en iOS-genvej; vægtgraf med trend, mål og estimeret dato for at nå målet
- Venner og konkurrence i realtid, påmindelser som push, mørk tilstand, responsivt layout og automatisk opdatering hos brugerne
- Modelvalg med kapløb mellem flere Gemini-modeller, hvor første gyldige svar vinder, og modellernes helbred huskes; brugeren kan også bruge egen Claude-nøgle
- Teknik: Hele klienten i én fil uden build eller eksterne biblioteker, Supabase (Postgres, edge-funktioner i Deno/TypeScript, pg_cron, vault), web push
- 138 commits og over 85 udgivne versioner fra september til oktober 2026; bygget til og brugt af to personer

Teksten spejler afsnittet Projekter i `profil/fakta.md` i `nikolajbak/jobsoegning`, som er sandhedskilden til
ansøgninger. Ændres projektet væsentligt, så ret begge steder (status pr. 2026-11-02).
