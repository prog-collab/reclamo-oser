// Cliente minimo de Supabase hecho con fetch.
// No usamos la libreria oficial a proposito: asi la pagina no depende de ningun
// CDN externo y funciona con solo abrir los archivos.
(function () {
  const cfg = window.RECLAMO_CONFIG;
  const BASE = cfg.supabaseUrl.replace(/\/+$/, '');
  const KEY = cfg.supabaseAnonKey;
  const BUCKET = cfg.bucket;

  // --- sesion del admin -----------------------------------------------------
  // Guardamos en sessionStorage: al cerrar la pestana se cierra la sesion.
  const sesion = {
    get access() {
      return sessionStorage.getItem('oser_at') || '';
    },
    get refresh() {
      return sessionStorage.getItem('oser_rt') || '';
    },
    get email() {
      return sessionStorage.getItem('oser_email') || '';
    },
    guardar(data) {
      sessionStorage.setItem('oser_at', data.access_token || '');
      sessionStorage.setItem('oser_rt', data.refresh_token || '');
      sessionStorage.setItem('oser_email', (data.user && data.user.email) || '');
    },
    limpiar() {
      ['oser_at', 'oser_rt', 'oser_email'].forEach((k) => sessionStorage.removeItem(k));
    },
  };

  // Saca el mensaje de error mas util que devuelva Supabase.
  async function leerError(res) {
    let cuerpo = null;
    try {
      cuerpo = await res.json();
    } catch (_) {
      /* respuesta sin JSON */
    }
    const msg =
      (cuerpo && (cuerpo.message || cuerpo.error_description || cuerpo.error || cuerpo.msg)) ||
      `Error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    return err;
  }

  function rutaEncoded(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  // --- llamadas anonimas (el formulario publico) ----------------------------

  // Llama a una funcion de Postgres. El formulario usa esto en lugar de escribir
  // directo en las tablas.
  async function rpc(nombre, args) {
    const res = await fetch(`${BASE}/rest/v1/rpc/${nombre}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args || {}),
    });
    if (!res.ok) throw await leerError(res);
    const texto = await res.text();
    return texto ? JSON.parse(texto) : null;
  }

  // Sube un archivo al bucket privado.
  async function subirArchivo(path, file) {
    const res = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${rutaEncoded(path)}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: file,
    });
    if (!res.ok) throw await leerError(res);
    return path;
  }

  // --- sesion / login del panel ---------------------------------------------

  async function iniciarSesion(email, password) {
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (!res.ok) throw await leerError(res);
    const data = await res.json();
    sesion.guardar(data);
    return data;
  }

  async function renovarSesion() {
    const rt = sesion.refresh;
    if (!rt) return false;
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) {
      sesion.limpiar();
      return false;
    }
    sesion.guardar(await res.json());
    return true;
  }

  function cerrarSesion() {
    const at = sesion.access;
    sesion.limpiar();
    if (at) {
      // Best effort: si falla igual ya borramos la sesion local.
      fetch(`${BASE}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: `Bearer ${at}` },
      }).catch(() => {});
    }
  }

  // Fetch con el token del admin. Si el token vencio, lo renueva y reintenta una vez.
  async function fetchAutenticado(url, opciones, yaReintento) {
    const at = sesion.access;
    if (!at) {
      const err = new Error('Sesion cerrada.');
      err.status = 401;
      throw err;
    }
    const opts = Object.assign({}, opciones);
    opts.headers = Object.assign({ apikey: KEY, Authorization: `Bearer ${at}` }, opciones && opciones.headers);
    const res = await fetch(url, opts);
    if (res.status === 401 && !yaReintento && (await renovarSesion())) {
      return fetchAutenticado(url, opciones, true);
    }
    return res;
  }

  // --- lectura de datos (solo admin habilitado) ------------------------------

  // Igual que rpc(), pero firmando con el token del admin logueado.
  async function rpcAutenticado(nombre, args) {
    const res = await fetchAutenticado(`${BASE}/rest/v1/rpc/${nombre}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
    if (!res.ok) throw await leerError(res);
    const texto = await res.text();
    return texto ? JSON.parse(texto) : null;
  }

  async function soyAdmin() {
    return (await rpcAutenticado('oser_soy_admin')) === true;
  }

  async function traerReclamos() {
    const url =
      `${BASE}/rest/v1/oser_reclamos` +
      `?select=id,creado_en,nombre,dni,cuit,domicilio,telefono,email,firmo_ate,firmo_upcn` +
      `,oser_reclamo_archivos(id,tipo,path,nombre_original,tamano,mime)` +
      `&order=creado_en.desc`;
    const res = await fetchAutenticado(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw await leerError(res);
    return res.json();
  }

  // Link temporal de descarga (1 hora), con el nombre original del archivo.
  async function linkDescarga(path, nombreOriginal) {
    const res = await fetchAutenticado(`${BASE}/storage/v1/object/sign/${BUCKET}/${rutaEncoded(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!res.ok) throw await leerError(res);
    const { signedURL } = await res.json();
    const url = `${BASE}/storage/v1${signedURL}`;
    return nombreOriginal ? `${url}&download=${encodeURIComponent(nombreOriginal)}` : url;
  }

  // Baja el archivo como blob (lo usamos para armar el ZIP en el navegador).
  async function bajarArchivo(path) {
    const res = await fetchAutenticado(`${BASE}/storage/v1/object/${BUCKET}/${rutaEncoded(path)}`, {});
    if (!res.ok) throw await leerError(res);
    return res.blob();
  }

  async function borrarReclamo(id, paths) {
    if (paths && paths.length) {
      // Primero los archivos: si queda algo colgado, preferimos que sea el archivo
      // y no la fila con los datos de la persona.
      const res = await fetchAutenticado(`${BASE}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) throw await leerError(res);
    }
    const res = await fetchAutenticado(`${BASE}/rest/v1/oser_reclamos?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw await leerError(res);
  }

  window.SB = {
    sesion,
    rpc,
    rpcAutenticado,
    soyAdmin,
    subirArchivo,
    iniciarSesion,
    renovarSesion,
    cerrarSesion,
    traerReclamos,
    linkDescarga,
    bajarArchivo,
    borrarReclamo,
  };
})();
