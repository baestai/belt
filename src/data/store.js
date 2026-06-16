// 앱 상태 영속화 계층.
// Supabase 미설정 시 localStorage(브라우저)로 동작한다.
// 모든 순수 변환은 lib/*에 있고, 여기서는 저장/로드만 담당한다.

import { defaultGroups } from '../lib/belts.js';
import { defaultInspectors, DEFAULT_ADMIN_PW } from '../lib/auth.js';
import { DEFAULT_PULLEYS } from '../lib/inspectionItems.js';

export const STORAGE_KEY = 'belt-inspection-state-v1';

export function defaultState() {
  return {
    groups: defaultGroups(),
    inspectors: defaultInspectors(),
    pulleys: [...DEFAULT_PULLEYS], // Pulley 구분 기본 목록 (관리모드에서 편집)
    beltConfigs: {}, // { beltName: { pulley: [...], electric: [...] } } 벨트별 설치 구성
    records: [], // 점검 기록 배열
    schedules: {}, // { beltName: { nextDate, cycle } }
    adminPw: DEFAULT_ADMIN_PW,
  };
}

// storage 인자를 주입 가능하게 하여 테스트에서 가짜 저장소 사용 가능
export function loadState(storage = safeLocalStorage()) {
  if (!storage) return defaultState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state, storage = safeLocalStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(storage = safeLocalStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

function safeLocalStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* noop */
  }
  return null;
}
