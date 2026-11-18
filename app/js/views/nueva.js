/* Cobro · Nueva factura (Venta, Servicio o Reparación) */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var draft = null;
  var draftHash = '';

  function newDraft(type) {
    var b = C.settings.billing;
    return {
      type: C.TYPES[type] ? type : 'reparacion',
      date: C.today(),
      customer: { name: '', phone: '', sendTo: '' },
      device: { type: 'Celular', model: '', serial: '', issue: '', accessories: '', warranty: b.warrantyDefault, status: 'Recibido' },
      lines: [{ name: '', description: '', qty: 1, price: '' }],
      discountOn: false, discountType: 'fixed', discountValue: '',
      note: '', method: b.methods[0] || 'Efectivo', received: '', photos: []
    };
  }

  function totals() {
    var lines = draft.lines.filter(function (l) { return l.name.trim() || C.num(l.price); });
    return C.totals(lines, draft.discountType, draft.discountOn ? draft.discountValue : 0, C.settings.billing.tax[draft.type]);
  }

  function setPath(obj, path, val) {
    var p = path.split('.');
    var o = obj;
    for (var i = 0; i < p.length - 1; i++) o = o[p[i]];
    o[p[p.length - 1]] = val;
  }

  function typeCards() {
    return C.TYPE_KEYS.map(function (k) {
      var t = C.TYPES[k];
      var on = draft.type === k;
      return '<button type="button" class="type-pick' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-type="' + k + '">' +
        '<span class="chip-icon lg ' + t.cls + '">' + C.icon(t.icon, 20) + '</span><span><span class="strong block">' + t.label + '</span><span class="small muted">' + esc(t.desc) + '</span></span></button>';
    }).join('');
  }

  function linesHtml() {
    return draft.lines.map(function (l, i) {
      return '<div class="line" data-line="' + i + '">' +
        '<div class="line-name"><input class="input" aria-label="Concepto" list="catalog-list" data-l="name" value="' + esc(l.name) + '" placeholder="Producto o servicio">' +
        '<input class="input sub" aria-label="Descripción opcional" data-l="description" value="' + esc(l.description) + '" placeholder="Descripción (opcional)"></div>' +
        '<input class="input center" aria-label="Cantidad" data-l="qty" inputmode="decimal" value="' + esc(l.qty) + '">' +
        '<input class="input right" aria-label="Precio" data-l="price" inputmode="decimal" value="' + esc(l.price) + '" placeholder="0.00">' +
        '<span class="line-amount strong" data-amount>' + C.money(C.lineAmount(l)) + '</span>' +
        '<button type="button" class="icon-btn" data-remove="' + i + '" aria-label="Quitar artículo"' + (draft.lines.length === 1 ? ' disabled' : '') + '>' + C.icon('x', 16) + '</button></div>';
    }).join('');
  }

  function photosHtml() {
    var thumbs = draft.photos.map(function (src, i) {
      return '<span class="thumb"><img src="' + src + '" alt="Foto del equipo ' + (i + 1) + '"><button type="button" class="thumb-x" data-photo-x="' + i + '" aria-label="Quitar foto">' + C.icon('x', 14, 2.2) + '</button></span>';
    }).join('');
    var add = draft.photos.length < 3 ? '<label class="photo-add">' + C.icon('camera', 22) + '<span>Tomar o subir foto</span>' +
      '<input type="file" accept="image/*" capture="environment" multiple id="photo-input"></label>' : '';
    return thumbs + add;
  }

  function summaryHtml() {
    var t = totals();
    var rate = C.num(C.settings.billing.tax[draft.type]);
    var received = C.num(draft.received);
    var change = draft.method === 'Efectivo' && received > t.total ? C.round2(received - t.total) : 0;
    var partial = draft.received !== '' && received > 0 && received < t.total;
    return '<div class="sum-rows">' +
      '<div class="sum-row"><span>Subtotal</span><span>' + C.money(t.subtotal) + '</span></div>' +
      (draft.discountOn ? '<div class="sum-row"><span>Descuento</span><span>-' + C.money(t.discount) + '</span></div>' : '') +
      (rate > 0 ? '<div class="sum-row"><span>IVU (' + rate + '%)</span><span>' + C.money(t.tax) + '</span></div>' : '') +
      '<div class="sum-total"><span>Total</span><span>' + C.money(t.total) + '</span></div></div>' +
      (change > 0 ? '<p class="small ok-text">Cambio: ' + C.money(change) + '</p>' : '') +
      (partial ? '<p class="small par-text">Queda como pago parcial; saldo ' + C.money(t.total - received) + '.</p>' : '') +
      '<span data-total-label hidden>' + C.money(t.total) + '</span>';
  }

  function render() {
    var d = draft;
    var dev = d.device;
    var custOptions = C.data.customers.map(function (c) { return '<option value="' + esc(c.name) + '">' + esc(c.phone || '') + '</option>'; }).join('');
    var catOptions = C.data.catalog.filter(function (c) { return c.active !== false; }).map(function (c) { return '<option value="' + esc(c.name) + '">' + C.money(c.price) + '</option>'; }).join('');
    var methods = C.settings.billing.methods;
    return '<header class="page-head"><div><a class="back" href="#/facturas">' + C.icon('back', 16) + 'Facturas</a><h1>Nueva factura</h1></div>' +
      '<div class="actions"><span class="num-chip">' + C.icon('lock', 14) + '<span class="small muted">Número automático</span><strong id="num">' + esc(C.peekNumber(d.type)) + '</strong></span></div></header>' +
      '<datalist id="cust-list">' + custOptions + '</datalist><datalist id="catalog-list">' + catOptions + '</datalist>' +
      '<form id="inv-form" class="form-layout" novalidate><div class="form-main">' +

      '<section class="card pad stack"><h2 class="h2">Tipo de factura</h2><div class="type-picks" id="types">' + typeCards() + '</div></section>' +

      '<section class="card pad stack"><h2 class="h2">Cliente</h2><div class="grid2">' +
      '<label class="field">Nombre del cliente<input class="input" list="cust-list" data-f="customer.name" value="' + esc(d.customer.name) + '" autocomplete="off" required></label>' +
      '<label class="field">Teléfono<input class="input" type="tel" data-f="customer.phone" value="' + esc(d.customer.phone) + '" placeholder="787-000-0000"><span class="hint">Se completa solo si el cliente ya está guardado</span></label>' +
      '<label class="field">Enviar a (WhatsApp)<input class="input" type="tel" data-f="customer.sendTo" value="' + esc(d.customer.sendTo) + '"></label>' +
      '<label class="field">Fecha<input class="input" type="date" data-f="date" value="' + esc(d.date) + '"></label></div></section>' +

      '<section class="card pad stack" id="device"' + (d.type === 'reparacion' ? '' : ' hidden') + '><div class="card-head flat"><h2 class="h2">Equipo recibido</h2><span class="pill rep">Solo en reparaciones</span></div>' +
      '<div class="grid3">' +
      '<label class="field">Tipo de equipo<select class="input" data-f="device.type">' + C.DEVICE_TYPES.map(function (t) { return '<option' + (dev.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Marca y modelo<input class="input" data-f="device.model" value="' + esc(dev.model) + '" placeholder="Ej.: Apple iPhone 13, PS5"></label>' +
      '<label class="field">IMEI, número de serie o modelo<input class="input" data-f="device.serial" value="' + esc(dev.serial) + '"><span class="hint">¿No aparece ninguno? Agrega una foto del equipo.</span></label></div>' +
      '<div class="field"><span class="field-label">Foto del equipo (opcional)</span><div class="photos" id="photos">' + photosHtml() + '</div>' +
      '<span class="hint">Úsala cuando no se vea el IMEI, el número de serie ni el modelo, o para dejar constancia de cómo llegó el equipo. Hasta 3 fotos; se guardan en este equipo.</span></div>' +
      '<label class="field">Falla reportada<textarea class="input" rows="2" data-f="device.issue">' + esc(dev.issue) + '</textarea></label>' +
      '<div class="grid3">' +
      '<label class="field">Accesorios recibidos<input class="input" data-f="device.accessories" value="' + esc(dev.accessories) + '" placeholder="Ej.: sin funda ni cargador"></label>' +
      '<label class="field">Garantía<select class="input" data-f="device.warranty">' + C.WARRANTIES.map(function (w) { return '<option value="' + w + '"' + (C.num(dev.warranty) === w ? ' selected' : '') + '>' + (w ? w + ' días' : 'Sin garantía') + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Estado del equipo<select class="input" data-f="device.status">' + C.DEVICE_STATUS.map(function (s) { return '<option' + (dev.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label></div></section>' +

      '<section class="card pad stack"><div class="card-head flat"><h2 class="h2">Artículos</h2></div>' +
      '<div class="lines-head" aria-hidden="true"><span>Concepto</span><span class="center">Cant.</span><span class="right">Precio</span><span class="right">Importe</span><span></span></div>' +
      '<div id="lines">' + linesHtml() + '</div>' +
      '<button type="button" class="btn dashed" id="add-line">' + C.icon('plus', 16, 2) + 'Agregar artículo</button></section>' +

      '<section class="card pad"><label class="field">Nota para el cliente (opcional)<textarea class="input" rows="2" data-f="note" placeholder="Aparece al pie de la factura">' + esc(d.note) + '</textarea></label></section>' +
      '</div>' +

      '<aside class="card pad stack form-side" aria-labelledby="res"><h2 class="h2" id="res">Resumen</h2>' +
      '<div id="summary">' + summaryHtml() + '</div>' +
      '<div class="discount"><label class="check"><input type="checkbox" id="disc-on"' + (d.discountOn ? ' checked' : '') + '> Aplicar descuento</label>' +
      '<div class="disc-fields"' + (d.discountOn ? '' : ' hidden') + '><input class="input" inputmode="decimal" data-f="discountValue" value="' + esc(d.discountValue) + '" aria-label="Descuento">' +
      '<select class="input" data-f="discountType" aria-label="Tipo de descuento"><option value="fixed"' + (d.discountType === 'fixed' ? ' selected' : '') + '>$</option><option value="percent"' + (d.discountType === 'percent' ? ' selected' : '') + '>%</option></select></div></div>' +
      '<div class="field"><span class="field-label" id="metodo">Método de pago</span><div class="methods" role="group" aria-labelledby="metodo">' +
      methods.map(function (m) { return '<button type="button" class="method' + (d.method === m ? ' on' : '') + '" aria-pressed="' + (d.method === m) + '" data-method="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div></div>' +
      '<label class="field">Monto recibido<input class="input right big" inputmode="decimal" data-f="received" value="' + esc(d.received) + '" placeholder="Total completo"></label>' +
      '<button type="submit" class="btn primary block lg" data-save="cobrar">Guardar y cobrar <span id="btn-total">' + C.money(totals().total) + '</span></button>' +
      '<button type="button" class="btn block" data-save="pendiente">Guardar como pendiente</button>' +
      '<p class="small muted">El número se asigna al guardar y no se puede cambiar. Las facturas no se borran: se anulan indicando el motivo.</p>' +
      '</aside></form>';
  }

  function refreshTotals(root) {
    root.querySelector('#summary').innerHTML = summaryHtml();
    root.querySelector('#btn-total').textContent = C.money(totals().total);
  }

  function validate() {
    var lines = draft.lines.filter(function (l) { return l.name.trim() || C.num(l.price); });
    if (!draft.customer.name.trim()) return 'Escribe el nombre del cliente.';
    if (!lines.length) return 'Agrega al menos un artículo.';
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].name.trim()) return 'Cada artículo necesita un nombre.';
      if (C.num(lines[i].qty) <= 0) return 'La cantidad de "' + lines[i].name + '" debe ser mayor que cero.';
      if (C.num(lines[i].price) < 0) return 'El precio de "' + lines[i].name + '" no puede ser negativo.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return 'Revisa la fecha.';
    return '';
  }

  C.views.nueva = {
    nav: 'facturas',
    title: 'Nueva factura',
    allowed: function () { return C.can('crear'); },
    render: function (param, query) {
      if (!draft || draftHash !== location.hash) {
        draft = newDraft(query.tipo || 'reparacion');
        draftHash = location.hash;
        var pre = query.cliente && C.data.customers.find(function (c) { return c.id === query.cliente; });
        if (pre) draft.customer = { name: pre.name, phone: pre.phone || '', sendTo: pre.phone || '' };
      }
      return render();
    },
    mount: function (root) {
      var form = root.querySelector('#inv-form');

      root.querySelector('#types').addEventListener('click', function (e) {
        var b = e.target.closest('[data-type]');
        if (!b) return;
        draft.type = b.getAttribute('data-type');
        root.querySelector('#types').innerHTML = typeCards();
        root.querySelector('#device').hidden = draft.type !== 'reparacion';
        root.querySelector('#num').textContent = C.peekNumber(draft.type);
        refreshTotals(root);
      });

      form.addEventListener('input', function (e) {
        var el = e.target;
        var f = el.getAttribute('data-f');
        if (f) {
          var prevPhone = draft.customer.phone;
          setPath(draft, f, el.value);
          if (f === 'customer.phone' && (!draft.customer.sendTo || draft.customer.sendTo === prevPhone)) {
            draft.customer.sendTo = el.value;
            form.querySelector('[data-f="customer.sendTo"]').value = el.value;
          }
          if (f === 'discountValue' || f === 'discountType' || f === 'received') refreshTotals(root);
        }
        var lf = el.getAttribute('data-l');
        if (lf) {
          var row = el.closest('[data-line]');
          var i = parseInt(row.getAttribute('data-line'), 10);
          draft.lines[i][lf] = el.value;
          if (lf === 'name') {
            var item = C.data.catalog.find(function (c) { return C.norm(c.name) === C.norm(el.value); });
            if (item && !C.num(draft.lines[i].price)) {
              draft.lines[i].price = String(item.price);
              row.querySelector('[data-l="price"]').value = item.price;
            }
          }
          row.querySelector('[data-amount]').textContent = C.money(C.lineAmount(draft.lines[i]));
          refreshTotals(root);
        }
      });

      form.addEventListener('change', function (e) {
        var el = e.target;
        if (el.getAttribute('data-f') === 'customer.name') {
          var c = C.data.customers.find(function (x) { return C.norm(x.name) === C.norm(el.value); });
          if (c && c.phone) {
            if (!draft.customer.phone) { draft.customer.phone = c.phone; form.querySelector('[data-f="customer.phone"]').value = c.phone; }
            if (!draft.customer.sendTo) { draft.customer.sendTo = c.phone; form.querySelector('[data-f="customer.sendTo"]').value = c.phone; }
          }
        }
        if (el.getAttribute('data-f') && el.tagName === 'SELECT') { setPath(draft, el.getAttribute('data-f'), el.value); refreshTotals(root); }
        if (el.id === 'disc-on') {
          draft.discountOn = el.checked;
          root.querySelector('.disc-fields').hidden = !el.checked;
          refreshTotals(root);
        }
        if (el.id === 'photo-input') {
          var files = Array.prototype.slice.call(el.files || [], 0, 3 - draft.photos.length);
          Promise.all(files.map(function (f) { return C.compressImage(f); })).then(function (srcs) {
            draft.photos = draft.photos.concat(srcs).slice(0, 3);
            root.querySelector('#photos').innerHTML = photosHtml();
          }).catch(C.fail);
        }
      });

      root.querySelector('#photos').addEventListener('click', function (e) {
        var x = e.target.closest('[data-photo-x]');
        if (!x) return;
        draft.photos.splice(parseInt(x.getAttribute('data-photo-x'), 10), 1);
        root.querySelector('#photos').innerHTML = photosHtml();
      });

      root.querySelector('#add-line').addEventListener('click', function () {
        draft.lines.push({ name: '', description: '', qty: 1, price: '' });
        root.querySelector('#lines').innerHTML = linesHtml();
        var inputs = root.querySelectorAll('#lines [data-l="name"]');
        inputs[inputs.length - 1].focus();
      });
      root.querySelector('#lines').addEventListener('click', function (e) {
        var r = e.target.closest('[data-remove]');
        if (!r || draft.lines.length === 1) return;
        draft.lines.splice(parseInt(r.getAttribute('data-remove'), 10), 1);
        root.querySelector('#lines').innerHTML = linesHtml();
        refreshTotals(root);
      });

      root.querySelector('.methods').addEventListener('click', function (e) {
        var b = e.target.closest('[data-method]');
        if (!b) return;
        draft.method = b.getAttribute('data-method');
        root.querySelectorAll('[data-method]').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('on', on);
          x.setAttribute('aria-pressed', on);
        });
        refreshTotals(root);
      });

      function save(kind) {
        var err = validate();
        if (err) { C.toast(err, 'error'); return; }
        var t = totals();
        var pay = null;
        if (kind === 'cobrar' && t.total > 0) {
          var amount = draft.received === '' ? t.total : Math.min(C.num(draft.received), t.total);
          if (amount > 0) pay = { amount: amount, method: draft.method };
        }
        var dev = draft.type === 'reparacion' ? Object.assign({}, draft.device, { warranty: C.num(draft.device.warranty) }) : null;
        var buttons = root.querySelectorAll('[data-save]');
        buttons.forEach(function (b) { b.disabled = true; });
        C.createInvoice({
          type: draft.type, date: draft.date, customer: draft.customer, device: dev,
          lines: draft.lines.filter(function (l) { return l.name.trim(); }),
          discountType: draft.discountType, discountValue: draft.discountOn ? draft.discountValue : 0, note: draft.note
        }, pay, draft.type === 'reparacion' ? draft.photos : []).then(function (inv) {
          draft = null;
          C.toast('Factura ' + inv.number + ' guardada.');
          C.go('factura/' + inv.id);
        }).catch(function (e2) { buttons.forEach(function (b) { b.disabled = false; }); C.fail(e2); });
      }
      form.addEventListener('submit', function (e) { e.preventDefault(); save('cobrar'); });
      root.querySelector('[data-save="pendiente"]').addEventListener('click', function () { save('pendiente'); });
    }
  };
})();
