# parse-statement — Estado de cuenta (PDF) → cuotas → "Próximos pagos"

Edge Function que recibe el **PDF del estado de cuenta** de la tarjeta de crédito,
extrae el texto con `unpdf` (pdf.js, sin binarios, corre en Deno) y lo parsea con
**reglas deterministas por banco** (**sin costo de API**). Guarda el encabezado en
`statements` y las compras en cuotas en `installments`. La pantalla **Próximos
pagos** de la app deriva de ahí las cuotas activas
(`installment_current < installment_total`).

## PDF cifrado (contraseña)

Los estados de cuenta del banco vienen **protegidos con contraseña**. La función
acepta un campo opcional `password` que pasa a pdf.js. Si el PDF está cifrado y:

- **no se mandó contraseña** → responde `200 {ok:false, code:"PASSWORD_REQUIRED"}`
- **la contraseña es incorrecta** → responde `200 {ok:false, code:"PASSWORD_INCORRECT"}`

(Se usa HTTP 200 a propósito: en un no-2xx, `supabase.functions.invoke` esconde
el body tras un error genérico "non-2xx" y la app no podría leer el `code`.) La
app muestra un modal pidiendo la contraseña y reintenta. La contraseña **no se
guarda**: solo viaja en esa request.

## Flujo

```
App (DocumentPicker → base64) ──invoke──> Edge Function ──unpdf──> texto
                                              │
                                              ├─ parseo por banco (regex, $0)
                                              ├─ upsert statements (dedup user+banco+fecha)
                                              └─ replace installments (idempotente)
```

## Bancos soportados

`detectAndParse()` detecta el banco por firma del texto y enruta:

| Banco | Firma | Ancla de la cuota |
|---|---|---|
| **BCI** | `BCI` / `TASA INT` | `TASA INT` + `NN/NN` + 3 montos `$$$` |
| **Banco Falabella (CMR)** | `Falabella` / `CMR` | `<fecha> <desc> T <op> <total> <NN/NN> <mes-año> <cuota>` |
| **Tenpo** | `Tenpo` | `<fecha> <desc> <tipo> $<op> $<total> <NN/NN> $<cuota>` |

Cualquier otro PDF cae en BCI por defecto; si no calza, responde `UNRECOGNIZED`.

## Qué extrae (todos los bancos)

- **Encabezado:** banco, últimos 4 de la tarjeta, fecha de estado, *pagar hasta*,
  monto total facturado, monto mínimo. Todas las fechas se normalizan a ISO
  (`toISO`), porque Postgres rechaza el `DD/MM/YYYY` chileno.
- **Vencimiento próximos meses** (`forecast` jsonb): `[{month, amount}, …]`. El
  mes se homologa a nombre en español (BCI lo da por nombre; Falabella por fecha)
  para poder combinar el forecast entre tarjetas en la app.
- **Compras en cuotas** (`installments`): descripción, fecha operación, monto
  total, **valor cuota mensual**, **cuota actual / total**, categoría.

Las compras al contado / pagos (`01/01`, `00/00`) se ignoran (sólo `NN/NN ≥ 2`).
Validado contra estados de cuenta reales de los 3 bancos: la **suma de las cuotas
mensuales activas coincide con el forecast del propio banco**.

## Auth

`verify_jwt = true`. La app llama con `supabase.functions.invoke('parse-statement', …)`,
que adjunta el JWT del usuario. La función identifica al dueño con
`auth.getUser(jwt)` e inserta con el `service_role` amarrando `user_id`.

## Deploy

```
supabase functions deploy parse-statement
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase.

## Agregar otro banco

En `detectAndParse()` se ramifica por firma del texto. Cada banco tiene su
`parseXXX(text)` que devuelve el mismo `ParsedStatement`. El resto (dedup,
categorías, inserts) es común.

## Tablas

- `statements` — encabezado; único por `(user_id, bank, statement_date)`.
- `installments` — cuotas; `on delete cascade` desde `statements`. Re-subir el
  mismo estado de cuenta reemplaza sus cuotas (idempotente).
