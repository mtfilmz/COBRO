/* Cobro · Importar historial desde la app Factura (solo administrador) */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var parsed = null;
  var done = null;
  var SHOW = 100;

  function steps(n) {
    var names = ['Archivo', 'Revisar', 'Listo'];
    return '<ol class="stepper" aria-label="Pasos">' + names.map(function (s, i) {
      var cls = i + 1 < n ? 'done' : i + 1 === n ? 'now' : '';
      return '<li class="' + cls + '"' + (i + 1 === n ? ' aria-current="step"' : '') + '><span class="step-dot">' + (i + 1 < n ? C.icon('check', 12, 3) : i + 1) + '</span>' + s + '</li>';
    }).join('') + '</ol>';
  }

  function pick() {
    return steps(1) + '<section class="card pad stack"><h2 class="h2">Elige el archivo de Factura</h2>' +
      '<label class="drop">' + C.icon('upload', 28) + '<span class="strong">Selecciona el respaldo o el CSV</span><span class="small muted">.json o .csv</span>' +
      '<input type="file" id="file" accept=".json,.csv,application/json,text/csv"></label>' +
      '<div class="grid2"><div class="mini-card"><span class="strong">Respaldo completo (.json) · recomendado</span><span class="small muted">En Factura: Ajustes › Datos y exportación › Respaldo completo. Trae clientes, catálogo, facturas con sus artículos y pagos.</span></div>' +
      '<div class="mini-card"><span class="strong">CSV de historial</span><span class="small muted">Columnas: Número, Fecha, Cliente, Producto, Cantidad, Precio, Pagado y Tipo (opcional). Una fila por artículo.</span></div></div>' +
      '<p class="notice">' + C.icon('info', 16) + 'Las facturas importadas conservan su número original, quedan marcadas como Historial, no cambian la numeración nueva y el lote completo se puede revertir. Nada se guarda hasta que confirmes.</p></section>';
  }

  function review() {
    var p = parsed;
    var list = p.invoices;
    var fresh = list.filter(function (i) { return !i.duplicate; });
    var counts = { venta: 0, servicio: 0, reparacion: 0 };
    fresh.forEach(function (i) { counts[i.chosen]++; });
    var rows = list.slice(0, SHOW).map(function (inv, idx) {
      return '<div class="row imp-row' + (inv.duplicate ? ' dim' : '') + '">' +
        '<span>' + esc(inv.number) + (inv.duplicate ? '<span class="tag">Ya existe</span>' : '') + '</span>' +
        '<span class="muted">' + esc(C.fmtDate(inv.date)) + '</span>' +
        '<span class="row-main"><span class="strong">' + esc(inv.clientName) + '</span><span class="small muted ellipsis">' + esc(inv.lines.map(function (l) { return l.name; }).join(', ')) + '</span></span>' +
        '<span class="muted">' + esc(inv.sourceLabel) + '</span>' +
        '<span><select class="input sm" data-idx="' + idx + '" aria-label="Importar como"' + (inv.duplicate ? ' disabled' : '') + '>' +
        C.TYPE_KEYS.map(function (k) { return '<option value="' + k + '"' + (inv.chosen === k ? ' selected' : '') + '>' + C.TYPES[k].label + '</option>'; }).join('') + '</select>' +
        (inv.chosen !== inv.suggested ? '' : (inv.sourceLabel !== '—' && C.TYPES[inv.suggested].label !== inv.sourceLabel ? '<span class="small rep-text block">Sugerido por el concepto</span>' : '')) + '</span>' +
        '<span class="right strong">' + C.money(inv.total) + '</span>' +
        '<span>' + C.pill(inv.cancelled ? 'Anulada' : C.statusOf({ total: inv.total }, inv.paid)) + '</span></div>';
    }).join('');
    return steps(2) +
      '<section class="card pad file-line">' + C.icon('file', 22) + '<span class="row-main"><span class="strong">' + esc(p.file) + '</span><span class="small muted">' + (p.kind === 'json' ? 'Respaldo de Factura' : 'CSV de historial') + ' · leído' + (p.errors.length ? ' con ' + p.errors.length + ' aviso(s)' : ' sin errores') + '</span></span>' +
      '<button type="button" class="btn sm" id="change">Cambiar archivo</button></section>' +
      '<section class="kpis"><div class="card kpi"><span class="muted">Facturas nuevas</span><span class="amount-md">' + fresh.length + '</span><span class="small muted">' + (list.length - fresh.length) + ' ya existen (se omiten)</span></div>' +
      '<div class="card kpi"><span class="muted">Pagos</span><span class="amount-md">' + p.payCount + '</span></div>' +
      '<div class="card kpi"><span class="muted">Clientes</span><span class="amount-md">' + (p.clients.length || new Set(fresh.map(function (i) { return C.norm(i.clientName); })).size) + '</span><span class="small muted">Los repetidos se unen</span></div>' +
      '<div class="card kpi"><span class="muted">Catálogo</span><span class="amount-md">' + p.products.length + '</span></div></section>' +
      (p.errors.length ? '<div class="notice danger">' + C.icon('info', 16) + '<div>' + p.errors.slice(0, 5).map(esc).join('<br>') + (p.errors.length > 5 ? '<br>…y ' + (p.errors.length - 5) + ' más.' : '') + '</div></div>' : '') +
      '<section class="card list-card"><div class="card-head"><div><h2 class="h2">Revisa la clasificación</h2><p class="small muted">Sugerida según el tipo de cada artículo en Factura y palabras como «cambio de», «pantalla» o «batería».</p></div>' +
      '<div class="legend">' + C.TYPE_KEYS.map(function (k) { return '<span><span class="dot ' + C.TYPES[k].cls + '"></span>' + C.TYPES[k].label + ' ' + counts[k] + '</span>'; }).join('') + '</div></div>' +
      '<div class="bulk"><span class="small muted">Cambiar todas las de</span><select class="input sm" id="bulk-from">' + C.TYPE_KEYS.map(function (k) { return '<option value="' + k + '">' + C.TYPES[k].label + '</option>'; }).join('') + '</select>' +
      '<span class="small muted">a</span><select class="input sm" id="bulk-to">' + C.TYPE_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === 'reparacion' ? ' selected' : '') + '>' + C.TYPES[k].label + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="btn sm" id="bulk">Aplicar</button></div>' +
      '<div class="list-head imp-row" aria-hidden="true"><span>Nº original</span><span>Fecha</span><span>Cliente y concepto</span><span>En Factura</span><span>Importar como</span><span class="right">Total</span><span>Estado</span></div>' +
      '<div class="rows">' + (rows || C.empty('El archivo no tiene facturas', '')) + '</div>' +
      '<div class="card-foot"><span class="small muted">Mostrando ' + Math.min(SHOW, list.length) + ' de ' + list.length + ' facturas' + (list.length > SHOW ? ' (las demás usan la clasificación sugerida o la de "Cambiar todas")' : '') + '</span></div></section>' +
      '<div class="right-actions"><button type="button" class="btn" id="back">Atrás</button><button type="button" class="btn primary lg" id="go"' + (fresh.length ? '' : ' disabled') + '>Importar ' + fresh.length + ' factura' + (fresh.length === 1 ? '' : 's') + '</button></div>';
  }

  function finished() {
    var b = done;
    return steps(3) + '<section class="card pad stack center-block">' + '<span class="big-check">' + C.icon('check', 28, 2.5) + '</span>' +
      '<h2 class="h2">Historial importado</h2><p class="muted">' + b.counts.invoices + ' facturas, ' + b.counts.payments + ' pagos, ' + b.counts.customers + ' clientes nuevos y ' + b.counts.catalog + ' artículos de catálogo.' +
      (b.counts.skipped ? ' Se omitieron ' + b.counts.skipped + ' que ya existían.' : '') + '</p>' +
      '<div class="actions-center"><a class="btn primary" href="#/facturas">Ver facturas</a><button type="button" class="btn" id="again">Importar otro archivo</button><a class="btn" href="#/ajustes/datos">Ver lotes importados</a></div></section>';
  }

  C.views.importar = {
    title: 'Importar historial',
    allowed: function () { return C.isAdmin(); },
    render: function () {
      return '<header class="page-head"><div><p class="small muted">Desde la app Factura</p><h1>Importar historial</h1></div></header>' +
        '<div class="stack">' + (done ? finished() : parsed ? review() : pick()) + '</div>';
    },
    mount: function (root) {
      var file = root.querySelector('#file');
      if (file) file.addEventListener('change', function () {
        var f = file.files[0];
        if (!f) return;
        C.readFileText(f).then(function (t) {
          parsed = C.parseImport(t, f.name);
          done = null;
          C.render();
        }).catch(C.fail);
      });
      var ch = root.querySelector('#change');
      if (ch) ch.addEventListener('click', function () { parsed = null; C.render(); });
      var back = root.querySelector('#back');
      if (back) back.addEventListener('click', function () { parsed = null; C.render(); });
      root.querySelectorAll('select[data-idx]').forEach(function (s) {
        s.addEventListener('change', function () { parsed.invoices[parseInt(s.getAttribute('data-idx'), 10)].chosen = s.value; });
      });
      var bulk = root.querySelector('#bulk');
      if (bulk) bulk.addEventListener('click', function () {
        var from = root.querySelector('#bulk-from').value, to = root.querySelector('#bulk-to').value;
        var n = 0;
        parsed.invoices.forEach(function (i) { if (!i.duplicate && i.chosen === from) { i.chosen = to; n++; } });
        C.toast(n + ' factura(s) cambiadas a ' + C.TYPES[to].label + '.');
        C.render();
      });
      var go = root.querySelector('#go');
      if (go) go.addEventListener('click', function () {
        go.disabled = true;
        go.textContent = 'Importando…';
        C.commitImport(parsed).then(function (batch) {
          done = batch;
          parsed = null;
          C.render();
        }).catch(function (e) { go.disabled = false; C.fail(e); });
      });
      var again = root.querySelector('#again');
      if (again) again.addEventListener('click', function () { done = null; parsed = null; C.render(); });
      if (done) { /* al salir de la pantalla vuelve al paso 1 */ setTimeout(function () { done = null; }, 0); }
    },
    reset: function () { done = null; parsed = null; }
  };
})();
