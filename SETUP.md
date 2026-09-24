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
   - **Site URL**: la URL pública de la app (ej. `https://tu-app.vercel.app`).
   - **Redirect URLs**: agrega `https://tu-app.vercel.app/auth/callback` y `http://localhost:3000/auth/callback`.
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
| `NEXT_PUBLIC_APP_URL` | `https://tu-app.vercel.app` (o tu dominio) |

3. **Deploy**. Si cambias `NEXT_PUBLIC_*` después, vuelve a desplegar (se incrustan en el build).

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

- **Dominio propio**: agrégalo en Vercel y actualiza `NEXT_PUBLIC_APP_URL` + Site URL/Redirect URLs en Supabase.
- **Backups**: el plan Pro de Supabase incluye backups diarios y Point-in-Time Recovery.
- **SMTP propio** (Authentication → Emails) si mantienes la confirmación por correo en producción: el SMTP por defecto de Supabase tiene límites bajos.
- **PostHog / OpenAI**: aún no se usan; no hace falta configurarlos.
