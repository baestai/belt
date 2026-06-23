import { GROUP_ORDER, flattenBelts, statusCounts, aggregateStatus } from '../lib/belts.js';
import { dueInfo } from '../lib/selectors.js';
import { statusOfCollector, latestCollectorRecord, aggregateCollectorStatus } from '../lib/collectors.js';

// 관리모드 종합상태: 주의 제외 — 정상/이상/미점검
const STAT_DEFS = [
  { key: 'ok', label: '정상', cls: 'ok' },
  { key: 'bad', label: '이상', cls: 'bad' },
  { key: 'none', label: '미점검', cls: 'none' },
];

const COLLECTOR_CAT = '집진기';

export default function AdminList({
  groups,
  records,
  schedules,
  today,
  statusOf,
  lastInfoOf,
  filters,
  setFilters,
  onSelectBelt,
  collectors = [],
  collectorRecords = [],
  onSelectCollector,
  onOpenAdd,
  onOpenInspectors,
  onOpenQuickMemos,
  onOpenReport,
  onOpenBackup,
  onOpenLeaderboard,
  onOpenShiftGroups,
  onOpenCollectors,
  onOpenRepairHistory,
  onOpenAuditLog,
  cloud,
}) {
  const all = flattenBelts(groups);
  const ym = String(today).slice(0, 7); // 금월

  // 금월 기준 벨트 상태 (그 달 점검 없으면 미점검). 주의(warn)는 이상으로 묶음.
  const beltMonthStatus = (name) => {
    const recs = (records || [])
      .filter((r) => r.belt === name && String(r.date).slice(0, 7) === ym)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const s = recs[0] ? aggregateStatus(recs[0]) : 'none';
    return s === 'warn' ? 'bad' : s;
  };
  const collectorMonthStatus = (name) => {
    const recs = (collectorRecords || [])
      .filter((r) => r.collector === name && String(r.date).slice(0, 7) === ym)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const s = recs[0] ? aggregateCollectorStatus(recs[0]) : 'none';
    return s === 'warn' ? 'bad' : s;
  };

  const counts = statusCounts(all, beltMonthStatus); // 금월 기준 (주의 미표시)
  const groupNames = Object.keys(groups).sort(
    (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)
  );

  // 카테고리 칩: 벨트 구역들 + 집진기 (전체 없음 — 클릭해야 표시)
  const chipDefs = groupNames
    .map((g) => ({ name: g, count: groups[g].length }))
    .concat([{ name: COLLECTOR_CAT, count: collectors.length }]);

  const q = String(filters.query || '').trim().toLowerCase();
  const category = filters.group;
  const isGroupCat = groupNames.includes(category);
  const isCollectorCat = category === COLLECTOR_CAT;

  const statusOfCol = (name) => statusOfCollector(collectorRecords, name);
  const lastColInfo = (name) => {
    const r = latestCollectorRecord(collectorRecords, name);
    return r ? { date: r.date, inspector: r.inspector } : null;
  };

  const toggleStatus = (s) =>
    setFilters({ ...filters, status: filters.status === s ? null : s });

  // ── 표시 모드 결정 ──
  const searching = !!q;
  const statusFiltering = !!filters.status;

  // 검색 결과(벨트 + 집진기)
  const beltMatches = searching
    ? all.filter((b) => b.name.toLowerCase().includes(q))
    : statusFiltering
      ? all.filter((b) => beltMonthStatus(b.name) === filters.status)
      : isGroupCat
        ? all.filter((b) => b.group === category)
        : [];
  const colMatches = searching
    ? collectors.filter((c) => c.name.toLowerCase().includes(q))
    : isCollectorCat
      ? collectors
      : [];

  const showBelts = searching || statusFiltering || isGroupCat;
  const showCollectors = searching || isCollectorCat;
  const showHint = !searching && !statusFiltering && !isGroupCat && !isCollectorCat;

  // 기본 화면(힌트 상태)에서 보여줄 이상 설비
  const badBelts = showHint ? all.filter((b) => beltMonthStatus(b.name) === 'bad') : [];
  const badCollectors = showHint ? collectors.filter((c) => collectorMonthStatus(c.name) === 'bad') : [];
  const hasBadDefault = badBelts.length > 0 || badCollectors.length > 0;

  const BeltCard = (b) => {
    const st = beltMonthStatus(b.name); // 금월 기준
    const info = lastInfoOf(b.name);
    const due = dueInfo(schedules[b.name], today);
    return (
      <button key={'b_' + b.name} className="belt" onClick={() => onSelectBelt(b)}>
        <span className={'dot ' + st}></span>
        <div className="info">
          <div className="name">{b.name}</div>
          <div className="sub">
            {info ? `최근점검 ${info.date} · ${info.inspector}` : '점검 이력 없음'}
          </div>
        </div>
        <span className={'due ' + due.kind}>{due.label}</span>
      </button>
    );
  };

  const ColCard = (c) => {
    const st = collectorMonthStatus(c.name); // 금월 기준
    const info = lastColInfo(c.name);
    return (
      <button key={'c_' + c.name} className="belt" onClick={() => onSelectCollector && onSelectCollector(c.name)}>
        <span className={'dot ' + st}></span>
        <div className="info">
          <div className="name">{c.name}</div>
          <div className="sub">
            {info ? `최근점검 ${info.date} · ${info.inspector}` : '점검 이력 없음'}
          </div>
        </div>
        <span className="due none">집진기</span>
      </button>
    );
  };

  return (
    <>
      <header>
        <span className="logo">🏭</span>
        <h1>3선탄 통합관리</h1>
        <span className="mode-badge mode-admin">관리모드</span>
      </header>
      <div className="body">
        {!cloud && (
          <div className="banner">로컬 저장 모드 — Supabase 미연결 (이 기기에만 저장됨)</div>
        )}
        <input
          className="search"
          placeholder="🔍 벨트·집진기 검색 (예: S-101, CWF, K-655 집진기)"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
        />
        <div className="chips">
          {chipDefs.map((c) => (
            <span
              key={c.name}
              className={'chip' + (c.name === filters.group ? ' active' : '')}
              onClick={() => setFilters({ ...filters, group: c.name === filters.group ? '전체' : c.name, status: null })}
            >
              {c.name} {c.count}
            </span>
          ))}
        </div>
        <div className="stats">
          {STAT_DEFS.map((s) => (
            <div
              key={s.key}
              className={
                'stat ' + s.cls + (filters.status === s.key ? ' sel-' + s.cls : '')
              }
              onClick={() => toggleStatus(s.key)}
            >
              <div className="num">{counts[s.key] || 0}</div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="addbar">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="add-btn secondary" onClick={onOpenInspectors}>👷 점검자 관리</button>
            <button className="add-btn secondary" onClick={onOpenLeaderboard}>🏆 랭킹</button>
            <button className="add-btn secondary" onClick={onOpenQuickMemos}>💬 빠른 메모</button>
            <button className="add-btn secondary" onClick={onOpenShiftGroups}>🔁 교대조 편성</button>
            <button className="add-btn secondary" onClick={onOpenCollectors}>🌀 집진기 관리</button>
            <button className="add-btn secondary" onClick={onOpenRepairHistory}>🔧 정비 이력</button>
            <button className="add-btn secondary" onClick={onOpenAuditLog}>📋 변경 이력</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="add-btn secondary" onClick={onOpenReport}>📄 보고서</button>
            <button className="add-btn secondary" onClick={onOpenBackup}>💾 백업</button>
            <button className="add-btn" onClick={onOpenAdd}>➕ 벨트 추가</button>
          </div>
        </div>

        {showHint && hasBadDefault && (
          <>
            {badBelts.length > 0 && (
              <div>
                <div className="group-title">⚠ 이상 벨트 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({badBelts.length})</span></div>
                <div className="belt-grid">{badBelts.map(BeltCard)}</div>
              </div>
            )}
            {badCollectors.length > 0 && (
              <div>
                <div className="group-title">⚠ 이상 집진기 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({badCollectors.length})</span></div>
                <div className="belt-grid">{badCollectors.map(ColCard)}</div>
              </div>
            )}
          </>
        )}
        {showHint && !hasBadDefault && (
          <div className="note" style={{ padding: '28px 16px' }}>
            ✅ 이상 설비 없음<br />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>📂 카테고리(구역·집진기)를 선택하거나 검색창에 설비명을 입력하세요.</span>
          </div>
        )}

        {(searching || statusFiltering) && (
          <div className="sel-date-title">
            {searching ? `🔍 "${filters.query}" 검색 결과` : `📋 ${STAT_DEFS.find((d) => d.key === filters.status)?.label} 설비`}
            <span className="badge">{beltMatches.length + colMatches.length}대</span>
            <button className="clear-filter" onClick={() => setFilters({ ...filters, query: '', status: null })}>✕ 해제</button>
          </div>
        )}

        {showBelts && beltMatches.length > 0 && (
          <div>
            {(searching || statusFiltering) && <div className="group-title">🦺 벨트 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({beltMatches.length})</span></div>}
            {isGroupCat && !searching && !statusFiltering && (
              <div className="group-title">📍 {category} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({beltMatches.length})</span></div>
            )}
            <div className="belt-grid">{beltMatches.map(BeltCard)}</div>
          </div>
        )}

        {showCollectors && colMatches.length > 0 && (
          <div>
            <div className="group-title">🌀 집진기 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({colMatches.length})</span></div>
            <div className="belt-grid">{colMatches.map(ColCard)}</div>
          </div>
        )}

        {!showHint && beltMatches.length === 0 && colMatches.length === 0 && (
          <div className="note">조건에 맞는 설비가 없습니다.</div>
        )}
      </div>
    </>
  );
}
