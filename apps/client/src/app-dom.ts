function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

/** Static DOM handles for the client shell. */
export const dom = {
  menu: el('menu'),
  menuBg: el('menu-bg'),
  gameplayShell: el('gameplay-shell'),
  raceSelect: el<HTMLSelectElement>('race-select'),
  genderSelect: el<HTMLSelectElement>('gender-select'),
  professionSelect: el<HTMLSelectElement>('profession-select'),
  playerNameInput: el<HTMLInputElement>('player-name'),
  startBtn: el<HTMLButtonElement>('start-btn'),
  continueBtn: el<HTMLButtonElement>('continue-btn'),
  deathScreen: el('death-screen'),
  inventoryEl: el('inventory'),
  travelEl: el('travel'),
  shopEl: el('shop'),
  forgeEl: el('forge'),
  housingEl: el('housing'),
  stationEl: el('station'),
  radioEl: el('radio'),
  radioCallEl: el('radio-call'),
  skillsEl: el('skills'),
  settingsEl: el('settings'),
  toastEl: el('toast-log'),
  chatPanelEl: el('chat-panel'),
  partyPanelEl: el('party-panel'),
  targetActionsEl: el('hud-target-actions'),
  hudPortraitEl: el<HTMLImageElement>('hud-portrait'),
  menuPortraitEl: el<HTMLImageElement>('menu-portrait'),
  createPreviewMetaEl: el('create-preview-meta'),
  createBranchHintEl: document.getElementById('create-branch-hint'),
} as const;
