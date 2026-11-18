/* Cobro · importar el historial de la app Factura (respaldo .json o CSV de historial) */
(function () {
  'use strict';
  var C = (window.Cobro = window.Cobro || {});

  /* Palabras para adivinar el tipo cuando Factura no lo dice. Se revisa línea por línea. */
  var REPAIR = ['reparacion', 'reparar', 'cambio de', 'reemplazo', 'remplazo', 'pantalla', 'psntalla', 'lcd', 'touch', 'digitalizador',
    'back glass', 'tapa trasera', 'tapa tracera', 'flip de tapa', 'frame', 'franme', 'bateria', 'puerto', 'conector', 'hdmi', 'placa',
    'ventilador', 'abanico', 'cooler', 'flex', 'camara', 'lente', 'boton', 'joystick', 'jostik', 'disco duro', 'ssd', 'teclado',
    'pemic', 'pmic', 'modulo', 'liquid metal'];
  var SERVICE = ['limpieza', 'diagnosti', 'chequeo', 'verificacion', 'revision', 'instalacion', 'servicio', 'mantenimiento', 'mantemibiento',
    'configuracion', 'pasta termica', 'mano de obra', 'desbloque', 'frp', 'icloud', 'cuenta de google', 'cuenta google', 'borrado',
    'borrar', 'activacion', 'actualizacion', 'restauracion', 'sistema operativo', 'systema operativo', 'windows', 'office',
    'paquete de oficina', 'garantia'];
  var STRONG = ['reparacion', 'reparar', 'cambio de', 'reemplazo', 'remplazo', 'hausing', 'housing'];
  var SYMPTOM = ['no enciende', 'no carga', 'no conecta', 'no imagen', 'no da imagen', 'no funciona', 'se apaga', 'dano', 'mojado'];
  var SALE = [' case ', ' cover ', ' coves ', 'protector', 'cargador', 'charger', ' cable ', ' sim '];

  function has(text, words) {
    var t = ' ' + C.norm(text).replace(/[^a-z0-9ñ]+/g, ' ') + ' ';
    return words.some(function (w) { return t.indexOf(w) >= 0; });
  }

  function typeFromText(v) {
    var t = C.norm(v);
    if (!t) return '';
    if (t.indexOf('repar') === 0) return 'reparacion';
    if (t.indexOf('serv') === 0) return 'servicio';
    if (t.indexOf('vent') === 0) return 'venta';
    return '';
  }

  function lineText(l) { return l.name + ' ' + (l.description || ''); }
  /* Una línea es reparación si nombra una pieza o arreglo y no es un accesorio que se vende (case, protector, cargador…). */
  function lineIsRepair(l) { var t = lineText(l); return has(t, STRONG) || (has(t, REPAIR) && !has(l.name, SALE)); }

  /* Regla de clasificación: artículos "venta" → Venta; si alguna línea es de reparación → Reparación;
     si alguna es de servicio (mantenimiento, diagnóstico, desbloqueo, instalación…) → Servicio;
     si solo describe una falla ("no enciende") → Reparación; si no → Venta. */
  C.classify = function (lines, explicit) {
    var forced = typeFromText(explicit);
    if (forced) return forced;
    var pool = lines.some(function (l) { return l.type; })
      ? lines.filter(function (l) { return l.type !== 'venta'; })
      : lines;
    if (!pool.length) return 'venta';
    if (pool.some(lineIsRepair)) return 'reparacion';
    if (pool.some(function (l) { return has(lineText(l), SERVICE); })) return 'servicio';
    if (pool.some(function (l) { return has(lineText(l), SYMPTOM) && !has(l.name, SALE); })) return 'reparacion';
    return lines.some(function (l) { return l.type; }) ? 'servicio' : 'venta';
  };

  C.guessItemType = function (name) { return C.classify([{ name: name }]); };

  /* ---------- CSV ---------- */
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
    return rows;
  }

  var HEADERS = {
    number: ['numero', 'number', 'no.', 'factura', 'n°', 'no'],
    date: ['fecha', 'date'],
    client: ['cliente', 'client', 'customer'],
    phone: ['telefono', 'phone', 'tel'],
    product: ['producto', 'product', 'articulo', 'concepto', 'item', 'descripcion'],
    quantity: ['cantidad', 'quantity', 'qty', 'cant.'],
    price: ['precio', 'price', 'tarifa', 'monto'],
    paid: ['pagado', 'paid', 'pago'],
    type: ['tipo', 'type']
  };

  function fromCsv(text) {
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('El CSV no tiene filas.');
    var head = rows[0].map(function (h) { return C.norm(h); });
    var col = {};
    Object.keys(HEADERS).forEach(function (k) {
      col[k] = head.findIndex(function (h) { return HEADERS[k].indexOf(h) >= 0; });
    });
    ['number', 'date', 'client', 'product', 'price'].forEach(function (k) {
      if (col[k] < 0) throw new Error('Falta la columna "' + { number: 'Número', date: 'Fecha', client: 'Cliente', product: 'Producto', price: 'Precio' }[k] + '" en el CSV.');
    });
    var groups = {}, order = [], errors = [];
    rows.slice(1).forEach(function (r, idx) {
      var get = function (k) { return col[k] >= 0 ? String(r[col[k]] || '').trim() : ''; };
      var number = get('number');
      var date = C.parseDate(get('date'));
      if (!number || !date || !get('client') || !get('product')) { errors.push('Fila ' + (idx + 2) + ': revisa número, fecha, cliente y producto.'); return; }
      var g = groups[number];
      if (!g) {
        g = groups[number] = { srcId: number, number: number, date: date, clientName: get('client'), clientPhone: get('phone'), lines: [], paid: 0, typeHint: get('type'), payments: [], cancelled: false };
        order.push(number);
      }
      g.lines.push({ name: get('product'), description: '', qty: C.num(get('quantity')) || 1, price: C.num(get('price')), type: '' });
      var paid = C.num(get('paid'));
      if (paid > g.paid) g.paid = paid;
    });
    var invoices = order.map(function (n) {
      var g = groups[n];
      var subtotal = C.round2(g.lines.reduce(function (s, l) { return s + l.qty * l.price; }, 0));
      g.subtotal = subtotal; g.discount = 0; g.tax = 0; g.extra = 0; g.total = subtotal;
      if (g.paid > 0) g.payments = [{ amount: Math.min(g.paid, subtotal), date: g.date, method: 'Importado' }];
      return g;
    });
    return { kind: 'csv', invoices: invoices, clients: [], products: [], errors: errors };
  }

  /* ---------- Respaldo .json de Factura ---------- */
  function flat(r) { return r && r.payload ? Object.assign({ id: r.id }, r.payload) : r; }

  function fromJson(obj) {
    var clients = [], products = [], invoices = [], payments = [], settings = obj.settings || {};
    if (Array.isArray(obj.records)) {
      obj.records.forEach(function (r) {
        var p = flat(r);
        if (r.kind === 'client') clients.push(p);
        else if (r.kind === 'product') products.push(p);
        else if (r.kind === 'invoice') invoices.push(p);
        else if (r.kind === 'payment') payments.push(p);
        else if (r.kind === 'settings') settings = Object.assign({}, settings, p);
      });
    } else {
      clients = (obj.clients || obj.customers || []).map(flat);
      products = (obj.products || obj.catalog || []).map(flat);
      invoices = (obj.invoices || []).map(flat);
      payments = (obj.payments || []).map(flat);
    }
    if (!invoices.length && !clients.length) throw new Error('El archivo no tiene facturas ni clientes de Factura.');
    var payBy = {};
    payments.forEach(function (p) {
      if (!p || !p.invoiceId) return;
      (payBy[p.invoiceId] = payBy[p.invoiceId] || []).push({ amount: C.num(p.amount), date: C.parseDate(p.date) || '', method: p.method || 'Importado' });
    });
    var inclusive = settings.taxMode === 'inclusive';
    var lineDiscountMode = settings.discountMode === 'line';
    var clientById = {};
    clients.forEach(function (c) { if (c && c.id) clientById[c.id] = c; });
    var errors = [];
    var list = invoices.filter(Boolean).map(function (p, idx) {
      var lines = (p.lines || []).map(function (l) {
        return {
          name: String(l.name || 'Artículo').trim(), description: String(l.description || '').trim(),
          qty: C.num(l.quantity != null ? l.quantity : l.qty) || 1, price: C.num(l.price),
          tax: C.num(l.tax), discount: C.num(l.discount), type: l.type === 'venta' ? 'venta' : (l.type ? 'servicio' : '')
        };
      });
      var subtotal = lines.reduce(function (s, l) { return s + l.qty * l.price; }, 0);
      var discount = lineDiscountMode
        ? lines.reduce(function (s, l) { return s + l.qty * l.price * l.discount / 100; }, 0)
        : (p.discountType === 'fixed' ? C.num(p.discount) : subtotal * C.num(p.discount) / 100);
      var ratio = subtotal ? (subtotal - discount) / subtotal : 0;
      var tax = lines.reduce(function (s, l) { return s + l.qty * l.price * ratio * (inclusive ? l.tax / (100 + l.tax) : l.tax / 100); }, 0);
      var extra = C.num(p.shipping) + C.num(p.adjustment);
      var total = C.round2(subtotal - discount + (inclusive ? 0 : tax) + extra);
      var cli = clientById[p.clientId] || {};
      var date = C.parseDate(p.date);
      if (!p.number || !date) errors.push('Factura ' + (p.number || '#' + (idx + 1)) + ': falta número o fecha.');
      var pays = payBy[p.id] || [];
      return {
        srcId: p.id || p.number, number: String(p.number || ''), date: date,
        clientName: String(p.client || cli.name || 'Cliente sin nombre').trim(),
        clientPhone: String(p.clientPhone || cli.phone || '').trim(), srcClientId: p.clientId || '',
        lines: lines, subtotal: C.round2(subtotal), discount: C.round2(discount), tax: inclusive ? 0 : C.round2(tax), extra: C.round2(extra), total: total,
        payments: pays.map(function (x) { return { amount: x.amount, date: x.date || date, method: x.method }; }),
        paid: C.round2(pays.reduce(function (s, x) { return s + x.amount; }, 0)),
        cancelled: p.status === 'Cancelada', typeHint: ''
      };
    }).filter(function (i) { return i.number && i.date; });
    return { kind: 'json', invoices: list, clients: clients.filter(Boolean), products: products.filter(Boolean), errors: errors };
  }

  C.parseImport = function (text, filename) {
    var trimmed = text.trim();
    var parsed;
    if (/\.json$/i.test(filename) || trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
      var obj;
      try { obj = JSON.parse(trimmed); } catch (e) { throw new Error('El archivo .json está dañado o incompleto.'); }
      if (obj && obj.app === 'Cobro') throw new Error('Este es un respaldo de Cobro. Para recuperarlo usa Ajustes › Datos y respaldo.');
      if (Array.isArray(obj)) obj = { records: obj };
      parsed = fromJson(obj);
    } else {
      parsed = fromCsv(text);
    }
    var existing = {};
    C.data.invoices.forEach(function (i) { existing[i.originalNumber || i.number] = true; });
    parsed.invoices.forEach(function (inv) {
      inv.duplicate = !!existing[inv.number];
      inv.sourceLabel = inv.lines.length && inv.lines.every(function (l) { return l.type === 'venta'; }) ? 'Venta' : (inv.lines.some(function (l) { return l.type; }) ? 'Servicio' : '—');
      inv.suggested = C.classify(inv.lines, inv.typeHint);
      inv.chosen = inv.suggested;
      if (inv.paid > inv.total) inv.paid = inv.total;
    });
    parsed.file = filename;
    parsed.newCount = parsed.invoices.filter(function (i) { return !i.duplicate; }).length;
    parsed.payCount = parsed.invoices.reduce(function (s, i) { return s + (i.duplicate ? 0 : i.payments.length); }, 0);
    return parsed;
  };

  /* Guarda todo en un solo lote que se puede revertir. Los números originales se conservan. */
  C.commitImport = function (parsed) {
    if (!C.isAdmin()) return Promise.reject(new Error('Solo el administrador puede importar.'));
    var now = Date.now();
    var batchId = C.uid('lote');
    var put = { customers: [], catalog: [], invoices: [], payments: [], batches: [], audit: [] };
    var createdCustomers = {};
    var custMap = {};

    function customerFor(name, phone, srcId) {
      if (srcId && custMap[srcId]) return custMap[srcId];
      var key = C.norm(name) + '|' + C.digits(phone).slice(-7);
      if (createdCustomers[key]) return createdCustomers[key];
      var found = C.findCustomer(name, phone);
      if (found) { if (srcId) custMap[srcId] = found; return found; }
      var c = { id: C.uid('cli'), name: name, phone: phone || '', email: '', address: '', createdAt: now, updatedAt: now, importBatchId: batchId };
      put.customers.push(c);
      createdCustomers[key] = c;
      if (srcId) custMap[srcId] = c;
      return c;
    }

    (parsed.clients || []).forEach(function (cl) {
      if (!cl.name) return;
      var c = customerFor(String(cl.name).trim(), String(cl.phone || '').trim(), cl.id);
      if (put.customers.indexOf(c) >= 0) { c.email = cl.email || ''; c.address = cl.address || ''; }
    });

    var catalogNames = {};
    C.data.catalog.forEach(function (it) { catalogNames[C.norm(it.name)] = true; });
    (parsed.products || []).forEach(function (pr) {
      var n = String(pr.name || '').trim();
      if (!n || catalogNames[C.norm(n)]) return;
      catalogNames[C.norm(n)] = true;
      put.catalog.push({ id: C.uid('cat'), name: n, price: C.round2(pr.price), code: pr.code || '', type: C.guessItemType(n), active: pr.active !== false, createdAt: now, importBatchId: batchId });
    });

    var imported = 0, skipped = 0;
    parsed.invoices.forEach(function (src) {
      if (src.duplicate) { skipped++; return; }
      var cust = customerFor(src.clientName, src.clientPhone, src.srcClientId);
      var type = src.chosen || src.suggested;
      var inv = {
        id: C.uid('fac'), number: src.number, originalNumber: src.number, type: type, date: src.date, createdAt: now,
        customerId: cust.id, customer: { name: src.clientName, phone: src.clientPhone || cust.phone || '', sendTo: src.clientPhone || cust.phone || '' },
        device: type === 'reparacion' ? { type: '', model: '', serial: '', issue: '', accessories: '', warranty: 0, status: 'Entregado', statusAt: now } : null,
        lines: src.lines.map(function (l) { return { name: l.name, description: l.description, qty: l.qty, price: C.round2(l.price) }; }),
        discountType: 'fixed', discountValue: src.discount, taxRate: 0,
        subtotal: src.subtotal, discount: src.discount, tax: src.tax, extra: src.extra || 0, total: src.total,
        note: '', source: 'historial', importBatchId: batchId, voided: !!src.cancelled,
        voidReason: src.cancelled ? 'Cancelada en Factura' : '', createdBy: C.session.user.email
      };
      put.invoices.push(inv);
      var left = inv.total;
      src.payments.forEach(function (p) {
        var amt = Math.min(C.round2(p.amount), C.round2(left));
        if (amt <= 0) return;
        left -= amt;
        put.payments.push({ id: C.uid('pag'), invoiceId: inv.id, amount: amt, method: p.method || 'Importado', date: p.date || inv.date, createdAt: now, createdBy: C.session.user.email, source: 'historial', importBatchId: batchId });
      });
      imported++;
    });

    var batch = {
      id: batchId, at: now, file: parsed.file, by: C.session.user.email,
      counts: { invoices: imported, skipped: skipped, payments: put.payments.length, customers: put.customers.length, catalog: put.catalog.length },
      invoiceIds: put.invoices.map(function (i) { return i.id; }), paymentIds: put.payments.map(function (p) { return p.id; }),
      customerIds: put.customers.map(function (c) { return c.id; }), catalogIds: put.catalog.map(function (c) { return c.id; })
    };
    put.batches.push(batch);
    put.audit.push(C.auditRow('Importación', 'Importadas ' + imported + ' facturas de ' + parsed.file + (skipped ? ' (' + skipped + ' duplicadas omitidas)' : '')));
    Object.keys(put).forEach(function (k) { if (!put[k].length) delete put[k]; });
    return C.commit({ put: put }).then(function () { return batch; });
  };
})();
