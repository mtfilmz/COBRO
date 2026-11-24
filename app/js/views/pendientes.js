/* Cobro · Pendientes: lo que falta por resolver.
   - Sin llegar a FinTrack: pagos nuevos que FinTrack todavía no tiene (y por qué).
   - Por cobrar: facturas con saldo (pendientes o con pago parcial). */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var st = { tab: '', historial: false };

  function invById() {
    var m = {};
    C.data.invoices.forEach(function (i) { m[i.id] = i; });
    return m;
  }

  /* Pagos que FinTrack todavía no tiene. */
  C.pendFintrack = function () {
    var invs = invById();
    return C.data.payments.map(function (p) {
      var inv = invs[p.invoiceId];
      return { p: p, inv: inv, ft: C.ftEstado ? C.ftEstado(p, inv) : { key: 'no_aplica' } };
    }).filter(function (x) { return x.inv && (x.ft.key === 'sin_enviar' || x.ft.key === 'pendiente' || x.ft.key === 'problema'); })
      .sort(function (a, b) { return (b.p.createdAt || 0) - (a.p.createdAt || 0); });
  };

  /* Facturas con saldo. Las del historial de Factura van aparte (se pueden mostrar). */
  C.pendCobro = function (conHistorial) {
    var pm = C.paidMap();
    return C.data.invoices.map(function (inv) { return { inv: inv, v: C.view(inv, pm) }; })
      .filter(function (x) { return !x.inv.voided && x.v.balance > 0 && (conHistorial || x.inv.source !== 'historial'); })
      .sort(function (a, b) { return (b.inv.date || '').localeCompare(a.inv.date || '') || (b.inv.createdAt || 0) - (a.inv.createdAt || 0); });
  };

  /* Número para el menú: pagos sin llegar a FinTrack + facturas nuevas por cobrar. */
  C.pendCount = function () {
    try { return C.pendFintrack().length + C.pendCobro(false).length; } catch (e) { return 0; }
  };

  function sum(list, fn) { return C.round2(list.reduce(function (s, x) { return s + fn(x); }, 0)); }

  function fintrackHtml(list) {
    var connected = C.fintrackConnected && C.fintrackConnected();
    var head = '<div class="card-head flat"><div><h2 class="h2">Sin llegar a FinTrack</h2>' +
      '<p class="small muted">Pagos nuevos que FinTrack todavía no tiene. El historial importado de Factura no se envía porque ya estaba reportado.</p></div>' +
      (list.length ? '<span class="amount-md pend-text">' + C.money(sum(list, function (x) { return C.num(x.p.amount); })) + '</span>' : '') + '</div>';
    var actions = connected
      ? (list.length ? '<div class="actions-left"><button type="button" class="btn" id="pd-send">' + C.icon('refresh', 16) + 'Enviar pendientes ahora</button></div>' : '')
      : '<div class="notice">' + C.icon('info', 16) + '<div>Este equipo no está conectado a FinTrack. Los pagos los manda el equipo que sí lo está. ' +
        (C.isAdmin() ? 'Si ninguno lo está, conéctalo en <a class="link" href="#/ajustes/fintrack">Ajustes › FinTrack</a>.' : 'Avísale al administrador.') + '</div></div>';
    if (!list.length) {
      return '<section class="card pad stack">' + head + '<p class="ok-text strong">' + C.icon('check', 16, 2.5) + ' Todos los pagos nuevos están en FinTrack.</p>' + (connected ? '' : actions) + '</section>';
    }
    var rows = list.map(function (x) {
      var cls = x.ft.key === 'problema' ? 'void' : 'pend';
      return '<a class="row pend-row" href="#/factura/' + esc(x.inv.id) + '" data-pay="' + esc(x.p.id) + '">' +
        '<span class="row-num"><span>' + esc(x.inv.number) + '</span></span>' +
        '<span class="row-main"><span class="strong">' + esc(x.inv.customer.name) + '</span>' +
        '<span class="small muted"><span class="m-only">' + esc(x.inv.number) + ' · </span>' + esc(C.fmtDate(x.p.date)) + ' · ' + esc(x.p.method || '') + ' · <span class="m-only">' + esc(x.ft.label) + '</span></span>' +
        '<span class="small ' + (x.ft.key === 'problema' ? 'danger-text' : 'muted') + '">' + esc(x.ft.detail) + '</span></span>' +
        '<span class="row-status"><span class="pill ' + cls + '">' + esc(x.ft.label) + '</span></span>' +
        '<span class="row-amount"><span class="strong">' + C.money(x.p.amount) + '</span></span></a>';
    }).join('');
    return '<section class="card pad stack">' + head + actions + '<div class="rows">' + rows + '</div></section>';
  }

  function cobroHtml(list, hist) {
    var nHist = C.pendCobro(true).length - C.pendCobro(false).length;
    var head = '<div class="card-head flat"><div><h2 class="h2">Por cobrar</h2>' +
      '<p class="small muted">Facturas con saldo: sin cobrar o con pago parcial. Entra a la factura para registrar el pago.</p></div>' +
      (list.length ? '<span class="amount-md pend-text">' + C.money(sum(list, function (x) { return x.v.balance; })) + '</span>' : '') + '</div>';
    var toggle = nHist > 0 ? '<label class="check small"><input type="checkbox" id="pd-hist"' + (hist ? ' checked' : '') + '> Incluir ' + nHist + ' del historial de Factura</label>' : '';
    if (!list.length) return '<section class="card pad stack">' + head + '<p class="ok-text strong">' + C.icon('check', 16, 2.5) + ' No hay facturas por cobrar.</p>' + toggle + '</section>';
    var rows = list.map(function (x) {
      return '<a class="row pend-row" href="#/factura/' + esc(x.inv.id) + '">' +
        '<span class="row-num"><span>' + esc(x.inv.number) + '</span>' + (x.inv.source === 'historial' ? '<span class="tag">Historial</span>' : '') + '</span>' +
        '<span class="row-main"><span class="strong">' + esc(x.inv.customer.name) + '</span>' +
        '<span class="small muted ellipsis"><span class="m-only">' + esc(x.inv.number) + ' · </span>' + esc(C.fmtDate(x.inv.date)) + ' · ' + esc(C.mainConcept(x.inv)) + '</span>' +
        (x.v.paid > 0 ? '<span class="small muted">Pagado ' + C.money(x.v.paid) + ' de ' + C.money(x.inv.total) + '</span>' : '') + '</span>' +
        '<span class="row-status">' + C.pill(x.v.status) + '</span>' +
        '<span class="row-amount"><span class="strong pend-text">' + C.money(x.v.balance) + '</span><span class="small muted">Saldo</span></span></a>';
    }).join('');
    return '<section class="card pad stack">' + head + toggle + '<div class="rows">' + rows + '</div></section>';
  }

  C.views.pendientes = {
    title: 'Pendientes',
    allowed: function () { return C.isAdmin() || C.can('pagos'); },
    reset: function () { st.tab = ''; },
    render: function () {
      var ft = C.pendFintrack();
      var cb = C.pendCobro(st.historial);
      var tab = st.tab || (ft.length || !cb.length ? 'fintrack' : 'cobro');
      return '<header class="page-head"><div><p class="small muted">Lo que falta por resolver</p><h1>Pendientes</h1></div></header>' +
        '<div class="toolbar"><div class="seg" role="group" aria-label="Qué ver" id="pd-tabs">' +
        '<button type="button" data-tab="fintrack" class="seg-btn' + (tab === 'fintrack' ? ' on' : '') + '" aria-pressed="' + (tab === 'fintrack') + '">Sin llegar a FinTrack <span class="count">' + ft.length + '</span></button>' +
        '<button type="button" data-tab="cobro" class="seg-btn' + (tab === 'cobro' ? ' on' : '') + '" aria-pressed="' + (tab === 'cobro') + '">Por cobrar <span class="count">' + cb.length + '</span></button>' +
        '</div></div>' +
        '<div class="stack">' + (tab === 'fintrack' ? fintrackHtml(ft) : cobroHtml(cb, st.historial)) + '</div>';
    },
    mount: function (root) {
      root.querySelectorAll('#pd-tabs [data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { st.tab = b.getAttribute('data-tab'); C.render(); });
      });
      var h = root.querySelector('#pd-hist');
      if (h) h.addEventListener('change', function () { st.historial = h.checked; st.tab = 'cobro'; C.render(); });
      var s = root.querySelector('#pd-send');
      if (s) s.addEventListener('click', function () {
        s.disabled = true;
        C.fintrackRetry().then(function () {
          var n = C.pendFintrack().length;
          C.toast(n ? 'Quedan ' + n + ' sin llegar. Revisa el motivo en cada uno.' : 'Listo: todos los pagos están en FinTrack.');
          C.render();
        }).catch(function (err) { C.fail(err); C.render(); });
      });
    }
  };
})();
