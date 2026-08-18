import { afterEach, expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { canDownload, downloadUrl, triggerDownload } from './download';

afterEach(() => vi.restoreAllMocks());

test('downloadUrl builds the original-file endpoint with api_key', () => {
  expect(downloadUrl('/jf', 'tok', 'itm')).toBe('/jf/Items/itm/Download?api_key=tok');
  expect(downloadUrl('https://nas:8096', 'k', 'x')).toBe('https://nas:8096/Items/x/Download?api_key=k');
});

test('canDownload: flag wins when present, else falls back to item type', () => {
  expect(canDownload({ CanDownload: true } as BaseItemDto)).toBe(true);
  expect(canDownload({ CanDownload: false, Type: 'Movie' } as BaseItemDto)).toBe(false); // flag overrides type
  expect(canDownload({ Type: 'Movie' } as BaseItemDto)).toBe(true);
  expect(canDownload({ Type: 'Episode' } as BaseItemDto)).toBe(true);
  expect(canDownload({ Type: 'Series' } as BaseItemDto)).toBe(false);
  expect(canDownload({ Type: 'Season' } as BaseItemDto)).toBe(false);
  expect(canDownload({} as BaseItemDto)).toBe(false);
});

test('triggerDownload clicks a transient download anchor and cleans it up', () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  triggerDownload('/jf/Items/itm/Download?api_key=tok');
  expect(click).toHaveBeenCalledOnce();
  const anchor = click.mock.instances[0] as HTMLAnchorElement;
  expect(anchor.getAttribute('href')).toBe('/jf/Items/itm/Download?api_key=tok');
  expect(anchor.hasAttribute('download')).toBe(true);
  expect(document.querySelector('a')).toBeNull(); // removed after click
});
