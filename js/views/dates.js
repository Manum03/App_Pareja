/** Fechas importantes: aniversarios, cumpleaños y hitos automáticos. */

import {
  el, openSheet, confirmDialog, toast, todayISO, isValidISODate,
  formatLong, formatDayMonth, capitalize, relativeDays, durationText, plural, downloadBlob,
} from '../util.js';
import { DATE_EMOJIS, deleteDate, newDateDraft, saveDate, state, saveSettings } from '../store.js';
import { milestones, nextOccurrence, upcoming } from '../agenda.js';
import { listItem, emptyState } from '../ui.js';
import { icsBlob } from '../calendar.js';

export async function render() {
  const wrap = el('div');

  function paint() {
    wrap.innerHTML = '';

    /* ----------------------- cuánto lleváis juntos ----------------------- */
    const start = state.settings.startDate;
    if (start) {
      const days = daysTogether(start);
      wrap.append(el('div', { class: 'hero' }, [
        el('p', { class: 'hero-sub', text: 'Llevamos juntos' }),
        el('div', { class: 'hero-num', text: plural(days, 'día', 'días') }),
        el('p', { class: 'hero-sub', text: `${durationText(start)} · desde el ${formatLong(start)}` }),
      ]));
    } else {
      wrap.append(el('div', { class: 'card' }, [
        el('h2', { text: '¿Cuándo empezasteis?' }),
        el('p', { class: 'small muted', text: 'Si guardas esa fecha, la app cuenta los días juntos y te avisa de los hitos.' }),
        el('button', {
          class: 'btn btn-primary btn-sm', type: 'button', text: 'Poner la fecha',
          onclick: async () => {
            const value = await askDate('¿Qué día empezasteis?');
            if (value) { await saveSettings({ startDate: value }); paint(); }
          },
        }),
      ]));
    }

    /* --------------------------- lo que viene ---------------------------- */
    // Los hitos automáticos tienen su propia sección más abajo.
    const next = upcoming({ limit: 8, includePlans: false, includeMilestones: false });
    wrap.append(el('div', { class: 'section-head' }, [el('h2', { text: 'Lo próximo' })]));
    if (!next.length) {
      wrap.append(emptyState({
        icon: '📅', title: 'Sin fechas guardadas',
        text: 'Añade vuestro aniversario, su cumpleaños o el día de vuestra primera cita.',
        actionLabel: 'Añadir una fecha', onAction: () => openDateForm(null, paint),
      }));
    } else {
      const list = el('div', { class: 'list' });
      next.forEach((item) => {
        const soon = item.days <= 7;
        list.append(listItem({
          emoji: item.emoji,
          title: item.kind === 'date' && item.yearsCount
            ? `${item.title} · ${plural(item.yearsCount, 'año', 'años')}`
            : item.title,
          subtitle: capitalize(formatLong(item.date)),
          badge: item.days === 0 ? '¡Hoy!' : `${item.days} d`,
          badgeClass: soon ? 'soon' : '',
          onClick: () => (item.kind === 'date'
            ? openDateForm(item.original, paint)
            : toast('Hito automático a partir de vuestra fecha de inicio')),
        }));
      });
      wrap.append(list);
    }

    /* -------------------------- todas las fechas ------------------------- */
    if (state.dates.length) {
      wrap.append(el('div', { class: 'section-head' }, [
        el('h2', { text: 'Todas las fechas' }),
        el('button', {
          type: 'button', text: '📥 Al calendario',
          onclick: () => exportCalendar(),
        }),
      ]));
      const all = el('div', { class: 'list' });
      [...state.dates]
        .sort((a, b) => (a.date || '').slice(5).localeCompare((b.date || '').slice(5)))
        .forEach((d) => {
          all.append(listItem({
            emoji: d.emoji || '💖',
            title: d.title,
            subtitle: `${capitalize(formatDayMonth(d.date))}${d.yearly ? ' · cada año' : ` · ${formatLong(d.date).split(' de ').pop()}`}`,
            right: relativeDays(nextOccurrence(d) || d.date),
            onClick: () => openDateForm(d, paint),
          }));
        });
      wrap.append(all);
    }

    /* ------------------------------ hitos -------------------------------- */
    const ms = milestones(state.settings.startDate, { limit: 4, horizonDays: 2000 });
    if (ms.length) {
      wrap.append(el('div', { class: 'section-head' }, [el('h2', { text: 'Hitos que llegan' })]));
      const list = el('div', { class: 'list' });
      ms.forEach((m) => list.append(listItem({
        emoji: m.emoji, title: m.title,
        subtitle: capitalize(formatLong(m.date)),
        right: relativeDays(m.date),
        onClick: () => toast('Se calcula solo desde vuestra fecha de inicio'),
      })));
      wrap.append(list);
    }

    wrap.append(el('button', {
      class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:18px',
      text: '＋ Añadir fecha importante', onclick: () => openDateForm(null, paint),
    }));
  }

  paint();

  return {
    title: 'Fechas',
    subtitle: 'Lo que no se olvida',
    content: wrap,
    tab: 'fechas',
    actions: [el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Añadir fecha', text: '＋',
      onclick: () => openDateForm(null, paint),
    })],
  };
}

function daysTogether(startISO) {
  const ms = Date.now() - new Date(`${startISO}T12:00:00`).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

function askDate(title) {
  return openSheet((close) => {
    const input = el('input', { class: 'input', type: 'date', value: todayISO() });
    return el('form', { onsubmit: (ev) => { ev.preventDefault(); close(input.value); } }, [
      el('h3', { text: title }),
      input,
      el('div', { class: 'sheet-actions' }, [
        el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancelar', onclick: () => close(null) }),
        el('button', { class: 'btn btn-primary', type: 'submit', text: 'Guardar' }),
      ]),
    ]);
  });
}

/** Hoja para crear o editar una fecha señalada. */
export function openDateForm(existing, onDone = () => {}) {
  const draft = existing ? { ...existing } : newDateDraft();
  let emoji = draft.emoji || '💖';

  return openSheet((close) => {
    const titleInput = el('input', {
      class: 'input', type: 'text', value: draft.title, maxlength: '70',
      placeholder: 'Ej. Nuestro aniversario',
    });
    const dateInput = el('input', { class: 'input', type: 'date', value: draft.date || todayISO() });
    const noteInput = el('input', {
      class: 'input', type: 'text', value: draft.note || '', maxlength: '120', placeholder: 'Nota (opcional)',
    });
    const yearlyInput = el('input', { type: 'checkbox' });
    yearlyInput.checked = draft.yearly !== false;

    const emojiRow = el('div', { class: 'chips' });
    function renderEmojis() {
      emojiRow.innerHTML = '';
      DATE_EMOJIS.forEach((e) => emojiRow.append(el('button', {
        class: 'chip', type: 'button', text: e, 'aria-pressed': String(e === emoji),
        style: 'font-size:1.15rem;padding:6px 12px',
        onclick: () => { emoji = e; renderEmojis(); },
      })));
    }
    renderEmojis();

    return el('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const title = titleInput.value.trim();
        if (!title) { toast('Ponle un nombre a la fecha'); return; }
        if (!isValidISODate(dateInput.value)) { toast('Revisa la fecha'); return; }
        await saveDate({
          ...draft,
          title,
          date: dateInput.value,
          note: noteInput.value.trim(),
          yearly: yearlyInput.checked,
          emoji,
        });
        close();
        toast(existing ? 'Fecha actualizada' : 'Fecha guardada');
        onDone();
      },
    }, [
      el('h3', { text: existing ? 'Editar fecha' : 'Nueva fecha importante' }),
      el('div', { class: 'field' }, [el('label', { text: 'Nombre' }), titleInput]),
      el('div', { class: 'field' }, [el('label', { text: 'Día' }), dateInput]),
      el('div', { class: 'field' }, [el('label', { text: 'Icono' }), emojiRow]),
      el('div', { class: 'field' }, [el('label', { text: 'Nota' }), noteInput]),
      el('label', { class: 'switch-row' }, [
        el('div', { class: 'sr-body' }, [
          el('b', { text: 'Se repite cada año' }),
          el('span', { text: 'Aniversarios y cumpleaños' }),
        ]),
        el('span', { class: 'switch' }, [yearlyInput, el('i')]),
      ]),
      el('div', { class: 'sheet-actions' }, [
        el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancelar', onclick: () => close() }),
        el('button', { class: 'btn btn-primary', type: 'submit', text: 'Guardar' }),
      ]),
      existing ? el('button', {
        class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:10px', text: 'Eliminar fecha',
        onclick: async () => {
          close();
          const ok = await confirmDialog({
            title: '¿Eliminar esta fecha?', confirmText: 'Eliminar', danger: true,
          });
          if (!ok) return;
          await deleteDate(existing.id);
          toast('Fecha eliminada');
          onDone();
        },
      }) : null,
    ]);
  });
}

export function exportCalendar() {
  if (!state.dates.length) { toast('Primero añade alguna fecha'); return; }
  const items = state.dates.map((d) => ({
    id: d.id, title: `${d.emoji || '💖'} ${d.title}`, date: d.date, note: d.note, yearly: d.yearly !== false,
  }));
  downloadBlob(icsBlob(items), 'nuestras-fechas.ics');
  toast('Ábrelo para añadirlas a tu calendario');
}
