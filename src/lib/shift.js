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
  const target = list.find((s) => s.id === id);
  // 대근자는 하루 최대 1회만 가능 (같은 날 다른 대근을 이미 맡고 있으면 불가)
  if (target) {
    const already = list.some(
      (s) => s.id !== id && s.date === target.date && s.substitute === substitute
    );
    if (already) {
      throw new Error('해당 날짜에 이미 대근을 맡은 직원입니다. (1일 최대 1회)');
    }
  }
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

// ── 관리자 전용 대근 편성 (비밀번호 인증 후) ───────────
// 정원/근무일 제약을 완화하고 원 근무자·대근자를 직접 지정해 편성한다.
function deriveShift(group, date, fallback) {
  const sh = shiftOfGroup(group, date);
  if (sh === 'day' || sh === 'night') return sh;
  return fallback === 'night' ? 'night' : 'day';
}

export function adminCreateSubstitution(list, { date, group, requester, reason, substitute, shift }) {
  if (!date) throw new Error('날짜를 선택하세요.');
  if (!group) throw new Error('조를 선택하세요.');
  if (!requester) throw new Error('원 근무자를 선택하세요.');
  const sub = {
    id: newId(),
    date,
    shift: deriveShift(group, date, shift),
    group,
    requester,
    reason: String(reason || '').trim(),
    substitute: substitute || null,
    status: substitute ? 'filled' : 'open',
    createdAt: new Date().toISOString(),
  };
  return [...list, sub];
}

export function adminUpdateSubstitution(list, id, patch = {}) {
  return list.map((s) => {
    if (s.id !== id) return s;
    const next = { ...s, ...patch };
    if (!next.date) throw new Error('날짜를 선택하세요.');
    if (!next.group) throw new Error('조를 선택하세요.');
    if (!next.requester) throw new Error('원 근무자를 선택하세요.');
    next.shift = deriveShift(next.group, next.date, next.shift);
    next.reason = String(next.reason || '').trim();
    next.substitute = next.substitute || null;
    next.status = next.substitute ? 'filled' : 'open';
    return next;
  });
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

// ── 추가 근무 (대근과 무관한 별도 근무) ────────────────
// 사유는 교육대근 / GIB / PSM 중 하나
export const EXTRA_WORK_REASONS = ['교육대근', 'GIB', 'PSM'];

// extra: { id, date, person, reason, createdAt }
export function createExtraWork(list, { date, person, reason }) {
  if (!date) throw new Error('날짜를 선택하세요.');
  if (!person) throw new Error('신청자를 선택하세요.');
  if (!EXTRA_WORK_REASONS.includes(reason)) {
    throw new Error('추가 근무 사유는 교육대근 / GIB / PSM 중에서 선택하세요.');
  }
  if ((list || []).some((e) => e.date === date && e.person === person && e.reason === reason)) {
    throw new Error('같은 날 같은 사유의 추가 근무를 이미 신청했습니다.');
  }
  const extra = {
    id: newId(),
    date,
    person,
    reason,
    createdAt: new Date().toISOString(),
  };
  return [...(list || []), extra];
}

export function cancelExtraWork(list, id) {
  return (list || []).filter((e) => e.id !== id);
}

// 관리자: 추가 근무 편성 수정
export function adminUpdateExtraWork(list, id, patch = {}) {
  return (list || []).map((e) => {
    if (e.id !== id) return e;
    const next = { ...e, ...patch };
    if (!next.date) throw new Error('날짜를 선택하세요.');
    if (!next.person) throw new Error('근무자를 선택하세요.');
    if (!EXTRA_WORK_REASONS.includes(next.reason)) {
      throw new Error('추가 근무 사유는 교육대근 / GIB / PSM 중에서 선택하세요.');
    }
    return next;
  });
}

// ── 주 52시간 제한 (일요일~토요일, 1교대=12시간) ───────
export const SHIFT_HOURS = 12;
export const WEEKLY_HOUR_LIMIT = 52;
// 추가 근무 사유별 근무시간 (교육대근·PSM은 8시간, GIB는 12시간)
export const EXTRA_WORK_HOURS = { '교육대근': 8, 'PSM': 8, 'GIB': 12 };
function extraHoursOf(reason) {
  return EXTRA_WORK_HOURS[reason] ?? SHIFT_HOURS;
}

// dateStr이 속한 주(일요일 00시 ~ 토요일 24시)의 시작·끝 날짜
export function weekRange(dateStr) {
  const d = parseYmd(dateStr);
  const dow = d.getDay(); // 0=일요일
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: fmtYmd(start), end: fmtYmd(end) };
}

function eachDayInRange(start, end) {
  const out = [];
  let cur = parseYmd(start);
  const last = parseYmd(end);
  while (cur <= last) {
    out.push(fmtYmd(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}

// person이 dateStr이 속한 주에 실제로 근무하는 총 시간 (기본근무 + 대근 + 추가근무)
// 대근으로 빠진(확정된) 본인 근무는 제외, 대근자로 맡은 근무·추가근무는 가산
export function weeklyHours(
  person,
  dateStr,
  { shiftGroups = {}, substitutions = [], extraWorks = [] } = {}
) {
  if (!person) return 0;
  const group = groupOfPerson(shiftGroups, person);
  const { start, end } = weekRange(dateStr);
  const days = eachDayInRange(start, end);
  let hours = 0;
  for (const d of days) {
    // 본인 기본 근무 (단, 그 날 본인 근무를 누군가 대근 확정했으면 제외)
    if (group) {
      const sh = shiftOfGroup(group, d);
      if (sh === 'day' || sh === 'night') {
        const subbedOut = substitutions.some(
          (s) => s.date === d && s.requester === person && s.status === 'filled'
        );
        if (!subbedOut) hours += SHIFT_HOURS;
      }
    }
    // 대근자로 맡은 근무
    const asSubCnt = substitutions.filter(
      (s) => s.date === d && s.substitute === person && s.status === 'filled'
    ).length;
    hours += asSubCnt * SHIFT_HOURS;
    // 추가 근무 (사유별 시간: 교육대근·PSM 8h, GIB 12h)
    for (const e of extraWorks || []) {
      if (e.date === d && e.person === person) hours += extraHoursOf(e.reason);
    }
  }
  return hours;
}

// person의 해당 주 총 근무시간이 52시간을 초과하는지
export function exceedsWeeklyLimit(person, dateStr, ctx) {
  return weeklyHours(person, dateStr, ctx) > WEEKLY_HOUR_LIMIT;
}

// 기간 내 추가 근무 인원별 건수 집계, 내림차순
export function extraWorkCounts(list, period) {
  const map = {};
  for (const e of list || []) {
    if (!e.person) continue;
    if (!inPeriod(e.date, period)) continue;
    map[e.person] = (map[e.person] || 0) + 1;
  }
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
