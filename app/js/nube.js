/* Cobro · copia en la nube (base de datos de Game Fix, compartida con Game Fix).
   Todo sigue guardándose primero en este equipo. Cuando hay internet, Cobro sube los cambios
   (clientes, facturas, pagos, catálogo, fotos, lotes, ajustes del negocio y numeración) y baja
   los que se hicieron en otro equipo. Gana el cambio más reciente; la numeración toma el mayor.
   Los pagos que llegan de la nube nunca se envían a FinTrack desde este equipo. */
(function () {
  'use strict';
  var C = window.Cobro;

  /* Base de datos de Game Fix (Supabase). La clave es la pública (anon): ya va dentro de Game Fix.
     Hasta la 0.6.x la copia estaba en la base de Factura; NUBE_ID marca a cuál está conectado este equipo. */
  var BASES = ['https://tbkptuvpzwvdjqmsbmeh.supabase.co'];
  var APIKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRia3B0dXZwend2ZGpxbXNibWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzM2NTMsImV4cCI6MjA5MTc0OTY1M30.4oXZm3fff6bWx6bZIz96_5gNN-41XZfjEXafx6EbndE';
  var NUBE_ID = 'gamefix';
  var PATH = '/rest/v1/cobro_records';
  var LS = 'cobro-nube';
  var ORDER = ['settings', 'counters', 'customers', 'catalog', 'invoices', 'payments', 'batches', 'photos'];
  var PAGE = 500;

  function invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args || {}); }
  function state() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }
  function saveState(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) { /* sin almacenamiento */ } }
  function device() {
    var d = '';
    try { d = localStorage.getItem('cobro-equipo') || ''; } catch (e) { d = ''; }
    if (!d) { d = 'eq-' + C.uuid().slice(0, 8); try { localStorage.setItem('cobro-equipo', d); } catch (e) { /* sin almacenamiento */ } }
    return d;
  }
  function pendingCount() { return Object.keys(C.syncq).length; }
  function persistQueue() { return C.commit({ put: { kv: [{ key: 'syncq', value: C.syncq }] }, remote: true }); }

  /* Mudanza: si este equipo seguía conectado a la nube vieja (Factura), se cierra esa sesión y se pide entrar
     con la cuenta de Game Fix. Al conectar, Cobro sube todo lo que tiene en el equipo a la base nueva. */
  (function () {
    var s = state();
    if (!s.on || s.nube === NUBE_ID) return;
    s.on = false;
    s.moved = true;
    s.cursor = null;
    saveState(s);
    C.nubeOn = false;
    if (C.isDesktop()) invoke('nube_desconectar').catch(function () { /* sin sesión vieja que cerrar */ });
  })();
  C.nubeMoved = function () { return !C.nubeOn && !!state().moved; };

  var st0 = state();
  C.nube = { status: C.nubeOn ? 'pend' : 'off', error: '', lastSync: st0.lastSync || 0, email: st0.email || '', progress: null };

  function NubeError(msg, kind) { var e = new Error(msg); e.kind = kind; return e; }

  function check(r) {
    if (r.status >= 200 && r.status < 300) return;
    var msg = '';
    try { var b = JSON.parse(r.body || '{}'); msg = b.message || b.error_description || b.error || ''; } catch (e) { msg = ''; }
    if (r.status === 401) throw NubeError('La sesión de la nube venció. Vuelve a conectar con tu cuenta de Game Fix.', 'auth');
    if (r.status === 403) throw NubeError('La nube no permitió el cambio (permiso denegado).', 'error');
    if (r.status >= 500 || r.status === 429) throw NubeError('La nube no respondió bien (' + r.status + '). Se reintenta solo.', 'retry');
    throw NubeError('La nube rechazó los datos (' + r.status + ')' + (msg ? ': ' + msg : '.'), 'error');
  }

  /* ---------- Subir ---------- */
  function enqueueAll() {
    var now = Date.now();
    C.SYNCED.forEach(function (s) {
      if (s === 'photos' || !C.data[s]) return;
      C.data[s].forEach(function (o) { var k = s + '/' + o.id; if (!C.syncq[k]) C.syncq[k] = o._m || o.updatedAt || o.createdAt || 1; });
    });
    C.syncq['settings/negocio'] = C.settings._m || now;
    C.syncq['counters/numeros'] = now;
    return C.allIds('photos').then(function (ids) {
      (ids || []).forEach(function (id) { var k = 'photos/' + id; if (!C.syncq[k]) C.syncq[k] = 1; });
      return persistQueue();
    });
  }

  function splitKey(k) { var i = k.indexOf('/'); return { store: k.slice(0, i), id: k.slice(i + 1) }; }

  function push() {
    var keys = Object.keys(C.syncq).sort(function (a, b) {
      return ORDER.indexOf(splitKey(a).store) - ORDER.indexOf(splitKey(b).store);
    });
    if (!keys.length) return Promise.resolve();
    var user = state().userId;
    var maps = {};
    C.SYNCED.forEach(function (s) {
      if (!C.data[s]) return;
      var m = {};
      C.data[s].forEach(function (o) { m[o.id] = o; });
      maps[s] = m;
    });
    var chunks = [];
    var cur = [];
    keys.forEach(function (k) {
      var isPhoto = k.indexOf('photos/') === 0;
      var limit = isPhoto ? 4 : 200;
      if (cur.length && (cur.length >= limit || (cur[0].indexOf('photos/') === 0) !== isPhoto)) { chunks.push(cur); cur = []; }
      cur.push(k);
    });
    if (cur.length) chunks.push(cur);
    var done = 0;
    C.nube.progress = { done: 0, total: keys.length };

    function row(k) {
      var p = splitKey(k);
      var at = C.syncq[k];
      var base = { user_id: user, store: p.store, id: p.id, device: device() };
      if (p.store === 'settings') return Promise.resolve(Object.assign(base, { data: { business: C.settings.business, billing: C.settings.billing }, deleted: false, modified_at: C.settings._m || at }));
      if (p.store === 'counters') return Promise.resolve(Object.assign(base, { data: C.counters, deleted: false, modified_at: at }));
      var get = p.store === 'photos' ? C.getOne('photos', p.id) : Promise.resolve(maps[p.store] ? maps[p.store][p.id] : null);
      return get.then(function (o) {
        return o ? Object.assign(base, { data: o, deleted: false, modified_at: o._m || at })
          : Object.assign(base, { data: null, deleted: true, modified_at: at });
      });
    }

    function send(i) {
      if (i >= chunks.length) return Promise.resolve();
      var ks = chunks[i];
      var stamp = ks.map(function (k) { return C.syncq[k]; });
      return Promise.all(ks.map(row)).then(function (rows) {
        return invoke('nube_pedir', {
          metodo: 'POST', ruta: PATH + '?on_conflict=user_id,store,id',
          cuerpo: JSON.stringify(rows), prefer: 'resolution=merge-duplicates,return=minimal'
        });
      }).then(function (r) {
        if (r.status === 413 && ks.length === 1) {
          console.warn('Nube: registro demasiado grande, se omite: ' + ks[0]);
        } else {
          check(r);
        }
        ks.forEach(function (k, j) { if (C.syncq[k] === stamp[j]) delete C.syncq[k]; });
        done += ks.length;
        C.nube.progress = { done: done, total: keys.length };
        paint();
        return persistQueue();
      }).then(function () { return send(i + 1); });
    }
    return send(0).then(function () { C.nube.progress = null; }, function (e) { C.nube.progress = null; throw e; });
  }

  /* ---------- Bajar ---------- */
  function apply(rows) {
    var put = {};
    var del = {};
    var kv = [];
    var maps = {};
    var photos = [];
    var counters = null;
    C.SYNCED.forEach(function (s) {
      if (!C.data[s]) return;
      var m = {};
      C.data[s].forEach(function (o) { m[o.id] = o; });
      maps[s] = m;
    });
    function add(bag, s, v) { (bag[s] = bag[s] || []).push(v); }

    rows.forEach(function (r) {
      var m = Number(r.modified_at) || 0;
      var queued = C.syncq[r.store + '/' + r.id];
      if (r.store === 'counters') {
        var c = Object.assign({}, counters || C.counters);
        var changed = false;
        Object.keys(r.data || {}).forEach(function (k) {
          var v = Number(r.data[k]) || 0;
          if (v > (Number(c[k]) || 0)) { c[k] = v; changed = true; }
        });
        if (changed) counters = c;
        return;
      }
      if (queued && queued >= m) return;
      if (r.store === 'settings') {
        if (!r.deleted && r.data && m > (C.settings._m || 0)) {
          var ns = JSON.parse(JSON.stringify(C.settings));
          ns.business = Object.assign({}, ns.business, r.data.business || {});
          ns.billing = Object.assign({}, ns.billing, r.data.billing || {});
          ns._m = m;
          kv.push({ key: 'settings', value: ns });
        }
        return;
      }
      if (C.SYNCED.indexOf(r.store) < 0) return;
      if (r.store === 'photos') { photos.push(r); return; }
      var local = maps[r.store] ? maps[r.store][r.id] : null;
      var lm = local ? (local._m || 0) : 0;
      if (r.deleted) { if (local && lm <= m) add(del, r.store, r.id); return; }
      if (!r.data || (local && lm >= m)) return;
      var o = r.data;
      o.id = r.id;
      o._m = m;
      add(put, r.store, o);
    });
    if (counters) kv.push({ key: 'counters', value: counters });

    return Promise.all(photos.map(function (r) {
      var m = Number(r.modified_at) || 0;
      return C.getOne('photos', r.id).then(function (local) {
        var lm = local ? (local._m || 0) : 0;
        if (r.deleted) { if (local && lm <= m) add(del, 'photos', r.id); return; }
        if (!r.data || (local && lm >= m)) return;
        var o = r.data;
        o.id = r.id;
        o._m = m;
        add(put, 'photos', o);
      });
    })).then(function () {
      if (kv.length) put.kv = kv;
      var changed = Object.keys(put).length + Object.keys(del).length;
      if (!changed) return 0;
      return C.commit({ put: put, del: del, remote: true }).then(function () { return changed; });
    });
  }

  function pull() {
    var s = state();
    var since = s.cursor ? new Date(Date.parse(s.cursor) - 120000).toISOString() : null;
    var maxSeen = s.cursor || null;
    var changes = 0;
    function page(offset) {
      var q = PATH + '?select=store,id,data,deleted,modified_at,server_updated_at&order=server_updated_at.asc,store.asc,id.asc' +
        '&limit=' + PAGE + '&offset=' + offset + (since ? '&server_updated_at=gt.' + encodeURIComponent(since) : '');
      return invoke('nube_pedir', { metodo: 'GET', ruta: q, cuerpo: null, prefer: null }).then(function (r) {
        check(r);
        var rows = JSON.parse(r.body || '[]');
        return apply(rows).then(function (n) {
          changes += n;
          rows.forEach(function (x) {
            if (!maxSeen || Date.parse(x.server_updated_at) > Date.parse(maxSeen)) maxSeen = x.server_updated_at;
          });
          if (rows.length === PAGE) return page(offset + PAGE);
        });
      });
    }
    return page(0).then(function () {
      var s2 = state();
      s2.cursor = maxSeen;
      saveState(s2);
      return changes;
    });
  }

  /* ---------- Ciclo de sincronización ---------- */
  var running = null;
  var again = false;
  var debounce = null;

  function refreshView(changed) {
    var h = location.hash || '';
    if (/^#\/ajustes\/nube/.test(h) && !document.querySelector('dialog[open]')) { C.render(); return; }
    if (!changed) return;
    if (/^#\/(inicio|facturas|clientes|catalogo|reportes)?$/.test(h.split('?')[0]) && !document.querySelector('dialog[open]')) C.render();
  }

  C.nubeSync = function (manual) {
    if (!C.nubeOn || !C.isDesktop()) { C.nube.status = 'off'; paint(); return Promise.resolve(); }
    if (running) { again = true; return running; }
    if (!navigator.onLine) { C.nube.status = 'offline'; paint(); return manual ? Promise.reject(new Error('Sin internet. Los cambios se suben solos al volver la conexión.')) : Promise.resolve(); }
    C.nube.status = 'sync';
    paint();
    var failure = null;
    running = invoke('nube_estado').then(function (est) {
      if (!est.conectado) throw NubeError('La sesión de la nube venció. Vuelve a conectar con tu cuenta de Game Fix.', 'auth');
      return push().then(pull);
    }).then(function (changed) {
      C.nube.lastSync = Date.now();
      var s = state();
      s.lastSync = C.nube.lastSync;
      saveState(s);
      C.nube.error = '';
      C.nube.status = pendingCount() ? 'pend' : 'ok';
      refreshView(changed);
    }).catch(function (err) {
      var msg = String((err && err.message) || err);
      C.nube.error = msg;
      if (err && err.kind === 'auth') C.nube.status = 'auth';
      else if (!navigator.onLine || /llegar a la nube/i.test(msg)) C.nube.status = 'offline';
      else C.nube.status = 'error';
      failure = err;
      refreshView(false);
    }).then(function () {
      running = null;
      paint();
      if (again) { again = false; setTimeout(function () { C.nubeSync(); }, 800); }
      if (failure && manual) throw failure;
    });
    return running;
  };

  /* Llamado por el almacén después de cada cambio local que quedó en la cola. */
  C.nubeChanged = function () {
    if (C.nube.status !== 'sync' && C.nube.status !== 'auth') C.nube.status = 'pend';
    paint();
    clearTimeout(debounce);
    debounce = setTimeout(function () { C.nubeSync(); }, 4000);
  };

  C.nubeConnect = function (email, password) {
    if (!C.isDesktop()) return Promise.reject(new Error('La copia en la nube funciona en el programa de Windows.'));
    return invoke('nube_conectar', { bases: BASES, apikey: APIKEY, email: email, password: password }).then(function (acc) {
      var s = state();
      if (s.userId && s.userId !== acc.user_id) { s.cursor = null; C.syncq = {}; }
      s.on = true;
      s.nube = NUBE_ID;
      s.moved = false;
      s.email = acc.email;
      s.userId = acc.user_id;
      s.connectedAt = s.connectedAt && s.userId === acc.user_id ? s.connectedAt : Date.now();
      saveState(s);
      C.nubeOn = true;
      C.nube.email = acc.email;
      C.nube.error = '';
      C.nube.status = 'pend';
      return enqueueAll();
    }).then(function () {
      setTimeout(function () { C.nubeSync(); }, 50);
    });
  };

  C.nubeDisconnect = function () {
    return invoke('nube_desconectar').then(function () {
      var s = state();
      s.on = false;
      s.moved = false;
      saveState(s);
      C.nubeOn = false;
      C.syncq = {};
      C.nube.status = 'off';
      C.nube.error = '';
      return persistQueue();
    }).then(paint);
  };

  /* Después de recuperar un respaldo: volver a subir todo y bajar todo para que ambos lados queden completos. */
  C.nubeAfterRestore = function () {
    if (!C.nubeOn) return Promise.resolve();
    var s = state();
    s.cursor = null;
    saveState(s);
    return enqueueAll().then(function () { setTimeout(function () { C.nubeSync(); }, 300); });
  };

  C.nubePending = pendingCount;

  /* ---------- Aviso en el menú lateral ---------- */
  var CHIP = {
    off: ['drive', 'Guardado en este equipo', 'Los datos se guardan en este equipo y la app funciona sin internet', ''],
    ok: ['cloud', 'En la nube · al día', 'Copia en la nube al día', 'ok'],
    pend: ['cloud', 'Cambios por subir', 'Se suben solos en unos segundos', 'pend'],
    sync: ['refresh', 'Sincronizando…', 'Subiendo y bajando cambios de la nube', 'pend'],
    offline: ['cloud', 'Sin internet · se sube luego', 'Todo queda guardado en este equipo y se sube al volver la conexión', 'pend'],
    auth: ['cloud', 'Nube: vuelve a conectar', 'Ajustes › Nube', 'bad'],
    moved: ['cloud', 'Nube: entra con Game Fix', 'La copia en la nube ahora está en la base de Game Fix. Ajustes › Nube', 'bad'],
    error: ['cloud', 'Nube: revisa Ajustes', 'Ajustes › Nube', 'bad']
  };

  function chipText() {
    var st = C.nubeOn ? C.nube.status : (C.nubeMoved() ? 'moved' : 'off');
    if (st === 'ok' || st === 'pend') st = pendingCount() ? 'pend' : 'ok';
    var c = CHIP[st] || CHIP.off;
    var text = c[1];
    if (st === 'sync' && C.nube.progress && C.nube.progress.total > 20) text = 'Subiendo ' + C.nube.progress.done + ' de ' + C.nube.progress.total;
    if (st === 'pend' && pendingCount()) text = 'Cambios por subir (' + pendingCount() + ')';
    return { icon: c[0], text: text, title: c[2], cls: c[3] };
  }

  C.nubeChipHtml = function () {
    var c = chipText();
    return '<div class="local-chip ' + c.cls + '" data-nube-chip title="' + C.esc(c.title) + '">' + C.icon(c.icon, 16) + '<span>' + C.esc(c.text) + '</span></div>';
  };

  function paint() {
    var el = document.querySelector('[data-nube-chip]');
    if (el) el.outerHTML = C.nubeChipHtml();
  }
  C.nubePaint = paint;

  /* ---------- Arranque ---------- */
  if (C.isDesktop()) {
    window.addEventListener('online', function () { C.nubeSync(); });
    window.addEventListener('offline', function () { if (C.nubeOn) { C.nube.status = 'offline'; paint(); } });
    setInterval(function () { C.nubeSync(); }, 2 * 60 * 1000);
  }
})();
