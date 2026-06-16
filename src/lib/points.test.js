import { describe, it, expect } from 'vitest';
import { recordPoints, leaderboard, POINTS } from './points.js';
import { emptyRecord } from './inspectionItems.js';

function rec(belt, inspector, date, mutate) {
  const r = emptyRecord(belt, 'CWF', date, inspector);
  if (mutate) mutate(r);
  return r;
}

describe('점검 포인트', () => {
  it('이상 없는 점검은 기본점수만', () => {
    expect(recordPoints(rec('A', '홍길동', '2026-06-01'))).toBe(POINTS.base);
  });

  it('이상 발견 시 보너스 가산', () => {
    const r = rec('A', '홍길동', '2026-06-01', (x) => {
      x.items.rsc.subs.Roller = 'bad';
      x.items.safety.status = 'bad';
    });
    expect(recordPoints(r)).toBe(POINTS.base + 2 * POINTS.perIssue);
  });

  it('null 기록은 0점', () => {
    expect(recordPoints(null)).toBe(0);
  });

  it('점검자별 누적 + 점수 내림차순', () => {
    const records = [
      rec('A', '홍길동', '2026-06-01'),
      rec('B', '홍길동', '2026-06-02', (x) => (x.items.belt.status = 'bad')),
      rec('C', '김철수', '2026-06-03'),
    ];
    const lb = leaderboard(records);
    expect(lb[0].inspector).toBe('홍길동');
    expect(lb[0].points).toBe(POINTS.base * 2 + POINTS.perIssue);
    expect(lb[0].count).toBe(2);
    expect(lb[0].issues).toBe(1);
    expect(lb[1].inspector).toBe('김철수');
    expect(lb[1].points).toBe(POINTS.base);
  });

  it('월(ym) 필터 + 상위 N 제한', () => {
    const records = [
      rec('A', '홍길동', '2026-06-01'),
      rec('B', '김철수', '2026-05-15'),
    ];
    const lb = leaderboard(records, { ym: '2026-06', limit: 10 });
    expect(lb).toHaveLength(1);
    expect(lb[0].inspector).toBe('홍길동');
  });

  it('점검자 미지정은 (미지정)으로 집계', () => {
    const r = rec('A', '', '2026-06-01');
    r.inspector = '';
    const lb = leaderboard([r]);
    expect(lb[0].inspector).toBe('(미지정)');
  });
});
