/* Cobro · lista de facturas con pestañas por tipo, búsqueda y filtros */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var st = { tab: 'todas', q: '', estado: '', periodo: 'todo', limit: 50 };
  var TABS = [['todas', 'Todas'], ['venta', 'Ventas'], ['servicio', 'Servicios'], ['reparacion', 'Reparaciones']];

  function inPeriod(inv) {
    var t = C.today();
    if (st.periodo === 'mes') return C.monthKey(inv.date) === C.monthKey(t);
    if (st.periodo === 'mespasado') return C.monthKey(inv.date) === C.shiftMonth(C.monthKey(t), -1);
    if (st.periodo === 'anio') return inv.date.slice(0, 4) === t.slice(0, 4);
    return true;
  }

  function matches(inv) {
    if (!st.q) return true;
    var q = C.norm(st.q);
    var d = inv.device || {};
    var hay = [inv.number, inv.originalNumber, inv.customer.name, inv.customer.phone, d.model, d.serial, d.type]
      .concat((inv.lines || []).map(function (l) { return l.name; })).join(' ');
    return C.norm(hay).indexOf(q) >= 0 || (C.digits(q).length >= 4 && C.digits(inv.customer.phone).indexOf(C.digits(q)) >= 0);
  }

  function filtered(pm) {
    return C.data.invoices.filter(function (inv) {
      if (st.tab !== 'todas' && inv.type !== st.tab) return false;
      if (!inPeriod(inv) || !matches(inv)) return false;
      if (st.estado && C.view(inv, pm).status !== st.estado) return false;
      return true;
    });
  }

  function listHtml() {
    var pm = C.paidMap();
    var list = filtered(pm);
    var shown = list.slice(0, st.limit);
    var rows = shown.map(function (inv) {
      var v = C.view(inv, pm);
      return '<a class="row inv-row" href="#/factura/' + esc(inv.id) + '">' +
        '<span class="row-num"><span>' + esc(inv.number) + '</span>' + (inv.source === 'historial' ? '<span class="tag">Historial</span>' : '') + '</span>' +
        '<span class="row-main"><span class="strong">' + esc(inv.customer.name) + '</span><span class="small muted ellipsis">' + esc(C.mainConcept(inv)) + '</span></span>' +
        '<span class="row-type">' + C.typeTag(inv.type) + '</span>' +
        '<span class="row-date muted">' + esc(C.fmtDate(inv.date)) + '</span>' +
        '<span class="row-status">' + C.pill(v.status) + '</span>' +
        '<span class="row-amount"><span class="strong' + (inv.voided ? ' strike' : '') + '">' + C.money(inv.total) + '</span>' +
        (v.balance > 0 && v.status !== 'Pendiente' ? '<span class="small pend-text">Saldo ' + C.money(v.balance) + '</span>' : '') + '</span></a>';
    }).join('');
    if (!list.length) rows = C.empty('No hay facturas con estos filtros', st.q ? 'Prueba con otra búsqueda.' : 'Cambia el periodo o crea una factura nueva.');
    return '<div class="rows">' + rows + '</div>' +
      '<div class="card-foot"><span class="small muted">Mostrando ' + shown.length + ' de ' + list.length + ' factura' + (list.length === 1 ? '' : 's') + '</span>' +
      (list.length > shown.length ? '<button type="button" class="btn sm" id="more">Mostrar más</button>' : '') + '</div>';
  }

  function tabsHtml() {
    var pm = C.paidMap();
    return TABS.map(function (t) {
      var n = C.data.invoices.filter(function (inv) {
        return (t[0] === 'todas' || inv.type === t[0]) && inPeriod(inv) && matches(inv) && (!st.estado || C.view(inv, pm).status === st.estado);
      }).length;
      return '<button type="button" class="seg-btn' + (st.tab === t[0] ? ' on' : '') + '" aria-pressed="' + (st.tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + '<span class="count">' + n + '</span></button>';
    }).join('');
  }

  C.views.facturas = {
    title: 'Facturas',
    render: function () {
      return '<header class="page-head"><div><p class="small muted">Ventas, servicios y reparaciones</p><h1>Facturas</h1></div><div class="actions">' +
        (C.views.pendientes && C.views.pendientes.allowed() ? '<a class="btn pend-link" href="#/pendientes">' + C.icon('clipboard', 16) + 'Pendientes' + (C.pendCount() ? ' <span class="nav-badge">' + C.pendCount() + '</span>' : '') + '</a>' : '') +
        (C.isAdmin() ? '<button type="button" class="btn" id="export">' + C.icon('download', 16) + 'Exportar CSV</button>' : '') +
        (C.can('crear') ? '<a class="btn primary" href="#/nueva">' + C.icon('plus', 18, 2) + 'Nueva factura</a>' : '') + '</div></header>' +
        '<div class="toolbar"><div class="seg" role="group" aria-label="Tipo de factura" id="tabs">' + tabsHtml() + '</div>' +
        '<div class="filters"><label class="search">' + C.icon('search', 16) + '<span class="sr">Buscar</span>' +
        '<input type="search" id="q" placeholder="Cliente, número, teléfono, IMEI o equipo" value="' + esc(st.q) + '"></label>' +
        '<label class="select-wrap">Estado<select id="estado"><option value="">Todos</option>' +
        ['Pagada', 'Pendiente', 'Parcial', 'Anulada'].map(function (s) { return '<option' + (st.estado === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
        '<label class="select-wrap">Periodo<select id="periodo">' +
        [['todo', 'Todo'], ['mes', 'Este mes'], ['mespasado', 'Mes pasado'], ['anio', 'Este año']].map(function (p) {
          return '<option value="' + p[0] + '"' + (st.periodo === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
        }).join('') + '</select></label></div></div>' +
        '<section class="card list-card" aria-label="Lista de facturas"><div class="list-head inv-row" aria-hidden="true"><span>Nº</span><span>Cliente y concepto</span><span>Tipo</span><span>Fecha</span><span>Estado</span><span class="right">Total</span></div>' +
        '<div id="list">' + listHtml() + '</div></section>';
    },
    mount: function (root) {
      var list = root.querySelector('#list');
      var tabs = root.querySelector('#tabs');
      function refresh() { list.innerHTML = listHtml(); tabs.innerHTML = tabsHtml(); bindMore(); }
      function bindMore() {
        var more = root.querySelector('#more');
        if (more) more.addEventListener('click', function () { st.limit += 50; refresh(); });
      }
      bindMore();
      tabs.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tab]');
        if (!b) return;
        st.tab = b.getAttribute('data-tab'); st.limit = 50; refresh();
      });
      root.querySelector('#q').addEventListener('input', function (e) { st.q = e.target.value; st.limit = 50; refresh(); });
      root.querySelector('#estado').addEventListener('change', function (e) { st.estado = e.target.value; refresh(); });
      root.querySelector('#periodo').addEventListener('change', function (e) { st.periodo = e.target.value; refresh(); });
      var ex = root.querySelector('#export');
      if (ex) ex.addEventListener('click', function () {
        var pm = C.paidMap();
        var rows = [['Número', 'Fecha', 'Tipo', 'Cliente', 'Teléfono', 'Concepto', 'Total', 'Pagado', 'Saldo', 'Estado', 'Origen']];
        filtered(pm).forEach(function (inv) {
          var v = C.view(inv, pm);
          rows.push([inv.number, C.fmtDate(inv.date), C.TYPES[inv.type].label, inv.customer.name, inv.customer.phone, C.mainConcept(inv), inv.total.toFixed(2), v.paid.toFixed(2), v.balance.toFixed(2), v.status, inv.source === 'historial' ? 'Historial' : 'Cobro']);
        });
        C.saveFile('Exportaciones', 'cobro-facturas-' + C.today() + '.csv', C.csv(rows), 'text/csv;charset=utf-8')
          .then(function (path) { C.savedToast(path, 'CSV descargado.'); }).catch(C.fail);
      });
    }
  };
})();
