/* Cobro · Reportes (solo administrador) */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var range = null;

  function preset(key) {
    var t = C.today();
    var m = C.monthKey(t);
    if (key === 'mes') return { from: m + '-01', to: t, key: key };
    if (key === 'mespasado') {
      var pm = C.shiftMonth(m, -1);
      return { from: pm + '-01', to: C.addDays(m + '-01', -1), key: key };
    }
    if (key === 'anio') return { from: t.slice(0, 4) + '-01-01', to: t, key: key };
    return { from: '2000-01-01', to: '2999-12-31', key: 'todo' };
  }

  function compute() {
    var pm = C.paidMap();
    var inRange = function (d) { return d >= range.from && d <= range.to; };
    var invs = C.data.invoices.filter(function (i) { return inRange(i.date); });
    var active = invs.filter(function (i) { return !i.voided; });
    var byId = {};
    C.data.invoices.forEach(function (i) { byId[i.id] = i; });
    var pays = C.data.payments.filter(function (p) { var i = byId[p.invoiceId]; return i && !i.voided && inRange(p.date); });
    var r = {
      facturado: active.reduce(function (s, i) { return s + i.total; }, 0),
      cobrado: pays.reduce(function (s, p) { return s + C.num(p.amount); }, 0),
      saldo: active.reduce(function (s, i) { return s + C.view(i, pm).balance; }, 0),
      count: active.length, anuladas: invs.length - active.length,
      types: {}, methods: {}, months: {}
    };
    C.TYPE_KEYS.forEach(function (k) { r.types[k] = { count: 0, total: 0, cobrado: 0, saldo: 0 }; });
    active.forEach(function (i) {
      var t = r.types[i.type];
      t.count++; t.total += i.total; t.saldo += C.view(i, pm).balance;
      var mk = C.monthKey(i.date);
      (r.months[mk] = r.months[mk] || { total: 0, cobrado: 0, count: 0 }).total += i.total;
      r.months[mk].count++;
    });
    pays.forEach(function (p) {
      var i = byId[p.invoiceId];
      r.types[i.type].cobrado += C.num(p.amount);
      var m = r.methods[p.method] || (r.methods[p.method] = { count: 0, total: 0 });
      m.count++; m.total += C.num(p.amount);
      var mk = C.monthKey(p.date);
      (r.months[mk] = r.months[mk] || { total: 0, cobrado: 0, count: 0 }).cobrado += C.num(p.amount);
    });
    return r;
  }

  C.views.reportes = {
    title: 'Reportes',
    allowed: function () { return C.isAdmin(); },
    render: function () {
      if (!range) range = preset('mes');
      var r = compute();
      var presets = [['mes', 'Este mes'], ['mespasado', 'Mes pasado'], ['anio', 'Este año'], ['todo', 'Todo']];
      var months = Object.keys(r.months).sort().reverse();
      return '<header class="page-head"><div><p class="small muted">Solo el administrador ve esta pantalla</p><h1>Reportes</h1></div>' +
        '<div class="actions"><button type="button" class="btn" id="csv">' + C.icon('download', 16) + 'Exportar CSV</button></div></header>' +
        '<div class="toolbar"><div class="seg" role="group" aria-label="Periodo">' + presets.map(function (p) {
          return '<button type="button" class="seg-btn' + (range.key === p[0] ? ' on' : '') + '" aria-pressed="' + (range.key === p[0]) + '" data-preset="' + p[0] + '">' + p[1] + '</button>';
        }).join('') + '</div><div class="filters">' +
        '<label class="select-wrap">Desde<input type="date" id="from" value="' + (range.key === 'todo' ? '' : range.from) + '"></label>' +
        '<label class="select-wrap">Hasta<input type="date" id="to" value="' + (range.key === 'todo' ? '' : range.to) + '"></label></div></div>' +
        '<section class="kpis">' +
        '<div class="card kpi"><span class="muted">Facturado</span><span class="amount-lg">' + C.money(r.facturado) + '</span><span class="small muted">' + r.count + ' facturas' + (r.anuladas ? ' · ' + r.anuladas + ' anuladas' : '') + '</span></div>' +
        '<div class="card kpi"><span class="muted">Cobrado en el periodo</span><span class="amount-lg">' + C.money(r.cobrado) + '</span></div>' +
        '<div class="card kpi"><span class="muted">Por cobrar de estas facturas</span><span class="amount-lg pend-text">' + C.money(r.saldo) + '</span></div></section>' +
        '<div class="two-col">' +
        '<section class="card list-card"><div class="card-head"><h2 class="h2">Por tipo</h2></div><table class="table"><thead><tr><th>Tipo</th><th class="right">Facturas</th><th class="right">Facturado</th><th class="right">Cobrado</th><th class="right">Por cobrar</th></tr></thead><tbody>' +
        C.TYPE_KEYS.map(function (k) { var t = r.types[k]; return '<tr><td>' + C.typeTag(k) + '</td><td class="right">' + t.count + '</td><td class="right">' + C.money(t.total) + '</td><td class="right">' + C.money(t.cobrado) + '</td><td class="right">' + C.money(t.saldo) + '</td></tr>'; }).join('') +
        '</tbody></table></section>' +
        '<section class="card list-card"><div class="card-head"><h2 class="h2">Por método de pago</h2></div><table class="table"><thead><tr><th>Método</th><th class="right">Pagos</th><th class="right">Monto</th></tr></thead><tbody>' +
        (Object.keys(r.methods).length ? Object.keys(r.methods).sort().map(function (k) { var m = r.methods[k]; return '<tr><td>' + esc(k) + '</td><td class="right">' + m.count + '</td><td class="right">' + C.money(m.total) + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="muted">Sin pagos en este periodo.</td></tr>') +
        '</tbody></table></section></div>' +
        '<section class="card list-card"><div class="card-head"><h2 class="h2">Por mes</h2></div><table class="table"><thead><tr><th>Mes</th><th class="right">Facturas</th><th class="right">Facturado</th><th class="right">Cobrado</th></tr></thead><tbody>' +
        (months.length ? months.map(function (k) { var m = r.months[k]; return '<tr><td>' + esc(C.monthLabel(k)) + '</td><td class="right">' + m.count + '</td><td class="right">' + C.money(m.total) + '</td><td class="right">' + C.money(m.cobrado) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="muted">Sin facturas en este periodo.</td></tr>') +
        '</tbody></table></section>';
    },
    mount: function (root) {
      root.querySelectorAll('[data-preset]').forEach(function (b) {
        b.addEventListener('click', function () { range = preset(b.getAttribute('data-preset')); C.render(); });
      });
      function custom() {
        var f = root.querySelector('#from').value, t = root.querySelector('#to').value;
        if (f && t && f <= t) { range = { from: f, to: t, key: 'custom' }; C.render(); }
      }
      root.querySelector('#from').addEventListener('change', custom);
      root.querySelector('#to').addEventListener('change', custom);
      root.querySelector('#csv').addEventListener('click', function () {
        var r = compute();
        var rows = [['Reporte de Cobro', range.key === 'todo' ? 'Todo' : C.fmtDate(range.from) + ' a ' + C.fmtDate(range.to)], [],
          ['Tipo', 'Facturas', 'Facturado', 'Cobrado', 'Por cobrar']];
        C.TYPE_KEYS.forEach(function (k) { var t = r.types[k]; rows.push([C.TYPES[k].label, t.count, t.total.toFixed(2), t.cobrado.toFixed(2), t.saldo.toFixed(2)]); });
        rows.push(['Total', r.count, r.facturado.toFixed(2), r.cobrado.toFixed(2), r.saldo.toFixed(2)], [], ['Método', 'Pagos', 'Monto']);
        Object.keys(r.methods).forEach(function (k) { rows.push([k, r.methods[k].count, r.methods[k].total.toFixed(2)]); });
        C.saveFile('Exportaciones', 'cobro-reporte-' + C.today() + '.csv', C.csv(rows), 'text/csv;charset=utf-8')
          .then(function (path) { C.savedToast(path, 'Reporte descargado.'); }).catch(C.fail);
      });
    }
  };
})();
