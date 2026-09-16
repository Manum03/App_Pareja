/**
 * Capa de acceso a IndexedDB.
 * Todo se guarda en el propio teléfono: no hay servidor ni cuenta.
 */

const DB_NAME = 'nuestros-momentos';
const DB_VERSION = 1;

export const STORES = {
  memories: 'memories',     // recuerdos: dibujos, cartas, regalos, momentos…
  dates: 'dates',           // fechas importantes (aniversarios, cumpleaños…)
  activities: 'activities', // planes y actividades juntos
  images: 'images',         // blobs de las fotos + miniaturas
  meta: 'meta',             // ajustes y preferencias
};

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.memories)) {
        const s = db.createObjectStore(STORES.memories, { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORES.dates)) {
        const s = db.createObjectStore(STORES.dates, { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(STORES.activities)) {
        const s = db.createObjectStore(STORES.activities, { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('done', 'doneFlag');
      }
      if (!db.objectStoreNames.contains(STORES.images)) {
        db.createObjectStore(STORES.images, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
      void ev;
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Hay otra pestaña de la app abierta con una versión distinta.'));
  });
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
    result = fn(t);
    if (result && typeof result.then === 'function') {
      // Evitamos promesas dentro de la transacción: rompen su ciclo de vida.
      reject(new Error('El callback de tx no puede ser asíncrono'));
    }
  }));
}

const asPromise = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function getAll(store) {
  const db = await open();
  return asPromise(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function get(store, id) {
  const db = await open();
  return asPromise(db.transaction(store, 'readonly').objectStore(store).get(id));
}

export async function put(store, value) {
  await tx(store, 'readwrite', (t) => { t.objectStore(store).put(value); });
  return value;
}

export async function putMany(store, values) {
  await tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    values.forEach((v) => os.put(v));
  });
  return values;
}

export async function remove(store, id) {
  await tx(store, 'readwrite', (t) => { t.objectStore(store).delete(id); });
}

export async function removeMany(store, ids) {
  await tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    ids.forEach((id) => os.delete(id));
  });
}

export async function clearAll() {
  const names = Object.values(STORES);
  await tx(names, 'readwrite', (t) => {
    names.forEach((n) => t.objectStore(n).clear());
  });
}

export async function count(store) {
  const db = await open();
  return asPromise(db.transaction(store, 'readonly').objectStore(store).count());
}

/** Espacio ocupado aproximado (si el navegador lo expone). */
export async function estimateUsage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage || 0, quota: quota || 0 };
  } catch {
    return null;
  }
}

/** Pide almacenamiento persistente para que el navegador no borre los recuerdos. */
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
