#!/bin/sh
# Laegger appens faelles Gemini-noegle fra udklipsholderen ind som
# GEMINI_API_KEY i Supabase, hvor edge-funktionen `gemini` henter den.
# Kopiér noeglen fra aistudio.google.com/apikey (et projekt UDEN fakturering —
# ellers er det ikke gratis), og koer:
#   sh tools/gemini-noegle.sh
# Kraever at Supabase-CLI'en er logget ind (npx supabase login) eller at
# SUPABASE_ACCESS_TOKEN er sat.
set -e
NOEGLE=$(pbpaste | tr -d '[:space:]')
[ -n "$NOEGLE" ] || { echo "Udklipsholderen er tom — kopiér noeglen fra aistudio.google.com/apikey først."; exit 1; }
[ ${#NOEGLE} -le 200 ] || { echo "Udklipsholderen indeholder for meget tekst — kopiér kun noeglen."; exit 1; }

# Virker den? Listen over modeller svarer kun med en gyldig noegle.
SVAR=$(curl -s -o /dev/null -w "%{http_code}" -H "x-goog-api-key: $NOEGLE" \
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1")
[ "$SVAR" = "200" ] || { echo "Gemini afviste det, der ligger i udklipsholderen (HTTP $SVAR). Er det noeglen, der er kopieret?"; exit 1; }

FIL=$(mktemp)
trap 'rm -f "$FIL"' EXIT
chmod 600 "$FIL"
printf 'GEMINI_API_KEY=%s\n' "$NOEGLE" > "$FIL"
npx --yes supabase@latest secrets set --env-file "$FIL" --project-ref vhkglrrmkdqrjdhbkgbn >/dev/null
printf '' | pbcopy
echo "Faerdig: GEMINI_API_KEY er lagt i Supabase, og udklipsholderen er tømt."
