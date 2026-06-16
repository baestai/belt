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
export function recordPoints(record) {
  if (!record) return 0;
  const issues = openIssues(record, INSPECTION_ITEMS).length;
  return POINTS.base + issues * POINTS.perIssue;
}

// 점검자별 누적 집계 → 점수 내림차순 정렬
// opts.ym: 'YYYY-MM' 지정 시 해당 월만 집계
// opts.limit: 상위 N명 (기본 전체)
export function leaderboard(records, opts = {}) {
  const { ym, limit } = opts;
  const src = ym ? records.filter((r) => String(r.date).slice(0, 7) === ym) : records;
  const map = {};
  for (const r of src) {
    const who = r.inspector || '(미지정)';
    if (!map[who]) map[who] = { inspector: who, points: 0, count: 0, issues: 0 };
    const issues = openIssues(r, INSPECTION_ITEMS).length;
    map[who].points += POINTS.base + issues * POINTS.perIssue;
    map[who].count += 1;
    map[who].issues += issues;
  }
  const ranked = Object.values(map).sort(
    (a, b) =>
      b.points - a.points ||
      b.count - a.count ||
      String(a.inspector).localeCompare(String(b.inspector))
  );
  return limit ? ranked.slice(0, limit) : ranked;
}
