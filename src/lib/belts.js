// 벨트 구역(구분) 기본 정의 및 순수 로직
import { INSPECTION_ITEMS } from './inspectionItems.js';

// 현재 유효한 점검 항목 키 집합 (제외된 항목이 구기록에 남아 있어도 무시)
const VALID_ITEM_KEYS = new Set(INSPECTION_ITEMS.map((d) => d.key));

export function cwf(prefix) {
  const arr = [];
  for (let i = 1; i <= 14; i++) arr.push(`${prefix} CWF #${i}`);
  return arr;
}

// 구역 순서를 보존하기 위해 배열 형태로 정의
export const GROUP_ORDER = ['SILO', '반입', '양탄', '장입', 'CWF', 'CMCP', '수송'];

export function defaultGroups() {
  return {
    SILO: ['S-101', 'S-102', 'S-103', 'S-111', 'S-112', 'S-113', 'S-211', 'S-212', 'S-213', 'S-214', 'S-215', 'S-216', 'S-217', 'S-314', 'S-315', 'S-316', 'S-317', 'C-701', 'C-702', 'C-703', 'C-704'],
    반입: ['C-683', 'C-684', 'C-685', 'C-686', 'C-687', 'C-688', 'C-689', 'C-690', 'S-318', 'S-319', 'S-320', 'S-321', 'S-322'],
    양탄: ['5A Surge Bin', '5B Surge Bin', 'C-611A', 'C-611B', 'C-612A', 'C-612B', 'C-613A', 'C-613B', 'C-614A', 'C-614B'],
    장입: ['C-620A', 'C-620B', 'C-621A', 'C-621B', 'C-622A', 'C-622B', 'C-623A', 'C-623B', 'C-624A', 'C-624B'],
    CWF: [...cwf('5A'), ...cwf('5B')],
    CMCP: ['C-631', 'C-632', 'C-633', 'C-634', 'WIC-631A', 'WIC-631B', 'WIC-633A', 'WIC-633B'],
    수송: ['K-651A', 'K-651B', 'K-652A', 'K-652B', 'K-654A', 'K-654B', 'K-654C', 'K-655', 'K-656', 'K-657', 'K-658', 'K-659', 'K-670', 'K-671', 'K-672', 'K-673', 'K-674', 'K-675', 'K-663', 'K-664', 'K-665'],
  };
}

// 그룹 객체를 [{ group, name }] 평면 배열로 변환
export function flattenBelts(groups) {
  const out = [];
  for (const g of Object.keys(groups)) {
    for (const name of groups[g]) out.push({ group: g, name });
  }
  return out;
}

export function beltExists(groups, name) {
  const n = String(name).trim();
  return Object.keys(groups).some((g) => groups[g].includes(n));
}

// 불변(immutable) 추가: 새 groups 객체를 반환
export function addBelt(groups, group, name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('벨트명을 입력하세요.');
  if (!groups[group]) throw new Error(`존재하지 않는 구역입니다: ${group}`);
  if (beltExists(groups, n)) throw new Error(`이미 존재하는 벨트명입니다: ${n}`);
  const next = {};
  for (const g of Object.keys(groups)) next[g] = g === group ? [...groups[g], n] : [...groups[g]];
  return next;
}

// 불변 삭제: 새 groups 객체를 반환
export function removeBelt(groups, name) {
  const n = String(name).trim();
  const next = {};
  for (const g of Object.keys(groups)) next[g] = groups[g].filter((b) => b !== n);
  return next;
}

export function countBelts(groups) {
  return flattenBelts(groups).length;
}

export const STATUS = { OK: 'ok', WARN: 'warn', BAD: 'bad' };

export function statusLabel(s) {
  return s === STATUS.OK ? '정상' : s === STATUS.WARN ? '주의' : '이상';
}

// 점검 결과로부터 종합 상태 산출.
// results: { itemKey: { status, subs?: {k:status}, ... } } 형태에서 가장 나쁜 상태 채택
export function aggregateStatus(record) {
  if (!record || !record.items) return STATUS.OK;
  let worst = STATUS.OK;
  const rank = { ok: 0, warn: 1, bad: 2 };
  const consider = (s) => {
    if (rank[s] > rank[worst]) worst = s;
  };
  for (const key of Object.keys(record.items)) {
    if (!VALID_ITEM_KEYS.has(key)) continue; // 제외된 항목(RSC·안전장치 등)은 무시
    const it = record.items[key];
    if (!it) continue;
    if (it.status) consider(it.status);
    if (it.subs) for (const k of Object.keys(it.subs)) consider(it.subs[k]);
  }
  return worst;
}

// 검색어 + 상태 필터 적용
export function filterBelts(beltList, { query = '', status = null } = {}, statusOf = () => STATUS.OK) {
  const q = String(query).trim().toLowerCase();
  return beltList.filter((b) => {
    if (q && !b.name.toLowerCase().includes(q)) return false;
    if (status && statusOf(b.name) !== status) return false;
    return true;
  });
}

export function statusCounts(beltList, statusOf) {
  const c = { ok: 0, warn: 0, bad: 0 };
  for (const b of beltList) {
    const s = statusOf(b.name);
    if (c[s] === undefined) c[s] = 0;
    c[s] += 1;
  }
  return c;
}
