/**
 * Bloqueo con código.
 * Ojo: es una barrera para miradas curiosas, no cifrado. Los datos siguen
 * guardados en el navegador del teléfono.
 */

import { state, saveSettings } from './store.js';

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const hashPin = (pin) => sha256Hex(`nuestros-momentos:${pin}`);

export async function setPin(pin) {
  const pinHash = pin ? await hashPin(pin) : '';
  await saveSettings({ pinHash, lockEnabled: !!pin });
}

export async function verifyPin(pin) {
  if (!state.settings.pinHash) return true;
  return (await hashPin(pin)) === state.settings.pinHash;
}

export const isLocked = () => !!(state.settings.lockEnabled && state.settings.pinHash);
