/* Cobro · actualizaciones con autorización del administrador.
   Windows: se descarga e instala sola. Android: avisa y baja el APK nuevo para que lo instales. */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;
  var checkedThisSession = false;
  var postponed = '';
  var busy = false;

  function api() {
    var T = window.__TAURI__;
    return T && T.updater && T.updater.check ? T : null;
  }

  C.appVersion = function () {
    var T = window.__TAURI__;
    if (T && T.app && T.app.getVersion) return T.app.getVersion().catch(function () { return C.VERSION; });
    return Promise.resolve(C.VERSION);
  };

  function notesHtml(body) {
    var text = String(body || '').trim();
    if (!text) return '';
    return '<div class="update-notes">' + esc(text).replace(/\n/g, '<br>') + '</div>';
  }

  function install(update) {
    busy = true;
    var total = 0, got = 0;
    var dlg;
    var box = C.modal({
      title: 'Actualizando Cobro a ' + update.version, hideActions: true,
      html: '<p class="muted">Primero se guarda un respaldo de tus datos y luego se descarga la versión nueva. No cierres la app.</p>' +
        '<div class="bar big"><span id="upd-bar" class="t-venta" style="width:0%"></span></div><p class="small muted" id="upd-text">Guardando respaldo…</p>',
      onMount: function (d) { dlg = d; d.querySelector('[data-close]').hidden = true; }
    });
    function setText(t, pct) {
      if (!dlg) return;
      dlg.querySelector('#upd-text').textContent = t;
      if (pct != null) dlg.querySelector('#upd-bar').style.width = pct + '%';
    }
    C.exportBackup()
      .then(function (b) { return C.saveFile('Respaldos', 'cobro-antes-de-' + update.version + '-' + C.today() + '.json', JSON.stringify(b), 'application/json'); })
      .then(function () {
        setText('Descargando…', 2);
        return update.downloadAndInstall(function (ev) {
          if (ev.event === 'Started') total = (ev.data && ev.data.contentLength) || 0;
          if (ev.event === 'Progress') {
            got += (ev.data && ev.data.chunkLength) || 0;
            setText('Descargando… ' + (total ? Math.round(got / total * 100) + '%' : Math.round(got / 1024) + ' KB'), total ? Math.max(2, Math.round(got / total * 100)) : null);
          }
          if (ev.event === 'Finished') setText('Instalando. Cobro se cerrará unos segundos.', 100);
        });
      })
      .then(function () {
        var T = window.__TAURI__;
        if (T && T.process && T.process.relaunch) return T.process.relaunch();
      })
      .catch(function (err) {
        busy = false;
        if (dlg) { try { dlg.close(); } catch (e) { /* cerrada */ } dlg.remove(); }
        C.toast('No se pudo actualizar: ' + ((err && err.message) || err) + '. Tus datos están intactos; inténtalo más tarde.', 'error');
      });
    return box;
  }

  function newer(a, b) {
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  }

  /* Android: lee android.json del último release (versión, enlace al APK y novedades). */
  function checkAndroid(manual) {
    if (!C.isAdmin() || busy) return Promise.resolve();
    if (!navigator.onLine) { if (manual) C.toast('Sin internet. Cobro buscará actualizaciones cuando vuelva la conexión.', 'error'); return Promise.resolve(); }
    return window.__TAURI__.core.invoke('buscar_version_movil').then(function (txt) {
      var info = JSON.parse(txt || '{}');
      if (!info.version || !info.url || !newer(info.version, C.VERSION)) { if (manual) C.toast('Ya tienes la versión más reciente (' + C.VERSION + ').'); return; }
      if (!manual && postponed === info.version) return;
      return C.modal({
        title: 'Hay una versión nueva de Cobro',
        okLabel: 'Descargar', cancelLabel: 'Más tarde',
        html: '<p class="muted">Versión instalada: <strong>' + esc(C.VERSION) + '</strong> · Versión nueva: <strong>' + esc(info.version) + '</strong></p>' +
          notesHtml(info.notes) +
          '<p class="notice">' + C.icon('info', 16) + 'Se descarga el instalador nuevo. Cuando termine, ábrelo y toca Instalar. Tus facturas, clientes y ajustes se quedan en el teléfono (y en la nube si está conectada).</p>',
        onOk: function () { return true; }
      }).then(function (ok) {
        if (!ok) { postponed = info.version; return; }
        C.commit({ put: { audit: [C.auditRow('Actualización', 'Descarga de la versión ' + info.version + ' autorizada')] } });
        C.openExternal(info.url);
      });
    }).catch(function (err) {
      if (manual) C.toast('No se pudo buscar actualizaciones: ' + ((err && err.message) || err), 'error');
      else console.warn('Actualizaciones: ' + ((err && err.message) || err));
    });
  }

  /* manual = true cuando el administrador toca "Buscar actualizaciones". */
  C.checkUpdates = function (manual) {
    if (C.isAndroid()) return checkAndroid(manual);
    var T = api();
    if (!T) { if (manual) C.toast('Las actualizaciones automáticas funcionan en el programa de Windows.', 'error'); return Promise.resolve(); }
    if (!C.isAdmin() || busy) return Promise.resolve();
    if (!navigator.onLine) { if (manual) C.toast('Sin internet. Cobro buscará actualizaciones cuando vuelva la conexión.', 'error'); return Promise.resolve(); }
    return T.updater.check().then(function (update) {
      if (!update) { if (manual) C.toast('Ya tienes la versión más reciente (' + C.VERSION + ').'); return; }
      if (!manual && postponed === update.version) return;
      return C.modal({
        title: 'Hay una versión nueva de Cobro',
        okLabel: 'Actualizar ahora', cancelLabel: 'Más tarde',
        html: '<p class="muted">Versión instalada: <strong>' + esc(update.currentVersion || C.VERSION) + '</strong> · Versión nueva: <strong>' + esc(update.version) + '</strong></p>' +
          notesHtml(update.body) +
          '<p class="notice">' + C.icon('info', 16) + 'Tus facturas, clientes y ajustes no se borran. Antes de actualizar se guarda un respaldo en Documentos › Cobro › Respaldos. Cobro se cerrará unos segundos para instalarla; si no se abre sola, ábrela de nuevo.</p>',
        onOk: function () { return true; }
      }).then(function (ok) {
        if (ok) {
          C.commit({ put: { audit: [C.auditRow('Actualización', 'Actualización a ' + update.version + ' autorizada')] } });
          return install(update);
        }
        postponed = update.version;
      });
    }).catch(function (err) {
      if (manual) C.toast('No se pudo buscar actualizaciones: ' + ((err && err.message) || err), 'error');
      else console.warn('Actualizaciones: ' + ((err && err.message) || err));
    });
  };

  /* Revisa al entrar el administrador y luego cada 6 horas mientras la app está abierta. */
  C.afterRender = function () {
    if (checkedThisSession || !C.isAdmin() || !(api() || C.isAndroid())) return;
    checkedThisSession = true;
    setTimeout(function () { C.checkUpdates(false); }, 2500);
    setInterval(function () { if (!document.querySelector('dialog[open]')) C.checkUpdates(false); }, 6 * 3600 * 1000);
  };
  window.addEventListener('online', function () { if (C.isAdmin()) C.checkUpdates(false); });
})();
