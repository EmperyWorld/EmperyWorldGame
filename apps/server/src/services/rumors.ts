import type { PlayerActionEvent } from '@empery/world-engine';
import { worldEvents } from './world-events.js';
import { getLocation } from './locations.js';

const MAX_RUMORS = 8;

type StoredRumor = {
  text: string;
  shady: boolean;
};

const rumors: StoredRumor[] = [];

const SHADY_FALLBACK = [
  'В Переулке Шепотов снова шепчутся про чужие печати на бочках.',
  'Кто-то ночью таскал мешки мимо конюшни — без факелов.',
  'Стража делает вид, что не слышит про сделки за трактиром.',
];

function locationLabel(locationId: string): string {
  return getLocation(locationId)?.name ?? locationId;
}

function pushRumor(text: string, shady: boolean): void {
  rumors.unshift({ text, shady });
  if (rumors.length > MAX_RUMORS) rumors.pop();
}

function rumorFromAction(event: PlayerActionEvent): StoredRumor | null {
  const place = locationLabel(event.locationId);
  switch (event.action) {
    case 'CRAFT': {
      const item = typeof event.payload.itemName === 'string' ? event.payload.itemName : null;
      return {
        text: item
          ? `Слышал, в ${place} кто-то сковал ${item} — искры до сих пор пахнут.`
          : `Слышал, в ${place} устроили серьёзный крафт.`,
        shady: false,
      };
    }
    case 'COMBAT': {
      const enemy =
        (typeof event.payload.enemyName === 'string' && event.payload.enemyName) ||
        (typeof event.payload.enemyType === 'string' ? event.payload.enemyType : null);
      return {
        text: enemy
          ? `Говорят, в ${place} положили ${enemy} — кровь ещё не остыла.`
          : `Говорят, в ${place} была серьёзная драка.`,
        shady: true,
      };
    }
    case 'REST':
      return {
        text: `В трактире Гавани снова полный двор — кто-то щедро платит за отдых.`,
        shady: false,
      };
    case 'TRADE': {
      const item = typeof event.payload.itemName === 'string' ? event.payload.itemName : null;
      return {
        text: item
          ? `На рынке бойко ушёл ${item}. Деньги звенят громче обычного.`
          : `На рынке сегодня бойкая торговля.`,
        shady: false,
      };
    }
    case 'DIALOGUE':
      if (event.payload.action === 'REST_AT_INN') {
        return {
          text: `В трактире Гавани снова полный двор — кто-то щедро платит за отдых.`,
          shady: false,
        };
      }
      if (event.payload.action === 'GARDEN_WATERED') {
        return {
          text: `В общинном саду кто-то полил грядки — Илья снова улыбается.`,
          shady: false,
        };
      }
      return null;
    default:
      return null;
  }
}

worldEvents.subscribe('PLAYER_ACTION', (event) => {
  const rumor = rumorFromAction(event);
  if (rumor) pushRumor(rumor.text, rumor.shady);
});

export function getLatestRumors(): string[] {
  if (rumors.length === 0) return ['В городе подозрительно тихо...'];
  return rumors.map((r) => r.text);
}

export function getShadyRumors(): string[] {
  const shady = rumors.filter((r) => r.shady).map((r) => r.text);
  if (shady.length > 0) return shady;
  if (rumors.length > 0) return rumors.map((r) => r.text);
  return SHADY_FALLBACK;
}

/** Test helper — clears in-memory rumor buffer. */
export function resetRumorsForTests(): void {
  rumors.length = 0;
}
