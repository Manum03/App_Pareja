/** Galería y línea de tiempo de todos los recuerdos. */

import { el, debounce, formatMonthYear, capitalize } from '../util.js';
import { MEMORY_TYPES, searchMemories, state, typeInfo } from '../store.js';
import { emptyState, memoryTile, listItem } from '../ui.js';
import { navigate } from '../router.js';

const filters = { query: '', type: '', favorites: false, mode: 'grid' };

export async function render() {
  const wrap = el('div');

  const search = el('input', {
    class: 'input', type: 'search', placeholder: '🔍 Buscar por título, nota o etiqueta…',
    value: filters.query,
    oninput: debounce((ev) => { filters.query = ev.target.value; paint(); }, 200),
  });

  const chips = el('div', { class: 'chips' });
  const results = el('div');

  function renderChips() {
    chips.innerHTML = '';
    const options = [
      { id: '', label: 'Todo' },
      ...MEMORY_TYPES.map((t) => ({ id: t.id, label: `${t.emoji} ${t.label}` })),
    ];
    options.forEach((o) => {
      chips.append(el('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(filters.type === o.id),
        text: o.label,
        onclick: () => { filters.type = o.id; renderChips(); paint(); },
      }));
    });
    chips.append(el('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(filters.favorites),
      text: '❤️ Favoritos',
      onclick: () => { filters.favorites = !filters.favorites; renderChips(); paint(); },
    }));
  }

  const modeToggle = el('div', { class: 'row', style: 'justify-content:flex-end;margin:2px 2px 10px' });
  function renderModeToggle(total) {
    modeToggle.innerHTML = '';
    modeToggle.append(
      el('span', { class: 'small muted', text: `${total} ${total === 1 ? 'recuerdo' : 'recuerdos'}` }),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        text: filters.mode === 'grid' ? '🗓 Línea de tiempo' : '🖼 Galería',
        onclick: () => { filters.mode = filters.mode === 'grid' ? 'timeline' : 'grid'; paint(); },
      }),
    );
  }

  function paint() {
    const list = searchMemories(filters);
    renderModeToggle(list.length);
    results.innerHTML = '';

    if (!list.length) {
      results.append(state.memories.length
        ? emptyState({
          icon: '🔍', title: 'Nada por aquí',
          text: 'Prueba con otra búsqueda o quita los filtros.',
        })
        : emptyState({
          icon: '🎨', title: 'Aún no hay recuerdos',
          text: 'Escanea ese dibujo que te hizo o guarda la primera carta.',
          actionLabel: 'Añadir el primero',
          onAction: () => navigate('/nuevo'),
        }));
      return;
    }

    if (filters.mode === 'grid') {
      const grid = el('div', { class: 'grid' });
      list.forEach((m) => grid.append(memoryTile(m, (mem) => navigate(`/recuerdo/${mem.id}`))));
      results.append(grid);
      return;
    }

    const timeline = el('div', { class: 'timeline' });
    let currentMonth = '';
    let group = null;
    list.forEach((m) => {
      const month = (m.date || '').slice(0, 7);
      if (month !== currentMonth) {
        currentMonth = month;
        group = el('div', { class: 'tl-group' }, [
          el('div', { class: 'tl-date', text: capitalize(formatMonthYear(m.date)) }),
          el('div', { class: 'list' }),
        ]);
        timeline.append(group);
      }
      const info = typeInfo(m.type);
      group.lastChild.append(listItem({
        emoji: info.emoji,
        title: m.title || info.label,
        subtitle: [m.place, m.note].filter(Boolean).join(' · ').slice(0, 70) || info.label,
        right: (m.date || '').slice(8, 10),
        onClick: () => navigate(`/recuerdo/${m.id}`),
      }));
    });
    results.append(timeline);
  }

  renderChips();
  wrap.append(search, el('div', { style: 'height:10px' }), chips, modeToggle, results);
  paint();

  return {
    title: 'Recuerdos',
    subtitle: 'Todo lo que te ha dado',
    content: wrap,
    tab: 'recuerdos',
    actions: [el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Nuevo recuerdo', text: '＋',
      onclick: () => navigate('/nuevo'),
    })],
  };
}
