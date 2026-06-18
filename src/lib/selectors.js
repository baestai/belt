// 상태(state)에서 파생값을 계산하는 순수 셀렉터

import { aggregateStatus } from './belts.js';

export function recordsForBelt(records, beltName) {
  return records
    .filter((r) => r.belt === beltName)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function latestRecord(records, beltName) {
  return recordsForBelt(records, beltName)[0] || null;
}

// 특정 날짜 이전(미만)의 가장 최근 기록 — 전월 대비 비교용
export function previousRecord(records, beltName, beforeDate) {
  return (
    recordsForBelt(records, beltName).find(
      (r) => String(r.date).localeCompare(String(beforeDate)) < 0
    ) || null
  );
}

// 벨트 종합상태: 최근 기록 기준. 기록 없으면 'none'(미점검)
export function statusOf(records, beltName) {
  const rec = latestRecord(records, beltName);
  return rec ? aggregateStatus(rec) : 'none';
}

// 최근 기록의 미해결(불량/주의) 항목 목록
export function openIssues(record, itemDefs) {
  if (!record) return [];
  const out = [];
  for (const def of itemDefs) {
    const it = record.items?.[def.key];
    if (!it) continue;
    if (it.subs) {
      for (const k of Object.keys(it.subs)) {
        if (it.subs[k] !== 'ok') out.push({ title: def.title, detail: k, status: it.subs[k], memo: it.memo });
      }
    }
    if (it.status && it.status !== 'ok') {
      out.push({ title: def.title, detail: it.memo || '', status: it.status, memo: it.memo });
    }
  }
  return out;
}

// 'YYYY-MM-DD' 두 날짜 사이의 일수 차 (b - a)
export function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

// 예정일 대비 D-day/지연 정보
export function dueInfo(schedule, today) {
  if (!schedule || !schedule.nextDate) return { kind: 'none', label: '예정없음' };
  const diff = daysBetween(today, schedule.nextDate);
  if (diff < 0) return { kind: 'over', label: '점검지연' };
  if (diff <= 3) return { kind: 'soon', label: `D-${diff}` };
  return { kind: 'done', label: schedule.nextDate.slice(5) };
}

// 다음 예정일 계산 (점검 완료 시 주기에 따라). 시간대 영향을 피하기 위해 문자열 연산 사용.
export function nextDateFrom(dateStr, cycle) {
  if (cycle === 'none') return null;
  const add = { monthly: 1, bimonthly: 2, quarterly: 3 }[cycle] ?? 1;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  let nm = m + add;
  let ny = y;
  while (nm > 12) {
    nm -= 12;
    ny += 1;
  }
  const lastDay = new Date(ny, nm, 0).getDate(); // 대상 월(1-based)의 말일
  const day = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 특정 날짜에 점검 예정인 벨트명 목록
export function beltsScheduledOn(schedules, dateStr) {
  return Object.keys(schedules).filter((b) => schedules[b]?.nextDate === dateStr);
}

// 특정 날짜에 실제 점검 기록이 있는 벨트명 목록 (중복 제거)
export function beltsInspectedOn(records, dateStr) {
  const set = new Set();
  for (const r of records || []) {
    if (r.date === dateStr) set.add(r.belt);
  }
  return [...set];
}

// 특정 날짜의 점검 대상 벨트명: 예정 ∪ 기록 (정렬)
export function beltsForDate(schedules, records, dateStr) {
  const set = new Set([
    ...beltsScheduledOn(schedules, dateStr),
    ...beltsInspectedOn(records, dateStr),
  ]);
  return [...set].sort((a, b) => a.localeCompare(b));
}
