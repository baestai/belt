import { describe, it, expect } from 'vitest';
import { beltTempSeries, collectorFieldSeries } from './trends.js';

describe('측정값 추이 추출', () => {
  it('벨트 Pulley 최고온도를 날짜 오름차순으로 추출', () => {
    const records = [
      { belt: 'A', date: '2026-06-02', items: { pulley: { temps: { Head: { L: '40', R: '55' }, Tail: { L: '30', R: '' } } } } },
      { belt: 'A', date: '2026-05-01', items: { pulley: { temps: { Head: { L: '60', R: '50' } } } } },
      { belt: 'B', date: '2026-06-02', items: { pulley: { temps: { Head: { L: '99', R: '99' } } } } },
    ];
    const s = beltTempSeries(records, 'A');
    expect(s).toEqual([
      { date: '2026-05-01', value: 60 },
      { date: '2026-06-02', value: 55 },
    ]);
  });

  it('온도값이 전혀 없는 점검은 제외', () => {
    const records = [
      { belt: 'A', date: '2026-06-02', items: { pulley: { temps: { Head: { L: '', R: '' } } } } },
    ];
    expect(beltTempSeries(records, 'A')).toEqual([]);
  });

  it('집진기 차압 시계열 추출', () => {
    const records = [
      { collector: 'K', date: '2026-06-02', items: { dp: { values: { dp: '120' } } } },
      { collector: 'K', date: '2026-05-02', items: { dp: { values: { dp: '100' } } } },
      { collector: 'X', date: '2026-06-02', items: { dp: { values: { dp: '999' } } } },
    ];
    expect(collectorFieldSeries(records, 'K', 'dp', 'dp')).toEqual([
      { date: '2026-05-02', value: 100 },
      { date: '2026-06-02', value: 120 },
    ]);
  });
});
