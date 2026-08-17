import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

// Concrete media items are downloadable; containers (series, seasons, folders) are not.
const DOWNLOADABLE_TYPES = new Set(['Movie', 'Episode', 'Video', 'Audio', 'MusicVideo']);

// Jellyfin only fills CanDownload when it's explicitly requested in `Fields`
// (the detail item has it; list/row items don't). Trust the flag when present,
// otherwise fall back to the item type so the button still shows on cards.
export function canDownload(item: BaseItemDto): boolean {
  if (item.CanDownload != null) return item.CanDownload;
  return !!item.Type && DOWNLOADABLE_TYPES.has(item.Type);
}

// Original-file endpoint. api_key goes in the query because a browser download
// navigation can't carry an Authorization header.
export function downloadUrl(serverUrl: string, token: string, itemId: string): string {
  return `${serverUrl}/Items/${itemId}/Download?api_key=${token}`;
}

// Jellyfin serves the file with Content-Disposition: attachment, so a transient
// anchor click downloads it without navigating the SPA away.
export function triggerDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
