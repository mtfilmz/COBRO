/* Cobro · Ajustes (solo administrador): Negocio, Apariencia, Usuarios, Facturación, Datos y respaldo */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var TABS = [['negocio', 'Negocio'], ['apariencia', 'Apariencia'], ['usuarios', 'Usuarios'], ['facturacion', 'Facturación'], ['fintrack', 'FinTrack'], ['gamefix', 'Game Fix'], ['nube', 'Nube'], ['datos', 'Datos y respaldo']];
  var PERMS = [
    ['crear', 'Crear facturas', 'Incluye cobrar al momento de crearla', false],
    ['clientes', 'Ver y agregar clientes', 'Necesario para buscar clientes al facturar', false],
    ['pagos', 'Registrar pagos en facturas existentes', 'Por ejemplo, cobrar el saldo de una reparación', false],
    ['_balance', 'Ver balance total, totales del mes y reportes', 'Solo el administrador', true],
    ['_anular', 'Anular facturas', 'Solo el administrador', true],
    ['_ajustes', 'Ajustes, usuarios e importar historial', 'Solo el administrador', true]
  ];

  function field(label, name, value, extra) {
    return '<label class="field">' + label + '<input class="input" name="' + name + '" value="' + esc(value == null ? '' : value) + '"' + (extra || '') + '></label>';
  }

  function negocio() {
    var b = C.settings.business;
    return '<form id="f-negocio" class="card pad stack" novalidate><h2 class="h2">Datos del negocio</h2>' +
      '<p class="small muted">Salen en el encabezado de cada factura, en el PDF, en la impresión y en el mensaje de WhatsApp.</p>' +
      '<div class="logo-row">' + C.logoBlock(64) + '<div class="stack-sm"><label class="btn sm">' + C.icon('upload', 16) + 'Subir logo<input type="file" accept="image/*" id="logo" hidden></label>' +
      (b.logo ? '<button type="button" class="btn sm" id="logo-x">Quitar logo</button>' : '') + '</div></div>' +
      '<div class="grid2">' + field('Nombre', 'name', b.name) + field('Teléfono', 'phone', b.phone) +
      field('Dirección', 'address', b.address) + field('Instagram', 'instagram', b.instagram) + field('Correo', 'email', b.email, ' type="email"') +
      field('Mensaje de agradecimiento', 'thanks', b.thanks) + '</div>' +
      '<label class="field">Términos y garantía (al pie de la factura)<textarea class="input" name="terms" rows="3">' + esc(b.terms) + '</textarea></label>' +
      '<div class="right-actions"><button class="btn primary" type="submit">Guardar</button></div></form>';
  }

  function apariencia() {
    return '<section class="card pad stack"><h2 class="h2">Tema</h2><p class="small muted">Se aplica a toda la app al instante y se guarda para tu usuario. La factura que recibe el cliente siempre sale en blanco.</p>' +
      '<div class="theme-cards" role="radiogroup" aria-label="Tema">' + C.THEME_LIST.map(function (t) {
        var on = C.themeKey === t.key;
        var tk = C.THEMES[t.key === 'auto' ? 'claro' : t.key];
        var dark = C.THEMES.oscuro;
        var mini = t.key === 'auto'
          ? '<span class="mini split"><span style="background:' + tk.bg + '"><i style="background:' + tk.surface + ';border-color:' + tk.border + '"></i><b style="background:' + tk.primary + '"></b></span><span style="background:' + dark.bg + '"><i style="background:' + dark.surface + ';border-color:' + dark.border + '"></i><b style="background:' + dark.primary + '"></b></span></span>'
          : '<span class="mini" style="background:' + tk.bg + ';border-color:' + tk.border + '"><span style="background:' + tk.surface + ';border-color:' + tk.border + '"></span><i style="background:' + tk.text + '"></i><i class="box" style="background:' + tk.surface + ';border-color:' + tk.border + '"></i><b style="background:' + tk.primary + '"></b></span>';
        return '<button type="button" class="theme-card' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-theme-key="' + t.key + '">' + mini +
          '<span class="strong">' + esc(t.name) + '</span><span class="small muted">' + esc(t.desc) + '</span></button>';
      }).join('') + '</div></section>';
  }

  function permRows(u) {
    var p = u.permissions || {};
    return PERMS.map(function (d) {
      var on = d[3] ? false : (d[0] === 'pagos' ? !!p.pagos : p[d[0]] !== false);
      return '<div class="perm"><span><span class="strong' + (d[3] ? ' muted' : '') + '">' + esc(d[1]) + '</span><span class="small muted block">' + esc(d[2]) + '</span></span>' +
        '<button type="button" class="switch" role="switch" aria-checked="' + on + '" aria-label="' + esc(d[1]) + '"' + (d[3] ? ' disabled' : ' data-perm="' + d[0] + '" data-user="' + esc(u.id) + '"') + '><span></span></button></div>';
    }).join('');
  }

  function usuarios() {
    var admin = C.data.users.find(function (u) { return u.role === 'admin'; });
    var emps = C.data.users.filter(function (u) { return u.role === 'empleado'; });
    return '<section class="card pad stack"><h2 class="h2">Administrador</h2>' +
      '<div class="user-line"><span class="avatar admin" aria-hidden="true">' + esc(C.initials(admin.email)) + '</span><span class="row-main"><span class="strong">' + esc(admin.email) + '</span><span class="small muted">Dueño · acceso completo</span></span>' +
      '<button type="button" class="btn sm" data-edit-user="' + esc(admin.id) + '">Cambiar correo o PIN</button></div>' +
      '<p class="small muted">Ve el balance, los reportes, anula facturas, importa el historial, cambia los ajustes y maneja los usuarios.</p>' +
      '<div class="actions-left"><button type="button" class="btn sm" id="new-code">' + C.icon('lock', 16) + 'Crear código de recuperación nuevo</button><span class="small muted">Sirve para cambiar el PIN si se olvida.</span></div></section>' +
      emps.map(function (u) {
        var revoked = u.status === 'revocado';
        return '<section class="card pad stack"><div class="card-head flat"><h2 class="h2">Empleado</h2>' +
          '<span class="pill ' + (revoked ? 'void' : u.pinHash ? 'ok' : 'pend') + '">' + (revoked ? 'Sin acceso' : u.pinHash ? 'Activo' : 'Falta PIN') + '</span></div>' +
          '<div class="user-line"><span class="avatar" aria-hidden="true">' + esc(C.initials(u.email)) + '</span><span class="row-main"><span class="strong">' + esc(u.email) + '</span><span class="small muted">Empleado</span></span>' +
          '<button type="button" class="btn sm" data-edit-user="' + esc(u.id) + '">Cambiar correo o PIN</button>' +
          '<button type="button" class="btn sm ' + (revoked ? '' : 'danger-text') + '" data-revoke="' + esc(u.id) + '">' + (revoked ? 'Devolver acceso' : 'Quitar acceso') + '</button></div>' +
          '<div class="perms"><div class="perms-head">Permisos del empleado</div>' + permRows(u) + '</div></section>';
      }).join('') +
      '<button type="button" class="btn" id="add-emp">' + C.icon('plus', 16, 2) + 'Agregar empleado</button>' +
      '<p class="notice">' + C.icon('info', 16) + 'Cada persona entra con su propio PIN. En esta versión de prueba los usuarios viven en este equipo; al conectar la nube se usarán los mismos correos.</p>';
  }

  function facturacion() {
    var bl = C.settings.billing;
    return '<form id="f-fact" class="card pad stack" novalidate><h2 class="h2">Numeración e impuestos</h2>' +
      '<table class="table"><thead><tr><th>Tipo</th><th>Prefijo</th><th>Próximo número</th><th>IVU %</th></tr></thead><tbody>' +
      C.TYPE_KEYS.map(function (k) {
        return '<tr><td>' + C.typeTag(k) + '</td><td><input class="input sm" name="pre-' + k + '" value="' + esc(bl.prefixes[k]) + '" maxlength="5" aria-label="Prefijo ' + C.TYPES[k].label + '"></td>' +
          '<td><input class="input sm" name="next-' + k + '" inputmode="numeric" value="' + ((C.counters[k] || 0) + 1) + '" aria-label="Próximo número ' + C.TYPES[k].label + '"></td>' +
          '<td><input class="input sm" name="tax-' + k + '" inputmode="decimal" value="' + esc(bl.tax[k]) + '" aria-label="IVU ' + C.TYPES[k].label + '"></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="small muted">El próximo número no puede ser menor que uno ya usado. El IVU en 0 no aparece en la factura.</p>' +
      '<div class="grid2"><label class="field">Garantía por defecto en reparaciones<select class="input" name="warranty">' +
      C.WARRANTIES.map(function (w) { return '<option value="' + w + '"' + (bl.warrantyDefault === w ? ' selected' : '') + '>' + (w ? w + ' días' : 'Sin garantía') + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Métodos de pago (uno por línea)<textarea class="input" name="methods" rows="4">' + esc(bl.methods.join('\n')) + '</textarea></label></div>' +
      '<div class="right-actions"><button class="btn primary" type="submit">Guardar</button></div></form>' + envio();
  }

  /* Cómo se envía la factura en este equipo (se guarda solo aquí, no en la nube). */
  function envio() {
    if (!C.isDesktop()) return '';
    var cur = '';
    try { cur = localStorage.getItem(C.isAndroid() ? 'cobro-wa-android' : 'cobro-wa-pc') || ''; } catch (e) { cur = ''; }
    var opts = C.isAndroid()
      ? [['auto', 'Automático (pregunta si hay dos)'], ['whatsapp', 'WhatsApp'], ['business', 'WhatsApp Business']]
      : [['web', 'Navegador: abre WhatsApp Web o el programa'], ['app', 'Programa de WhatsApp para Windows']];
    if (!cur) cur = opts[0][0];
    return '<section class="card pad stack"><h2 class="h2">Enviar facturas</h2>' +
      '<p class="small muted">' + (C.isAndroid()
        ? 'WhatsApp y Mensaje abren el chat del número de "Enviar a" con la imagen de la factura lista; solo tocas enviar.'
        : 'WhatsApp copia la imagen y abre el chat del número de "Enviar a"; la pegas con Ctrl+V. Mensaje abre Enlace Móvil (Phone Link) con el número; necesitas tu teléfono Android vinculado en Enlace Móvil.') + '</p>' +
      '<label class="field">' + (C.isAndroid() ? 'WhatsApp para enviar facturas' : 'Abrir WhatsApp con') + '<select class="input" id="wa-pref">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></section>';
  }

  function datos() {
    var batches = C.data.batches.slice().sort(function (a, b) { return b.at - a.at; });
    return '<section class="card pad stack"><div class="card-head flat"><h2 class="h2">Versión y actualizaciones</h2><span class="pill void">Versión ' + esc(C.VERSION) + '</span></div>' +
      '<p class="small muted">' + (C.isAndroid() ? 'Cuando hay una versión nueva, Cobro te avisa al entrar como administrador. Tocas Descargar, abres el archivo y tocas Instalar. Tus datos se quedan.' : C.isDesktop() ? 'Cuando hay una versión nueva, Cobro te avisa al entrar como administrador y se instala solo si la autorizas. Antes guarda un respaldo de tus datos.' : 'Las actualizaciones automáticas funcionan en el programa de Windows.') + '</p>' +
      (C.isDesktop() ? '<div class="actions-left"><button type="button" class="btn" id="check-upd">' + C.icon('refresh', 16) + 'Buscar actualizaciones</button></div>' : '') + '</section>' +
      '<section class="card pad stack"><h2 class="h2">Respaldo</h2>' +
      (C.isAndroid() ? '<p class="small muted">Todo está guardado en este teléfono. Con la nube conectada (Ajustes › Nube) tienes la copia de seguridad. También puedes guardar un respaldo y mandarlo a Drive.</p>' :
        '<p class="small muted">Todo está guardado en este equipo. ' + (C.isDesktop() ? 'El programa guarda un respaldo automático cada día en Documentos › Cobro › Respaldos. ' : '') + 'Copia los respaldos de vez en cuando a una memoria USB o a la nube.</p>') +
      '<div class="actions-left"><button type="button" class="btn primary" id="backup">' + C.icon('download', 16) + 'Descargar respaldo completo (.json)</button>' +
      '<label class="btn">' + C.icon('undo', 16) + 'Recuperar desde un respaldo<input type="file" accept=".json,application/json" id="restore" hidden></label></div>' +
      '<p class="small muted" id="storage-info"></p></section>' +
      '<section class="card pad stack"><div class="card-head flat"><h2 class="h2">Importaciones del historial</h2><a class="link" href="#/importar">Importar de Factura</a></div>' +
      (batches.length ? '<div class="rows">' + batches.map(function (b) {
        return '<div class="row"><span class="row-main"><span class="strong">' + esc(b.file) + '</span><span class="small muted">' + esc(C.stamp(b.at)) + ' · ' + b.counts.invoices + ' facturas, ' + b.counts.payments + ' pagos, ' + b.counts.customers + ' clientes nuevos</span></span>' +
          '<button type="button" class="btn sm danger-text" data-revert="' + esc(b.id) + '">Revertir lote</button></div>';
      }).join('') + '</div>' : '<p class="muted small">Todavía no has importado historial.</p>') + '</section>';
  }

  function fintrack() {
    var f = C.settings.fintrack || {};
    var on = C.fintrackConnected();
    var rows = C.data.outbox.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var count = function (s) { return rows.filter(function (o) { return o.status === s; }).length; };
    var problems = rows.filter(function (o) { return o.status === 'conflicto' || o.status === 'rechazado' || (o.status === 'pendiente' && o.lastError); }).length;
    var html = '<section class="card pad stack"><div class="card-head flat"><h2 class="h2">FinTrack</h2><span class="pill ' + (on ? 'ok' : 'void') + '">' + (on ? 'Conectado' : 'Sin conectar') + '</span></div>' +
      '<p class="small muted">Cada pago nuevo que registres en Cobro llega a FinTrack como ingreso, con su categoría: Ventas, Servicios o Reparaciones. Sin internet, los pagos esperan y se envían solos al volver la conexión. El historial importado de Factura no se envía.</p>';
    if (!C.isDesktop()) return html + '<p class="notice">' + C.icon('info', 16) + 'La conexión con FinTrack funciona en el programa de Windows.</p></section>';
    if (on) {
      html += '<div class="kpis"><div class="card kpi"><span class="muted">Enviados</span><span class="amount-md">' + count('enviado') + '</span></div>' +
        '<div class="card kpi"><span class="muted">Pendientes</span><span class="amount-md">' + count('pendiente') + '</span></div>' +
        '<div class="card kpi"><span class="muted">Con problema</span><span class="amount-md' + (problems ? ' pend-text' : '') + '">' + problems + '</span></div></div>' +
        '<p class="small muted">Conectado desde el ' + esc(C.fmtDate(f.since)) + ' · Moneda ' + esc(f.currency || 'USD') + '</p>' +
        '<div class="actions-left"><button type="button" class="btn" id="ft-sync">' + C.icon('refresh', 16) + 'Enviar pendientes ahora</button>' +
        '<button type="button" class="btn danger-text" id="ft-off">Desconectar</button></div></section>';
    } else {
      html += '<div class="ft-step"><span class="step-dot">1</span><div class="stack-sm"><span class="strong">Clave de conexión</span>' +
        '<span class="small muted">Es una clave privada solo para Cobro. Se guarda en este equipo y la pegas también en FinTrack (en Lovable) cuando te la pida como COBRO_PAYMENT_SHARED_SECRET.</span>' +
        '<span class="small" id="ft-key-state">Revisando…</span>' +
        '<div class="actions-left"><button type="button" class="btn sm" id="ft-new-key">Crear clave nueva</button><button type="button" class="btn sm" id="ft-paste-key">Ya tengo una clave</button></div></div></div>' +
        '<div class="ft-step"><span class="step-dot">2</span><div class="stack-sm"><span class="strong">Código de FinTrack</span>' +
        '<span class="small muted">En FinTrack: Negocio › Pagos de talleres conectados › Cobro › Generar código. Dura 10 minutos y sirve una sola vez.</span>' +
        '<div class="code-row"><input class="input" id="ft-code" placeholder="FT1.…" autocomplete="off" aria-label="Código de FinTrack"><button type="button" class="btn primary" id="ft-connect">Conectar</button></div></div></div></section>';
    }
    if (rows.length) {
      html += '<section class="card list-card"><div class="card-head"><h2 class="h2">Últimos pagos para FinTrack</h2></div><div class="rows">' +
        rows.slice(0, 15).map(function (o) {
          return '<a class="row" href="#/factura/' + esc(o.invoiceId) + '"><span class="row-main"><span class="strong">' + esc(o.number) + ' · ' + C.money(o.amount) + '</span>' +
            (o.lastError && o.status !== 'enviado' ? '<span class="small muted">' + esc(o.lastError) + '</span>' : '<span class="small muted">' + esc(C.stamp(o.sentAt || o.createdAt)) + '</span>') + '</span>' +
            '<span class="pill ' + (C.FT_CLASS[o.status] || 'void') + '">' + esc(C.FT_LABEL[o.status] || o.status) + '</span></a>';
        }).join('') + '</div></section>';
    }
    return html;
  }

  function gamefix() {
    var g = C.settings.gamefix || {};
    var acc = C.gamefixAccount ? C.gamefixAccount() : null;
    var on = !!(acc && !g.paused);
    var head = '<section class="card pad stack"><div class="card-head flat"><h2 class="h2">Clientes con Game Fix</h2>' +
      '<span class="pill ' + (on ? 'ok' : 'void') + '">' + (on ? 'Compartiendo' : g.paused && acc ? 'En pausa' : 'Sin conectar') + '</span></div>' +
      '<p class="small muted">Cobro y Game Fix están en la misma base de datos y usan tu misma cuenta de Game Fix: comparten la lista de clientes en los dos sentidos, sin códigos ni claves. ' +
      'Si dos clientes tienen el mismo teléfono quedan como uno solo; con el mismo nombre y teléfono distinto se quedan los dos. No se borra ni se pisa ningún dato: solo se llenan los vacíos. ' +
      'De Game Fix solo se lee nombre, teléfono y correo de las reparaciones; nunca se tocan reparaciones, pagos ni fotos.</p>';
    if (!C.isDesktop()) return head + '<p class="notice">' + C.icon('info', 16) + 'Compartir clientes con Game Fix funciona en el programa de Windows y en la app de Android.</p></section>';
    if (!acc) {
      return head + '<div class="notice">' + C.icon('info', 16) + '<div>Para compartir clientes, conecta primero la nube con tu cuenta de Game Fix en <a class="link" href="#/ajustes/nube">Ajustes › Nube</a>. Con eso queda conectado también con Game Fix.</div></div></section>';
    }
    var l = g.last || {};
    var tot = { brought: 0, linked: 0, inGf: 0 };
    C.data.customers.forEach(function (c) {
      if (!c.gf) return;
      if (c.gf.origin === 'clients' || c.gf.origin === 'repairs') tot.brought++;
      else if ((c.gf.srcs || []).length) tot.linked++;
      if (c.gf.origin !== 'repairs' && c.gf.id) tot.inGf++;
    });
    return head + '<div class="kpis"><div class="card kpi"><span class="muted">Cuenta</span><span class="strong wrap">' + esc(acc.email || '') + '</span>' +
      '<span class="small muted">' + (g.lastSync ? 'Última vez: ' + esc(C.stamp(g.lastSync)) : 'Todavía no se sincroniza') + '</span></div>' +
      '<div class="card kpi"><span class="muted">Clientes traídos de Game Fix</span><span class="amount-md">' + tot.brought + '</span><span class="small muted">' + tot.linked + ' de Cobro unidos con Game Fix</span></div>' +
      '<div class="card kpi"><span class="muted">Clientes de Cobro en Game Fix</span><span class="amount-md">' + tot.inGf + '</span>' +
      (g.lastSync ? '<span class="small muted">' + (l.added || 0) + ' nuevos · ' + (l.sent || 0) + ' guardados en Game Fix la última vez</span>' : '') + '</div></div>' +
      (C.gamefix && C.gamefix.error && C.gamefix.status === 'error' ? '<div class="notice danger">' + C.icon('info', 16) + '<div>' + esc(C.gamefix.error) + '</div></div>' : '') +
      '<div class="actions-left">' + (on ? '<button type="button" class="btn" id="gf-sync">' + C.icon('refresh', 16) + 'Sincronizar ahora</button>' +
        '<button type="button" class="btn" id="gf-pause">Pausar en este equipo</button>' :
        '<button type="button" class="btn primary" id="gf-resume">' + C.icon('refresh', 16) + 'Reanudar</button>') + '</div>' +
      '<p class="small muted">Se sincroniza sola al abrir Cobro y cada 30 minutos.</p></section>';
  }

  function nube() {
    var n = C.nube || {};
    var on = !!C.nubeOn;
    var expired = on && n.status === 'auth';
    var pend = C.nubePending ? C.nubePending() : 0;
    var label = !on ? 'Sin conectar' : expired ? 'Vuelve a conectar' : n.status === 'sync' ? 'Sincronizando' : pend ? 'Cambios por subir' : n.status === 'offline' ? 'Sin internet' : n.status === 'error' ? 'Con problema' : 'Al día';
    var cls = !on ? 'void' : (expired || n.status === 'error') ? 'void' : (pend || n.status === 'sync' || n.status === 'offline') ? 'pend' : 'ok';
    var html = '<section class="card pad stack"><div class="card-head flat"><h2 class="h2">Copia en la nube</h2><span class="pill ' + cls + '">' + label + '</span></div>' +
      '<p class="small muted">Cobro sigue guardando todo en esta computadora y funciona sin internet. Con la nube conectada, además sube una copia de clientes, facturas, pagos, catálogo, fotos y ajustes del negocio a la base de datos de Game Fix, con tu misma cuenta de Game Fix. Cobro y Game Fix quedan en la misma base. Así no pierdes nada si la computadora se daña y puedes usar Cobro en otra computadora con los mismos datos.</p>';
    if (!C.isDesktop()) return html + '<p class="notice">' + C.icon('info', 16) + 'La copia en la nube funciona en el programa de Windows.</p></section>';
    if (on && !expired) {
      html += '<div class="kpis"><div class="card kpi"><span class="muted">Cuenta</span><span class="strong wrap">' + esc(n.email || '') + '</span></div>' +
        '<div class="card kpi"><span class="muted">Por subir</span><span class="amount-md' + (pend ? ' pend-text' : '') + '">' + pend + '</span></div>' +
        '<div class="card kpi"><span class="muted">Última sincronización</span><span class="strong">' + (n.lastSync ? esc(C.stamp(n.lastSync)) : 'Todavía no') + '</span></div></div>' +
        (n.progress ? '<p class="small muted">Subiendo ' + n.progress.done + ' de ' + n.progress.total + '…</p>' : '') +
        (n.error && n.status !== 'sync' ? '<div class="notice danger">' + C.icon('info', 16) + '<div>' + esc(n.error) + '</div></div>' : '') +
        '<div class="actions-left"><button type="button" class="btn" id="nb-sync"' + (n.status === 'sync' ? ' disabled' : '') + '>' + C.icon('refresh', 16) + 'Sincronizar ahora</button>' +
        '<button type="button" class="btn danger-text" id="nb-off">Desconectar</button></div>' +
        '<p class="small muted">Se sincroniza sola cada 2 minutos, unos segundos después de cada cambio y al volver el internet.</p></section>';
    } else {
      html += (C.nubeMoved && C.nubeMoved() ? '<div class="notice danger">' + C.icon('info', 16) + '<div><strong>La nube de Cobro se mudó a la base de Game Fix.</strong> Entra aquí con tu cuenta de Game Fix (la misma con la que abres Game Fix). Cobro subirá solo todo lo que tiene en este equipo; no se pierde nada.</div></div>' : '') +
        (expired ? '<div class="notice danger">' + C.icon('info', 16) + '<div>La sesión venció. Los cambios siguen guardados aquí y se suben cuando vuelvas a conectar.</div></div>' : '') +
        '<form id="nb-form" class="stack" autocomplete="off">' +
        '<div class="grid2"><label class="field">Correo de Game Fix<input class="input" type="email" name="email" value="' + esc(n.email || 'supermobilepr@gmail.com') + '"></label>' +
        '<label class="field">Contraseña de Game Fix<input class="input" type="password" name="password" autocomplete="current-password"></label></div>' +
        '<p class="small muted">Usa la misma cuenta con la que entras a Game Fix. La contraseña no se guarda en Cobro; solo se usa para iniciar la sesión.</p>' +
        '<div class="actions-left"><button type="submit" class="btn primary" id="nb-connect">' + C.icon('cloud', 16) + 'Conectar</button></div></form>' +
        '<div class="notice">' + C.icon('info', 16) + '<div><strong>En otra computadora o teléfono:</strong> instala Cobro, crea el administrador y conecta aquí con la misma cuenta. Se bajan todos los datos. No vuelvas a importar el historial de Factura allí, porque saldría repetido.</div></div></section>';
    }
    return html;
  }

  function showKey(key) {
    return C.modal({
      title: 'Clave de conexión con FinTrack', okLabel: 'Ya la copié, guardar', cancelLabel: 'Cancelar',
      html: '<p class="muted">Cópiala ahora y pégala en FinTrack (en Lovable) cuando pida <strong>COBRO_PAYMENT_SHARED_SECRET</strong>. Aquí no se vuelve a mostrar. No la compartas por chat ni por mensaje.</p>' +
        '<p class="recovery-code key">' + esc(key) + '</p><button type="button" class="btn sm" id="copy-key">Copiar clave</button>',
      onMount: function (dlg) {
        dlg.querySelector('#copy-key').addEventListener('click', function () {
          try { navigator.clipboard.writeText(key); C.toast('Clave copiada.'); } catch (e) { C.toast('Cópiala a mano.', 'error'); }
        });
      },
      onOk: function () { return C.fintrackSaveKey(key).then(function () { C.toast('Clave guardada en este equipo.'); return true; }); }
    });
  }

  function editUser(u) {
    var isNew = !u;
    u = u || { role: 'empleado', email: 'supermobilepr+empleado@gmail.com', permissions: { crear: true, clientes: true, pagos: false }, status: 'activo' };
    return C.modal({
      title: isNew ? 'Agregar empleado' : (u.role === 'admin' ? 'Administrador' : 'Empleado'), okLabel: 'Guardar',
      html: '<label class="field">Correo<input class="input" type="email" name="email" value="' + esc(u.email) + '" autofocus></label>' +
        '<div class="grid2"><label class="field">' + (isNew ? 'PIN (4 a 6 números)' : 'PIN nuevo (déjalo vacío para no cambiarlo)') + '<input class="input" type="password" inputmode="numeric" maxlength="6" name="pin" autocomplete="new-password"></label>' +
        '<label class="field">Repite el PIN<input class="input" type="password" inputmode="numeric" maxlength="6" name="pin2" autocomplete="new-password"></label></div>' +
        (u.role === 'empleado' ? '<p class="small muted">El empleado entra con este PIN. No ve el balance, los reportes ni los ajustes.</p>' : ''),
      onOk: function (dlg) {
        var f = dlg.querySelector('form');
        var email = f.email.value.trim().toLowerCase();
        var pin = f.pin.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { C.toast('Escribe un correo válido.', 'error'); return false; }
        if (C.data.users.some(function (x) { return x.email === email && x.id !== u.id; })) { C.toast('Ya hay un usuario con ese correo.', 'error'); return false; }
        if ((isNew || pin) && !/^\d{4,6}$/.test(pin)) { C.toast('El PIN debe tener de 4 a 6 números.', 'error'); return false; }
        if (pin && pin !== f.pin2.value.trim()) { C.toast('Los dos PIN no coinciden.', 'error'); return false; }
        var row = Object.assign({ id: C.uid('usr'), createdAt: Date.now(), prefs: { theme: 'claro', hideAmounts: false } }, u, { email: email });
        return C.saveUser(row, pin || null).then(function () { C.toast('Usuario guardado.'); return true; });
      }
    });
  }

  C.views.ajustes = {
    title: 'Ajustes',
    allowed: function () { return C.isAdmin(); },
    render: function (tab) {
      tab = tab || 'negocio';
      var body = { negocio: negocio, apariencia: apariencia, usuarios: usuarios, facturacion: facturacion, fintrack: fintrack, gamefix: gamefix, nube: nube, datos: datos }[tab] || negocio;
      return '<header class="page-head"><div><h1>Ajustes</h1></div></header>' +
        '<nav class="tabs" aria-label="Secciones de ajustes">' + TABS.map(function (t) {
          return '<a href="#/ajustes/' + t[0] + '" class="tab' + (tab === t[0] ? ' on' : '') + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
        }).join('') + '</nav><div class="stack narrow">' + body() + '</div>';
    },
    mount: function (root, tab) {
      tab = tab || 'negocio';
      var fn = root.querySelector('#f-negocio');
      if (fn) {
        fn.addEventListener('submit', function (e) {
          e.preventDefault();
          var s = JSON.parse(JSON.stringify(C.settings));
          ['name', 'phone', 'address', 'instagram', 'email', 'thanks', 'terms'].forEach(function (k) { s.business[k] = fn[k].value.trim(); });
          if (!s.business.name) return C.toast('El nombre del negocio no puede quedar vacío.', 'error');
          C.saveSettings(s).then(function () { C.toast('Datos del negocio guardados.'); C.render(); }).catch(C.fail);
        });
        root.querySelector('#logo').addEventListener('change', function (e) {
          var file = e.target.files[0];
          if (!file) return;
          C.compressImage(file, 400, 0.92, 'image/png').then(function (src) {
            var s = JSON.parse(JSON.stringify(C.settings));
            s.business.logo = src;
            return C.saveSettings(s);
          }).then(function () { C.toast('Logo guardado.'); C.render(); }).catch(C.fail);
        });
        var lx = root.querySelector('#logo-x');
        if (lx) lx.addEventListener('click', function () {
          var s = JSON.parse(JSON.stringify(C.settings));
          s.business.logo = '';
          C.saveSettings(s).then(C.render).catch(C.fail);
        });
      }

      root.querySelectorAll('[data-edit-user]').forEach(function (b) {
        b.addEventListener('click', function () {
          var u = C.data.users.find(function (x) { return x.id === b.getAttribute('data-edit-user'); });
          editUser(u).then(function (ok) { if (ok) C.render(); });
        });
      });
      var ks = root.querySelector('#ft-key-state');
      if (ks) C.fintrackState().then(function (st) {
        ks.innerHTML = st.tiene_clave ? '<span class="ok-text">' + C.icon('check', 14, 2.5) + ' Clave guardada en este equipo</span>' : '<span class="pend-text">Falta crear la clave.</span>';
      }).catch(function () { ks.textContent = ''; });
      var nk = root.querySelector('#ft-new-key');
      if (nk) nk.addEventListener('click', function () {
        C.fintrackState().then(function (st) {
          return st.tiene_clave ? C.confirm('Crear clave nueva', 'Ya hay una clave guardada. Si creas otra, también tendrás que cambiarla en FinTrack.', 'Crear clave nueva', true) : true;
        }).then(function (ok) { if (ok) return showKey(C.fintrackNewKey()); }).then(function (done) { if (done) C.render(); }).catch(C.fail);
      });
      var pk = root.querySelector('#ft-paste-key');
      if (pk) pk.addEventListener('click', function () {
        C.modal({
          title: 'Pegar clave de conexión', okLabel: 'Guardar clave',
          html: '<label class="field">Clave (la misma que pusiste en FinTrack)<input class="input" type="password" name="key" autocomplete="off" autofocus></label>',
          onOk: function (dlg) { return C.fintrackSaveKey(dlg.querySelector('[name=key]').value).then(function () { C.toast('Clave guardada en este equipo.'); return true; }); }
        }).then(function (ok) { if (ok) C.render(); });
      });
      var fc = root.querySelector('#ft-connect');
      if (fc) fc.addEventListener('click', function () {
        fc.disabled = true;
        C.fintrackConnect(root.querySelector('#ft-code').value).then(function () { C.toast('Cobro quedó conectado con FinTrack.'); C.render(); })
          .catch(function (e) { fc.disabled = false; C.fail(e); });
      });
      var fs = root.querySelector('#ft-sync');
      if (fs) fs.addEventListener('click', function () { fs.disabled = true; C.fintrackRetry().then(function () { C.toast('Listo.'); C.render(); }).catch(C.fail); });
      var fo = root.querySelector('#ft-off');
      if (fo) fo.addEventListener('click', function () {
        C.confirm('Desconectar FinTrack', 'Los pagos nuevos dejarán de enviarse. Lo que ya está en FinTrack no se borra. Desconecta también a Cobro en FinTrack.', 'Desconectar', true).then(function (ok) {
          if (ok) C.fintrackDisconnect().then(function () { C.toast('FinTrack desconectado.'); C.render(); }).catch(C.fail);
        });
      });
      var wp = root.querySelector('#wa-pref');
      if (wp) wp.addEventListener('change', function () {
        try { localStorage.setItem(C.isAndroid() ? 'cobro-wa-android' : 'cobro-wa-pc', wp.value); } catch (e) { /* sin almacenamiento */ }
        C.toast('Guardado.');
      });
      var gs = root.querySelector('#gf-sync');
      if (gs) gs.addEventListener('click', function () {
        gs.disabled = true;
        C.gamefixSync(true).then(function (r) {
          if (r) C.toast('Listo: ' + r.added + ' nuevos de Game Fix, ' + r.linked + ' completados, ' + r.sent + ' guardados en Game Fix.');
          C.render();
        }).catch(function (err) { C.fail(err); C.render(); });
      });
      var gp = root.querySelector('#gf-pause');
      if (gp) gp.addEventListener('click', function () {
        C.gamefixPause(true).then(function () { C.toast('Pausado en este equipo.'); C.render(); }).catch(C.fail);
      });
      var gr = root.querySelector('#gf-resume');
      if (gr) gr.addEventListener('click', function () {
        gr.disabled = true;
        C.gamefixPause(false).then(function () { C.toast('Compartiendo clientes con Game Fix.'); C.render(); }).catch(function (err) { C.fail(err); C.render(); });
      });
      var nf = root.querySelector('#nb-form');
      if (nf) nf.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = root.querySelector('#nb-connect');
        var email = nf.email.value.trim().toLowerCase();
        var password = nf.password.value;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return C.toast('Escribe el correo con el que entras a Game Fix.', 'error');
        if (!password) return C.toast('Escribe la contraseña de Game Fix.', 'error');
        btn.disabled = true;
        btn.lastChild.textContent = 'Conectando…';
        C.nubeConnect(email, password).then(function () {
          nf.password.value = '';
          C.toast('Conectado. Subiendo tus datos a la nube…');
          C.render();
        }).catch(function (err) {
          btn.disabled = false;
          btn.lastChild.textContent = 'Conectar';
          C.fail(err);
        });
      });
      var nsy = root.querySelector('#nb-sync');
      if (nsy) nsy.addEventListener('click', function () {
        nsy.disabled = true;
        C.nubeSync(true).then(function () { C.toast('Nube al día.'); C.render(); }).catch(function (err) { C.fail(err); C.render(); });
      });
      var nof = root.querySelector('#nb-off');
      if (nof) nof.addEventListener('click', function () {
        C.confirm('Desconectar la nube', 'Cobro dejará de subir y bajar cambios en esta computadora. Los datos se quedan aquí y la copia en la nube no se borra.', 'Desconectar', true).then(function (ok) {
          if (ok) C.nubeDisconnect().then(function () { C.toast('Nube desconectada.'); C.render(); }).catch(C.fail);
        });
      });
      var nc = root.querySelector('#new-code');
      if (nc) nc.addEventListener('click', function () {
        C.confirm('Código de recuperación nuevo', 'El código anterior dejará de servir.', 'Crear código').then(function (ok) {
          if (!ok) return;
          C.resetRecoveryCode().then(C.showRecoveryCode).catch(C.fail);
        });
      });
      var add = root.querySelector('#add-emp');
      if (add) add.addEventListener('click', function () { editUser(null).then(function (ok) { if (ok) C.render(); }); });
      root.querySelectorAll('[data-revoke]').forEach(function (b) {
        b.addEventListener('click', function () {
          var u = C.data.users.find(function (x) { return x.id === b.getAttribute('data-revoke'); });
          var revoke = u.status !== 'revocado';
          (revoke ? C.confirm('Quitar acceso', 'Este usuario ya no podrá entrar a la app. Sus facturas se conservan.', 'Quitar acceso', true) : Promise.resolve(true)).then(function (ok) {
            if (!ok) return;
            C.saveUser(Object.assign({}, u, { status: revoke ? 'revocado' : 'activo' }), null).then(function () { C.toast(revoke ? 'Acceso quitado.' : 'Acceso devuelto.'); C.render(); }).catch(C.fail);
          });
        });
      });
      root.querySelectorAll('[data-perm]').forEach(function (b) {
        b.addEventListener('click', function () {
          var u = C.data.users.find(function (x) { return x.id === b.getAttribute('data-user'); });
          var key = b.getAttribute('data-perm');
          var p = Object.assign({ crear: true, clientes: true, pagos: false }, u.permissions || {});
          p[key] = !(key === 'pagos' ? !!p.pagos : p[key] !== false);
          C.saveUser(Object.assign({}, u, { permissions: p }), null).then(function () { C.toast('Permiso actualizado.'); C.render(); }).catch(C.fail);
        });
      });

      var ff = root.querySelector('#f-fact');
      if (ff) ff.addEventListener('submit', function (e) {
        e.preventDefault();
        var s = JSON.parse(JSON.stringify(C.settings));
        var counters = Object.assign({}, C.counters);
        for (var i = 0; i < C.TYPE_KEYS.length; i++) {
          var k = C.TYPE_KEYS[i];
          var pre = ff['pre-' + k].value.trim().toUpperCase();
          if (!/^[A-Z]{2,5}$/.test(pre)) return C.toast('El prefijo de ' + C.TYPES[k].label + ' debe tener de 2 a 5 letras.', 'error');
          var next = parseInt(ff['next-' + k].value, 10);
          var used = C.data.invoices.filter(function (inv) { return inv.type === k && inv.source !== 'historial' && inv.number.indexOf(pre + '-') === 0; })
            .reduce(function (m, inv) { return Math.max(m, parseInt(inv.number.split('-')[1], 10) || 0); }, 0);
          if (!(next >= 1) || next <= used) return C.toast('El próximo número de ' + C.TYPES[k].label + ' debe ser mayor que ' + used + '.', 'error');
          var tax = C.num(ff['tax-' + k].value);
          if (tax < 0 || tax > 30) return C.toast('Revisa el IVU de ' + C.TYPES[k].label + '.', 'error');
          s.billing.prefixes[k] = pre; s.billing.tax[k] = tax; counters[k] = next - 1;
        }
        s.billing.warrantyDefault = parseInt(ff.warranty.value, 10) || 0;
        var methods = ff.methods.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        if (!methods.length) return C.toast('Deja al menos un método de pago.', 'error');
        s.billing.methods = methods;
        C.commit({ put: { kv: [{ key: 'settings', value: s }, { key: 'counters', value: counters }], audit: [C.auditRow('Ajustes', 'Numeración, impuestos y métodos de pago actualizados')] } })
          .then(function () { C.toast('Facturación guardada.'); C.render(); }).catch(C.fail);
      });

      var cu = root.querySelector('#check-upd');
      if (cu) cu.addEventListener('click', function () { C.checkUpdates(true); });
      var bk = root.querySelector('#backup');
      if (bk) {
        bk.addEventListener('click', function () {
          var where = '';
          C.exportBackup().then(function (b) {
            return C.saveFile('Respaldos', 'cobro-respaldo-' + C.today() + '.json', JSON.stringify(b), 'application/json');
          }).then(function (path) {
            where = path;
            return C.commit({ put: { audit: [C.auditRow('Respaldo', 'Respaldo completo guardado')] } });
          }).then(function () { C.savedToast(where, 'Respaldo descargado.'); }).catch(C.fail);
        });
        root.querySelector('#restore').addEventListener('change', function (e) {
          var file = e.target.files[0];
          if (!file) return;
          C.confirm('Recuperar respaldo', 'Se reemplazarán TODOS los datos de este equipo por los del archivo ' + file.name + '. Descarga antes un respaldo de lo actual si lo necesitas.', 'Reemplazar datos', true).then(function (ok) {
            if (!ok) return;
            C.readFileText(file).then(function (t) { return C.restoreBackup(JSON.parse(t)); }).then(function () {
              C.lock(); C.toast('Respaldo recuperado. Entra de nuevo con tu PIN.'); C.render();
            }).catch(C.fail);
          });
        });
        if (navigator.storage && navigator.storage.estimate) {
          navigator.storage.estimate().then(function (est) {
            var mb = function (n) { return (n / 1048576).toFixed(1) + ' MB'; };
            var info = root.querySelector('#storage-info');
            if (info && est.usage != null) info.textContent = 'Espacio usado en este equipo: ' + mb(est.usage) + (est.quota ? ' de ' + mb(est.quota) + ' disponibles.' : '.');
          }).catch(function () {});
        }
      }
      root.querySelectorAll('[data-revert]').forEach(function (b) {
        b.addEventListener('click', function () {
          var batch = C.data.batches.find(function (x) { return x.id === b.getAttribute('data-revert'); });
          C.confirm('Revertir lote', 'Se quitarán las ' + batch.counts.invoices + ' facturas, sus pagos y los clientes nuevos de ' + batch.file + '.', 'Revertir', true).then(function (ok) {
            if (!ok) return;
            C.revertBatch(batch).then(function () { C.toast('Lote revertido.'); C.render(); }).catch(C.fail);
          });
        });
      });
    }
  };
})();
