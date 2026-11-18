/* Cobro · arranque */
(function () {
  'use strict';
  var C = window.Cobro;

  function fatal(err) {
    document.getElementById('app').innerHTML =
      '<div class="gate"><div class="gate-card"><h1>No se pudo abrir Cobro</h1><p class="muted">' + C.esc((err && err.message) || String(err)) +
      '</p><p class="small muted">Cierra la app y ábrela de nuevo. Si el problema sigue, recupera un respaldo en Ajustes › Datos y respaldo.</p></div></div>';
  }

  /* Bloqueo automático tras 30 minutos sin usar la app. */
  var idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (C.session.user && !document.querySelector('dialog[open]')) { C.lock(); C.render(); }
    }, 30 * 60 * 1000);
  }
  ['click', 'keydown', 'pointermove', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, resetIdle, { passive: true }); });

  /* Programa de Windows: respaldo automático diario en Documentos\Cobro\Respaldos. */
  function autoBackup() {
    if (!C.isDesktop() || C.isAndroid() || !C.data.invoices.length) return;
    var last = 0;
    try { last = parseInt(localStorage.getItem('cobro-auto-respaldo') || '0', 10); } catch (e) { last = 0; }
    if (Date.now() - last < 20 * 3600 * 1000) return;
    C.exportBackup().then(function (b) {
      return C.saveFile('Respaldos', 'cobro-auto-' + C.today() + '.json', JSON.stringify(b), 'application/json');
    }).then(function () {
      try { localStorage.setItem('cobro-auto-respaldo', String(Date.now())); } catch (e) { /* sin almacenamiento */ }
    }).catch(function (err) { console.warn('Respaldo automático: ' + (err && err.message || err)); });
  }

  C.openDb().then(C.load).then(function () {
    if (!location.hash) location.replace('#/inicio');
    C.render();
    resetIdle();
    autoBackup();
    setInterval(autoBackup, 6 * 3600 * 1000);
    setTimeout(function () { C.fintrackSync(); }, 4000);
    setTimeout(function () { C.nubeSync(); }, 6000);
  }).catch(fatal);
})();
