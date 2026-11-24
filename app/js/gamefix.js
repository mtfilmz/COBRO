/* Cobro · clientes compartidos con Game Fix (en los dos sentidos), directo en la misma base de datos.
   Cobro y Game Fix usan la misma base (Supabase de Game Fix) y la misma cuenta: Cobro entra con la sesión de la nube
   (Ajustes › Nube) y lee los clientes de Game Fix y el contacto de sus reparaciones; y guarda en Game Fix sus clientes.
   Sin códigos ni claves. Regla de repetidos: mismo teléfono → un solo cliente; mismo nombre con teléfono distinto → dos.
   Nunca se borra un cliente ni se pisa un dato que ya existe, en ninguna de las dos apps: solo se llenan los vacíos.
   De las reparaciones solo se lee nombre, teléfono y correo; nunca se tocan reparaciones, pagos ni fotos. */
(function () {
  'use strict';
  var C = window.Cobro;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args || {}); }
  function cfg() { return C.settings.gamefix || {}; }
  function saveCfg(patch, audit) {
    var s = JSON.parse(JSON.stringify(C.settings));
    s.gamefix = Object.assign({}, s.gamefix || {}, patch);
    var put = { kv: [{ key: 'settings', value: s }] };
    if (audit) put.audit = [C.auditRow('Game Fix', audit)];
    return C.commit({ put: put });
  }
  function GfError(msg, kind) { var e = new Error(msg); e.kind = kind; return e; }

  /* Pedido a la base de Game Fix con la sesión de la nube (el programa solo permite clientes y el contacto de reparaciones). */
  function pedir(metodo, ruta, cuerpo, prefer) {
    return invoke('nube_pedir', { metodo: metodo, ruta: ruta, cuerpo: cuerpo == null ? null : JSON.stringify(cuerpo), prefer: prefer || null }).then(function (r) {
      var data = null;
      try { data = JSON.parse(r.body || 'null'); } catch (e) { data = null; }
      if (r.status >= 200 && r.status < 300) return data;
      if (r.status === 401 || r.status === 403) throw GfError('La sesión de la nube venció. Entra otra vez con tu cuenta de Game Fix en Ajustes › Nube.', 'auth');
      if (r.status === 409) throw GfError('Game Fix ya tiene ese cliente.', 'duplicado');
      throw GfError((data && (data.message || data.error)) || ('Game Fix respondió ' + r.status), 'error');
    });
  }
  function todos(ruta) {
    var out = [];
    function page(after, n) {
      if (n > 300) throw GfError('Game Fix devolvió demasiadas páginas.', 'error');
      var q = ruta + '&order=id.asc&limit=1000' + (after ? '&id=gt.' + encodeURIComponent(after) : '');
      return pedir('GET', q).then(function (rows) {
        rows = rows || [];
        rows.forEach(function (x) { out.push(x); });
        if (rows.length === 1000) return page(rows[rows.length - 1].id, n + 1);
      });
    }
    return page(null, 0).then(function () { return out; });
  }

  /* ---------- Comparar clientes ---------- */
  function phoneKey(p) { var d = C.digits(p || ''); return d.length >= 7 ? d : ''; }
  function samePhone(a, b) {
    var x = phoneKey(a), y = phoneKey(b);
    if (!x || !y) return false;
    if (x.length >= 10 && y.length >= 10) return x.slice(-10) === y.slice(-10);
    return x.slice(-7) === y.slice(-7);
  }
  function cleanEmail(e) { e = String(e || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''; }
  function six(c) {
    return {
      name: String(c.name || '').trim().slice(0, 200),
      phone: String(c.phone || '').trim().slice(0, 30),
      email: cleanEmail(c.email).slice(0, 254),
      contact: String(c.contact || '').trim().slice(0, 200),
      address: String(c.address || '').trim().slice(0, 1000),
      notes: String(c.notes || '').trim().slice(0, 4000)
    };
  }
  function fingerprint(c) { var s = six(c); return [s.name, s.phone, s.email, s.contact, s.address, s.notes].join('\u0001'); }

  /* Columnas de Game Fix ↔ campos de Cobro. */
  var COLS = [['telefono', 'phone'], ['email', 'email'], ['contacto', 'contact'], ['direccion', 'address'], ['notas', 'notes']];
  function exportar(row, kind) {
    return {
      source_id: kind + ':' + row.id, source_key: row.source_key || null,
      name: row.cliente || '', phone: row.telefono || '', email: row.email || '',
      contact: row.contacto || '', address: row.direccion || '', notes: kind === 'clients' ? (row.notas || '') : ''
    };
  }

  /* ---------- Traer de Game Fix ---------- */
  function traer(uid) {
    return todos('/rest/v1/clients?select=id,cliente,telefono,email,contacto,direccion,notas,source_key').then(function (clients) {
      return todos('/rest/v1/repairs?select=id,cliente,telefono,email&user_id=eq.' + uid).then(function (repairs) {
        return { clients: clients, repairs: repairs };
      });
    });
  }

  /* Une la lista de Game Fix con los clientes de Cobro. Devuelve los clientes cambiados o nuevos. */
  C.gamefixMerge = function (contacts) {
    var pool = C.data.customers.map(function (c) { return c; });
    var changed = {};
    var stats = { added: 0, linked: 0 };
    function editable(c) {
      if (changed[c.id]) return changed[c.id];
      var copy = JSON.parse(JSON.stringify(c));
      copy.gf = Object.assign({ srcs: [] }, copy.gf || {});
      changed[c.id] = copy;
      var i = pool.indexOf(c);
      if (i >= 0) pool[i] = copy;
      return copy;
    }
    function bySrc(src) { return pool.find(function (c) { return c.gf && (c.gf.srcs || []).indexOf(src) >= 0; }); }
    function byGfId(src) {
      var id = src.indexOf('clients:') === 0 ? src.slice(8) : '';
      return UUID.test(id) ? pool.find(function (c) { return c.gf && c.gf.id === id; }) : null;
    }
    function bySourceKey(key) {
      key = String(key || '');
      return key.indexOf('cobro:') === 0 ? pool.find(function (c) { return c.id === key.slice(6); }) : null;
    }
    function byPhone(p) { return pool.find(function (c) { return samePhone(c.phone, p); }); }
    function byEmail(e) { e = cleanEmail(e); return e ? pool.find(function (c) { return cleanEmail(c.email) === e; }) : null; }
    function byNameNoPhone(name) {
      var n = C.norm(name);
      var list = pool.filter(function (c) { return C.norm(c.name) === n; });
      return list.length === 1 ? list[0] : null;
    }
    contacts.forEach(function (r) {
      var name = String(r.name || '').trim();
      if (!name) return;
      var src = String(r.source_id || '');
      var kind = src.indexOf('clients:') === 0 ? 'clients' : 'repairs';
      var hasPhone = !!phoneKey(r.phone);
      var target = bySrc(src) || byGfId(src) || bySourceKey(r.source_key) || (hasPhone ? byPhone(r.phone) : null);
      if (!target && !hasPhone) target = byEmail(r.email);
      if (!target) {
        // Mismo nombre: se une solo si no choca el teléfono (uno de los dos no tiene).
        var cand = byNameNoPhone(name);
        if (cand && (!hasPhone || !phoneKey(cand.phone))) target = cand;
      }
      if (target) {
        var wasChanged = !!changed[target.id];
        var before = JSON.stringify(target);
        var c = editable(target);
        if (src && c.gf.srcs.indexOf(src) < 0) c.gf.srcs.push(src);
        if (kind === 'clients' && !c.gf.id && UUID.test(src.slice(8))) c.gf.id = src.slice(8);
        ['phone', 'email', 'address', 'contact'].forEach(function (k) { if (!String(c[k] || '').trim() && String(r[k] || '').trim()) c[k] = String(r[k]).trim(); });
        if (kind === 'clients' && !String(c.notes || '').trim() && String(r.notes || '').trim()) c.notes = String(r.notes).trim();
        if (JSON.stringify(c) !== before) { c.updatedAt = Date.now(); if (!wasChanged) stats.linked++; }
        else if (!wasChanged) delete changed[c.id];
        return;
      }
      var now = Date.now();
      var nc = {
        id: C.uid('cli'), name: name, phone: String(r.phone || '').trim(), email: cleanEmail(r.email),
        address: String(r.address || '').trim(), contact: String(r.contact || '').trim(),
        notes: kind === 'clients' ? String(r.notes || '').trim() : '',
        createdAt: now, updatedAt: now,
        gf: { srcs: src ? [src] : [], origin: kind, id: kind === 'clients' && UUID.test(src.slice(8)) ? src.slice(8) : '' }
      };
      nc.gf.sent = fingerprint(nc);
      pool.push(nc);
      changed[nc.id] = nc;
      stats.added++;
    });
    return { rows: Object.keys(changed).map(function (k) { return changed[k]; }), stats: stats };
  };

  /* ---------- Guardar en Game Fix ---------- */
  function enviar(gfClients) {
    var byId = {}, bySk = {};
    gfClients.forEach(function (x) { byId[x.id] = x; if (x.source_key) bySk[x.source_key] = x; });
    var todo = C.data.customers.filter(function (c) {
      if (!String(c.name || '').trim()) return false;
      if (c.gf && c.gf.origin === 'repairs') return false;
      return !(c.gf && c.gf.sent === fingerprint(c));
    });
    var stats = { sent: 0, created: 0, completed: 0 };
    var listos = [], nuevos = [], parches = [];
    todo.forEach(function (c) {
      var s = six(c);
      var gid = c.gf && UUID.test(c.gf.id || '') ? c.gf.id : '';
      var g = (gid && byId[gid]) || bySk['cobro:' + c.id] || null;
      if (!g && gid) { listos.push({ c: c, id: gid, status: 'borrado_en_gamefix' }); return; } // lo borraron en Game Fix: no se vuelve a crear
      if (!g && phoneKey(s.phone)) g = gfClients.find(function (x) { return samePhone(x.telefono, s.phone); }) || null;
      if (!g) { nuevos.push(c); return; }
      var patch = {};
      COLS.forEach(function (k) { if (!String(g[k[0]] || '').trim() && s[k[1]]) patch[k[0]] = s[k[1]]; });
      if (Object.keys(patch).length) parches.push({ c: c, id: g.id, patch: patch });
      else listos.push({ c: c, id: g.id, status: 'unchanged' });
    });
    function marcar(c, id, status) {
      var copy = JSON.parse(JSON.stringify(c));
      copy.gf = Object.assign({ srcs: [] }, copy.gf || {});
      if (UUID.test(id || '')) copy.gf.id = id;
      copy.gf.sent = fingerprint(c);
      copy.gf.status = status;
      return copy;
    }
    var filas = listos.map(function (x) { return marcar(x.c, x.id, x.status); });
    // Completar datos vacíos en Game Fix (nunca se cambia un dato que ya tiene).
    var chain = parches.reduce(function (p, x) {
      return p.then(function () {
        return pedir('PATCH', '/rest/v1/clients?id=eq.' + x.id, x.patch, 'return=minimal').then(function () {
          filas.push(marcar(x.c, x.id, 'completed')); stats.completed++; stats.sent++;
        });
      });
    }, Promise.resolve());
    // Clientes nuevos de Cobro: se crean en Game Fix con su marca de origen (no se duplican aunque se repita el envío).
    var pages = [];
    for (var i = 0; i < nuevos.length; i += 50) pages.push(nuevos.slice(i, i + 50));
    chain = pages.reduce(function (p, batch) {
      return p.then(function () {
        var rows = batch.map(function (c) {
          var s = six(c);
          return { cliente: s.name, telefono: s.phone, email: s.email, contacto: s.contact, direccion: s.address, notas: s.notes, source_key: 'cobro:' + c.id };
        });
        return pedir('POST', '/rest/v1/clients', rows, 'return=representation').then(function (made) {
          var bySource = {};
          (made || []).forEach(function (m) { bySource[m.source_key] = m; });
          batch.forEach(function (c) {
            var m = bySource['cobro:' + c.id];
            if (m) { filas.push(marcar(c, m.id, 'created')); stats.created++; stats.sent++; }
          });
        });
      });
    }, chain);
    return chain.then(function () {
      return filas.length ? C.commit({ put: { customers: filas } }) : null;
    }).then(function () { return stats; });
  }

  /* ---------- Ciclo ---------- */
  var running = null;
  C.gamefix = { status: '', error: '' };

  /* Comparte con Game Fix cuando la nube está conectada con la cuenta de Game Fix (y no se pausó en este equipo). */
  C.gamefixAccount = function () { return C.nubeCuenta ? C.nubeCuenta() : null; };
  C.gamefixConnected = function () { return !!(C.isDesktop() && C.gamefixAccount() && !cfg().paused); };

  C.gamefixSync = function (manual) {
    if (!C.gamefixConnected()) return Promise.resolve(null);
    if (running) return running;
    if (!navigator.onLine) return manual ? Promise.reject(new Error('Sin internet. Se sincroniza cuando vuelva la conexión.')) : Promise.resolve(null);
    var acc = C.gamefixAccount();
    var result = { added: 0, linked: 0, sent: 0, created: 0, completed: 0 };
    var gfClients = [];
    C.gamefix.status = 'sync';
    running = traer(acc.userId).then(function (r) {
      gfClients = r.clients;
      var all = r.clients.map(function (x) { return exportar(x, 'clients'); }).concat(r.repairs.map(function (x) { return exportar(x, 'repairs'); }));
      var m = C.gamefixMerge(all);
      result.added = m.stats.added;
      result.linked = m.stats.linked;
      if (!m.rows.length) return null;
      return C.commit({ put: { customers: m.rows, audit: [C.auditRow('Game Fix', 'Clientes de Game Fix: ' + m.stats.added + ' nuevos, ' + m.stats.linked + ' completados')] } });
    }).then(function () {
      return enviar(gfClients).then(function (s) { result.sent = s.sent; result.created = s.created; result.completed = s.completed; });
    }).then(function () {
      C.gamefix.status = 'ok';
      C.gamefix.error = '';
      return saveCfg({ lastSync: Date.now(), last: result, broken: false }).then(function () { return result; });
    }).catch(function (err) {
      C.gamefix.status = 'error';
      C.gamefix.error = (err && err.message) || String(err);
      if (manual) throw err;
      return null;
    }).then(function (r) { running = null; return r; }, function (e) { running = null; throw e; });
    return running;
  };

  C.gamefixPause = function (paused) {
    return saveCfg({ paused: !!paused }, paused ? 'Pausado compartir clientes con Game Fix en este equipo' : 'Reanudado compartir clientes con Game Fix').then(function () {
      return paused ? null : C.gamefixSync(true);
    });
  };

  /* Hasta la 0.7.x se compartía con un código y una clave privada guardada en el equipo: ya no hacen falta.
     Se borra esa clave y se olvida el vínculo viejo (los clientes ya unidos conservan su relación). */
  function quitarConexionVieja() {
    var g = cfg();
    if (!g.bindingId && !g.targetUserId) return Promise.resolve();
    var olvidar = C.isDesktop() ? invoke('gamefix_olvidar').catch(function () { /* sin clave vieja */ }) : Promise.resolve();
    return olvidar.then(function () {
      var s = JSON.parse(JSON.stringify(C.settings));
      var keep = { lastSync: g.lastSync, last: g.last, paused: g.paused };
      s.gamefix = keep;
      return C.commit({ put: { kv: [{ key: 'settings', value: s }], audit: [C.auditRow('Game Fix', 'Clientes con Game Fix: ahora directo con la cuenta de Game Fix (sin código ni clave)')] } });
    });
  }
  C.gamefixMigrate = quitarConexionVieja;

  if (C.isDesktop()) {
    setInterval(function () { C.gamefixSync(); }, 30 * 60 * 1000);
    window.addEventListener('online', function () { C.gamefixSync(); });
  }
})();
