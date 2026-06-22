// 데이터 백업/복원 — 전체 앱 상태를 JSON 파일로 내보내고 가져온다.
// - exportBackup(state): 전체 상태를 JSON 파일로 다운로드
// - buildBackup(state): 다운로드용 JSON 문자열 생성 (테스트 가능)
// - parseBackup(text): JSON 문자열을 검증하고 상태 객체로 복원

const BACKUP_VERSION = 1;

// 상태에서 영속 대상 필드만 추출 (UI 상태는 제외)
function pickState(state) {
  return {
    groups: state.groups,
    inspectors: state.inspectors,
    pulleys: state.pulleys,
    quickMemos: state.quickMemos,
    beltConfigs: state.beltConfigs,
    adminPw: state.adminPw,
    schedules: state.schedules,
    records: state.records,
    collectors: state.collectors,
    collectorRecords: state.collectorRecords,
    repairs: state.repairs,
    repairHistory: state.repairHistory,
    logs: state.logs,
  };
}

export function buildBackup(state) {
  const payload = {
    _type: 'belt-inspection-backup',
    _version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: pickState(state),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('파일을 읽을 수 없습니다. 올바른 JSON 백업 파일인지 확인하세요.');
  }
  // 구버전/직접 저장 호환: state 래퍼가 없으면 obj 자체를 상태로 간주
  const st = obj && obj.state ? obj.state : obj;
  if (!st || typeof st !== 'object') throw new Error('올바른 백업 파일이 아닙니다.');
  if (!st.groups || typeof st.groups !== 'object') {
    throw new Error('올바른 백업 파일이 아닙니다. (구분 정보 없음)');
  }
  if (!Array.isArray(st.records)) {
    throw new Error('올바른 백업 파일이 아닙니다. (점검 기록 없음)');
  }
  return {
    groups: st.groups,
    inspectors: Array.isArray(st.inspectors) ? st.inspectors : [],
    pulleys: Array.isArray(st.pulleys) ? st.pulleys : undefined,
    quickMemos: Array.isArray(st.quickMemos) ? st.quickMemos : [],
    beltConfigs: st.beltConfigs && typeof st.beltConfigs === 'object' ? st.beltConfigs : {},
    adminPw: st.adminPw,
    schedules: st.schedules && typeof st.schedules === 'object' ? st.schedules : {},
    records: st.records,
    collectors: Array.isArray(st.collectors) ? st.collectors : undefined,
    collectorRecords: Array.isArray(st.collectorRecords) ? st.collectorRecords : [],
    repairs: st.repairs && typeof st.repairs === 'object' ? st.repairs : {},
    repairHistory: Array.isArray(st.repairHistory) ? st.repairHistory : [],
    logs: Array.isArray(st.logs) ? st.logs : [],
  };
}

// ── 자동 스냅샷(로컬 회전 백업) ─────────────────────────
// 브라우저 localStorage에 최근 N개의 상태 스냅샷을 보관한다(기기 단위).
const SNAP_KEY = 'belt-inspection-snapshots-v1';
const SNAP_MAX = 10;
const SNAP_MIN_GAP_MS = 12 * 60 * 60 * 1000; // 12시간

function snapStorage() {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* noop */ }
  return null;
}

export function readSnapshots(storage = snapStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SNAP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 메타데이터만(목록 표시용) — 무거운 state 제외
export function listSnapshots(storage = snapStorage()) {
  return readSnapshots(storage).map((s) => ({
    id: s.id,
    at: s.at,
    beltCount: Object.values(s.state?.groups || {}).reduce((a, b) => a + b.length, 0),
    recordCount: (s.state?.records || []).length,
  }));
}

export function getSnapshot(id, storage = snapStorage()) {
  return readSnapshots(storage).find((s) => s.id === id) || null;
}

// 마지막 스냅샷이 12시간 넘게 지났으면 현재 상태를 스냅샷으로 저장. 저장했으면 true.
export function maybeSnapshot(state, storage = snapStorage(), now = Date.now()) {
  if (!storage) return false;
  const list = readSnapshots(storage);
  const last = list[0];
  if (last && now - new Date(last.at).getTime() < SNAP_MIN_GAP_MS) return false;
  const snap = { id: `snap_${now.toString(36)}`, at: new Date(now).toISOString(), state: pickState(state) };
  const next = [snap, ...list].slice(0, SNAP_MAX);
  try { storage.setItem(SNAP_KEY, JSON.stringify(next)); return true; } catch { return false; }
}

// 브라우저 다운로드 트리거 (테스트에서는 호출되지 않음)
export function exportBackup(state) {
  const json = buildBackup(state);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `belt-backup_${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
