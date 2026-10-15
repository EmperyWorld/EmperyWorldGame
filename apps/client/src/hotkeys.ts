/**
 * Layout-independent hotkeys via KeyboardEvent.code (KeyI / Digit1 / …).
 * e.key зависит от раскладки (I→«ш»), code — от физической клавиши.
 */

export function isLetterHotkey(e: KeyboardEvent, letter: string): boolean {
  if (letter.length !== 1) return false;
  return e.code === `Key${letter.toUpperCase()}`;
}

export function isDigitHotkey(e: KeyboardEvent, digit: number): boolean {
  if (digit < 0 || digit > 9) return false;
  return e.code === `Digit${digit}` || e.code === `Numpad${digit}`;
}

export function isEnterHotkey(e: KeyboardEvent): boolean {
  return e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter';
}

export function isEscapeHotkey(e: KeyboardEvent): boolean {
  return e.code === 'Escape' || e.key === 'Escape';
}

export function isSlashHotkey(e: KeyboardEvent): boolean {
  return e.code === 'Slash' || e.key === '/';
}

/** Поле ввода / чат — не глотать игровые хоткеи. */
export function isTypingTarget(el: Element | null = document.activeElement): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
