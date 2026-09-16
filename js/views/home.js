/** Portada: resumen de la relación, lo que viene y los últimos recuerdos. */

import {
  el, plural, durationText, formatLong, capitalize, daysBetween, todayISO, toast,
} from '../util.js';
import { state, stats, typeInfo } from '../store.js';
import { upcoming } from '../agenda.js';
import { memoryTile, listItem, emptyState } from '../ui.js';
import { captureAndScan, setPendingImages } from '../capture.js';
import { navigate } from '../router.js';
import { openDateForm } from './dates.js';
import { openActivityForm } from './activities.js';

/** Abre la cámara desde el propio toque y lleva la foto al editor. */
async function escanearYCrear() {
  const ids = await captureAndScan({ fromCamera: true });
  if (!ids.length) return;
  setPendingImages(ids);
  navigate('/nuevo');
}

export async function render() {
  const wrap = el('div');
  const s = stats();
  const { partnerName, startDate } = state.settings;

  /* ------------------------------- cabecera ------------------------------ */
  if (startDate) {
    const days = Math.max(0, daysBetween(startDate, todayISO()));
    wrap.append(el('div', { class: 'hero' }, [
      el('p', { class: 'hero-sub', text: partnerName ? `${partnerName} y yo llevamos` : 'Llevamos juntos' }),
      el('div', { class: 'hero-num', text: plural(days, 'día', 'días') }),
      el('p', { class: 'hero-sub', text: durationText(startDate) }),
    ]));
  } else {
    wrap.append(el('div', { class: 'hero' }, [
      el('h2', { text: 'Nuestros Momentos' }),
      el('p', { class: 'hero-sub', style: 'margin-top:6px' },
        ['Guarda aquí sus dibujos, sus cartas y todo lo que hacéis juntos.']),
      el('button', {
        class: 'btn btn-sm', type: 'button', style: 'margin-top:12px;background:#fff;color:#c9184a',
        text: 'Configurar la app', onclick: () => navigate('/ajustes'),
      }),
    ]));
  }

  /* --------------------------- acciones rápidas -------------------------- */
  wrap.append(el('div', { class: 'row row-wrap', style: 'margin:14px 0 4px;gap:8px' }, [
    el('button', {
      class: 'btn btn-primary', type: 'button', style: 'flex:1 1 46%',
      text: '📷 Escanear', onclick: escanearYCrear,
    }),
    el('button', {
      class: 'btn btn-ghost', type: 'button', style: 'flex:1 1 46%',
      text: '✨ Nuevo plan', onclick: () => openActivityForm(null, () => navigate('/planes')),
    }),
  ]));

  /* ------------------------------ estadísticas --------------------------- */
  wrap.append(el('div', { class: 'stats' }, [
    el('div', { class: 'stat' }, [el('b', { text: String(s.memories) }), el('span', { text: 'recuerdos' })]),
    el('div', { class: 'stat' }, [el('b', { text: String(s.photos) }), el('span', { text: 'fotos' })]),
    el('div', { class: 'stat' }, [el('b', { text: String(s.activitiesDone) }), el('span', { text: 'planes hechos' })]),
  ]));

  /* ------------------------------ lo próximo ----------------------------- */
  const next = upcoming({ limit: 3 });
  wrap.append(el('div', { class: 'section-head' }, [
    el('h2', { text: 'Lo próximo' }),
    el('a', { href: '#/fechas', text: 'Ver todo' }),
  ]));
  if (next.length) {
    const list = el('div', { class: 'list' });
    next.forEach((item) => list.append(listItem({
      emoji: item.emoji,
      title: item.title,
      subtitle: capitalize(formatLong(item.date)),
      badge: item.days === 0 ? '¡Hoy!' : `${item.days} d`,
      badgeClass: item.days <= 7 ? 'soon' : '',
      onClick: () => {
        if (item.kind === 'date') openDateForm(item.original, () => navigate('/fechas'));
        else if (item.kind === 'plan') openActivityForm(item.original, () => navigate('/planes'));
        else toast('Hito calculado desde vuestra fecha de inicio');
      },
    })));
    wrap.append(list);
  } else {
    wrap.append(el('div', { class: 'card' }, [
      el('p', { class: 'small muted', style: 'margin:0 0 10px' },
        ['Todavía no hay fechas señaladas. Añade vuestro aniversario o su cumpleaños.']),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '＋ Añadir fecha',
        onclick: () => openDateForm(null, () => navigate('/fechas')),
      }),
    ]));
  }

  /* --------------------------- recuerdo al azar -------------------------- */
  if (state.memories.length > 2) {
    const pool = state.memories.filter((m) => m.images?.length) || state.memories;
    const pick = (pool.length ? pool : state.memories)[Math.floor(Math.random() * (pool.length || state.memories.length))];
    if (pick) {
      const info = typeInfo(pick.type);
      wrap.append(el('div', { class: 'section-head' }, [el('h2', { text: '¿Te acuerdas de esto?' })]));
      wrap.append(listItem({
        emoji: info.emoji,
        title: pick.title || info.label,
        subtitle: capitalize(formatLong(pick.date)),
        right: '›',
        onClick: () => navigate(`/recuerdo/${pick.id}`),
      }));
    }
  }

  /* --------------------------- últimos recuerdos ------------------------- */
  wrap.append(el('div', { class: 'section-head' }, [
    el('h2', { text: 'Últimos recuerdos' }),
    el('a', { href: '#/recuerdos', text: 'Ver todo' }),
  ]));
  if (state.memories.length) {
    const grid = el('div', { class: 'grid' });
    state.memories.slice(0, 6).forEach((m) => grid.append(memoryTile(m, (mem) => navigate(`/recuerdo/${mem.id}`))));
    wrap.append(grid);
  } else {
    wrap.append(emptyState({
      icon: '💝',
      title: 'Empieza por el primero',
      text: 'Escanea un dibujo suyo, guarda una carta o sube la foto de un regalo.',
      actionLabel: '📷 Escanear ahora',
      onAction: escanearYCrear,
    }));
  }

  return {
    title: 'Inicio',
    subtitle: partnerName ? `Para ${partnerName}` : 'Nuestros Momentos',
    content: wrap,
    tab: 'inicio',
  };
}
