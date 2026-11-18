/* Cobro · Clientes y Catálogo */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var q = '';
  var qc = '';

  function customerForm(c) {
    c = c || {};
    return '<div class="grid2">' +
      '<label class="field">Nombre<input class="input" name="name" value="' + esc(c.name || '') + '" autofocus required></label>' +
      '<label class="field">Teléfono<input class="input" type="tel" name="phone" value="' + esc(c.phone || '') + '"></label>' +
      '<label class="field">Correo<input class="input" type="email" name="email" value="' + esc(c.email || '') + '"></label>' +
      '<label class="field">Dirección<input class="input" name="address" value="' + esc(c.address || '') + '"></label></div>';
  }

  C.editCustomer = function (c) {
    return C.modal({
      title: c ? 'Editar cliente' : 'Nuevo cliente', okLabel: 'Guardar', html: customerForm(c),
      onOk: function (dlg) {
        var f = dlg.querySelector('form');
        var name = f.name.value.trim();
        if (!name) { C.toast('Escribe el nombre del cliente.', 'error'); return false; }
        var dup = C.findCustomer(name, f.phone.value);
        if (dup && (!c || dup.id !== c.id)) { C.toast('Ya existe un cliente con ese nombre o teléfono: ' + dup.name + '.', 'error'); return false; }
        return C.saveCustomer(Object.assign({}, c || {}, { name: name, phone: f.phone.value.trim(), email: f.email.value.trim(), address: f.address.value.trim() }))
          .then(function (row) { C.toast('Cliente guardado.'); return row; });
      }
    });
  };

  function stats() {
    var pm = C.paidMap();
    var s = {};
    C.data.invoices.forEach(function (inv) {
      var k = inv.customerId;
      if (!k) return;
      var x = s[k] || (s[k] = { count: 0, balance: 0, last: '' });
      if (!inv.voided) { x.count++; x.balance += C.view(inv, pm).balance; }
      if (inv.date > x.last) x.last = inv.date;
    });
    return s;
  }

  function customerRows() {
    var s = stats();
    var nq = C.norm(q);
    var list = C.data.customers.filter(function (c) {
      return !nq || C.norm(c.name + ' ' + c.phone + ' ' + c.email).indexOf(nq) >= 0 || (C.digits(q).length >= 3 && C.digits(c.phone).indexOf(C.digits(q)) >= 0);
    }).sort(function (a, b) { return C.norm(a.name) < C.norm(b.name) ? -1 : 1; });
    if (!list.length) return C.empty('No hay clientes', q ? 'Prueba con otra búsqueda.' : 'Se agregan solos al crear facturas, o con Nuevo cliente.');
    return list.slice(0, 300).map(function (c) {
      var x = s[c.id] || { count: 0, balance: 0, last: '' };
      return '<a class="row cust-row" href="#/cliente/' + esc(c.id) + '"><span class="avatar sm" aria-hidden="true">' + esc(C.initials(c.name)) + '</span>' +
        '<span class="row-main"><span class="strong">' + esc(c.name) + '</span><span class="small muted">' + esc(c.phone || 'Sin teléfono') + '</span></span>' +
        '<span class="muted small">' + x.count + ' factura' + (x.count === 1 ? '' : 's') + '</span>' +
        '<span class="muted small">' + (x.last ? 'Última: ' + esc(C.fmtDate(x.last)) : '') + '</span>' +
        (C.isAdmin() ? '<span class="row-amount ' + (x.balance > 0 ? 'pend-text' : 'muted') + '">' + (x.balance > 0 ? 'Saldo ' + C.money(x.balance) : 'Sin saldo') + '</span>' : '') + '</a>';
    }).join('') + (list.length > 300 ? '<p class="small muted pad">Mostrando 300 de ' + list.length + '. Usa la búsqueda.</p>' : '');
  }

  C.views.clientes = {
    title: 'Clientes',
    allowed: function () { return C.can('clientes'); },
    render: function () {
      return '<header class="page-head"><div><p class="small muted">' + C.data.customers.length + ' clientes guardados</p><h1>Clientes</h1></div>' +
        '<div class="actions"><button type="button" class="btn primary" id="new-cust">' + C.icon('plus', 18, 2) + 'Nuevo cliente</button></div></header>' +
        '<div class="toolbar"><label class="search wide">' + C.icon('search', 16) + '<span class="sr">Buscar</span><input type="search" id="q" placeholder="Nombre, teléfono o correo" value="' + esc(q) + '"></label></div>' +
        '<section class="card list-card"><div class="rows" id="list">' + customerRows() + '</div></section>';
    },
    mount: function (root) {
      root.querySelector('#q').addEventListener('input', function (e) { q = e.target.value; root.querySelector('#list').innerHTML = customerRows(); });
      root.querySelector('#new-cust').addEventListener('click', function () { C.editCustomer(null).then(function (row) { if (row) C.go('cliente/' + row.id); }); });
    }
  };

  C.views.cliente = {
    nav: 'clientes',
    title: 'Cliente',
    allowed: function () { return C.can('clientes'); },
    render: function (id) {
      var c = C.data.customers.find(function (x) { return x.id === id; });
      if (!c) return C.empty('No encontramos este cliente', '', '<a class="btn" href="#/clientes">Volver</a>');
      var pm = C.paidMap();
      var invs = C.data.invoices.filter(function (i) { return i.customerId === id; });
      var bal = invs.reduce(function (s, i) { return s + (i.voided ? 0 : C.view(i, pm).balance); }, 0);
      return '<header class="page-head"><div><a class="back" href="#/clientes">' + C.icon('back', 16) + 'Clientes</a><h1>' + esc(c.name) + '</h1></div>' +
        '<div class="actions"><button type="button" class="btn" id="edit">' + C.icon('edit', 16) + 'Editar</button>' +
        (C.can('crear') ? '<a class="btn primary" href="#/nueva?cliente=' + esc(c.id) + '">' + C.icon('plus', 18, 2) + 'Nueva factura</a>' : '') + '</div></header>' +
        '<section class="kpis"><div class="card kpi"><span class="muted">Teléfono</span><span class="strong">' + esc(c.phone || '—') + '</span><span class="small muted">' + esc(c.email || '') + '</span></div>' +
        '<div class="card kpi"><span class="muted">Facturas</span><span class="amount-md">' + invs.length + '</span><span class="small muted">' + esc(c.address || '') + '</span></div>' +
        (C.isAdmin() ? '<div class="card kpi"><span class="muted">Saldo pendiente</span><span class="amount-md ' + (bal > 0 ? 'pend-text' : '') + '">' + C.money(bal) + '</span></div>' : '') + '</section>' +
        '<section class="card list-card"><div class="card-head"><h2 class="h2">Facturas del cliente</h2></div><div class="rows">' +
        (invs.length ? invs.map(function (inv) {
          var v = C.view(inv, pm);
          return '<a class="row rec-row" href="#/factura/' + esc(inv.id) + '"><span class="row-main"><span class="strong">' + esc(inv.number) + '</span><span class="small muted ellipsis">' + esc(C.mainConcept(inv)) + '</span></span>' +
            '<span class="row-type">' + C.typeTag(inv.type) + '</span><span class="row-date muted">' + esc(C.fmtDate(inv.date)) + '</span><span class="row-status">' + C.pill(v.status) + '</span>' +
            '<span class="row-amount strong">' + C.money(inv.total) + '</span></a>';
        }).join('') : C.empty('Sin facturas', 'Este cliente todavía no tiene facturas.')) + '</div></section>';
    },
    mount: function (root, id) {
      var b = root.querySelector('#edit');
      if (b) b.addEventListener('click', function () {
        var c = C.data.customers.find(function (x) { return x.id === id; });
        C.editCustomer(c).then(function (row) { if (row) C.render(); });
      });
    }
  };

  /* ---------- Catálogo ---------- */
  function itemForm(it) {
    it = it || { type: 'venta', active: true };
    return '<div class="grid2"><label class="field">Nombre<input class="input" name="name" value="' + esc(it.name || '') + '" autofocus required></label>' +
      '<label class="field">Tipo sugerido<select class="input" name="type">' + C.TYPE_KEYS.map(function (k) { return '<option value="' + k + '"' + (it.type === k ? ' selected' : '') + '>' + C.TYPES[k].label + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Precio<input class="input right" name="price" inputmode="decimal" value="' + esc(it.price != null ? it.price : '') + '"></label>' +
      '<label class="field">Código (opcional)<input class="input" name="code" value="' + esc(it.code || '') + '"></label></div>' +
      '<label class="check"><input type="checkbox" name="active"' + (it.active !== false ? ' checked' : '') + '> Activo (aparece al facturar)</label>';
  }

  function editItem(it) {
    return C.modal({
      title: it ? 'Editar artículo' : 'Nuevo artículo', okLabel: 'Guardar', html: itemForm(it),
      onOk: function (dlg) {
        var f = dlg.querySelector('form');
        var name = f.name.value.trim();
        if (!name) { C.toast('Escribe el nombre.', 'error'); return false; }
        var dup = C.data.catalog.find(function (x) { return C.norm(x.name) === C.norm(name) && (!it || x.id !== it.id); });
        if (dup) { C.toast('Ya existe un artículo con ese nombre.', 'error'); return false; }
        return C.saveCatalogItem(Object.assign({}, it || {}, { name: name, type: f.type.value, price: C.round2(f.price.value), code: f.code.value.trim(), active: f.active.checked }))
          .then(function () { C.toast('Artículo guardado.'); return true; });
      }
    });
  }

  function catalogRows() {
    var nq = C.norm(qc);
    var list = C.data.catalog.filter(function (it) { return !nq || C.norm(it.name + ' ' + (it.code || '')).indexOf(nq) >= 0; })
      .sort(function (a, b) { return C.norm(a.name) < C.norm(b.name) ? -1 : 1; });
    if (!list.length) return C.empty('El catálogo está vacío', 'Agrega productos y servicios para escogerlos rápido al facturar.');
    return list.map(function (it) {
      return '<' + (C.isAdmin() ? 'button type="button" data-item="' + esc(it.id) + '"' : 'div') + ' class="row cat-row">' +
        '<span class="row-main"><span class="strong' + (it.active === false ? ' muted' : '') + '">' + esc(it.name) + '</span><span class="small muted">' + esc(it.code || (it.active === false ? 'Inactivo' : '')) + '</span></span>' +
        '<span class="row-type">' + C.typeTag(it.type || 'venta') + '</span><span class="row-amount strong">' + C.money(it.price) + '</span></' + (C.isAdmin() ? 'button' : 'div') + '>';
    }).join('');
  }

  C.views.catalogo = {
    title: 'Catálogo',
    render: function () {
      return '<header class="page-head"><div><p class="small muted">Productos y servicios</p><h1>Catálogo</h1></div>' +
        (C.isAdmin() ? '<div class="actions"><button type="button" class="btn primary" id="new-item">' + C.icon('plus', 18, 2) + 'Nuevo artículo</button></div>' : '') + '</header>' +
        '<div class="toolbar"><label class="search wide">' + C.icon('search', 16) + '<span class="sr">Buscar</span><input type="search" id="qc" placeholder="Buscar en el catálogo" value="' + esc(qc) + '"></label></div>' +
        '<section class="card list-card"><div class="rows" id="cat">' + catalogRows() + '</div></section>';
    },
    mount: function (root) {
      root.querySelector('#qc').addEventListener('input', function (e) { qc = e.target.value; root.querySelector('#cat').innerHTML = catalogRows(); });
      var nb = root.querySelector('#new-item');
      if (nb) nb.addEventListener('click', function () { editItem(null).then(function (ok) { if (ok) C.render(); }); });
      root.querySelector('#cat').addEventListener('click', function (e) {
        var b = e.target.closest('[data-item]');
        if (!b) return;
        var it = C.data.catalog.find(function (x) { return x.id === b.getAttribute('data-item'); });
        editItem(it).then(function (ok) { if (ok) C.render(); });
      });
    }
  };
})();
