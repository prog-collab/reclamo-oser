// Evita que el navegador siga mostrando una version vieja de la pagina.
//
// GitHub Pages no deja mandar cabeceras propias, asi que el navegador (y el CDN
// de GitHub) se guardan el .html y lo pueden seguir mostrando un buen rato
// despues de haber publicado un cambio. A los .js y .css los arreglamos con el
// "?v=" que llevan en el src, pero el .html no se puede versionar a si mismo.
//
// Eso ya rompio algo de verdad: con el panel viejo cacheado, las columnas de
// ATE y UPCN mostraban "SI" para cualquier respuesta. El panel viejo esperaba un
// booleano y desde la tercera opcion ("No se todavia") lo que llega es texto:
// 'no' y 'no_se' son cadenas no vacias, y en JavaScript toda cadena no vacia da
// verdadero. Los datos en la base estaban bien; lo que estaba viejo era la
// pagina.
//
// Como funciona: cada .html declara su version en <meta name="oser-version">.
// Al abrirlo pedimos version.json con una URL unica (?t=<ahora>), que ni el
// navegador ni el CDN pueden tener guardada, y si la version publicada es otra
// recargamos la pagina con ?v=<version>: al ser otra URL, el navegador esta
// obligado a bajar una copia nueva.
//
// Al publicar un cambio hay que subir el numero en tres lugares: el meta de
// index.html, el de panel.html y version.json (y de paso el "?v=" de los .js y
// .css, para que sea todo el mismo numero).
(function () {
  const meta = document.querySelector('meta[name="oser-version"]');
  if (!meta || !window.fetch) return;

  const local = (meta.getAttribute('content') || '').trim();
  if (!local) return;

  fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const publicada = data ? String(data.version || '').trim() : '';
      if (!publicada || publicada === local) return;

      // La pagina puede pedir que no la recarguemos justo ahora (el formulario
      // lo pide cuando la persona ya empezo a completarlo, asi no pierde lo
      // escrito). La proxima vez que lo abra se actualiza.
      if (typeof window.oserPuedeRecargar === 'function' && !window.oserPuedeRecargar()) return;

      // Una sola recarga por version: si el CDN todavia esta sirviendo el .html
      // viejo, no queremos dejar la pagina recargandose en loop.
      const marca = 'oser_recarga_' + publicada;
      try {
        if (sessionStorage.getItem(marca)) return;
        sessionStorage.setItem(marca, '1');
      } catch (_) {
        return; // sin sessionStorage no hay como frenar el loop: mejor no tocar nada
      }

      location.replace(location.pathname + '?v=' + encodeURIComponent(publicada) + location.hash);
    })
    .catch(() => {
      /* sin conexion o sin version.json: se sigue con lo que haya */
    });
})();
