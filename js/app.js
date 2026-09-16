/** Punto de entrada: arranque, enrutado, bloqueo y actualizaciones. */

import { el, toast } from './util.js';
import { init as initStore, state, subscribe } from './store.js';
import { requestPersistence } from './db.js';
import { startRouter, onRouteChange, navigate, parseHash } from './router.js';
import { applyTheme } from './theme.js';
import { isLocked, verifyPin } from './lock.js';

import * as home from './views/home.js';
import * as memories from './views/memories.js';
import * as memoryDetail from './views/memory-detail.js';
import * as memoryEditor from './views/memory-editor.js';
import * as dates from './views/dates.js';
import * as activities from './views/activities.js';
import * as settings from './views/settings.js';

window.APP_VERSION = '1.0.0';

const ROUTES = [
  { match: (p) => p === '/' || p === '/inicio', view: home },
  { match: (p) => p === '/recuerdos', view: memories },
  { match: (p) => p.startsWith('/recuerdo/'), view: memoryDetail },
  { match: (p) => p === '/nuevo', view: memoryEditor },
  { match: (p) => p.startsWith('/editar/'), view: memoryEditor },
  { match: (p) => p === '/fechas', view: dates },
  { match: (p) => p === '/planes', view: activities },
  { match: (p) => p === '/ajustes', view: settings },
];

const dom = {};
let currentTab = 'inicio';
let deferredInstall = null;

/* --------------------------------- pintado -------------------------------- */

async function renderRoute(route) {
  const entry = ROUTES.find((r) => r.match(route.path)) || ROUTES[0];
  let result;
  try {
    result = await entry.view.render(route);
  } catch (err) {
    console.error(err);
    result = {
      title: 'Vaya…',
      content: el('div', { class: 'empty' }, [
        el('div', { class: 'e-ico', text: '😵' }),
        el('h3', { text: 'Algo se ha torcido' }),
        el('p', { text: err.message || 'Prueba a volver a inicio.' }),
        el('button', { class: 'btn btn-primary', style: 'margin-top:12px', text: 'Ir a inicio', onclick: () => navigate('/inicio') }),
      ]),
      tab: 'inicio',
    };
  }

  dom.viewTitle.textContent = result.title || '';
  dom.viewSubtitle.textContent = result.subtitle || '';
  dom.viewSubtitle.hidden = !result.subtitle;

  dom.backBtn.hidden = !result.back;
  dom.backBtn.onclick = result.back || null;

  dom.actions.innerHTML = '';
  (result.actions || []).forEach((node) => dom.actions.append(node));
  if (deferredInstall && !result.back) dom.actions.append(installButton());
  if (result.tab !== '' && route.path !== '/ajustes') {
    dom.actions.append(el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Ajustes', text: '⚙️',
      onclick: () => navigate('/ajustes'),
    }));
  }

  dom.view.innerHTML = '';
  dom.view.append(result.content);
  dom.view.scrollTop = 0;
  window.scrollTo(0, 0);

  currentTab = result.tab ?? '';
  document.querySelectorAll('.tab[data-tab]').forEach((tab) => {
    if (tab.dataset.tab === currentTab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

function installButton() {
  return el('button', {
    class: 'icon-btn', type: 'button', 'aria-label': 'Instalar la app', text: '⬇️',
    onclick: async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      const choice = await deferredInstall.userChoice;
      if (choice.outcome === 'accepted') toast('¡Instalada! Ábrela desde tu pantalla de inicio');
      deferredInstall = null;
    },
  });
}

/* -------------------------------- bloqueo --------------------------------- */

function showLock() {
  return new Promise((resolve) => {
    const lock = document.getElementById('lock');
    const input = document.getElementById('lockInput');
    const error = document.getElementById('lockError');
    const btn = document.getElementById('lockBtn');
    lock.hidden = false;
    input.value = '';
    error.textContent = '';
    setTimeout(() => input.focus(), 120);

    const attempt = async () => {
      const ok = await verifyPin(input.value);
      if (ok) {
        lock.hidden = true;
        input.value = '';
        btn.removeEventListener('click', attempt);
        input.removeEventListener('keydown', onKey);
        resolve();
      } else {
        error.textContent = 'Código incorrecto';
        input.value = '';
        input.focus();
      }
    };
    const onKey = (ev) => { if (ev.key === 'Enter') attempt(); };
    btn.addEventListener('click', attempt);
    input.addEventListener('keydown', onKey);
  });
}

/** Vuelve a pedir el código si la app estuvo un rato en segundo plano. */
function watchBackground() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else if (isLocked() && hiddenAt && Date.now() - hiddenAt > 120000) {
      await showLock();
    }
  });
}

/* ------------------------------ service worker ---------------------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nueva versión lista: cierra y abre la app');
        }
      });
    });
  }).catch((err) => console.warn('SW no registrado', err));
}

/* --------------------------------- arranque -------------------------------- */

async function main() {
  dom.app = document.getElementById('app');
  dom.view = document.getElementById('view');
  dom.viewTitle = document.getElementById('viewTitle');
  dom.viewSubtitle = document.getElementById('viewSubtitle');
  dom.backBtn = document.getElementById('backBtn');
  dom.actions = document.getElementById('topbarActions');

  try {
    await initStore();
  } catch (err) {
    console.error(err);
    document.getElementById('splash').innerHTML =
      '<p style="padding:24px;text-align:center">No se ha podido abrir la base de datos.<br>'
      + 'Si estás en modo incógnito, prueba en una pestaña normal.</p>';
    return;
  }

  applyTheme(state.settings.theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((state.settings.theme || 'auto') === 'auto') applyTheme('auto');
  });

  document.getElementById('splash').remove();
  dom.app.hidden = false;

  if (isLocked()) await showLock();
  watchBackground();

  document.getElementById('fabAdd').addEventListener('click', () => navigate('/nuevo'));

  onRouteChange(renderRoute);
  startRouter();

  subscribe((what) => {
    if (what === 'settings') applyTheme(state.settings.theme);
    if (what === 'all') renderRoute(parseHash());
  });

  requestPersistence();
  registerServiceWorker();
}

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  deferredInstall = ev;
});

window.addEventListener('error', (ev) => console.error('Error no controlado:', ev.error || ev.message));
window.addEventListener('unhandledrejection', (ev) => console.error('Promesa rechazada:', ev.reason));

main();
