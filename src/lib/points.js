// 점검 포인트(게임화) — 점검자 경쟁 유도를 위한 누적 점수 계산
// 규칙:
//   - 점검 1건당 기본점수 (base)
//   - 이상(불량/주의) 항목을 발견할 때마다 보너스 (perIssue) — 꼼꼼한 점검 유도
//
// 모두 순수 함수 (records 입력 → 점수/랭킹 출력)

import { openIssues } from './selectors.js';
import { INSPECTION_ITEMS } from './inspectionItems.js';

export const POINTS = { base: 10, perIssue: 2 };

// 한 점검 기록의 점수
export function recordPoints(record, itemDefs = INSPECTION_ITEMS) {
  if (!record) return 0;
  const issues = openIssues(record, itemDefs).length;
  return POINTS.base + issues * POINTS.perIssue;
}

// 점검자별 누적 집계 → 점수 내림차순 정렬
// opts.ym: 'YYYY-MM' 지정 시 해당 월만 집계
// opts.limit: 상위 N명 (기본 전체)
// opts.itemDefs: 항목 정의 (기본 벨트 INSPECTION_ITEMS)
export function leaderboard(records, opts = {}) {
  const { itemDefs = INSPECTION_ITEMS } = opts;
  return leaderboardCombined([{ records, itemDefs }], opts);
}

// 여러 종류(벨트+집진기 등)의 점검을 합산한 통합 랭킹
// groups: [{ records, itemDefs }]
export function leaderboardCombined(groups, opts = {}) {
  const { ym, limit } = opts;
  const map = {};
  for (const g of groups || []) {
    const defs = g.itemDefs || INSPECTION_ITEMS;
    const src = ym
      ? (g.records || []).filter((r) => String(r.date).slice(0, 7) === ym)
      : (g.records || []);
    for (const r of src) {
      const who = r.inspector || '(미지정)';
      if (!map[who]) map[who] = { inspector: who, points: 0, count: 0, issues: 0 };
      const issues = openIssues(r, defs).length;
      map[who].points += POINTS.base + issues * POINTS.perIssue;
      map[who].count += 1;
      map[who].issues += issues;
    }
  }
  const ranked = Object.values(map).sort(
    (a, b) =>
      b.points - a.points ||
      b.count - a.count ||
      String(a.inspector).localeCompare(String(b.inspector))
  );
  return limit ? ranked.slice(0, limit) : ranked;
}
