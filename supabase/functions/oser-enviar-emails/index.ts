/* =====================================================================
   oser-enviar-emails

   Manda los mails de confirmacion que estan pendientes en la cola
   (tabla oser_emails). La llama el disparador cuando entra una adhesion
   nueva, y ademas un cron cada 10 minutos por si alguno quedo colgado.

   No pide JWT: se identifica con el secreto que viaja en la cabecera
   x-oser-secreto, que la base saca de vault. Sin ese secreto no hace
   nada, y es la base la que decide si es el correcto.

   El correo sale por el SMTP de Gmail de la cuenta del reclamo. Los
   datos de esa cuenta son secretos del proyecto (Edge Functions ->
   Secrets), no estan en el codigo:

     OSER_GMAIL_USUARIO  la casilla, calsinfonica@gmail.com
     OSER_GMAIL_CLAVE    la "contrasena de aplicacion" de Google
                         (NO la contrasena comun de la cuenta)

   Va de a uno y con una pausa entre mail y mail: Gmail corta si le
   entran muchos de golpe, y no hay ningun apuro.
   ===================================================================== */
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { asunto, html, texto, type Adhesion } from "./email.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICIO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USUARIO = Deno.env.get("OSER_GMAIL_USUARIO") ?? "";
const CLAVE = Deno.env.get("OSER_GMAIL_CLAVE") ?? "";
const REMITENTE = `Reclamo Orquesta Sinfonica de Entre Rios <${USUARIO}>`;

/* Cuantos mandamos por corrida. Con 20 alcanza de sobra: el disparador
   entra por cada adhesion nueva, y el cron levanta el resto. */
const POR_CORRIDA = 20;
const PAUSA_MS = 800;

type Pendiente = Adhesion & { id: string; para: string; tipo: string };

async function rpc(fn: string, params: Record<string, unknown>) {
  const r = await fetch(SUPA_URL + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: {
      "apikey": SERVICIO,
      "Authorization": "Bearer " + SERVICIO,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error("rpc " + fn + ": HTTP " + r.status + " " + (await r.text()));
  return r.json();
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Solo POST", { status: 405 });

  const secreto = req.headers.get("x-oser-secreto") || "";
  if (!secreto) return new Response("No autorizado", { status: 403 });

  if (!USUARIO || !CLAVE) {
    /* Sin la casilla configurada no tiene sentido tomar los pendientes:
       si los tomaramos, se gastarian los intentos al pedo. */
    console.error("faltan los secretos OSER_GMAIL_USUARIO / OSER_GMAIL_CLAVE");
    return new Response("Falta configurar la casilla", { status: 500 });
  }

  const datos = await rpc("oser_emails_pendientes", {
    p_secreto: secreto,
    p_limite: POR_CORRIDA,
  });
  if (!datos.ok) {
    const noAutorizado = String(datos.error || "").startsWith("No autorizado");
    return new Response(datos.error || "No se pudo", { status: noAutorizado ? 403 : 400 });
  }

  const pendientes = (datos.emails ?? []) as Pendiente[];
  if (!pendientes.length) {
    return new Response(JSON.stringify({ ok: true, enviados: 0, fallados: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /* Una sola conexion para toda la tanda: abrir y cerrar por cada mail es
     lo que mas rapido hace que Gmail nos empiece a rebotar. */
  const smtp = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: USUARIO, password: CLAVE },
    },
  });

  let enviados = 0;
  let fallados = 0;

  try {
    for (const p of pendientes) {
      try {
        await smtp.send({
          from: REMITENTE,
          to: p.para,
          replyTo: USUARIO,
          subject: asunto(),
          content: texto(p),
          html: html(p),
        });
        await rpc("oser_email_resultado", { p_secreto: secreto, p_id: p.id, p_ok: true });
        enviados++;
      } catch (e) {
        /* Guardamos el motivo: sin esto no hay forma de saber si fue un mail
           mal escrito, la clave vencida o Gmail frenandonos. */
        const motivo = e instanceof Error ? e.message : String(e);
        console.error("no pude mandarle a", p.para, motivo);
        await rpc("oser_email_resultado", {
          p_secreto: secreto,
          p_id: p.id,
          p_ok: false,
          p_error: motivo,
        });
        fallados++;
      }
      await dormir(PAUSA_MS);
    }
  } finally {
    try {
      await smtp.close();
    } catch (_) {
      /* si ya se cerro sola, no importa */
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados, fallados }), {
    headers: { "Content-Type": "application/json" },
  });
});
