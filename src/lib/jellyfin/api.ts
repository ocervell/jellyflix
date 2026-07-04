import { Jellyfin } from '@jellyfin/sdk';
import type { Api } from '@jellyfin/sdk';
import { getClientInfo, getDeviceInfo } from './device';

export function createJellyfinApi(serverUrl: string, accessToken?: string): Api {
  const jellyfin = new Jellyfin({
    clientInfo: getClientInfo(),
    deviceInfo: getDeviceInfo(),
  });
  return jellyfin.createApi(serverUrl, accessToken);
}
