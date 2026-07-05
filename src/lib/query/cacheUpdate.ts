import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { patchItemUserData, type UserDataPatch } from '../jellyfin/userData';

function isItem(v: unknown): v is BaseItemDto {
  return !!v && typeof v === 'object' && typeof (v as { Id?: unknown }).Id === 'string';
}

// Returns the (possibly new) value and whether it changed.
function patchValue(value: unknown, itemId: string, patch: UserDataPatch): { value: unknown; changed: boolean } {
  if (isItem(value)) {
    return value.Id === itemId ? { value: patchItemUserData(value, patch), changed: true } : { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const r = patchValue(v, itemId, patch);
      if (r.changed) changed = true;
      return r.value;
    });
    return changed ? { value: next, changed: true } : { value, changed: false };
  }
  if (value && typeof value === 'object') {
    const obj = value as { Items?: unknown; pages?: unknown };
    if (Array.isArray(obj.Items)) {
      const r = patchValue(obj.Items, itemId, patch);
      return r.changed ? { value: { ...value, Items: r.value }, changed: true } : { value, changed: false };
    }
    if (Array.isArray(obj.pages)) {
      let changed = false;
      const pages = obj.pages.map((pg) => {
        const r = patchValue(pg, itemId, patch);
        if (r.changed) changed = true;
        return r.value;
      });
      return changed ? { value: { ...value, pages }, changed: true } : { value, changed: false };
    }
  }
  return { value, changed: false };
}

export function applyItemUserDataToCache(qc: QueryClient, itemId: string, patch: UserDataPatch): () => void {
  const prev: [QueryKey, unknown][] = [];
  for (const [key, data] of qc.getQueriesData({})) {
    const r = patchValue(data, itemId, patch);
    if (r.changed) {
      prev.push([key, data]);
      qc.setQueryData(key, r.value);
    }
  }
  return () => { for (const [key, data] of prev) qc.setQueryData(key, data); };
}
