/** Click on the dim overlay frame (not the inner panel) dismisses it. */

export function bindBackdropDismiss(root: HTMLElement | null, dismiss: () => void): void {
  if (!root) return;
  root.addEventListener('click', (event) => {
    if (event.target !== root) return;
    dismiss();
  });
}

export function isBackdropClick(event: Event, root: EventTarget | null): boolean {
  return event.target === root;
}
