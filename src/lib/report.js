// 월간 점검 보고서 집계 + 엑셀(CSV) 내보내기

import { INSPECTION_ITEMS } from './inspectionItems.js';
import { aggregateStatus, statusLabel } from './belts.js';
import { COLLECTOR_ITEMS, aggregateCollectorStatus } from './collectors.js';

export function ymKey(dateStr) {
  // 'YYYY-MM-DD' -> 'YYYY-MM'
  return String(dateStr || '').slice(0, 7);
}

// 특정 월(records 중 해당 월) 보고서 데이터 집계
// records: 점검 기록 배열
export function monthlyReport(records, ym) {
  const inMonth = records.filter((r) => ymKey(r.date) === ym);
  let ok = 0,
    warn = 0,
    bad = 0;
  const rows = inMonth.map((r) => {
    const st = aggregateStatus(r);
    if (st === 'ok') ok++;
    else if (st === 'warn') warn++;
    else bad++;
    return { belt: r.belt, group: r.group, date: r.date, inspector: r.inspector, status: st };
  });
  return {
    ym,
    total: inMonth.length,
    counts: { ok, warn, bad },
    rows,
  };
}

// 점검 기록을 표(2차원 배열)로 변환 — 엑셀 헤더 + 행
export function recordsToTable(records) {
  const header = ['벨트', '구역', '점검일', '점검자', '종합상태'];
  // 항목별 결과 컬럼 추가
  for (const def of INSPECTION_ITEMS) header.push(def.title);
  header.push('메모');

  const rows = records.map((r) => {
    const row = [r.belt, r.group, r.date, r.inspector, statusLabel(aggregateStatus(r))];
    const memos = [];
    for (const def of INSPECTION_ITEMS) {
      const it = (r.items && r.items[def.key]) || {};
      let cell;
      if (def.type === 'subs' || def.type === 'pulley') {
        const bad = Object.keys(it.subs || {}).filter((k) => it.subs[k] !== 'ok');
        cell = bad.length ? `불량: ${bad.join(', ')}` : '양호';
      } else if (def.type === 'num') {
        const parts = def.fields.map((f) => `${f.label} ${(it.values && it.values[f.key]) || '-'}${f.unit}`);
        cell = `${statusLabel(it.status || 'ok')} (${parts.join(', ')})`;
      } else {
        cell = statusLabel(it.status || 'ok');
      }
      row.push(cell);
      if (it.memo) memos.push(`${def.title}: ${it.memo}`);
    }
    row.push(memos.join(' / '));
    return row;
  });

  return [header, ...rows];
}

// ── 집진기 보고서 ──────────────────────────────────────
export function collectorMonthlyReport(records, ym) {
  const inMonth = (records || []).filter((r) => ymKey(r.date) === ym);
  let ok = 0, warn = 0, bad = 0;
  const rows = inMonth.map((r) => {
    const st = aggregateCollectorStatus(r);
    if (st === 'ok') ok++;
    else if (st === 'warn') warn++;
    else bad++;
    return { collector: r.collector, date: r.date, inspector: r.inspector, status: st };
  });
  return { ym, total: inMonth.length, counts: { ok, warn, bad }, rows };
}

// 집진기 점검 기록 → 표(2차원 배열)
export function collectorRecordsToTable(records) {
  const header = ['집진기', '점검일', '점검자', '종합상태'];
  for (const def of COLLECTOR_ITEMS) header.push(def.title);
  header.push('메모');

  const rows = (records || []).map((r) => {
    const row = [r.collector, r.date, r.inspector, statusLabel(aggregateCollectorStatus(r))];
    const memos = [];
    for (const def of COLLECTOR_ITEMS) {
      const it = (r.items && r.items[def.key]) || {};
      let cell;
      if (def.type === 'subs') {
        const bad = Object.keys(it.subs || {}).filter((k) => it.subs[k] !== 'ok');
        cell = bad.length ? `불량: ${bad.join(', ')}` : '양호';
      } else if (def.type === 'num') {
        const parts = def.fields.map((f) => `${f.label} ${(it.values && it.values[f.key]) || '-'}${f.unit}`);
        cell = def.noStatus ? parts.join(', ') : `${statusLabel(it.status || 'ok')} (${parts.join(', ')})`;
      } else {
        cell = statusLabel(it.status || 'ok');
      }
      row.push(cell);
      if (it.memo) memos.push(`${def.title}: ${it.memo}`);
    }
    row.push(memos.join(' / '));
    return row;
  });
  return [header, ...rows];
}

// CSV 직렬화 (Excel 호환: 큰따옴표 이스케이프 + BOM은 다운로드 시 부착)
export function toCSV(table) {
  return table
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? '' : String(cell);
          if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
          return s;
        })
        .join(',')
    )
    .join('\r\n');
}

// 브라우저 다운로드 트리거 (테스트에서는 호출되지 않음)
export function downloadCSV(filename, table) {
  const csv = '﻿' + toCSV(table); // BOM for Excel 한글
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
