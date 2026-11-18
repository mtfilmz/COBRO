/* Cobro · estructura de pantalla, menú, avisos, ventanas y navegación */
(function () {
  'use strict';
  var C = (window.Cobro = window.Cobro || {});
  var esc = C.esc;

  C.views = {};

  /* ---------- Avisos ---------- */
  C.toast = function (msg, kind) {
    var box = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, kind === 'error' ? 5200 : 3200);
    setTimeout(function () { el.remove(); }, kind === 'error' ? 5600 : 3600);
  };
  C.fail = function (err) { if (err && err.cancel) return; C.toast((err && err.message) || String(err), 'error'); };

  /* ---------- Ventanas (dialog) ---------- */
  C.modal = function (opts) {
    return new Promise(function (resolve) {
      var dlg = document.createElement('dialog');
      dlg.className = 'modal' + (opts.wide ? ' wide' : '');
      dlg.innerHTML =
        '<form method="dialog" class="modal-body" novalidate>' +
        '<div class="modal-head"><h2>' + esc(opts.title) + '</h2>' +
        '<button type="button" class="icon-btn" data-close aria-label="Cerrar">' + C.icon('x') + '</button></div>' +
        '<div class="modal-content">' + (opts.html || '') + '</div>' +
        (opts.hideActions ? '' : '<div class="modal-actions">' +
          '<button type="button" class="btn" data-close>' + esc(opts.cancelLabel || 'Cancelar') + '</button>' +
          (opts.okLabel === null ? '' : '<button type="submit" class="btn ' + (opts.okKind || 'primary') + '" data-ok>' + esc(opts.okLabel || 'Guardar') + '</button>') +
          '</div>') +
        '</form>';
      document.body.appendChild(dlg);
      var done = false;
      function close(val) {
        if (done) return;
        done = true;
        try { dlg.close(); } catch (e) { /* ya cerrada */ }
        dlg.remove();
        resolve(val);
      }
      dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { close(null); }); });
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(null); });
      dlg.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var okBtn = dlg.querySelector('[data-ok]');
        var r = opts.onOk ? opts.onOk(dlg) : true;
        Promise.resolve(r).then(function (val) {
          if (val === false || val === undefined && opts.onOk) { if (okBtn) okBtn.disabled = false; return; }
          close(val);
        }).catch(function (err) { if (okBtn) okBtn.disabled = false; C.fail(err); });
        if (okBtn) okBtn.disabled = true;
      });
      dlg.showModal();
      if (opts.onMount) opts.onMount(dlg);
      var first = dlg.querySelector('[autofocus]') || dlg.querySelector('input, select, textarea');
      if (first) first.focus();
    });
  };

  C.confirm = function (title, text, okLabel, danger) {
    return C.modal({ title: title, html: '<p class="muted">' + esc(text) + '</p>', okLabel: okLabel || 'Aceptar', okKind: danger ? 'danger' : 'primary', onOk: function () { return true; } });
  };

  /* ---------- Piezas comunes ---------- */
  C.pill = function (status) {
    return '<span class="pill ' + (C.STATUS_CLASS[status] || 'void') + '">' + esc(status) + '</span>';
  };
  C.typeTag = function (type) {
    var t = C.TYPES[type] || C.TYPES.venta;
    return '<span class="type-tag"><span class="dot ' + t.cls + '"></span>' + esc(t.label) + '</span>';
  };
  C.logoBlock = function (size) {
    var logo = C.settings.business.logo;
    size = size || 36;
    if (logo) return '<img class="logo-img" src="' + esc(logo) + '" alt="" width="' + size + '" height="' + size + '">';
    return '<span class="logo" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.36) + 'px" aria-hidden="true">SM</span>';
  };
  C.empty = function (title, text, actionHtml) {
    return '<div class="empty"><p class="empty-title">' + esc(title) + '</p><p class="muted">' + esc(text) + '</p>' + (actionHtml || '') + '</div>';
  };

  C.themePicker = function () {
    return '<div class="theme-pick"><span class="small muted">Tema: ' + esc((C.THEME_LIST.find(function (t) { return t.key === C.themeKey; }) || {}).name || 'Claro') + '</span>' +
      '<div class="seg-swatch" role="radiogroup" aria-label="Tema">' +
      C.THEME_LIST.map(function (t) {
        return '<button type="button" role="radio" aria-checked="' + (t.key === C.themeKey) + '" title="' + esc(t.name) + '" aria-label="' + esc(t.name) +
          '" data-theme-key="' + t.key + '"><span class="swatch" style="background:' + t.swatch + ';border-color:' + t.edge + '"></span></button>';
      }).join('') + '</div></div>';
  };

  function navItem(hash, icon, label, active) {
    return '<a href="#/' + hash + '" class="nav-item' + (active ? ' on' : '') + '"' + (active ? ' aria-current="page"' : '') + '>' + C.icon(icon) + '<span>' + esc(label) + '</span></a>';
  }

  function shell(active, content) {
    var u = C.session.user;
    var admin = C.isAdmin();
    var b = C.settings.business;
    var items = [navItem('inicio', 'home', 'Inicio', active === 'inicio'), navItem('facturas', 'file', 'Facturas', active === 'facturas')];
    if (C.can('clientes')) items.push(navItem('clientes', 'users', 'Clientes', active === 'clientes'));
    items.push(navItem('catalogo', 'box', 'Catálogo', active === 'catalogo'));
    if (admin) items.push(navItem('reportes', 'chart', 'Reportes', active === 'reportes'));
    var bottom = admin ? [navItem('importar', 'upload', 'Importar historial', active === 'importar'), navItem('ajustes', 'settings', 'Ajustes', active === 'ajustes')] : [];
    var mobile = [
      navItem('inicio', 'home', 'Inicio', active === 'inicio'),
      navItem('facturas', 'file', 'Facturas', active === 'facturas'),
      '<a href="#/nueva" class="fab" aria-label="Nueva factura">' + C.icon('plus', 24, 2.2) + '</a>',
      C.can('clientes') ? navItem('clientes', 'users', 'Clientes', active === 'clientes') : navItem('catalogo', 'box', 'Catálogo', active === 'catalogo'),
      navItem(admin ? 'ajustes' : 'catalogo', admin ? 'settings' : 'box', admin ? 'Más' : 'Catálogo', active === 'ajustes')
    ];
    return '<div class="shell">' +
      '<aside class="side" aria-label="Navegación principal">' +
      '<div class="brand">' + C.logoBlock(36) + '<div><div class="brand-name">Cobro</div><div class="small muted">' + esc(b.name) + '</div></div></div>' +
      '<nav class="nav">' + items.join('') + '</nav>' +
      '<div class="side-bottom">' + (bottom.length ? '<nav class="nav">' + bottom.join('') + '</nav>' : '') +
      (C.nubeChipHtml ? C.nubeChipHtml() : '<div class="local-chip" title="Los datos se guardan en este equipo y la app funciona sin internet">' + C.icon('drive', 16) + '<span>Guardado en este equipo</span></div>') +
      '<div class="user-chip"><span class="avatar ' + (admin ? 'admin' : '') + '" aria-hidden="true">' + esc(C.initials(u.email)) + '</span>' +
      '<div class="user-text"><span class="strong">' + (admin ? 'Administrador' : 'Empleado') + '</span><span class="small muted wrap" title="' + esc(u.email) + '">' + esc(u.email) + '</span></div>' +
      '<button type="button" class="icon-btn" data-lock aria-label="Bloquear (pedir PIN)" title="Bloquear">' + C.icon('lock') + '</button></div>' +
      C.themePicker() +
      '</div></aside>' +
      '<main class="main" id="main">' + content + '</main>' +
      '<nav class="bottom-nav" aria-label="Navegación">' + mobile.join('') + '</nav>' +
      '</div>';
  }

  /* ---------- Navegación ---------- */
  C.parseHash = function () {
    var h = (location.hash || '#/inicio').slice(2);
    var q = {};
    var qi = h.indexOf('?');
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
      h = h.slice(0, qi);
    }
    var parts = h.split('/');
    return { name: parts[0] || 'inicio', param: parts[1] ? decodeURIComponent(parts[1]) : '', query: q };
  };

  C.go = function (hash) {
    if (location.hash === '#/' + hash) C.render(); else location.hash = '#/' + hash;
  };

  C.render = function () {
    var app = document.getElementById('app');
    if (!C.session.user) {
      var gate = C.data.users.some(function (u) { return u.role === 'admin'; }) ? C.views.acceso : C.views.configurar;
      app.innerHTML = gate.render();
      if (gate.mount) gate.mount(app);
      return;
    }
    var r = C.parseHash();
    var view = C.views[r.name] || C.views.inicio;
    if (view.allowed && !view.allowed()) { view = C.views.inicio; r = { name: 'inicio', param: '', query: {} }; }
    var html;
    try { html = view.render(r.param, r.query); } catch (err) { console.error(err); html = C.empty('Algo salió mal', err.message || String(err)); }
    app.innerHTML = shell(view.nav || r.name, html);
    var main = document.getElementById('main');
    app.querySelector('[data-lock]').addEventListener('click', function () { C.lock(); C.render(); });
    C.currentView = view;
    app.querySelectorAll('[data-theme-key]').forEach(function (b) {
      b.addEventListener('click', function () { C.setTheme(b.getAttribute('data-theme-key')).then(C.render).catch(C.fail); });
    });
    if (view.mount) { try { view.mount(main, r.param, r.query); } catch (err) { console.error(err); C.fail(err); } }
    main.scrollTop = 0;
    document.title = (view.title ? (typeof view.title === 'function' ? view.title(r.param) : view.title) + ' · ' : '') + 'Cobro';
    if (C.afterRender) C.afterRender();
  };

  window.addEventListener('hashchange', function () { C.render(); window.scrollTo(0, 0); });

  /* Tocar el enlace de la pantalla en la que ya estás la vuelve a abrir desde el principio. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (a && a.getAttribute('href') === location.hash && C.session.user) {
      e.preventDefault();
      if (C.currentView && C.currentView.reset) C.currentView.reset();
      C.render();
    }
  });
})();
