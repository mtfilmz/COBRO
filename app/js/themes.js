/* Cobro · temas globales (Claro, Oscuro, Negro, Azul marino, Automático) */
(function () {
  'use strict';
  var C = (window.Cobro = window.Cobro || {});

  C.THEMES = {
    claro: {
      bg: '#F6F7F9', surface: '#FFFFFF', surface2: '#F9FAFB', border: '#E5E7EB', line: '#F0F1F3',
      text: '#111827', strong: '#0F172A', body: '#374151', muted: '#6B7280', faint: '#9CA3AF',
      primary: '#13284A', 'on-primary': '#FFFFFF', 'nav-bg': '#EDF1F8', 'nav-fg': '#13284A', accent: '#2459D6',
      'input-border': '#D1D5DB', track: '#ECEEF2', 'selected-bg': '#F7F9FC', ring: '#13284A',
      venta: '#2459D6', 'venta-bg': '#EEF3FD', servicio: '#0F766E', 'servicio-bg': '#E8F4F2',
      rep: '#C2410C', 'rep-bg': '#FCEFE8', 'rep-fg': '#9A3412',
      'ok-bg': '#EAF7EE', 'ok-fg': '#166534', 'pend-bg': '#FEF3E2', 'pend-fg': '#92400E',
      'par-bg': '#EEF3FF', 'par-fg': '#1E40AF', 'neutral-bg': '#F1F2F4', danger: '#B91C1C',
      'info-bg': '#F3F6FB', 'info-border': '#DCE4F2', 'info-fg': '#1F2A44'
    },
    oscuro: {
      bg: '#111418', surface: '#1A1E24', surface2: '#161A1F', border: '#2A3038', line: '#232830',
      text: '#E8EAED', strong: '#F3F4F6', body: '#C9CED6', muted: '#9AA3AE', faint: '#6B7480',
      primary: '#8AB0FF', 'on-primary': '#0B1830', 'nav-bg': '#232A35', 'nav-fg': '#F3F4F6', accent: '#8AB0FF',
      'input-border': '#3A414C', track: '#232830', 'selected-bg': '#1F2633', ring: '#8AB0FF',
      venta: '#8AB0FF', 'venta-bg': '#1D2A44', servicio: '#4FD1C5', 'servicio-bg': '#12302D',
      rep: '#FB923C', 'rep-bg': '#3A2213', 'rep-fg': '#FDBA74',
      'ok-bg': '#16301F', 'ok-fg': '#86EFAC', 'pend-bg': '#33260F', 'pend-fg': '#FCD34D',
      'par-bg': '#1D2540', 'par-fg': '#A5B4FC', 'neutral-bg': '#262B33', danger: '#F87171',
      'info-bg': '#18202E', 'info-border': '#2A3A55', 'info-fg': '#D6E2F5'
    },
    negro: {
      bg: '#000000', surface: '#0B0B0C', surface2: '#111113', border: '#1F1F22', line: '#18181B',
      text: '#F2F2F2', strong: '#FFFFFF', body: '#D4D4D8', muted: '#9A9AA0', faint: '#6B6B72',
      primary: '#FFFFFF', 'on-primary': '#000000', 'nav-bg': '#18181B', 'nav-fg': '#FFFFFF', accent: '#8AB0FF',
      'input-border': '#33333A', track: '#151517', 'selected-bg': '#141418', ring: '#FFFFFF',
      venta: '#8AB0FF', 'venta-bg': '#121A2E', servicio: '#4FD1C5', 'servicio-bg': '#0B2220',
      rep: '#FB923C', 'rep-bg': '#2A170B', 'rep-fg': '#FDBA74',
      'ok-bg': '#0F2416', 'ok-fg': '#86EFAC', 'pend-bg': '#2A1F08', 'pend-fg': '#FCD34D',
      'par-bg': '#161B33', 'par-fg': '#A5B4FC', 'neutral-bg': '#18181B', danger: '#F87171',
      'info-bg': '#0D1320', 'info-border': '#1F2A44', 'info-fg': '#D6E2F5'
    },
    marino: {
      bg: '#0B1A33', surface: '#11244A', surface2: '#0E1F40', border: '#1F3963', line: '#1A3058',
      text: '#EEF2F8', strong: '#FFFFFF', body: '#D3DCEA', muted: '#A9B8D0', faint: '#7D8DA8',
      primary: '#F29A2E', 'on-primary': '#1A1206', 'nav-bg': '#1A3260', 'nav-fg': '#FFFFFF', accent: '#FFB869',
      'input-border': '#2A4677', track: '#0E1F40', 'selected-bg': '#183058', ring: '#F29A2E',
      venta: '#8AB0FF', 'venta-bg': '#1A2F5A', servicio: '#5EEAD4', 'servicio-bg': '#12363F',
      rep: '#FDBA74', 'rep-bg': '#3A2A1A', 'rep-fg': '#FDBA74',
      'ok-bg': '#123A2A', 'ok-fg': '#86EFAC', 'pend-bg': '#3A2A10', 'pend-fg': '#FCD34D',
      'par-bg': '#1E2E5C', 'par-fg': '#C7D2FE', 'neutral-bg': '#1A3058', danger: '#FCA5A5',
      'info-bg': '#13284F', 'info-border': '#2A4677', 'info-fg': '#EEF2F8'
    }
  };

  C.THEME_LIST = [
    { key: 'claro', name: 'Claro', desc: 'Predeterminado, ideal de día', swatch: '#FFFFFF', edge: '#C7CCD4' },
    { key: 'oscuro', name: 'Oscuro', desc: 'Gris oscuro, descansa la vista', swatch: '#2A3038', edge: '#4A525E' },
    { key: 'negro', name: 'Negro', desc: 'Negro puro; en pantallas OLED gasta menos batería', swatch: '#000000', edge: '#4A4A50' },
    { key: 'marino', name: 'Azul marino', desc: 'Colores de la marca Super Mobile', swatch: 'linear-gradient(135deg, #11244A 55%, #F29A2E 55%)', edge: '#1F3963' },
    { key: 'auto', name: 'Automático', desc: 'Claro u oscuro según tu computadora', swatch: 'linear-gradient(90deg, #FFFFFF 50%, #1A1E24 50%)', edge: '#9CA3AF' }
  ];

  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  C.themeKey = 'claro';

  C.resolveTheme = function (key) {
    if (key === 'auto') return media && media.matches ? 'oscuro' : 'claro';
    return C.THEMES[key] ? key : 'claro';
  };

  /* Aplica el tema a TODA la app: las variables van en <html>. */
  C.applyTheme = function (key) {
    C.themeKey = C.THEME_LIST.some(function (t) { return t.key === key; }) ? key : 'claro';
    var active = C.resolveTheme(C.themeKey);
    var tokens = C.THEMES[active];
    var root = document.documentElement;
    Object.keys(tokens).forEach(function (k) { root.style.setProperty('--' + k, tokens[k]); });
    root.style.colorScheme = active === 'claro' ? 'light' : 'dark';
    root.setAttribute('data-theme', active);
    try { localStorage.setItem('cobro-tema', C.themeKey); } catch (e) { /* sin almacenamiento */ }
  };

  if (media && media.addEventListener) {
    media.addEventListener('change', function () { if (C.themeKey === 'auto') C.applyTheme('auto'); });
  }

  /* Antes de iniciar sesión se usa el último tema elegido en este equipo, para que no parpadee. */
  try { C.applyTheme(localStorage.getItem('cobro-tema') || 'claro'); } catch (e) { C.applyTheme('claro'); }
})();
