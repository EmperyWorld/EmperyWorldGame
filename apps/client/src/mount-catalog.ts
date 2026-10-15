import { fetchMounts, type MountDefinition } from './api.js';

let cache: MountDefinition[] | null = null;
let loading: Promise<MountDefinition[]> | null = null;

export async function ensureMountCatalog(): Promise<MountDefinition[]> {
  if (cache) return cache;
  if (!loading) {
    loading = fetchMounts()
      .then((list) => {
        cache = list;
        return list;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export function getMountDef(id: string | null | undefined): MountDefinition | undefined {
  if (!id || !cache) return undefined;
  return cache.find((m) => m.id === id);
}

export function peekMountCatalog(): MountDefinition[] {
  return cache ?? [];
}
