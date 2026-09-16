/**
 * Cálculo de lo que viene: fechas señaladas, hitos automáticos
 * ("llevamos 500 días") y planes con fecha.
 */

import { daysBetween, daysUntil, nextAnniversary, todayISO, toISODate, fromISODate, plural } from './util.js';
import { state } from './store.js';

/** Próxima celebración de una fecha guardada (o null si ya pasó y no es anual). */
export function nextOccurrence(item, fromISO = todayISO()) {
  if (!item.date) return null;
  if (item.yearly) return nextAnniversary(item.date, fromISO);
  return daysBetween(fromISO, item.date) >= 0 ? item.date : null;
}

/** Hitos automáticos a partir de la fecha en la que empezasteis. */
export function milestones(startISO, { limit = 3, horizonDays = 800 } = {}) {
  if (!startISO) return [];
  const start = fromISODate(startISO);
  if (!start) return [];
  const elapsed = daysBetween(startISO, todayISO());
  const candidates = [];

  const addDayMilestone = (days) => {
    if (days <= elapsed) return;
    const d = new Date(start);
    d.setDate(d.getDate() + days);
    candidates.push({
      id: `ms-d-${days}`,
      kind: 'milestone',
      emoji: days % 1000 === 0 ? '🏆' : '💫',
      title: `${plural(days, 'día', 'días')} juntos`,
      date: toISODate(d),
    });
  };

  const step = elapsed < 365 ? 100 : elapsed < 1500 ? 250 : 500;
  const first = Math.floor(elapsed / step) * step + step;
  for (let i = 0; i < 6; i += 1) addDayMilestone(first + i * step);

  const years = start.getFullYear();
  for (let y = 1; y <= 30; y += 1) {
    const d = new Date(start);
    d.setFullYear(years + y);
    const iso = toISODate(d);
    const until = daysUntil(iso);
    if (until >= 0 && until <= horizonDays) {
      candidates.push({
        id: `ms-y-${y}`,
        kind: 'milestone',
        emoji: '🥂',
        title: `${plural(y, 'año', 'años')} juntos`,
        date: iso,
      });
    }
  }

  return candidates
    .filter((c) => daysUntil(c.date) >= 0 && daysUntil(c.date) <= horizonDays)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** Lista unificada de lo que está por llegar. */
export function upcoming({ limit = 6, includePlans = true, includeMilestones = true } = {}) {
  const items = [];

  state.dates.forEach((d) => {
    const when = nextOccurrence(d);
    if (!when) return;
    items.push({
      id: d.id,
      kind: 'date',
      emoji: d.emoji || '💖',
      title: d.title,
      date: when,
      original: d,
      yearsCount: d.yearly ? new Date(fromISODate(when)).getFullYear() - fromISODate(d.date).getFullYear() : 0,
    });
  });

  if (includeMilestones) items.push(...milestones(state.settings.startDate, { limit: 3 }));

  if (includePlans) {
    state.activities.filter((a) => !a.done && a.date && daysUntil(a.date) >= 0).forEach((a) => {
      items.push({ id: a.id, kind: 'plan', emoji: '✨', title: a.title, date: a.date, original: a });
    });
  }

  return items
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((i) => ({ ...i, days: daysUntil(i.date) }));
}
