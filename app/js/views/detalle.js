/* Cobro · detalle de factura: hoja blanca para el cliente, cobros, equipo, fotos y actividad */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;

  function find(id) { return C.data.invoices.find(function (i) { return i.id === id; }); }

  function waNumber(phone) {
    var d = C.digits(phone);
    if (d.length === 10) d = '1' + d;
    return d.length >= 11 && d.length <= 15 ? d : '';
  }

  function waText(inv, v) {
    var b = C.settings.business;
    var txt = 'Hola ' + inv.customer.name + ', gracias por preferir ' + b.name + '. Factura ' + inv.number + ' (' + C.TYPES[inv.type].label.toLowerCase() + ') por ' + C.money(inv.total) + '.';
    if (v.balance > 0) txt += ' Saldo pendiente: ' + C.money(v.balance) + '.';
    else txt += ' Pagada en su totalidad.';
    if (inv.type === 'reparacion' && inv.device && inv.device.status === 'Listo para entregar') txt += ' Su equipo está listo para recoger.';
    if (b.phone) txt += ' Tel. ' + b.phone + '.';
    return txt;
  }

  function paper(inv, v) {
    var b = C.settings.business;
    var d = inv.device || {};
    var warranty = C.num(d.warranty);
    var rows = (inv.lines || []).map(function (l) {
      return '<div class="p-line"><span><span class="strong">' + esc(l.name) + '</span>' + (l.description ? '<span class="small muted block">' + esc(l.description) + '</span>' : '') + '</span>' +
        '<span class="center">' + esc(l.qty) + '</span><span class="right">' + C.money(l.price) + '</span><span class="right">' + C.money(C.lineAmount(l)) + '</span></div>';
    }).join('');
    return '<article class="paper" aria-label="Factura ' + esc(inv.number) + '">' +
      (inv.voided ? '<div class="void-stamp">ANULADA</div>' : '') +
      '<div class="p-head"><div class="p-biz">' + C.logoBlock(52) + '<div><div class="p-biz-name">' + esc(b.name) + '</div>' +
      (b.address ? '<div>' + esc(b.address) + '</div>' : '') +
      '<div>' + esc([b.phone, b.instagram].filter(Boolean).join(' · ')) + '</div>' + (b.email ? '<div>' + esc(b.email) + '</div>' : '') + '</div></div>' +
      '<div class="p-title"><span class="eyebrow">FACTURA</span><span class="p-num">' + esc(inv.number) + '</span>' + C.typeTag(inv.type) + '</div></div>' +
      '<div class="p-meta"><div><span class="small muted">Cliente</span><span class="strong">' + esc(inv.customer.name) + '</span>' + (inv.customer.phone ? '<span>' + esc(inv.customer.phone) + '</span>' : '') + '</div>' +
      '<div><span class="small muted">Fecha</span><span class="strong">' + esc(C.fmtDate(inv.date)) + '</span></div>' +
      (inv.type === 'reparacion' ? '<div><span class="small muted">Garantía</span><span class="strong">' + (warranty ? warranty + ' días' : 'Sin garantía') + '</span>' +
        (warranty ? '<span>Hasta el ' + esc(C.fmtDate(C.addDays(inv.date, warranty))) + '</span>' : '') + '</div>' : '') + '</div>' +
      (inv.type === 'reparacion' && (d.model || d.serial || d.issue || d.accessories) ? '<div class="p-device">' +
        (d.model || d.type ? '<div><span class="small muted">Equipo</span><span>' + esc([d.model, d.type].filter(Boolean).join(' · ')) + '</span></div>' : '') +
        (d.serial ? '<div><span class="small muted">IMEI, número de serie o modelo</span><span>' + esc(d.serial) + '</span></div>' : '') +
        (d.issue ? '<div class="full"><span class="small muted">Falla reportada</span><span>' + esc(d.issue) + '</span></div>' : '') +
        (d.accessories ? '<div><span class="small muted">Accesorios recibidos</span><span>' + esc(d.accessories) + '</span></div>' : '') + '</div>' : '') +
      '<div class="p-lines"><div class="p-line p-line-head"><span>Concepto</span><span class="center">Cant.</span><span class="right">Precio</span><span class="right">Importe</span></div>' + rows + '</div>' +
      '<div class="p-totals">' +
      '<div><span>Subtotal</span><span>' + C.money(inv.subtotal) + '</span></div>' +
      (inv.discount ? '<div><span>Descuento</span><span>-' + C.money(inv.discount) + '</span></div>' : '') +
      (inv.tax ? '<div><span>IVU' + (inv.taxRate ? ' (' + inv.taxRate + '%)' : '') + '</span><span>' + C.money(inv.tax) + '</span></div>' : '') +
      (inv.extra ? '<div><span>Otros cargos</span><span>' + C.money(inv.extra) + '</span></div>' : '') +
      '<div class="p-total"><span>Total</span><span>' + C.money(inv.total) + '</span></div>' +
      '<div><span>Pagado</span><span>' + C.money(v.paid) + '</span></div>' +
      '<div class="p-balance"><span>Saldo pendiente</span><span>' + C.money(v.balance) + '</span></div></div>' +
      (inv.note ? '<p class="p-note">' + esc(inv.note) + '</p>' : '') +
      '<div class="p-foot"><span class="strong">' + esc(b.thanks || ('Gracias por preferir ' + b.name + '.')) + '</span>' + (b.terms ? '<span>' + esc(b.terms) + '</span>' : '') +
      (inv.source === 'historial' ? '<span class="small muted">Importada del historial de Factura.</span>' : '') + '</div>' +
      '</article>';
  }

  C.views.factura = {
    nav: 'facturas',
    title: function (id) { var i = find(id); return i ? i.number : 'Factura'; },
    render: function (id) {
      var inv = find(id);
      if (!inv) return C.empty('No encontramos esta factura', 'Puede que se haya revertido una importación.', '<a class="btn" href="#/facturas">Volver a Facturas</a>');
      var v = C.view(inv);
      var pays = C.data.payments.filter(function (p) { return p.invoiceId === inv.id; }).sort(function (a, b) { return a.createdAt - b.createdAt; });
      var log = C.data.audit.filter(function (a) { return a.invoiceId === inv.id; });
      var d = inv.device || {};
      var stepIdx = C.DEVICE_STATUS.indexOf(d.status || 'Recibido');
      var next = C.DEVICE_STATUS[stepIdx + 1];
      var wa = waNumber(inv.customer.sendTo || inv.customer.phone);

      var side = '<section class="card pad stack"><h2 class="h2">Cobro</h2><div class="sum-rows">' +
        '<div class="sum-row"><span>Total</span><span>' + C.money(inv.total) + '</span></div>' +
        '<div class="sum-row"><span>Pagado</span><span>' + C.money(v.paid) + '</span></div>' +
        '<div class="sum-total"><span>Saldo</span><span class="' + (v.balance > 0 ? 'pend-text' : '') + '">' + C.money(v.balance) + '</span></div></div>' +
        (v.balance > 0 && !inv.voided && C.can('pagos') ? '<button type="button" class="btn primary block lg" id="pay">Registrar pago</button>' : '') +
        (v.balance > 0 && !inv.voided && !C.can('pagos') ? '<p class="small muted">Para cobrar el saldo pide al administrador el permiso "Registrar pagos".</p>' : '') +
        (pays.length ? '<div class="pays">' + pays.map(function (p) {
          return '<div class="pay-row"><span><span class="strong">' + C.money(p.amount) + '</span> <span class="muted">' + esc(p.method) + '</span></span><span class="small muted">' + esc(C.fmtDate(p.date)) + '</span></div>';
        }).join('') + '</div>' : '') + '</section>';

      if (inv.type === 'reparacion' && !inv.voided) {
        side += '<section class="card pad stack"><h2 class="h2">Estado del equipo</h2><ol class="steps">' +
          C.DEVICE_STATUS.map(function (s, i) {
            var cls = i < stepIdx ? 'done' : i === stepIdx ? 'now' : '';
            return '<li class="' + cls + '"><span class="step-dot">' + (i < stepIdx ? C.icon('check', 12, 3) : '') + '</span><span>' + esc(s) + (i === stepIdx && d.statusAt ? '<span class="small muted block">' + esc(C.stamp(d.statusAt)) + '</span>' : '') + '</span></li>';
          }).join('') + '</ol>' +
          (next ? '<button type="button" class="btn block" id="next-status" data-next="' + esc(next) + '">Marcar: ' + esc(next) + '</button>' : '') + '</section>' +
          '<section class="card pad stack"><div class="card-head flat"><h2 class="h2">Foto del equipo</h2><span class="small muted" id="photo-count">Opcional</span></div>' +
          '<div class="photos" id="photo-grid"><span class="small muted">Cargando…</span></div><p class="small muted">Privada: no sale en la factura impresa ni en el PDF.</p></section>';
      }
      side += '<section class="card pad stack"><h2 class="h2">Actividad</h2><ul class="log">' +
        (log.length ? log.map(function (a) { return '<li><span>' + esc(a.detail || a.action) + '</span><span class="small muted">' + esc(C.stamp(a.at)) + ' · ' + esc(a.user) + '</span></li>'; }).join('') : '<li class="muted">Sin actividad registrada.</li>') +
        '</ul></section>';

      return '<header class="page-head no-print"><div><a class="back" href="#/facturas">' + C.icon('back', 16) + 'Facturas</a>' +
        '<h1 class="h1-row">' + esc(inv.number) + ' ' + C.pill(v.status) + (inv.source === 'historial' ? '<span class="tag">Historial</span>' : '') + '</h1></div>' +
        '<div class="actions">' +
        '<button type="button" class="btn" id="wa"' + (wa ? '' : ' disabled title="Agrega el teléfono del cliente"') + '>' + C.icon('chat', 16) + 'WhatsApp</button>' +
        '<button type="button" class="btn" id="print">' + C.icon('printer', 16) + 'Imprimir o PDF</button>' +
        (C.isAdmin() && !inv.voided ? '<button type="button" class="btn danger-text" id="void">Anular</button>' : '') + '</div></header>' +
        (inv.voided ? '<p class="notice danger no-print">' + C.icon('info', 16) + 'Anulada el ' + esc(C.stamp(inv.voidedAt || inv.createdAt)) + '. Motivo: ' + esc(inv.voidReason || '—') + '</p>' : '') +
        '<div class="detail-layout"><div class="paper-wrap">' + paper(inv, v) + '</div><aside class="detail-side no-print">' + side + '</aside></div>';
    },
    mount: function (root, id) {
      var inv = find(id);
      if (!inv) return;
      var v = C.view(inv);

      root.querySelector('#print').addEventListener('click', function () { window.print(); });

      var wa = root.querySelector('#wa');
      if (wa) wa.addEventListener('click', function () {
        var num = waNumber(inv.customer.sendTo || inv.customer.phone);
        var url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(waText(inv, v));
        var ok = C.openExternal(url);
        C.commit({ put: { audit: [C.auditRow('WhatsApp', 'Mensaje preparado para ' + (inv.customer.sendTo || inv.customer.phone), inv.id)] } });
        if (!ok) {
          try { navigator.clipboard.writeText(waText(inv, v)); C.toast('Sin internet: el mensaje quedó copiado para enviarlo luego.'); } catch (e) { C.toast('No se pudo abrir WhatsApp.', 'error'); }
        }
      });

      var pay = root.querySelector('#pay');
      if (pay) pay.addEventListener('click', function () {
        var methods = C.settings.billing.methods;
        C.modal({
          title: 'Registrar pago · ' + inv.number,
          okLabel: 'Registrar pago',
          html: '<p class="muted">Saldo pendiente: <strong>' + C.money(v.balance) + '</strong></p>' +
            '<div class="grid2"><label class="field">Monto<input class="input right big" name="amount" inputmode="decimal" value="' + v.balance.toFixed(2) + '" autofocus></label>' +
            '<label class="field">Fecha<input class="input" type="date" name="date" value="' + C.today() + '"></label></div>' +
            '<label class="field">Método de pago<select class="input" name="method">' + methods.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></label>',
          onOk: function (dlg) {
            var f = dlg.querySelector('form');
            return C.addPayment(inv, C.num(f.amount.value), f.method.value, f.date.value).then(function () { C.toast('Pago registrado.'); return true; });
          }
        }).then(function (ok) { if (ok) C.render(); });
      });

      var vd = root.querySelector('#void');
      if (vd) vd.addEventListener('click', function () {
        C.modal({
          title: 'Anular ' + inv.number, okLabel: 'Anular factura', okKind: 'danger',
          html: '<p class="muted">La factura no se borra: queda visible, tachada y fuera de los totales.' + (v.paid > 0 ? ' Tiene pagos por ' + C.money(v.paid) + '; devuélvelos al cliente si corresponde.' : '') + '</p>' +
            '<label class="field">Motivo (obligatorio)<textarea class="input" name="reason" rows="3" autofocus></textarea></label>',
          onOk: function (dlg) {
            var reason = dlg.querySelector('[name=reason]').value.trim();
            if (reason.length < 3) { C.toast('Escribe el motivo de la anulación.', 'error'); return false; }
            return C.voidInvoice(inv, reason).then(function () { C.toast('Factura anulada.'); return true; });
          }
        }).then(function (ok) { if (ok) C.render(); });
      });

      var ns = root.querySelector('#next-status');
      if (ns) ns.addEventListener('click', function () {
        C.setDeviceStatus(inv, ns.getAttribute('data-next')).then(function () { C.toast('Estado actualizado.'); C.render(); }).catch(C.fail);
      });

      var grid = root.querySelector('#photo-grid');
      if (grid) {
        C.getPhotos(inv.id).then(function (photos) {
          root.querySelector('#photo-count').textContent = 'Opcional · ' + photos.length + ' de 3';
          grid.innerHTML = photos.map(function (p, i) {
            return '<button type="button" class="thumb" data-view="' + i + '" aria-label="Ver foto ' + (i + 1) + '"><img src="' + p.dataUrl + '" alt=""></button>';
          }).join('') + (photos.length < 3 ? '<label class="photo-add">' + C.icon('camera', 22) + '<span>Agregar</span><input type="file" accept="image/*" capture="environment" multiple id="add-photo"></label>' : '');
          grid.addEventListener('click', function (e) {
            var b = e.target.closest('[data-view]');
            if (!b) return;
            var p = photos[parseInt(b.getAttribute('data-view'), 10)];
            C.modal({
              title: 'Foto del equipo · ' + inv.number, wide: true, okLabel: C.isAdmin() ? 'Borrar foto' : null, okKind: 'danger', cancelLabel: 'Cerrar',
              html: '<img class="photo-big" src="' + p.dataUrl + '" alt="Foto del equipo"><p class="small muted">' + esc(C.stamp(p.createdAt)) + ' · ' + esc(p.createdBy || '') + '</p>',
              onOk: function () { return C.deletePhoto(p).then(function () { C.toast('Foto borrada.'); return true; }); }
            }).then(function (ok) { if (ok) C.render(); });
          });
          var add = root.querySelector('#add-photo');
          if (add) add.addEventListener('change', function () {
            var files = Array.prototype.slice.call(add.files || [], 0, 3 - photos.length);
            Promise.all(files.map(function (f) { return C.compressImage(f); }))
              .then(function (srcs) { return C.addPhotos(inv, srcs); })
              .then(function () { C.toast('Foto guardada.'); C.render(); }).catch(C.fail);
          });
        }).catch(C.fail);
      }
    }
  };
})();
