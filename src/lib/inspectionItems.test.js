import { describe, it, expect } from 'vitest';
import {
  INSPECTION_ITEMS,
  DEFAULT_PULLEYS,
  emptyRecord,
  normalizeRecord,
  normalizeTemp,
  validateRecord,
} from './inspectionItems.js';
import { aggregateStatus } from './belts.js';

describe('점검 항목 정의', () => {
  it('6개 항목이 정의된다 (RSC·안전장치·낙광 제외)', () => {
    expect(INSPECTION_ITEMS.length).toBe(6);
  });

  it('RSC·안전장치·낙광 항목은 존재하지 않는다', () => {
    const keys = INSPECTION_ITEMS.map((d) => d.key);
    expect(keys).not.toContain('rsc');
    expect(keys).not.toContain('safety');
    expect(keys).not.toContain('spillage');
  });

  it('전기장치 5개, 급유급지 2개 하위', () => {
    const byKey = Object.fromEntries(INSPECTION_ITEMS.map((d) => [d.key, d]));
    expect(byKey.electric.subs.length).toBe(5);
    expect(byKey.lubrication.subs.length).toBe(2);
  });

  it('Pulley 기본 구분은 8개(영문)', () => {
    expect(DEFAULT_PULLEYS).toEqual([
      'Head', 'Tail', 'Drive', 'Snub', 'Tension', 'Head Bend', 'Tail Bend', 'Take Up',
    ]);
  });

  it('Motor는 진동/발열/이음 상태 점검(subs)', () => {
    const motor = INSPECTION_ITEMS.find((d) => d.key === 'motor');
    expect(motor.type).toBe('subs');
    expect(motor.subs).toEqual(['진동', '발열', '이음']);
  });

  it('감속기는 진동/발열/이음 상태 점검(subs)', () => {
    const reducer = INSPECTION_ITEMS.find((d) => d.key === 'reducer');
    expect(reducer.type).toBe('subs');
    expect(reducer.subs).toEqual(['진동', '발열', '이음']);
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

  it('Pulley 온도는 좌/우(L,R) 양측 구조로 생성된다', () => {
    expect(rec.items.pulley.temps['Head']).toEqual({ L: '', R: '' });
  });
});

describe('normalizeTemp', () => {
  it('객체 입력은 L,R을 보존한다', () => {
    expect(normalizeTemp({ L: '40', R: '42' })).toEqual({ L: '40', R: '42' });
  });

  it('구버전 단일 문자열은 L에 보존된다', () => {
    expect(normalizeTemp('45')).toEqual({ L: '45', R: '' });
  });

  it('null/빈값은 빈 L,R', () => {
    expect(normalizeTemp(null)).toEqual({ L: '', R: '' });
  });
});

describe('normalizeRecord — Pulley 온도 마이그레이션', () => {
  it('구버전 문자열 온도를 {L,R}로 변환한다', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    rec.items.pulley.temps['Head'] = '55'; // 구버전 형식
    const out = normalizeRecord(rec, DEFAULT_PULLEYS);
    expect(out.items.pulley.temps['Head']).toEqual({ L: '55', R: '' });
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

  it('Pulley 온도에 문자 입력 시 에러', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    rec.items.pulley.temps['Head'] = 'xx';
    expect(validateRecord(rec).some((e) => e.includes('숫자'))).toBe(true);
  });

  it('Pulley 온도 숫자 문자열은 통과', () => {
    const rec = emptyRecord('S-101', 'SILO', '2026-06-15', '김현장');
    rec.items.pulley.temps['Head'] = '42.5';
    expect(validateRecord(rec)).toEqual([]);
  });
});
