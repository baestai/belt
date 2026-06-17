import { describe, it, expect } from 'vitest';
import {
  defaultGroups,
  GROUP_ORDER,
  cwf,
  flattenBelts,
  beltExists,
  addBelt,
  removeBelt,
  countBelts,
  aggregateStatus,
  filterBelts,
  statusCounts,
  statusLabel,
  STATUS,
} from './belts.js';

describe('기본 구역/벨트 데이터', () => {
  it('7개 구역이 정의된다', () => {
    const g = defaultGroups();
    expect(Object.keys(g).sort()).toEqual([...GROUP_ORDER].sort());
  });

  it('구역별 벨트 수가 정확하다', () => {
    const g = defaultGroups();
    expect(g.SILO.length).toBe(21);
    expect(g['반입'].length).toBe(13);
    expect(g['양탄'].length).toBe(10);
    expect(g['장입'].length).toBe(10);
    expect(g.CWF.length).toBe(28);
    expect(g.CMCP.length).toBe(8);
    expect(g['수송'].length).toBe(21);
  });

  it('cwf 헬퍼는 14개를 생성한다', () => {
    const list = cwf('5A');
    expect(list.length).toBe(14);
    expect(list[0]).toBe('5A CWF #1');
    expect(list[13]).toBe('5A CWF #14');
  });

  it('전체 벨트 수 합계', () => {
    expect(countBelts(defaultGroups())).toBe(111);
  });

  it('중복 벨트명이 없다', () => {
    const names = flattenBelts(defaultGroups()).map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('벨트 추가/삭제', () => {
  it('추가는 새 객체를 반환하고 원본은 불변', () => {
    const g = defaultGroups();
    const before = g.SILO.length;
    const g2 = addBelt(g, 'SILO', 'S-999');
    expect(g.SILO.length).toBe(before);
    expect(g2.SILO).toContain('S-999');
    expect(beltExists(g2, 'S-999')).toBe(true);
  });

  it('빈 이름 추가 시 에러', () => {
    expect(() => addBelt(defaultGroups(), 'SILO', '  ')).toThrow();
  });

  it('중복 이름 추가 시 에러', () => {
    expect(() => addBelt(defaultGroups(), 'SILO', 'S-101')).toThrow(/이미 존재/);
  });

  it('없는 구역에 추가 시 에러', () => {
    expect(() => addBelt(defaultGroups(), '없는구역', 'X-1')).toThrow();
  });

  it('삭제는 해당 벨트를 제거', () => {
    const g2 = removeBelt(defaultGroups(), 'S-101');
    expect(beltExists(g2, 'S-101')).toBe(false);
    expect(countBelts(g2)).toBe(110);
  });
});

describe('종합 상태 산출', () => {
  it('기록 없으면 ok', () => {
    expect(aggregateStatus(null)).toBe(STATUS.OK);
  });

  it('가장 나쁜 상태를 채택한다', () => {
    const rec = {
      items: {
        spillage: { status: 'ok' },
        belt: { status: 'warn' },
        motor: { subs: { 진동: 'ok', 발열: 'bad' } },
      },
    };
    expect(aggregateStatus(rec)).toBe('bad');
  });

  it('warn까지만 있으면 warn', () => {
    const rec = { items: { spillage: { status: 'ok' }, belt: { status: 'warn' } } };
    expect(aggregateStatus(rec)).toBe('warn');
  });

  it('제외된 항목(rsc·safety)은 종합 상태에 반영되지 않는다', () => {
    const rec = { items: { spillage: { status: 'ok' }, rsc: { subs: { Roller: 'bad' } }, safety: { status: 'bad' } } };
    expect(aggregateStatus(rec)).toBe('ok');
  });
});

describe('필터/카운트', () => {
  const belts = [
    { group: 'SILO', name: 'S-101' },
    { group: 'SILO', name: 'S-102' },
    { group: 'CWF', name: '5A CWF #1' },
  ];
  const statusOf = (n) => (n === 'S-101' ? 'bad' : n === 'S-102' ? 'warn' : 'ok');

  it('검색어 필터 (대소문자 무시)', () => {
    expect(filterBelts(belts, { query: 'cwf' }, statusOf).length).toBe(1);
    expect(filterBelts(belts, { query: 'S-10' }, statusOf).length).toBe(2);
  });

  it('상태 필터', () => {
    expect(filterBelts(belts, { status: 'bad' }, statusOf).map((b) => b.name)).toEqual(['S-101']);
  });

  it('상태 카운트', () => {
    const c = statusCounts(belts, statusOf);
    expect(c).toEqual({ ok: 1, warn: 1, bad: 1 });
  });

  it('상태 라벨', () => {
    expect(statusLabel('ok')).toBe('정상');
    expect(statusLabel('warn')).toBe('주의');
    expect(statusLabel('bad')).toBe('이상');
  });
});
