/* Cobro · clientes compartidos con Game Fix (en los dos sentidos).
   Trae los clientes guardados de Game Fix y los contactos de sus reparaciones, y manda a Game Fix los clientes de Cobro.
   Regla de repetidos: mismo teléfono → un solo cliente; mismo nombre con teléfono distinto → dos clientes.
   Nunca se borra un cliente ni se pisa un dato que ya tiene Cobro: solo se llenan los campos vacíos.
   Si Game Fix tiene datos distintos de un cliente, Game Fix lo marca para que el dueño elija cuál conservar. */
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

  function request(body) {
    return invoke('gamefix_pedir', { cuerpo: JSON.stringify(body) }).then(function (r) {
      var data = null;
      try { data = JSON.parse(r.body || 'null'); } catch (e) { data = null; }
      if (r.status === 200) return data;
      var msg = (data && data.error) || ('Game Fix respondió ' + r.status);
      if (r.status === 403 && /recepci/i.test(msg)) throw GfError(msg, 'receive_off');
      if (r.status === 403 || r.status === 401) throw GfError(msg, 'auth');
      if (r.status === 409) throw GfError(msg, 'retry');
      throw GfError(msg, 'error');
    });
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

  /* ---------- Traer de Game Fix ---------- */
  function listAll(kind, b) {
    var out = [];
    var seen = {};
    function page(after, n) {
      if (n > 300) throw GfError('Game Fix devolvió demasiadas páginas.', 'error');
      var body = { action: 'list', binding_id: b.bindingId, target_user_id: b.targetUserId, kind: kind, limit: 100 };
      if (after) body.after = after;
      return request(body).then(function (r) {
        (r.clients || []).forEach(function (c) { out.push(c); });
        if (r.next) {
          if (seen[r.next]) throw GfError('Game Fix repitió una página.', 'error');
          seen[r.next] = true;
          return page(r.next, n + 1);
        }
      });
    }
    return page(null, 0).then(function () { return out; });
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
      var target = bySrc(src) || (hasPhone ? byPhone(r.phone) : null);
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

  /* ---------- Mandar a Game Fix ---------- */
  function push(b) {
    var todo = C.data.customers.filter(function (c) {
      if (!String(c.name || '').trim()) return false;
      if (c.gf && c.gf.origin === 'repairs') return false;
      return !(c.gf && c.gf.sent === fingerprint(c));
    });
    var stats = { sent: 0, conflicts: 0, created: 0 };
    var pages = [];
    for (var i = 0; i < todo.length; i += 25) pages.push(todo.slice(i, i + 25));
    function send(k) {
      if (k >= pages.length) return Promise.resolve(stats);
      var batch = pages[k];
      var clients = batch.map(function (c) {
        var s = six(c);
        return { source_id: 'cobro:' + c.id, origin_gamefix_id: c.gf && UUID.test(c.gf.id || '') ? c.gf.id : null, name: s.name, phone: s.phone, email: s.email, contact: s.contact, address: s.address, notes: s.notes };
      });
      return request({ action: 'receive', binding_id: b.bindingId, target_user_id: b.targetUserId, clients: clients }).then(function (r) {
        var res = {};
        (r.results || []).forEach(function (x) { res[x.source_id] = x; });
        var rows = batch.map(function (c) {
          var x = res['cobro:' + c.id];
          if (!x) return null;
          var copy = JSON.parse(JSON.stringify(c));
          copy.gf = Object.assign({ srcs: [] }, copy.gf || {});
          if (UUID.test(x.client_id || '')) copy.gf.id = x.client_id;
          copy.gf.sent = fingerprint(c);
          copy.gf.status = x.status;
          if (x.status === 'conflict') stats.conflicts++;
          if (x.status === 'created') stats.created++;
          stats.sent++;
          return copy;
        }).filter(Boolean);
        return rows.length ? C.commit({ put: { customers: rows } }) : null;
      }).then(function () { return send(k + 1); });
    }
    return send(0);
  }

  /* ---------- Ciclo ---------- */
  var running = null;
  C.gamefix = { status: '', error: '' };

  C.gamefixConnected = function () { return !!(C.isDesktop() && cfg().bindingId); };

  C.gamefixSync = function (manual) {
    if (!C.gamefixConnected()) return Promise.resolve(null);
    if (running) return running;
    if (!navigator.onLine) return manual ? Promise.reject(new Error('Sin internet. Se sincroniza cuando vuelva la conexión.')) : Promise.resolve(null);
    var b = cfg();
    var result = { added: 0, linked: 0, sent: 0, created: 0, conflicts: 0, receiveOff: false };
    C.gamefix.status = 'sync';
    running = listAll('clients', b).then(function (clients) {
      return listAll('repairs', b).then(function (repairs) { return clients.concat(repairs); });
    }).then(function (all) {
      var m = C.gamefixMerge(all);
      result.added = m.stats.added;
      result.linked = m.stats.linked;
      if (!m.rows.length) return null;
      return C.commit({ put: { customers: m.rows, audit: [C.auditRow('Game Fix', 'Clientes de Game Fix: ' + m.stats.added + ' nuevos, ' + m.stats.linked + ' completados')] } });
    }).then(function () {
      return push(b).then(function (s) {
        result.sent = s.sent; result.created = s.created; result.conflicts = s.conflicts;
      }, function (err) {
        if (err && err.kind === 'receive_off') { result.receiveOff = true; return; }
        throw err;
      });
    }).then(function () {
      C.gamefix.status = 'ok';
      C.gamefix.error = '';
      return saveCfg({ lastSync: Date.now(), last: result, receiveOff: result.receiveOff, broken: false }).then(function () { return result; });
    }).catch(function (err) {
      C.gamefix.status = 'error';
      C.gamefix.error = (err && err.message) || String(err);
      var p = err && err.kind === 'auth' ? saveCfg({ broken: true }) : Promise.resolve();
      return p.then(function () { if (manual) throw err; return null; });
    }).then(function (r) { running = null; return r; }, function (e) { running = null; throw e; });
    return running;
  };

  C.gamefixState = function () { return invoke('gamefix_estado'); };
  C.gamefixSaveKey = function (key) { return invoke('gamefix_guardar_clave', { clave: key }); };

  /* Canje del código que genera Game Fix (64 caracteres hexadecimales). */
  C.gamefixConnect = function (code) {
    code = String(code || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(code)) return Promise.reject(new Error('El código de Game Fix tiene 64 letras y números (0-9, a-f). Cópialo completo.'));
    var target = (function () { try { return (JSON.parse(localStorage.getItem('cobro-nube') || '{}') || {}).userId || ''; } catch (e) { return ''; } })();
    if (!UUID.test(target)) target = cfg().targetUserId && UUID.test(cfg().targetUserId) ? cfg().targetUserId : C.uuid();
    return request({ action: 'redeem', code: code, target_user_id: target, target_email: 'supermobilepr@gmail.com' }).catch(function (err) {
      if (err && err.kind === 'auth') throw new Error('Game Fix no aceptó la clave. Revisa que la clave guardada en Game Fix sea la misma que la de Cobro.');
      if (err && err.kind === 'retry') throw new Error('El código ya se usó o venció. Genera uno nuevo en Game Fix.');
      throw err;
    }).then(function (r) {
      if (!r || r.status !== 'linked' || !UUID.test(r.binding_id || '') || r.target_user_id !== target) throw new Error('Game Fix respondió algo inesperado al vincular.');
      return saveCfg({ bindingId: r.binding_id, targetUserId: target, connectedAt: Date.now(), broken: false }, 'Cobro conectado con los clientes de Game Fix');
    }).then(function () { return C.gamefixSync(true); });
  };

  C.gamefixDisconnect = function () {
    return invoke('gamefix_olvidar').then(function () {
      var s = JSON.parse(JSON.stringify(C.settings));
      s.gamefix = {};
      return C.commit({ put: { kv: [{ key: 'settings', value: s }], audit: [C.auditRow('Game Fix', 'Cobro desconectado de los clientes de Game Fix')] } });
    });
  };

  if (C.isDesktop()) {
    setInterval(function () { C.gamefixSync(); }, 30 * 60 * 1000);
    window.addEventListener('online', function () { C.gamefixSync(); });
  }
})();
