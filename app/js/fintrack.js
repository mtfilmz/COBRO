/* Cobro · conexión con FinTrack: cada pago nuevo se envía como ingreso.
   Sin internet los pagos esperan en una cola y se envían solos al volver la conexión.
   FinTrack no duplica: el mismo pago (mismo identificador y mismos datos) devuelve el mismo recibo.
   Los pagos cobrados en otro equipo (que llegan por la nube) también los envía el equipo conectado a FinTrack. */
(function () {
  'use strict';
  var C = window.Cobro;
  var syncing = false;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var METHODS = { 'efectivo': 'cash', 'tarjeta': 'card', 'transferencia': 'transfer', 'ath movil': 'transfer' };
  var CATEGORY = { venta: 'Ventas', servicio: 'Servicios', reparacion: 'Reparaciones' };

  function invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args || {}); }
  function cfg() { return C.settings.fintrack || {}; }

  C.fintrackConnected = function () { var f = cfg(); return !!(f.bindingId && f.enabled); };

  C.fintrackPayload = function (payment, inv) {
    var f = cfg();
    var names = (inv.lines || []).map(function (l) { return String(l.name || '').trim(); }).filter(Boolean).join(', ');
    var equipment = names || ('Factura ' + inv.number);
    if (inv.type === 'reparacion' && inv.device && inv.device.model) equipment = inv.device.model.trim() + ' — ' + equipment;
    equipment = equipment.slice(0, 400);
    var client = String(inv.customer.name || 'Cliente').trim().slice(0, 200) || 'Cliente';
    var p = {
      version: 1, source_app: 'cobro', binding_id: f.bindingId, payment_id: payment.id,
      repair_id: String(inv.number).slice(0, 200), client_name: client
    };
    var phone = String(inv.customer.phone || '').trim().slice(0, 20);
    if (phone) p.client_phone = phone;
    p.equipment = equipment;
    p.amount = C.round2(payment.amount);
    p.paid_on = payment.date;
    p.method = METHODS[C.norm(payment.method)] || 'other';
    p.type = 'income';
    p.source = 'business';
    p.category = CATEGORY[inv.type] || 'Reparaciones';
    p.description = 'Pago de ' + client + ' — ' + equipment;
    return p;
  };

  /* Fila de la cola para un pago nuevo; solo si Cobro está conectado y el pago tiene identificador válido. */
  C.fintrackOutboxRow = function (payment, inv) {
    if (!C.fintrackConnected() || payment.source !== 'nuevo' || !UUID.test(payment.id) || !(payment.amount > 0)) return null;
    return {
      id: payment.id, invoiceId: inv.id, number: inv.number, amount: C.round2(payment.amount),
      payload: JSON.stringify(C.fintrackPayload(payment, inv)),
      status: 'pendiente', tries: 0, nextAt: 0, createdAt: Date.now(), lastError: '', movementId: ''
    };
  };

  C.fintrackRowFor = function (paymentId) {
    return C.data.outbox.find(function (o) { return o.id === paymentId; }) || null;
  };

  C.FT_LABEL = { pendiente: 'Pendiente de enviar', enviado: 'Enviado a FinTrack', conflicto: 'Rechazado por FinTrack', rechazado: 'Rechazado por FinTrack', cancelado: 'No se envió' };
  C.FT_CLASS = { pendiente: 'pend', enviado: 'ok', conflicto: 'void', rechazado: 'void', cancelado: 'void' };

  function save(rows) { return rows.length ? C.commit({ put: { outbox: rows } }) : Promise.resolve(); }

  /* Desde cuándo Cobro manda pagos a FinTrack. Se guarda en los ajustes de facturación, que viajan por la nube,
     para que cualquier equipo conectado a FinTrack sepa desde qué pago tiene que enviar. */
  /* Primera vez que Cobro se conectó a FinTrack (18 nov 2026, 8:51 a. m.). Sirve de respaldo si el equipo que
     se conectó primero ya no se usa: así un equipo conectado después también recupera los pagos atrasados. */
  var INICIO = Date.parse('2026-11-18T08:51:00-04:00');
  function desde() {
    var vals = [Number((C.settings.billing || {}).fintrackDesde) || 0, Number(cfg().connectedAt) || 0, INICIO]
      .filter(function (v) { return v > 0; });
    return vals.length ? Math.min.apply(null, vals) : 0;
  }
  function guardarDesde() {
    var b = Number(cfg().connectedAt) || 0;
    var a = Number((C.settings.billing || {}).fintrackDesde) || 0;
    if (!b || (a && a <= b)) return Promise.resolve();
    var s = JSON.parse(JSON.stringify(C.settings));
    s.billing.fintrackDesde = b;
    return C.commit({ put: { kv: [{ key: 'settings', value: s }] } });
  }

  /* Pagos nuevos que no están en la cola de este equipo (cobrados en otro equipo, o en este antes de tener la
     conexión cargada): se ponen en la cola. Solo pagos hechos desde que Cobro está conectado a FinTrack y de
     facturas no anuladas. Se espera ESPERA para dejar que el equipo donde se cobró lo mande primero.
     FinTrack nunca duplica: si ya tiene el pago, lo dice y aquí se marca como enviado. */
  var ESPERA = 10 * 60 * 1000;
  C.fintrackQueueMissing = function () {
    if (!C.fintrackConnected()) return Promise.resolve(0);
    var since = desde();
    if (!since) return Promise.resolve(0);
    var limite = Date.now() - ESPERA;
    var known = {};
    C.data.outbox.forEach(function (o) { known[o.id] = true; });
    var invById = {};
    C.data.invoices.forEach(function (i) { invById[i.id] = i; });
    var rows = [];
    C.data.payments.forEach(function (p) {
      if (known[p.id] || p.source !== 'nuevo' || !((p.createdAt || 0) >= since) || p.createdAt > limite) return;
      var inv = invById[p.invoiceId];
      if (!inv || inv.voided) return;
      var row = C.fintrackOutboxRow(p, inv);
      if (row) { row.createdAt = p.createdAt || row.createdAt; row.otroEquipo = true; rows.push(row); }
    });
    return save(rows).then(function () { return rows.length; });
  };

  /* Envía los pagos pendientes, uno por uno, en orden. */
  C.fintrackSync = function () {
    if (syncing || !C.isDesktop() || !C.fintrackConnected() || !navigator.onLine) return Promise.resolve();
    syncing = true;
    return guardarDesde().then(C.fintrackQueueMissing).then(function () { syncing = false; return enviar(); }, function (err) { syncing = false; throw err; })
      .then(function () { return marcarPagos(C.data.outbox.filter(function (o) { return o.status === 'enviado'; })); });
  };

  /* La marca "Enviado a FinTrack" se guarda en el pago, que viaja por la nube: así todos los equipos (también los
     que no están conectados a FinTrack) saben qué pagos ya llegaron. */
  function marcarPagos(rows) {
    var byId = {};
    C.data.payments.forEach(function (p) { byId[p.id] = p; });
    var put = [];
    rows.forEach(function (o) {
      var p = byId[o.id];
      if (!p || (p.ft && p.ft.status === 'enviado')) return;
      put.push(Object.assign({}, p, { ft: { status: 'enviado', at: o.sentAt || Date.now(), yaEstaba: !!o.yaEstaba } }));
    });
    return put.length ? C.commit({ put: { payments: put } }) : Promise.resolve();
  }

  C.fintrackDesde = function () { return desde(); };

  /* Estado de un pago frente a FinTrack, para la página Pendientes y el detalle de la factura.
     key: enviado | pendiente | problema | sin_enviar | no_aplica */
  C.ftEstado = function (p, inv) {
    var since = desde();
    if (p.source !== 'nuevo' || !UUID.test(p.id || '') || !(C.num(p.amount) > 0) || (since && (p.createdAt || 0) < since)) {
      return { key: 'no_aplica', label: 'No se envía', detail: p.source === 'nuevo' ? 'Pago anterior a la conexión con FinTrack.' : 'Historial importado: ya estaba reportado.' };
    }
    if (p.ft && p.ft.status === 'enviado') return { key: 'enviado', label: 'Enviado a FinTrack', detail: '' };
    var o = C.fintrackRowFor(p.id);
    if (o && o.status === 'enviado') return { key: 'enviado', label: 'Enviado a FinTrack', detail: '' };
    if (inv && inv.voided) return { key: 'no_aplica', label: 'No se envía', detail: 'La factura está anulada.' };
    if (o && o.status === 'cancelado') return { key: 'no_aplica', label: 'No se envía', detail: 'La factura se anuló antes de enviarlo.' };
    if (o && (o.status === 'conflicto' || o.status === 'rechazado')) return { key: 'problema', label: 'Rechazado por FinTrack', detail: o.lastError || 'FinTrack no aceptó el pago.' };
    if (o && o.status === 'pendiente') return { key: 'pendiente', label: 'Pendiente de enviar', detail: o.lastError || 'En cola: se envía en cuanto haya internet.' };
    if (C.fintrackConnected()) {
      return { key: 'sin_enviar', label: 'Sin enviar', detail: (Date.now() - (p.createdAt || 0)) < 10 * 60 * 1000 ? 'Cobrado en otro equipo: se envía en unos minutos.' : 'Se envía en la próxima revisión (cada 2 minutos).' };
    }
    return { key: 'sin_enviar', label: 'Sin enviar', detail: 'Lo envía el equipo conectado a FinTrack.' };
  };

  function enviar() {
    if (syncing || !C.fintrackConnected() || !navigator.onLine) return Promise.resolve();
    var now = Date.now();
    var queue = C.data.outbox.filter(function (o) { return o.status === 'pendiente' && (o.nextAt || 0) <= now; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
    if (!queue.length) return Promise.resolve();
    syncing = true;
    var bindingId = cfg().bindingId;
    var stop = false;
    var chain = Promise.resolve();
    queue.forEach(function (row) {
      chain = chain.then(function () {
        if (stop) return;
        return invoke('fintrack_enviar_pago', { cuerpo: row.payload, idempotencia: row.id }).then(function (r) {
          var next = Object.assign({}, row, { tries: (row.tries || 0) + 1, lastTryAt: Date.now() });
          var body = null;
          try { body = JSON.parse(r.body || 'null'); } catch (e) { body = null; }
          if (r.status === 200 && body && body.status === 'confirmed' && body.payment_id === row.id && body.binding_id === bindingId && UUID.test(String(body.movement_id || ''))) {
            next.status = 'enviado'; next.movementId = body.movement_id; next.sentAt = Date.now(); next.lastError = '';
          } else if (r.status === 409) {
            /* FinTrack ya tiene este pago (lo mandó otro equipo con su propia conexión): ya está en FinTrack. */
            next.status = 'enviado'; next.yaEstaba = true; next.sentAt = Date.now(); next.movementId = '';
            next.lastError = 'Ya estaba en FinTrack (lo envió otro equipo).';
          } else if (r.status === 400 || r.status === 413) {
            next.status = 'rechazado'; next.lastError = (body && body.error) || 'FinTrack no aceptó el pago.';
          } else if (r.status === 403 || r.status === 401) {
            next.lastError = (body && body.error) || 'FinTrack no aceptó la conexión. Revisa la clave o vuelve a conectar.';
            next.nextAt = Date.now() + 30 * 60 * 1000; stop = true;
          } else {
            next.lastError = (body && body.error) || ('FinTrack respondió ' + r.status + '. Se reintentará.');
            next.nextAt = Date.now() + Math.min(60, Math.pow(2, next.tries)) * 60 * 1000;
          }
          return save([next]).then(function () { return next.status === 'enviado' ? marcarPagos([next]) : null; });
        }, function (err) {
          stop = true;
          return save([Object.assign({}, row, { lastError: String((err && err.message) || err), nextAt: Date.now() + 2 * 60 * 1000 })]);
        });
      });
    });
    return chain.then(function () { syncing = false; }, function () { syncing = false; });
  }

  /* Reintentar ya, sin esperar. */
  C.fintrackRetry = function () {
    var rows = C.data.outbox.filter(function (o) { return o.status === 'pendiente' && o.nextAt > Date.now(); })
      .map(function (o) { return Object.assign({}, o, { nextAt: 0 }); });
    return save(rows).then(C.fintrackSync);
  };

  C.fintrackState = function () {
    if (!C.isDesktop()) return Promise.resolve({ tiene_clave: false, conectado: false });
    return invoke('fintrack_estado');
  };

  C.fintrackNewKey = function () {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var b = new Uint8Array(48);
    window.crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return abc[x % abc.length]; }).join('');
  };

  C.fintrackSaveKey = function (key) { return invoke('fintrack_guardar_clave', { clave: key }); };

  /* Código de FinTrack: FT1.<base64url de {"u": dirección, "c": código, "k": clave pública opcional}> */
  C.fintrackParseCode = function (text) {
    var t = String(text || '').trim();
    if (t.indexOf('FT1.') !== 0) throw new Error('El código debe empezar con FT1. Cópialo completo desde FinTrack.');
    var b64 = t.slice(4).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var data;
    try { data = JSON.parse(decodeURIComponent(escape(atob(b64)))); } catch (e) { throw new Error('El código de FinTrack está incompleto o dañado.'); }
    if (!data || !/^https:\/\//.test(String(data.u || '')) || !/^[0-9a-f]{64}$/.test(String(data.c || ''))) throw new Error('El código de FinTrack no es válido.');
    return { base: String(data.u), code: String(data.c), apikey: data.k ? String(data.k) : null };
  };

  C.fintrackConnect = function (codeText) {
    if (!C.isAdmin()) return Promise.reject(new Error('Solo el administrador puede conectar FinTrack.'));
    var parsed = C.fintrackParseCode(codeText);
    var s = JSON.parse(JSON.stringify(C.settings));
    s.fintrack = Object.assign({ sourceUserId: C.uuid(), currency: 'USD' }, s.fintrack || {});
    var body = JSON.stringify({ action: 'redeem', source_app: 'cobro', code: parsed.code, source_user_id: s.fintrack.sourceUserId, currency: s.fintrack.currency });
    return invoke('fintrack_vincular', { base: parsed.base, apikey: parsed.apikey, cuerpo: body }).then(function (r) {
      var data = null;
      try { data = JSON.parse(r.body || 'null'); } catch (e) { data = null; }
      if (r.status !== 200) throw new Error((data && data.error) || ('FinTrack respondió ' + r.status + '.'));
      if (!data || data.source_app !== 'cobro' || !UUID.test(String(data.binding_id || '')) || data.currency !== s.fintrack.currency) {
        throw new Error('FinTrack respondió algo inesperado; no se guardó la conexión.');
      }
      s.fintrack.bindingId = data.binding_id;
      s.fintrack.destinationUserId = data.destination_user_id || '';
      s.fintrack.enabled = true;
      s.fintrack.connectedAt = Date.now();
      s.fintrack.since = C.today();
      if (!s.billing.fintrackDesde) s.billing.fintrackDesde = s.fintrack.connectedAt;
      return C.commit({ put: { kv: [{ key: 'settings', value: s }], audit: [C.auditRow('FinTrack', 'Cobro conectado con FinTrack')] } })
        .then(function () {
          /* Guardamos el binding_id en Rust para que sobreviva actualizaciones del instalador. */
          return invoke('fintrack_guardar_vinculo', { bindingId: s.fintrack.bindingId }).catch(function () { /* no crítico */ });
        });
    });
  };

  C.fintrackDisconnect = function () {
    var s = JSON.parse(JSON.stringify(C.settings));
    s.fintrack = Object.assign({}, s.fintrack || {}, { enabled: false, bindingId: '' });
    var cancel = C.data.outbox.filter(function (o) { return o.status === 'pendiente'; })
      .map(function (o) { return Object.assign({}, o, { status: 'cancelado', lastError: 'Se desconectó FinTrack antes de enviarlo' }); });
    var put = { kv: [{ key: 'settings', value: s }], audit: [C.auditRow('FinTrack', 'Cobro desconectado de FinTrack')] };
    if (cancel.length) put.outbox = cancel;
    return (C.isDesktop() ? invoke('fintrack_olvidar') : Promise.resolve()).then(function () { return C.commit({ put: put }); });
  };

  /* Recupera el binding_id desde Rust si el IndexedDB fue borrado por una actualización del instalador.
     Se llama desde app.js justo después de C.load(), antes del primer fintrackSync. */
  C.fintrackRecuperar = function () {
    if (!C.isDesktop() || C.fintrackConnected()) return Promise.resolve();
    return invoke('fintrack_recuperar').then(function (bindingId) {
      if (!bindingId || !UUID.test(bindingId)) return;
      var s = JSON.parse(JSON.stringify(C.settings));
      s.fintrack = Object.assign({}, s.fintrack || {}, { bindingId: bindingId, enabled: true });
      return C.commit({ put: { kv: [{ key: 'settings', value: s }] } })
        .then(function () { C.toast('Conexión con FinTrack restaurada automáticamente.'); });
    }).catch(function () { /* si Rust no tiene binding_id guardado, no pasa nada */ });
  };

  /* Revisa la cola al abrir, cada 2 minutos y cuando vuelve internet. */
  setInterval(function () { C.fintrackSync(); }, 2 * 60 * 1000);
  window.addEventListener('online', function () { C.fintrackSync(); });
})();
