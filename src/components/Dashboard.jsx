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

// 벨트 최신 기록에서 이상/주의 항목 추출 (itemKey 포함 — 조치완료 핸들러에서 사용)
function extractBeltIssues(record) {
  if (!record?.items) return [];
  const out = [];
  for (const def of INSPECTION_ITEMS) {
    const it = record.items[def.key];
    if (!it) continue;
    if (it.status && it.status !== 'ok') {
      out.push({ itemKey: def.key, title: def.title, sub: null, status: it.status, memo: it.memo || '' });
    }
    if (it.subs) {
      for (const [k, s] of Object.entries(it.subs)) {
        if (s !== 'ok') out.push({ itemKey: def.key, title: def.title, sub: k, status: s, memo: it.memo || '' });
      }
    }
  }
  return out;
}

// 집진기 최신 기록에서 이상/주의 항목 추출 (itemKey 포함)
function extractCollectorIssues(record) {
  if (!record?.items) return [];
  const noStatus = new Set(COLLECTOR_ITEMS.filter((d) => d.noStatus).map((d) => d.key));
  const out = [];
  for (const def of COLLECTOR_ITEMS) {
    if (noStatus.has(def.key)) continue;
    const it = record.items[def.key];
    if (!it) continue;
    // group이 있으면 group 이름을 title로 표시
    const displayTitle = def.group ? `${def.group} › ${def.title}` : def.title;
    if (it.status && it.status !== 'ok') {
      out.push({ itemKey: def.key, title: displayTitle, sub: null, status: it.status, memo: it.memo || '' });
    }
    if (it.subs) {
      for (const [k, s] of Object.entries(it.subs)) {
        if (s !== 'ok') out.push({ itemKey: def.key, title: displayTitle, sub: k, status: s });
      }
    }
  }
  return out;
}

const REPAIR_LABEL = { requested: '정비의뢰' };

// 한 이상 항목의 수리 진행 컨트롤 (정비의뢰 → 수리완료)
function RepairControl({ repair, onSet, onDone }) {
  const status = repair?.status || 'none';
  const [assignee, setAssignee] = useState(repair?.assignee || '');
  const [due, setDue] = useState(repair?.dueDate || '');
  const active = status === 'requested';
  return (
    <div className="dash-repair">
      <div className="dash-repair-stages">
        <button className={status === 'requested' ? 'on' : ''} onClick={() => onSet({ status: 'requested' })}>정비의뢰</button>
        <button className="done" onClick={onDone} title="수리 완료 — 양호로 변경">수리완료</button>
      </div>
      {active && (
        <div className="dash-repair-fields">
          <input
            className="dash-repair-in"
            placeholder="담당자"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            onBlur={() => assignee !== (repair?.assignee || '') && onSet({ assignee })}
          />
          <input
            className="dash-repair-in"
            type="date"
            value={due}
            onChange={(e) => { setDue(e.target.value); onSet({ dueDate: e.target.value }); }}
            title="예상 완료일"
          />
        </div>
      )}
    </div>
  );
}

function IssueItem({ entry, type, repairs, onSetRepair, onResolve }) {
  const [open, setOpen] = useState(false);
  const worst = entry.items.some((i) => i.status === 'bad') ? 'bad' : 'warn';
  const keyOf = (it) => `${type}|${entry.name}|${entry.date}|${it.itemKey}|${it.sub || ''}`;
  const stages = entry.items.map((it) => repairs[keyOf(it)]?.status).filter(Boolean);
  const headStatus = stages.includes('requested') ? 'requested' : null;
  const subText = type === 'belt'
    ? `${entry.group} · 이상 ${entry.items.length}건`
    : `집진기 · 이상 ${entry.items.length}건`;
  return (
    <div className="dash-issue-card">
      <button className="dash-issue-head" onClick={() => setOpen((v) => !v)}>
        <span className={`dot ${worst}`} />
        <div className="dash-issue-info">
          <div className="dash-issue-name">{entry.name}</div>
          <div className="dash-issue-name-sub">{subText}</div>
        </div>
        <div className="dash-issue-meta">
          {headStatus && <span className={`dash-repair-chip ${headStatus}`}>{REPAIR_LABEL[headStatus]}</span>}
          <span className="dash-issue-date">{entry.date}</span>
          <span className="dash-issue-arrow">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="dash-issue-body">
          {entry.items.map((it, i) => (
            <div key={i} className="dash-sub-issue">
              <div className="dash-sub-line">
                <span className={`ibadge ${it.status}`}>{it.status === 'bad' ? '불량' : '주의'}</span>
                <span>{it.title}{it.sub ? ` › ${it.sub}` : ''}</span>
                {it.memo && <span className="dash-sub-memo"> ({it.memo})</span>}
              </div>
              <RepairControl
                repair={repairs[keyOf(it)]}
                onSet={(patch) => onSetRepair(type, entry, it, patch)}
                onDone={() => onResolve(entry, it)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 점검 결과 분포 도넛 차트 (정상/이상 2분류). 순수 SVG, 외부 라이브러리 없음.
function DonutChart({ ok, bad, size = 120, strokeW = 16 }) {
  const total = ok + bad;
  const r = (size - strokeW) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  const segs = [
    { v: ok, color: 'var(--ok)' },
    { v: bad, color: 'var(--bad)' },
  ].filter((s) => s.v > 0);
  let offset = 0;
  const badRate = total > 0 ? Math.round((bad / total) * 100) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`점검 ${total}건 중 이상 ${bad}건`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--panel2)" strokeWidth={strokeW} />
      {total > 0 && segs.map((s, i) => {
        const len = (s.v / total) * c;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeW}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--text)">{total}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
        {total > 0 ? `이상 ${badRate}%` : '기록 없음'}
      </text>
    </svg>
  );
}

// 도넛 + 라벨/범례를 묶은 카드
function ChartCard({ icon, label, ok, bad }) {
  const total = ok + bad;
  return (
    <div className="dash-chart-card">
      <div className="dash-chart-label"><span>{icon}</span> {label}</div>
      <DonutChart ok={ok} bad={bad} />
      <div className="dash-chart-legend">
        <span className="dash-legend-item"><i className="dot ok" />정상 {ok}</span>
        <span className="dash-legend-item"><i className="dot bad" />이상 {bad}</span>
      </div>
      <div className="dash-chart-sub">점검 {total}건</div>
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
  onOpenLeaderboard,
  onOpenShift,
  repairs = {},
  onSetRepair,
  onResolveBeltIssue,
  onResolveCollectorIssue,
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

  // ── 금일 점검 예정 상세 목록 ─────────────────────────────
  const beltGroupMap = useMemo(() => {
    const map = {};
    for (const g of Object.keys(groups)) for (const name of groups[g]) map[name] = g;
    return map;
  }, [groups]);
  const todayBeltList = useMemo(() => beltsScheduledOn(schedules, today), [schedules, today]);
  const todayBeltDoneSet = useMemo(() => new Set(beltsInspectedOn(records, today)), [records, today]);
  const todayCollectorList = useMemo(() => collectorsDueOn(collectors, today), [collectors, today]);
  const todayCollectorDoneSet = useMemo(() => new Set(collectorsInspectedOn(collectorRecords, today)), [collectorRecords, today]);

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

  // ── 누적 점검 통계 (최신 기록 기준 정상/이상 분포. 주의는 이상으로 합산) ──
  const beltChart = useMemo(() => {
    let ok = 0, bad = 0;
    for (const { name } of flattenBelts(groups)) {
      const rec = latestRecord(records, name);
      if (!rec) continue;
      if (aggregateStatus(rec) === 'ok') ok++;
      else bad++;
    }
    return { ok, bad };
  }, [groups, records]);

  const collectorChart = useMemo(() => {
    let ok = 0, bad = 0;
    for (const { name } of collectors) {
      const rec = latestCollectorRecord(collectorRecords, name);
      if (!rec) continue;
      if (aggregateCollectorStatus(rec) === 'ok') ok++;
      else bad++;
    }
    return { ok, bad };
  }, [collectors, collectorRecords]);

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
        <h1>3선탄 통합관리</h1>
        {onOpenLeaderboard && (
          <button className="hdr-btn labeled" style={{ marginLeft: 'auto' }} onClick={onOpenLeaderboard} aria-label="점검 포인트 랭킹">
            <svg className="hdr-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <span className="hdr-lbl">Top10</span>
          </button>
        )}
        {onOpenShift && (
          <button className="hdr-btn labeled" onClick={onOpenShift} aria-label="대근 관리">
            <svg className="hdr-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2v6h6" /><path d="M21 12A9 9 0 0 0 6 5.3L3 8" /><path d="M21 22v-6h-6" /><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
            </svg>
            <span className="hdr-lbl">대근</span>
          </button>
        )}
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8, whiteSpace: 'nowrap' }}>
          {todayFmt} ({todayDow})
        </span>
      </header>

      <div className="body">

        {/* ── 금일 근무현황 ── */}
        <div className="dash-section-title">금일 근무현황</div>
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

        {/* ── 금일 점검현황 ── */}
        <div className="dash-section-title">금일 점검현황</div>

        {/* 벨트 */}
        <div className="card" style={{ marginBottom: 10 }}>
          <button className="dash-today-hdr" onClick={onGoField}>
            <span className="dash-stat-icon">🔧</span>
            <span className="dash-today-hdr-label">벨트 점검</span>
            <span className="dash-today-hdr-count">
              <b>{beltStats.done}</b><span className="dash-today-hdr-sep">/{beltStats.scheduled}</span> 완료
            </span>
            <span className="dash-today-hdr-pills">
              {beltStats.bad + beltStats.warn > 0 && <span className="dash-pill bad">{beltStats.bad + beltStats.warn}이상</span>}
              {beltStats.ok > 0 && <span className="dash-pill ok">{beltStats.ok}정상</span>}
            </span>
          </button>
          {todayBeltList.length === 0
            ? <p className="note" style={{ paddingTop: 6 }}>오늘 예정된 벨트 없음</p>
            : <div className="dash-today-grid">
                {todayBeltList.map((name) => {
                  const done = todayBeltDoneSet.has(name);
                  return (
                    <div key={name} className="dash-today-card">
                      <span className={`dot ${done ? 'ok' : 'none'}`} />
                      <div className="dash-today-card-info">
                        <div className="dash-today-card-name">{name}</div>
                        <div className="dash-today-card-sub">{beltGroupMap[name] || ''} · {done ? '점검완료' : '미점검'}</div>
                      </div>
                      <button className={`dash-today-card-btn${done ? ' done' : ''}`} onClick={onGoField}>
                        {done ? '결과보기·수정' : '입력하기'}
                      </button>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* 집진기 */}
        <div className="card" style={{ marginBottom: 14 }}>
          <button className="dash-today-hdr" onClick={onGoField}>
            <span className="dash-stat-icon">💨</span>
            <span className="dash-today-hdr-label">집진기 점검</span>
            <span className="dash-today-hdr-count">
              <b>{collectorStats.done}</b><span className="dash-today-hdr-sep">/{collectorStats.scheduled}</span> 완료
            </span>
            <span className="dash-today-hdr-pills">
              {collectorStats.bad + collectorStats.warn > 0 && <span className="dash-pill bad">{collectorStats.bad + collectorStats.warn}이상</span>}
              {collectorStats.ok > 0 && <span className="dash-pill ok">{collectorStats.ok}정상</span>}
            </span>
          </button>
          {todayCollectorList.length === 0
            ? <p className="note" style={{ paddingTop: 6 }}>오늘 예정된 집진기 없음</p>
            : <div className="dash-today-grid">
                {todayCollectorList.map((name) => {
                  const done = todayCollectorDoneSet.has(name);
                  return (
                    <div key={name} className="dash-today-card">
                      <span className={`dot ${done ? 'ok' : 'none'}`} />
                      <div className="dash-today-card-info">
                        <div className="dash-today-card-name">{name}</div>
                        <div className="dash-today-card-sub">집진기 · {done ? '점검완료' : '미점검'}</div>
                      </div>
                      <button className={`dash-today-card-btn${done ? ' done' : ''}`} onClick={onGoField}>
                        {done ? '결과보기·수정' : '입력하기'}
                      </button>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* ── 누적 점검 통계 (도넛 차트) ── */}
        <div className="dash-section-title">누적 점검 통계</div>
        <div className="dash-2col" style={{ marginBottom: 14 }}>
          <ChartCard icon="🔧" label="벨트" ok={beltChart.ok} bad={beltChart.bad} />
          <ChartCard icon="💨" label="집진기" ok={collectorChart.ok} bad={collectorChart.bad} />
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
              <div style={{ marginBottom: 12 }}>
                <div className="dash-issue-group-label">🔧 벨트 이상 <span>{beltIssues.length}건</span></div>
                {beltIssues.map((entry) => (
                  <IssueItem key={entry.name} entry={entry} type="belt" repairs={repairs} onSetRepair={onSetRepair} onResolve={onResolveBeltIssue} />
                ))}
              </div>
            )}

            {collectorIssues.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="dash-issue-group-label">💨 집진기 이상 <span>{collectorIssues.length}건</span></div>
                {collectorIssues.map((entry) => (
                  <IssueItem key={entry.name} entry={entry} type="collector" repairs={repairs} onSetRepair={onSetRepair} onResolve={onResolveCollectorIssue} />
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
