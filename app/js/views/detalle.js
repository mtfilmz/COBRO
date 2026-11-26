/* Cobro · detalle de factura: hoja blanca para el cliente, cobros, equipo, fotos y actividad */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;

  function find(id) { return C.data.invoices.find(function (i) { return i.id === id; }); }

  /* Android: al volver a Cobro desde WhatsApp, sigue solo con el segundo paso (la foto) si quedó pendiente. */
  function resumeWa() {
    var p = C._waPending;
    if (!p || document.hidden) return;
    var age = Date.now() - p.at;
    if (age > 20 * 60 * 1000) { C._waPending = null; return; }
    if (age < 2500) return;
    setTimeout(p.run, 700);
  }
  document.addEventListener('visibilitychange', resumeWa);
  window.addEventListener('focus', resumeWa);

  function waNumber(phone) {
    var d = C.digits(phone);
    if (d.length === 10) d = '1' + d;
    return d.length >= 11 && d.length <= 15 ? d : '';
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
          var ft = C.ftEstado ? C.ftEstado(p, inv) : null;
          var ftCls = !ft ? '' : ft.key === 'enviado' ? 'ok-text' : ft.key === 'problema' ? 'danger-text' : ft.key === 'no_aplica' ? 'muted' : 'pend-text';
          return '<div class="pay-row"><span><span class="strong">' + C.money(p.amount) + '</span> <span class="muted">' + esc(p.method) + '</span>' +
            (ft && ft.key !== 'no_aplica' ? '<span class="small block ' + ftCls + '" title="' + esc(ft.detail || '') + '">' + esc(ft.label) + '</span>' : '') +
            '</span><span class="small muted">' + esc(C.fmtDate(p.date)) + '</span></div>';
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
        '<button type="button" class="btn" id="wa"' + (wa ? '' : ' disabled title="Agrega el número en Enviar a"') + '>' + C.icon('chat', 16) + 'WhatsApp</button>' +
        (C.isDesktop() ? '<button type="button" class="btn" id="sms"' + (wa ? '' : ' disabled title="Agrega el número en Enviar a"') + '>' + C.icon('chat', 16) + 'Mensaje</button>' : '') +
        (C.isAndroid() ? '<button type="button" class="btn" id="share">' + C.icon('share', 16) + 'Compartir</button>' : '') +
        '<button type="button" class="btn" id="saveimg">' + C.icon('image', 16) + 'Guardar imagen</button>' +
        (C.isAndroid() ? '' : '<button type="button" class="btn" id="print">' + C.icon('printer', 16) + 'Imprimir</button>') +
        (C.isAdmin() && !inv.voided ? '<button type="button" class="btn danger-text" id="void">Anular</button>' : '') + '</div></header>' +
        (C.isAndroid() ? '<div class="notice no-print" id="wa-step" hidden>' + C.icon('info', 16) + '<span style="flex:1">¿Ya enviaste el saludo? Ahora se abre el mismo chat con la foto de la factura.</span><button type="button" class="btn primary sm">Enviar la foto</button></div>' : '') +
        (inv.voided ? '<p class="notice danger no-print">' + C.icon('info', 16) + 'Anulada el ' + esc(C.stamp(inv.voidedAt || inv.createdAt)) + '. Motivo: ' + esc(inv.voidReason || '—') + '</p>' : '') +
        '<div class="detail-layout"><div class="paper-wrap">' + paper(inv, v) + '</div><aside class="detail-side no-print">' + side + '</aside></div>';
    },
    mount: function (root, id) {
      var inv = find(id);
      if (!inv) return;
      var v = C.view(inv);

      var pr = root.querySelector('#print');
      if (pr) pr.addEventListener('click', function () { window.print(); });

      function busy(btn, on) { if (btn) btn.disabled = on; }
      function caption() { return 'Factura ' + inv.number + ' · ' + (C.settings.business.name || ''); }

      /* Guardar la factura como imagen JPG. */
      var si = root.querySelector('#saveimg');
      si.addEventListener('click', function () {
        busy(si, true);
        C.invoiceJpg(inv, C.view(inv)).then(function (bytes) {
          return C.saveImage(inv.number + '.jpg', bytes);
        }).then(function (path) {
          C.commit({ put: { audit: [C.auditRow('Imagen', 'Imagen de la factura guardada', inv.id)] } });
          if (C.isAndroid()) C.toast('Imagen guardada (' + inv.number + '.jpg).');
          else C.savedToast(path, 'Imagen descargada (' + inv.number + '.jpg).');
        }).catch(C.fail).then(function () { busy(si, false); });
      });

      /* Android: menú Compartir con la imagen (WhatsApp, Messenger, correo…). */
      var sh = root.querySelector('#share');
      if (sh) sh.addEventListener('click', function () {
        busy(sh, true);
        var core = window.__TAURI__.core;
        C.invoiceJpg(inv, C.view(inv)).then(function (bytes) {
          return core.invoke('archivo_temporal', { nombre: inv.number + '.jpg', contenidoB64: C.toBase64(bytes) });
        }).then(function (path) {
          return core.invoke('plugin:compartir|share_file', { path: path, mimeType: 'image/jpeg', title: 'Enviar factura ' + inv.number, text: caption() });
        }).then(function () {
          C.commit({ put: { audit: [C.auditRow('Compartir', 'Imagen de la factura compartida', inv.id)] } });
        }).catch(C.fail).then(function () { busy(sh, false); });
      });

      var num = waNumber(inv.customer.sendTo || inv.customer.phone);
      var who = inv.customer.sendTo || inv.customer.phone;
      function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
      function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

      /* Android: imagen en la carpeta temporal para pasársela a WhatsApp o a Mensajes. */
      function tempImage() {
        return C.invoiceJpg(inv, C.view(inv)).then(function (bytes) {
          return window.__TAURI__.core.invoke('archivo_temporal', { nombre: inv.number + '.jpg', contenidoB64: C.toBase64(bytes) });
        });
      }
      /* Android: qué WhatsApp usar (si hay los dos, se pregunta una vez y se recuerda). */
      function pickWhatsApp() {
        var pref = lsGet('cobro-wa-android') || 'auto';
        return window.__TAURI__.core.invoke('plugin:compartir|whatsapp_apps').then(function (a) {
          a = a || {};
          if (pref === 'business' && a.business) return 'business';
          if (pref === 'whatsapp' && a.whatsapp) return 'whatsapp';
          if (a.whatsapp && a.business) {
            return C.modal({
              title: '¿Con cuál WhatsApp envías las facturas?',
              html: '<p class="muted">Este teléfono tiene WhatsApp y WhatsApp Business. Cobro recordará tu elección; puedes cambiarla en Ajustes › Facturación.</p>' +
                '<div class="right-actions"><button type="submit" class="btn" data-pick="whatsapp">WhatsApp</button>' +
                '<button type="submit" class="btn primary" data-pick="business">WhatsApp Business</button></div>',
              hideActions: true,
              onMount: function (dlg) {
                dlg.querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', function () { dlg._pick = b.getAttribute('data-pick'); }); });
              },
              onOk: function (dlg) { return dlg._pick || false; }
            }).then(function (c) {
              if (!c) { var e = new Error('cancelado'); e.cancel = true; throw e; }
              lsSet('cobro-wa-android', c); return c;
            });
          }
          if (a.business) return 'business';
          if (a.whatsapp) return 'whatsapp';
          throw new Error('WhatsApp no está instalado en este teléfono.');
        });
      }
      /* Windows: copia la imagen al portapapeles; si no se puede, la guarda. Siempre la deja también en Documentos › Cobro › Facturas. */
      function copyAndSave() {
        return C.invoiceCanvas(inv, C.view(inv)).then(function (cv) {
          var copied = C.canvasBytes(cv, 'image/png').then(function (png) {
            if (!navigator.clipboard || !window.ClipboardItem) return false;
            return navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]).then(function () { return true; }, function () { return false; });
          });
          var saved = C.canvasBytes(cv, 'image/jpeg', 0.92).then(function (jpg) { return C.saveImage(inv.number + '.jpg', jpg); }).catch(function () { return ''; });
          return Promise.all([copied, saved]).then(function (r) { return { copied: r[0], path: r[1] || '' }; });
        });
      }

      /* Android: WhatsApp solo pone la imagen directo en el chat si ya tienes un chat con ese número;
         si no, enseña la lista de contactos. Por eso, con un número nuevo, primero se abre su chat con un
         saludo (eso funciona con cualquier número) y al volver a Cobro se abre el mismo chat con la imagen. */
      function waChats() { try { return JSON.parse(lsGet('cobro-wa-chats') || '{}') || {}; } catch (e) { return {}; } }
      function waRemember(n) { var k = waChats(); k[n] = Date.now(); lsSet('cobro-wa-chats', JSON.stringify(k)); }
      function waImage(app) {
        return tempImage().then(function (path) {
          return window.__TAURI__.core.invoke('plugin:compartir|share_whatsapp', { path: path, phone: num, text: caption(), whatsapp: app });
        });
      }
      function waGreeting() {
        return 'Hola, le envío su factura ' + inv.number + ' de ' + (C.settings.business.name || 'nuestro negocio') + '.';
      }
      var waStep = root.querySelector('#wa-step');
      function waSecondStep(app) {
        if (!waStep) return;
        waStep.hidden = false;
        var b = waStep.querySelector('button');
        var fired = false;
        function go() {
          if (fired) return;
          fired = true;
          C._waPending = null;
          waStep.hidden = true;
          waRemember(num);
          waImage(app).then(function () {
            C.commit({ put: { audit: [C.auditRow('WhatsApp', 'Imagen de la factura enviada por WhatsApp a ' + who, inv.id)] } });
          }).catch(C.fail);
        }
        b.onclick = go;
        C._waPending = { at: Date.now(), run: go };
      }

      /* WhatsApp directo al número de "Enviar a". */
      var wa = root.querySelector('#wa');
      if (wa) wa.addEventListener('click', function () {
        if (!num) { C.toast('Agrega el número en Enviar a.', 'error'); return; }
        busy(wa, true);
        var done;
        if (C.isAndroid()) {
          done = pickWhatsApp().then(function (app) {
            if (waChats()[num]) return waImage(app);
            return window.__TAURI__.core.invoke('plugin:compartir|open_whatsapp_chat', { phone: num, text: waGreeting(), whatsapp: app }).then(function () {
              waSecondStep(app);
              C.toast('Envía el saludo y vuelve a Cobro: se abre el mismo chat con la foto de la factura.');
            });
          });
        } else {
          /* Windows: abre el chat del número en el programa de WhatsApp; si no está instalado, en el navegador. */
          done = copyAndSave().then(function (r) {
            var web = 'https://wa.me/' + num;
            var open = lsGet('cobro-wa-pc') === 'web' ? C.openUrl(web) : C.openUrl('whatsapp://send?phone=' + num).catch(function () { return C.openUrl(web); });
            return open.then(function () {
              C.toast(r.copied ? 'Imagen copiada. En el chat de WhatsApp pégala con Ctrl+V y toca Enviar.' : 'Imagen guardada' + (r.path ? ' en ' + r.path : '') + '. Adjúntala en el chat de WhatsApp.');
            });
          });
        }
        done.then(function () {
          C.commit({ put: { audit: [C.auditRow('WhatsApp', 'Factura enviada por WhatsApp a ' + who, inv.id)] } });
        }).catch(C.fail).then(function () { busy(wa, false); });
      });

      /* Mensaje de texto (con la imagen) directo al número de "Enviar a". */
      var sm = root.querySelector('#sms');
      if (sm) sm.addEventListener('click', function () {
        if (!num) { C.toast('Agrega el número en Enviar a.', 'error'); return; }
        busy(sm, true);
        var done;
        if (C.isAndroid()) {
          done = tempImage().then(function (path) {
            return window.__TAURI__.core.invoke('plugin:compartir|share_sms', { path: path, phone: '+' + num, text: caption() });
          }).then(function () {
            C.toast('Si la foto no aparece en el mensaje, mantén el dedo en el cuadro de texto y toca Pegar.');
          });
        } else {
          done = copyAndSave().then(function (r) {
            C.openExternal('sms:+' + num + '?body=' + encodeURIComponent(caption()));
            C.toast('Se abre Enlace Móvil con el número. ' + (r.copied ? 'Pega la imagen con Ctrl+V' : 'Adjunta la imagen') + (r.path ? ' (también está en ' + r.path + ')' : '') + ' y envía.');
          });
        }
        done.then(function () {
          C.commit({ put: { audit: [C.auditRow('Mensaje', 'Factura enviada por mensaje de texto a ' + who, inv.id)] } });
        }).catch(C.fail).then(function () { busy(sm, false); });
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
            (C.data.outbox.some(function (o) { return o.invoiceId === inv.id && o.status === 'enviado'; }) ? '<p class="notice">' + C.icon('info', 16) + 'Los pagos que ya se enviaron a FinTrack se quedan allá. Si corresponde, bórralos en FinTrack.</p>' : '') +
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
