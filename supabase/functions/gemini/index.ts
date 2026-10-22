// Gemini med appens faelles noegle, saa alle kan analysere gratis uden selv at
// skaffe en noegle. Klienten kalder praecis som mod Google — kun roden er
// skiftet: /functions/v1/gemini/models?… og
// /functions/v1/gemini/models/<model>:generateContent.
//
// Kun loggede brugere (et rigtigt brugertegn, ikke den offentlige noegle), og
// kun de to stier, appen bruger — ellers kunne enhver bruge noeglen til alt.
// Noeglen ligger som hemmeligheden GEMINI_API_KEY og naar aldrig klienten.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const NOEGLE = Deno.env.get("GEMINI_API_KEY") ?? "";
const G = "https://generativelanguage.googleapis.com/v1beta";
const MAKS_KROP = 8 * 1024 * 1024;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function svar(status: number, besked: string) {
  return new Response(JSON.stringify({ error: { message: besked } }), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

async function erBruger(req: Request): Promise<boolean> {
  const tegn = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tegn) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON, authorization: `Bearer ${tegn}` },
  });
  if (!r.ok) return false;
  const u = await r.json().catch(() => null);
  return !!u?.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!NOEGLE) return svar(503, "GEMINI_API_KEY mangler");
  if (!(await erBruger(req))) return svar(401, "Log ind for at bruge analysen");

  const url = new URL(req.url);
  const sti = url.pathname.replace(/^.*?\/gemini(?=\/|$)/, "");
  const liste = req.method === "GET" && sti === "/models";
  const kald = req.method === "POST" && /^\/models\/gemini-[\w.-]+:generateContent$/.test(sti);
  if (!liste && !kald) return svar(404, "Ukendt sti");

  let krop: string | undefined;
  if (kald) {
    krop = await req.text();
    if (krop.length > MAKS_KROP) return svar(413, "For stort billede");
  }
  const r = await fetch(`${G}${sti}${liste ? `?pageSize=${url.searchParams.get("pageSize") ?? "200"}` : ""}`, {
    method: req.method,
    headers: { "content-type": "application/json", "x-goog-api-key": NOEGLE },
    body: krop,
    signal: req.signal,
  });
  return new Response(r.body, {
    status: r.status,
    headers: { ...CORS, "content-type": r.headers.get("content-type") ?? "application/json" },
  });
});
