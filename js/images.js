/**
 * Procesado de imágenes: carga, recorte con corrección de perspectiva
 * ("escaneo" de un dibujo fotografiado en ángulo), filtros y miniaturas.
 * Todo ocurre en el teléfono, sin subir nada a ningún sitio.
 */

export const MAX_DIM = 1800;      // lado mayor de la foto guardada
export const THUMB_DIM = 420;     // lado mayor de la miniatura

/* ------------------------------ carga básica ----------------------------- */

/** Lee un File/Blob respetando la orientación EXIF. */
export async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* algunos navegadores no aceptan las opciones: seguimos con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export function bitmapSize(bmp) {
  return { w: bmp.width || bmp.naturalWidth, h: bmp.height || bmp.naturalHeight };
}

/** Dibuja el bitmap en un canvas, reduciéndolo si supera maxDim. */
export function toCanvas(bmp, maxDim = MAX_DIM) {
  const { w, h } = bitmapSize(bmp);
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.86) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), type, quality);
  });
}

export function rotateCanvas(canvas, quarterTurns = 1) {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return canvas;
  const swap = turns % 2 === 1;
  const out = document.createElement('canvas');
  out.width = swap ? canvas.height : canvas.width;
  out.height = swap ? canvas.width : canvas.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((Math.PI / 2) * turns);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

/* -------------------------- homografía / perspectiva --------------------- */

/**
 * Resuelve un sistema lineal n×n por eliminación gaussiana con pivoteo parcial.
 * `m` es una matriz aumentada n×(n+1). Devuelve el vector solución o null.
 */
export function solveLinear(m) {
  const n = m.length;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const p = m[col][col];
    for (let c = col; c <= n; c += 1) m[col][c] /= p;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = m[r][col];
      if (!f) continue;
      for (let c = col; c <= n; c += 1) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

/**
 * Homografía que lleva los 4 puntos `src` (u,v) a los 4 puntos `dst` (x,y).
 * Devuelve [a,b,c,d,e,f,g,h] con x = (au+bv+c)/(gu+hv+1).
 */
export function homography(src, dst) {
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const { x: u, y: v } = src[i];
    const { x, y } = dst[i];
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  return solveLinear(rows);
}

/**
 * "Endereza" el cuadrilátero `quad` (4 puntos en coordenadas del canvas
 * de origen, en orden: sup-izq, sup-der, inf-der, inf-izq) a un rectángulo.
 */
export function warpQuad(srcCanvas, quad, maxDim = MAX_DIM) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const widthPx = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const heightPx = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const scale = Math.min(1, maxDim / Math.max(widthPx, heightPx));
  const outW = Math.max(2, Math.round(widthPx * scale));
  const outH = Math.max(2, Math.round(heightPx * scale));

  // Homografía del rectángulo destino hacia el cuadrilátero de origen.
  const h = homography(
    [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
    quad,
  );
  if (!h) return srcCanvas;

  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const src = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const sw = src.width;
  const sh = src.height;
  const sd = src.data;

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d', { willReadFrequently: true });
  const dstImg = octx.createImageData(outW, outH);
  const dd = dstImg.data;

  const [a, b, c, d, e, f, g, hh] = h;
  for (let y = 0; y < outH; y += 1) {
    const vy = y + 0.5;
    for (let x = 0; x < outW; x += 1) {
      const vx = x + 0.5;
      const den = g * vx + hh * vy + 1;
      const sx = (a * vx + b * vy + c) / den;
      const sy = (d * vx + e * vy + f) / den;
      const o = (y * outW + x) * 4;
      // muestreo bilineal
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) {
        const cx = Math.min(sw - 1, Math.max(0, Math.round(sx)));
        const cy = Math.min(sh - 1, Math.max(0, Math.round(sy)));
        const p = (cy * sw + cx) * 4;
        dd[o] = sd[p]; dd[o + 1] = sd[p + 1]; dd[o + 2] = sd[p + 2]; dd[o + 3] = 255;
        continue;
      }
      const fx = sx - x0;
      const fy = sy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const p00 = (y0 * sw + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + sw * 4;
      const p11 = p01 + 4;
      for (let ch = 0; ch < 3; ch += 1) {
        dd[o + ch] = sd[p00 + ch] * w00 + sd[p10 + ch] * w10 + sd[p01 + ch] * w01 + sd[p11 + ch] * w11;
      }
      dd[o + 3] = 255;
    }
  }
  octx.putImageData(dstImg, 0, 0);
  return out;
}

/* --------------------------------- filtros ------------------------------- */

export const FILTERS = [
  { id: 'original', label: 'Original' },
  { id: 'escaneo', label: 'Escaneo' },
  { id: 'papel', label: 'Blanco y negro' },
  { id: 'vivo', label: 'Colores vivos' },
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Mapa de iluminación del papel: luminancia a baja resolución, dilatada
 * (la tinta es oscura, así que nos quedamos con el papel de alrededor) y
 * suavizada. Sirve para quitar sombras y dejar el fondo blanco de verdad.
 */
function shadingMap(canvas, targetLong = 72) {
  const scale = Math.min(1, targetLong / Math.max(canvas.width, canvas.height));
  const w = Math.max(4, Math.round(canvas.width * scale));
  const h = Math.max(4, Math.round(canvas.height * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const luma = new Float32Array(w * h);
  for (let i = 0; i < luma.length; i += 1) {
    luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  const radius = Math.max(2, Math.round(Math.max(w, h) / 10));
  const shading = blurF(dilateF(luma, w, h, radius), w, h, radius, 2);
  // Nivel de referencia del papel (percentil 90): evita ganancias disparadas
  // en el centro de una mancha grande de tinta, que sacarían colores falsos.
  const sorted = Float32Array.from(shading).sort();
  const paper = sorted[Math.floor(sorted.length * 0.9)] || 255;
  return { data: shading, w, h, paper };
}

/** Dilatación separable: el máximo del entorno. */
function dilateF(src, w, h, radius) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let max = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const xx = x + d < 0 ? 0 : x + d > w - 1 ? w - 1 : x + d;
        const v = src[y * w + xx];
        if (v > max) max = v;
      }
      tmp[y * w + x] = max;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let max = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const yy = y + d < 0 ? 0 : y + d > h - 1 ? h - 1 : y + d;
        const v = tmp[yy * w + x];
        if (v > max) max = v;
      }
      out[y * w + x] = max;
    }
  }
  return out;
}

/** Desenfoque de caja separable, en varias pasadas. */
function blurF(src, w, h, radius, passes = 1) {
  let a = Float32Array.from(src);
  let b = new Float32Array(w * h);
  for (let p = 0; p < passes; p += 1) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        let n = 0;
        for (let d = -radius; d <= radius; d += 1) {
          const xx = x + d < 0 ? 0 : x + d > w - 1 ? w - 1 : x + d;
          sum += a[y * w + xx];
          n += 1;
        }
        b[y * w + x] = sum / n;
      }
    }
    [a, b] = [b, a];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        let n = 0;
        for (let d = -radius; d <= radius; d += 1) {
          const yy = y + d < 0 ? 0 : y + d > h - 1 ? h - 1 : y + d;
          sum += a[yy * w + x];
          n += 1;
        }
        b[y * w + x] = sum / n;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

function sampleBilinear(map, u, v) {
  const x = Math.min(map.w - 1, Math.max(0, u * map.w - 0.5));
  const y = Math.min(map.h - 1, Math.max(0, v * map.h - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(map.w - 1, x0 + 1);
  const y1 = Math.min(map.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  return map.data[y0 * map.w + x0] * (1 - fx) * (1 - fy)
    + map.data[y0 * map.w + x1] * fx * (1 - fy)
    + map.data[y1 * map.w + x0] * (1 - fx) * fy
    + map.data[y1 * map.w + x1] * fx * fy;
}

/** Aplica un filtro y devuelve un canvas nuevo (no toca el original). */
export function applyFilter(canvas, filterId) {
  if (filterId === 'original') return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d', { willReadFrequently: true });
  const img = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  const data = img.data;

  if (filterId === 'vivo') {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      for (let ch = 0; ch < 3; ch += 1) {
        const saturated = lum + (data[i + ch] - lum) * 1.28;
        data[i + ch] = clamp255((saturated - 128) * 1.12 + 132);
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  // «Escaneo» y «Blanco y negro»: dividimos por la luz del papel para quitar
  // sombras. La ganancia es la misma en los tres canales, así que los colores
  // del dibujo se mantienen y no aparecen halos de color.
  const map = shadingMap(canvas);
  const gray = filterId === 'papel';
  const lo = gray ? 0.60 : 0.48;
  const hi = gray ? 0.93 : 0.97;

  for (let y = 0; y < h; y += 1) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      const bg = Math.max(28, map.paper * 0.5, sampleBilinear(map, (x + 0.5) / w, v));
      const gain = 1 / bg;
      if (gray) {
        const l = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) * gain;
        const t = clamp01((l - lo) / (hi - lo));
        const value = clamp255(255 * (t * t * (3 - 2 * t)));
        data[o] = value;
        data[o + 1] = value;
        data[o + 2] = value;
      } else {
        for (let ch = 0; ch < 3; ch += 1) {
          const t = clamp01((data[o + ch] * gain - lo) / (hi - lo));
          data[o + ch] = clamp255(255 * t);
        }
      }
      data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/* -------------------------------- miniaturas ----------------------------- */

export async function makeThumbnail(blobOrCanvas, size = THUMB_DIM) {
  const canvas = blobOrCanvas instanceof HTMLCanvasElement
    ? blobOrCanvas
    : toCanvas(await loadBitmap(blobOrCanvas), size);
  const scale = Math.min(1, size / Math.max(canvas.width, canvas.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return canvasToBlob(out, 'image/jpeg', 0.74);
}
