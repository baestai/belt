// 감사 로그(점검·설비 변경 이력) — 순수 함수
// entry: { id, at, actor, action, detail }
let _seq = 0;

export function appendLog(logs, { actor = '시스템', action = '', detail = '' } = {}) {
  _seq += 1;
  const e = {
    id: `lg_${Date.now().toString(36)}_${_seq}`,
    at: new Date().toISOString(),
    actor: String(actor || '시스템'),
    action: String(action || ''),
    detail: String(detail || ''),
  };
  return [e, ...(logs || [])].slice(0, 500); // 최신순, 최대 500건
}
