/* Cobro · primera configuración y entrada con PIN */
(function () {
  'use strict';
  var C = window.Cobro;
  var esc = C.esc;

  C.views.configurar = {
    render: function () {
      return '<div class="gate"><form class="gate-card" id="setup" novalidate>' +
        '<div class="gate-brand">' + C.logoBlock(48) + '<div><h1>Bienvenido a Cobro</h1><p class="muted">' + esc(C.settings.business.name) + '</p></div></div>' +
        '<p class="muted">Configura la cuenta del administrador. Todo se guarda en este equipo y la app funciona sin internet.</p>' +
        '<label class="field">Correo del administrador<input class="input" name="email" type="email" value="supermobilepr@gmail.com" autocomplete="username" required></label>' +
        '<div class="row2">' +
        '<label class="field">PIN (4 a 6 números)<input class="input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></label>' +
        '<label class="field">Repite el PIN<input class="input" name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></label>' +
        '</div>' +
        '<p class="small muted">Con este PIN entras a la app. El administrador ve el balance, los reportes y los ajustes.</p>' +
        '<button class="btn primary block" type="submit">Empezar</button>' +
        '</form></div>';
    },
    mount: function (root) {
      var f = root.querySelector('#setup');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = f.email.value.trim();
        var pin = f.pin.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return C.toast('Escribe un correo válido.', 'error');
        if (!/^\d{4,6}$/.test(pin)) return C.toast('El PIN debe tener de 4 a 6 números.', 'error');
        if (pin !== f.pin2.value.trim()) return C.toast('Los dos PIN no coinciden.', 'error');
        f.querySelector('button[type=submit]').disabled = true;
        C.createAdmin(email, pin).then(function (res) {
          location.hash = '#/inicio';
          C.render();
          return C.showRecoveryCode(res.code);
        }).then(function () { C.toast('Listo. Ya puedes facturar.'); }).catch(function (err) { f.querySelector('button[type=submit]').disabled = false; C.fail(err); });
      });
    }
  };

  C.showRecoveryCode = function (code) {
    return C.modal({
      title: 'Guarda tu código de recuperación', okLabel: 'Ya lo guardé', cancelLabel: 'Cerrar',
      html: '<p class="muted">Si olvidas el PIN del administrador, con este código puedes crear uno nuevo. Anótalo y guárdalo fuera de la computadora. No se vuelve a mostrar.</p>' +
        '<p class="recovery-code">' + C.esc(code) + '</p>' +
        '<button type="button" class="btn sm" id="copy-code">Copiar código</button>',
      onMount: function (dlg) {
        dlg.querySelector('#copy-code').addEventListener('click', function () {
          try { navigator.clipboard.writeText(code); C.toast('Código copiado.'); } catch (e) { C.toast('Cópialo a mano.', 'error'); }
        });
      },
      onOk: function () { return true; }
    });
  };

  C.views.acceso = {
    render: function () {
      var users = C.data.users.filter(function (u) { return u.status !== 'revocado'; })
        .sort(function (a, b) { return a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : 0; });
      return '<div class="gate"><form class="gate-card" id="login" novalidate>' +
        '<div class="gate-brand">' + C.logoBlock(48) + '<div><h1>Cobro</h1><p class="muted">' + esc(C.settings.business.name) + '</p></div></div>' +
        '<fieldset class="who"><legend class="field-label">¿Quién entra?</legend>' +
        users.map(function (u, i) {
          return '<label class="who-item"><input type="radio" name="user" value="' + esc(u.id) + '"' + (i === 0 ? ' checked' : '') + (u.pinHash ? '' : ' disabled') + '>' +
            '<span class="avatar ' + (u.role === 'admin' ? 'admin' : '') + '" aria-hidden="true">' + esc(C.initials(u.email)) + '</span>' +
            '<span class="who-text"><span class="strong">' + (u.role === 'admin' ? 'Administrador' : 'Empleado') + '</span><span class="small muted wrap">' + esc(u.email) +
            (u.pinHash ? '' : ' · sin PIN todavía') + '</span></span></label>';
        }).join('') + '</fieldset>' +
        '<label class="field">PIN<input class="input pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" autofocus required></label>' +
        '<button class="btn primary block" type="submit">Entrar</button>' +
        '<button type="button" class="btn sm" id="forgot">¿Olvidaste el PIN del administrador?</button>' +
        '<p class="small muted center">' + C.icon('drive', 14) + ' Funciona sin internet. Los datos están guardados en este equipo.</p>' +
        '</form></div>';
    },
    mount: function (root) {
      var f = root.querySelector('#login');
      f.pin.focus();
      root.querySelector('#forgot').addEventListener('click', function () {
        C.modal({
          title: 'Recuperar el PIN del administrador', okLabel: 'Cambiar PIN',
          html: '<p class="muted">Escribe el código de recuperación que se mostró al configurar Cobro (o el último que creaste en Ajustes › Usuarios).</p>' +
            '<label class="field">Código de recuperación<input class="input" name="code" placeholder="XXXX-XXXX" autocomplete="off" autofocus></label>' +
            '<div class="grid2"><label class="field">PIN nuevo<input class="input" type="password" inputmode="numeric" maxlength="6" name="pin" autocomplete="new-password"></label>' +
            '<label class="field">Repite el PIN<input class="input" type="password" inputmode="numeric" maxlength="6" name="pin2" autocomplete="new-password"></label></div>',
          onOk: function (dlg) {
            var g = dlg.querySelector('form');
            if (!/^\d{4,6}$/.test(g.pin.value.trim())) { C.toast('El PIN debe tener de 4 a 6 números.', 'error'); return false; }
            if (g.pin.value.trim() !== g.pin2.value.trim()) { C.toast('Los dos PIN no coinciden.', 'error'); return false; }
            return C.recoverAdmin(g.code.value, g.pin.value.trim()).then(function () { C.toast('PIN cambiado. Ya puedes entrar.'); return true; });
          }
        });
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var sel = f.querySelector('input[name=user]:checked');
        if (!sel) return C.toast('Elige quién entra.', 'error');
        C.login(sel.value, f.pin.value.trim()).then(function () {
          if (!location.hash || location.hash === '#/') location.hash = '#/inicio';
          C.render();
        }).catch(function (err) { f.pin.value = ''; f.pin.focus(); C.fail(err); });
      });
    }
  };
})();
