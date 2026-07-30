// Genera archivos .xlsx y .zip directo en el navegador, sin librerias externas.
// Los dos formatos son en realidad archivos ZIP, asi que comparten el mismo
// escritor de ZIP (guardado sin compresion, que es lo que Excel acepta igual).
(function () {
  // --- CRC32 (lo pide el formato ZIP) ---------------------------------------
  const TABLA_CRC = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = TABLA_CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function fechaDos(d) {
    const hora = ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff;
    const dia = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { hora, dia };
  }

  // entradas: [{ nombre, datos: Uint8Array | Blob | string }]
  async function armarZip(entradas) {
    const codificador = new TextEncoder();
    const partes = [];
    const centrales = [];
    const { hora, dia } = fechaDos(new Date());
    let offset = 0;

    for (const entrada of entradas) {
      let datos = entrada.datos;
      if (typeof datos === 'string') datos = codificador.encode(datos);
      else if (!(datos instanceof Uint8Array)) datos = new Uint8Array(await datos.arrayBuffer());

      const nombre = codificador.encode(entrada.nombre);
      const crc = crc32(datos);

      const local = new Uint8Array(30 + nombre.length);
      const vl = new DataView(local.buffer);
      vl.setUint32(0, 0x04034b50, true); // firma
      vl.setUint16(4, 20, true); // version necesaria
      vl.setUint16(6, 0x0800, true); // nombres en UTF-8
      vl.setUint16(8, 0, true); // sin compresion
      vl.setUint16(10, hora, true);
      vl.setUint16(12, dia, true);
      vl.setUint32(14, crc, true);
      vl.setUint32(18, datos.length, true);
      vl.setUint32(22, datos.length, true);
      vl.setUint16(26, nombre.length, true);
      vl.setUint16(28, 0, true);
      local.set(nombre, 30);

      partes.push(local, datos);

      const central = new Uint8Array(46 + nombre.length);
      const vc = new DataView(central.buffer);
      vc.setUint32(0, 0x02014b50, true);
      vc.setUint16(4, 20, true);
      vc.setUint16(6, 20, true);
      vc.setUint16(8, 0x0800, true);
      vc.setUint16(10, 0, true);
      vc.setUint16(12, hora, true);
      vc.setUint16(14, dia, true);
      vc.setUint32(16, crc, true);
      vc.setUint32(20, datos.length, true);
      vc.setUint32(24, datos.length, true);
      vc.setUint16(28, nombre.length, true);
      vc.setUint16(30, 0, true);
      vc.setUint16(32, 0, true);
      vc.setUint16(34, 0, true);
      vc.setUint16(36, 0, true);
      vc.setUint32(38, 0, true);
      vc.setUint32(42, offset, true);
      central.set(nombre, 46);
      centrales.push(central);

      offset += local.length + datos.length;
    }

    const inicioCentral = offset;
    let tamCentral = 0;
    centrales.forEach((c) => {
      tamCentral += c.length;
      partes.push(c);
    });

    const fin = new Uint8Array(22);
    const vf = new DataView(fin.buffer);
    vf.setUint32(0, 0x06054b50, true);
    vf.setUint16(4, 0, true);
    vf.setUint16(6, 0, true);
    vf.setUint16(8, centrales.length, true);
    vf.setUint16(10, centrales.length, true);
    vf.setUint32(12, tamCentral, true);
    vf.setUint32(16, inicioCentral, true);
    vf.setUint16(20, 0, true);
    partes.push(fin);

    return new Blob(partes, { type: 'application/zip' });
  }

  // --- XLSX -----------------------------------------------------------------
  function esc(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); // control chars rompen el XML
  }

  function letraColumna(indice) {
    let s = '';
    let n = indice + 1;
    while (n > 0) {
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  // columnas: [{ titulo, ancho }]   filas: [[valor, valor, ...], ...]
  async function armarXlsx(columnas, filas, nombreHoja) {
    const cols = columnas
      .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 18}" customWidth="1"/>`)
      .join('');

    function celda(ref, valor, esTitulo) {
      const estilo = esTitulo ? ' s="1"' : '';
      if (typeof valor === 'number' && isFinite(valor)) {
        return `<c r="${ref}"${estilo}><v>${valor}</v></c>`;
      }
      const texto = esc(valor);
      if (!texto) return `<c r="${ref}"${estilo}/>`;
      return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${texto}</t></is></c>`;
    }

    const filaTitulos =
      '<row r="1">' +
      columnas.map((c, i) => celda(letraColumna(i) + '1', c.titulo, true)).join('') +
      '</row>';

    const filasXml = filas
      .map((fila, f) => {
        const r = f + 2;
        return (
          `<row r="${r}">` +
          fila.map((valor, i) => celda(letraColumna(i) + r, valor, false)).join('') +
          '</row>'
        );
      })
      .join('');

    const hoja =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '</sheetView></sheetViews>' +
      `<cols>${cols}</cols>` +
      `<sheetData>${filaTitulos}${filasXml}</sheetData>` +
      '</worksheet>';

    const libro =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${esc((nombreHoja || 'Hoja1').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
      '</workbook>';

    const estilos =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';

    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const zip = await armarZip([
      {
        nombre: '[Content_Types].xml',
        datos:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>',
      },
      {
        nombre: '_rels/.rels',
        datos:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
          '</Relationships>',
      },
      { nombre: 'xl/workbook.xml', datos: libro },
      {
        nombre: 'xl/_rels/workbook.xml.rels',
        datos:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>` +
          '</Relationships>',
      },
      { nombre: 'xl/styles.xml', datos: estilos },
      { nombre: 'xl/worksheets/sheet1.xml', datos: hoja },
    ]);

    return new Blob([zip], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  function bajar(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  window.EXPORTAR = { armarZip, armarXlsx, bajar };
})();
