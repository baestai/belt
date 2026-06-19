import { describe, it, expect } from 'vitest';
import {
  COLLECTOR_ITEMS,
  defaultCollectors,
  emptyCollectorRecord,
  normalizeCollectorRecord,
  validateCollectorRecord,
  aggregateCollectorStatus,
  latestCollectorRecord,
  previousCollectorRecord,
  statusOfCollector,
  collectorsDueOn,
  collectorsForDate,
  addCollector,
  updateCollector,
  removeCollector,
  normalizeDays,
} from './collectors.js';

describe('집진기 기본 데이터', () => {
  it('기본 목록은 29대이고 K-30은 10·20·30일 점검', () => {
    const list = defaultCollectors();
    expect(list).toHaveLength(29);
    expect(list.find((c) => c.name === 'K-30 집진기').days).toEqual([10, 20, 30]);
    expect(list.find((c) => c.name === 'Surge Bin 집진기').days).toEqual([23]);
  });
});

describe('집진기 점검 기록', () => {
  it('emptyCollectorRecord: 항목 정의대로 초기화', () => {
    const r = emptyCollectorRecord('K-655 집진기', '2026-06-18', '홍길동');
    expect(r.collector).toBe('K-655 집진기');
    expect(r.items.dp.values.dp).toBe('');
    expect(r.items.pulse.status).toBe('ok');
    expect(r.items.fan.subs).toEqual({ Impeller: 'ok', Damper: 'ok' });
    expect(r.items.fanmotor.values.temp).toBe('');
    expect(Object.keys(r.items.exterior.subs)).toContain('후처리장치');
  });

  it('validateCollectorRecord: 숫자 아닌 차압은 오류', () => {
    const r = emptyCollectorRecord('K-655 집진기', '2026-06-18', '홍길동');
    expect(validateCollectorRecord(r)).toEqual([]);
    r.items.dp.values.dp = 'abc';
    expect(validateCollectorRecord(r).some((e) => e.includes('차압'))).toBe(true);
  });

  it('normalizeCollectorRecord: 누락 항목 보완', () => {
    const r = normalizeCollectorRecord({ collector: 'X', date: '2026-06-18', inspector: 'A', items: {} });
    expect(r.items.fan.subs.Impeller).toBe('ok');
    expect(r.items.dp.values.dp).toBe('');
  });

  it('aggregateCollectorStatus: 차압(noStatus)은 무시, 불량 항목 반영', () => {
    const r = emptyCollectorRecord('K-655 집진기', '2026-06-18', '홍길동');
    r.items.dp.status = 'bad'; // noStatus → 무시되어야 함
    expect(aggregateCollectorStatus(r)).toBe('ok');
    r.items.fan.subs.Damper = 'bad';
    expect(aggregateCollectorStatus(r)).toBe('bad');
  });
});

describe('집진기 일정/상태 선택자', () => {
  it('collectorsDueOn: 해당 일자에 점검 예정인 집진기', () => {
    const list = defaultCollectors();
    expect(collectorsDueOn(list, '2026-06-17')).toEqual(expect.arrayContaining(['K-654C 집진기', 'K-655 집진기']));
    expect(collectorsDueOn(list, '2026-06-20')).toContain('K-30 집진기'); // 10·20·30일
    expect(collectorsDueOn(list, '2026-06-08')).toEqual([]);
  });

  it('collectorsForDate: 예정 ∪ 그날 점검한 기록', () => {
    const list = defaultCollectors();
    const recs = [{ collector: 'Bunker 집진기', date: '2026-06-17' }];
    const out = collectorsForDate(list, recs, '2026-06-17');
    expect(out).toEqual(expect.arrayContaining(['K-655 집진기', 'Bunker 집진기']));
  });

  it('latest/previous/status by date', () => {
    const recs = [
      { collector: 'K-655 집진기', date: '2026-05-17', items: { fan: { subs: { Impeller: 'bad' } } } },
      { collector: 'K-655 집진기', date: '2026-06-17', items: { fan: { subs: { Impeller: 'ok' } } } },
    ];
    expect(latestCollectorRecord(recs, 'K-655 집진기').date).toBe('2026-06-17');
    expect(previousCollectorRecord(recs, 'K-655 집진기', '2026-06-17').date).toBe('2026-05-17');
    expect(previousCollectorRecord(recs, 'K-655 집진기', '2026-05-17')).toBe(null);
    expect(statusOfCollector(recs, 'K-655 집진기')).toBe('ok');
    expect(statusOfCollector(recs, '없는집진기')).toBe('none');
  });
});

describe('집진기 목록 CRUD', () => {
  it('normalizeDays: 문자열/범위/중복 정리', () => {
    expect(normalizeDays('10, 20, 30')).toEqual([10, 20, 30]);
    expect(normalizeDays([3, 3, 40, 0, 15])).toEqual([3, 15]);
  });

  it('add/update/remove', () => {
    let list = addCollector([], '신규 집진기', '5,15');
    expect(list[0]).toEqual({ name: '신규 집진기', days: [5, 15] });
    expect(() => addCollector(list, '신규 집진기')).toThrow();
    list = updateCollector(list, '신규 집진기', { days: '7' });
    expect(list[0].days).toEqual([7]);
    list = removeCollector(list, '신규 집진기');
    expect(list).toHaveLength(0);
  });
});

describe('항목 정의', () => {
  it('COLLECTOR_ITEMS는 5개 항목, 차압은 noStatus', () => {
    expect(COLLECTOR_ITEMS).toHaveLength(5);
    expect(COLLECTOR_ITEMS.find((d) => d.key === 'dp').noStatus).toBe(true);
  });
});
