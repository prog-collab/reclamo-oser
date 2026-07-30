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
| `styles.css` | Estilos compartidos por las dos páginas. |
| `supabase/schema.sql` | Las tablas, funciones y permisos de la base (ya aplicados). |

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
- **Borrar** una adhesión (borra también sus archivos).

El Excel y el ZIP salen con lo que estés viendo en la tabla: si escribís algo en
el buscador, exporta solo eso.

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

Todo el detalle está comentado en `supabase/schema.sql`.

## Publicar los cambios

Está publicado en GitHub Pages. Editás los archivos, los subís a `main` y a los
pocos minutos queda online. No hay que compilar nada.

Para probar en tu máquina, cualquier servidor estático sirve:

```
python3 -m http.server 8000
```

y abrís `http://localhost:8000`.
