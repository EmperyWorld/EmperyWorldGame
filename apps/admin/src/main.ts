import { api, getToken, setToken } from './api.js';
import { renderHavenMap } from './haven-map.js';

type Page =
  | 'dashboard'
  | 'saves'
  | 'online'
  | 'survival'
  | 'generators'
  | 'jobs'
  | 'encounters'
  | 'haven-map';

interface PublicAccount {
  id: string;
  username: string;
  admin?: boolean;
}

interface AdminSaveRow {
  id: string;
  name: string;
  race: string;
  profession?: string;
  level: number;
  location: string;
  accountId?: string;
  updatedAt: string;
}

interface AdminJob {
  id: string;
  kind: string;
  status: string;
  log: string[];
  error?: string;
  args: Record<string, unknown>;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  createdBy?: string;
  progress?: {
    completed: number;
    total: number;
    current?: string;
  };
}

interface AdminMediaCategoryStatus {
  id: string;
  total: number;
  ready: number;
  missing: number;
}

interface AdminMissingMedia {
  id: string;
  label: string;
  profile: string;
  category: string;
  missingFile: boolean;
  missingManifest: boolean;
}

interface AdminMediaStatus {
  total: number;
  ready: number;
  missing: number;
  categories: AdminMediaCategoryStatus[];
  missingAssets: AdminMissingMedia[];
  latestJob: AdminJob | null;
}

const app = document.getElementById('app')!;
let account: PublicAccount | null = null;
let page: Page = 'dashboard';
let selectedSaveId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let jobPollTimer: ReturnType<typeof setInterval> | null = null;

function pageFromHash(): Page {
  const candidate = window.location.hash.replace(/^#\/?/, '');
  const pages: Page[] = [
    'dashboard',
    'saves',
    'online',
    'survival',
    'generators',
    'jobs',
    'encounters',
    'haven-map',
  ];
  return pages.includes(candidate as Page) ? (candidate as Page) : 'dashboard';
}

function stopPolls(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (jobPollTimer) clearInterval(jobPollTimer);
  pollTimer = null;
  jobPollTimer = null;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function ensureSession(): Promise<boolean> {
  if (!getToken()) return false;
  try {
    const me = await api<{ account: PublicAccount }>('/api/auth/me');
    if (!me.account.admin) {
      setToken(null);
      account = null;
      return false;
    }
    account = me.account;
    return true;
  } catch {
    setToken(null);
    account = null;
    return false;
  }
}

function renderLogin(error = ''): void {
  stopPolls();
  app.innerHTML = `
    <div class="login-wrap panel">
      <h1>Empery Admin</h1>
      <p class="muted">Войдите аккаунтом с флагом admin</p>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      <form id="login-form">
        <label>Логин</label>
        <input name="username" autocomplete="username" required />
        <label>Пароль</label>
        <input name="password" type="password" autocomplete="current-password" required />
        <div class="form-actions">
          <button class="btn" type="submit">Войти</button>
        </div>
      </form>
    </div>
  `;
  const form = document.getElementById('login-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await api<{ token: string; account: PublicAccount }>('/api/auth/login', {
        method: 'POST',
        json: {
          username: String(fd.get('username') ?? ''),
          password: String(fd.get('password') ?? ''),
        },
      });
      if (!res.account.admin) {
        renderLogin('Нет прав администратора. Выдайте: pnpm admin:grant -- --user=…');
        return;
      }
      setToken(res.token);
      account = res.account;
      page = pageFromHash();
      await renderApp();
    } catch (err) {
      renderLogin(err instanceof Error ? err.message : 'Ошибка входа');
    }
  });
}

function shell(body: string): string {
  const tabs: { id: Page; label: string }[] = [
    { id: 'dashboard', label: 'Обзор' },
    { id: 'saves', label: 'Сейвы' },
    { id: 'online', label: 'Онлайн' },
    { id: 'survival', label: 'Выживание' },
    { id: 'generators', label: 'Медиа и генераторы' },
    { id: 'jobs', label: 'Операции' },
    { id: 'encounters', label: 'Энкаунтеры' },
    { id: 'haven-map', label: 'Карта Гавани' },
  ];
  return `
    <header class="app-bar">
      <h1>Empery Admin · ${esc(account?.username)}</h1>
      <nav class="tabs">
        ${tabs
          .map(
            (t) =>
              `<button type="button" data-page="${t.id}" class="${page === t.id ? 'active' : ''}">${t.label}</button>`,
          )
          .join('')}
        <button type="button" id="logout-btn" class="btn danger">Выйти</button>
      </nav>
    </header>
    <main>${body}</main>
  `;
}

function bindShell(): void {
  app.querySelectorAll<HTMLButtonElement>('nav.tabs button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextPage = btn.dataset.page as Page;
      selectedSaveId = null;
      const nextHash = `#/${nextPage}`;
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      } else {
        page = nextPage;
        void renderApp();
      }
    });
  });
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setToken(null);
    account = null;
    renderLogin();
  });
}

async function renderDashboard(): Promise<void> {
  let healthHtml = '<p class="muted">…</p>';
  let summaryHtml = '<p class="muted">…</p>';
  let mediaHtml = '<p class="muted">…</p>';
  let operationsHtml = '<p class="muted">…</p>';
  let onlineCount = '—';
  try {
    const [health, summary, online, media, operationData] = await Promise.all([
      api<{ ok: boolean; services: { service: string; ok: boolean; detail?: string }[] }>('/health'),
      api<{ items: number; skills: number; enemies: number; locations: number }>(
        '/api/admin/content/summary',
      ),
      api<{ count: number }>('/api/admin/online'),
      api<AdminMediaStatus>('/api/admin/media/status'),
      api<{ jobs: AdminJob[] }>('/api/admin/jobs?limit=10'),
    ]);
    onlineCount = String(online.count);
    healthHtml = `<ul>${health.services
      .map(
        (s) =>
          `<li>${esc(s.service)}: <span class="${s.ok ? 'ok' : 'error'}">${s.ok ? 'ok' : 'fail'}</span>${
            s.detail ? ` <span class="muted">${esc(s.detail)}</span>` : ''
          }</li>`,
      )
      .join('')}</ul>`;
    summaryHtml = `<p>items ${summary.items} · skills ${summary.skills} · enemies ${summary.enemies} · locations ${summary.locations}</p>`;
    mediaHtml = `<p><strong>${media.ready}/${media.total}</strong> готово · <span class="${media.missing ? 'error' : 'ok'}">${media.missing} отсутствует</span></p>`;
    const activeJobs = operationData.jobs.filter(
      (job) => job.status === 'queued' || job.status === 'running',
    );
    operationsHtml =
      activeJobs.length === 0
        ? '<p class="ok">Нет активных заданий</p>'
        : activeJobs
            .map(
              (job) =>
                `<p class="running"><code>${esc(job.kind)}</code> · ${
                  job.progress?.total
                    ? `${job.progress.completed}/${job.progress.total}`
                    : adminJobStatusLabel(job.status)
                }</p>`,
            )
            .join('');
  } catch (err) {
    healthHtml = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`;
  }
  app.innerHTML = shell(`
    <div class="dashboard-grid">
      <div class="panel">
        <h2>Онлайн</h2>
        <p><strong>${esc(onlineCount)}</strong> игроков</p>
      </div>
      <div class="panel">
        <h2>Контент</h2>
        ${summaryHtml}
      </div>
      <div class="panel">
        <h2>Медиа</h2>
        ${mediaHtml}
      </div>
      <div class="panel">
        <h2>Операции</h2>
        ${operationsHtml}
      </div>
    </div>
    <div class="panel">
      <h2>Health (LLM / Comfy)</h2>
      ${healthHtml}
    </div>
  `);
  bindShell();
}

async function renderSaves(): Promise<void> {
  if (selectedSaveId) {
    await renderSaveDetail(selectedSaveId);
    return;
  }
  let rows = '';
  try {
    const data = await api<{ saves: AdminSaveRow[] }>('/api/admin/saves');
    rows = data.saves
      .map(
        (s) => `
      <tr class="clickable" data-id="${esc(s.id)}">
        <td>${esc(s.name)}</td>
        <td>${esc(s.level)}</td>
        <td>${esc(s.location)}</td>
        <td class="muted">${esc(s.accountId ?? '—')}</td>
        <td class="muted">${esc(s.updatedAt.slice(0, 19))}</td>
      </tr>`,
      )
      .join('');
  } catch (err) {
    rows = `<tr><td colspan="5" class="error">${esc(err instanceof Error ? err.message : err)}</td></tr>`;
  }
  app.innerHTML = shell(`
    <div class="panel">
      <h2>Сейвы</h2>
      <table>
        <thead><tr><th>Имя</th><th>Ур.</th><th>Локация</th><th>Аккаунт</th><th>Обновлён</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted">Пусто</td></tr>'}</tbody>
      </table>
    </div>
  `);
  bindShell();
  app.querySelectorAll<HTMLTableRowElement>('tr.clickable').forEach((tr) => {
    tr.addEventListener('click', () => {
      selectedSaveId = tr.dataset.id ?? null;
      void renderApp();
    });
  });
}

async function renderSaveDetail(id: string): Promise<void> {
  let body = '';
  try {
    const { save } = await api<{ save: Record<string, unknown> }>(`/api/admin/saves/${id}`);
    body = `
      <p><button type="button" class="btn" id="back-saves">← К списку</button></p>
      <div class="panel">
        <h2>${esc(save.name)} <span class="muted">(${esc(save.id)})</span></h2>
        <p class="muted">${esc(save.race)} / ${esc(save.profession)} · loc ${esc(save.location)}</p>
        <form id="patch-form">
          <div class="row">
            <div><label>HP</label><input name="hp" type="number" value="${esc(save.hp)}" /></div>
            <div><label>MP</label><input name="mp" type="number" value="${esc(save.mp ?? 0)}" /></div>
            <div><label>XP</label><input name="xp" type="number" value="${esc(save.xp)}" /></div>
            <div><label>Level</label><input name="level" type="number" value="${esc(save.level)}" /></div>
            <div><label>Adena</label><input name="adena" type="number" value="${esc(save.adena ?? 0)}" /></div>
            <div><label>Karma</label><input name="karma" type="number" value="${esc(save.karma ?? 0)}" /></div>
            <div><label>Location</label><input name="location" value="${esc(save.location)}" /></div>
          </div>
          <button class="btn" type="submit">Сохранить патч</button>
          <span id="patch-msg" class="muted"></span>
        </form>
      </div>
      <div class="panel">
        <h2>Выдать предмет</h2>
        <form id="grant-form" class="row">
          <div><label>itemId</label><input name="itemId" required placeholder="rusty_sword" /></div>
          <div><label>count</label><input name="count" type="number" value="1" min="1" max="99" /></div>
          <div><button class="btn" type="submit">Выдать</button></div>
        </form>
        <p id="grant-msg" class="muted"></p>
        <p class="muted">Инвентарь (${(save.inventory as string[] | undefined)?.length ?? 0}): ${esc(
          ((save.inventory as string[]) ?? []).slice(-12).join(', '),
        )}</p>
      </div>
    `;
  } catch (err) {
    body = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>
      <button type="button" class="btn" id="back-saves">← Назад</button>`;
  }
  app.innerHTML = shell(body);
  bindShell();
  document.getElementById('back-saves')?.addEventListener('click', () => {
    selectedSaveId = null;
    void renderApp();
  });
  const patchForm = document.getElementById('patch-form') as HTMLFormElement | null;
  patchForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(patchForm);
    const msg = document.getElementById('patch-msg');
    try {
      await api(`/api/admin/saves/${id}`, {
        method: 'PATCH',
        json: {
          hp: Number(fd.get('hp')),
          mp: Number(fd.get('mp')),
          xp: Number(fd.get('xp')),
          level: Number(fd.get('level')),
          adena: Number(fd.get('adena')),
          karma: Number(fd.get('karma')),
          location: String(fd.get('location') ?? ''),
        },
      });
      if (msg) {
        msg.className = 'ok';
        msg.textContent = 'Сохранено';
      }
      await renderSaveDetail(id);
    } catch (err) {
      if (msg) {
        msg.className = 'error';
        msg.textContent = err instanceof Error ? err.message : 'Ошибка';
      }
    }
  });
  const grantForm = document.getElementById('grant-form') as HTMLFormElement | null;
  grantForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(grantForm);
    const msg = document.getElementById('grant-msg');
    try {
      const res = await api<{ granted: number }>(`/api/admin/saves/${id}/grant-item`, {
        method: 'POST',
        json: {
          itemId: String(fd.get('itemId') ?? ''),
          count: Number(fd.get('count') ?? 1),
        },
      });
      if (msg) {
        msg.className = 'ok';
        msg.textContent = `Выдано ×${res.granted}`;
      }
      await renderSaveDetail(id);
    } catch (err) {
      if (msg) {
        msg.className = 'error';
        msg.textContent = err instanceof Error ? err.message : 'Ошибка';
      }
    }
  });
}

async function renderOnline(): Promise<void> {
  const paint = async () => {
    let rows = '';
    try {
      const data = await api<{
        count: number;
        liveCount?: number;
        ghostCount?: number;
        players: {
          saveId: string;
          name: string;
          locationId: string;
          x: number;
          y: number;
          level: number;
          connectionStatus?: 'online' | 'disconnected';
          hp?: number;
          maxHp?: number;
        }[];
      }>('/api/admin/online');
      rows = data.players
        .map((p) => {
          const status =
            p.connectionStatus === 'disconnected' ? 'DISCONNECT' : 'online';
          const statusClass = p.connectionStatus === 'disconnected' ? 'error' : 'ok';
          const purgeBtn =
            p.connectionStatus === 'disconnected'
              ? `<button type="button" class="btn danger btn-sm" data-purge-ghost="${esc(p.saveId)}">Purge</button>`
              : '—';
          return `
        <tr>
          <td>${esc(p.name)}</td>
          <td>${esc(p.level)}</td>
          <td><span class="${statusClass}">${esc(status)}</span></td>
          <td>${esc(p.locationId)}</td>
          <td class="muted">${esc(Math.round(p.x))}, ${esc(Math.round(p.y))}</td>
          <td class="muted">${esc(p.hp ?? '—')}/${esc(p.maxHp ?? '—')}</td>
          <td class="muted">${esc(p.saveId)}</td>
          <td>${purgeBtn}</td>
        </tr>`;
        })
        .join('');
      const countEl = document.getElementById('online-count');
      if (countEl) {
        const live = data.liveCount ?? data.count;
        const ghosts = data.ghostCount ?? 0;
        countEl.textContent =
          ghosts > 0 ? `${live} live · ${ghosts} ghost` : String(live);
      }
      const tbody = document.getElementById('online-tbody');
      if (tbody) {
        tbody.innerHTML = rows || '<tr><td colspan="8" class="muted">Никого нет</td></tr>';
        tbody.querySelectorAll<HTMLButtonElement>('[data-purge-ghost]').forEach((btn) => {
          btn.onclick = () => {
            const id = btn.dataset.purgeGhost;
            if (!id) return;
            void (async () => {
              btn.disabled = true;
              try {
                await api(`/api/admin/online/${encodeURIComponent(id)}/purge-ghost`, {
                  method: 'POST',
                });
                await paint();
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Purge failed');
                btn.disabled = false;
              }
            })();
          };
        });
      }
    } catch (err) {
      const tbody = document.getElementById('online-tbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="error">${esc(
          err instanceof Error ? err.message : err,
        )}</td></tr>`;
      }
    }
  };

  app.innerHTML = shell(`
    <div class="panel">
      <h2>Онлайн · <span id="online-count">—</span></h2>
      <p class="muted">Обновление каждые 2.5 с · DISCONNECT = anti-logout grace · Purge снимает призрак сразу</p>
      <table>
        <thead><tr><th>Имя</th><th>Ур.</th><th>Статус</th><th>Локация</th><th>XY</th><th>HP</th><th>saveId</th><th></th></tr></thead>
        <tbody id="online-tbody"><tr><td colspan="8" class="muted">…</td></tr></tbody>
      </table>
    </div>
  `);
  bindShell();
  await paint();
  pollTimer = setInterval(() => void paint(), 2500);
}

function jobLogHtml(job: AdminJob | null): string {
  if (!job) return '';
  const progress =
    job.progress && job.progress.total > 0
      ? `<div class="job-progress">
          <progress value="${job.progress.completed}" max="${job.progress.total}"></progress>
          <span>${job.progress.completed} / ${job.progress.total}</span>
          ${job.progress.current ? `<small>${esc(job.progress.current)}</small>` : ''}
        </div>`
      : '';
  return `
    <p>Job <code>${esc(job.id)}</code> · ${esc(job.status)}${
      job.error ? ` · <span class="error">${esc(job.error)}</span>` : ''
    }</p>
    ${progress}
    <pre class="log">${esc(job.log.join('\n') || '(лог пуст)')}</pre>
  `;
}

const MEDIA_CATEGORY_LABELS: Record<string, string> = {
  all: 'Все медиа',
  items: 'Предметы',
  skills: 'Навыки',
  props: 'Пропы и здания',
  portraits: 'Портреты и персонажи',
  locations: 'Фоны локаций',
  terrain: 'Тайлы и поверхность',
  sprites: 'Игровые спрайты',
};

function mediaStatusHtml(status: AdminMediaStatus): string {
  const missing =
    status.missingAssets.length > 0
      ? `<details>
          <summary>Показать недостающие ассеты (${status.missing})</summary>
          <div class="missing-media-list">
            ${status.missingAssets
              .map(
                (asset) =>
                  `<div><code>${esc(asset.id)}</code> · ${esc(asset.label)}
                    <span class="muted">(${esc(asset.profile)}${
                      asset.missingFile ? ', нет WebP' : ''
                    }${asset.missingManifest ? ', нет manifest' : ''})</span>
                  </div>`,
              )
              .join('')}
          </div>
        </details>`
      : '<p class="ok">Все ассеты из каталога присутствуют.</p>';
  return `
    <div class="media-summary">
      <strong>${status.ready} / ${status.total}</strong> готово
      · <span class="${status.missing ? 'error' : 'ok'}">${status.missing} отсутствует</span>
    </div>
    <table class="media-category-table">
      <thead><tr><th>Категория</th><th>Готово</th><th>Нет</th></tr></thead>
      <tbody>
        ${status.categories
          .map(
            (category) =>
              `<tr><td>${esc(MEDIA_CATEGORY_LABELS[category.id] ?? category.id)}</td>
                <td>${category.ready} / ${category.total}</td>
                <td class="${category.missing ? 'error' : 'ok'}">${category.missing}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
    ${missing}
  `;
}

async function renderGenerators(): Promise<void> {
  app.innerHTML = shell(`
    <div class="panel">
      <h2>generate:items</h2>
      <p class="muted">Пишет content/items/generated.yaml; медиа — отдельной кнопкой</p>
      <form id="items-form">
        <div class="row">
          <div><label>count</label><input name="count" type="number" value="5" min="1" max="50" /></div>
          <div><label>rarity</label><input name="rarity" placeholder="auto / epic" /></div>
          <div><label>slot</label><input name="slot" placeholder="auto / weapon" /></div>
          <div><label>theme</label><input name="theme" placeholder="аномалия" /></div>
        </div>
        <label><input type="checkbox" name="noLlm" /> без LLM</label>
        <div class="form-actions"><button class="btn" type="submit">Запустить</button></div>
      </form>
      <div id="items-job"></div>
    </div>
    <div class="panel">
      <h2>Управление медиа</h2>
      <p class="muted">Генерация выполняется через локальный ComfyUI. Без force существующие WebP пропускаются.</p>
      <div id="media-status"><p class="muted">Проверка каталога, manifest и файлов…</p></div>
      <form id="media-form">
        <div class="row">
          <div>
            <label>Категория</label>
            <select name="category">
              ${Object.entries(MEDIA_CATEGORY_LABELS)
                .map(([id, label]) => `<option value="${id}">${esc(label)}</option>`)
                .join('')}
            </select>
          </div>
          <div><label>Префикс ID (необязательно)</label><input name="only" placeholder="prop_house_" pattern="[a-z0-9_-]*" /></div>
          <div><label><input type="checkbox" name="force" /> Перегенерировать существующие</label></div>
        </div>
        <label>Стилевой уклон (необязательно)</label>
        <textarea name="styleBias" maxlength="300" rows="3" placeholder="Например: rain-soaked northern gothic city, colder moonlight, heavier weathering"></textarea>
        <div class="form-actions row media-actions">
          <button class="btn" type="submit">Запустить выбранное</button>
          <button class="btn" id="media-missing-btn" type="button">Догенерировать недостающее</button>
          <button class="btn danger" id="media-all-btn" type="button">Перегенерировать всё</button>
        </div>
      </form>
      <div id="media-job"></div>
    </div>
  `);
  bindShell();

  const paintMediaStatus = async (): Promise<AdminMediaStatus | null> => {
    const el = document.getElementById('media-status');
    try {
      const status = await api<AdminMediaStatus>('/api/admin/media/status');
      if (el) el.innerHTML = mediaStatusHtml(status);
      return status;
    } catch (err) {
      if (el) el.innerHTML = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`;
      return null;
    }
  };

  const pollJob = (jobId: string, elId: string) => {
    if (jobPollTimer) clearInterval(jobPollTimer);
    const tick = async () => {
      try {
        const { job } = await api<{ job: AdminJob }>(`/api/admin/jobs/${jobId}`);
        const el = document.getElementById(elId);
        if (el) el.innerHTML = jobLogHtml(job);
        if (job.status === 'done' || job.status === 'error') {
          if (jobPollTimer) clearInterval(jobPollTimer);
          jobPollTimer = null;
          void paintMediaStatus();
        }
      } catch (err) {
        const el = document.getElementById(elId);
        if (el) el.innerHTML = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`;
      }
    };
    void tick();
    jobPollTimer = setInterval(() => void tick(), 1500);
  };

  const initialMediaStatus = await paintMediaStatus();
  if (
    initialMediaStatus?.latestJob &&
    (initialMediaStatus.latestJob.status === 'queued' ||
      initialMediaStatus.latestJob.status === 'running')
  ) {
    const el = document.getElementById('media-job');
    if (el) el.innerHTML = jobLogHtml(initialMediaStatus.latestJob);
    pollJob(initialMediaStatus.latestJob.id, 'media-job');
  }

  document.getElementById('items-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      const res = await api<{ job: AdminJob }>('/api/admin/generate/items', {
        method: 'POST',
        json: {
          count: Number(fd.get('count') ?? 5),
          rarity: String(fd.get('rarity') || '') || undefined,
          slot: String(fd.get('slot') || '') || undefined,
          theme: String(fd.get('theme') || '') || undefined,
          noLlm: Boolean(fd.get('noLlm')),
        },
      });
      const el = document.getElementById('items-job');
      if (el) el.innerHTML = jobLogHtml(res.job);
      pollJob(res.job.id, 'items-job');
    } catch (err) {
      const el = document.getElementById('items-job');
      if (el) el.innerHTML = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`;
    }
  });

  const startMediaGeneration = async (payload: {
    category: string;
    only?: string;
    force: boolean;
    styleBias?: string;
  }): Promise<void> => {
    try {
      const res = await api<{ job: AdminJob }>('/api/admin/generate/media', {
        method: 'POST',
        json: payload,
      });
      const el = document.getElementById('media-job');
      if (el) el.innerHTML = jobLogHtml(res.job);
      pollJob(res.job.id, 'media-job');
    } catch (err) {
      const el = document.getElementById('media-job');
      if (el) el.innerHTML = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`;
    }
  };

  document.getElementById('media-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    void startMediaGeneration({
      category: String(fd.get('category') ?? 'all'),
      only: String(fd.get('only') ?? '').trim() || undefined,
      force: Boolean(fd.get('force')),
      styleBias: String(fd.get('styleBias') ?? '').trim() || undefined,
    });
  });

  document.getElementById('media-missing-btn')?.addEventListener('click', () => {
    const form = document.getElementById('media-form') as HTMLFormElement;
    const fd = new FormData(form);
    void startMediaGeneration({
      category: 'all',
      force: false,
      styleBias: String(fd.get('styleBias') ?? '').trim() || undefined,
    });
  });

  document.getElementById('media-all-btn')?.addEventListener('click', () => {
    const form = document.getElementById('media-form') as HTMLFormElement;
    const fd = new FormData(form);
    if (!window.confirm('Перегенерировать весь медиакаталог? Это займёт длительное время.')) return;
    void startMediaGeneration({
      category: 'all',
      force: true,
      styleBias: String(fd.get('styleBias') ?? '').trim() || undefined,
    });
  });
}

function adminJobStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: 'В очереди',
    running: 'Выполняется',
    done: 'Завершено',
    error: 'Ошибка',
    cancelled: 'Отменено',
  };
  return labels[status] ?? status;
}

function adminJobStatusClass(status: string): string {
  if (status === 'done') return 'ok';
  if (status === 'error' || status === 'cancelled') return 'error';
  return status === 'running' ? 'running' : 'muted';
}

async function renderJobs(): Promise<void> {
  let selectedJobId: string | null = null;
  app.innerHTML = shell(`
    <div class="panel">
      <div class="panel-title-row">
        <div>
          <h2>Операционные задания</h2>
          <p class="muted">История текущего процесса сервера. Активные задания можно безопасно отменить.</p>
        </div>
        <button class="btn btn-sm" id="jobs-refresh" type="button">Обновить</button>
      </div>
      <div id="jobs-list"><p class="muted">Загрузка…</p></div>
    </div>
    <div class="panel" id="job-detail-panel" hidden>
      <h2>Детали задания</h2>
      <div id="job-detail"></div>
    </div>
  `);
  bindShell();

  const paint = async (): Promise<void> => {
    const listEl = document.getElementById('jobs-list');
    try {
      const { jobs } = await api<{ jobs: AdminJob[] }>('/api/admin/jobs?limit=100');
      if (listEl) {
        listEl.innerHTML =
          jobs.length === 0
            ? '<p class="muted">Заданий в текущем процессе сервера ещё нет.</p>'
            : `<table class="jobs-table">
                <thead><tr><th>Статус</th><th>Тип</th><th>Инициатор</th><th>Создано</th><th>Прогресс</th><th></th></tr></thead>
                <tbody>${jobs
                  .map((job) => {
                    const progress =
                      job.progress && job.progress.total > 0
                        ? `${job.progress.completed}/${job.progress.total}`
                        : '—';
                    const active = job.status === 'running' || job.status === 'queued';
                    return `<tr>
                      <td class="${adminJobStatusClass(job.status)}">${esc(adminJobStatusLabel(job.status))}</td>
                      <td><code>${esc(job.kind)}</code></td>
                      <td>${esc(job.createdBy ?? '—')}</td>
                      <td>${job.createdAt ? esc(new Date(job.createdAt).toLocaleString('ru-RU')) : '—'}</td>
                      <td>${progress}</td>
                      <td class="job-row-actions">
                        <button class="btn btn-sm" data-job-open="${esc(job.id)}">Лог</button>
                        ${active ? `<button class="btn btn-sm danger" data-job-cancel="${esc(job.id)}">Отменить</button>` : ''}
                      </td>
                    </tr>`;
                  })
                  .join('')}</tbody>
              </table>`;
      }

      if (selectedJobId) {
        const selected = jobs.find((job) => job.id === selectedJobId) ?? null;
        const panel = document.getElementById('job-detail-panel');
        const detail = document.getElementById('job-detail');
        if (panel) panel.hidden = !selected;
        if (detail && selected) detail.innerHTML = jobLogHtml(selected);
      }

      document.querySelectorAll<HTMLButtonElement>('[data-job-open]').forEach((button) => {
        button.onclick = () => {
          selectedJobId = button.dataset.jobOpen ?? null;
          void paint();
        };
      });
      document.querySelectorAll<HTMLButtonElement>('[data-job-cancel]').forEach((button) => {
        button.onclick = () => {
          const id = button.dataset.jobCancel;
          if (!id || !window.confirm('Остановить это задание? Уже записанные файлы не удаляются.')) return;
          button.disabled = true;
          void api<{ job: AdminJob }>(`/api/admin/jobs/${encodeURIComponent(id)}`, {
            method: 'DELETE',
          })
            .then(() => paint())
            .catch((err) => {
              if (listEl) {
                listEl.insertAdjacentHTML(
                  'afterbegin',
                  `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`,
                );
              }
            });
        };
      });
    } catch (err) {
      if (listEl) listEl.innerHTML = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`;
    }
  };

  document.getElementById('jobs-refresh')?.addEventListener('click', () => void paint());
  await paint();
  pollTimer = setInterval(() => void paint(), 2_000);
}

async function renderEncounters(): Promise<void> {
  let options = '<option value="">…</option>';
  try {
    const locs = await api<{ id: string; name?: string }[]>('/api/locations');
    // /api/locations may not require auth — if 401, fall back empty
    options = locs
      .map((l) => `<option value="${esc(l.id)}">${esc(l.name ?? l.id)}</option>`)
      .join('');
  } catch {
    /* locations may need listing another way */
  }
  app.innerHTML = shell(`
    <div class="panel">
      <h2>Сброс encounter</h2>
      <form id="reset-form" class="row">
        <div>
          <label>locationId</label>
          <select name="locationId">${options}</select>
          <input name="locationManual" placeholder="или введите id" />
        </div>
        <div><button class="btn danger" type="submit">Reset</button></div>
      </form>
      <p id="reset-msg" class="muted"></p>
    </div>
  `);
  bindShell();
  document.getElementById('reset-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const loc =
      String(fd.get('locationManual') || '').trim() || String(fd.get('locationId') || '').trim();
    const msg = document.getElementById('reset-msg');
    if (!loc) {
      if (msg) {
        msg.className = 'error';
        msg.textContent = 'Укажите locationId';
      }
      return;
    }
    try {
      const res = await api<{ reset: boolean }>(`/api/admin/encounters/${encodeURIComponent(loc)}/reset`, {
        method: 'POST',
      });
      if (msg) {
        msg.className = 'ok';
        msg.textContent = res.reset ? `Сброшен ${loc}` : `Не было активного encounter (${loc})`;
      }
    } catch (err) {
      if (msg) {
        msg.className = 'error';
        msg.textContent = err instanceof Error ? err.message : 'Ошибка';
      }
    }
  });
}

async function renderSurvivalAdmin(): Promise<void> {
  app.innerHTML = shell(`
    <div class="panel">
      <h2>Survival-Life Core</h2>
      <p class="muted">Погода общая для всего мира. Смена применяется к новым server ticks.</p>
      <p id="survival-weather" class="muted">Загрузка…</p>
      <div class="form-actions">
        <button class="btn" data-weather="clear">Ясно</button>
        <button class="btn" data-weather="rain">Дождь</button>
        <button class="btn" data-weather="storm">Гроза</button>
        <button class="btn" data-weather="heatwave">Зной</button>
        <button class="btn" data-weather="cold_snap">Холодный фронт</button>
      </div>
      <h3>Телеметрия</h3>
      <pre id="survival-telemetry" class="muted">…</pre>
      <h3>Правка vitals сейва</h3>
      <div class="form-row">
        <input id="sv-save-id" placeholder="save id" />
        <input id="sv-satiety" type="number" placeholder="сытость" />
        <input id="sv-hydration" type="number" placeholder="гидратация" />
        <label><input id="sv-clear" type="checkbox" /> сбросить условия</label>
        <button class="btn" id="sv-patch">Применить</button>
      </div>
      <p id="survival-msg"></p>
    </div>
  `);
  bindShell();
  const output = document.getElementById('survival-weather');
  const telemetryEl = document.getElementById('survival-telemetry');
  const message = document.getElementById('survival-msg');
  const render = async () => {
    try {
      const data = await api<{ weather: { name: string; id: string; temperatureDelta: number; humidity: number } }>(
        '/api/admin/survival/weather',
      );
      if (output) {
        output.textContent = `${data.weather.name} · ${data.weather.temperatureDelta >= 0 ? '+' : ''}${data.weather.temperatureDelta}°C · влажность ${data.weather.humidity}%`;
      }
      const tel = await api<{ telemetry: Record<string, number | string> }>('/api/admin/survival/telemetry');
      if (telemetryEl) telemetryEl.textContent = JSON.stringify(tel.telemetry, null, 2);
    } catch (err) {
      if (output) output.className = 'error';
      if (output) output.textContent = err instanceof Error ? err.message : 'Survival unavailable';
    }
  };
  document.getElementById('sv-patch')!.onclick = () => {
    void (async () => {
      const saveId = (document.getElementById('sv-save-id') as HTMLInputElement).value.trim();
      if (!saveId) {
        if (message) message.textContent = 'Укажи save id';
        return;
      }
      const body: Record<string, number | boolean> = {};
      const satiety = Number((document.getElementById('sv-satiety') as HTMLInputElement).value);
      const hydration = Number((document.getElementById('sv-hydration') as HTMLInputElement).value);
      if (Number.isFinite(satiety) && (document.getElementById('sv-satiety') as HTMLInputElement).value !== '') {
        body.satiety = satiety;
      }
      if (Number.isFinite(hydration) && (document.getElementById('sv-hydration') as HTMLInputElement).value !== '') {
        body.hydration = hydration;
      }
      if ((document.getElementById('sv-clear') as HTMLInputElement).checked) body.clearConditions = true;
      try {
        await api(`/api/admin/saves/${encodeURIComponent(saveId)}/survival`, {
          method: 'PATCH',
          json: body,
        });
        if (message) message.textContent = 'Vitals обновлены';
      } catch (err) {
        if (message) message.textContent = err instanceof Error ? err.message : 'Ошибка';
      }
    })();
  };
  app.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach((button) => {
    button.onclick = () => {
      void (async () => {
        button.disabled = true;
        try {
          await api('/api/admin/survival/weather', {
            method: 'POST',
            json: { id: button.dataset.weather },
          });
          if (message) {
            message.className = 'ok';
            message.textContent = 'Погода обновлена.';
          }
          await render();
        } catch (err) {
          if (message) {
            message.className = 'error';
            message.textContent = err instanceof Error ? err.message : 'Не удалось сменить погоду';
          }
        } finally {
          button.disabled = false;
        }
      })();
    };
  });
  await render();
}

async function renderApp(): Promise<void> {
  stopPolls();
  app.classList.toggle('haven-map-page', page === 'haven-map');
  if (page === 'dashboard') await renderDashboard();
  else if (page === 'saves') await renderSaves();
  else if (page === 'online') await renderOnline();
  else if (page === 'survival') await renderSurvivalAdmin();
  else if (page === 'generators') await renderGenerators();
  else if (page === 'jobs') await renderJobs();
  else if (page === 'haven-map') await renderHavenMapPage();
  else await renderEncounters();
}

async function renderHavenMapPage(): Promise<void> {
  app.innerHTML = shell('<div id="haven-map-root" class="haven-map-root"></div>');
  bindShell();
  const root = document.getElementById('haven-map-root');
  if (!root) return;
  try {
    await renderHavenMap(root);
  } catch (err) {
    root.innerHTML = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`;
  }
}

async function boot(): Promise<void> {
  if (await ensureSession()) {
    page = pageFromHash();
    await renderApp();
  }
  else renderLogin();
}

window.addEventListener('hashchange', () => {
  if (!account) return;
  page = pageFromHash();
  selectedSaveId = null;
  void renderApp();
});

boot().catch((err) => {
  app.innerHTML = `<p class="error">${esc(err instanceof Error ? err.message : err)}</p>`;
});
