/* Cobro · factura como PDF o como imagen (JPG), sin librerías externas.
   El mismo diseño se dibuja en un PDF (texto vectorial, Helvetica) o en un lienzo (imagen para compartir). */
(function () {
  'use strict';
  var C = window.Cobro;

  var W_REG = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
  var W_BOLD = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
  var WIN = { 8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135, 710: 136, 8240: 137, 352: 138, 8249: 139, 338: 140, 381: 142,
    8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152, 8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159 };

  function code(ch) {
    var c = ch.charCodeAt(0);
    if (c === 9) return 32;
    if (c >= 32 && c < 127) return c;
    if (c >= 160 && c <= 255) return c;
    return WIN[c] || 63;
  }
  function bytesOf(s) { var out = []; for (var i = 0; i < s.length; i++) out.push(code(s[i])); return out; }
  function pdfString(s) {
    return '(' + bytesOf(String(s)).map(function (b) {
      if (b === 40 || b === 41 || b === 92) return '\\' + String.fromCharCode(b);
      if (b < 32 || b > 126) return '\\' + ('00' + b.toString(8)).slice(-3);
      return String.fromCharCode(b);
    }).join('') + ')';
  }
  function n(v) { return (Math.round(v * 100) / 100).toString(); }
  function rgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255].map(function (x) { return n(x); }).join(' ');
  }

  function Doc() {
    this.W = 612; this.H = 792; this.paged = true; this.margin = 48;
    this.pages = [];
    this.images = [];
    this.addPage();
  }
  Doc.prototype.addPage = function () { this.cur = []; this.pages.push(this.cur); };
  Doc.prototype.width = function (s, size, bold) {
    var t = bold ? W_BOLD : W_REG;
    return bytesOf(String(s)).reduce(function (a, b) { return a + (t[b] || 500); }, 0) * size / 1000;
  };
  Doc.prototype.wrap = function (s, size, bold, maxW) {
    var self = this;
    var out = [];
    String(s || '').split(/\n/).forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      var line = '';
      words.forEach(function (w) {
        var tryLine = line ? line + ' ' + w : w;
        if (self.width(tryLine, size, bold) <= maxW) { line = tryLine; return; }
        if (line) out.push(line);
        while (self.width(w, size, bold) > maxW && w.length > 1) {
          var k = w.length;
          while (k > 1 && self.width(w.slice(0, k), size, bold) > maxW) k--;
          out.push(w.slice(0, k));
          w = w.slice(k);
        }
        line = w;
      });
      out.push(line);
    });
    return out.length ? out : [''];
  };
  /* y se mide desde arriba de la página, como en la pantalla. */
  Doc.prototype.text = function (x, y, s, o) {
    o = o || {};
    var size = o.size || 10;
    var w = this.width(s, size, o.bold) + (o.spacing ? o.spacing * Math.max(0, String(s).length - 1) : 0);
    if (o.align === 'right') x -= w;
    else if (o.align === 'center') x -= w / 2;
    var cs = n(o.spacing || 0) + ' Tc ';
    this.cur.push('BT ' + rgb(o.color || '#111827') + ' rg /' + (o.bold ? 'F2' : 'F1') + ' ' + n(size) + ' Tf ' + cs + n(x) + ' ' + n(this.H - y) + ' Td ' + pdfString(s) + ' Tj ET');
    return w;
  };
  Doc.prototype.rect = function (x, y, w, h, o) {
    o = o || {};
    var r = o.r || 0;
    var Y = this.H - y - h;
    var path;
    if (r) {
      var k = 0.5523 * r;
      path = n(x + r) + ' ' + n(Y) + ' m ' + n(x + w - r) + ' ' + n(Y) + ' l ' + n(x + w - r + k) + ' ' + n(Y) + ' ' + n(x + w) + ' ' + n(Y + r - k) + ' ' + n(x + w) + ' ' + n(Y + r) + ' c ' +
        n(x + w) + ' ' + n(Y + h - r) + ' l ' + n(x + w) + ' ' + n(Y + h - r + k) + ' ' + n(x + w - r + k) + ' ' + n(Y + h) + ' ' + n(x + w - r) + ' ' + n(Y + h) + ' c ' +
        n(x + r) + ' ' + n(Y + h) + ' l ' + n(x + r - k) + ' ' + n(Y + h) + ' ' + n(x) + ' ' + n(Y + h - r + k) + ' ' + n(x) + ' ' + n(Y + h - r) + ' c ' +
        n(x) + ' ' + n(Y + r) + ' l ' + n(x) + ' ' + n(Y + r - k) + ' ' + n(x + r - k) + ' ' + n(Y) + ' ' + n(x + r) + ' ' + n(Y) + ' c h';
    } else {
      path = n(x) + ' ' + n(Y) + ' ' + n(w) + ' ' + n(h) + ' re';
    }
    var ops = '';
    if (o.fill) ops += rgb(o.fill) + ' rg ';
    if (o.stroke) ops += rgb(o.stroke) + ' RG ' + n(o.lw || 0.75) + ' w ';
    this.cur.push(ops + path + ' ' + (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'));
  };
  Doc.prototype.line = function (x1, y1, x2, y2, color, lw) {
    this.cur.push(rgb(color || '#E5E7EB') + ' RG ' + n(lw || 0.75) + ' w ' + n(x1) + ' ' + n(this.H - y1) + ' m ' + n(x2) + ' ' + n(this.H - y2) + ' l S');
  };
  Doc.prototype.stamp = function (s, cx, cy, size, color) {
    var a = Math.PI / 9;
    var w = this.width(s, size, true);
    var c = Math.cos(a), si = Math.sin(a);
    var x = cx - (w / 2) * c, y = (this.H - cy) - (w / 2) * si;
    this.cur.push('q /GS1 gs BT ' + rgb(color) + ' rg /F2 ' + n(size) + ' Tf ' + [c, si, -si, c, x, y].map(n).join(' ') + ' Tm ' + pdfString(s) + ' Tj ET Q');
  };
  /* logo: { data: JPEG en Uint8Array, w, h }; se dibuja en (x, y) con tamaño dw × dh. */
  Doc.prototype.image = function (logo, x, y, dw, dh) {
    var id = 'Im' + (this.images.length + 1);
    this.images.push({ id: id, data: logo.data, w: logo.w, h: logo.h });
    this.cur.push('q ' + n(dw) + ' 0 0 ' + n(dh) + ' ' + n(x) + ' ' + n(this.H - y - dh) + ' cm /' + id + ' Do Q');
  };

  Doc.prototype.output = function () {
    var chunks = [];
    var size = 0;
    var offsets = [];
    function addStr(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; chunks.push(b); size += b.length; }
    function addBytes(b) { chunks.push(b); size += b.length; }
    var objs = [];
    function obj(body) { objs.push(body); return objs.length; }
    var self = this;
    obj(null); obj(null);
    var f1 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var f2 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var gs = obj('<< /Type /ExtGState /ca 0.16 >>');
    var imgRefs = this.images.map(function (im) {
      return { id: im.id, ref: obj({ head: '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.data.length + ' >>\nstream\n', data: im.data }) };
    });
    var xobj = imgRefs.length ? ' /XObject << ' + imgRefs.map(function (r) { return '/' + r.id + ' ' + r.ref + ' 0 R'; }).join(' ') + ' >>' : '';
    var res = '<< /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> /ExtGState << /GS1 ' + gs + ' 0 R >>' + xobj + ' >>';
    var kids = this.pages.map(function (ops) {
      var content = ops.join('\n');
      var cRef = obj('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      return obj('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + self.W + ' ' + self.H + '] /Resources ' + res + ' /Contents ' + cRef + ' 0 R >>');
    });
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[1] = '<< /Type /Pages /Kids [' + kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] /Count ' + kids.length + ' >>';
    addStr('%PDF-1.4\n%âãÏÓ\n');
    objs.forEach(function (body, i) {
      offsets.push(size);
      addStr((i + 1) + ' 0 obj\n');
      if (typeof body === 'string') addStr(body);
      else { addStr(body.head); addBytes(body.data); addStr('\nendstream'); }
      addStr('\nendobj\n');
    });
    var xref = size;
    addStr('xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map(function (o) { return ('0000000000' + o).slice(-10) + ' 00000 n \n'; }).join(''));
    addStr('trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(size);
    var p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  };

  Doc.prototype.stampAll = function (s) {
    var self = this;
    this.pages.forEach(function (p) { self.cur = p; self.stamp(s, self.W / 2, self.H / 2, 96, '#B91C1C'); });
  };

  /* ---------- Lienzo para la imagen JPG (una sola hoja larga, del alto que haga falta) ---------- */
  var FONT = "Rubik, 'Segoe UI', Roboto, Arial, sans-serif";
  function Img() {
    this.W = 612; this.H = 792; this.paged = false; this.margin = 36;
    this.ops = []; this.bottom = 0; this.stampText = '';
    this.m = document.createElement('canvas').getContext('2d');
  }
  Img.prototype.font = function (size, bold) { return (bold ? '600 ' : '400 ') + size + 'px ' + FONT; };
  Img.prototype.width = function (s, size, bold) { this.m.font = this.font(size, bold); return this.m.measureText(String(s)).width; };
  Img.prototype.wrap = Doc.prototype.wrap;
  Img.prototype.mark = function (y) { if (y > this.bottom) this.bottom = y; };
  Img.prototype.text = function (x, y, s, o) {
    o = o || {};
    var size = o.size || 10;
    var self = this;
    var w = this.width(s, size, o.bold) + (o.spacing ? o.spacing * Math.max(0, String(s).length - 1) : 0);
    if (o.align === 'right') x -= w;
    else if (o.align === 'center') x -= w / 2;
    this.mark(y + size * 0.3);
    this.ops.push(function (g) {
      g.font = self.font(size, o.bold);
      g.fillStyle = o.color || '#111827';
      if ('letterSpacing' in g) g.letterSpacing = (o.spacing || 0) + 'px';
      g.fillText(String(s), x, y);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    });
    return w;
  };
  function roundPath(g, x, y, w, h, r) {
    g.beginPath();
    if (!r) { g.rect(x, y, w, h); return; }
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  Img.prototype.rect = function (x, y, w, h, o) {
    o = o || {};
    this.mark(y + h);
    this.ops.push(function (g) {
      roundPath(g, x, y, w, h, o.r || 0);
      if (o.fill) { g.fillStyle = o.fill; g.fill(); }
      if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = o.lw || 0.75; g.stroke(); }
    });
  };
  Img.prototype.line = function (x1, y1, x2, y2, color, lw) {
    this.mark(Math.max(y1, y2));
    this.ops.push(function (g) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = color || '#E5E7EB'; g.lineWidth = lw || 0.75; g.stroke(); });
  };
  Img.prototype.image = function (logo, x, y, dw, dh) {
    this.mark(y + dh);
    this.ops.push(function (g) { if (logo.canvas) g.drawImage(logo.canvas, x, y, dw, dh); });
  };
  Img.prototype.stampAll = function (s) { this.stampText = s; };
  Img.prototype.render = function (scale) {
    var h = Math.ceil(this.bottom + this.margin);
    var cv = document.createElement('canvas');
    cv.width = Math.round(this.W * scale);
    cv.height = Math.round(h * scale);
    var g = cv.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, this.W, h);
    g.textBaseline = 'alphabetic';
    this.ops.forEach(function (op) { op(g); });
    if (this.stampText) {
      g.save();
      g.translate(this.W / 2, h / 2);
      g.rotate(-Math.PI / 9);
      g.globalAlpha = 0.16;
      g.fillStyle = '#B91C1C';
      g.font = this.font(96, true);
      g.textAlign = 'center';
      g.fillText(this.stampText, 0, 32);
      g.restore();
    }
    return cv;
  };

  C.PdfDoc = Doc;

  /* Convierte el logo (data URL) en JPEG con fondo blanco para el PDF. */
  function logoJpeg(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var side = 160;
          var cv = document.createElement('canvas');
          cv.width = side; cv.height = side;
          var g = cv.getContext('2d');
          g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, side, side);
          var s = Math.min(side / img.width, side / img.height);
          var w = img.width * s, h = img.height * s;
          g.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
          var b64 = cv.toDataURL('image/jpeg', 0.92).split(',')[1];
          var bin = atob(b64);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve({ data: bytes, w: side, h: side, canvas: cv });
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  var TYPE_COLOR = { venta: '#2459D6', servicio: '#0F766E', reparacion: '#C2410C' };

  /* Dibuja la factura (misma información que la hoja blanca) sobre un PDF o un lienzo. */
  function layout(d, inv, v, logo) {
      var b = C.settings.business;
      var M = d.margin, R = d.W - M, Wc = R - M;
      var MUTED = '#6B7280', BODY = '#374151', STRONG = '#0F172A', BORDER = '#E5E7EB';
      var y = M;
      function ensure(h) { if (d.paged && y + h > d.H - 48) { d.addPage(); y = 48; } }

      // Encabezado
      if (logo) d.image(logo, M, y, 46, 46);
      else {
        d.rect(M, y, 46, 46, { fill: '#13284A', r: 7 });
        d.text(M + 23, y + 28, 'SM', { size: 16, bold: true, color: '#FFFFFF', align: 'center' });
      }
      var bx = M + 58;
      var by = y + 12;
      d.text(bx, by, b.name || '', { size: 14, bold: true, color: STRONG });
      [b.address, [b.phone, b.instagram].filter(Boolean).join(' · '), b.email].filter(Boolean).forEach(function (t) {
        d.wrap(t, 9, false, 280).forEach(function (ln) { by += 12; d.text(bx, by, ln, { size: 9, color: '#4B5563' }); });
      });
      d.text(R, y + 10, 'FACTURA', { size: 8, color: MUTED, align: 'right', spacing: 1.2 });
      d.text(R, y + 32, inv.number, { size: 19, bold: true, color: STRONG, align: 'right' });
      d.text(R, y + 48, C.TYPES[inv.type] ? C.TYPES[inv.type].label : '', { size: 9.5, bold: true, color: TYPE_COLOR[inv.type] || BODY, align: 'right' });
      y = Math.max(by, y + 52) + 16;

      // Cliente, fecha y garantía
      d.line(M, y, R, y, BORDER);
      var dv = inv.device || {};
      var warranty = C.num(dv.warranty);
      var cols = [
        { x: M, label: 'Cliente', value: inv.customer.name || '', extra: inv.customer.phone || '' },
        { x: M + 260, label: 'Fecha', value: C.fmtDate(inv.date), extra: '' }
      ];
      if (inv.type === 'reparacion') cols.push({ x: M + 380, label: 'Garantía', value: warranty ? warranty + ' días' : 'Sin garantía', extra: warranty ? 'Hasta el ' + C.fmtDate(C.addDays(inv.date, warranty)) : '' });
      var my = y + 18;
      var maxH = 0;
      cols.forEach(function (c, i) {
        var wmax = (i === 0 ? 240 : 120);
        d.text(c.x, my, c.label, { size: 8, color: MUTED });
        var lines = d.wrap(c.value, 10.5, true, wmax);
        lines.forEach(function (ln, k) { d.text(c.x, my + 15 + k * 13, ln, { size: 10.5, bold: true, color: STRONG }); });
        var h = 15 + lines.length * 13;
        if (c.extra) { d.text(c.x, my + h + 1, c.extra, { size: 9, color: BODY }); h += 13; }
        maxH = Math.max(maxH, h);
      });
      y = my + maxH + 8;
      d.line(M, y, R, y, BORDER);
      y += 18;

      // Equipo (reparaciones)
      if (inv.type === 'reparacion' && (dv.model || dv.serial || dv.issue || dv.accessories)) {
        var fields = [];
        if (dv.model || dv.type) fields.push(['Equipo', [dv.model, dv.type].filter(Boolean).join(' · '), false]);
        if (dv.serial) fields.push(['IMEI, número de serie o modelo', dv.serial, false]);
        if (dv.accessories) fields.push(['Accesorios recibidos', dv.accessories, false]);
        if (dv.issue) fields.push(['Falla reportada', dv.issue, true]);
        var colW = (Wc - 32) / 2;
        var blocks = [];
        var row = [];
        fields.forEach(function (f) {
          var lines = d.wrap(f[1], 9.5, false, f[2] ? Wc - 32 : colW - 12);
          var blk = { label: f[0], lines: lines, full: f[2], h: 13 + lines.length * 12 };
          if (blk.full) { if (row.length) { blocks.push(row); row = []; } blocks.push([blk]); }
          else { row.push(blk); if (row.length === 2) { blocks.push(row); row = []; } }
        });
        if (row.length) blocks.push(row);
        var boxH = 16 + blocks.reduce(function (s, r) { return s + Math.max.apply(null, r.map(function (x) { return x.h; })) + 8; }, 0);
        ensure(boxH);
        d.rect(M, y, Wc, boxH, { fill: '#F9FAFB', r: 6 });
        var yy = y + 16;
        blocks.forEach(function (r) {
          r.forEach(function (blk, i) {
            var x = M + 16 + (blk.full ? 0 : i * colW);
            d.text(x, yy, blk.label, { size: 8, color: MUTED });
            blk.lines.forEach(function (ln, k) { d.text(x, yy + 13 + k * 12, ln, { size: 9.5, color: BODY }); });
          });
          yy += Math.max.apply(null, r.map(function (x) { return x.h; })) + 8;
        });
        y += boxH + 18;
      }

      // Líneas
      var cQty = M + 340, cPrice = M + 430, cAmt = R;
      function head() {
        d.rect(M, y, Wc, 22, { fill: '#F3F4F6' });
        d.text(M + 10, y + 14.5, 'Concepto', { size: 8.5, bold: true, color: BODY });
        d.text(cQty, y + 14.5, 'Cant.', { size: 8.5, bold: true, color: BODY, align: 'center' });
        d.text(cPrice, y + 14.5, 'Precio', { size: 8.5, bold: true, color: BODY, align: 'right' });
        d.text(cAmt - 10, y + 14.5, 'Importe', { size: 8.5, bold: true, color: BODY, align: 'right' });
        y += 22;
      }
      ensure(60);
      head();
      (inv.lines || []).forEach(function (l) {
        var nameL = d.wrap(l.name || '', 10, true, 290);
        var descL = l.description ? d.wrap(l.description, 8.5, false, 290) : [];
        var h = 12 + nameL.length * 13 + descL.length * 11 + 4;
        if (d.paged && y + h > d.H - 48) { d.addPage(); y = 48; head(); }
        var ty = y + 16;
        nameL.forEach(function (ln, k) { d.text(M + 10, ty + k * 13, ln, { size: 10, bold: true, color: STRONG }); });
        descL.forEach(function (ln, k) { d.text(M + 10, ty + nameL.length * 13 + k * 11, ln, { size: 8.5, color: MUTED }); });
        d.text(cQty, ty, String(l.qty), { size: 10, color: BODY, align: 'center' });
        d.text(cPrice, ty, C.money(l.price), { size: 10, color: BODY, align: 'right' });
        d.text(cAmt - 10, ty, C.money(C.lineAmount(l)), { size: 10, color: STRONG, align: 'right' });
        y += h;
        d.line(M, y, R, y, BORDER);
      });
      y += 16;

      // Totales
      var rows = [['Subtotal', C.money(inv.subtotal)]];
      if (inv.discount) rows.push(['Descuento', '-' + C.money(inv.discount)]);
      if (inv.tax) rows.push(['IVU' + (inv.taxRate ? ' (' + inv.taxRate + '%)' : ''), C.money(inv.tax)]);
      if (inv.extra) rows.push(['Otros cargos', C.money(inv.extra)]);
      ensure(rows.length * 16 + 70);
      var lx = M + 300;
      rows.forEach(function (r) { d.text(lx, y, r[0], { size: 10, color: BODY }); d.text(cAmt - 10, y, r[1], { size: 10, color: BODY, align: 'right' }); y += 16; });
      d.line(lx, y - 6, R, y - 6, '#D1D5DB');
      y += 10;
      d.text(lx, y, 'Total', { size: 12.5, bold: true, color: STRONG });
      d.text(cAmt - 10, y, C.money(inv.total), { size: 12.5, bold: true, color: STRONG, align: 'right' });
      y += 18;
      d.text(lx, y, 'Pagado', { size: 10, color: BODY });
      d.text(cAmt - 10, y, C.money(v.paid), { size: 10, color: BODY, align: 'right' });
      y += 8;
      d.rect(lx - 8, y, R - lx + 8, 24, { fill: v.balance > 0 ? '#FEF3E2' : '#EAF7EE', r: 5 });
      d.text(lx, y + 16, 'Saldo pendiente', { size: 10.5, bold: true, color: v.balance > 0 ? '#92400E' : '#166534' });
      d.text(cAmt - 10, y + 16, C.money(v.balance), { size: 10.5, bold: true, color: v.balance > 0 ? '#92400E' : '#166534', align: 'right' });
      y += 44;

      // Nota y pie
      if (inv.note) {
        var noteL = d.wrap(inv.note, 9.5, false, Wc);
        ensure(noteL.length * 12 + 10);
        noteL.forEach(function (ln) { d.text(M, y, ln, { size: 9.5, color: BODY }); y += 12; });
        y += 10;
      }
      var foot = [[b.thanks || ('Gracias por preferir ' + b.name + '.'), 10, true, STRONG]];
      if (b.terms) foot.push([b.terms, 8.5, false, MUTED]);
      if (inv.source === 'historial') foot.push(['Importada del historial de Factura.', 8.5, false, MUTED]);
      var footLines = [];
      foot.forEach(function (f) { d.wrap(f[0], f[1], f[2], Wc).forEach(function (ln) { footLines.push([ln, f[1], f[2], f[3]]); }); });
      ensure(footLines.length * 13 + 14);
      d.line(M, y - 4, R, y - 4, BORDER);
      y += 12;
      footLines.forEach(function (f) { d.text(M, y, f[0], { size: f[1], bold: f[2], color: f[3] }); y += 13; });

      if (inv.voided) d.stampAll('ANULADA');
      return d;
  }

  /* Factura como PDF (Uint8Array). */
  C.invoicePdf = function (inv, v) {
    return logoJpeg(C.settings.business.logo).then(function (logo) { return layout(new Doc(), inv, v, logo).output(); });
  };

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([document.fonts.load('400 12px Rubik'), document.fonts.load('600 12px Rubik')]).catch(function () {});
  }

  /* Factura como imagen: devuelve el lienzo (1224 px de ancho, el alto que haga falta). */
  C.invoiceCanvas = function (inv, v) {
    return fontsReady().then(function () { return logoJpeg(C.settings.business.logo); }).then(function (logo) {
      return layout(new Img(), inv, v, logo).render(2);
    });
  };

  C.canvasBytes = function (cv, mime, quality) {
    return new Promise(function (resolve, reject) {
      cv.toBlob(function (blob) {
        if (!blob) { reject(new Error('No se pudo crear la imagen.')); return; }
        blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, mime || 'image/jpeg', quality || 0.92);
    });
  };

  /* Factura como JPG (Uint8Array). */
  C.invoiceJpg = function (inv, v) {
    return C.invoiceCanvas(inv, v).then(function (cv) { return C.canvasBytes(cv, 'image/jpeg', 0.92); });
  };
})();
