/** Vista para crear o editar un recuerdo (dibujo, carta, regalo, momento…). */

import { el, toast, confirmDialog, todayISO, isValidISODate } from '../util.js';
import {
  MEMORY_TYPES, allTags, getMemory, newMemoryDraft, saveMemory, deleteMemory,
} from '../store.js';
import { asyncImage, tagField } from '../ui.js';
import { captureAndScan, takePendingImages } from '../capture.js';
import { navigate, goBack } from '../router.js';

export async function render({ query = {}, segments = [] }) {
  const editingId = segments[1];
  const existing = editingId ? getMemory(editingId) : null;
  const draft = existing
    ? { ...existing, images: [...(existing.images || [])], tags: [...(existing.tags || [])] }
    : newMemoryDraft({
      type: query.type || 'dibujo',
      title: query.title || '',
      date: isValidISODate(query.date) ? query.date : todayISO(),
      place: query.place || '',
    });

  // Fotos que vienen de la pantalla de inicio (se tomaron antes de llegar aquí).
  const photos = [...draft.images, ...(existing ? [] : takePendingImages())];
  const strip = el('div', { class: 'photo-strip' });

  /* -------------------------------- fotos -------------------------------- */

  async function addPhotos({ fromCamera }) {
    const ids = await captureAndScan({ fromCamera });
    if (!ids.length) return;
    photos.push(...ids);
    renderStrip();
  }

  function renderStrip() {
    strip.innerHTML = '';
    photos.forEach((id, i) => {
      strip.append(el('div', { class: 'photo-thumb' }, [
        asyncImage(id, { alt: `Foto ${i + 1}` }),
        el('button', {
          class: 'x', type: 'button', 'aria-label': 'Quitar foto',
          text: '✕',
          onclick: () => { photos.splice(i, 1); renderStrip(); },
        }),
      ]));
    });
    strip.append(el('button', {
      class: 'photo-add', type: 'button', onclick: () => addPhotos({ fromCamera: true }),
    }, [el('b', { text: '📷', 'aria-hidden': 'true' }), 'Escanear']));
    strip.append(el('button', {
      class: 'photo-add', type: 'button', onclick: () => addPhotos({ fromCamera: false }),
    }, [el('b', { text: '🖼️', 'aria-hidden': 'true' }), 'Galería']));
  }
  renderStrip();

  /* -------------------------------- campos ------------------------------- */

  let type = draft.type;
  const typePicker = el('div', { class: 'type-picker' });
  function renderTypes() {
    typePicker.innerHTML = '';
    MEMORY_TYPES.forEach((t) => {
      typePicker.append(el('button', {
        class: 'type-opt', type: 'button', 'aria-pressed': String(t.id === type),
        onclick: () => { type = t.id; renderTypes(); },
      }, [el('span', { text: t.emoji, 'aria-hidden': 'true' }), t.label]));
    });
  }
  renderTypes();

  const titleInput = el('input', {
    class: 'input', type: 'text', value: draft.title,
    placeholder: 'Un título bonito (ej. «Dibujo del gatito»)', maxlength: '90',
  });
  const dateInput = el('input', {
    class: 'input', type: 'date', value: draft.date || todayISO(), max: '2999-12-31',
  });
  const noteInput = el('textarea', {
    class: 'textarea', placeholder: '¿Qué pasó ese día? ¿Por qué te lo dio?',
  });
  noteInput.value = draft.note || '';
  const placeInput = el('input', {
    class: 'input', type: 'text', value: draft.place || '', placeholder: 'Lugar (opcional)', maxlength: '80',
  });
  const favInput = el('input', { type: 'checkbox' });
  favInput.checked = !!draft.favorite;
  const tags = tagField(draft.tags, allTags());

  const form = el('form', { onsubmit: (ev) => { ev.preventDefault(); save(); } }, [
    el('div', { class: 'card' }, [
      el('div', { class: 'label', text: 'Fotos del recuerdo' }),
      strip,
      el('p', { class: 'small muted', style: 'margin:8px 0 0' },
        ['Con «Escanear» puedes recortar el papel y dejarlo como una hoja limpia.']),
    ]),
    el('div', { class: 'field' }, [el('label', { text: '¿Qué es?' }), typePicker]),
    el('div', { class: 'field' }, [el('label', { text: 'Título' }), titleInput]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Fecha en que te lo dio' }), dateInput,
    ]),
    el('div', { class: 'field' }, [el('label', { text: 'La historia detrás' }), noteInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Lugar' }), placeInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Etiquetas' }), tags.node]),
    el('div', { class: 'card' }, [
      el('label', { class: 'switch-row' }, [
        el('div', { class: 'sr-body' }, [
          el('b', { text: 'Marcar como favorito' }),
          el('span', { text: 'Aparecerá destacado en la portada' }),
        ]),
        el('span', { class: 'switch' }, [favInput, el('i')]),
      ]),
    ]),
    el('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'Guardar recuerdo' }),
    existing ? el('button', {
      class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:10px',
      text: 'Eliminar este recuerdo',
      onclick: async () => {
        const ok = await confirmDialog({
          title: '¿Eliminar el recuerdo?',
          message: 'Se borrarán también sus fotos. Esta acción no se puede deshacer.',
          confirmText: 'Eliminar', danger: true,
        });
        if (!ok) return;
        await deleteMemory(existing.id);
        toast('Recuerdo eliminado');
        navigate('/recuerdos', { replace: true });
      },
    }) : null,
  ]);

  async function save() {
    const date = dateInput.value || todayISO();
    if (!isValidISODate(date)) {
      toast('Revisa la fecha');
      return;
    }
    const title = titleInput.value.trim();
    if (!title && !photos.length && !noteInput.value.trim()) {
      toast('Añade al menos una foto, un título o una nota');
      return;
    }
    const record = {
      ...draft,
      type,
      title,
      date,
      note: noteInput.value.trim(),
      place: placeInput.value.trim(),
      favorite: favInput.checked,
      tags: tags.getTags(),
      images: photos,
    };
    await saveMemory(record);
    toast(existing ? 'Recuerdo actualizado' : '¡Recuerdo guardado!');
    navigate(`/recuerdo/${record.id}`, { replace: true });
  }

  // Atajo de la pantalla de inicio del móvil (#/nuevo?scan=1).
  if (query.scan === '1' && !existing && !photos.length) {
    setTimeout(() => addPhotos({ fromCamera: true }), 120);
  }

  return {
    title: existing ? 'Editar recuerdo' : 'Nuevo recuerdo',
    subtitle: existing ? '' : 'Guárdalo para siempre',
    back: () => goBack('/recuerdos'),
    content: form,
    tab: 'recuerdos',
  };
}
