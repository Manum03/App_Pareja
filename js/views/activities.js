/** Planes por hacer y actividades ya vividas juntos. */

import {
  el, openSheet, confirmDialog, toast, todayISO, formatLong, capitalize, relativeDays, isValidISODate,
} from '../util.js';
import {
  deleteActivity, newActivityDraft, saveActivity, state,
} from '../store.js';
import { listItem, emptyState, ratingField } from '../ui.js';
import { navigate } from '../router.js';

const view = { filter: 'todo' };

const IDEAS = [
  'Cena a la luz de las velas en casa', 'Ver el amanecer juntos', 'Picnic en el parque',
  'Maratón de nuestra serie', 'Escapada de fin de semana', 'Cocinar una receta nueva',
  'Tarde de museo', 'Ruta en bici', 'Noche de juegos de mesa', 'Bailar en el salón',
];

export async function render() {
  const wrap = el('div');
  const chips = el('div', { class: 'chips' });
  const listBox = el('div');

  function renderChips() {
    chips.innerHTML = '';
    [
      { id: 'todo', label: '✨ Por hacer' },
      { id: 'hecho', label: '✅ Hechos' },
      { id: 'todos', label: 'Todos' },
    ].forEach((o) => chips.append(el('button', {
      class: 'chip', type: 'button', text: o.label, 'aria-pressed': String(view.filter === o.id),
      onclick: () => { view.filter = o.id; renderChips(); paint(); },
    })));
  }

  function paint() {
    listBox.innerHTML = '';
    const all = [...state.activities];
    const items = all.filter((a) => (
      view.filter === 'todos' ? true : view.filter === 'hecho' ? a.done : !a.done
    )).sort((a, b) => {
      if (view.filter === 'hecho') return (b.date || '').localeCompare(a.date || '');
      const ad = a.date || '9999-99-99';
      const bd = b.date || '9999-99-99';
      return ad.localeCompare(bd) || (b.createdAt || 0) - (a.createdAt || 0);
    });

    const done = all.filter((a) => a.done).length;
    listBox.append(el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [el('b', { text: String(done) }), el('span', { text: 'vividos' })]),
      el('div', { class: 'stat' }, [el('b', { text: String(all.length - done) }), el('span', { text: 'pendientes' })]),
      el('div', { class: 'stat' }, [
        el('b', { text: String(all.filter((a) => a.rating >= 4).length) }),
        el('span', { text: 'favoritos' }),
      ]),
    ]));

    if (!items.length) {
      listBox.append(emptyState({
        icon: view.filter === 'hecho' ? '🫶' : '✨',
        title: view.filter === 'hecho' ? 'Todavía nada marcado como hecho' : 'No hay planes pendientes',
        text: view.filter === 'hecho'
          ? 'Cuando hagáis un plan, márcalo como hecho y quedará aquí con su fecha.'
          : 'Apunta ese plan que siempre decís que vais a hacer.',
        actionLabel: 'Añadir un plan',
        onAction: () => openActivityForm(null, paint),
      }));
      listBox.append(ideasCard(paint));
      return;
    }

    const list = el('div', { class: 'list' });
    items.forEach((a) => {
      const parts = [];
      if (a.date) parts.push(capitalize(formatLong(a.date)));
      if (a.place) parts.push(a.place);
      list.append(listItem({
        emoji: a.done ? '✅' : '✨',
        title: a.title,
        subtitle: parts.join(' · ') || 'Sin fecha todavía',
        right: a.done
          ? (a.rating ? '★'.repeat(a.rating) : '')
          : (a.date ? relativeDays(a.date) : ''),
        onClick: () => openActivityForm(a, paint),
      }));
    });
    listBox.append(list);
    if (view.filter !== 'hecho') listBox.append(ideasCard(paint));
  }

  renderChips();
  wrap.append(chips, listBox, el('button', {
    class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:18px',
    text: '＋ Nuevo plan', onclick: () => openActivityForm(null, paint),
  }));
  paint();

  return {
    title: 'Planes',
    subtitle: 'Lo que hacemos juntos',
    content: wrap,
    tab: 'planes',
    actions: [el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Nuevo plan', text: '＋',
      onclick: () => openActivityForm(null, paint),
    })],
  };
}

function ideasCard(onDone) {
  const idea = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  return el('div', { class: 'card', style: 'margin-top:16px' }, [
    el('div', { class: 'small muted', text: '¿Sin ideas?' }),
    el('p', { style: 'margin:4px 0 10px', text: idea }),
    el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: 'Apuntar este plan',
      onclick: async () => {
        await saveActivity(newActivityDraft({ title: idea }));
        toast('Plan añadido');
        onDone();
      },
    }),
  ]);
}

/** Hoja para crear, editar o completar un plan. */
export function openActivityForm(existing, onDone = () => {}) {
  const draft = existing ? { ...existing } : newActivityDraft();

  return openSheet((close) => {
    const titleInput = el('input', {
      class: 'input', type: 'text', value: draft.title, maxlength: '90',
      placeholder: 'Ej. Cena en nuestro sitio favorito',
    });
    const dateInput = el('input', { class: 'input', type: 'date', value: draft.date || '' });
    const placeInput = el('input', {
      class: 'input', type: 'text', value: draft.place || '', maxlength: '80', placeholder: 'Lugar (opcional)',
    });
    const noteInput = el('textarea', { class: 'textarea', placeholder: '¿Cómo fue? ¿Qué queréis hacer?' });
    noteInput.value = draft.note || '';
    const doneInput = el('input', { type: 'checkbox' });
    doneInput.checked = !!draft.done;
    const rating = ratingField(draft.rating || 0);
    const ratingBox = el('div', { class: 'field' }, [el('label', { text: 'Qué tal estuvo' }), rating.node]);
    ratingBox.hidden = !doneInput.checked;

    doneInput.addEventListener('change', () => {
      ratingBox.hidden = !doneInput.checked;
      if (doneInput.checked && !dateInput.value) dateInput.value = todayISO();
    });

    return el('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const title = titleInput.value.trim();
        if (!title) { toast('Escribe qué plan es'); return; }
        if (dateInput.value && !isValidISODate(dateInput.value)) { toast('Revisa la fecha'); return; }
        const record = await saveActivity({
          ...draft,
          title,
          date: dateInput.value || '',
          place: placeInput.value.trim(),
          note: noteInput.value.trim(),
          done: doneInput.checked,
          rating: doneInput.checked ? rating.getValue() : 0,
        });
        close();
        toast(existing ? 'Plan actualizado' : 'Plan guardado');
        onDone();
        if (doneInput.checked && !existing?.done) offerMemory(record);
      },
    }, [
      el('h3', { text: existing ? 'Editar plan' : 'Nuevo plan' }),
      el('div', { class: 'field' }, [el('label', { text: '¿Qué plan es?' }), titleInput]),
      el('div', { class: 'field' }, [el('label', { text: 'Fecha' }), dateInput]),
      el('div', { class: 'field' }, [el('label', { text: 'Lugar' }), placeInput]),
      el('div', { class: 'field' }, [el('label', { text: 'Notas' }), noteInput]),
      el('label', { class: 'switch-row' }, [
        el('div', { class: 'sr-body' }, [
          el('b', { text: 'Ya lo hemos hecho' }),
          el('span', { text: 'Pasará a vuestra línea de tiempo' }),
        ]),
        el('span', { class: 'switch' }, [doneInput, el('i')]),
      ]),
      ratingBox,
      el('div', { class: 'sheet-actions' }, [
        el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancelar', onclick: () => close() }),
        el('button', { class: 'btn btn-primary', type: 'submit', text: 'Guardar' }),
      ]),
      existing ? el('button', {
        class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:10px', text: 'Eliminar plan',
        onclick: async () => {
          close();
          const ok = await confirmDialog({ title: '¿Eliminar este plan?', confirmText: 'Eliminar', danger: true });
          if (!ok) return;
          await deleteActivity(existing.id);
          toast('Plan eliminado');
          onDone();
        },
      }) : null,
    ]);
  });
}

/** Tras marcar un plan como hecho, proponemos guardar una foto del día. */
function offerMemory(activity) {
  setTimeout(() => {
    openSheet((close) => el('div', {}, [
      el('h3', { text: '¡Plan cumplido! 🎉' }),
      el('p', { class: 'muted', text: '¿Quieres guardar una foto o un recuerdo de ese día?' }),
      el('div', { class: 'sheet-actions' }, [
        el('button', { class: 'btn btn-ghost', type: 'button', text: 'Ahora no', onclick: () => close() }),
        el('button', {
          class: 'btn btn-primary', type: 'button', text: 'Guardar recuerdo',
          onclick: () => {
            close();
            const params = new URLSearchParams({
              type: 'momento',
              title: activity.title,
              date: activity.date || todayISO(),
              place: activity.place || '',
            });
            navigate(`/nuevo?${params.toString()}`);
          },
        }),
      ]),
    ]));
  }, 350);
}
