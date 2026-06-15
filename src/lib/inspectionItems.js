// 점검 항목 정의 (점검모드 폼 + 검증)
// type:
//   'yn'    : 양호/불량 단일
//   'subs'  : 하위 항목들 각각 양호/불량 (rows)
//   'pulley': Pulley(베어링 양호/불량 + 온도) 행들 — 구분 목록은 state.pulleys로 관리(동적)
//   'num'   : 양호/불량 + 수치 입력 필드들

// Pulley 기본 구분 (관리모드에서 추가/삭제 가능)
export const DEFAULT_PULLEYS = [
  'Head', 'Tail', 'Drive', 'Snub', 'Tension', 'Head Bend', 'Tail Bend', 'Take Up',
];

export const INSPECTION_ITEMS = [
  { key: 'spillage', no: 1, title: '낙광 상태', type: 'yn' },
  { key: 'belt', no: 2, title: '벨트 상태 / 마모', type: 'yn' },
  {
    key: 'rsc',
    no: 3,
    title: 'RSC (Roller · Skirt · Cleaner)',
    type: 'subs',
    subs: ['Roller', 'Skirt', 'Cleaner'],
  },
  {
    key: 'pulley',
    no: 4,
    title: 'Pulley — 베어링 상태 / 온도',
    type: 'pulley',
  },
  {
    key: 'motor',
    no: 5,
    title: 'Motor',
    type: 'subs',
    subs: ['진동', '발열', '이음'],
  },
  {
    key: 'reducer',
    no: 6,
    title: '감속기',
    type: 'subs',
    subs: ['진동', '발열', '이음'],
  },
  {
    key: 'electric',
    no: 7,
    title: '전기장치',
    type: 'subs',
    subs: ['Chute S/W', 'Speed S/W', 'Skew S/W', 'Pull Cord S/W', 'Tear Detector'],
  },
  {
    key: 'lubrication',
    no: 8,
    title: '급유 / 급지',
    type: 'subs',
    subs: ['급유 (Oil)', '급지 (Grease)'],
  },
  { key: 'safety', no: 9, title: '안전장치 / 기타', type: 'yn' },
];

// 빈 점검 기록 생성 (기본 상태 ok). pulleys: Pulley 구분 목록(동적)
export function emptyRecord(beltName, group, date, inspector, pulleys = DEFAULT_PULLEYS) {
  const items = {};
  for (const def of INSPECTION_ITEMS) {
    const it = { status: 'ok', memo: '' };
    if (def.type === 'subs') {
      it.subs = {};
      for (const s of def.subs) it.subs[s] = 'ok';
    }
    if (def.type === 'pulley') {
      it.subs = {};
      it.temps = {};
      for (const s of pulleys) {
        it.subs[s] = 'ok';
        it.temps[s] = '';
      }
    }
    if (def.type === 'num') {
      it.values = {};
      for (const f of def.fields) it.values[f.key] = '';
    }
    items[def.key] = it;
  }
  return { belt: beltName, group, date, inspector, items };
}

// 기존 기록을 현재 항목 정의/Pulley 목록에 맞춰 누락 키를 채운 새 기록 반환.
// (항목 구조가 바뀌었거나 Pulley가 추가된 경우 폼이 깨지지 않도록 정규화)
export function normalizeRecord(record, pulleys = DEFAULT_PULLEYS) {
  const items = { ...(record.items || {}) };
  for (const def of INSPECTION_ITEMS) {
    const it = { status: 'ok', memo: '', ...(items[def.key] || {}) };
    if (def.type === 'subs') {
      const subs = { ...(it.subs || {}) };
      for (const s of def.subs) if (!(s in subs)) subs[s] = 'ok';
      it.subs = subs;
    }
    if (def.type === 'pulley') {
      const subs = { ...(it.subs || {}) };
      const temps = { ...(it.temps || {}) };
      for (const s of pulleys) {
        if (!(s in subs)) subs[s] = 'ok';
        if (!(s in temps)) temps[s] = '';
      }
      it.subs = subs;
      it.temps = temps;
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

// Pulley 구분 추가/삭제 (불변)
export function addPulley(list, name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Pulley 구분명을 입력하세요.');
  if (list.includes(n)) throw new Error('이미 등록된 Pulley 구분입니다.');
  return [...list, n];
}

export function removePulley(list, name) {
  return list.filter((x) => x !== name);
}

// 점검 기록 검증: 누락/형식 오류 목록 반환 (빈 배열이면 유효)
export function validateRecord(record) {
  const errors = [];
  if (!record) return ['기록이 없습니다.'];
  if (!record.belt) errors.push('벨트가 지정되지 않았습니다.');
  if (!record.date) errors.push('점검일이 없습니다.');
  if (!record.inspector) errors.push('점검자가 지정되지 않았습니다.');
  for (const def of INSPECTION_ITEMS) {
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
    if (def.type === 'pulley') {
      for (const s of Object.keys(it.temps || {})) {
        const t = it.temps[s];
        if (t !== '' && t != null && Number.isNaN(Number(t))) {
          errors.push(`Pulley ${s} 온도: 숫자만 입력 가능`);
        }
      }
    }
  }
  return errors;
}
