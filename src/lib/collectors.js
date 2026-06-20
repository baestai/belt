// 집진기(Dust Collector) 점검 — 벨트와 독립된 장비 카테고리.
// 벨트 점검 로직을 깨뜨리지 않도록 집진기 전용 순수 함수로 자체 구성한다.
//
// 점검 항목(현장 협의):
//   1) 차압        : 수치만 입력 (㎜Aq) — 양호/불량 없음
//   2) 탈진(펄스)  : 양호/불량
//   3) Main Fan    : Impeller / Damper 양호/불량
//   4) Main Fan Motor : 양호/불량 + 베어링 온도(℃)
//   5) Chamber·Duct·Hood·후처리장치·외관 : 각 양호/불량 (현장 편집 가능)

export const COLLECTOR_ITEMS = [
  { key: 'dp', no: 1, title: '차압', type: 'num', noStatus: true, fields: [{ key: 'dp', label: '차압', unit: '㎜Aq' }] },
  { key: 'pulse', no: 2, title: '탈진 (펄스)', type: 'yn' },
  { key: 'fan', no: 3, title: 'Main Fan — Impeller / Damper', type: 'subs', subs: ['Impeller', 'Damper'] },
  {
    key: 'fanmotor',
    no: 4,
    title: 'Main Fan — Ampere / 진동',
    type: 'num',
    fields: [
      { key: 'ampere', label: 'Fan Motor Ampere', unit: 'A' },
      { key: 'fanvib', label: 'Fan 부하측 진동', unit: 'mm' },
      { key: 'motorvib', label: 'Fan Motor 부하측 진동', unit: 'mm' },
    ],
  },
  {
    key: 'exterior',
    no: 5,
    title: 'Chamber·Duct·Hood·후처리·외관',
    type: 'subs',
    editable: true,
    subs: ['Chamber', 'Duct', 'Hood', '후처리장치', '외관상태'],
  },
];

// 기본 집진기 목록 + 월간 점검일(매월 해당 일자, 복수 가능)
export function defaultCollectors() {
  return [
    { name: 'Surge Bin 집진기', days: [23] },
    { name: 'Crusher 집진기', days: [2] },
    { name: 'Blending Bin 집진기', days: [2] },
    { name: 'Buffer Bin 집진기', days: [3] },
    { name: '5A Coal Bin 집진기', days: [9] },
    { name: '5B Coal Bin 집진기', days: [9] },
    { name: 'K-10 집진기', days: [6] },
    { name: 'K-20 집진기', days: [22] },
    { name: 'K-30 집진기', days: [10, 20, 30] },
    { name: '5A Coke Sampler 집진기', days: [13] },
    { name: '5B Coke Sampler 집진기', days: [13] },
    { name: '비상Bunker 집진기', days: [14] },
    { name: 'K-654C 집진기', days: [17] },
    { name: 'K-655 집진기', days: [17] },
    { name: 'K-656 집진기', days: [18] },
    { name: 'K-657 집진기', days: [18] },
    { name: 'Bunker 집진기', days: [11] },
    { name: '선별장치 집진기', days: [19] },
    { name: 'K-664 집진기', days: [22] },
    { name: 'C-683 집진기', days: [4] },
    { name: 'C-687 집진기', days: [30] },
    { name: 'C-688 집진기', days: [25] },
    { name: 'S-314 집진기', days: [27] },
    { name: 'S-315 집진기', days: [26] },
    { name: 'S-319 집진기', days: [29] },
    { name: 'S-321 집진기', days: [29] },
    { name: 'C-701 집진기', days: [24] },
    { name: '5A Coal Bin Pneumatic 집진기', days: [5] },
    { name: '5B Coal Bin Pneumatic 집진기', days: [5] },
  ];
}

const STATUS_RANK = { ok: 0, warn: 1, bad: 2 };

// 빈 집진기 점검 기록 생성. items 정의(기본 COLLECTOR_ITEMS)에 맞춰 초기화
export function emptyCollectorRecord(name, date, inspector, itemDefs = COLLECTOR_ITEMS) {
  const items = {};
  for (const def of itemDefs) {
    const it = { status: 'ok', memo: '' };
    if (def.type === 'subs') {
      it.subs = {};
      for (const s of def.subs) it.subs[s] = 'ok';
    }
    if (def.type === 'num') {
      it.values = {};
      for (const f of def.fields) it.values[f.key] = '';
    }
    items[def.key] = it;
  }
  return { collector: name, date, inspector, items };
}

// 기존 기록을 현재 항목 정의에 맞춰 누락 키 보완
export function normalizeCollectorRecord(record, itemDefs = COLLECTOR_ITEMS) {
  const items = { ...(record.items || {}) };
  for (const def of itemDefs) {
    const it = { status: 'ok', memo: '', ...(items[def.key] || {}) };
    if (def.type === 'subs') {
      const subs = { ...(it.subs || {}) };
      for (const s of def.subs) if (!(s in subs)) subs[s] = 'ok';
      it.subs = subs;
    }
    if (def.type === 'num') {
      const values = { ...(it.values || {}) };
      for (const f of def.fields) if (!(f.key in values)) values[f.key] = '';
      it.values = values;
    }
    items[def.key] = it;
  }
  return { ...record, items };
}

// 검증: 누락/형식 오류 목록 (빈 배열이면 유효)
export function validateCollectorRecord(record, itemDefs = COLLECTOR_ITEMS) {
  const errors = [];
  if (!record) return ['기록이 없습니다.'];
  if (!record.collector) errors.push('집진기가 지정되지 않았습니다.');
  if (!record.date) errors.push('점검일이 없습니다.');
  if (!record.inspector) errors.push('점검자가 지정되지 않았습니다.');
  for (const def of itemDefs) {
    const it = record.items && record.items[def.key];
    if (!it) {
      errors.push(`항목 누락: ${def.title}`);
      continue;
    }
    if (def.type === 'num') {
      for (const f of def.fields) {
        const v = it.values && it.values[f.key];
        if (v !== '' && v != null && Number.isNaN(Number(v))) {
          errors.push(`${def.title} ${f.label}: 숫자만 입력 가능`);
        }
      }
    }
  }
  return errors;
}

// 기록의 종합 상태(ok/warn/bad). noStatus 항목의 status는 무시
export function aggregateCollectorStatus(record, itemDefs = COLLECTOR_ITEMS) {
  if (!record || !record.items) return 'ok';
  const noStatus = new Set(itemDefs.filter((d) => d.noStatus).map((d) => d.key));
  let worst = 'ok';
  const consider = (s) => {
    if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  };
  for (const key of Object.keys(record.items)) {
    const it = record.items[key];
    if (!it) continue;
    if (it.status && !noStatus.has(key)) consider(it.status);
    if (it.subs) for (const k of Object.keys(it.subs)) consider(it.subs[k]);
  }
  return worst;
}

// 특정 집진기의 기록(최신순)
function recordsForCollector(records, name) {
  return (records || [])
    .filter((r) => r.collector === name)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function latestCollectorRecord(records, name) {
  return recordsForCollector(records, name)[0] || null;
}

// 점검일(전월) 비교용: 기준일 이전(미만)의 가장 최근 기록
export function previousCollectorRecord(records, name, beforeDate) {
  return (
    recordsForCollector(records, name).find(
      (r) => String(r.date).localeCompare(String(beforeDate)) < 0
    ) || null
  );
}

export function statusOfCollector(records, name) {
  const rec = latestCollectorRecord(records, name);
  return rec ? aggregateCollectorStatus(rec) : 'none';
}

// 해당 날짜에 점검 예정인 집진기 이름 목록 (매월 days 일자 기준)
export function collectorsDueOn(collectors, dateStr) {
  const d = Number(String(dateStr).split('-')[2]);
  return (collectors || [])
    .filter((c) => (c.days || []).includes(d))
    .map((c) => c.name);
}

// 해당 날짜에 화면에 표시할 집진기: 예정 ∪ 실제 점검 기록
export function collectorsForDate(collectors, records, dateStr) {
  const due = new Set(collectorsDueOn(collectors, dateStr));
  for (const r of records || []) if (r.date === dateStr) due.add(r.collector);
  return [...due];
}

export function collectorsInspectedOn(records, dateStr) {
  return (records || []).filter((r) => r.date === dateStr).map((r) => r.collector);
}

// 집진기 목록 CRUD (불변)
export function addCollector(list, name, days = []) {
  const n = String(name || '').trim();
  if (!n) throw new Error('집진기 이름을 입력하세요.');
  if ((list || []).some((c) => c.name === n)) throw new Error('이미 등록된 집진기입니다.');
  return [...(list || []), { name: n, days: normalizeDays(days) }];
}

export function updateCollector(list, name, patch = {}) {
  return (list || []).map((c) => {
    if (c.name !== name) return c;
    const next = { ...c, ...patch };
    if (patch.days) next.days = normalizeDays(patch.days);
    next.name = String(next.name || '').trim() || c.name;
    return next;
  });
}

export function removeCollector(list, name) {
  return (list || []).filter((c) => c.name !== name);
}

// 점검일 입력 정규화: 1~31 사이 정수 배열, 중복 제거·정렬. 문자열("10,20") 허용
export function normalizeDays(days) {
  let arr = days;
  if (typeof days === 'string') arr = days.split(/[,\s]+/);
  const out = [];
  for (const d of arr || []) {
    const n = parseInt(d, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 31 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}
