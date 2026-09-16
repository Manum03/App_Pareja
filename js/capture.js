/**
 * Captura de fotos: cámara o galería → escáner → imagen guardada.
 *
 * Importante: el selector de archivos tiene que abrirse dentro del mismo
 * gesto del usuario que lo pide (Safari en iPhone lo ignora si no). Por eso
 * `captureAndScan` se llama directamente desde el onclick, y si la foto se
 * toma desde otra pantalla se deja «en espera» para el editor.
 */

import { saveImage, state } from './store.js';
import { openScanner, pickImages } from './scanner.js';
import { toast } from './util.js';

let pending = [];

export const setPendingImages = (ids) => { pending = ids; };
export function takePendingImages() {
  const ids = pending;
  pending = [];
  return ids;
}

/**
 * Pide una o varias fotos, pasa cada una por el escáner y las guarda.
 * @returns {Promise<string[]>} ids de las imágenes guardadas
 */
export async function captureAndScan({ fromCamera = true } = {}) {
  const files = await pickImages({ capture: fromCamera, multiple: !fromCamera });
  const ids = [];
  for (const file of files) {
    try {
      const canvas = await openScanner(file, { defaultFilter: state.settings.defaultFilter });
      if (!canvas) continue;
      ids.push(await saveImage(canvas));
    } catch (err) {
      console.error(err);
      toast('No se pudo procesar esa foto');
    }
  }
  return ids;
}
