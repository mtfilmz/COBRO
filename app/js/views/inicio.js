/* Cobro · Inicio (administrador con balance; empleado sin montos) */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var month = C.monthKey(C.today());

  function recentRows(list, pm, showAmounts) {
    if (!list.length) return C.empty('Todavía no hay facturas', 'Crea la primera con el botón Nueva factura.');
    return list.map(function (inv) {
      var v = C.view(inv, pm);
      return '<a class="row rec-row' + (showAmounts === null ? ' noamt' : '') + '" href="#/factura/' + esc(inv.id) + '">' +
        '<span class="row-main"><span class="strong">' + esc(inv.customer.name) + '</span>' +
        '<span class="small muted ellipsis">' + esc(inv.number) + ' · ' + esc(C.mainConcept(inv)) + '</span></span>' +
        '<span class="row-type">' + C.typeTag(inv.type) + '</span>' +
        '<span class="row-date muted">' + esc(C.shortDate(inv.date)) + '</span>' +
        '<span class="row-status">' + C.pill(v.status) + '</span>' +
        (showAmounts === null ? '' : '<span class="row-amount strong">' + (showAmounts ? C.money(inv.total) : C.MASK) + '</span>') +
        '</a>';
    }).join('');
  }

  function admin() {
    var hide = !!(C.session.user.prefs && C.session.user.prefs.hideAmounts);
    var pm = C.paidMap();
    var m = function (v) { return hide ? C.MASK : C.money(v); };
    var inMonth = C.data.invoices.filter(function (i) { return !i.voided && C.monthKey(i.date) === month; });
    var facturado = inMonth.reduce(function (s, i) { return s + i.total; }, 0);
    var cobrado = C.data.payments.filter(function (p) {
      if (C.monthKey(p.date) !== month) return false;
      var inv = C.data.invoices.find(function (i) { return i.id === p.invoiceId; });
      return inv && !inv.voided;
    }).reduce(function (s, p) { return s + C.num(p.amount); }, 0);
    var open = C.data.invoices.filter(function (i) { return !i.voided && C.view(i, pm).balance > 0; });
    var porCobrar = open.reduce(function (s, i) { return s + C.view(i, pm).balance; }, 0);
    var pct = facturado > 0 ? Math.round(cobrado / facturado * 100) : 0;

    var cards = C.TYPE_KEYS.map(function (k) {
      var t = C.TYPES[k];
      var list = inMonth.filter(function (i) { return i.type === k; });
      var sum = list.reduce(function (s, i) { return s + i.total; }, 0);
      var share = facturado > 0 ? Math.round(sum / facturado * 100) : 0;
      return '<div class="card type-card">' +
        '<div class="type-head"><span class="chip-icon ' + t.cls + '">' + C.icon(t.icon) + '</span><span class="strong">' + t.plural + '</span>' +
        '<span class="small muted push">' + list.length + ' factura' + (list.length === 1 ? '' : 's') + '</span></div>' +
        '<span class="amount-md">' + m(sum) + '</span>' +
        '<div class="bar"><span class="' + t.cls + '" style="width:' + (hide ? 0 : share) + '%"></span></div>' +
        '<span class="small muted">' + (hide ? '•• %' : share + '%') + ' del mes</span></div>';
    }).join('');

    return '<header class="page-head"><div><p class="small muted">' + esc(C.longToday()) + ' · Vista de administrador</p><h1>Resumen</h1></div>' +
      '<div class="actions">' +
      '<button type="button" class="btn" id="toggle-amounts" aria-pressed="' + hide + '">' + C.icon(hide ? 'eye' : 'eyeOff', 16) + (hide ? 'Mostrar montos' : 'Ocultar montos') + '</button>' +
      '<div class="month-nav"><button type="button" class="icon-btn" data-month="-1" aria-label="Mes anterior">' + C.icon('chevLeft') + '</button>' +
      '<span class="strong">' + esc(C.monthLabel(month)) + '</span>' +
      '<button type="button" class="icon-btn" data-month="1" aria-label="Mes siguiente">' + C.icon('chevRight') + '</button></div>' +
      '<a class="btn primary" href="#/nueva">' + C.icon('plus', 18, 2) + 'Nueva factura</a></div></header>' +
      '<section class="kpis" aria-label="Totales">' +
      '<div class="card kpi"><span class="muted">Facturado</span><span class="amount-lg">' + m(facturado) + '</span><span class="small muted">' + inMonth.length + ' factura' + (inMonth.length === 1 ? '' : 's') + ' en el mes</span></div>' +
      '<div class="card kpi"><span class="muted">Cobrado</span><span class="amount-lg">' + m(cobrado) + '</span><span class="small ok-text">' + (hide ? '••' : pct) + '% de lo facturado</span></div>' +
      '<div class="card kpi"><span class="muted">Por cobrar (total)</span><span class="amount-lg">' + m(porCobrar) + '</span><span class="small pend-text">' + open.length + ' factura' + (open.length === 1 ? '' : 's') + ' con saldo</span></div>' +
      '</section>' +
      '<section class="stack"><h2 class="h2">Por tipo de factura</h2><div class="kpis">' + cards + '</div></section>' +
      '<section class="card list-card"><div class="card-head"><h2 class="h2">Facturas recientes</h2><a href="#/facturas" class="link">Ver todas</a></div>' +
      '<div class="rows">' + recentRows(C.data.invoices.slice(0, 6), pm, !hide) + '</div></section>';
  }

  function employee() {
    var pm = C.paidMap();
    var taller = C.data.invoices.filter(function (i) { return i.type === 'reparacion' && !i.voided && i.device && i.device.status !== 'Entregado'; });
    var quick = C.TYPE_KEYS.map(function (k) {
      var t = C.TYPES[k];
      var label = k === 'venta' ? 'Nueva venta' : k === 'servicio' ? 'Nuevo servicio' : 'Nueva reparación';
      return '<a class="card quick" href="#/nueva?tipo=' + k + '"><span class="chip-icon lg ' + t.cls + '">' + C.icon(t.icon, 20) + '</span>' +
        '<span><span class="strong block">' + label + '</span><span class="small muted">' + esc(t.desc) + '</span></span></a>';
    }).join('');
    var tallerRows = taller.length ? taller.map(function (inv) {
      var d = inv.device || {};
      var st = d.status || 'Recibido';
      var cls = st === 'Listo para entregar' ? 'ok' : st === 'En reparación' ? 'par' : 'void';
      return '<a class="row" href="#/factura/' + esc(inv.id) + '"><span class="row-main"><span class="strong">' + esc(d.model || C.mainConcept(inv)) + '</span>' +
        '<span class="small muted">' + esc(inv.number) + ' · ' + esc(inv.customer.name) + '</span></span><span class="pill ' + cls + '">' + esc(st) + '</span></a>';
    }).join('') : C.empty('No hay equipos en el taller', 'Las reparaciones que no se han entregado aparecen aquí.');
    return '<header class="page-head"><div><p class="small muted">' + esc(C.longToday()) + ' · Vista de empleado</p><h1>Inicio</h1></div>' +
      (C.can('crear') ? '<div class="actions"><a class="btn primary" href="#/nueva">' + C.icon('plus', 18, 2) + 'Nueva factura</a></div>' : '') + '</header>' +
      '<p class="notice">' + C.icon('lock', 16) + 'Los totales y el balance del negocio solo los ve el administrador.</p>' +
      (C.can('crear') ? '<section class="stack"><h2 class="h2">Empezar una factura</h2><div class="kpis">' + quick + '</div></section>' : '') +
      '<div class="two-col">' +
      '<section class="card list-card"><div class="card-head"><h2 class="h2">Equipos en el taller</h2><span class="small muted">' + taller.length + ' equipo' + (taller.length === 1 ? '' : 's') + '</span></div><div class="rows">' + tallerRows + '</div></section>' +
      '<section class="card list-card"><div class="card-head"><h2 class="h2">Facturas recientes</h2><a href="#/facturas" class="link">Ver todas</a></div><div class="rows">' +
      recentRows(C.data.invoices.slice(0, 6), pm, null) + '</div></section></div>';
  }

  C.views.inicio = {
    title: 'Inicio',
    render: function () { return C.isAdmin() ? admin() : employee(); },
    mount: function (root) {
      var t = root.querySelector('#toggle-amounts');
      if (t) t.addEventListener('click', function () {
        var hide = !(C.session.user.prefs && C.session.user.prefs.hideAmounts);
        C.setPref('hideAmounts', hide).then(C.render).catch(C.fail);
      });
      root.querySelectorAll('[data-month]').forEach(function (b) {
        b.addEventListener('click', function () { month = C.shiftMonth(month, parseInt(b.getAttribute('data-month'), 10)); C.render(); });
      });
    }
  };
})();
