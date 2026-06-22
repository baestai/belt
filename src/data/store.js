// 앱 상태 영속화 계층.
// Supabase 미설정 시 localStorage(브라우저)로 동작한다.
// 모든 순수 변환은 lib/*에 있고, 여기서는 저장/로드만 담당한다.

import { defaultGroups } from '../lib/belts.js';
import { defaultInspectors, DEFAULT_ADMIN_PW } from '../lib/auth.js';
import { DEFAULT_PULLEYS } from '../lib/inspectionItems.js';
import { defaultShiftGroups } from '../lib/shift.js';
import { defaultCollectors } from '../lib/collectors.js';

export const STORAGE_KEY = 'belt-inspection-state-v1';

export function defaultState() {
  return {
    groups: defaultGroups(),
    inspectors: defaultInspectors(),
    pulleys: [...DEFAULT_PULLEYS], // Pulley 구분 기본 목록 (관리모드에서 편집)
    quickMemos: [], // 점검 메모 빠른 입력 칩 (관리모드에서 추가/삭제)
    beltConfigs: {}, // { beltName: { pulley: [...], electric: [...] } } 벨트별 설치 구성
    records: [], // 점검 기록 배열
    schedules: {}, // { beltName: { nextDate, cycle } }
    // ── 집진기(Dust Collector) 점검 ──
    collectors: defaultCollectors(), // [{ name, days:[일자] }]
    collectorRecords: [], // 집진기 점검 기록 배열 (record.collector)
    // 수리요청 워크플로: { [repairKey]: { kind, equip, date, itemKey, sub, title, status, assignee, dueDate, updatedAt } }
    // status: 'requested'(정비의뢰) — 수리완료 시 항목을 양호로 되돌리고 키 삭제 + repairHistory로 이관
    repairs: {},
    repairHistory: [], // 완료된 정비 이력(대장) — 최신순
    logs: [], // 점검·설비 변경 감사 로그 — 최신순
    adminPw: DEFAULT_ADMIN_PW,
    // ── 대근(代勤) 관리 ──
    shiftGroups: defaultShiftGroups(), // { A:[...], B:[...], C:[...], D:[...] }
    shiftPins: {}, // { name: '1234' } 대근 페이지 로그인용 PIN (내부 구분용)
    pinResets: [], // PIN 초기화 신청자 이름 목록 (관리모드 승인 대기)
    substitutions: [], // 대근 신청/확정 기록 배열
    extraWorks: [], // 추가 근무(교육대근/GIB/PSM) 신청 기록 배열
    swaps: [], // 대근 맞교환(스왑) 요청/수락 기록 배열
    subLogs: [], // 대근 변경 이력(감사 로그) 배열, 최신순
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
