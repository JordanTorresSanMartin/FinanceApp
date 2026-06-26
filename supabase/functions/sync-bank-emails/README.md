# sync-bank-emails — sincronización Gmail → Supabase (siempre activa)

Edge Function que reemplaza la rutina local. Lee los correos bancarios
(MACH / BCI / BancoEstado) de los últimos días, los parsea con **reglas
deterministas** (regex + palabras clave, **sin costo de API**) e inserta en
`transactions`, deduplicando por `email_id`. La dispara `pg_cron` en la nube de
Supabase, así corre aunque el PC esté apagado.

## Arquitectura

```
pg_cron (22:00 Chile) ── pg_net ──> Edge Function ──> Gmail API
                                          │
                                          ├─ Parseo con reglas (regex + keywords, $0)
                                          └─ INSERT en transactions (dedup email_id)
```

## Prerrequisitos manuales (una sola vez)

### 1. OAuth de Gmail (refresh token)
1. https://console.cloud.google.com → crea un proyecto.
2. **APIs y servicios → Biblioteca →** habilita **Gmail API**.
3. **Pantalla de consentimiento OAuth:** tipo *Externo*; en *Usuarios de prueba*
   agrega `jordanandres26@gmail.com`. Scope: `https://www.googleapis.com/auth/gmail.readonly`.
4. **Credenciales → Crear credenciales → ID de cliente OAuth → App de escritorio.**
   Guarda `client_id` y `client_secret`.
5. Obtén el `refresh_token` (offline) autorizando una vez con ese scope. La forma
   más rápida es el [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):
   engranaje → *Use your own OAuth credentials* → pega client_id/secret →
   autoriza `Gmail API v1 → gmail.readonly` → *Exchange authorization code for tokens*
   → copia el **refresh token**.

### 2. Secrets en Supabase
Dashboard → Project Settings → **Edge Functions → Secrets** (o `supabase secrets set`):

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
FINANCE_USER_ID=585f7805-59c6-48b6-8be7-387e8f8ef14a
CRON_SECRET=<cadena-aleatoria>
# opcional: LOOKBACK_DAYS=5
```
`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase solo.

## Deploy

Con secrets listos, se despliega (verify_jwt = false; se protege con `CRON_SECRET`):

```
supabase functions deploy sync-bank-emails --no-verify-jwt
```

Prueba manual:
```
curl -i -X POST "https://tjbgxuaucnxrznbdlpzi.supabase.co/functions/v1/sync-bank-emails" \
  -H "x-cron-secret: <CRON_SECRET>"
```

## Agendar con pg_cron (22:00 Chile = 02:00 UTC)

En el SQL Editor de Supabase (una vez):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-bank-emails-daily',
  '0 2 * * *',  -- 02:00 UTC = 22:00 Chile
  $$
  select net.http_post(
    url     := 'https://tjbgxuaucnxrznbdlpzi.supabase.co/functions/v1/sync-bank-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    )
  );
  $$
);

-- ver / borrar
select * from cron.job;
-- select cron.unschedule('sync-bank-emails-daily');
```

## Notas
- Deduplicación a prueba de fallos: índice único parcial
  `transactions_email_id_unique` sobre `email_id` (NULL permitido para entradas
  manuales) + `upsert(onConflict: email_id, ignoreDuplicates)`.
- `LOOKBACK_DAYS=5` tolera corridas perdidas; el dedup evita duplicar.
- Auto-transferencias MACH↔BCI y cobros de pasaje fallidos se omiten (skip).
- Categorización por palabras clave (`CATEGORY_RULES` en `index.ts`); lo no
  reconocido cae en **Otros** y se recategoriza en la app. Ajusta las reglas ahí.
