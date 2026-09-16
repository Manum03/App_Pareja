/** Utilidades generales: fechas en español, DOM, hojas modales y avisos. */

/* ------------------------------ ids y texto ------------------------------ */

export function uid(prefix = 'id') {
  const rnd = (crypto.getRandomValues(new Uint32Array(2)));
  return `${prefix}_${Date.now().toString(36)}${rnd[0].toString(36)}${rnd[1].toString(36)}`;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Plantilla que escapa las interpolaciones salvo las marcadas con raw(). */
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = values[i - 1];
    const str = (v && v.__raw) ? v.value : escapeHtml(Array.isArray(v) ? v.join('') : v);
    return out + str + s;
  }, '');
}
export const raw = (value) => ({ __raw: true, value: Array.isArray(value) ? value.join('') : (value ?? '') });

export function plural(n, singular, pluralForm) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/* --------------------------------- fechas -------------------------------- */

const ES = 'es-ES';

/** Fecha local (no UTC) en formato YYYY-MM-DD. */
export function toISODate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const todayISO = () => toISODate(new Date());

/** Convierte YYYY-MM-DD en un Date local al mediodía (evita saltos de zona horaria). */
export function fromISODate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isValidISODate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && !!fromISODate(iso);
}

const fmtLong = new Intl.DateTimeFormat(ES, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtMedium = new Intl.DateTimeFormat(ES, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDayMonth = new Intl.DateTimeFormat(ES, { day: 'numeric', month: 'long' });
const fmtWeekday = new Intl.DateTimeFormat(ES, { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonthYear = new Intl.DateTimeFormat(ES, { month: 'long', year: 'numeric' });

export function formatLong(iso) { const d = fromISODate(iso); return d ? fmtLong.format(d) : ''; }
export function formatMedium(iso) { const d = fromISODate(iso); return d ? fmtMedium.format(d).replace('.', '') : ''; }
export function formatDayMonth(iso) { const d = fromISODate(iso); return d ? fmtDayMonth.format(d) : ''; }
export function formatWeekday(iso) { const d = fromISODate(iso); return d ? fmtWeekday.format(d) : ''; }
export function formatMonthYear(iso) { const d = fromISODate(iso); return d ? fmtMonthYear.format(d) : ''; }

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Días completos entre dos fechas ISO (b - a). */
export function daysBetween(aISO, bISO) {
  const a = fromISODate(aISO);
  const b = fromISODate(bISO);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

/** Días que faltan hasta una fecha (negativo si ya pasó). */
export const daysUntil = (iso) => daysBetween(todayISO(), iso);

/** Próxima vez que se celebra una fecha anual (cumpleaños, aniversario…). */
export function nextAnniversary(iso, fromISO = todayISO()) {
  const base = fromISODate(iso);
  const from = fromISODate(fromISO);
  if (!base || !from) return null;
  const isLeapDay = base.getMonth() === 1 && base.getDate() === 29;
  for (let y = from.getFullYear(); y <= from.getFullYear() + 8; y += 1) {
    let candidate;
    if (isLeapDay && !isLeapYear(y)) candidate = new Date(y, 1, 28, 12);
    else candidate = new Date(y, base.getMonth(), base.getDate(), 12);
    if (candidate >= from) return toISODate(candidate);
  }
  return null;
}

export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Texto amable del tiempo que falta o que ha pasado. */
export function relativeDays(iso) {
  const diff = daysUntil(iso);
  if (diff === 0) return '¡Hoy!';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff > 0) {
    if (diff < 30) return `En ${plural(diff, 'día', 'días')}`;
    const months = Math.round(diff / 30.4);
    if (diff < 365) return `En ${plural(months, 'mes', 'meses')}`;
    return `En ${plural(Math.round(diff / 365), 'año', 'años')}`;
  }
  const past = -diff;
  if (past < 30) return `Hace ${plural(past, 'día', 'días')}`;
  if (past < 365) return `Hace ${plural(Math.round(past / 30.4), 'mes', 'meses')}`;
  return `Hace ${plural(Math.round(past / 365), 'año', 'años')}`;
}

/** "2 años y 3 meses" entre dos fechas. */
export function durationText(fromISO, toISOStr = todayISO()) {
  const a = fromISODate(fromISO);
  const b = fromISODate(toISOStr);
  if (!a || !b || b < a) return '';
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) { months -= 1; days += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (months < 0) { years -= 1; months += 12; }
  const parts = [];
  if (years) parts.push(plural(years, 'año', 'años'));
  if (months) parts.push(plural(months, 'mes', 'meses'));
  if (!years && days) parts.push(plural(days, 'día', 'días'));
  return parts.length ? parts.join(' y ') : 'hoy mismo';
}

/* ---------------------------------- DOM ---------------------------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return node;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* --------------------------- avisos y diálogos --------------------------- */

export function toast(message, ms = 2600) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const node = el('div', { class: 'toast', text: message });
  root.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 320);
  }, ms);
}

let sheetCloser = null;

/**
 * Abre una hoja inferior. `render(close)` devuelve el contenido.
 * Devuelve una promesa que se resuelve con el valor pasado a close().
 */
export function openSheet(render, { dismissible = true } = {}) {
  const root = document.getElementById('modalRoot');
  return new Promise((resolve) => {
    const close = (value) => {
      if (sheetCloser !== close) return;
      sheetCloser = null;
      root.hidden = true;
      root.innerHTML = '';
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      resolve(value);
    };
    sheetCloser = close;
    const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { class: 'sheet-grab' }),
    ]);
    const content = render(close);
    sheet.append(content instanceof Node ? content : el('div', { html: String(content) }));
    root.innerHTML = '';
    root.append(sheet);
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    root.onclick = (ev) => { if (ev.target === root && dismissible) close(undefined); };
    function onKey(ev) { if (ev.key === 'Escape' && dismissible) close(undefined); }
    window.addEventListener('keydown', onKey);
    const focusable = sheet.querySelector('input, textarea, button, select');
    if (focusable && !('ontouchstart' in window)) focusable.focus();
  });
}

export const closeSheet = (value) => { if (sheetCloser) sheetCloser(value); };

export function confirmDialog({ title, message, confirmText = 'Sí', cancelText = 'Cancelar', danger = false }) {
  return openSheet((close) => el('div', {}, [
    el('h3', { text: title }),
    message ? el('p', { class: 'muted', text: message }) : null,
    el('div', { class: 'sheet-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close(false), text: cancelText }),
      el('button', {
        class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button',
        onclick: () => close(true), text: confirmText,
      }),
    ]),
  ])).then((v) => v === true);
}

export function promptDialog({ title, message, value = '', placeholder = '', type = 'text', confirmText = 'Guardar' }) {
  return openSheet((close) => {
    const input = el('input', { class: 'input', type, value, placeholder });
    const form = el('form', {
      onsubmit: (ev) => { ev.preventDefault(); close(input.value.trim()); },
    }, [
      el('h3', { text: title }),
      message ? el('p', { class: 'muted small', text: message }) : null,
      input,
      el('div', { class: 'sheet-actions' }, [
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close(undefined), text: 'Cancelar' }),
        el('button', { class: 'btn btn-primary', type: 'submit', text: confirmText }),
      ]),
    ]);
    return form;
  });
}

/** Descarga un Blob con el nombre indicado. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
