/**
 * Dev census canvas: YAML/Tiled dump from API + the same Phaser-free tables the game imports.
 * Does not invent coordinates.
 */
import {
  havenCharSpriteAabb,
  havenEllipseAabb,
  havenPropSpriteAabb,
  havenTravelPadAabb,
  havenWorldFromTile,
  HAVEN_TRAVEL_PAD_DEFAULT_RADIUS,
} from '@empery/shared';
import { ALL_CITIZEN_DEFS } from '../../client/src/sprites/haven-ambient-defs.js';
import { resolveCitizenDistrictNpcId } from '../../client/src/sprites/haven-citizen-district.js';
import { HAVEN_CITY_BANNER } from '../../client/src/sprites/haven-city-data.js';
import { HAVEN_TILE_WASHES } from '../../client/src/sprites/haven-district-washes.js';
import { HAVEN_DISTRICTS, HAVEN_NPC_BUILDINGS } from '../../client/src/sprites/haven-npc-buildings.js';
import { api } from './api.js';

type HavenMapDump = {
  locationId: string;
  name: string;
  mapW: number;
  mapH: number;
  tileW: number;
  tilesW: number;
  tilesH: number;
  sources?: string[];
  propsRevision: string;
  spawn: { x: number; y: number; source: string };
  tiles: { width: number; height: number; tileSize: number; data: number[] };
  props: HavenPropPlacement[];
  npcs: Array<{
    id: string;
    x: number;
    y: number;
    label: string;
    source: string;
    postMatch: boolean | null;
  }>;
  homes: Array<{ x: number; y: number }>;
  guardPatrol: Array<{ x: number; y: number }>;
  zones: Array<{
    x: number;
    y: number;
    label: string;
    travelTo?: string;
    radius?: number;
  }>;
  stations?: Array<{ id: string; kind: string; x: number; y: number; radius?: number }>;
  landmarks?: Array<{ id: string; kind: string; x: number; y: number }>;
  runtimeAnchors: Array<{
    id: string;
    x: number;
    y: number;
    note: string;
    source: string;
    size?: number;
    w?: number;
    h?: number;
  }>;
};

type HavenPropPlacement = [id: string, x: number, y: number, size: number, depth: number];

type LayerId =
  | 'tiles'
  | 'washes'
  | 'districts'
  | 'props'
  | 'buildings'
  | 'npcs'
  | 'citizens'
  | 'zones'
  | 'stations'
  | 'landmarks'
  | 'homes'
  | 'patrol'
  | 'anchors';

const LAYER_LABEL: Record<LayerId, string> = {
  tiles: 'Тайлы GID',
  washes: 'Ореолы tx,ty',
  districts: 'HAVEN_DISTRICTS',
  props: 'HAVEN_CITY_PROPS',
  buildings: 'Колоссы NPC',
  npcs: 'YAML NPC',
  citizens: 'Ambient defs',
  zones: 'Зоны / travel pad',
  stations: 'YAML stations',
  landmarks: 'YAML landmarks',
  homes: 'Дома NPC',
  patrol: 'Патруль Леона',
  anchors: 'Hardcoded place*',
};

const GID_FILL: Record<number, string> = {
  1: '#2d4a32',
  2: '#6a6050',
  3: '#1a3048',
  4: '#3a3a42',
};

let layers: Record<LayerId, boolean> = {
  tiles: true,
  washes: true,
  districts: true,
  props: true,
  buildings: true,
  npcs: true,
  citizens: true,
  zones: true,
  stations: true,
  landmarks: true,
  homes: true,
  patrol: true,
  anchors: true,
};

let dump: HavenMapDump | null = null;
let hover = '';
let editableProps: HavenPropPlacement[] = [];
let selectedPropIndex: number | null = null;

function hexColor(n: number, alpha: number): string {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  scale: number,
): void {
  ctx.beginPath();
  ctx.ellipse(cx * scale, cy * scale, (w / 2) * scale, (h / 2) * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

export async function renderHavenMap(host: HTMLElement): Promise<void> {
  host.innerHTML = '<p class="muted">грузим фактический dump…</p>';
  dump = await api<HavenMapDump>('/api/admin/debug/haven-map');
  editableProps = dump.props.map((row) => [...row]);
  selectedPropIndex = null;
  const baseScale = Math.min(1100 / dump.mapW, 760 / dump.mapH);
  let scale = baseScale;
  let cw = Math.round(dump.mapW * scale);
  let ch = Math.round(dump.mapH * scale);

  const layerChecks = (Object.keys(LAYER_LABEL) as LayerId[])
    .map(
      (id) =>
        `<label class="haven-layer"><input type="checkbox" data-layer="${id}" ${
          layers[id] ? 'checked' : ''
        }/> ${LAYER_LABEL[id]}</label>`,
    )
    .join('');
  const propIdOptions = [...new Set(editableProps.map((row) => row[0]))]
    .sort()
    .map((id) => `<option value="${id}"></option>`)
    .join('');

  host.innerHTML = `
    <div class="panel haven-map-toolbar">
      <h2>Карта Гавани · факт, не догадка</h2>
      <p class="muted">${dump.tilesW}×${dump.tilesH} тайлов · ${dump.mapW}×${dump.mapH} px · тайл ${dump.tileW} · YAML NPC ${dump.npcs.length} · props <span id="haven-prop-count">${editableProps.length}</span> · ambient ${ALL_CITIZEN_DEFS.length}</p>
      <p class="muted">world = tx×64+32 (центр тайла). YAML уже в пикселях. Проп origin 0.5/0.72 — спрайт севернее точки. Travel pad: (x, y+40), не круг radius.</p>
      <div class="haven-editor-view">
        <label>Масштаб <input id="haven-zoom" type="range" min="50" max="300" step="25" value="100" /></label>
        <label>Привязка
          <select id="haven-snap"><option value="1">1 px</option><option value="8" selected>8 px</option><option value="16">16 px</option><option value="32">32 px</option><option value="64">64 px</option></select>
        </label>
        <button class="btn btn-sm" id="haven-undo" type="button" disabled>↶ Undo</button>
        <button class="btn btn-sm" id="haven-redo" type="button" disabled>↷ Redo</button>
        <span id="haven-collision-status" class="muted">Пересечения: проверка…</span>
      </div>
      <div class="haven-layers">${layerChecks}</div>
      <div class="haven-prop-editor">
        <div><label>ID</label><input id="haven-prop-id" list="haven-prop-ids" value="prop_crate_stack" pattern="prop_[a-z0-9_]+" /><datalist id="haven-prop-ids">${propIdOptions}</datalist></div>
        <div><label>X</label><input id="haven-prop-x" type="number" min="0" max="${dump.mapW}" step="1" /></div>
        <div><label>Y</label><input id="haven-prop-y" type="number" min="0" max="${dump.mapH}" step="1" /></div>
        <div><label>Размер</label><input id="haven-prop-size" type="number" min="16" max="1024" value="96" /></div>
        <div><label>Depth</label><input id="haven-prop-depth" type="number" min="-100" max="100" value="6" /></div>
        <button class="btn btn-sm" id="haven-prop-apply" type="button">Применить</button>
        <button class="btn btn-sm" id="haven-prop-find" type="button">Найти следующий ID</button>
        <button class="btn btn-sm" id="haven-prop-add" type="button">Добавить в точку</button>
        <button class="btn btn-sm" id="haven-prop-copy" type="button">Дублировать</button>
        <button class="btn btn-sm danger" id="haven-prop-delete" type="button">Удалить</button>
        <button class="btn" id="haven-prop-save" type="button">Сохранить и пересобрать карту</button>
        <button class="btn btn-sm" id="haven-prop-reload" type="button">Отменить локальные правки</button>
      </div>
      <p class="muted">Выберите проп кликом и перетаскивайте мышью. «Добавить» использует последнюю точку клика. Сохранение создаёт устойчивый override и запускает generate:maps.</p>
      <p id="haven-save-status" class="muted"></p>
      <p id="haven-hover" class="muted">${hover || 'клик по карте — кто в этой точке'}</p>
    </div>
    <canvas id="haven-map-canvas" width="${cw}" height="${ch}" tabindex="0"></canvas>
  `;

  const canvas = host.querySelector<HTMLCanvasElement>('#haven-map-canvas')!;
  const hoverEl = host.querySelector<HTMLParagraphElement>('#haven-hover')!;
  let collisionIndexes = new Set<number>();

  const recomputeCollisions = (): number => {
    const next = new Set<number>();
    if (selectedPropIndex == null) {
      collisionIndexes = next;
      return 0;
    }
    const selected = editableProps[selectedPropIndex];
    if (!selected) {
      collisionIndexes = next;
      return 0;
    }
    const selectedBox = havenPropSpriteAabb(selected[1], selected[2], selected[3]);
    for (let i = 0; i < editableProps.length; i++) {
      if (i === selectedPropIndex) continue;
      const row = editableProps[i]!;
      const box = havenPropSpriteAabb(row[1], row[2], row[3]);
      if (
        selectedBox.R <= box.L ||
        selectedBox.L >= box.R ||
        selectedBox.B <= box.T ||
        selectedBox.T >= box.B
      ) {
        continue;
      }
      next.add(selectedPropIndex);
      next.add(i);
    }
    collisionIndexes = next;
    return Math.max(0, next.size - 1);
  };
  let collisionPairs = recomputeCollisions();

  const paint = (): void => {
    const ctx = canvas.getContext('2d');
    const map = dump;
    if (!ctx || !map) return;
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, cw, ch);

    if (layers.tiles) {
      const { width, data } = map.tiles;
      const tw = map.tileW * scale;
      for (let i = 0; i < data.length; i++) {
        const gid = data[i] ?? 0;
        const fill = GID_FILL[gid];
        if (!fill) continue;
        const tx = i % width;
        const ty = Math.floor(i / width);
        ctx.fillStyle = fill;
        ctx.fillRect(tx * tw, ty * tw, tw + 0.5, tw + 0.5);
      }
    }

    if (layers.washes) {
      for (const w of HAVEN_TILE_WASHES) {
        const c = havenWorldFromTile(w.tx, w.ty, map.tileW);
        ctx.fillStyle = hexColor(w.color, Math.max(0.18, w.a * 2));
        drawEllipse(ctx, c.x, c.y, w.w, w.h, scale);
      }
    }

    if (layers.districts) {
      for (const d of HAVEN_DISTRICTS) {
        ctx.fillStyle = hexColor(d.color, Math.max(0.2, d.alpha * 1.4));
        drawEllipse(ctx, d.x, d.y, d.w, d.h, scale);
        ctx.fillStyle = d.bannerColor;
        ctx.font = '11px sans-serif';
        ctx.fillText(d.label, d.signX * scale, d.signY * scale);
      }
    }

    if (layers.props) {
      ctx.fillStyle = 'rgba(180,180,160,0.35)';
      for (let i = 0; i < editableProps.length; i++) {
        const row = editableProps[i]!;
        const [, x, y, size] = row;
        const box = havenPropSpriteAabb(x, y, size);
        ctx.fillStyle =
          i === selectedPropIndex
            ? 'rgba(107,159,255,0.78)'
            : collisionIndexes.has(i)
              ? 'rgba(224,112,112,0.62)'
              : 'rgba(180,180,160,0.35)';
        ctx.fillRect(box.L * scale, box.T * scale, (box.R - box.L) * scale, (box.B - box.T) * scale);
        if (i === selectedPropIndex) {
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(
            box.L * scale,
            box.T * scale,
            (box.R - box.L) * scale,
            (box.B - box.T) * scale,
          );
        }
      }
    }

    if (layers.buildings) {
      for (const b of HAVEN_NPC_BUILDINGS) {
        const box = havenPropSpriteAabb(b.x, b.y, b.size);
        ctx.fillStyle = 'rgba(200,160,80,0.55)';
        ctx.fillRect(box.L * scale, box.T * scale, (box.R - box.L) * scale, (box.B - box.T) * scale);
        ctx.fillStyle = '#f0d080';
        ctx.fillRect(b.x * scale - 2, b.y * scale - 2, 4, 4);
      }
    }

    if (layers.citizens) {
      for (const def of ALL_CITIZEN_DEFS) {
        const [tx, ty] = def.tiles[0] ?? [0, 0];
        const c = havenWorldFromTile(tx, ty, map.tileW);
        ctx.fillStyle = def.nightPatrolOnly ? '#88c8ff' : '#d0e8c0';
        ctx.beginPath();
        ctx.arc(c.x * scale, c.y * scale, 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (def.tiles.length > 1) {
          ctx.strokeStyle = 'rgba(200,220,180,0.35)';
          ctx.beginPath();
          def.tiles.forEach((t, i) => {
            const p = havenWorldFromTile(t[0], t[1], map.tileW);
            if (i === 0) ctx.moveTo(p.x * scale, p.y * scale);
            else ctx.lineTo(p.x * scale, p.y * scale);
          });
          ctx.stroke();
        }
      }
    }

    if (layers.homes) {
      ctx.fillStyle = '#a070ff';
      for (const h of map.homes) {
        ctx.fillRect(h.x * scale - 2, h.y * scale - 2, 4, 4);
      }
    }

    if (layers.patrol && map.guardPatrol.length > 1) {
      ctx.strokeStyle = '#e8c878';
      ctx.beginPath();
      map.guardPatrol.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * scale, p.y * scale);
        else ctx.lineTo(p.x * scale, p.y * scale);
      });
      ctx.stroke();
    }

    if (layers.zones) {
      for (const z of map.zones) {
        ctx.strokeStyle = z.travelTo ? '#6bcf8e' : '#9aa3b5';
        ctx.beginPath();
        if (z.travelTo) {
          const pad = havenTravelPadAabb(z.x, z.y, z.radius ?? HAVEN_TRAVEL_PAD_DEFAULT_RADIUS);
          ctx.strokeRect(pad.L * scale, pad.T * scale, (pad.R - pad.L) * scale, (pad.B - pad.T) * scale);
        } else {
          const r = z.radius ?? 40;
          ctx.arc(z.x * scale, z.y * scale, r * scale, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.fillStyle = '#e6e8ee';
        ctx.font = '10px sans-serif';
        ctx.fillText(z.label, z.x * scale + 4, z.y * scale - 4);
      }
    }

    if (layers.stations) {
      ctx.strokeStyle = '#c89050';
      for (const s of map.stations ?? []) {
        ctx.beginPath();
        ctx.arc(s.x * scale, s.y * scale, (s.radius ?? 24) * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#c89050';
        ctx.font = '9px sans-serif';
        ctx.fillText(s.kind, s.x * scale + 4, s.y * scale);
      }
    }

    if (layers.landmarks) {
      ctx.fillStyle = '#88c8a0';
      for (const lm of map.landmarks ?? []) {
        ctx.fillRect(lm.x * scale - 3, lm.y * scale - 3, 6, 6);
      }
    }

    if (layers.anchors) {
      ctx.fillStyle = '#ff6b6b';
      for (const a of map.runtimeAnchors) {
        if (a.w != null && a.h != null) {
          ctx.strokeStyle = '#ff6b6b';
          ctx.strokeRect(a.x * scale, a.y * scale, a.w * scale, a.h * scale);
        } else if (a.size != null) {
          const box = havenPropSpriteAabb(a.x, a.y, a.size);
          ctx.strokeStyle = '#ff6b6b';
          ctx.strokeRect(box.L * scale, box.T * scale, (box.R - box.L) * scale, (box.B - box.T) * scale);
        }
        ctx.fillRect(a.x * scale - 3, a.y * scale - 3, 6, 6);
      }
      const bb = havenPropSpriteAabb(HAVEN_CITY_BANNER.x, HAVEN_CITY_BANNER.y, 40);
      ctx.strokeStyle = '#ffcc88';
      ctx.strokeRect(bb.L * scale, bb.T * scale, (bb.R - bb.L) * scale, (bb.B - bb.T) * scale);
      ctx.fillStyle = '#ffcc88';
      ctx.fillRect(map.spawn.x * scale - 4, map.spawn.y * scale - 4, 8, 8);
    }

    if (layers.npcs) {
      for (const n of map.npcs) {
        const box = havenCharSpriteAabb(n.x, n.y);
        ctx.fillStyle = n.postMatch === false ? '#e07070' : '#6b9fff';
        ctx.fillRect(box.L * scale, box.T * scale, (box.R - box.L) * scale, (box.B - box.T) * scale);
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.fillText(n.id.replace('town_', ''), n.x * scale + 4, n.y * scale);
      }
    }
  };

  paint();

  host.querySelectorAll<HTMLInputElement>('input[data-layer]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.layer as LayerId;
      layers = { ...layers, [id]: el.checked };
      paint();
    });
  });

  const idInput = host.querySelector<HTMLInputElement>('#haven-prop-id')!;
  const xInput = host.querySelector<HTMLInputElement>('#haven-prop-x')!;
  const yInput = host.querySelector<HTMLInputElement>('#haven-prop-y')!;
  const sizeInput = host.querySelector<HTMLInputElement>('#haven-prop-size')!;
  const depthInput = host.querySelector<HTMLInputElement>('#haven-prop-depth')!;
  const saveStatus = host.querySelector<HTMLParagraphElement>('#haven-save-status')!;
  const propCount = host.querySelector<HTMLElement>('#haven-prop-count')!;
  const collisionStatus = host.querySelector<HTMLElement>('#haven-collision-status')!;
  const undoButton = host.querySelector<HTMLButtonElement>('#haven-undo')!;
  const redoButton = host.querySelector<HTMLButtonElement>('#haven-redo')!;
  const saveButton = host.querySelector<HTMLButtonElement>('#haven-prop-save')!;
  const snapSelect = host.querySelector<HTMLSelectElement>('#haven-snap')!;
  const zoomInput = host.querySelector<HTMLInputElement>('#haven-zoom')!;
  const undoStack: HavenPropPlacement[][] = [];
  const redoStack: HavenPropPlacement[][] = [];
  let lastPoint = { x: dump.mapW / 2, y: dump.mapH / 2 };
  let dragging = false;
  let dragStarted = false;
  let dirty = false;

  const cloneProps = (): HavenPropPlacement[] => editableProps.map((row) => [...row]);
  const refreshEditorState = (repaint = true): void => {
    collisionPairs = recomputeCollisions();
    collisionStatus.textContent =
      selectedPropIndex == null
        ? 'Выберите объект для проверки пересечений'
        : `Пересечения выбранного AABB: ${collisionPairs}`;
    collisionStatus.className = collisionPairs > 0 ? 'error' : 'ok';
    propCount.textContent = String(editableProps.length);
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
    saveButton.disabled = !dirty;
    if (repaint) paint();
  };
  const beginEdit = (): void => {
    undoStack.push(cloneProps());
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
    dirty = true;
    saveStatus.textContent = 'Есть несохранённые изменения.';
    saveStatus.className = 'muted';
  };
  const restoreProps = (snapshot: HavenPropPlacement[]): void => {
    editableProps = snapshot.map((row) => [...row]);
    if (selectedPropIndex != null && selectedPropIndex >= editableProps.length) {
      selectedPropIndex = null;
    }
    syncEditor();
    refreshEditorState();
  };

  const worldPoint = (ev: MouseEvent | PointerEvent): { x: number; y: number } => {
    const map = dump!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((ev.clientX - rect.left) / rect.width) * map.mapW),
      y: Math.round(((ev.clientY - rect.top) / rect.height) * map.mapH),
    };
  };

  const syncEditor = (): void => {
    const selected =
      selectedPropIndex == null ? undefined : editableProps[selectedPropIndex];
    if (!selected) return;
    idInput.value = selected[0];
    xInput.value = String(selected[1]);
    yInput.value = String(selected[2]);
    sizeInput.value = String(selected[3]);
    depthInput.value = String(selected[4]);
  };

  const readEditorRow = (): HavenPropPlacement | null => {
    if (
      !idInput.checkValidity() ||
      !xInput.checkValidity() ||
      !yInput.checkValidity() ||
      !sizeInput.checkValidity() ||
      !depthInput.checkValidity()
    ) {
      saveStatus.textContent = 'Проверьте ID и числовые границы.';
      saveStatus.className = 'error';
      return null;
    }
    return [
      idInput.value.trim(),
      Math.round(xInput.valueAsNumber),
      Math.round(yInput.valueAsNumber),
      Math.round(sizeInput.valueAsNumber),
      Math.round(depthInput.valueAsNumber),
    ];
  };

  const selectPropAt = (x: number, y: number): number | null => {
    for (let i = editableProps.length - 1; i >= 0; i--) {
      const row = editableProps[i]!;
      const box = havenPropSpriteAabb(row[1], row[2], row[3]);
      if (x >= box.L && x <= box.R && y >= box.T && y <= box.B) return i;
    }
    return null;
  };
  refreshEditorState(false);

  const snapValue = (value: number): number => {
    const step = Math.max(1, Number.parseInt(snapSelect.value, 10) || 1);
    return Math.round(value / step) * step;
  };

  zoomInput.addEventListener('input', () => {
    const multiplier = Math.max(0.5, Math.min(3, zoomInput.valueAsNumber / 100));
    scale = baseScale * multiplier;
    cw = Math.round(dump!.mapW * scale);
    ch = Math.round(dump!.mapH * scale);
    canvas.width = cw;
    canvas.height = ch;
    paint();
  });

  undoButton.addEventListener('click', () => {
    const previous = undoStack.pop();
    if (!previous) return;
    redoStack.push(cloneProps());
    dirty = true;
    restoreProps(previous);
  });

  redoButton.addEventListener('click', () => {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(cloneProps());
    dirty = true;
    restoreProps(next);
  });

  canvas.addEventListener('pointerdown', (ev) => {
    if (!layers.props) return;
    const point = worldPoint(ev);
    lastPoint = point;
    selectedPropIndex = selectPropAt(point.x, point.y);
    dragging = selectedPropIndex != null;
    dragStarted = false;
    if (dragging) canvas.setPointerCapture(ev.pointerId);
    canvas.focus();
    syncEditor();
    refreshEditorState();
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging || selectedPropIndex == null) return;
    const point = worldPoint(ev);
    lastPoint = point;
    const row = editableProps[selectedPropIndex];
    if (!row) return;
    if (!dragStarted) {
      beginEdit();
      dragStarted = true;
    }
    row[1] = snapValue(point.x);
    row[2] = snapValue(point.y);
    syncEditor();
    refreshEditorState();
  });

  const stopDragging = (ev: PointerEvent): void => {
    dragging = false;
    if (dragStarted) refreshEditorState();
    dragStarted = false;
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
  };
  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);

  host.querySelector<HTMLButtonElement>('#haven-prop-apply')!.addEventListener('click', () => {
    if (selectedPropIndex == null) return;
    const row = readEditorRow();
    if (!row) return;
    beginEdit();
    editableProps[selectedPropIndex] = row;
    refreshEditorState();
  });

  host.querySelector<HTMLButtonElement>('#haven-prop-find')!.addEventListener('click', () => {
    const id = idInput.value.trim();
    if (!id) return;
    const start = selectedPropIndex == null ? 0 : selectedPropIndex + 1;
    let found = editableProps.findIndex((row, index) => index >= start && row[0] === id);
    if (found < 0) found = editableProps.findIndex((row) => row[0] === id);
    if (found < 0) {
      saveStatus.textContent = `ID ${id} не найден на карте.`;
      saveStatus.className = 'error';
      return;
    }
    selectedPropIndex = found;
    syncEditor();
    refreshEditorState();
  });

  host.querySelector<HTMLButtonElement>('#haven-prop-add')!.addEventListener('click', () => {
    xInput.value = String(lastPoint.x);
    yInput.value = String(lastPoint.y);
    const row = readEditorRow();
    if (!row) return;
    beginEdit();
    editableProps.push(row);
    selectedPropIndex = editableProps.length - 1;
    syncEditor();
    refreshEditorState();
  });

  host.querySelector<HTMLButtonElement>('#haven-prop-copy')!.addEventListener('click', () => {
    if (selectedPropIndex == null) return;
    const source = editableProps[selectedPropIndex];
    if (!source) return;
    beginEdit();
    editableProps.push([source[0], source[1] + 32, source[2] + 32, source[3], source[4]]);
    selectedPropIndex = editableProps.length - 1;
    syncEditor();
    refreshEditorState();
  });

  host.querySelector<HTMLButtonElement>('#haven-prop-delete')!.addEventListener('click', () => {
    if (selectedPropIndex == null) return;
    beginEdit();
    editableProps.splice(selectedPropIndex, 1);
    selectedPropIndex = null;
    refreshEditorState();
  });

  canvas.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      (ev.shiftKey ? redoButton : undoButton).click();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
      ev.preventDefault();
      redoButton.click();
      return;
    }
    if (selectedPropIndex == null) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      host.querySelector<HTMLButtonElement>('#haven-prop-delete')!.click();
      return;
    }
    const delta: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = delta[ev.key];
    const row = editableProps[selectedPropIndex];
    if (!move || !row) return;
    ev.preventDefault();
    beginEdit();
    const step = Math.max(1, Number.parseInt(snapSelect.value, 10) || 1);
    const multiplier = ev.shiftKey ? 4 : 1;
    row[1] = Math.max(0, Math.min(dump!.mapW, row[1] + move[0] * step * multiplier));
    row[2] = Math.max(0, Math.min(dump!.mapH, row[2] + move[1] * step * multiplier));
    syncEditor();
    refreshEditorState();
  });

  host.querySelector<HTMLButtonElement>('#haven-prop-reload')!.addEventListener('click', () => {
    if (dirty && !window.confirm('Отменить все несохранённые изменения карты?')) return;
    void renderHavenMap(host);
  });

  saveButton.addEventListener('click', async () => {
    const map = dump;
    if (!map) return;
    saveStatus.textContent = 'Сохраняю override и пересобираю карту…';
    saveStatus.className = 'muted';
    try {
      const result = await api<{ revision: string; count: number }>(
        '/api/admin/debug/haven-map/props',
        {
          method: 'PUT',
          json: {
            expectedRevision: map.propsRevision,
            placements: editableProps,
          },
        },
      );
      map.propsRevision = result.revision;
      dirty = false;
      undoStack.length = 0;
      redoStack.length = 0;
      refreshEditorState();
      saveStatus.textContent = `Сохранено ${result.count} объектов. Перезапустите клиент для применения.`;
      saveStatus.className = 'ok';
    } catch (err) {
      saveStatus.textContent = err instanceof Error ? err.message : String(err);
      saveStatus.className = 'error';
    }
  });

  canvas.addEventListener('click', (ev) => {
    const map = dump;
    if (!map) return;
    const rect = canvas.getBoundingClientRect();
    const wx = ((ev.clientX - rect.left) / rect.width) * map.mapW;
    const wy = ((ev.clientY - rect.top) / rect.height) * map.mapH;
    const hits: string[] = [];
    hits.push(
      `world (${wx.toFixed(0)}, ${wy.toFixed(0)}) tile (${Math.floor(wx / map.tileW)}, ${Math.floor(wy / map.tileW)})`,
    );
    if (Math.hypot(map.spawn.x - wx, map.spawn.y - wy) < 48) {
      hits.push(`spawn ${map.spawn.x},${map.spawn.y} ${map.spawn.source}`);
    }
    const propIndex = selectPropAt(wx, wy);
    if (propIndex != null) {
      const prop = editableProps[propIndex]!;
      hits.push(
        `prop#${propIndex} ${prop[0]} (${prop[1]},${prop[2]}) size=${prop[3]} depth=${prop[4]}`,
      );
    }
    for (const n of map.npcs) {
      if (Math.hypot(n.x - wx, n.y - wy) < 48) {
        hits.push(`NPC ${n.id} yaml:${n.x},${n.y} source=${n.source} postMatch=${n.postMatch}`);
      }
    }
    for (const b of HAVEN_NPC_BUILDINGS) {
      const box = havenPropSpriteAabb(b.x, b.y, b.size);
      if (wx >= box.L && wx <= box.R && wy >= box.T && wy <= box.B) {
        hits.push(`building ${b.prop} origin ${b.x},${b.y} source=haven-npc-buildings.ts`);
      }
    }
    for (const d of HAVEN_DISTRICTS) {
      const box = havenEllipseAabb(d.x, d.y, d.w, d.h);
      if (wx >= box.L && wx <= box.R && wy >= box.T && wy <= box.B) {
        hits.push(`district ${d.label} ellipse ${d.x},${d.y} ${d.w}×${d.h}`);
      }
    }
    ALL_CITIZEN_DEFS.forEach((def, i) => {
      const [tx, ty] = def.tiles[0] ?? [0, 0];
      const c = havenWorldFromTile(tx, ty, map.tileW);
      if (Math.hypot(c.x - wx, c.y - wy) < 36) {
        const dist = resolveCitizenDistrictNpcId(def, i);
        hits.push(`ambient#${i} ${def.look} tile ${tx},${ty} → ${dist.label} (${dist.npcId})`);
      }
    });
    for (const z of map.zones) {
      if (z.travelTo) {
        const pad = havenTravelPadAabb(z.x, z.y, z.radius ?? HAVEN_TRAVEL_PAD_DEFAULT_RADIUS);
        if (wx >= pad.L && wx <= pad.R && wy >= pad.T && wy <= pad.B) {
          hits.push(`travel ${z.label} → ${z.travelTo} yaml:(${z.x},${z.y}) pad y+40`);
        }
      } else if (Math.hypot(z.x - wx, z.y - wy) < (z.radius ?? 40)) {
        hits.push(`zone ${z.label} yaml:(${z.x},${z.y})`);
      }
    }
    for (const s of map.stations ?? []) {
      if (Math.hypot(s.x - wx, s.y - wy) < (s.radius ?? 28)) {
        hits.push(`station ${s.id} ${s.kind} ${s.x},${s.y}`);
      }
    }
    for (const a of map.runtimeAnchors) {
      const hitRect =
        a.w != null && a.h != null
          ? wx >= a.x && wx <= a.x + a.w && wy >= a.y && wy <= a.y + a.h
          : Math.hypot(a.x - wx, a.y - wy) < 64;
      if (hitRect) hits.push(`anchor ${a.id} ${a.note} ${a.source}`);
    }
    hoverEl.textContent = hits.slice(0, 12).join(' · ');
  });
}
