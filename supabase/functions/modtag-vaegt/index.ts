// Kaloriedagbog · modtag-vaegt (v2)
//
// Tager imod en vaegtmaaling fra en ekstern kilde: enten mit eget simple
// format {"kg": 83.4}, eller — hvis appen sender noget andet — forsoeger den
// et par kendte tredjeparts-formater (Health Auto Export / Health Webhook).
// Genkendes intet, logges den raa krop til vaegt_raalog i stedet for at
// gaette forkert, saa formatet kan laeses af og tilfoejes praecist bagefter.

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function svar(krop: unknown, status = 200) {
  return new Response(JSON.stringify(krop), {
    status, headers: { "Content-Type": "application/json" }
  });
}

// deno-lint-ignore no-explicit-any
function find_kg(o: any): number | null {
  if (o == null) return null;
  if (typeof o === "number" && o > 20 && o < 400) return o;
  if (typeof o !== "object") return null;

  // Mit eget format
  if (typeof o.kg === "number") return o.kg;

  // Health Auto Export: { data: { metrics: [ { name: "weight_body_mass", units, data: [{ qty, date }] } ] } }
  const metrics = o?.data?.metrics;
  if (Array.isArray(metrics)) {
    const m = metrics.find((x: any) =>
      /weight|body_mass|vaegt/i.test(String(x?.name ?? "")));
    const punkt = m?.data?.[m.data.length - 1];
    if (punkt && typeof punkt.qty === "number") {
      const enhed = String(m.units ?? "").toLowerCase();
      return enhed.includes("lb") ? punkt.qty * 0.45359237 : punkt.qty;
    }
  }

  // Generiske gaet paa almindelige feltnavne, i lb konverteres til kg
  for (const [noegle, vaerdi] of Object.entries(o)) {
    if (typeof vaerdi === "number" && /weight|vaegt|kilogram|mass/i.test(noegle)) {
      return /lb|pound/i.test(noegle) ? vaerdi * 0.45359237 : vaerdi;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return svar({ fejl: "Kun POST" }, 405);

  const noegle = req.headers.get("x-noegle") || "";
  if (!noegle) return svar({ fejl: "Mangler x-noegle header" }, 401);

  const { data: adgang } = await db
    .from("vaegt_adgang").select("bruger_id").eq("noegle", noegle).maybeSingle();
  if (!adgang) return svar({ fejl: "Ukendt noegle" }, 401);

  let krop: Record<string, unknown>;
  try { krop = await req.json(); } catch { return svar({ fejl: "Ugyldig JSON" }, 400); }

  const kg = find_kg(krop);
  if (kg == null || !Number.isFinite(kg) || kg < 20 || kg > 400) {
    // Ukendt format — log raat i stedet for at gaette, saa formatet kan laeses af bagefter
    await db.from("vaegt_raalog").insert({ bruger_id: adgang.bruger_id, krop });
    return svar({ ok: false, note: "Format ikke genkendt endnu — logget til gennemsyn" }, 202);
  }

  const dato = typeof krop.dato === "string" && /^\d{4}-\d{2}-\d{2}$/.test(krop.dato as string)
    ? krop.dato as string
    : new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

  const { error } = await db.from("vaegtmaalinger").upsert({
    bruger_id: adgang.bruger_id,
    dato,
    kg: Math.round(kg * 10) / 10,
    kilde: "automatisk"
  }, { onConflict: "bruger_id,dato" });

  if (error) return svar({ fejl: error.message }, 500);
  return svar({ ok: true, dato, kg: Math.round(kg * 10) / 10 });
});
