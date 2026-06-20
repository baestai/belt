import { useMemo, useState } from 'react';
import { flattenBelts, aggregateStatus } from '../lib/belts.js';
import { latestRecord, beltsScheduledOn, beltsInspectedOn } from '../lib/selectors.js';
import { INSPECTION_ITEMS } from '../lib/inspectionItems.js';
import {
  COLLECTOR_ITEMS,
  latestCollectorRecord,
  aggregateCollectorStatus,
  collectorsDueOn,
  collectorsInspectedOn,
} from '../lib/collectors.js';
import { shiftsOnDate, SHIFT_LABEL, SHIFT_GROUPS } from '../lib/shift.js';

const STATUS_KO = { ok: '정상', warn: '주의', bad: '이상' };
const STATUS_COLOR = { ok: 'ok', warn: 'warn', bad: 'bad', none: 'none' };

// 벨트 최신 기록에서 이상/주의 항목 추출
function extractBeltIssues(record) {
  if (!record?.items) return [];
  const out = [];
  for (const def of INSPECTION_ITEMS) {
    const it = record.items[def.key];
    if (!it) continue;
    if (it.status && it.status !== 'ok') {
      out.push({ title: def.title, sub: null, status: it.status, memo: it.memo || '' });
    }
    if (it.subs) {
      for (const [k, s] of Object.entries(it.subs)) {
        if (s !== 'ok') out.push({ title: def.title, sub: k, status: s, memo: it.memo || '' });
      }
    }
  }
  return out;
}

// 집진기 최신 기록에서 이상/주의 항목 추출
function extractCollectorIssues(record) {
  if (!record?.items) return [];
  const noStatus = new Set(COLLECTOR_ITEMS.filter((d) => d.noStatus).map((d) => d.key));
  const out = [];
  for (const def of COLLECTOR_ITEMS) {
    if (noStatus.has(def.key)) continue;
    const it = record.items[def.key];
    if (!it) continue;
    if (it.status && it.status !== 'ok') {
      out.push({ title: def.title, sub: null, status: it.status, memo: it.memo || '' });
    }
    if (it.subs) {
      for (const [k, s] of Object.entries(it.subs)) {
        if (s !== 'ok') out.push({ title: def.title, sub: k, status: s });
      }
    }
  }
  return out;
}

function IssueItem({ entry, type }) {
  const [open, setOpen] = useState(false);
  const worst = entry.items.some((i) => i.status === 'bad') ? 'bad' : 'warn';
  return (
    <div className="dash-issue-entry">
      <button className="dash-issue-head" onClick={() => setOpen((v) => !v)}>
        <span className={`dot ${worst}`} />
        <span className="dash-issue-name">
          {type === 'belt' ? `${entry.name} [${entry.group}]` : entry.name}
        </span>
        <span className="dash-issue-date">{entry.date}</span>
        <span className="dash-issue-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="dash-issue-body">
          {entry.items.map((it, i) => (
            <div key={i} className="dash-sub-issue">
              <span className={`ibadge ${it.status}`}>{it.status === 'bad' ? '불량' : '주의'}</span>
              <span>{it.title}{it.sub ? ` › ${it.sub}` : ''}</span>
              {it.memo && <span className="dash-sub-memo"> ({it.memo})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({
  today,
  groups,
  records,
  schedules,
  collectors,
  collectorRecords,
  substitutions,
  shiftGroups,
  onGoField,
  onGoAdmin,
}) {
  // ── 오늘 벨트 점검 현황 ──────────────────────────────────
  const beltStats = useMemo(() => {
    const scheduled = beltsScheduledOn(schedules, today);
    const inspected = beltsInspectedOn(records, today);
    const todayRecs = records.filter((r) => r.date === today);
    let ok = 0, warn = 0, bad = 0;
    for (const r of todayRecs) {
      const s = aggregateStatus(r);
      if (s === 'ok') ok++;
      else if (s === 'warn') warn++;
      else bad++;
    }
    return { scheduled: scheduled.length, done: inspected.length, ok, warn, bad };
  }, [schedules, records, today]);

  // ── 오늘 집진기 점검 현황 ────────────────────────────────
  const collectorStats = useMemo(() => {
    const due = collectorsDueOn(collectors, today);
    const done = collectorsInspectedOn(collectorRecords, today);
    const todayRecs = (collectorRecords || []).filter((r) => r.date === today);
    let ok = 0, warn = 0, bad = 0;
    for (const r of todayRecs) {
      const s = aggregateCollectorStatus(r);
      if (s === 'ok') ok++;
      else if (s === 'warn') warn++;
      else bad++;
    }
    return { scheduled: due.length, done: done.length, ok, warn, bad };
  }, [collectors, collectorRecords, today]);

  // ── 오늘 대근 현황 ───────────────────────────────────────
  const shiftToday = useMemo(() => shiftsOnDate(today), [today]);
  const subsToday = useMemo(
    () => (substitutions || []).filter((s) => s.date === today),
    [substitutions, today]
  );

  // ── 누적 이상 목록 ───────────────────────────────────────
  const beltIssues = useMemo(() => {
    const all = flattenBelts(groups);
    const out = [];
    for (const { name, group } of all) {
      const rec = latestRecord(records, name);
      if (!rec) continue;
      const status = aggregateStatus(rec);
      if (status === 'ok') continue;
      const items = extractBeltIssues(rec);
      if (items.length > 0) out.push({ name, group, date: rec.date, status, items });
    }
    return out.sort((a, b) => (a.status === 'bad' ? -1 : 1) - (b.status === 'bad' ? -1 : 1));
  }, [groups, records]);

  const collectorIssues = useMemo(() => {
    const out = [];
    for (const { name } of collectors) {
      const rec = latestCollectorRecord(collectorRecords, name);
      if (!rec) continue;
      const status = aggregateCollectorStatus(rec);
      if (status === 'ok') continue;
      const items = extractCollectorIssues(rec);
      if (items.length > 0) out.push({ name, date: rec.date, status, items });
    }
    return out.sort((a, b) => (a.status === 'bad' ? -1 : 1) - (b.status === 'bad' ? -1 : 1));
  }, [collectors, collectorRecords]);

  const totalIssues = beltIssues.length + collectorIssues.length;

  // ── 클립보드 복사 ─────────────────────────────────────────
  const handleCopyIssues = () => {
    const lines = [`[수리요청] ${today}\n`];
    if (beltIssues.length > 0) {
      lines.push(`■ 벨트 이상 (${beltIssues.length}건)`);
      for (const b of beltIssues) {
        const itemStr = b.items
          .map((i) => `${i.title}${i.sub ? ` (${i.sub})` : ''}: ${i.status === 'bad' ? '불량' : '주의'}`)
          .join(', ');
        lines.push(`· ${b.name} [${b.group}] — ${itemStr} (점검일: ${b.date})`);
      }
      lines.push('');
    }
    if (collectorIssues.length > 0) {
      lines.push(`■ 집진기 이상 (${collectorIssues.length}건)`);
      for (const c of collectorIssues) {
        const itemStr = c.items
          .map((i) => `${i.title}${i.sub ? ` (${i.sub})` : ''}: ${i.status === 'bad' ? '불량' : '주의'}`)
          .join(', ');
        lines.push(`· ${c.name} — ${itemStr} (점검일: ${c.date})`);
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      window.alert('클립보드에 복사되었습니다.');
    });
  };

  const todayFmt = today.replace(/-/g, '.');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const todayDow = dayNames[new Date(today + 'T00:00:00').getDay()];

  return (
    <div>
      <header>
        <span className="logo">🏭</span>
        <h1>3선탄 현황판</h1>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)' }}>
          {todayFmt} ({todayDow})
        </span>
      </header>

      <div className="body">

        {/* ── 오늘 점검 현황 ── */}
        <div className="dash-section-title">오늘 점검 현황</div>

        <div className="dash-2col">
          {/* 벨트 */}
          <button className="dash-stat-card" onClick={onGoField}>
            <div className="dash-stat-icon">🔧</div>
            <div className="dash-stat-label">벨트 점검</div>
            <div className="dash-stat-main">
              <span className="dash-stat-done">{beltStats.done}</span>
              <span className="dash-stat-sep"> / </span>
              <span className="dash-stat-total">{beltStats.scheduled}</span>
              <span className="dash-stat-unit"> 완료</span>
            </div>
            <div className="dash-stat-pills">
              {beltStats.bad > 0 && <span className="dash-pill bad">{beltStats.bad}이상</span>}
              {beltStats.warn > 0 && <span className="dash-pill warn">{beltStats.warn}주의</span>}
              {beltStats.ok > 0 && <span className="dash-pill ok">{beltStats.ok}정상</span>}
            </div>
          </button>

          {/* 집진기 */}
          <button className="dash-stat-card" onClick={onGoField}>
            <div className="dash-stat-icon">💨</div>
            <div className="dash-stat-label">집진기 점검</div>
            <div className="dash-stat-main">
              <span className="dash-stat-done">{collectorStats.done}</span>
              <span className="dash-stat-sep"> / </span>
              <span className="dash-stat-total">{collectorStats.scheduled}</span>
              <span className="dash-stat-unit"> 완료</span>
            </div>
            <div className="dash-stat-pills">
              {collectorStats.bad > 0 && <span className="dash-pill bad">{collectorStats.bad}이상</span>}
              {collectorStats.warn > 0 && <span className="dash-pill warn">{collectorStats.warn}주의</span>}
              {collectorStats.ok > 0 && <span className="dash-pill ok">{collectorStats.ok}정상</span>}
            </div>
          </button>
        </div>

        {/* ── 오늘 대근 현황 ── */}
        <div className="dash-section-title">오늘 교대 / 대근</div>
        <div className="card" style={{ marginBottom: 14 }}>
          {/* 조별 근무 */}
          <div className="dash-shift-grid">
            {SHIFT_GROUPS.map((g) => {
              const shift = shiftToday[g];
              const subs = subsToday.filter((s) => s.group === g);
              return (
                <div key={g} className={`dash-shift-cell dash-shift-${shift}`}>
                  <div className="dash-shift-group">{g}조</div>
                  <div className="dash-shift-type">{SHIFT_LABEL[shift] || shift}</div>
                  {subs.map((s) => (
                    <div key={s.id} className="dash-shift-sub">
                      <span className="dash-shift-req">{s.requester}</span>
                      <span className="dash-shift-arrow">→</span>
                      <span className={`dash-shift-fill ${s.substitute ? 'filled' : 'open'}`}>
                        {s.substitute || '미정'}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {subsToday.length === 0 && (
            <p className="note" style={{ paddingTop: 8 }}>오늘 대근 없음</p>
          )}
        </div>

        {/* ── 누적 이상 목록 ── */}
        <div className="dash-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          누적 이상 목록
          {totalIssues > 0 && (
            <span className="dash-pill bad" style={{ fontSize: 12, padding: '2px 8px' }}>
              {totalIssues}건
            </span>
          )}
          {totalIssues > 0 && (
            <button className="dash-copy-btn" onClick={handleCopyIssues} title="수리요청 문구 복사">
              📋 복사
            </button>
          )}
        </div>

        {totalIssues === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 700, padding: '24px 16px' }}>
            ✅ 이상 장비 없음
          </div>
        ) : (
          <>
            {beltIssues.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                <h3>
                  🔧 벨트 이상
                  <span className="count">{beltIssues.length}건</span>
                </h3>
                {beltIssues.map((entry) => (
                  <IssueItem key={entry.name} entry={entry} type="belt" />
                ))}
              </div>
            )}

            {collectorIssues.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                <h3>
                  💨 집진기 이상
                  <span className="count">{collectorIssues.length}건</span>
                </h3>
                {collectorIssues.map((entry) => (
                  <IssueItem key={entry.name} entry={entry} type="collector" />
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
