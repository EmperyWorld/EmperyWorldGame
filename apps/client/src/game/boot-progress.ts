/** DOM loading bar for BootScene LoaderPlugin progress. */

function barEl(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('boot-progress');
}

function fillEl(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('boot-progress-bar');
}

function labelEl(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('boot-progress-label');
}

export function showBootProgress(value: number, label = 'Загрузка локации…'): void {
  const root = barEl();
  const fill = fillEl();
  const text = labelEl();
  if (!root || !fill) return;
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  root.classList.remove('hidden');
  fill.style.width = `${Math.round(pct * 100)}%`;
  if (text) text.textContent = label;
}

export function hideBootProgress(): void {
  barEl()?.classList.add('hidden');
}

export function bindLoaderProgress(load: {
  on: (event: string, fn: (value?: number) => void) => void;
}): void {
  showBootProgress(0);
  load.on('progress', (value?: number) => {
    showBootProgress(typeof value === 'number' ? value : 0);
  });
  load.on('complete', () => {
    hideBootProgress();
  });
}
