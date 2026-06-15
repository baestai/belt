import { describe, it, expect } from 'vitest';
import {
  INSPECTION_ITEMS,
  DEFAULT_PULLEYS,
  emptyRecord,
  validateRecord,
} from './inspectionItems.js';
import { aggregateStatus } from './belts.js';

describe('점검 항목 정의', () => {
  it('9개 항목이 정의된다', () => {
    expect(INSPECTION_ITEMS.length).toBe(9);
  });

  it('RSC 3개, 전기장치 5개, 급유급지 2개 하위', () => {
    const byKey = Object.fromEntries(INSPECTION_ITEMS.map((d) => [d.key, d]));
    expect(byKey.rsc.subs.length).toBe(3);
    expect(byKey.electric.subs.length).toBe(5);
    expect(byKey.lubrication.subs.length).toBe(2);
  });

  it('Pulley 기본 구분은 8개(영문)', () => {
    expect(DEFAULT_PULLEYS).toEqual([
      'Head', 'Tail', 'Drive', 'Snub', 'Tension', 'Head Bend', 'Tail Bend', 'Take Up',
    ]);
  });

  it('Motor는 진동/온도/이음 상태 점검(subs)', () => {
    const motor = INSPECTION_ITEMS.find((d) => d.key === 'motor');
    expect(motor.type).toBe('subs');
    expect(motor.subs).toEqual(['진동', '온도', '이음']);
  });
});

describe('빈 기록 생성', () => {
  const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');

  it('메타 정보가 채워진다', () => {
    expect(rec.belt).toBe('S-101');
    expect(rec.group).toBe('SILO');
    expect(rec.date).toBe('2026-06-15');
    expect(rec.inspector).toBe('김현장');
  });

  it('모든 항목이 기본 ok', () => {
    expect(aggregateStatus(rec)).toBe('ok');
  });

  it('Pulley 항목은 subs와 temps를 가진다(기본 8개)', () => {
    expect(Object.keys(rec.items.pulley.subs).length).toBe(8);
    expect(Object.keys(rec.items.pulley.temps).length).toBe(8);
  });
});

describe('기록 검증', () => {
  it('정상 기록은 에러 없음', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    expect(validateRecord(rec)).toEqual([]);
  });

  it('점검자 없으면 에러', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '');
    expect(validateRecord(rec).some((e) => e.includes('점검자'))).toBe(true);
  });

  it('감속기 온도에 문자 입력 시 에러', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    rec.items.reducer.values.temp = 'abc';
    expect(validateRecord(rec).some((e) => e.includes('숫자'))).toBe(true);
  });

  it('Pulley 온도에 문자 입력 시 에러', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    rec.items.pulley.temps['Head'] = 'xx';
    expect(validateRecord(rec).some((e) => e.includes('온도'))).toBe(true);
  });

  it('숫자 문자열은 통과', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    rec.items.reducer.values.temp = '58';
    rec.items.pulley.temps['Head'] = '42.5';
    expect(validateRecord(rec)).toEqual([]);
  });
});
