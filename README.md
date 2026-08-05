# Reclamo judicial conjunto — Orquesta Sinfónica de Entre Ríos

Página para que los empleados de la Orquesta carguen sus datos y su documentación
para el reclamo judicial conjunto, más un panel privado para ver todo, exportarlo
a Excel y bajarse los archivos.

Es HTML, CSS y JavaScript sueltos, sin build ni dependencias: se publica
subiendo los archivos y listo. Anda igual en celular y en escritorio.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | El formulario que completan los empleados. |
| `panel.html` | El panel privado (pide email y contraseña). |
| `config.js` | La URL de Supabase y la clave pública. |
| `sb.js` | Cliente mínimo de Supabase hecho con `fetch`. |
| `export.js` | Generador de `.xlsx` y `.zip` dentro del navegador. |
| `recarga.js` | Recarga la página sola cuando quedó una versión vieja cacheada. |
| `version.json` | El número de versión publicado (lo lee `recarga.js`). |
| `styles.css` | Estilos compartidos por las dos páginas. |
| `supabase/schema.sql` | Las tablas, funciones y permisos de la base (ya aplicados). |
| `supabase/emails.sql` | La cola del mail de confirmación (ya aplicada). |
| `supabase/functions/oser-enviar-emails/` | La función que manda los mails. |

## Para los empleados

Se les manda el link de `index.html`. Completan:

- Nombre y apellido, DNI, CUIT/CUIL, domicilio real, teléfono y email.
- Si firmaron el reclamo de ATE y el de UPCN. Tres opciones cada uno: **SÍ**,
  **NO** y **No sé todavía** (para el que no se acuerda o no está seguro, así no
  tiene que inventar una respuesta).
- **Subí acá tu recibo de sueldo** — foto del celu, archivo de la compu, o
  arrastrando y soltando.
- **Subí acá si tenés algún antecedente o captura de pantalla del adicional** —
  además de arrastrar, acá se puede pegar una captura directo con `Ctrl+V`.

Aceptan imágenes y PDF, hasta 15 MB por archivo. Si alguien no adjunta el recibo,
la página pregunta si quiere enviar igual y acercarlo después.

## Para el panel

Se entra por `panel.html` con email y contraseña. Muestra:

- Los totales arriba: adhesiones, cuántos firmaron ATE, cuántos UPCN, cuántos no
  firmaron ninguno, cuántos adjuntaron recibo y cuántos archivos hay.
- La tabla con todos los datos, con buscador por nombre, DNI, CUIL, email,
  domicilio o teléfono.
- **Exportar a Excel** — baja un `.xlsx` de verdad, con el encabezado fijo.
- **Descargar todos los archivos** — junta todo en un ZIP, con una carpeta por
  persona (`Nombre - DNI/`).
- **ZIP** por fila, para bajar los archivos de una sola persona.
- **Subir recibo** por fila, para cargarle el recibo a quien no lo adjuntó (ver
  abajo).
- **Borrar** una adhesión (borra también sus archivos).

Al lado del nombre aparece **falta recibo** en rojo cuando esa persona no tiene
ninguno cargado. Se mira solo el recibo, no el total de archivos: alguien puede
haber mandado una captura del adicional y aun así deber el recibo, que es la
prueba principal. La marca va pegada al nombre y no en la columna de archivos
—que es donde uno la buscaría— porque esa columna queda tapada por la de
acciones hasta que se scrollea la tabla a la derecha.

### Cargarle el recibo a alguien

Varios se inscribieron sin adjuntar el recibo y después lo acercaron por otro
lado: en papel, por WhatsApp, contestando el mail de confirmación con la foto.
El botón **Subir recibo** de esa fila lo carga en su adhesión.

Acepta fotos y PDF, varios archivos de una vez, hasta 15 MB cada uno — lo mismo
que el formulario. El archivo queda **igual que si lo hubiera subido esa
persona**, así que entra solo en el ZIP, en el Excel y en los totales; no queda
marcado aparte. Cuando ya tiene alguno, el botón dice **+ Recibo** y sirve para
agregarle otro (por ejemplo, uno que se ve mejor).

Ojo: la persona **no recibe ningún aviso** de que se lo cargaste. Si querés que
se entere, avisale por otro lado.

El Excel y el ZIP salen con lo que estés viendo en la tabla: si escribís algo en
el buscador, exporta solo eso.

## El mail de confirmación

El que completa el formulario ve la pantalla de "listo" y después no le queda
ningún rastro: por eso varios preguntaron si su inscripción había entrado bien.
Ahora, apenas se guarda la adhesión, le sale un mail desde
**calsinfonica@gmail.com** que le repite lo que cargó —nombre, DNI, CUIL, qué
contestó de ATE y de UPCN— y la lista de archivos que llegaron, con el nombre de
cada uno. Si no adjuntó ningún recibo, el mail se lo marca y le pide que lo
acerque.

La idea es que pueda **revisar** si está bien, no solo que le agradezcan. Y le
aclara que no vuelva a completar el formulario, porque mandarlo dos veces lo
carga dos veces.

### Cómo funciona

1. Cada adhesión deja una fila **pendiente** en la tabla `oser_emails`. La deja
   un disparador, solo, cuando entra la adhesión.
2. Ese disparador despierta a la función `oser-enviar-emails`, que saca los
   pendientes, los manda por el SMTP de Gmail y anota cómo le fue a cada uno.
3. Un cron cada 10 minutos vuelve a despertarla. Es la red de seguridad: si el
   disparador no pudo salir, el mail sale un rato después en vez de perderse.

Nadie recibe el mismo mail dos veces: hay **una sola fila por persona**, y solo
se manda si está pendiente. Después de 5 intentos fallidos se deja de reintentar.

### La casilla

El mail sale por SMTP de Gmail. Los datos de la casilla son secretos del
proyecto (Supabase → Edge Functions → Secrets), no están en el código:

| Secreto | Qué es |
| --- | --- |
| `OSER_GMAIL_USUARIO` | `calsinfonica@gmail.com` |
| `OSER_GMAIL_CLAVE` | La **contraseña de aplicación** de Google (no la de la cuenta). |

La contraseña de aplicación se saca en `myaccount.google.com` → Seguridad →
Verificación en dos pasos → Contraseñas de aplicaciones. Son 16 letras. Hay que
tener la verificación en dos pasos activada, si no Google no la ofrece.

Si esa contraseña se revoca o se cambia, los mails empiezan a fallar y quedan en
`estado = 'error'` con el motivo en `ultimo_error`. Se arregla poniendo la
contraseña nueva en el secreto y corriendo:

```sql
update public.oser_emails set estado = 'pendiente', intentos = 0 where estado = 'error';
select public.oser_disparar_emails();
```

Gmail deja mandar unos 500 mails por día desde una cuenta común. Para este
reclamo sobra de lejos.

### Ver cómo viene

```sql
select estado, count(*) from public.oser_emails group by estado;

-- Los que fallaron y por qué
select destinatario, intentos, ultimo_error
from public.oser_emails where estado = 'error';
```

### Mandarles el mail a los que ya se habían inscripto

El disparador solo agarra las adhesiones nuevas. Para las que ya estaban hay que
encolarlas a mano, una sola vez:

```sql
insert into public.oser_emails (reclamo_id, tipo, destinatario)
select id, 'confirmacion', email from public.oser_reclamos
on conflict (reclamo_id, tipo) do nothing;

select public.oser_disparar_emails();
```

Conviene probar antes con uno solo (poniendo el email de uno mismo en el `where`)
y recién después soltar el resto.

## Cómo se cuidan los datos

El formulario junta DNI, CUIL y recibos de sueldo, así que la página está armada
para que esos datos no queden a la vista de nadie:

- La clave que viaja en la página es la clave **anónima** de Supabase. Con ella
  solo se puede **enviar** el formulario y **subir** archivos.
- Esa clave no puede leer ninguna tabla: le revocamos los privilegios en la base.
- Tampoco puede bajar archivos: el bucket es privado y no tiene permiso de lectura.
- El formulario no escribe directo en las tablas. Llama a dos funciones que
  validan los datos del lado del servidor.
- Para **ver** algo hay que estar logueado con un usuario cuyo email figure en la
  tabla `oser_admins`. Los usuarios admin de las otras webs del proyecto no ven
  nada de esto.
- Las descargas usan links firmados que vencen en 1 hora.
- La sesión del panel se guarda en `sessionStorage`: al cerrar la pestaña se cierra.
- El mail de confirmación repite el DNI y el CUIL de la persona, para que pueda
  revisar si están bien cargados. Va a la dirección que ella misma escribió: si
  se equivocó al tipearla, esos datos le llegan a otro. Es el precio de que
  pueda controlarlos. Si se prefiere no correr ese riesgo, se sacan esas dos
  líneas de `supabase/functions/oser-enviar-emails/email.ts` y se vuelve a
  publicar la función; el mail sigue sirviendo para confirmar que entró.
- Los archivos no viajan en el mail: solo van los nombres.

### Dar acceso al panel a otra persona

Son dos pasos, los dos en el panel de Supabase:

1. **Authentication → Users → Add user**: crear el usuario con su email y una
   contraseña, marcando "Auto Confirm User".
2. **SQL Editor**, correr:

   ```sql
   insert into public.oser_admins (email, nota)
   values ('elmail@ejemplo.com', 'quién es');
   ```

Para quitarle el acceso alcanza con:

```sql
delete from public.oser_admins where email = 'elmail@ejemplo.com';
```

## Base de datos

Vive en el proyecto Supabase `camerino-giustozzi`, pero completamente aparte del
resto: todas las tablas y funciones llevan el prefijo `oser_`, y los archivos van
a un bucket propio (`oser-reclamos`). Las policies de storage filtran por
`bucket_id`, así que no tocan los buckets de las otras webs.

- `oser_reclamos` — una fila por persona.
- `oser_reclamo_archivos` — los archivos de cada una (`tipo` es `recibo` o
  `antecedente`). Si se borra la persona, se borran sus filas de archivos.
- `oser_admins` — la lista de emails que pueden entrar al panel.
- `oser_emails` — la cola del mail de confirmación, con el estado de cada envío.

Todo el detalle está comentado en `supabase/schema.sql` y en
`supabase/emails.sql`.

## Publicar los cambios

Está publicado en GitHub Pages. Editás los archivos, los subís a `main` y a los
pocos minutos queda online. No hay que compilar nada.

Lo que está en `supabase/` es la excepción: no se publica con la página. El
`.sql` ya está aplicado en la base y la carpeta `functions/` es la copia de lo
que corre en Supabase (Edge Functions). Si se toca el mail, hay que volver a
subir la función desde Supabase para que el cambio tenga efecto.

**Al publicar un cambio hay que subir el número de versión.** GitHub Pages no
deja mandar cabeceras propias, así que el navegador se guarda el `.html` y lo
puede seguir mostrando después de haber publicado. Ya pasó una vez: con el panel
viejo cacheado, las columnas de ATE y UPCN mostraban **SÍ** para cualquier
respuesta (el panel viejo esperaba un booleano y ahora le llega texto, y en
JavaScript `'no'` y `'no_se'` son cadenas no vacías, o sea verdaderas). Los datos
en la base estaban bien; lo que estaba viejo era la página.

Para que eso no vuelva a pasar, cada página declara su versión y `recarga.js`
la compara contra `version.json`; si no coinciden, recarga sola con `?v=<número>`
(una URL nueva, que el navegador está obligado a bajar). El formulario no se
recarga si la persona ya empezó a completarlo, para no borrarle lo escrito.

El número se sube en un solo lugar conceptual, pero hay que tocarlo en cuatro:

1. `version.json`.
2. El `<meta name="oser-version">` de `index.html` y el de `panel.html`.
3. El `?v=` de los `<script>` y del `<link>` de las dos páginas.
4. El "Panel versión N" del pie de `panel.html`.

Si alguna vez el panel muestra algo raro, mirá ese número abajo de todo: si no
coincide con `version.json`, el navegador está mostrando una copia vieja y se
arregla con una recarga forzada (`Ctrl+Shift+R`, o `Cmd+Shift+R` en Mac).

Para probar en tu máquina, cualquier servidor estático sirve:

```
python3 -m http.server 8000
```

y abrís `http://localhost:8000`.
