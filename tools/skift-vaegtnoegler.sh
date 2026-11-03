#!/bin/sh
# Giver hver bruger en ny noegle i vaegt_adgang. De gamle stod i
# genvej-*.shortcut i det offentlige repo (fjernet 2026-11-03). Genvejen var
# aldrig taget i brug, saa intet staar af. Skal genvejen bruges, bygges en ny
# med den nye noegle - og den laegges ikke i repoet.
#   sh tools/skift-vaegtnoegler.sh
# Koeres af dig, ikke af Claude: noegleskift er dit. Bruger Supabase-CLI'ens
# login fra noeglebundtet.
set -e
T=$(security find-generic-password -s "Supabase CLI" -w)
T=${T#go-keyring-base64:}
case "$T" in sbp_*) ;; *) T=$(printf %s "$T" | base64 -d) ;; esac
curl -s -X POST "https://api.supabase.com/v1/projects/vhkglrrmkdqrjdhbkgbn/database/query" \
  -H "Authorization: Bearer $T" -H "content-type: application/json" \
  -d "{\"query\":\"update public.vaegt_adgang set noegle = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') returning bruger_id\"}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(f"{len(d)} noegler skiftet" if isinstance(d,list) else d)'
