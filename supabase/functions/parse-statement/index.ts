// parse-statement — Estado de cuenta (PDF) -> cuotas en `installments`.
//
// La app sube el PDF como base64. Aquí se extrae el texto con `unpdf` (pdf.js
// sin binarios, corre en Deno), se parsea con reglas deterministas por banco y
// se guardan el encabezado (`statements`) y las compras en cuotas
// (`installments`). De ahí la app arma "Próximos pagos": cuotas con
// installment_current < installment_total. Si el PDF viene cifrado, la app pide
// la contraseña y la reenvía aquí (campo `password`).
//
// Auth: requiere el JWT del usuario (Authorization: Bearer). Inserta con el
// service role pero amarrando user_id al dueño del token.

// @ts-ignore - Deno
declare const Deno: any;

// @ts-ignore - URL imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore - URL imports
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Palabra clave (MAYÚSCULAS) -> categoría. Se evalúa en orden. (Igual criterio
// que sync-bank-emails para mantener consistencia entre fuentes.)
const CATEGORY_RULES: [string, string][] = [
  ["COPEC", "Bencina"], ["SHELL", "Bencina"], ["PETROBRAS", "Bencina"],
  ["ARAMCO", "Bencina"], ["ENEX", "Bencina"], ["TERPEL", "Bencina"],
  ["MINIMARKET", "Alimentación"], ["SUPERMERCAD", "Alimentación"], ["LIDER", "Alimentación"],
  ["JUMBO", "Alimentación"], ["UNIMARC", "Alimentación"], ["TOTTUS", "Alimentación"],
  ["SANTA ISABEL", "Alimentación"], ["ACUENTA", "Alimentación"], ["MERCADO", "Alimentación"],
  ["ALIMENTOS", "Alimentación"], ["RESTAURANT", "Alimentación"], ["SABOR", "Alimentación"],
  ["KFC", "Alimentación"], ["MCDONALD", "Alimentación"], ["DUNKIN", "Alimentación"],
  ["STARBUCKS", "Alimentación"], ["COFFE", "Alimentación"], ["CAFE", "Alimentación"],
  ["PIZZA", "Alimentación"], ["SUSHI", "Alimentación"], ["EXPRESS", "Alimentación"],
  ["UPA", "Alimentación"], ["DONDE PANCHO", "Alimentación"],
  ["SALCO", "Salud"], ["CRUZ VERDE", "Salud"], ["C. VERDE", "Salud"], ["AHUMADA", "Salud"],
  ["FARMACIA", "Salud"], ["CLINIC", "Salud"], ["PSIQUIA", "Salud"], ["PRAPES", "Salud"],
  ["GOOGLE", "Suscripciones"], ["NETFLIX", "Suscripciones"], ["SPOTIFY", "Suscripciones"],
  ["ANTHROPIC", "Suscripciones"], ["CLAUDE", "Suscripciones"], ["OPENAI", "Suscripciones"],
  ["YOUTUBE", "Suscripciones"], ["DISNEY", "Suscripciones"], ["PRIME", "Suscripciones"],
  ["MICROSOFT", "Suscripciones"], ["XBOX", "Suscripciones"],
  ["PASAJEBUS", "Transporte"], ["PASAJE BUS", "Transporte"], ["PASAJE", "Transporte"],
  ["KUPO", "Transporte"], ["UBER", "Transporte"], ["CABIFY", "Transporte"],
  ["DIDI", "Transporte"], ["METRO", "Transporte"], ["PARKING", "Transporte"],
  ["FALABELLA", "Compras"], ["RIPLEY", "Compras"], ["ALIEXPRESS", "Compras"],
  ["MERCADOLIBRE", "Compras"], ["MERCADOPAGO", "Compras"], ["MALL", "Compras"],
  ["ZARA", "Compras"], ["SODIMAC", "Compras"], ["GARAGE", "Compras"],
];

function categoryFor(text: string): string {
  const t = text.toUpperCase();
  for (const [kw, cat] of CATEGORY_RULES) if (t.includes(kw)) return cat;
  return "Otros";
}

// "124.700" / "1.669.293" -> número entero CLP. Maneja signo.
function parseCLP(s: string): number {
  const neg = s.trim().startsWith("-");
  const n = parseInt(s.replace(/[^\d]/g, ""), 10) || 0;
  return neg ? -n : n;
}

// dd/mm/yy o dd/mm/yyyy -> ISO YYYY-MM-DD
function toISO(d: string): string | null {
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${year}-${mm}-${dd}`;
}

interface ParsedInstallment {
  description: string;
  operation_date: string | null;
  total_amount: number;
  monthly_amount: number;
  installment_current: number;
  installment_total: number;
  category: string;
}

interface ParsedStatement {
  bank: string;
  card_last4: string | null;
  statement_date: string | null;
  due_date: string | null;
  total_amount: number;
  minimum_amount: number;
  forecast: { month: string; amount: number }[];
  installments: ParsedInstallment[];
}

// ── Parser BCI (tarjeta de crédito nacional) ──────────────────────────────────
// Las compras en cuotas siempre traen "TASA INT" + N° cuota (NN/NN) + montos,
// terminando en "$$$". Ese es el ancla fiable que las distingue de compras al
// contado (01/01, sin TASA INT).
function parseBCI(text: string): ParsedStatement {
  const card = text.match(/X{4,}(\d{4})/)?.[1] ?? null;

  // Fecha estado de cuenta: dd/mm/yyyy seguida del titular y la tarjeta XXXX.
  // toISO convierte DD/MM/YYYY -> YYYY-MM-DD (Postgres rechaza el formato chileno).
  const stmtDate = toISO(
    text.match(/(\d{2}\/\d{2}\/\d{4})\s+[A-ZÑÁÉÍÓÚ.\s]+?\s+X{4,}/)?.[1] ?? "",
  );
  // Fecha de pago (PAGAR HASTA): aparece duplicada "07/07/202607/07/2026".
  const dueDate = toISO(
    text.match(/(\d{2}\/\d{2}\/\d{4})\d{2}\/\d{2}\/\d{4}/)?.[1] ??
      text.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] ??
      "",
  );

  // Montos del bloque "III. INFORMACIÓN DE PAGO".
  const pay = text.match(
    /MONTO TOTAL FACTURADO A PAGAR\s+MONTO M[IÍ]NIMO A PAGAR\s+COSTO MONETARIO PREPAGO\s*\$?\s*([\d.]+)\s*\$?\s*\$?\s*([\d.]+)\s+([\d.]+)/,
  );
  const totalAmount = pay ? parseCLP(pay[1]) : 0;
  const minimumAmount = pay ? parseCLP(pay[2]) : 0;

  // Vencimiento próximos meses: ACTUAL + 4 meses con sus montos.
  const forecast: { month: string; amount: number }[] = [];
  const fc = text.match(
    /VENCIMIENTO PR[OÓ]XIMOS 4 MESES\s+ACTUAL\s+([A-ZÑ]+)\s+([A-ZÑ]+)\s+([A-ZÑ]+)\s+([A-ZÑ]+)([\s\d.$]+)/,
  );
  if (fc) {
    const months = [fc[1], fc[2], fc[3], fc[4]];
    const nums = (fc[5].match(/\d{1,3}(?:\.\d{3})*/g) ?? []).map(parseCLP);
    // nums[0] = ACTUAL; los 4 siguientes corresponden a los meses.
    for (let i = 0; i < months.length; i++) {
      const amount = nums[i + 1];
      if (amount != null) forecast.push({ month: months[i], amount });
    }
  }

  // Compras en cuotas.
  const installments: ParsedInstallment[] = [];
  // `[^$]+?` evita que la descripción cruce el separador "$$$" de otro registro.
  const re =
    /(\d{2}\/\d{2}\/\d{2})\s+\d{6,}\s+([^$]+?)\s+TASA\s+INT\.?\s+[\d,]+%\s+(\d{2})\/(\d{2})([\d.\- ]+?)\$\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, opDate, descRaw, cur, tot, amountBlob] = m;
    const total = parseInt(tot, 10);
    if (!total || total < 2) continue; // solo cuotas reales
    const nums = (amountBlob.match(/-?\d{1,3}(?:\.\d{3})*/g) ?? []).map(parseCLP);
    if (nums.length < 2) continue;
    const description = descRaw.replace(/\s+/g, " ").trim();
    installments.push({
      description,
      operation_date: toISO(opDate),
      total_amount: nums[0],                 // monto operación
      monthly_amount: nums[nums.length - 1], // valor cuota mensual
      installment_current: parseInt(cur, 10),
      installment_total: total,
      category: categoryFor(description),
    });
  }

  return {
    bank: "BCI",
    card_last4: card,
    statement_date: stmtDate,
    due_date: dueDate,
    total_amount: totalAmount,
    minimum_amount: minimumAmount,
    forecast,
    installments,
  };
}

// Mes numérico (MM) -> nombre en español (para homologar el forecast entre
// bancos: BCI lo da por nombre, Falabella por fecha).
const MONTH_NAME: Record<string, string> = {
  "01": "ENERO", "02": "FEBRERO", "03": "MARZO", "04": "ABRIL", "05": "MAYO", "06": "JUNIO",
  "07": "JULIO", "08": "AGOSTO", "09": "SEPTIEMBRE", "10": "OCTUBRE", "11": "NOVIEMBRE", "12": "DICIEMBRE",
};

// ── Parser Banco Falabella (CMR) ──────────────────────────────────────────────
// Cuota: `<lugar> <fecha> <desc> T <monto operación> <monto total> <NN/NN>
// <mes-año> <valor cuota>`. El monto total = valor cuota × N° cuotas. La
// descripción no contiene "/" (las fechas sí), así `[^/]+?` evita cruzar
// registros. Compras al contado son `01/01` y se ignoran.
function parseFalabella(text: string): ParsedStatement {
  const card = text.match(/\*{2,}(\d{4})/)?.[1] ?? null;
  const stmtDate = toISO(
    text.match(/Fecha Facturaci[oó]n Estado de Cuenta:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? "",
  );
  const dueDate = toISO(text.match(/Pagar Hasta\s+(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? "");

  const pay = text.match(
    /Monto Total Facturado a Pagar\s+([\d.]+)\s+Monto M[ií]nimo a Pagar\s+([\d.]+)/,
  );
  const totalAmount = pay ? parseCLP(pay[1]) : 0;
  const minimumAmount = pay ? parseCLP(pay[2]) : 0;

  // Vencimiento próximos meses: "Actual <4 fechas> <5 montos>". Los meses vienen
  // como fechas (05/08/2026); los pasamos a nombre para combinar con otros bancos.
  const forecast: { month: string; amount: number }[] = [];
  const region =
    text.match(/Vencimiento Pr[oó]ximos 4 meses\s+Actual\s+(.+?)\s+(?:Desde|Evoluci|Pr[oó]ximo)/)?.[1] ?? "";
  if (region) {
    const months = [...region.matchAll(/\d{2}\/(\d{2})\/\d{4}/g)].map((m) => MONTH_NAME[m[1]]);
    const amts = (region.replace(/\d{2}\/\d{2}\/\d{4}/g, "").match(/\d{1,3}(?:\.\d{3})*/g) ?? []).map(parseCLP);
    for (let i = 0; i < months.length; i++) {
      if (amts[i + 1] != null && months[i]) forecast.push({ month: months[i], amount: amts[i + 1] });
    }
  }

  const installments: ParsedInstallment[] = [];
  const re =
    /(\d{2}\/\d{2}\/\d{4})\s+([^/]+?)\s+T\s+([\d.]+)\s+([\d.]+)\s+(\d{2})\/(\d{2})\s+[A-Za-z]{3}-\d{4}\s+([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, opDate, descRaw, , a2, cur, tot, monthly] = m;
    const total = parseInt(tot, 10);
    if (!total || total < 2) continue; // ignora compras al contado (01/01)
    const description = descRaw.replace(/\s+/g, " ").trim();
    installments.push({
      description,
      operation_date: toISO(opDate),
      total_amount: parseCLP(a2),       // monto total a pagar (= cuota × N°)
      monthly_amount: parseCLP(monthly),
      installment_current: parseInt(cur, 10),
      installment_total: total,
      category: categoryFor(description),
    });
  }

  return {
    bank: "Banco Falabella",
    card_last4: card,
    statement_date: stmtDate,
    due_date: dueDate,
    total_amount: totalAmount,
    minimum_amount: minimumAmount,
    forecast,
    installments,
  };
}

// ── Parser Tenpo ──────────────────────────────────────────────────────────────
// Cuota: `<fecha> <desc> <tipo> $<monto op> $<monto total> <NN/NN> $<valor cuota>`.
// Los montos van con `$`, así `[^$]+?` evita que la descripción cruce registros.
// Pagos y compras al contado son `01/01`/`00/00` y se ignoran (sólo NN/NN ≥ 2).
function parseTenpo(text: string): ParsedStatement {
  const card = text.match(/[xX]{2,}(\d{4})/)?.[1] ?? null;
  const stmtDate = toISO(text.match(/[xX]{2,}\d{4}\s+(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? "");
  const dueDate = toISO(text.match(/Pagar Hasta\s+(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? "");

  const pay = text.match(
    /Monto Total Facturado \(o a Pagar\)[^$]*\$([\d.]+)\s*Monto M[ií]nimo a Pagar\s*\$([\d.]+)/,
  );
  const totalAmount = pay ? parseCLP(pay[1]) : 0;
  const minimumAmount = pay ? parseCLP(pay[2]) : 0;

  // Tenpo entrega el forecast como "Mes 1..4" con montos (normalmente 0); no hay
  // nombres de mes confiables, así que sólo agregamos meses con monto > 0.
  const forecast: { month: string; amount: number }[] = [];

  const installments: ParsedInstallment[] = [];
  const re =
    /(\d{2}\/\d{2}\/\d{4})\s+([^$]+?)\s+\$(-?[\d.]+)\s+\$(-?[\d.]+)\s+(\d{2})\/(\d{2})\s+\$(-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, opDate, descRaw, , a2, cur, tot, monthly] = m;
    const total = parseInt(tot, 10);
    if (!total || total < 2) continue;
    const description = descRaw.replace(/\s+/g, " ").trim();
    installments.push({
      description,
      operation_date: toISO(opDate),
      total_amount: parseCLP(a2),
      monthly_amount: parseCLP(monthly),
      installment_current: parseInt(cur, 10),
      installment_total: total,
      category: categoryFor(description),
    });
  }

  return {
    bank: "Tenpo",
    card_last4: card,
    statement_date: stmtDate,
    due_date: dueDate,
    total_amount: totalAmount,
    minimum_amount: minimumAmount,
    forecast,
    installments,
  };
}

function detectAndParse(text: string): ParsedStatement {
  // Se ramifica por firma del banco en el texto. Al sumar otro banco, agregar
  // su firma + parseXXX aquí.
  if (/Tenpo/i.test(text)) return parseTenpo(text);
  if (/Falabella|CMR/i.test(text)) return parseFalabella(text);
  return parseBCI(text); // BCI por defecto (firma: "BCI" / "TASA INT")
}

function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64; // por si viene data URI
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

Deno.serve(async (req: any) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identifica al usuario por su JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const authClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pdf_base64, filename, password } = await req.json();
    if (!pdf_base64) throw new Error("Falta pdf_base64");

    // Extrae texto del PDF. Los estados de cuenta del banco vienen cifrados; si
    // la app manda contraseña se la pasamos a pdf.js. Distinguimos "falta clave"
    // de "clave incorrecta" para que la app pida (o repida) la contraseña. Estos
    // casos vuelven con HTTP 200 + ok:false para que supabase-js entregue el
    // `code` en `data` (en un no-2xx el cliente lo esconde tras un error genérico).
    const bytes = base64ToUint8Array(pdf_base64);
    let text: string;
    try {
      const pdf = await getDocumentProxy(bytes, password ? { password } : {});
      ({ text } = await extractText(pdf, { mergePages: true }));
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (e?.name === "PasswordException" || /password/i.test(msg)) {
        const incorrect = /incorrect/i.test(msg);
        return new Response(
          JSON.stringify({
            ok: false,
            code: incorrect ? "PASSWORD_INCORRECT" : "PASSWORD_REQUIRED",
            error: incorrect ? "Contraseña incorrecta." : "El PDF está protegido con contraseña.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw e;
    }

    const parsed = detectAndParse(text);
    if (parsed.installments.length === 0 && parsed.total_amount === 0) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNRECOGNIZED", error: "No se reconoció el formato del estado de cuenta." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Mapea categorías -> id.
    const { data: cats } = await db.from("categories").select("id,name");
    const catId = new Map<string, string>((cats ?? []).map((c: any) => [c.name, c.id]));
    const otrosId = catId.get("Otros") ?? null;

    // Upsert del encabezado (dedup por user+banco+fecha).
    const { data: stmt, error: stmtErr } = await db
      .from("statements")
      .upsert({
        user_id: user.id,
        bank: parsed.bank,
        card_last4: parsed.card_last4,
        statement_date: parsed.statement_date,
        due_date: parsed.due_date,
        total_amount: parsed.total_amount,
        minimum_amount: parsed.minimum_amount,
        forecast: parsed.forecast,
        filename: filename ?? null,
      }, { onConflict: "user_id,bank,statement_date" })
      .select("id")
      .single();
    if (stmtErr) throw stmtErr;

    // Reemplaza las cuotas de ese estado de cuenta (re-subida idempotente).
    await db.from("installments").delete().eq("statement_id", stmt.id);

    const rows = parsed.installments.map((it) => ({
      statement_id: stmt.id,
      user_id: user.id,
      description: it.description,
      operation_date: it.operation_date,
      category_id: catId.get(it.category) ?? otrosId,
      total_amount: it.total_amount,
      monthly_amount: it.monthly_amount,
      installment_current: it.installment_current,
      installment_total: it.installment_total,
    }));
    if (rows.length > 0) {
      const { error: insErr } = await db.from("installments").insert(rows);
      if (insErr) throw insErr;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        statement_id: stmt.id,
        bank: parsed.bank,
        card_last4: parsed.card_last4,
        due_date: parsed.due_date,
        total_amount: parsed.total_amount,
        minimum_amount: parsed.minimum_amount,
        installments: rows.length,
        forecast: parsed.forecast,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
