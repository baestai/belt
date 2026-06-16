import { GROUP_ORDER, flattenBelts, filterBelts, statusCounts } from '../lib/belts.js';
import { dueInfo } from '../lib/selectors.js';

const STAT_DEFS = [
  { key: 'ok', label: '정상', cls: 'ok' },
  { key: 'warn', label: '주의', cls: 'warn' },
  { key: 'bad', label: '이상', cls: 'bad' },
  { key: 'none', label: '미점검', cls: 'none' },
];

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
  onOpenAdd,
  onOpenInspectors,
  onOpenPulleys,
  onOpenReport,
  onOpenBackup,
  onOpenLeaderboard,
  cloud,
}) {
  const all = flattenBelts(groups);
  const counts = statusCounts(all, statusOf);
  const groupNames = Object.keys(groups).sort(
    (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)
  );

  const chipDefs = [{ name: '전체', count: all.length }].concat(
    groupNames.map((g) => ({ name: g, count: groups[g].length }))
  );

  const visibleGroups = filters.group === '전체' ? groupNames : [filters.group];

  const toggleStatus = (s) =>
    setFilters({ ...filters, status: filters.status === s ? null : s });

  return (
    <>
      <header>
        <span className="logo">🏭</span>
        <h1>3선탄 벨트컨베이어 주기점검</h1>
        <span className="mode-badge mode-admin">관리모드</span>
      </header>
      <div className="body">
        {!cloud && (
          <div className="banner">로컬 저장 모드 — Supabase 미연결 (이 기기에만 저장됨)</div>
        )}
        <input
          className="search"
          placeholder="🔍 벨트명 검색 (예: S-101, CWF, K-651)"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
        />
        <div className="chips">
          {chipDefs.map((c) => (
            <span
              key={c.name}
              className={'chip' + (c.name === filters.group ? ' active' : '')}
              onClick={() => setFilters({ ...filters, group: c.name })}
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="add-btn secondary" onClick={onOpenInspectors}>
              👷 점검자 관리
            </button>
            <button className="add-btn secondary" onClick={onOpenPulleys}>
              🛞 Pulley 관리
            </button>
            <button className="add-btn secondary" onClick={onOpenLeaderboard}>
              🏆 랭킹
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="add-btn secondary" onClick={onOpenReport}>
              📄 보고서
            </button>
            <button className="add-btn secondary" onClick={onOpenBackup}>
              💾 백업
            </button>
            <button className="add-btn" onClick={onOpenAdd}>
              ➕ 벨트 추가
            </button>
          </div>
        </div>

        {visibleGroups.map((g) => {
          const items = filterBelts(
            groups[g].map((name) => ({ group: g, name })),
            filters,
            statusOf
          );
          if (!items.length) return null;
          return (
            <div key={g}>
              <div className="group-title">
                📍 {g}{' '}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({items.length})</span>
              </div>
              <div className="belt-grid">
                {items.map((b) => {
                  const st = statusOf(b.name);
                  const info = lastInfoOf(b.name);
                  const due = dueInfo(schedules[b.name], today);
                  return (
                    <button
                      key={b.name}
                      className="belt"
                      onClick={() => onSelectBelt(b)}
                    >
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
                })}
              </div>
            </div>
          );
        })}
        {visibleGroups.every(
          (g) =>
            filterBelts(groups[g].map((name) => ({ group: g, name })), filters, statusOf)
              .length === 0
        ) && <div className="note">조건에 맞는 벨트가 없습니다.</div>}
      </div>
    </>
  );
}
