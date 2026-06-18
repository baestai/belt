// Supabase 영속화 계층.
// - fetchCloud(): 클라우드 상태를 읽어 앱 state 형태로 반환 (미초기화면 null)
// - seedCloud(state): 빈 클라우드에 기본 상태를 한 번 적재
// - syncToCloud(prev, next): 변경분(diff)만 클라우드에 반영
// - subscribeCloud(onChange): 다른 기기의 변경을 실시간 수신
//
// 설정(groups/inspectors/adminPw)은 settings의 'config' 한 행(JSON),
// 점검기록/일정은 각각 records/schedules 테이블의 행 단위로 저장한다.

import { supabase } from './supabaseClient.js';
import { defaultShiftGroups } from '../lib/shift.js';

const CONFIG_KEY = 'config';
const recordId = (r) => `${r.belt}__${r.date}`;

// ── 읽기 ────────────────────────────────────────────────
// 반환: { groups, inspectors, adminPw, schedules, records } 또는 null(미초기화)
export async function fetchCloud() {
  if (!supabase) return null;

  const [cfgRes, schedRes, recRes] = await Promise.all([
    supabase.from('settings').select('value').eq('key', CONFIG_KEY).maybeSingle(),
    supabase.from('schedules').select('*'),
    supabase.from('records').select('*'),
  ]);

  if (cfgRes.error) throw cfgRes.error;
  if (schedRes.error) throw schedRes.error;
  if (recRes.error) throw recRes.error;

  if (!cfgRes.data) return null; // config 없음 → 아직 시드 전

  const cfg = cfgRes.data.value || {};
  const schedules = {};
  for (const row of schedRes.data || []) {
    schedules[row.belt] = { nextDate: row.next_date, cycle: row.cycle };
  }
  const records = (recRes.data || []).map((row) => ({
    belt: row.belt,
    group: row.grp,
    date: row.date,
    inspector: row.inspector,
    items: row.items || {},
  }));

  return {
    groups: cfg.groups,
    inspectors: cfg.inspectors,
    pulleys: cfg.pulleys,
    quickMemos: cfg.quickMemos || [],
    beltConfigs: cfg.beltConfigs || {},
    adminPw: cfg.adminPw,
    shiftGroups: cfg.shiftGroups || defaultShiftGroups(),
    shiftPins: cfg.shiftPins || {},
    substitutions: cfg.substitutions || [],
    schedules,
    records,
  };
}

// ── 시드(최초 1회) ──────────────────────────────────────
export async function seedCloud(state) {
  if (!supabase) return;
  await upsertConfig(state);
  const schedRows = Object.entries(state.schedules || {}).map(([belt, s]) => ({
    belt,
    next_date: s?.nextDate ?? null,
    cycle: s?.cycle ?? null,
  }));
  if (schedRows.length) {
    const { error } = await supabase.from('schedules').upsert(schedRows);
    if (error) throw error;
  }
  const recRows = (state.records || []).map(toRecordRow);
  if (recRows.length) {
    const { error } = await supabase.from('records').upsert(recRows);
    if (error) throw error;
  }
}

// ── 변경분 동기화 ──────────────────────────────────────
export async function syncToCloud(prev, next) {
  if (!supabase) return;
  const tasks = [];

  // 설정(config): groups/inspectors/adminPw 중 하나라도 바뀌면 통째로 upsert
  if (configChanged(prev, next)) tasks.push(upsertConfig(next));

  // 일정(schedules): belt 단위 diff
  {
    const a = prev?.schedules || {};
    const b = next?.schedules || {};
    const changed = [];
    for (const belt of Object.keys(b)) {
      if (JSON.stringify(a[belt]) !== JSON.stringify(b[belt])) {
        changed.push({ belt, next_date: b[belt]?.nextDate ?? null, cycle: b[belt]?.cycle ?? null });
      }
    }
    const removed = Object.keys(a).filter((belt) => !(belt in b));
    if (changed.length) tasks.push(supabaseUpsert('schedules', changed));
    if (removed.length) tasks.push(supabaseDeleteIn('schedules', 'belt', removed));
  }

  // 기록(records): id(=belt__date) 단위 diff
  {
    const a = indexBy(prev?.records || [], recordId);
    const b = indexBy(next?.records || [], recordId);
    const changed = [];
    for (const id of Object.keys(b)) {
      if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) changed.push(toRecordRow(b[id]));
    }
    const removed = Object.keys(a).filter((id) => !(id in b));
    if (changed.length) tasks.push(supabaseUpsert('records', changed));
    if (removed.length) tasks.push(supabaseDeleteIn('records', 'id', removed));
  }

  const results = await Promise.allSettled(tasks);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
}

// ── 실시간 구독 ────────────────────────────────────────
// onChange: 원격 변경이 감지될 때 호출(보통 fetchCloud로 새로고침)
export function subscribeCloud(onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('belt-app')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ── 내부 헬퍼 ──────────────────────────────────────────
function toRecordRow(r) {
  return { id: recordId(r), belt: r.belt, grp: r.group ?? null, date: r.date, inspector: r.inspector ?? null, items: r.items || {} };
}

function configChanged(prev, next) {
  const pick = (s) =>
    JSON.stringify({ groups: s?.groups, inspectors: s?.inspectors, pulleys: s?.pulleys, quickMemos: s?.quickMemos, beltConfigs: s?.beltConfigs, adminPw: s?.adminPw, shiftGroups: s?.shiftGroups, shiftPins: s?.shiftPins, substitutions: s?.substitutions });
  return pick(prev) !== pick(next);
}

async function upsertConfig(state) {
  const value = {
    groups: state.groups,
    inspectors: state.inspectors,
    pulleys: state.pulleys,
    quickMemos: state.quickMemos,
    beltConfigs: state.beltConfigs,
    adminPw: state.adminPw,
    shiftGroups: state.shiftGroups,
    shiftPins: state.shiftPins,
    substitutions: state.substitutions,
  };
  const { error } = await supabase.from('settings').upsert({ key: CONFIG_KEY, value });
  if (error) throw error;
}

async function supabaseUpsert(table, rows) {
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw error;
}

async function supabaseDeleteIn(table, col, values) {
  const { error } = await supabase.from(table).delete().in(col, values);
  if (error) throw error;
}

function indexBy(arr, keyFn) {
  const out = {};
  for (const x of arr) out[keyFn(x)] = x;
  return out;
}
