// 4조 2교대 교대근무 + 대근(代勤) 관리 순수 로직
//
// 근무 형태: 주간 2일 → 휴무 2일 → 야간 2일 → 휴무 2일 (8일 주기)
//   주간 07:00~19:00 / 야간 19:00~07:00
// 기준일(2026-06-18): A=주간(1일차), B=휴무, C=휴무, D=야간(1일차)
//   2026-06-20: A=휴무, B=주간, C=야간, D=휴무  → 아래 BASE_OFFSET로 재현됨
//
// 대근 규칙:
//   주간 2일 근무 → 다음날(첫 휴무) 주간 대근 가능, 다다음날(둘째 휴무) 야간 대근 가능
//   야간 2일 근무 → 다음날(첫 휴무) 야간 대근 가능, 다다음날(둘째 휴무) 주간 대근 가능

export const SHIFT_GROUPS = ['A', 'B', 'C', 'D'];

// 8일 주기 위치별 근무: 0,1=주간 / 2,3=휴무 / 4,5=야간 / 6,7=휴무
export const SHIFT_PATTERN = ['day', 'day', 'off', 'off', 'night', 'night', 'off', 'off'];

export const SHIFT_LABEL = { day: '주간', night: '야간', off: '휴무' };
export const SHIFT_TIME = { day: '07:00~19:00', night: '19:00~07:00' };

const REF_DATE = '2026-06-18';
const BASE_OFFSET = { A: 0, B: 6, C: 2, D: 4 };

export function defaultShiftGroups() {
  return {
    A: ['백종호', '고영철', '이경운', '김주홍', '한준수', '유승환', '윤광민'],
    B: ['김세준', '이동철', '이범화', '정희창', '조민수', '최준민'],
    C: ['김영진', '정균태', '최충환', '곽환', '강요섭', '홍진형'],
    D: ['정영균', '백정동', '이종술', '김용호', '김지후', '서창환'],
  };
}

// ── 날짜 유틸 ──────────────────────────────────────────
function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function daysSinceRef(dateStr) {
  return Math.round((parseYmd(dateStr) - parseYmd(REF_DATE)) / 86400000);
}

// ── 교대 근무표 ────────────────────────────────────────
// 주기 위치(0~7). 알 수 없는 조면 null
export function cyclePosition(group, dateStr) {
  const base = BASE_OFFSET[group];
  if (base == null) return null;
  const n = base + daysSinceRef(dateStr);
  return ((n % 8) + 8) % 8;
}

// 해당 조의 그 날 근무: 'day' | 'night' | 'off'
export function shiftOfGroup(group, dateStr) {
  const p = cyclePosition(group, dateStr);
  return p == null ? null : SHIFT_PATTERN[p];
}

// 그 날 전체 조 근무: { A:'day', B:'off', C:'night', D:'off' }
export function shiftsOnDate(dateStr) {
  const out = {};
  for (const g of SHIFT_GROUPS) out[g] = shiftOfGroup(g, dateStr);
  return out;
}

// ── 대근 가능 판정 ─────────────────────────────────────
// 휴무일에 한해: 위치 2 또는 7 → 주간 대근 가능, 위치 3 또는 6 → 야간 대근 가능
// 근무일(0,1,4,5)이면 null
export function eligibleShift(group, dateStr) {
  const p = cyclePosition(group, dateStr);
  if (p === 2 || p === 7) return 'day';
  if (p === 3 || p === 6) return 'night';
  return null;
}

// 특정 날짜에 neededShift(주간/야간) 대근이 가능한 직원 목록 [{name, group}]
export function eligibleSubstitutes(shiftGroups, dateStr, neededShift, exclude = []) {
  const out = [];
  for (const g of SHIFT_GROUPS) {
    if (eligibleShift(g, dateStr) !== neededShift) continue;
    for (const name of shiftGroups[g] || []) {
      if (!exclude.includes(name)) out.push({ name, group: g });
    }
  }
  return out;
}

export function groupOfPerson(shiftGroups, name) {
  for (const g of SHIFT_GROUPS) if ((shiftGroups[g] || []).includes(name)) return g;
  return null;
}

// ── 대근 신청/기록 (불변 연산) ─────────────────────────
// sub: { id, date, shift, group, requester, reason, substitute|null, status, createdAt }
let _seq = 0;
function newId() {
  _seq += 1;
  return `sub_${Date.now().toString(36)}_${_seq}`;
}

// 같은 날짜 + 같은 시간대(주간/야간)에 신청 가능한 최대 인원
export const MAX_SUBS_PER_SHIFT = 3;

// 신청: 신청자(원 근무자)가 근무하는 날의 시간대를 자동 산출
// force=true면 정원 초과(MAX_SUBS_PER_SHIFT)를 무시하고 신청 (관리자 확인 후 강행)
export function createSubstitution(list, { date, group, requester, reason }, { force = false } = {}) {
  const shift = shiftOfGroup(group, date);
  if (shift !== 'day' && shift !== 'night') {
    throw new Error('해당 날짜는 근무일이 아니라 대근 신청이 필요 없습니다.');
  }
  const sameSlot = list.filter((s) => s.date === date && s.shift === shift);
  if (sameSlot.some((s) => s.requester === requester)) {
    throw new Error('이미 같은 날 같은 시간대에 대근을 신청했습니다.');
  }
  if (!force && sameSlot.length >= MAX_SUBS_PER_SHIFT) {
    throw new Error(`해당 날짜의 ${SHIFT_LABEL[shift]} 대근 신청은 최대 ${MAX_SUBS_PER_SHIFT}명까지 가능합니다.`);
  }
  const sub = {
    id: newId(),
    date,
    shift,
    group,
    requester,
    reason: String(reason || '').trim(),
    substitute: null,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  return [...list, sub];
}

// 대근 확정: 대근자가 비어있는 신청을 맡음
export function claimSubstitution(list, id, substitute, shiftGroups) {
  return list.map((s) => {
    if (s.id !== id) return s;
    if (s.status !== 'open') throw new Error('이미 처리된 대근입니다.');
    if (substitute === s.requester) throw new Error('본인 근무는 대근할 수 없습니다.');
    if (eligibleShift(groupOfPerson(shiftGroups, substitute), s.date) !== s.shift) {
      throw new Error('해당 날짜에 대근 가능한 직원이 아닙니다.');
    }
    return { ...s, substitute, status: 'filled' };
  });
}

// 취소(삭제)
export function cancelSubstitution(list, id) {
  return list.filter((s) => s.id !== id);
}

// 대근자 확정 취소(다시 모집중으로)
export function unclaimSubstitution(list, id) {
  return list.map((s) => (s.id === id ? { ...s, substitute: null, status: 'open' } : s));
}

// ── 정산 집계 (매월 16일 ~ 다음달 15일) ────────────────
export function settlementPeriod(dateStr) {
  const d = parseYmd(dateStr);
  let startY = d.getFullYear();
  let startM = d.getMonth(); // 0-based
  if (d.getDate() < 16) {
    startM -= 1;
    if (startM < 0) {
      startM = 11;
      startY -= 1;
    }
  }
  const start = new Date(startY, startM, 16);
  const end = new Date(startY, startM + 1, 15);
  return { start: fmtYmd(start), end: fmtYmd(end) };
}

export function inPeriod(dateStr, period) {
  return dateStr >= period.start && dateStr <= period.end;
}

// 기간 내 대근자별 건수 집계 (확정된 건만), 내림차순
export function substituteCounts(list, period) {
  const map = {};
  for (const s of list) {
    if (s.status !== 'filled' || !s.substitute) continue;
    if (!inPeriod(s.date, period)) continue;
    map[s.substitute] = (map[s.substitute] || 0) + 1;
  }
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ── PIN (내부 구분용 간이 인증) ────────────────────────
export function hasPin(pins, name) {
  return !!(pins && pins[name]);
}
export function verifyPin(pins, name, input) {
  return String((pins && pins[name]) || '') === String(input);
}
export function setPin(pins, name, input) {
  const v = String(input || '').trim();
  if (!/^\d{4,6}$/.test(v)) throw new Error('PIN은 숫자 4~6자리여야 합니다.');
  return { ...(pins || {}), [name]: v };
}

// 같은 날짜 + 시간대의 대근 신청이 정원(MAX_SUBS_PER_SHIFT)에 도달했는지
export function isSlotFull(list, date, shift) {
  const n = (list || []).filter((s) => s.date === date && s.shift === shift).length;
  return n >= MAX_SUBS_PER_SHIFT;
}
