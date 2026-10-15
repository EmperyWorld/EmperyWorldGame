import {
  claimOrphanSaves,
  deleteSave,
  fetchAuthMe,
  fetchOrphanSaves,
  fetchSaves,
  getAuthToken,
  loginAccount,
  logoutAccount,
  registerAccount,
  setAuthToken,
  type AuthAccount,
  type PlayerSave,
  type PlayerStats,
  type SaveSlotMeta,
} from './api.js';

const LAST_SAVE_KEY = 'empery_last_save_id';

export interface AuthMenuHost {
  getAccount: () => AuthAccount | null;
  setAccount: (account: AuthAccount | null) => void;
  getSaveSlots: () => SaveSlotMeta[];
  setSaveSlots: (slots: SaveSlotMeta[]) => void;
  getSave: () => PlayerSave | null;
  setSave: (save: PlayerSave | null) => void;
  setStats: (stats: PlayerStats | null) => void;
  raceLabel: (raceId: string) => string;
  professionLabel: (professionId: string) => string;
  loadSave: (saveId: string) => Promise<void>;
  showToast: (text: string) => void;
  /** Called when the create panel becomes visible — refresh race preview, etc. */
  onShowCreatePanel?: () => void;
}

/** Login/register, character select, and character create screens. */
export class AuthMenuController {
  private readonly els = {
    menu: document.getElementById('menu') as HTMLElement,
    authPanel: document.getElementById('auth-panel')!,
    selectPanel: document.getElementById('char-select-panel')!,
    createPanel: document.getElementById('char-create-panel')!,
    authUsername: document.getElementById('auth-username') as HTMLInputElement,
    authPassword: document.getElementById('auth-password') as HTMLInputElement,
    authError: document.getElementById('auth-error')!,
    authLoginBtn: document.getElementById('auth-login-btn') as HTMLButtonElement,
    authRegisterBtn: document.getElementById('auth-register-btn') as HTMLButtonElement,
    authLogoutBtn: document.getElementById('auth-logout-btn') as HTMLButtonElement,
    authUserLabel: document.getElementById('auth-user-label')!,
    saveList: document.getElementById('save-list')!,
    orphanSaves: document.getElementById('orphan-saves')!,
    continueBtn: document.getElementById('continue-btn') as HTMLButtonElement,
    gotoCreateBtn: document.getElementById('goto-create-btn') as HTMLButtonElement,
    createBackBtn: document.getElementById('create-back-btn') as HTMLButtonElement,
  };

  constructor(private readonly host: AuthMenuHost) {
    this.els.authLoginBtn.onclick = () => void this.handleAuthSubmit('login');
    this.els.authRegisterBtn.onclick = () => void this.handleAuthSubmit('register');
    this.els.authLogoutBtn.onclick = () => void this.handleLogout();
    this.els.gotoCreateBtn.onclick = () => this.showCreatePanel();
    this.els.createBackBtn.onclick = () => this.showSelectPanel();
    this.els.authPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleAuthSubmit('login');
      }
    });
    this.els.authUsername.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.els.authPassword.focus();
      }
    });
  }

  private setMenuView(view: 'auth' | 'select' | 'create'): void {
    this.els.menu.dataset.view = view;
  }

  async restoreSession(): Promise<void> {
    if (!getAuthToken()) {
      this.showAuthPanel();
      return;
    }
    const account = await fetchAuthMe();
    if (!account) {
      setAuthToken(null);
      this.showAuthPanel('Сессия истекла — войди снова');
      return;
    }
    this.enterAccount(account);
  }

  async refreshSaveList(): Promise<void> {
    if (!this.host.getAccount()) {
      this.els.saveList.innerHTML = '';
      this.els.orphanSaves.classList.add('hidden');
      this.els.orphanSaves.innerHTML = '';
      this.els.continueBtn.style.display = 'none';
      return;
    }
    try {
      this.host.setSaveSlots(await fetchSaves());
      this.renderSaveList();
      await this.renderOrphanSaves();
    } catch {
      this.els.saveList.innerHTML = '<p class="hint">Не удалось загрузить персонажей</p>';
      this.els.continueBtn.style.display = 'none';
    }
  }

  showAuthPanel(message = ''): void {
    this.setMenuView('auth');
    this.host.setAccount(null);
    this.els.authPanel.classList.remove('hidden');
    this.els.selectPanel.classList.add('hidden');
    this.els.createPanel.classList.add('hidden');
    this.els.authError.textContent = message;
    this.els.continueBtn.style.display = 'none';
    this.els.saveList.innerHTML = '';
    this.els.orphanSaves.classList.add('hidden');
    this.els.orphanSaves.innerHTML = '';
  }

  /** After login / return from game — character list. */
  showSelectPanel(): void {
    if (!this.host.getAccount()) {
      this.showAuthPanel();
      return;
    }
    this.setMenuView('select');
    this.els.authPanel.classList.add('hidden');
    this.els.createPanel.classList.add('hidden');
    this.els.selectPanel.classList.remove('hidden');
    void this.refreshSaveList();
  }

  showCreatePanel(): void {
    if (!this.host.getAccount()) {
      this.showAuthPanel('Сначала войди в аккаунт');
      return;
    }
    this.setMenuView('create');
    this.els.authPanel.classList.add('hidden');
    this.els.selectPanel.classList.add('hidden');
    this.els.createPanel.classList.remove('hidden');
    this.host.onShowCreatePanel?.();
  }

  private enterAccount(account: AuthAccount): void {
    this.host.setAccount(account);
    this.els.authUserLabel.textContent = account.username;
    this.els.authError.textContent = '';
    this.showSelectPanel();
  }

  private formatSaveDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  private renderSaveList(): void {
    const slots = this.host.getSaveSlots();
    this.els.saveList.innerHTML = '';
    if (slots.length === 0) {
      this.els.saveList.innerHTML =
        '<div class="save-empty">Нет персонажей.<br />Создай первого героя.</div>';
      this.els.continueBtn.style.display = 'none';
      return;
    }

    const lastId = localStorage.getItem(LAST_SAVE_KEY);
    const lastSave = slots.find((s) => s.id === lastId) ?? slots[0]!;

    this.els.continueBtn.style.display = 'block';
    this.els.continueBtn.textContent = `Продолжить: ${lastSave.name} (ур. ${lastSave.level})`;
    this.els.continueBtn.onclick = () => void this.host.loadSave(lastSave.id);

    for (const slot of slots) {
      const row = document.createElement('div');
      row.className = slot.id === lastSave.id ? 'save-row recent' : 'save-row';

      const prof = slot.profession ? this.host.professionLabel(slot.profession) : '';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${slot.name}</strong><div class="save-meta">${this.host.raceLabel(slot.race)}${prof ? ` · ${prof}` : ''} · ур. ${slot.level} · ${this.formatSaveDate(slot.updatedAt)}</div>`;
      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'save-row-actions';

      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.textContent = 'Играть';
      playBtn.onclick = () => void this.host.loadSave(slot.id);
      actions.appendChild(playBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-danger';
      deleteBtn.textContent = 'Удалить';
      deleteBtn.onclick = () => void this.removeSave(slot);
      actions.appendChild(deleteBtn);

      row.appendChild(actions);
      this.els.saveList.appendChild(row);
    }
  }

  private async renderOrphanSaves(): Promise<void> {
    this.els.orphanSaves.innerHTML = '';
    this.els.orphanSaves.classList.add('hidden');
    if (!this.host.getAccount()) return;
    let orphans: Awaited<ReturnType<typeof fetchOrphanSaves>> = [];
    try {
      orphans = await fetchOrphanSaves();
    } catch {
      return;
    }
    if (orphans.length === 0) return;

    this.els.orphanSaves.classList.remove('hidden');
    const title = document.createElement('p');
    title.className = 'orphan-title';
    title.textContent = `Старые сохранения без аккаунта (${orphans.length}) — привяжи к себе:`;
    this.els.orphanSaves.appendChild(title);

    const claimAllBtn = document.createElement('button');
    claimAllBtn.type = 'button';
    claimAllBtn.textContent = 'Привязать все';
    claimAllBtn.onclick = () => void this.claimOrphans({ all: true });
    this.els.orphanSaves.appendChild(claimAllBtn);

    for (const slot of orphans) {
      const row = document.createElement('div');
      row.className = 'save-row';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${slot.name}</strong><div class="save-meta">${this.host.raceLabel(slot.race)} · ур. ${slot.level}</div>`;
      row.appendChild(info);
      const claimBtn = document.createElement('button');
      claimBtn.type = 'button';
      claimBtn.textContent = 'Привязать';
      claimBtn.onclick = () => void this.claimOrphans({ saveId: slot.id });
      row.appendChild(claimBtn);
      this.els.orphanSaves.appendChild(row);
    }
  }

  private async claimOrphans(opts: { saveId?: string; all?: boolean }): Promise<void> {
    try {
      const claimed = await claimOrphanSaves(opts);
      if (claimed.length === 0) {
        this.host.showToast('Нечего привязывать');
        return;
      }
      this.host.showToast(
        claimed.length === 1
          ? `Привязан «${claimed[0]!.name}»`
          : `Привязано персонажей: ${claimed.length}`,
      );
      await this.refreshSaveList();
    } catch (err) {
      this.host.showToast(err instanceof Error ? err.message : 'Не удалось привязать');
    }
  }

  private async handleAuthSubmit(mode: 'login' | 'register'): Promise<void> {
    const username = this.els.authUsername.value.trim();
    const password = this.els.authPassword.value;
    this.els.authError.textContent = '';
    this.els.authLoginBtn.disabled = true;
    this.els.authRegisterBtn.disabled = true;
    try {
      const result =
        mode === 'login'
          ? await loginAccount(username, password)
          : await registerAccount(username, password);
      this.els.authPassword.value = '';
      this.enterAccount(result.account);
      this.host.showToast(
        mode === 'login' ? `С возвращением, ${result.account.username}` : 'Аккаунт создан',
      );
    } catch (err) {
      this.els.authError.textContent = err instanceof Error ? err.message : 'Ошибка входа';
    } finally {
      this.els.authLoginBtn.disabled = false;
      this.els.authRegisterBtn.disabled = false;
    }
  }

  private async handleLogout(): Promise<void> {
    await logoutAccount();
    this.host.setSave(null);
    this.host.setStats(null);
    this.host.setSaveSlots([]);
    this.showAuthPanel();
    this.host.showToast('Вышел из аккаунта');
  }

  private async removeSave(slot: SaveSlotMeta): Promise<void> {
    const ok = window.confirm(
      `Удалить персонажа «${slot.name}» (ур. ${slot.level})? Это нельзя отменить.`,
    );
    if (!ok) return;

    try {
      await deleteSave(slot.id);
      if (localStorage.getItem(LAST_SAVE_KEY) === slot.id) {
        localStorage.removeItem(LAST_SAVE_KEY);
      }
      if (this.host.getSave()?.id === slot.id) {
        this.host.setSave(null);
        this.host.setStats(null);
      }
      await this.refreshSaveList();
      this.host.showToast(`Персонаж «${slot.name}» удалён`);
    } catch {
      this.host.showToast('Не удалось удалить персонажа');
    }
  }
}
