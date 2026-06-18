import { describe, it, expect } from 'vitest';
import {
  recordsForBelt,
  latestRecord,
  previousRecord,
  statusOf,
  openIssues,
  daysBetween,
  dueInfo,
  nextDateFrom,
  beltsScheduledOn,
  beltsInspectedOn,
  beltsForDate,
} from './selectors.js';
import { INSPECTION_ITEMS, emptyRecord } from './inspectionItems.js';

const recA1 = { belt: 'S-101', group: 'SILO', date: '2026-04-10', inspector: '김현장', items: {} };
const recA2 = { belt: 'S-101', group: 'SILO', date: '2026-06-10', inspector: '이정비', items: { belt: { status: 'bad' } } };
const recB = { belt: 'S-102', group: 'SILO', date: '2026-05-01', inspector: '김현장', items: {} };
const records = [recA1, recA2, recB];

describe('기록 셀렉터', () => {
  it('벨트별 기록은 최신순 정렬', () => {
    const list = recordsForBelt(records, 'S-101');
    expect(list.map((r) => r.date)).toEqual(['2026-06-10', '2026-04-10']);
  });

  it('최신 기록 반환', () => {
    expect(latestRecord(records, 'S-101').date).toBe('2026-06-10');
    expect(latestRecord(records, '없음')).toBe(null);
  });

  it('이전 기록: 지정일 미만의 최신', () => {
    expect(previousRecord(records, 'S-101', '2026-06-10').date).toBe('2026-04-10');
    expect(previousRecord(records, 'S-101', '2026-04-10')).toBe(null);
    expect(previousRecord(records, 'S-101', '2026-07-01').date).toBe('2026-06-10');
  });

  it('상태: 기록 없으면 none', () => {
    expect(statusOf(records, '없음')).toBe('none');
  });

  it('상태: 최신 기록 기준', () => {
    expect(statusOf(records, 'S-101')).toBe('bad');
    expect(statusOf(records, 'S-102')).toBe('ok');
  });
});

describe('미해결 이상', () => {
  it('불량 하위 항목을 추출', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    rec.items.motor.subs.진동 = 'bad';
    rec.items.belt.status = 'warn';
    const issues = openIssues(rec, INSPECTION_ITEMS);
    expect(issues.length).toBe(2);
    expect(issues.some((i) => i.detail === '진동')).toBe(true);
  });

  it('이상 없으면 빈 배열', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    expect(openIssues(rec, INSPECTION_ITEMS)).toEqual([]);
  });
});

describe('날짜/예정일 로직', () => {
  it('일수 차 계산', () => {
    expect(daysBetween('2026-06-10', '2026-06-15')).toBe(5);
    expect(daysBetween('2026-06-15', '2026-06-10')).toBe(-5);
  });

  it('지연/임박/완료 판정', () => {
    expect(dueInfo({ nextDate: '2026-06-10' }, '2026-06-15').kind).toBe('over');
    expect(dueInfo({ nextDate: '2026-06-17' }, '2026-06-15').kind).toBe('soon');
    expect(dueInfo({ nextDate: '2026-06-30' }, '2026-06-15').kind).toBe('done');
    expect(dueInfo(null, '2026-06-15').kind).toBe('none');
  });

  it('다음 예정일 계산 (주기별)', () => {
    expect(nextDateFrom('2026-06-15', 'monthly')).toBe('2026-07-15');
    expect(nextDateFrom('2026-06-15', 'bimonthly')).toBe('2026-08-15');
    expect(nextDateFrom('2026-06-15', 'quarterly')).toBe('2026-09-15');
    expect(nextDateFrom('2026-06-15', 'none')).toBe(null);
  });

  it('월말 넘어가는 주기 계산', () => {
    expect(nextDateFrom('2026-12-15', 'monthly')).toBe('2027-01-15');
  });

  it('특정일 점검 예정 벨트', () => {
    const sched = {
      'S-101': { nextDate: '2026-06-20', cycle: 'monthly' },
      'S-102': { nextDate: '2026-06-20', cycle: 'monthly' },
      'S-103': { nextDate: '2026-06-21', cycle: 'monthly' },
    };
    expect(beltsScheduledOn(sched, '2026-06-20').sort()).toEqual(['S-101', 'S-102']);
  });

  it('특정일 점검 기록 있는 벨트 (중복 제거)', () => {
    expect(beltsInspectedOn(records, '2026-06-10')).toEqual(['S-101']);
    expect(beltsInspectedOn(records, '2026-05-01')).toEqual(['S-102']);
    expect(beltsInspectedOn(records, '2026-01-01')).toEqual([]);
  });

  it('특정일 점검 대상 = 예정 ∪ 기록 (완료로 예정일이 넘어가도 포함)', () => {
    // S-101은 6/10 기록 있으나 예정일은 7/10로 넘어간 상태 → 6/10에도 대상으로 보여야 함
    const sched = {
      'S-101': { nextDate: '2026-07-10', cycle: 'monthly' },
      'S-103': { nextDate: '2026-06-10', cycle: 'monthly' },
    };
    expect(beltsForDate(sched, records, '2026-06-10')).toEqual(['S-101', 'S-103']);
  });
});
