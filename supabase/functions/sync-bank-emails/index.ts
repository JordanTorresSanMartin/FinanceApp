// Sync de transacciones bancarias: Gmail -> (parseo con reglas) -> Supabase.
// Corre en la nube (Edge Function) agendada por pg_cron, independiente del PC.
// SIN costo de API externa: parsea los correos con reglas/regex deterministas.
//
// Lee los correos de MACH/BCI/BancoEstado de los últimos días, extrae
// monto/comercio/destinatario, categoriza por palabras clave, descarta
// auto-transferencias y cobros fallidos, e inserta en `transactions`
// deduplicando por `email_id` (índice único parcial).
//
// Secrets requeridos (Supabase -> Edge Functions -> Secrets):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
//   FINANCE_USER_ID         (uuid del dueño de las transacciones)
//   CRON_SECRET             (cadena aleatoria; la envía pg_cron en el header)
// Inyectados por Supabase automáticamente:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Opcional:
//   LOOKBACK_DAYS           (default "5")

import { createClient } from "jsr:@supabase/supabase-js@2";

const BANK_SENDERS = [
  "contacto@mail.machbank.cl", // MACH — compras con tarjeta
  "no-reply@mail.machbank.cl", // MACH — transferencias enviadas
  "noreply@somosmach.com", // MACH — transferencias recibidas
  "transferencias@bci.cl", // BCI — transferencias enviadas/recibidas
  "notificaciones@correo.bancoestado.cl", // BancoEstado — cobro pasaje QR
];

// Palabra clave (MAYÚSCULAS) -> categoría. Se evalúa en orden.
const CATEGORY_RULES: [string, string][] = [
  ["PUNTO COPEC", "Bencina"], ["COPEC", "Bencina"], ["SHELL", "Bencina"],
  ["PETROBRAS", "Bencina"], ["ARAMCO", "Bencina"], ["ENEX", "Bencina"], ["TERPEL", "Bencina"],
  ["MINIMARKET", "Alimentación"], ["SUPERMERCAD", "Alimentación"], ["LIDER", "Alimentación"],
  ["JUMBO", "Alimentación"], ["UNIMARC", "Alimentación"], ["TOTTUS", "Alimentación"],
  ["SANTA ISABEL", "Alimentación"], ["ACUENTA", "Alimentación"], ["MERCADO", "Alimentación"],
  ["ALIMENTOS", "Alimentación"], ["RESTAURANT", "Alimentación"], ["SABOR", "Alimentación"],
  ["KFC", "Alimentación"], ["MCDONALD", "Alimentación"], ["DUNKIN", "Alimentación"],
  ["STARBUCKS", "Alimentación"], ["COFFE", "Alimentación"], ["CAFE", "Alimentación"],
  ["PIZZA", "Alimentación"], ["SUSHI", "Alimentación"], ["EXPRESS", "Alimentación"],
  ["AMIPASS", "Alimentación"], ["CHELITA", "Alimentación"],
  ["SALCO", "Salud"], ["CRUZ VERDE", "Salud"], ["AHUMADA", "Salud"], ["FARMACIA", "Salud"], ["CLINIC", "Salud"],
  ["GOOGLE", "Suscripciones"], ["NETFLIX", "Suscripciones"], ["SPOTIFY", "Suscripciones"],
  ["ANTHROPIC", "Suscripciones"], ["CLAUDE", "Suscripciones"], ["OPENAI", "Suscripciones"],
  ["YOUTUBE", "Suscripciones"], ["DISNEY", "Suscripciones"], ["PRIME", "Suscripciones"],
  ["PASAJEBUS", "Transporte"], ["PASAJE", "Transporte"], ["KUPO", "Transporte"], ["UBER", "Transporte"],
  ["CABIFY", "Transporte"], ["DIDI", "Transporte"], ["METRO", "Transporte"],
  ["FALABELLA", "Compras"], ["RIPLEY", "Compras"], ["ALIEXPRESS", "Compras"],
  ["MERCADOLIBRE", "Compras"], ["MALL", "Compras"], ["ZARA", "Compras"],
];

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
// El dueño: cualquier nombre con "torres" + "jordan" se considera cuenta propia.
function isOwner(name: string): boolean {
  const n = norm(name);
  return n.includes("torres") && n.includes("jordan");
}
function parseCLP(s: string | undefined): number {
  if (!s) return 0;
  return parseInt(s.replace(/[^\d.]/g, "").replace(/\./g, ""), 10) || 0;
}
function categoryFor(text: string): string {
  const t = text.toUpperCase();
  for (const [kw, cat] of CATEGORY_RULES) if (t.includes(kw)) return cat;
  return "Otros";
}
// Para transferencias: por defecto "Transferencias", salvo que el destino
// matchee una regla (ej. "Kupo" -> Transporte).
function transferCategory(name: string): string {
  const c = categoryFor(name);
  return c === "Otros" ? "Transferencias" : c;
}

// ── Gmail ────────────────────────────────────────────────────────────────────
async function gmailAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GMAIL_CLIENT_ID")!,
      client_secret: Deno.env.get("GMAIL_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GMAIL_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token error: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token as string;
}

function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return new TextDecoder().decode(Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0)));
}

// deno-lint-ignore no-explicit-any
function extractBody(payload: any): string {
  const find = (p: any, mime: string): string | null => {
    if (!p) return null;
    if (p.mimeType === mime && p.body?.data) return decodeB64Url(p.body.data);
    for (const part of p.parts ?? []) {
      const r = find(part, mime);
      if (r) return r;
    }
    return null;
  };
  const plain = find(payload, "text/plain");
  if (plain) return plain;
  const html = find(payload, "text/html");
  return html ? html.replace(/<[^>]+>/g, " ") : "";
}

interface MailItem {
  email_id: string;
  from: string;
  subject: string;
  date: string; // YYYY-MM-DD (zona Chile)
  body: string;
}

async function fetchBankEmails(token: string, lookbackDays: number): Promise<MailItem[]> {
  const q = `newer_than:${lookbackDays}d (${BANK_SENDERS.map((s) => `from:${s}`).join(" OR ")})`;
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`Gmail list error: ${listRes.status} ${await listRes.text()}`);
  const ids: { id: string }[] = (await listRes.json()).messages ?? [];

  const items: MailItem[] = [];
  for (const { id } of ids) {
    const mRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!mRes.ok) continue;
    const msg = await mRes.json();
    const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
    const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    const date = new Date(Number(msg.internalDate ?? 0) - 4 * 60 * 60 * 1000)
      .toISOString().slice(0, 10); // UTC-4 (Chile)
    const body = extractBody(msg.payload).replace(/\s+/g, " ").trim();
    items.push({ email_id: id, from: h("from").toLowerCase(), subject: h("subject"), date, body });
  }
  return items;
}

// ── Parseo determinista ───────────────────────────────────────────────────────
interface Parsed {
  date: string;
  description: string;
  amount: number;
  type: "gasto" | "ingreso";
  category: string;
  source: string;
}

function parseMail(m: MailItem): Parsed | null {
  const { from, body, subject, date } = m;
  const grab = (re: RegExp) => body.match(re)?.[1]?.trim();

  // MACH — compra con tarjeta
  if (from.includes("contacto@mail.machbank.cl")) {
    const merchant = grab(/Comercio\s+(.+?)\s+Monto/i) ?? "Compra MACH";
    const amount = parseCLP(grab(/Monto CLP\s*\$?\s*([\d.]+)/i) ?? grab(/\$\s*([\d.]+)/));
    if (!amount) return null;
    return { date, description: merchant, amount, type: "gasto", category: categoryFor(merchant), source: "MACH" };
  }

  // MACH — transferencia enviada
  if (from.includes("no-reply@mail.machbank.cl")) {
    const name = grab(/Nombre destinatario\s+(.+?)\s+RUT/i) ?? subject.replace(/.*transferencia a/i, "").trim();
    if (isOwner(name)) return null; // traspaso entre cuentas propias
    const amount = parseCLP(grab(/Monto\s*\$?\s*([\d.]+)/i));
    if (!amount) return null;
    return { date, description: `Transferencia a ${name}`, amount, type: "gasto", category: transferCategory(name), source: "MACH" };
  }

  // MACH — transferencia recibida
  if (from.includes("noreply@somosmach.com")) {
    const name = grab(/transferencia de\s+(.+?)\s+sin costo/i) ?? subject.replace(/.*transferencia de/i, "").trim();
    if (isOwner(name)) return null;
    const amount = parseCLP(grab(/Monto\s*\$?\s*([\d.]+)/i));
    if (!amount) return null;
    return { date, description: `Transferencia de ${name}`, amount, type: "ingreso", category: "Transferencias Recibidas", source: "MACH" };
  }

  // BCI — transferencia (enviada o recibida)
  if (from.includes("transferencias@bci.cl")) {
    if (/Has recibido/i.test(body)) {
      const name = grab(/transferencia de fondos de\s+(.+?)\s+hacia/i) ?? "";
      if (isOwner(name)) return null;
      const amount = parseCLP(grab(/Monto recibido\s*\$?\s*([\d.]+)/i));
      if (!amount) return null;
      return { date, description: name ? `Transferencia de ${name}` : "Transferencia recibida BCI", amount, type: "ingreso", category: "Transferencias Recibidas", source: "BCI" };
    }
    const name = grab(/Nombre del destinatario\s+(.+?)\s+Banco/i) ?? "";
    if (isOwner(name)) return null;
    const amount = parseCLP(grab(/Monto transferido\s*\$?\s*([\d.]+)/i));
    if (!amount) return null;
    return { date, description: name ? `Transferencia a ${name}` : "Transferencia BCI", amount, type: "gasto", category: transferCategory(name), source: "BCI" };
  }

  // BancoEstado — cobro pasaje QR
  if (from.includes("notificaciones@correo.bancoestado.cl")) {
    if (/no se pudo realizar/i.test(body) || /informaci.n cobro pasaje/i.test(subject)) return null; // cobro fallido
    const amount = parseCLP(grab(/cobro por\s*\$?\s*([\d.]+)/i));
    if (!amount) return null;
    return { date, description: "Cobro pasaje QR – BancoEstado (RED)", amount, type: "gasto", category: "Transporte", source: "BancoEstado" };
  }

  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function processAndInsert(
  mails: MailItem[],
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ fetched: number; inserted: number; skipped: number }> {
  if (mails.length === 0) return { fetched: 0, inserted: 0, skipped: 0 };

  const { data: cats, error: catErr } = await supabase.from("categories").select("id,name");
  if (catErr) throw catErr;
  const catId = new Map<string, string>(cats!.map((c: { name: string; id: string }) => [c.name, c.id]));
  const otrosId = catId.get("Otros") ?? null;

  const { data: existing } = await supabase
    .from("transactions").select("email_id").in("email_id", mails.map((m) => m.email_id));
  const seen = new Set((existing ?? []).map((r: { email_id: string }) => r.email_id));

  const rows = [];
  let skipped = 0;
  for (const m of mails) {
    if (seen.has(m.email_id)) continue;
    const p = parseMail(m);
    if (!p) { skipped++; continue; }
    rows.push({
      user_id: userId,
      date: p.date,
      description: p.description,
      amount: p.amount,
      type: p.type,
      category_id: catId.get(p.category) ?? otrosId,
      source: p.source,
      email_id: m.email_id,
    });
  }

  let inserted = 0;
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("transactions")
      .upsert(rows, { onConflict: "email_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    inserted = data?.length ?? 0;
  }
  return { fetched: mails.length, inserted, skipped };
}

Deno.serve(async (req) => {
  if (req.method === "GET") return new Response("ok", { status: 200 });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userId = Deno.env.get("FINANCE_USER_ID")!;

    // Modo Make: email individual enviado directamente en el body
    const body = req.headers.get("content-type")?.includes("application/json")
      ? await req.json().catch(() => null)
      : null;

    if (body?.email_id && body?.from) {
      const mail: MailItem = {
        email_id: String(body.email_id),
        from: String(body.from).toLowerCase(),
        subject: String(body.subject ?? ""),
        date: body.date
          ? String(body.date).slice(0, 10)
          : new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10),
        body: String(body.body ?? "").replace(/\s+/g, " ").trim(),
      };
      const result = await processAndInsert([mail], supabase, userId);
      return Response.json({ ok: true, mode: "make", ...result });
    }

    // Modo cron: fetcha desde Gmail API
    const lookbackDays = Number(Deno.env.get("LOOKBACK_DAYS") ?? "5");
    const token = await gmailAccessToken();
    const mails = await fetchBankEmails(token, lookbackDays);
    const result = await processAndInsert(mails, supabase, userId);
    return Response.json({ ok: true, mode: "cron", ...result });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
