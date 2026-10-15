import type { ProfessionDefinition, Race } from './api.js';

export interface CreateMenuDeps {
  raceSelect: HTMLSelectElement;
  genderSelect: HTMLSelectElement;
  professionSelect: HTMLSelectElement;
  createPreviewMetaEl: HTMLElement;
  createBranchHintEl: HTMLElement | null;
  getRaces: () => Race[];
  professionLabel: (id: string) => string;
  racePortraitUrl: (
    raceId: string,
    gender: 'male' | 'female',
    portraitAsset: string | undefined,
    profession: string,
  ) => string | undefined;
  setPortraitUrl: (url: string | undefined, target: 'menu' | 'hud' | 'both') => void;
}

export function createCreateMenu(deps: CreateMenuDeps) {
  function updateCreatePreview(): void {
    const races = deps.getRaces();
    const race = races.find((r) => r.id === deps.raceSelect.value);
    const gender = deps.genderSelect.value === 'female' ? 'female' : 'male';
    const profession = deps.professionSelect.value;
    deps.setPortraitUrl(
      deps.racePortraitUrl(deps.raceSelect.value, gender, race?.portraitAsset, profession),
      'menu',
    );

    const genderLabel = gender === 'female' ? 'Женский' : 'Мужской';
    const raceName = race?.name ?? deps.raceSelect.value;
    const profName = deps.professionLabel(profession);
    deps.createPreviewMetaEl.textContent = `${raceName} · ${genderLabel} · ${profName}`;

    if (deps.createBranchHintEl) {
      if (profession === 'support') {
        const branch =
          deps.raceSelect.value === 'elf'
            ? 'эльф: подпитка MP и магбафы'
            : deps.raceSelect.value === 'orc'
              ? 'орк: только мощные бафы (без хила/MP)'
              : 'человек: хил и физбафы';
        deps.createBranchHintEl.textContent = `Саппорт: ветка зависит от расы — ${branch}.`;
      } else {
        deps.createBranchHintEl.textContent =
          'Воин / разбойник / мистик / саппорт — разные скиллы и статы.';
      }
    }
  }

  function fillSelects(races: Race[], professions: ProfessionDefinition[]): void {
    deps.raceSelect.innerHTML = races
      .map((race) => `<option value="${race.id}">${race.name}</option>`)
      .join('');
    deps.professionSelect.innerHTML = professions
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join('');
  }

  function bindPreviewListeners(): void {
    deps.raceSelect.addEventListener('change', updateCreatePreview);
    deps.genderSelect.addEventListener('change', updateCreatePreview);
    deps.professionSelect.addEventListener('change', updateCreatePreview);
  }

  return { updateCreatePreview, fillSelects, bindPreviewListeners };
}
