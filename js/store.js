/**
 * Estado de la aplicación: recuerdos, fechas importantes, planes y ajustes.
 * Mantiene una copia en memoria (los volúmenes son pequeños) y avisa a las
 * vistas cuando algo cambia.
 */

import * as db from './db.js';
import { uid, todayISO } from './util.js';
import { canvasToBlob, makeThumbnail, toCanvas, loadBitmap } from './images.js';

export const MEMORY_TYPES = [
  { id: 'dibujo', label: 'Dibujo', emoji: '🎨' },
  { id: 'carta', label: 'Carta', emoji: '💌' },
  { id: 'regalo', label: 'Regalo', emoji: '🎁' },
  { id: 'detalle', label: 'Detalle', emoji: '🌷' },
  { id: 'foto', label: 'Foto', emoji: '📷' },
  { id: 'momento', label: 'Momento', emoji: '✨' },
];

export const DATE_EMOJIS = ['💖', '🎂', '💍', '🌹', '🎉', '✈️', '🏡', '🎓', '⭐', '🥂'];

export const typeInfo = (id) => MEMORY_TYPES.find((t) => t.id === id) || { id, label: 'Otro', emoji: '📦' };

const DEFAULT_SETTINGS = {
  myName: '',
  partnerName: '',
  startDate: '',
  theme: 'auto',
  lockEnabled: false,
  pinHash: '',
  defaultFilter: 'escaneo',
};

export const state = {
  memories: [],
  dates: [],
  activities: [],
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
};

/* ------------------------------- eventos --------------------------------- */

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(what) {
  listeners.forEach((fn) => {
    try { fn(what); } catch (err) { console.error(err); }
  });
}

/* ------------------------------- arranque -------------------------------- */

export async function init() {
  const [memories, dates, activities, meta] = await Promise.all([
    db.getAll(db.STORES.memories),
    db.getAll(db.STORES.dates),
    db.getAll(db.STORES.activities),
    db.getAll(db.STORES.meta),
  ]);
  state.memories = memories.sort(byDateDesc);
  state.dates = dates;
  state.activities = activities;
  const saved = Object.fromEntries(meta.map((m) => [m.key, m.value]));
  state.settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
  state.ready = true;
  return state;
}

const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '')
  || (b.createdAt || 0) - (a.createdAt || 0);

/* -------------------------------- ajustes -------------------------------- */

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.put(db.STORES.meta, { key: 'settings', value: state.settings });
  emit('settings');
  return state.settings;
}

/* ------------------------------- imágenes -------------------------------- */

const urlCache = new Map();

/** Guarda un canvas (o blob) como imagen + miniatura y devuelve su id. */
export async function saveImage(source, { type = 'image/jpeg', quality = 0.86 } = {}) {
  let blob;
  let canvas = null;
  if (source instanceof HTMLCanvasElement) {
    canvas = source;
    blob = await canvasToBlob(canvas, type, quality);
  } else {
    // Normalizamos tamaño/orientación también para fotos elegidas de la galería.
    canvas = toCanvas(await loadBitmap(source));
    blob = await canvasToBlob(canvas, type, quality);
  }
  const thumb = await makeThumbnail(canvas);
  const record = {
    id: uid('img'),
    blob,
    thumb,
    w: canvas.width,
    h: canvas.height,
    createdAt: Date.now(),
  };
  await db.put(db.STORES.images, record);
  return record.id;
}

export async function getImage(id) {
  return db.get(db.STORES.images, id);
}

/** URL de objeto (cacheada) para mostrar una imagen o su miniatura. */
export async function imageURL(id, { thumb = false } = {}) {
  const key = `${id}${thumb ? ':t' : ''}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const record = await db.get(db.STORES.images, id);
  if (!record) return '';
  const blob = thumb ? (record.thumb || record.blob) : record.blob;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

function forgetImageURL(id) {
  [id, `${id}:t`].forEach((key) => {
    const url = urlCache.get(key);
    if (url) { URL.revokeObjectURL(url); urlCache.delete(key); }
  });
}

async function deleteImages(ids = []) {
  if (!ids.length) return;
  ids.forEach(forgetImageURL);
  await db.removeMany(db.STORES.images, ids);
}

/** Imágenes que ya no pertenecen a ningún recuerdo, plan o fecha. */
export async function orphanImageIds() {
  const used = new Set();
  [...state.memories, ...state.activities].forEach((item) => {
    (item.images || []).forEach((id) => used.add(id));
  });
  const all = await db.getAll(db.STORES.images);
  return all.filter((img) => !used.has(img.id)).map((img) => img.id);
}

/* ------------------------------- recuerdos ------------------------------- */

export function newMemoryDraft(patch = {}) {
  return {
    id: uid('mem'),
    type: 'dibujo',
    title: '',
    note: '',
    date: todayISO(),
    place: '',
    tags: [],
    favorite: false,
    images: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...patch,
  };
}

export async function saveMemory(memory) {
  const record = { ...memory, updatedAt: Date.now() };
  if (!record.createdAt) record.createdAt = Date.now();
  await db.put(db.STORES.memories, record);
  const i = state.memories.findIndex((m) => m.id === record.id);
  if (i >= 0) state.memories[i] = record;
  else state.memories.push(record);
  state.memories.sort(byDateDesc);
  emit('memories');
  return record;
}

export async function deleteMemory(id) {
  const memory = state.memories.find((m) => m.id === id);
  await db.remove(db.STORES.memories, id);
  await deleteImages(memory?.images || []);
  state.memories = state.memories.filter((m) => m.id !== id);
  emit('memories');
}

export const getMemory = (id) => state.memories.find((m) => m.id === id);

export async function toggleFavorite(id) {
  const memory = getMemory(id);
  if (!memory) return null;
  return saveMemory({ ...memory, favorite: !memory.favorite });
}

/** Todas las etiquetas usadas, de más a menos frecuente. */
export function allTags() {
  const counts = new Map();
  state.memories.forEach((m) => (m.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  state.activities.forEach((a) => (a.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/* --------------------------- fechas importantes -------------------------- */

export function newDateDraft(patch = {}) {
  return {
    id: uid('date'),
    title: '',
    date: todayISO(),
    yearly: true,
    emoji: '💖',
    note: '',
    createdAt: Date.now(),
    ...patch,
  };
}

export async function saveDate(item) {
  const record = { ...item };
  await db.put(db.STORES.dates, record);
  const i = state.dates.findIndex((d) => d.id === record.id);
  if (i >= 0) state.dates[i] = record;
  else state.dates.push(record);
  emit('dates');
  return record;
}

export async function deleteDate(id) {
  await db.remove(db.STORES.dates, id);
  state.dates = state.dates.filter((d) => d.id !== id);
  emit('dates');
}

export const getDate = (id) => state.dates.find((d) => d.id === id);

/* ---------------------------- planes / actividades ----------------------- */

export function newActivityDraft(patch = {}) {
  return {
    id: uid('act'),
    title: '',
    note: '',
    place: '',
    date: '',
    done: false,
    rating: 0,
    tags: [],
    images: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...patch,
  };
}

export async function saveActivity(activity) {
  const record = { ...activity, updatedAt: Date.now(), doneFlag: activity.done ? 1 : 0 };
  await db.put(db.STORES.activities, record);
  const i = state.activities.findIndex((a) => a.id === record.id);
  if (i >= 0) state.activities[i] = record;
  else state.activities.push(record);
  emit('activities');
  return record;
}

export async function deleteActivity(id) {
  const activity = state.activities.find((a) => a.id === id);
  await db.remove(db.STORES.activities, id);
  await deleteImages(activity?.images || []);
  state.activities = state.activities.filter((a) => a.id !== id);
  emit('activities');
}

export const getActivity = (id) => state.activities.find((a) => a.id === id);

/* -------------------------------- consultas ------------------------------ */

export function searchMemories({ query = '', type = '', tag = '', favorites = false } = {}) {
  const q = query.trim().toLowerCase();
  return state.memories.filter((m) => {
    if (type && m.type !== type) return false;
    if (tag && !(m.tags || []).includes(tag)) return false;
    if (favorites && !m.favorite) return false;
    if (!q) return true;
    return [m.title, m.note, m.place, (m.tags || []).join(' ')]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });
}

/** Une recuerdos y planes hechos en una sola línea temporal descendente. */
export function timelineEntries() {
  const entries = [];
  state.memories.forEach((m) => entries.push({ kind: 'memory', date: m.date, item: m }));
  state.activities.filter((a) => a.done && a.date)
    .forEach((a) => entries.push({ kind: 'activity', date: a.date, item: a }));
  return entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function stats() {
  return {
    memories: state.memories.length,
    photos: state.memories.reduce((n, m) => n + (m.images?.length || 0), 0)
      + state.activities.reduce((n, a) => n + (a.images?.length || 0), 0),
    activitiesDone: state.activities.filter((a) => a.done).length,
    activitiesPending: state.activities.filter((a) => !a.done).length,
    favorites: state.memories.filter((m) => m.favorite).length,
    dates: state.dates.length,
  };
}

/* ---------------------------- importar / borrar --------------------------- */

export async function replaceAll({ memories = [], dates = [], activities = [], settings = null, images = [] }) {
  await db.clearAll();
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
  if (images.length) await db.putMany(db.STORES.images, images);
  if (memories.length) await db.putMany(db.STORES.memories, memories);
  if (dates.length) await db.putMany(db.STORES.dates, dates);
  if (activities.length) await db.putMany(db.STORES.activities, activities);
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  await db.put(db.STORES.meta, { key: 'settings', value: merged });
  state.memories = memories.sort(byDateDesc);
  state.dates = dates;
  state.activities = activities;
  state.settings = merged;
  emit('all');
}

export async function mergeImport({ memories = [], dates = [], activities = [], images = [] }) {
  if (images.length) await db.putMany(db.STORES.images, images);
  const existing = new Set(state.memories.map((m) => m.id));
  const newMemories = memories.filter((m) => !existing.has(m.id));
  if (newMemories.length) await db.putMany(db.STORES.memories, newMemories);
  const existingDates = new Set(state.dates.map((d) => d.id));
  const newDates = dates.filter((d) => !existingDates.has(d.id));
  if (newDates.length) await db.putMany(db.STORES.dates, newDates);
  const existingActs = new Set(state.activities.map((a) => a.id));
  const newActs = activities.filter((a) => !existingActs.has(a.id));
  if (newActs.length) await db.putMany(db.STORES.activities, newActs);
  state.memories = [...state.memories, ...newMemories].sort(byDateDesc);
  state.dates = [...state.dates, ...newDates];
  state.activities = [...state.activities, ...newActs];
  emit('all');
  return { memories: newMemories.length, dates: newDates.length, activities: newActs.length };
}

export async function wipeEverything() {
  await db.clearAll();
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
  state.memories = [];
  state.dates = [];
  state.activities = [];
  state.settings = { ...DEFAULT_SETTINGS };
  emit('all');
}

export { db };
