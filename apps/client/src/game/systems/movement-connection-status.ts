import type { MovementConnectionState } from './RealtimeGateway.js';

/** Delayed notice avoids flashing on ordinary acknowledgement round trips. */
export class MovementConnectionStatus {
  private since: number | null = null;
  private element: HTMLDivElement | null = null;
  update(state: MovementConnectionState, now: number): void {
    if (state === 'ready' || state === 'travel') {
      this.since = null;
      if (this.element) this.element.hidden = true;
      return;
    }
    this.since ??= now;
    if (now - this.since < 750) return;
    if (!this.element) {
      const root = document.getElementById('gameplay-shell');
      if (!root) return;
      this.element = document.createElement('div');
      this.element.id = 'movement-connection-status';
      this.element.setAttribute('role', 'status');
      this.element.setAttribute('aria-live', 'polite');
      root.append(this.element);
    }
    const text = state === 'unavailable' ? 'Соединение недоступно · обновите страницу' : state === 'waiting' ? 'Ожидание сервера · движение приостановлено' : 'Восстанавливаем соединение · движение приостановлено';
    if (this.element.textContent !== text) this.element.textContent = text;
    this.element.hidden = false;
  }
  destroy(): void { this.element?.remove(); this.element = null; this.since = null; }
}
