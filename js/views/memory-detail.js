/** Ficha completa de un recuerdo. */

import {
  el, formatLong, relativeDays, capitalize, toast, confirmDialog, openSheet,
} from '../util.js';
import { getMemory, deleteMemory, toggleFavorite, typeInfo, getImage } from '../store.js';
import { asyncImage, openPhotoViewer, emptyState } from '../ui.js';
import { navigate, goBack } from '../router.js';

export async function render({ segments }) {
  const id = segments[1];
  const memory = getMemory(id);

  if (!memory) {
    return {
      title: 'Recuerdo',
      back: () => goBack('/recuerdos'),
      content: emptyState({
        icon: '🫥', title: 'Este recuerdo ya no existe',
        actionLabel: 'Volver a la galería', onAction: () => navigate('/recuerdos', { replace: true }),
      }),
      tab: 'recuerdos',
    };
  }

  const info = typeInfo(memory.type);
  const photos = el('div');
  (memory.images || []).forEach((imgId, i) => {
    const img = asyncImage(imgId, { thumb: false, alt: memory.title || info.label });
    img.className = 'detail-photo';
    img.onclick = () => openPhotoViewer(memory.images, i);
    photos.append(img);
  });

  const meta = el('div', { class: 'meta-row' }, [
    el('span', { class: 'meta-pill', text: `${info.emoji} ${info.label}` }),
    el('span', { class: 'meta-pill', text: `📅 ${capitalize(formatLong(memory.date))}` }),
    el('span', { class: 'meta-pill', text: relativeDays(memory.date) }),
    memory.place ? el('span', { class: 'meta-pill', text: `📍 ${memory.place}` }) : null,
  ]);

  const tags = (memory.tags || []).length
    ? el('div', { class: 'meta-row' }, memory.tags.map((t) => el('span', { class: 'meta-pill', text: `#${t}` })))
    : null;

  const content = el('div', {}, [
    photos,
    el('h2', { class: 'serif', style: 'font-size:1.4rem;margin:12px 2px 2px', text: memory.title || info.label }),
    meta,
    memory.note ? el('div', { class: 'card' }, [el('p', { class: 'note-body', text: memory.note })]) : null,
    tags,
    el('div', { class: 'row', style: 'margin-top:16px;gap:10px' }, [
      el('button', {
        class: 'btn btn-ghost', type: 'button', style: 'flex:1',
        text: memory.favorite ? '❤️ Favorito' : '🤍 Marcar favorito',
        onclick: async (ev) => {
          await toggleFavorite(memory.id);
          const updated = getMemory(memory.id);
          ev.currentTarget.textContent = updated.favorite ? '❤️ Favorito' : '🤍 Marcar favorito';
          toast(updated.favorite ? 'Añadido a favoritos' : 'Quitado de favoritos');
        },
      }),
      el('button', {
        class: 'btn btn-primary', type: 'button', style: 'flex:1',
        text: '✏️ Editar', onclick: () => navigate(`/editar/${memory.id}`),
      }),
    ]),
  ]);

  async function shareMemory() {
    const text = [memory.title, memory.note].filter(Boolean).join('\n');
    try {
      const files = [];
      if (navigator.canShare && memory.images?.length) {
        for (const imgId of memory.images.slice(0, 4)) {
          const record = await getImage(imgId);
          if (record) files.push(new File([record.blob], `recuerdo-${imgId}.jpg`, { type: record.blob.type || 'image/jpeg' }));
        }
      }
      if (files.length && navigator.canShare({ files })) {
        await navigator.share({ files, text: text || undefined });
      } else if (navigator.share) {
        await navigator.share({ title: memory.title || 'Nuestro recuerdo', text });
      } else {
        toast('Tu navegador no permite compartir directamente');
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') toast('No se pudo compartir');
    }
  }

  const menuBtn = el('button', {
    class: 'icon-btn', type: 'button', 'aria-label': 'Más opciones', text: '⋯',
    onclick: () => openSheet((close) => el('div', { class: 'sheet-menu' }, [
      el('h3', { text: memory.title || info.label }),
      el('button', { type: 'button', onclick: () => { close(); navigate(`/editar/${memory.id}`); } },
        ['✏️  Editar']),
      el('button', { type: 'button', onclick: () => { close(); shareMemory(); } }, ['📤  Compartir']),
      el('button', {
        type: 'button', class: 'danger',
        onclick: async () => {
          close();
          const ok = await confirmDialog({
            title: '¿Eliminar el recuerdo?',
            message: 'Se borrarán también sus fotos.',
            confirmText: 'Eliminar', danger: true,
          });
          if (!ok) return;
          await deleteMemory(memory.id);
          toast('Recuerdo eliminado');
          navigate('/recuerdos', { replace: true });
        },
      }, ['🗑️  Eliminar']),
    ])),
  });

  return {
    title: memory.title || info.label,
    subtitle: capitalize(formatLong(memory.date)),
    back: () => goBack('/recuerdos'),
    content,
    actions: [menuBtn],
    tab: 'recuerdos',
  };
}
