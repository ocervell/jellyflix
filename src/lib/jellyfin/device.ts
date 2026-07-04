import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'jellyflix.deviceId';

export function getClientInfo() {
  return { name: 'Jellyflix', version: '0.1.0' };
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceInfo() {
  return { name: 'Jellyflix Web', id: getDeviceId() };
}
