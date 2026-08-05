/* =====================================================================
   El texto del mail de confirmacion.

   La idea es que la persona pueda revisar de un vistazo si lo que quedo
   guardado es lo que ella cargo: por eso el mail le repite los datos y
   la lista de archivos que entraron, en vez de decir solo "gracias".

   Va en dos versiones, texto y HTML: hay casillas que no muestran HTML,
   y un mail que ademas trae texto plano cae menos en spam.
   ===================================================================== */

export type Archivo = { tipo: string; nombre: string };

export type Adhesion = {
  nombre: string;
  dni: string;
  cuit: string;
  firmo_ate: string;
  firmo_upcn: string;
  creado_en: string;
  archivos: Archivo[];
};

const GREMIO: Record<string, string> = {
  si: "Sí, lo firmé",
  no: "No lo firmé",
  no_se: "No sé todavía",
};

function gremio(v: string) {
  return GREMIO[v] ?? v;
}

/* Fecha y hora de Entre Rios, escritas como las escribiria una persona. */
export function fechaLegible(iso: string) {
  const f = new Date(iso);
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(f);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")} a las ${g("hour")}:${g("minute")}`;
}

function escapar(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function primerNombre(nombre: string) {
  return (nombre || "").trim().split(/\s+/)[0] || "";
}

export function asunto() {
  return "Quedó registrada tu adhesión al reclamo de la Orquesta";
}

export function texto(a: Adhesion) {
  const recibos = a.archivos.filter((x) => x.tipo === "recibo");
  const otros = a.archivos.filter((x) => x.tipo === "antecedente");

  const lineas = [
    `Hola ${primerNombre(a.nombre)}:`,
    "",
    "Confirmamos que tu adhesión al reclamo judicial conjunto de la Orquesta",
    `Sinfónica de Entre Ríos quedó registrada el ${fechaLegible(a.creado_en)}.`,
    "",
    "ESTO ES LO QUE NOS LLEGÓ",
    "",
    `Nombre y apellido: ${a.nombre}`,
    `DNI: ${a.dni}`,
    `CUIT/CUIL: ${a.cuit}`,
    `Reclamo de ATE: ${gremio(a.firmo_ate)}`,
    `Reclamo de UPCN: ${gremio(a.firmo_upcn)}`,
    "",
    recibos.length
      ? `Recibos de sueldo (${recibos.length}): ${recibos.map((x) => x.nombre).join(", ")}`
      : "Recibos de sueldo: NO NOS LLEGÓ NINGUNO",
    otros.length
      ? `Antecedentes del adicional (${otros.length}): ${otros.map((x) => x.nombre).join(", ")}`
      : "Antecedentes del adicional: no adjuntaste ninguno (no es obligatorio)",
    "",
  ];

  if (!recibos.length) {
    lineas.push(
      "Ojo con el recibo: es la prueba principal del reclamo y no nos llegó",
      "ninguno. Respondé este mail con el recibo adjunto, o avisanos para",
      "acercarlo por otro medio.",
      ""
    );
  }

  lineas.push(
    "Si algo de esto está mal o falta, respondé este mail y lo corregimos.",
    "No hace falta que vuelvas a completar el formulario: si lo mandás dos",
    "veces quedás cargado dos veces.",
    "",
    "Cualquier novedad del reclamo te la vamos a avisar a este mismo mail.",
    "",
    "Saludos,",
    "Reclamo judicial conjunto — Orquesta Sinfónica de Entre Ríos"
  );

  return lineas.join("\n");
}

export function html(a: Adhesion) {
  const recibos = a.archivos.filter((x) => x.tipo === "recibo");
  const otros = a.archivos.filter((x) => x.tipo === "antecedente");

  const fila = (etiqueta: string, valor: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#5b6b7f;font-size:14px;white-space:nowrap;vertical-align:top">${escapar(etiqueta)}</td>
      <td style="padding:6px 0;color:#16202e;font-size:14px;font-weight:600">${escapar(valor)}</td>
    </tr>`;

  const listaArchivos = (items: Archivo[]) =>
    `<ul style="margin:4px 0 0;padding-left:18px;color:#16202e;font-size:14px">${items
      .map((x) => `<li style="margin:2px 0">${escapar(x.nombre)}</li>`)
      .join("")}</ul>`;

  const avisoRecibo = recibos.length
    ? ""
    : `<div style="margin:18px 0 0;padding:12px 14px;background:#fdf0e6;border-left:4px solid #d97b2f;border-radius:4px">
         <strong style="color:#8a4a12;font-size:14px">No nos llegó ningún recibo de sueldo.</strong>
         <div style="color:#6b4520;font-size:14px;margin-top:4px">
           Es la prueba principal del reclamo. Respondé este mail con el recibo adjunto,
           o avisanos para acercarlo por otro medio.
         </div>
       </div>`;

  return `<!doctype html>
<html lang="es-AR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f5">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">
    Tu adhesión quedó registrada. Adentro está el detalle de lo que nos llegó.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

        <tr><td style="background:#1f3a5f;padding:20px 24px;color:#ffffff">
          <div style="font-size:13px;letter-spacing:.4px;text-transform:uppercase;opacity:.8">Orquesta Sinfónica de Entre Ríos</div>
          <div style="font-size:19px;font-weight:700;margin-top:2px">Reclamo judicial conjunto</div>
        </td></tr>

        <tr><td style="padding:24px">
          <div style="font-size:17px;font-weight:700;color:#1c6b3f">✓ Quedó registrada tu adhesión</div>
          <p style="margin:10px 0 0;color:#40506a;font-size:15px;line-height:1.5">
            Hola ${escapar(primerNombre(a.nombre))}: te escribimos para que te quedes tranquilo/a de que
            se cargó bien. Quedó registrada el <strong>${escapar(fechaLegible(a.creado_en))}</strong>.
          </p>

          <div style="margin:20px 0 8px;font-size:13px;font-weight:700;color:#5b6b7f;letter-spacing:.4px;text-transform:uppercase">Esto es lo que nos llegó</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e3e8ef;border-bottom:1px solid #e3e8ef;padding:4px 0">
            ${fila("Nombre y apellido", a.nombre)}
            ${fila("DNI", a.dni)}
            ${fila("CUIT/CUIL", a.cuit)}
            ${fila("Reclamo de ATE", gremio(a.firmo_ate))}
            ${fila("Reclamo de UPCN", gremio(a.firmo_upcn))}
          </table>

          <div style="margin:18px 0 0">
            <div style="color:#5b6b7f;font-size:14px">Recibos de sueldo${recibos.length ? ` (${recibos.length})` : ""}</div>
            ${recibos.length ? listaArchivos(recibos) : '<div style="color:#b23c17;font-size:14px;font-weight:600;margin-top:2px">Ninguno</div>'}
          </div>

          <div style="margin:14px 0 0">
            <div style="color:#5b6b7f;font-size:14px">Antecedentes del adicional${otros.length ? ` (${otros.length})` : ""}</div>
            ${
              otros.length
                ? listaArchivos(otros)
                : '<div style="color:#7a8699;font-size:14px;margin-top:2px">Ninguno (no era obligatorio)</div>'
            }
          </div>

          ${avisoRecibo}

          <p style="margin:20px 0 0;color:#40506a;font-size:15px;line-height:1.5">
            <strong>Si algo está mal o falta</strong>, respondé este mail y lo corregimos.
            No vuelvas a completar el formulario: si lo mandás dos veces quedás cargado dos veces.
          </p>
          <p style="margin:12px 0 0;color:#40506a;font-size:15px;line-height:1.5">
            Cualquier novedad del reclamo te la avisamos a este mismo mail.
          </p>
        </td></tr>

        <tr><td style="padding:16px 24px;background:#f7f9fc;color:#7a8699;font-size:12px;line-height:1.5">
          Tus datos y tus archivos se guardan cifrados y solo los ve quien lleva adelante el reclamo.
          No se comparten con nadie más.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
