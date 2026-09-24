# Configuración en una sola pasada

Todo lo que tienes que hacer fuera del código está en esta página. Tiempo estimado: **10–15 minutos**.

---

## 1. Supabase (5 min)

1. Crea un proyecto en <https://supabase.com> (elige la región más cercana a tus clientes).
2. Ve a **SQL Editor → New query**, pega **todo** el contenido de [`supabase/setup.sql`](supabase/setup.sql) y pulsa **Run**.
   - Crea tablas, índices, Row Level Security, la vista de métricas de clientes, la función `create_business`, el bucket `logos` y sus políticas.
   - Puedes volver a ejecutarlo sin problema (es idempotente) cuando haya actualizaciones.
3. **Authentication → Sign In / Providers → Email**
   - Recomendado para el onboarding de <10 min: **desactiva "Confirm email"**. La dueña entra directo a crear su negocio.
   - Si lo dejas activo también funciona: recibe un correo y el enlace la regresa a `/auth/callback` → onboarding.
4. **Authentication → URL Configuration**
   - **Site URL**: `https://adina.pro`
   - **Redirect URLs**: agrega `https://adina.pro/**` y `http://localhost:3000/**` (cubren `/auth/callback` con cualquier parámetro, que usan la confirmación de cuenta y la recuperación de contraseña). Para probar previews de Vercel agrega también `https://*-meshu-s-projects.vercel.app/**`.
5. **Project Settings → API Keys**: copia estos 3 valores para el paso 2:
   - Project URL
   - `anon` / publishable key
   - `service_role` / secret key (**solo servidor, nunca en el navegador**)

## 2. Vercel (5 min)

1. Importa el repositorio `ttcmx/pilot-biz` en <https://vercel.com/new> (framework: Next.js, sin cambios en build).
2. En **Settings → Environment Variables** agrega:

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
| `NEXT_PUBLIC_APP_URL` | `https://adina.pro` — **solo cuando el dominio ya funcione** (paso 2a); mientras tanto usa la URL `https://….vercel.app` |

3. **Deploy**. Si cambias `NEXT_PUBLIC_*` después, vuelve a desplegar (se incrustan en el build).

## 2a. Dominio `adina.pro`

1. **Vercel → Settings → Domains → Add**: agrega `adina.pro`. Cuando Vercel pregunte, agrega también `www.adina.pro` con **redirect a `adina.pro`**.
2. En el panel de tu registrador (donde compraste `adina.pro`) crea **exactamente los registros DNS que Vercel te muestra** en esa pantalla. Normalmente son:

| Tipo | Nombre / Host | Valor |
| --- | --- | --- |
| `A` | `@` | la IP que indique Vercel (p. ej. `76.76.21.21`) |
| `CNAME` | `www` | el valor que indique Vercel (p. ej. `cname.vercel-dns.com`) |

3. Espera a que ambos digan **Valid Configuration** (de minutos a unas horas). Vercel emite el certificado HTTPS solo.
4. **Hasta que ambos estén en Valid Configuration**, cambia `NEXT_PUBLIC_APP_URL` a `https://adina.pro` y haz **Redeploy**. (Si lo cambias antes, producción redirigirá a un dominio que todavía no responde.)

Con eso, cualquier visita a `pilot-biz….vercel.app` o `www.adina.pro` en producción se redirige automáticamente a `https://adina.pro` (mismo camino y parámetros), así los enlaces de reserva viejos siguen funcionando. Los previews de Vercel no se redirigen.

Las páginas de reserva quedan como `https://adina.pro/nombre-del-negocio`.

## 2b. Correos (Resend) — recomendado

Sirve para 3 cosas: confirmación a la clienta (con su enlace para reagendar/cancelar), aviso a la dueña de reservas/cambios/cancelaciones/lista de espera, y que lleguen los correos de **recuperar contraseña**.

1. Crea una cuenta en <https://resend.com>.
2. **Domains → Add domain**: agrega `adina.pro` y crea en tu registrador los registros DNS que te muestra Resend (MX/TXT de envío y DKIM). No chocan con los de Vercel. Espera a que diga *Verified*.
   - Sin dominio verificado Resend **solo entrega a tu propio correo**; sirve para probar, no para clientas.
3. **API Keys → Create API key** (permiso *Sending access*).
4. En **Vercel → Environment Variables** agrega y vuelve a desplegar:

| Variable | Valor |
| --- | --- |
| `RESEND_API_KEY` | la API key de Resend (`re_...`) |
| `EMAIL_FROM` | `Reservas <reservas@adina.pro>` |

5. **Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP** (el correo por defecto de Supabase solo entrega a los miembros de tu equipo de Supabase, así que sin esto las dueñas no reciben el enlace de recuperar contraseña):

| Campo | Valor |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la misma API key de Resend |
| Sender email | `reservas@adina.pro` |
| Sender name | `Adina` |

Si no configuras `RESEND_API_KEY`, la app funciona igual; simplemente no envía correos de reservas.

## 3. Probar el hito 1 (2 min)

1. Abre la app → **Crear mi negocio** → completa el onboarding.
2. En "Tu página de reservas está lista" pulsa **Hacer reserva de prueba** y reserva como clienta.
3. Pulsa **Ir a mi panel**: verás "Nuevas reservas desde tu página", la cita en la agenda y la clienta en el CRM.

---

## Desarrollo local

```bash
cp .env.example .env.local   # rellena con tus claves de Supabase
npm install
npm run dev                  # http://localhost:3000
npm test                     # motor de reservas, métricas, CSV, teléfonos
npm run lint                 # typecheck
```

## Opcional / después

- **Backups**: el plan Pro de Supabase incluye backups diarios y Point-in-Time Recovery.
- **PostHog / OpenAI**: aún no se usan; no hace falta configurarlos.
