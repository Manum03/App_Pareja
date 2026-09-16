/** Componentes de interfaz reutilizables por las distintas vistas. */

import { el, formatMedium, downloadBlob, toast } from './util.js';
import { imageURL, getImage, typeInfo } from './store.js';

/** Imagen que carga su miniatura de IndexedDB en cuanto se crea. */
export function asyncImage(imageId, { thumb = true, alt = '' } = {}) {
  const img = el('img', { alt, loading: 'lazy', decoding: 'async' });
  imageURL(imageId, { thumb }).then((url) => { if (url) img.src = url; });
  return img;
}

export function emptyState({ icon = '💭', title, text, actionLabel, onAction }) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'e-ico', text: icon, 'aria-hidden': 'true' }),
    el('h3', { text: title }),
    text ? el('p', { text }) : null,
    actionLabel ? el('button', {
      class: 'btn btn-primary', type: 'button', style: 'margin-top:14px',
      text: actionLabel, onclick: onAction,
    }) : null,
  ]);
}

/** Tarjeta cuadrada de un recuerdo para la galería. */
export function memoryTile(memory, onOpen) {
  const info = typeInfo(memory.type);
  const tile = el('button', { class: 'tile', type: 'button', onclick: () => onOpen(memory) }, [
    memory.images?.length
      ? asyncImage(memory.images[0], { alt: memory.title || info.label })
      : el('div', { class: 'tile-empty', text: info.emoji }),
    el('div', { class: 'tile-type', text: info.emoji, 'aria-hidden': 'true' }),
    memory.favorite ? el('div', { class: 'tile-fav', text: '❤️', 'aria-hidden': 'true' }) : null,
    el('div', { class: 'tile-info' }, [
      el('div', { class: 't', text: memory.title || info.label }),
      el('div', { class: 'd', text: formatMedium(memory.date) }),
    ]),
  ]);
  return tile;
}

/** Fila de lista genérica. */
export function listItem({ emoji, title, subtitle, right, badge, badgeClass = '', onClick }) {
  return el('button', { class: 'list-item', type: 'button', onclick: onClick }, [
    emoji ? el('div', { class: 'li-emoji', text: emoji, 'aria-hidden': 'true' }) : null,
    el('div', { class: 'li-body' }, [
      el('div', { class: 'li-title', text: title }),
      subtitle ? el('div', { class: 'li-sub', text: subtitle }) : null,
    ]),
    badge ? el('span', { class: `li-badge ${badgeClass}`, text: badge })
      : (right ? el('div', { class: 'li-right', text: right }) : null),
  ]);
}

/** Visor de fotos a pantalla completa con descarga. */
export function openPhotoViewer(imageIds, startIndex = 0) {
  let index = startIndex;
  const img = el('img', { alt: 'Foto del recuerdo' });
  const counter = el('div', {
    style: 'position:absolute;top:calc(var(--safe-top) + 22px);left:16px;color:#fff;font-size:.85rem;opacity:.8',
  });
  const root = el('div', { class: 'viewer' }, [
    img, counter,
    el('button', { class: 'close', type: 'button', text: '✕', 'aria-label': 'Cerrar', onclick: () => close() }),
    el('button', { class: 'dl', type: 'button', text: '⬇ Guardar en el teléfono', onclick: () => download() }),
  ]);

  async function show() {
    const url = await imageURL(imageIds[index], { thumb: false });
    img.src = url;
    counter.textContent = imageIds.length > 1 ? `${index + 1} / ${imageIds.length}` : '';
  }

  async function download() {
    const record = await getImage(imageIds[index]);
    if (!record) return;
    downloadBlob(record.blob, `recuerdo-${imageIds[index]}.jpg`);
    toast('Foto guardada en tus descargas');
  }

  function close() {
    root.remove();
    document.body.style.overflow = '';
    window.removeEventListener('keydown', onKey);
  }

  function onKey(ev) {
    if (ev.key === 'Escape') close();
    if (ev.key === 'ArrowRight') step(1);
    if (ev.key === 'ArrowLeft') step(-1);
  }

  function step(delta) {
    if (imageIds.length < 2) return;
    index = (index + delta + imageIds.length) % imageIds.length;
    show();
  }

  let startX = 0;
  root.addEventListener('pointerdown', (ev) => { startX = ev.clientX; });
  root.addEventListener('pointerup', (ev) => {
    const dx = ev.clientX - startX;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
    else if (ev.target === root || ev.target === img) { /* toque simple: no cerramos */ }
  });

  document.body.append(root);
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKey);
  show();
  return close;
}

/** Campo de etiquetas con sugerencias. */
export function tagField(initial = [], suggestions = []) {
  let tags = [...initial];
  const list = el('div', { class: 'chips', style: 'padding-bottom:4px' });
  const input = el('input', {
    class: 'input', type: 'text', placeholder: 'Añade una etiqueta y pulsa Intro',
    onkeydown: (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        add(input.value);
        input.value = '';
      }
    },
  });

  function add(value) {
    const t = value.trim().replace(/^#/, '').toLowerCase();
    if (!t || tags.includes(t)) return;
    tags.push(t);
    render();
  }

  function render() {
    list.innerHTML = '';
    tags.forEach((t) => {
      list.append(el('button', {
        class: 'chip active', type: 'button', text: `#${t} ✕`,
        onclick: () => { tags = tags.filter((x) => x !== t); render(); },
      }));
    });
    suggestions.filter((s) => !tags.includes(s)).slice(0, 6).forEach((s) => {
      list.append(el('button', { class: 'chip', type: 'button', text: `#${s}`, onclick: () => add(s) }));
    });
  }

  render();
  return { node: el('div', {}, [list, input]), getTags: () => [...tags] };
}

/** Selector de estrellas (0-5). */
export function ratingField(initial = 0, onChange = () => {}) {
  let value = initial;
  const node = el('div', { class: 'row', style: 'gap:4px' });
  function render() {
    node.innerHTML = '';
    for (let i = 1; i <= 5; i += 1) {
      node.append(el('button', {
        type: 'button', class: 'icon-btn', style: 'border:0;background:none;font-size:1.4rem;width:34px',
        'aria-label': `${i} de 5`,
        text: i <= value ? '★' : '☆',
        onclick: () => { value = value === i ? 0 : i; onChange(value); render(); },
      }));
    }
  }
  render();
  return { node, getValue: () => value };
}
