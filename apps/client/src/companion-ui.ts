/** Puppy-only hunger / fatigue bars in the character panel. */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export interface CompanionUiHandle {
  root: HTMLElement;
  sync(companion: import('@empery/shared').CompanionState | null | undefined): void;
  destroy(): void;
}

export function mountCompanionPanel(host: HTMLElement): CompanionUiHandle {
  const root = el('div', 'companion-panel');
  root.hidden = true;
  const title = el('div', 'companion-panel__title', 'Питомец');
  const hungerRow = el('div', 'companion-panel__row');
  hungerRow.append(el('span', 'companion-panel__label', 'Голод'), el('div', 'companion-panel__bar'));
  const fatigueRow = el('div', 'companion-panel__row');
  fatigueRow.append(el('span', 'companion-panel__label', 'Усталость'), el('div', 'companion-panel__bar'));
  const actions = el('div', 'companion-panel__actions');
  const feedBtn = el('button', 'companion-panel__btn', 'Кормить (хлеб)');
  const trainBtn = el('button', 'companion-panel__btn', 'Тренировать');
  const buyBtn = el('button', 'companion-panel__btn', 'Купить щенка');
  actions.append(feedBtn, trainBtn, buyBtn);
  root.append(title, hungerRow, fatigueRow, actions);
  host.append(root);

  feedBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('empery:companion-feed', { detail: { itemId: 'bread_loaf' } }));
  });
  trainBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('empery:companion-train'));
  });
  buyBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('empery:companion-buy', { detail: { companionId: 'haven_puppy' } }));
  });

  return {
    root,
    sync(companion) {
      if (!companion || companion.kind !== 'puppy') {
        // Seagull: no indicators. Still show buy if no companion.
        if (!companion) {
          root.hidden = false;
          title.textContent = 'Питомец';
          hungerRow.hidden = true;
          fatigueRow.hidden = true;
          feedBtn.hidden = true;
          trainBtn.hidden = true;
          buyBtn.hidden = false;
          return;
        }
        root.hidden = true;
        return;
      }
      root.hidden = false;
      title.textContent = 'Щенок';
      hungerRow.hidden = false;
      fatigueRow.hidden = false;
      feedBtn.hidden = false;
      trainBtn.hidden = false;
      buyBtn.hidden = true;
      const hungerBar = hungerRow.querySelector('.companion-panel__bar') as HTMLElement;
      const fatigueBar = fatigueRow.querySelector('.companion-panel__bar') as HTMLElement;
      hungerBar.style.setProperty('--pct', `${Math.max(0, Math.min(100, companion.hunger))}%`);
      fatigueBar.style.setProperty('--pct', `${Math.max(0, Math.min(100, companion.fatigue))}%`);
    },
    destroy() {
      root.remove();
    },
  };
}
