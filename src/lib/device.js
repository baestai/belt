// 기기(브라우저)별 환경설정 — 클라우드 동기화 대상이 아니다.
// PC는 여러 사람이 공유하므로 고정하지 않고, 모바일은 본인 이름을 한 번 저장해 두면
// 직접 바꾸기 전까지 유지된다. (앱 state가 아닌 별도 localStorage 키에 저장)

const KEY = 'belt-device-inspector-v1';

function ls() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* noop */
  }
  return null;
}

export function getDeviceInspector(storage = ls()) {
  if (!storage) return '';
  try {
    return storage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setDeviceInspector(name, storage = ls()) {
  if (!storage) return;
  try {
    const n = String(name || '').trim();
    if (n) storage.setItem(KEY, n);
    else storage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function clearDeviceInspector(storage = ls()) {
  setDeviceInspector('', storage);
}
