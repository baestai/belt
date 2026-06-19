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
  };
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
