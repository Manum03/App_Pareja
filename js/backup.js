/** Copias de seguridad: exportar e importar todo en un único archivo .json. */

import { db, state, replaceAll, mergeImport } from './store.js';
import { downloadBlob, todayISO } from './util.js';

const FORMAT = 'nuestros-momentos/backup';
const VERSION = 1;

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataURL) {
  const [head, b64] = String(dataURL).split(',');
  const mime = (head.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Genera el archivo de copia. `onProgress(hechas, total)` permite pintar barra.
 * `includePhotos: false` genera una copia ligera, solo con los textos.
 */
export async function exportBackup({ includePhotos = true, onProgress = () => {} } = {}) {
  const images = includePhotos ? await db.getAll(db.STORES.images) : [];
  const serialized = [];
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    serialized.push({
      id: img.id,
      w: img.w,
      h: img.h,
      createdAt: img.createdAt,
      data: await blobToDataURL(img.blob),
      thumb: img.thumb ? await blobToDataURL(img.thumb) : null,
    });
    onProgress(i + 1, images.length);
  }
  const payload = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    includesPhotos: includePhotos,
    settings: state.settings,
    memories: state.memories,
    dates: state.dates,
    activities: state.activities,
    images: serialized,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const name = `nuestros-momentos-${todayISO()}${includePhotos ? '' : '-sin-fotos'}.json`;
  downloadBlob(blob, name);
  return { size: blob.size, photos: serialized.length, name };
}

export async function readBackupFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || data.format !== FORMAT) throw new Error('Este archivo no es una copia de la app');
  return data;
}

function hydrate(data) {
  return {
    memories: data.memories || [],
    dates: data.dates || [],
    activities: data.activities || [],
    settings: data.settings || null,
    images: (data.images || []).map((img) => ({
      id: img.id,
      w: img.w,
      h: img.h,
      createdAt: img.createdAt,
      blob: dataURLToBlob(img.data),
      thumb: img.thumb ? dataURLToBlob(img.thumb) : null,
    })),
  };
}

/** `mode`: 'replace' borra lo que haya; 'merge' añade solo lo que falta. */
export async function importBackup(data, mode = 'merge') {
  const hydrated = hydrate(data);
  if (mode === 'replace') {
    await replaceAll(hydrated);
    return {
      memories: hydrated.memories.length,
      dates: hydrated.dates.length,
      activities: hydrated.activities.length,
    };
  }
  return mergeImport(hydrated);
}

export function describeBackup(data) {
  return {
    date: data.exportedAt ? new Date(data.exportedAt).toLocaleDateString('es-ES') : '—',
    memories: (data.memories || []).length,
    dates: (data.dates || []).length,
    activities: (data.activities || []).length,
    photos: (data.images || []).length,
  };
}
