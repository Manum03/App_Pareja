/** Generación de archivos .ics para llevar las fechas al calendario del móvil. */

import { fromISODate, toISODate } from './util.js';

const pad = (n) => String(n).padStart(2, '0');

function icsDate(iso) {
  const d = fromISODate(iso);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function icsStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const escapeText = (s) => String(s || '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Pliega las líneas a 75 octetos como pide la especificación iCalendar. */
function fold(line) {
  if (line.length <= 73) return line;
  const parts = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

/** Un evento de día completo, opcionalmente anual. */
function event({ id, title, date, note, yearly, alarmDays = 1 }) {
  const next = new Date(fromISODate(date));
  next.setDate(next.getDate() + 1);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${id}@nuestros-momentos`,
    `DTSTAMP:${icsStamp()}`,
    `DTSTART;VALUE=DATE:${icsDate(date)}`,
    `DTEND;VALUE=DATE:${icsDate(toISODate(next))}`,
    `SUMMARY:${escapeText(title)}`,
    note ? `DESCRIPTION:${escapeText(note)}` : null,
    yearly ? 'RRULE:FREQ=YEARLY' : null,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:-P${alarmDays}D`,
    `DESCRIPTION:${escapeText(title)}`,
    'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n');
}

export function buildICS(items) {
  const body = items.map(event).join('\r\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nuestros Momentos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    body,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function icsBlob(items) {
  return new Blob([buildICS(items)], { type: 'text/calendar;charset=utf-8' });
}
