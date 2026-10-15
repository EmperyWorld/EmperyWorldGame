import { playUiCue, unlockUiAudio } from './ui-audio.js';

const TOAST_MAX = 6;
const TOAST_TTL_MS = 3200;

export function createToastUi(toastEl: HTMLElement) {
  function showToast(text: string): void {
    const line = text.trim();
    if (!line) return;

    while (toastEl.childElementCount >= TOAST_MAX) {
      toastEl.lastElementChild?.remove();
    }

    const entry = document.createElement('div');
    entry.className = 'toast-line';
    entry.textContent = line;
    toastEl.prepend(entry);
    requestAnimationFrame(() => entry.classList.add('visible'));
    unlockUiAudio();
    playUiCue('toast');

    window.setTimeout(() => {
      entry.classList.add('leaving');
      entry.classList.remove('visible');
      window.setTimeout(() => entry.remove(), 280);
    }, TOAST_TTL_MS);
  }

  return { showToast };
}
