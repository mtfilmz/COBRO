/* Cobro · base de datos local (IndexedDB) y reglas del negocio.
   Todo se guarda primero en este equipo; la app funciona completa sin internet. */
(function () {
  'use strict';
  var C = (window.Cobro = window.Cobro || {});

  var DB_NAME = 'cobro';
  var DB_VERSION = 2;
  var STORES = ['users', 'customers', 'catalog', 'invoices', 'payments', 'photos', 'audit', 'batches', 'outbox'];
  var MEMORY = ['users', 'customers', 'catalog', 'invoices', 'payments', 'audit', 'batches', 'outbox'];
  var idb = null;

  C.data = { users: [], customers: [], catalog: [], invoices: [], payments: [], audit: [], batches: [], outbox: [] };
  C.session = { user: null };

  /* Copia en la nube: lo que se sube y la cola de cambios pendientes ('almacén/id' → hora del cambio). */
  C.SYNCED = ['customers', 'catalog', 'invoices', 'payments', 'photos', 'batches'];
  C.syncq = {};
  try { C.nubeOn = !!(JSON.parse(localStorage.getItem('cobro-nube') || '{}') || {}).on; } catch (e) { C.nubeOn = false; }

  C.DEFAULT_SETTINGS = {
    business: {
      name: 'Super Mobile Tech Repair',
      address: 'PR-185 Km 5.0, Campo Rico, Canóvanas, PR 00729',
      phone: '787-500-1324',
      instagram: '@supermobilepr',
      email: 'supermobilepr@gmail.com',
      logo: '',
      thanks: 'Gracias por preferir Super Mobile Tech Repair.',
      terms: ''
    },
    billing: {
      prefixes: { venta: 'VEN', servicio: 'SER', reparacion: 'REP' },
      tax: { venta: 0, servicio: 0, reparacion: 0 },
      methods: ['Efectivo', 'ATH Móvil', 'Tarjeta', 'Transferencia'],
      warrantyDefault: 30
    }
  };
  C.settings = JSON.parse(JSON.stringify(C.DEFAULT_SETTINGS));
  C.counters = { venta: 0, servicio: 0, reparacion: 0 };

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  C.openDb = function () {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Este equipo no permite guardar datos locales.')); return; }
      var open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = function () {
        var db = open.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) {
            var st = db.createObjectStore(s, { keyPath: 'id' });
            if (s === 'photos' || s === 'payments') st.createIndex('invoiceId', 'invoiceId', { unique: false });
          }
        });
      };
      open.onsuccess = function () { idb = open.result; resolve(idb); };
      open.onerror = function () { reject(open.error); };
    });
  };

  function getAll(store) {
    return req(idb.transaction(store, 'readonly').objectStore(store).getAll());
  }

  C.load = function () {
    return Promise.all(MEMORY.map(getAll).concat([getAll('kv')])).then(function (res) {
      MEMORY.forEach(function (s, i) { C.data[s] = res[i] || []; });
      var kv = res[MEMORY.length] || [];
      kv.forEach(function (row) {
        if (row.key === 'settings') C.settings = mergeSettings(row.value);
        if (row.key === 'counters') C.counters = Object.assign({ venta: 0, servicio: 0, reparacion: 0 }, row.value);
        if (row.key === 'syncq') C.syncq = Object.assign({}, row.value || {});
      });
      C.data.invoices.sort(byNewest);
      C.data.audit.sort(function (a, b) { return b.at - a.at; });
      if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
    });
  };

  function mergeSettings(v) {
    var d = JSON.parse(JSON.stringify(C.DEFAULT_SETTINGS));
    v = v || {};
    d.business = Object.assign(d.business, v.business || {});
    d.billing = Object.assign(d.billing, v.billing || {});
    d.billing.prefixes = Object.assign({}, C.DEFAULT_SETTINGS.billing.prefixes, (v.billing || {}).prefixes || {});
    d.billing.tax = Object.assign({}, C.DEFAULT_SETTINGS.billing.tax, (v.billing || {}).tax || {});
    if (!Array.isArray(d.billing.methods) || !d.billing.methods.length) d.billing.methods = C.DEFAULT_SETTINGS.billing.methods.slice();
    d.fintrack = Object.assign({}, v.fintrack || {});
    d._m = v._m || 0;
    return d;
  }

  function byNewest(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  }

  /* Guarda varios cambios en UNA transacción: o se guarda todo o nada. */
  /* Marca la hora de cada cambio local (_m) y, con la nube conectada, lo pone en la cola para subir.
     Los cambios que llegan de la nube (remote) no se vuelven a subir. */
  function track(changes) {
    var now = Date.now();
    var put = changes.put || {};
    var del = changes.del || {};
    var touched = false;
    C.SYNCED.forEach(function (s) {
      (put[s] || []).forEach(function (o) {
        o._m = Math.max(now, (o._m || 0) + 1);
        if (C.nubeOn) { C.syncq[s + '/' + o.id] = o._m; touched = true; }
      });
      (del[s] || []).forEach(function (id) {
        if (C.nubeOn) { C.syncq[s + '/' + id] = now; touched = true; }
      });
    });
    (put.kv || []).forEach(function (row) {
      if (row.key === 'settings' && row.value) {
        row.value._m = now;
        if (C.nubeOn) { C.syncq['settings/negocio'] = now; touched = true; }
      }
      if (row.key === 'counters' && C.nubeOn) { C.syncq['counters/numeros'] = now; touched = true; }
    });
    if (touched) {
      put.kv = (put.kv || []).filter(function (r) { return r.key !== 'syncq'; }).concat([{ key: 'syncq', value: C.syncq }]);
      changes.put = put;
    }
    return touched;
  }

  C.commit = function (changes) {
    var queued = !changes.remote && track(changes);
    var put = changes.put || {};
    var del = changes.del || {};
    var names = Object.keys(put).concat(Object.keys(del)).filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (!names.length) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(names, 'readwrite');
      Object.keys(put).forEach(function (s) { put[s].forEach(function (o) { tx.objectStore(s).put(o); }); });
      Object.keys(del).forEach(function (s) { del[s].forEach(function (id) { tx.objectStore(s).delete(id); }); });
      tx.oncomplete = function () {
        Object.keys(put).forEach(function (s) {
          if (s === 'kv') {
            put.kv.forEach(function (row) {
              if (row.key === 'settings') C.settings = mergeSettings(row.value);
              if (row.key === 'counters') C.counters = Object.assign({}, row.value);
            });
          } else if (C.data[s]) {
            put[s].forEach(function (o) {
              var arr = C.data[s];
              var i = arr.findIndex(function (x) { return x.id === o.id; });
              if (i >= 0) arr[i] = o; else arr.push(o);
            });
          }
        });
        Object.keys(del).forEach(function (s) {
          if (C.data[s]) C.data[s] = C.data[s].filter(function (x) { return del[s].indexOf(x.id) < 0; });
        });
        C.data.invoices.sort(byNewest);
        C.data.audit.sort(function (a, b) { return b.at - a.at; });
        if (queued && C.nubeChanged) C.nubeChanged();
        resolve();
      };
      tx.onerror = function () { reject(tx.error || new Error('No se pudo guardar.')); };
      tx.onabort = function () { reject(tx.error || new Error('No se pudo guardar.')); };
    });
  };

  C.getOne = function (store, id) {
    return req(idb.transaction(store, 'readonly').objectStore(store).get(id));
  };
  C.allIds = function (store) {
    return req(idb.transaction(store, 'readonly').objectStore(store).getAllKeys());
  };

  C.getPhotos = function (invoiceId) {
    return req(idb.transaction('photos', 'readonly').objectStore('photos').index('invoiceId').getAll(invoiceId)).then(function (rows) {
      return (rows || []).sort(function (a, b) { return a.createdAt - b.createdAt; });
    });
  };

  C.saveSettings = function (settings) {
    var row = { key: 'settings', value: settings };
    return C.commit({ put: { kv: [row], audit: [C.auditRow('Ajustes', 'Ajustes del negocio actualizados')] } });
  };

  /* ---------- Sesión y permisos ---------- */
  C.auditRow = function (action, detail, invoiceId) {
    var u = C.session.user;
    return { id: C.uid('log'), at: Date.now(), user: u ? u.email : 'sistema', role: u ? u.role : '', action: action, detail: detail || '', invoiceId: invoiceId || null };
  };

  C.isAdmin = function () { return !!(C.session.user && C.session.user.role === 'admin'); };

  /* Lo que el empleado nunca puede hacer: balance, reportes, anular, ajustes, usuarios, importar, editar catálogo. */
  C.can = function (action) {
    var u = C.session.user;
    if (!u) return false;
    if (u.role === 'admin') return true;
    var p = u.permissions || {};
    if (action === 'ver') return true;
    if (action === 'crear') return p.crear !== false;
    if (action === 'clientes') return p.clientes !== false;
    if (action === 'pagos') return !!p.pagos;
    return false;
  };

  /* Código de recuperación del administrador (por si olvida el PIN). */
  C.newRecoveryCode = function () {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    var rnd = new Uint32Array(8);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(rnd) : rnd.forEach(function (_, i) { rnd[i] = Math.floor(Math.random() * 1e9); });
    for (var i = 0; i < 8; i++) { out += abc[rnd[i] % abc.length]; if (i === 3) out += '-'; }
    return out;
  };
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  C.createAdmin = function (email, pin) {
    var salt = C.uid('s');
    var rsalt = C.uid('r');
    var code = C.newRecoveryCode();
    return Promise.all([C.hashPin(pin, salt), C.hashPin(normCode(code), rsalt)]).then(function (h) {
      var admin = {
        id: C.uid('usr'), email: email.trim().toLowerCase(), role: 'admin', status: 'activo', salt: salt, pinHash: h[0],
        recoverySalt: rsalt, recoveryHash: h[1],
        prefs: { theme: C.themeKey || 'claro', hideAmounts: false }, createdAt: Date.now()
      };
      C.session.user = admin;
      return C.commit({
        put: {
          users: [admin],
          kv: [{ key: 'settings', value: C.settings }, { key: 'counters', value: C.counters }],
          audit: [C.auditRow('Usuarios', 'Administrador creado: ' + admin.email)]
        }
      }).then(function () { return { admin: admin, code: code }; });
    });
  };

  C.resetRecoveryCode = function () {
    var admin = C.data.users.find(function (u) { return u.role === 'admin'; });
    var code = C.newRecoveryCode();
    var rsalt = C.uid('r');
    return C.hashPin(normCode(code), rsalt).then(function (h) {
      var copy = Object.assign({}, admin, { recoverySalt: rsalt, recoveryHash: h });
      if (C.session.user && C.session.user.id === copy.id) C.session.user = copy;
      return C.commit({ put: { users: [copy], audit: [C.auditRow('Usuarios', 'Código de recuperación nuevo')] } }).then(function () { return code; });
    });
  };

  C.recoverAdmin = function (code, newPin) {
    var admin = C.data.users.find(function (u) { return u.role === 'admin'; });
    if (!admin || !admin.recoveryHash) return Promise.reject(new Error('No hay código de recuperación guardado.'));
    return C.hashPin(normCode(code), admin.recoverySalt).then(function (h) {
      if (h !== admin.recoveryHash) throw new Error('El código de recuperación no es correcto.');
      var salt = C.uid('s');
      return C.hashPin(newPin, salt).then(function (ph) {
        var copy = Object.assign({}, admin, { salt: salt, pinHash: ph });
        return C.commit({ put: { users: [copy], audit: [{ id: C.uid('log'), at: Date.now(), user: admin.email, role: 'admin', action: 'Usuarios', detail: 'PIN del administrador cambiado con el código de recuperación', invoiceId: null }] } });
      });
    });
  };

  C.login = function (userId, pin) {
    var u = C.data.users.find(function (x) { return x.id === userId; });
    if (!u || u.status === 'revocado') return Promise.reject(new Error('Este usuario no tiene acceso.'));
    if (!u.pinHash) return Promise.reject(new Error('Este usuario todavía no tiene PIN. El administrador lo crea en Ajustes › Usuarios.'));
    return C.hashPin(pin, u.salt).then(function (hash) {
      if (hash !== u.pinHash) throw new Error('PIN incorrecto.');
      C.session.user = u;
      C.applyTheme((u.prefs && u.prefs.theme) || 'claro');
      return C.commit({ put: { audit: [C.auditRow('Sesión', 'Entró a la app')] } }).then(function () { return u; });
    });
  };

  C.lock = function () { C.session.user = null; };

  C.setPref = function (key, value) {
    var u = C.session.user;
    if (!u) return Promise.resolve();
    var copy = Object.assign({}, u, { prefs: Object.assign({}, u.prefs || {}) });
    copy.prefs[key] = value;
    C.session.user = copy;
    return C.commit({ put: { users: [copy] } });
  };

  C.setTheme = function (key) {
    C.applyTheme(key);
    return C.setPref('theme', key);
  };

  C.saveUser = function (user, newPin) {
    var copy = Object.assign({}, user);
    var p = Promise.resolve();
    if (newPin) {
      copy.salt = C.uid('s');
      p = C.hashPin(newPin, copy.salt).then(function (h) { copy.pinHash = h; });
    }
    return p.then(function () {
      if (C.session.user && C.session.user.id === copy.id) C.session.user = copy;
      return C.commit({ put: { users: [copy], audit: [C.auditRow('Usuarios', (user.role === 'admin' ? 'Administrador' : 'Empleado') + ' actualizado: ' + copy.email + (newPin ? ' (PIN nuevo)' : ''))] } });
    });
  };

  /* ---------- Cálculos ---------- */
  C.lineAmount = function (l) { return C.round2(C.num(l.qty) * C.num(l.price)); };

  C.totals = function (lines, discountType, discountValue, taxRate) {
    var subtotal = C.round2(lines.reduce(function (s, l) { return s + C.lineAmount(l); }, 0));
    var dv = C.num(discountValue);
    var discount = discountType === 'percent' ? C.round2(subtotal * dv / 100) : C.round2(dv);
    if (discount > subtotal) discount = subtotal;
    var tax = C.round2((subtotal - discount) * C.num(taxRate) / 100);
    return { subtotal: subtotal, discount: discount, tax: tax, total: C.round2(subtotal - discount + tax) };
  };

  C.paidMap = function () {
    var m = {};
    C.data.payments.forEach(function (p) { m[p.invoiceId] = C.round2((m[p.invoiceId] || 0) + C.num(p.amount)); });
    return m;
  };

  C.statusOf = function (inv, paid) {
    if (inv.voided) return 'Anulada';
    var bal = C.round2(inv.total - (paid || 0));
    if (bal <= 0) return 'Pagada';
    return paid > 0 ? 'Parcial' : 'Pendiente';
  };
  C.STATUS_CLASS = { Pagada: 'ok', Pendiente: 'pend', Parcial: 'par', Anulada: 'void' };

  C.view = function (inv, paidMap) {
    var paid = (paidMap || C.paidMap())[inv.id] || 0;
    var status = C.statusOf(inv, paid);
    return { paid: paid, balance: inv.voided ? 0 : Math.max(0, C.round2(inv.total - paid)), status: status };
  };

  C.mainConcept = function (inv) {
    var names = (inv.lines || []).map(function (l) { return l.name; }).filter(Boolean);
    if (inv.type === 'reparacion' && inv.device && inv.device.model && names.length === 0) return inv.device.model;
    return names.length ? names[0] + (names.length > 1 ? ' + ' + (names.length - 1) + ' más' : '') : '—';
  };

  C.formatNumber = function (type, n) {
    var pre = C.settings.billing.prefixes[type] || type.slice(0, 3).toUpperCase();
    return pre + '-' + ('0000' + n).slice(-5);
  };
  C.peekNumber = function (type) { return C.formatNumber(type, (C.counters[type] || 0) + 1); };

  /* ---------- Clientes ---------- */
  C.findCustomer = function (name, phone) {
    var d = C.digits(phone);
    var n = C.norm(name);
    if (d.length >= 7) {
      var byPhone = C.data.customers.find(function (c) { return C.digits(c.phone).slice(-7) === d.slice(-7) && d.slice(-7).length === 7; });
      if (byPhone) return byPhone;
    }
    return n ? C.data.customers.find(function (c) { return C.norm(c.name) === n; }) : null;
  };

  C.saveCustomer = function (c) {
    var now = Date.now();
    var row = Object.assign({ id: C.uid('cli'), createdAt: now }, c, { updatedAt: now });
    return C.commit({ put: { customers: [row], audit: [C.auditRow('Clientes', (c.id ? 'Cliente actualizado: ' : 'Cliente nuevo: ') + row.name)] } }).then(function () { return row; });
  };

  C.saveCatalogItem = function (it) {
    var row = Object.assign({ id: C.uid('cat'), active: true, createdAt: Date.now() }, it);
    return C.commit({ put: { catalog: [row], audit: [C.auditRow('Catálogo', (it.id ? 'Artículo actualizado: ' : 'Artículo nuevo: ') + row.name)] } }).then(function () { return row; });
  };

  /* ---------- Facturas ---------- */
  /* draft: {type, date, customer:{name, phone, sendTo}, device, lines, discountType, discountValue, note}
     pay: {amount, method} o null; photos: [dataUrl] */
  C.createInvoice = function (draft, pay, photos) {
    var type = draft.type;
    var counters = Object.assign({}, C.counters);
    counters[type] = (counters[type] || 0) + 1;
    var number = C.formatNumber(type, counters[type]);
    if (C.data.invoices.some(function (i) { return i.number === number; })) {
      return Promise.reject(new Error('El número ' + number + ' ya existe. Revisa la numeración en Ajustes › Facturación.'));
    }
    var now = Date.now();
    var put = { kv: [{ key: 'counters', value: counters }], invoices: [], audit: [] };

    var cust = C.findCustomer(draft.customer.name, draft.customer.phone);
    if (!cust) {
      cust = { id: C.uid('cli'), name: draft.customer.name.trim(), phone: draft.customer.phone.trim(), email: '', address: '', createdAt: now, updatedAt: now };
      put.customers = [cust];
      put.audit.push(C.auditRow('Clientes', 'Cliente nuevo: ' + cust.name));
    } else if (draft.customer.phone && !cust.phone) {
      cust = Object.assign({}, cust, { phone: draft.customer.phone.trim(), updatedAt: now });
      put.customers = [cust];
    }

    var taxRate = C.num(C.settings.billing.tax[type]);
    var lines = draft.lines.map(function (l) { return { name: l.name.trim(), description: (l.description || '').trim(), qty: C.num(l.qty), price: C.round2(l.price) }; });
    var t = C.totals(lines, draft.discountType, draft.discountValue, taxRate);
    var inv = {
      id: C.uid('fac'), number: number, type: type, date: draft.date || C.today(), createdAt: now,
      customerId: cust.id,
      customer: { name: draft.customer.name.trim(), phone: draft.customer.phone.trim(), sendTo: (draft.customer.sendTo || draft.customer.phone || '').trim() },
      device: type === 'reparacion' ? Object.assign({ statusAt: now }, draft.device) : null,
      lines: lines, discountType: draft.discountType || 'fixed', discountValue: C.num(draft.discountValue), taxRate: taxRate,
      subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total,
      note: (draft.note || '').trim(), source: 'nuevo', voided: false,
      createdBy: C.session.user ? C.session.user.email : ''
    };
    put.invoices.push(inv);
    put.audit.push(C.auditRow('Factura', 'Factura creada (' + C.TYPES[type].label + ', ' + C.money(inv.total) + ')', inv.id));

    if (pay && C.num(pay.amount) > 0) {
      var amount = Math.min(C.round2(pay.amount), inv.total);
      put.payments = [{ id: C.uuid(), invoiceId: inv.id, amount: amount, method: pay.method, date: inv.date, createdAt: now, createdBy: inv.createdBy, source: 'nuevo' }];
      put.audit.push(C.auditRow('Cobro', 'Cobrado ' + C.money(amount) + ' con ' + pay.method, inv.id));
      var row = C.fintrackOutboxRow ? C.fintrackOutboxRow(put.payments[0], inv) : null;
      if (row) put.outbox = [row];
    }
    if (photos && photos.length) {
      put.photos = photos.slice(0, 3).map(function (src, i) { return { id: C.uid('foto'), invoiceId: inv.id, dataUrl: src, createdAt: now + i, createdBy: inv.createdBy }; });
      put.audit.push(C.auditRow('Fotos', put.photos.length + ' foto(s) del equipo', inv.id));
    }
    return C.commit({ put: put }).then(function () {
      if (put.outbox && C.fintrackSync) setTimeout(C.fintrackSync, 300);
      return inv;
    });
  };

  C.addPayment = function (inv, amount, method, date) {
    var v = C.view(inv);
    amount = C.round2(amount);
    if (inv.voided) return Promise.reject(new Error('La factura está anulada.'));
    if (amount <= 0) return Promise.reject(new Error('Escribe un monto mayor que cero.'));
    if (amount > v.balance) return Promise.reject(new Error('El pago supera el saldo de ' + C.money(v.balance) + '.'));
    var p = { id: C.uuid(), invoiceId: inv.id, amount: amount, method: method, date: date || C.today(), createdAt: Date.now(), createdBy: C.session.user.email, source: 'nuevo' };
    var put = { payments: [p], audit: [C.auditRow('Cobro', 'Pago de ' + C.money(amount) + ' con ' + method, inv.id)] };
    var row = C.fintrackOutboxRow ? C.fintrackOutboxRow(p, inv) : null;
    if (row) put.outbox = [row];
    return C.commit({ put: put }).then(function () { if (row && C.fintrackSync) setTimeout(C.fintrackSync, 300); });
  };

  C.voidInvoice = function (inv, reason) {
    if (!C.isAdmin()) return Promise.reject(new Error('Solo el administrador puede anular facturas.'));
    var copy = Object.assign({}, inv, { voided: true, voidedAt: Date.now(), voidReason: reason, voidedBy: C.session.user.email });
    var cancel = C.data.outbox.filter(function (o) { return o.invoiceId === inv.id && o.status !== 'enviado'; })
      .map(function (o) { return Object.assign({}, o, { status: 'cancelado', lastError: 'Factura anulada antes de enviarse' }); });
    var put = { invoices: [copy], audit: [C.auditRow('Anulación', 'Factura anulada. Motivo: ' + reason, inv.id)] };
    if (cancel.length) put.outbox = cancel;
    return C.commit({ put: put });
  };

  C.setDeviceStatus = function (inv, status) {
    var copy = Object.assign({}, inv, { device: Object.assign({}, inv.device, { status: status, statusAt: Date.now() }) });
    return C.commit({ put: { invoices: [copy], audit: [C.auditRow('Equipo', 'Estado del equipo: ' + status, inv.id)] } });
  };

  C.addPhotos = function (inv, dataUrls) {
    var now = Date.now();
    var rows = dataUrls.map(function (src, i) { return { id: C.uid('foto'), invoiceId: inv.id, dataUrl: src, createdAt: now + i, createdBy: C.session.user.email }; });
    return C.commit({ put: { photos: rows, audit: [C.auditRow('Fotos', rows.length + ' foto(s) agregada(s)', inv.id)] } });
  };

  C.deletePhoto = function (photo) {
    if (!C.isAdmin()) return Promise.reject(new Error('Solo el administrador puede borrar fotos.'));
    return C.commit({ del: { photos: [photo.id] }, put: { audit: [C.auditRow('Fotos', 'Foto borrada', photo.invoiceId)] } });
  };

  /* ---------- Respaldo ---------- */
  C.exportBackup = function () {
    return getAll('photos').then(function (photos) {
      return {
        app: 'Cobro', version: 1, exportedAt: new Date().toISOString(),
        settings: C.settings, counters: C.counters,
        users: C.data.users.map(function (u) { return Object.assign({}, u); }),
        customers: C.data.customers, catalog: C.data.catalog, invoices: C.data.invoices, payments: C.data.payments,
        photos: photos, audit: C.data.audit, batches: C.data.batches, outbox: C.data.outbox
      };
    });
  };

  C.restoreBackup = function (b) {
    if (!b || b.app !== 'Cobro') return Promise.reject(new Error('Este archivo no es un respaldo de Cobro.'));
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(['kv'].concat(STORES), 'readwrite');
      ['kv'].concat(STORES).forEach(function (s) { tx.objectStore(s).clear(); });
      tx.objectStore('kv').put({ key: 'settings', value: b.settings || C.DEFAULT_SETTINGS });
      tx.objectStore('kv').put({ key: 'counters', value: b.counters || { venta: 0, servicio: 0, reparacion: 0 } });
      STORES.forEach(function (s) { (b[s] || []).forEach(function (o) { tx.objectStore(s).put(o); }); });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    }).then(C.load).then(function () { if (C.nubeAfterRestore) return C.nubeAfterRestore(); });
  };

  C.revertBatch = function (batch) {
    if (!C.isAdmin()) return Promise.reject(new Error('Solo el administrador puede revertir importaciones.'));
    var newPays = C.data.payments.filter(function (p) { return batch.invoiceIds.indexOf(p.invoiceId) >= 0 && p.source !== 'historial'; });
    if (newPays.length) return Promise.reject(new Error('Hay pagos nuevos en facturas de este lote. No se puede revertir.'));
    /* Los clientes del lote que ya tienen facturas nuevas se quedan. */
    var keepCustomers = {};
    C.data.invoices.forEach(function (i) { if (batch.invoiceIds.indexOf(i.id) < 0 && i.customerId) keepCustomers[i.customerId] = true; });
    var customerIds = (batch.customerIds || []).filter(function (id) { return !keepCustomers[id]; });
    return C.commit({
      del: { invoices: batch.invoiceIds, payments: batch.paymentIds, customers: customerIds, catalog: batch.catalogIds || [], batches: [batch.id] },
      put: { audit: [C.auditRow('Importación', 'Lote revertido: ' + batch.file)] }
    });
  };
})();
