/* Cobro · utilidades comunes (formato, fechas, íconos, tipos de factura) */
(function () {
  'use strict';
  var C = (window.Cobro = window.Cobro || {});

  /* Al abrir, app.js lo cambia por la versión real del programa instalado. */
  C.VERSION = '0.9.1';

  /* Identificador único universal (lo exige FinTrack para los pagos). */
  C.uuid = function () {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  C.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  };

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  C.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  };

  C.round2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  C.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
    return isFinite(n) ? n : 0;
  };
  C.money = function (n) {
    var v = C.round2(n);
    var neg = v < 0;
    return (neg ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  C.MASK = '$ •••••';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  C.pad = pad;
  C.MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  C.MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  C.DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  C.isoDate = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  C.today = function () { return C.isoDate(new Date()); };
  C.fmtDate = function (iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : String(iso);
  };
  C.shortDate = function (iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    return parseInt(p[2], 10) + ' ' + C.MONTHS_SHORT[parseInt(p[1], 10) - 1] + ' ' + p[0];
  };
  C.longToday = function () {
    var d = new Date();
    var s = C.DAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + C.MONTHS[d.getMonth()] + ' de ' + d.getFullYear();
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  C.addDays = function (iso, n) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return C.isoDate(d);
  };
  C.monthKey = function (iso) { return String(iso || '').slice(0, 7); };
  C.monthLabel = function (key) {
    var p = key.split('-');
    var s = C.MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  C.shiftMonth = function (key, n) {
    var p = key.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  };
  C.stamp = function (ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var ampm = h >= 12 ? 'p. m.' : 'a. m.';
    h = h % 12 || 12;
    return d.getDate() + ' ' + C.MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear() + ', ' + h + ':' + pad(d.getMinutes()) + ' ' + ampm;
  };

  /* Acepta AAAA-MM-DD, DD-MM-AAAA, DD/MM/AAAA y MM/DD/AAAA (si el día > 12). */
  C.parseDate = function (s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
      var a = +m[1], b = +m[2];
      var day = a, month = b;
      if (b > 12 && a <= 12) { day = b; month = a; }
      if (month < 1 || month > 12 || day < 1 || day > 31) return '';
      return m[3] + '-' + pad(month) + '-' + pad(day);
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : C.isoDate(d);
  };

  C.norm = function (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  };
  C.digits = function (s) { return String(s || '').replace(/\D/g, ''); };
  C.initials = function (s) {
    var parts = String(s || '').replace(/@.*/, '').split(/[\s._+-]+/).filter(Boolean);
    if (/^supermobile/i.test(parts[0] || '')) return parts[1] ? 'S' + parts[1].charAt(0).toUpperCase() : 'SM';
    return ((parts[0] || '?').charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  };

  C.TYPES = {
    venta: { key: 'venta', label: 'Venta', plural: 'Ventas', desc: 'Productos y accesorios', icon: 'bag', cls: 't-venta' },
    servicio: { key: 'servicio', label: 'Servicio', plural: 'Servicios', desc: 'Limpieza, instalación, diagnóstico', icon: 'clipboard', cls: 't-servicio' },
    reparacion: { key: 'reparacion', label: 'Reparación', plural: 'Reparaciones', desc: 'Equipo recibido con garantía', icon: 'wrench', cls: 't-rep' }
  };
  C.TYPE_KEYS = ['venta', 'servicio', 'reparacion'];
  C.DEVICE_TYPES = ['Celular', 'Consola', 'Tableta', 'Computadora', 'Otro'];
  C.DEVICE_STATUS = ['Recibido', 'En reparación', 'Listo para entregar', 'Entregado'];
  C.WARRANTIES = [0, 30, 60, 90];

  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevLeft: '<path d="m15 6-6 6 6 6"/>',
    chevRight: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    bag: '<path d="M6 8h12l1 13H5z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 14l2 2 4-4"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    drive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5 13 7.5 5h9L19 13M7 16.5h.01"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    cloud: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.92A6 6 0 0 1 19.5 11 4 4 0 0 1 17.5 19z"/>'
  };
  C.icon = function (name, size, sw) {
    size = size || 18;
    return '<svg class="ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (sw || 1.75) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  };

  /* Descarga un archivo de texto (respaldo, CSV). */
  C.downloadText = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };

  /* Programa de Windows (.exe): guarda en Documentos\Cobro\<carpeta>. En el navegador: descarga el archivo. */
  C.isDesktop = function () { return !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke); };
  C.isAndroid = function () { return C.isDesktop() && /Android/i.test(navigator.userAgent || ''); };

  /* Android: abre la ventana de Android para elegir dónde guardar (Descargas, Drive…) y escribe ahí el archivo.
     Si la persona cancela, se rechaza con cancel = true y no se muestra error. */
  function androidSave(filename, data) {
    var T = window.__TAURI__;
    if (!T || !T.dialog || !T.dialog.save || !T.fs) return Promise.reject(new Error('No se pudo abrir la ventana para guardar.'));
    return T.dialog.save({ defaultPath: filename }).then(function (uri) {
      if (!uri) { var e = new Error('Cancelado'); e.cancel = true; throw e; }
      return (typeof data === 'string' ? T.fs.writeTextFile(uri, data) : T.fs.writeFile(uri, data)).then(function () { return filename; });
    });
  }

  C.saveBytes = function (filename, bytes, mime) {
    if (C.isAndroid()) return androidSave(filename, bytes);
    var url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve(filename);
  };

  C.toBase64 = function (bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  /* Imagen de factura: Android → ventana para elegir dónde guardar; Windows → Documentos\Cobro\Facturas; navegador → descarga. */
  C.saveImage = function (filename, bytes) {
    if (C.isAndroid()) return androidSave(filename, bytes);
    if (C.isDesktop()) return window.__TAURI__.core.invoke('guardar_binario', { carpeta: 'Facturas', nombre: filename, contenidoB64: C.toBase64(bytes) });
    return C.saveBytes(filename, bytes, 'image/jpeg').then(function () { return ''; });
  };

  C.saveFile = function (folder, filename, text, mime) {
    if (C.isAndroid()) return androidSave(filename, text);
    if (C.isDesktop()) {
      return window.__TAURI__.core.invoke('guardar_archivo', { carpeta: folder, nombre: filename, contenido: text });
    }
    C.downloadText(filename, text, mime);
    return Promise.resolve('');
  };
  C.savedToast = function (path, fallback) {
    if (C.isAndroid()) { C.toast(path ? 'Guardado: ' + path : fallback); return; }
    C.toast(path ? 'Guardado en ' + path : fallback);
  };

  C.csv = function (rows) {
    return '﻿' + rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? '' : v);
        return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  };

  /* Abre un enlace externo (WhatsApp) en el navegador del sistema cuando corre como .exe. */
  C.openExternal = function (url) {
    try {
      var T = window.__TAURI__;
      if (T && T.opener && T.opener.openUrl) { T.opener.openUrl(url); return true; }
    } catch (e) { /* sigue con el navegador */ }
    var w = window.open(url, '_blank', 'noopener');
    return !!w;
  };

  /* Igual que openExternal, pero avisa si el equipo no tiene programa para abrir ese enlace (p. ej. whatsapp://). */
  C.openUrl = function (url) {
    var T = window.__TAURI__;
    if (T && T.opener && T.opener.openUrl) return Promise.resolve(T.opener.openUrl(url));
    return window.open(url, '_blank', 'noopener') ? Promise.resolve() : Promise.reject(new Error('No se pudo abrir ' + url));
  };

  /* Reduce una foto a 1280 px y JPEG para guardarla en el equipo. */
  C.compressImage = function (file, maxSide, quality, mime) {
    maxSide = maxSide || 1280;
    quality = quality || 0.72;
    mime = mime || 'image/jpeg';
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('No se pudo leer la foto.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('El archivo no es una imagen válida.')); };
        img.onload = function () {
          var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL(mime, quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  C.readFileText = function (file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      r.readAsText(file);
    });
  };

  /* Huella del PIN. Usa SHA-256 del navegador y, si no está disponible, una de respaldo. */
  C.hashPin = function (pin, salt) {
    var text = salt + ':' + pin + ':cobro';
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i); h1 = Math.imul(h1, 16777619);
      h2 ^= text.charCodeAt(text.length - 1 - i); h2 = Math.imul(h2, 2246822507);
    }
    return Promise.resolve('f' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16));
  };
})();
