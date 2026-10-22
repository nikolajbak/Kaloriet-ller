// Kaloriedagbog · daglig påmindelse
//
// Kaldes af et cron-job i databasen. Nøglerne læses fra Vault, så alt kan
// sættes fra SQL Editor uden at gå ind i Edge Functions.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function hemmelighed(navn: string, reserve = ""): Promise<string> {
  const { data } = await db
    .from("hemmeligheder").select("vaerdi").eq("navn", navn).maybeSingle();
  if (data?.vaerdi) return data.vaerdi as string;
  return Deno.env.get(navn.toUpperCase()) ?? reserve;
}

function iDagDansk(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());
}

function byggBesked(navn: string, pct: number | null) {
  const n = navn ? navn : "";
  if (pct === null) {
    return {
      title: "Dagbogen står tom",
      body: n ? n + ", der er ikke registreret noget i dag." : "Der er ikke registreret noget i dag."
    };
  }
  if (pct < 60) return { title: "Der er plads tilbage", body: Math.round(pct) + " % af dagens mål er brugt." };
  if (pct <= 100) return { title: "Tæt på målet", body: Math.round(pct) + " % brugt. Resten af dagen tæller også." };
  return { title: "Dagen er over målet", body: Math.round(pct) + " % brugt. I morgen er en ny dag." };
}

Deno.serve(async () => {
  const offentlig = await hemmelighed("vapid_offentlig");
  const privat = await hemmelighed("vapid_privat");
  const emne = await hemmelighed("vapid_emne", "mailto:ingen@eksempel.dk");

  if (!offentlig || !privat) {
    return new Response(JSON.stringify({ fejl: "VAPID-nøgler mangler i Vault" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
  webpush.setVapidDetails(emne, offentlig, privat);

  const dag = iDagDansk();

  const { data: abonnenter, error } = await db
    .from("push_abonnenter").select("endpoint, p256dh, auth, bruger_id");

  if (error) {
    return new Response(JSON.stringify({ fejl: error.message }), { status: 500 });
  }
  if (!abonnenter || abonnenter.length === 0) {
    return new Response(JSON.stringify({ dag, sendt: 0, note: "ingen abonnenter" }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  const { data: profiler } = await db.from("profiler").select("id, visningsnavn, brugernavn");
  const navne = new Map<string, string>();
  for (const p of profiler ?? []) navne.set(p.id, p.visningsnavn || p.brugernavn || "");

  const { data: resultater } = await db.from("resultater").select("bruger_id, pct").eq("dag", dag);
  const opslag = new Map<string, number>();
  for (const r of resultater ?? []) opslag.set(r.bruger_id, Number(r.pct));

  let sendt = 0, fjernet = 0;

  for (const a of abonnenter) {
    const pct = opslag.has(a.bruger_id) ? opslag.get(a.bruger_id)! : null;
    const besked = byggBesked(navne.get(a.bruger_id) ?? "", pct);
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify({ title: besked.title, body: besked.body, tag: "daglig", url: "./" })
      );
      sendt++;
    } catch (fejl) {
      const kode = (fejl as { statusCode?: number })?.statusCode;
      if (kode === 404 || kode === 410) {
        await db.from("push_abonnenter").delete().eq("endpoint", a.endpoint);
        fjernet++;
      }
    }
  }

  return new Response(JSON.stringify({ dag, sendt, fjernet }), {
    headers: { "Content-Type": "application/json" }
  });
});
