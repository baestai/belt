import { describe, it, expect } from 'vitest';
import { ymKey, monthlyReport, recordsToTable, toCSV } from './report.js';
import { emptyRecord } from './inspectionItems.js';

function mkRecord(belt, date, mutate) {
  const r = emptyRecord(belt, 'SILO', date, '김현장');
  if (mutate) mutate(r);
  return r;
}

describe('월 키', () => {
  it('YYYY-MM 추출', () => {
    expect(ymKey('2026-06-15')).toBe('2026-06');
    expect(ymKey('')).toBe('');
  });
});

describe('월간 보고서', () => {
  const records = [
    mkRecord('S-101', '2026-06-10', (r) => (r.items.belt.status = 'bad')),
    mkRecord('S-102', '2026-06-12', (r) => (r.items.safety.status = 'warn')),
    mkRecord('S-103', '2026-06-13'),
    mkRecord('S-104', '2026-05-10'),
  ];

  it('해당 월만 집계', () => {
    const rep = monthlyReport(records, '2026-06');
    expect(rep.total).toBe(3);
    expect(rep.counts).toEqual({ ok: 1, warn: 1, bad: 1 });
  });

  it('다른 월은 0', () => {
    expect(monthlyReport(records, '2026-01').total).toBe(0);
  });
});

describe('엑셀(표/CSV) 변환', () => {
  const records = [
    mkRecord('S-101', '2026-06-10', (r) => {
      r.items.belt.status = 'bad';
      r.items.reducer.values.temp = '58';
      r.items.belt.memo = '벨트 사행';
    }),
  ];

  it('헤더 + 데이터 행', () => {
    const table = recordsToTable(records);
    expect(table.length).toBe(2);
    expect(table[0].slice(0, 5)).toEqual(['벨트', '구역', '점검일', '점검자', '종합상태']);
    expect(table[1][0]).toBe('S-101');
    expect(table[1][4]).toBe('이상');
  });

  it('CSV는 줄바꿈/쉼표를 이스케이프', () => {
    const csv = toCSV([['a', 'b,c'], ['1', 'line']]);
    expect(csv).toBe('a,"b,c"\r\n1,line');
  });

  it('CSV에 한글 메모가 포함된다', () => {
    const csv = toCSV(recordsToTable(records));
    expect(csv).toContain('벨트 사행');
  });
});
