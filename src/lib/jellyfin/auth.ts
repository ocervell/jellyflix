import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { createJellyfinApi } from './api';
import type { Session } from './session';

export async function authenticate(
  serverUrl: string,
  username: string,
  password: string,
): Promise<Session> {
  const api = createJellyfinApi(serverUrl);
  const { data } = await getUserApi(api).authenticateUserByName({
    authenticateUserByName: { Username: username, Pw: password },
  });
  if (!data.AccessToken || !data.User?.Id) {
    throw new Error('Authentication failed');
  }
  return {
    serverUrl,
    accessToken: data.AccessToken,
    userId: data.User.Id,
    userName: data.User.Name ?? username,
  };
}
