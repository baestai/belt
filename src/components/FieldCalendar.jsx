import { beltsScheduledOn, beltsForDate, beltsInspectedOn } from '../lib/selectors.js';
import { GROUP_ORDER, flattenBelts, statusCounts } from '../lib/belts.js';

const WD = ['일', '월', '화', '수', '목', '금', '토'];

const STAT_DEFS = [
  { key: 'ok', label: '정상', cls: 'ok' },
  { key: 'warn', label: '주의', cls: 'warn' },
  { key: 'bad', label: '이상', cls: 'bad' },
  { key: 'none', label: '미점검', cls: 'none' },
];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

export default function FieldCalendar({
  year,
  month, // 1-based
  groups,
  schedules,
  records = [],
  today,
  statusOf,
  selectedDate,
  onSelectDate,
  onPrev,
  onNext,
  onPickBelt,
  onOpenBelt,
  onEditBelt,
  groupOf,
  filters,
  setFilters,
  onOpenLeaderboard,
  onOpenShift,
  fixedInspector,
  onOpenDeviceInspector,
  fieldTab,
  onFieldTab,
}) {
  const first = new Date(year, month - 1, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dateStr = (d) => `${year}-${pad(month)}-${pad(d)}`;

  // 전체 벨트 기준 개요 통계
  const all = groups ? flattenBelts(groups) : [];
  const counts = statusCounts(all, statusOf);

  // 검색/상태 필터
  const f = filters || { group: '전체', status: null, query: '' };
  const q = String(f.query || '').trim().toLowerCase();
  const matchFilter = (name) => {
    if (q && !name.toLowerCase().includes(q)) return false;
    if (f.status && statusOf(name) !== f.status) return false;
    return true;
  };
  const setF = (patch) => setFilters && setFilters({ ...f, ...patch });
  const toggleStatus = (s) => setF({ status: f.status === s ? null : s });

  // 검색어 또는 상태 선택 시: 전체 벨트에서 조건에 맞는 목록을 정리해 표시
  const showResults = !!(q || f.status);
  const resultBelts = all
    .filter((b) => matchFilter(b.name))
    .sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a.group);
      const gb = GROUP_ORDER.indexOf(b.group);
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });
  const STATUS_LABEL = { ok: '정상', warn: '주의', bad: '이상', none: '미점검' };
  // 검색창에서 Enter: 일치 벨트가 1개 이상이면 첫 벨트로 이동
  // (최근 점검결과 있으면 상세, 없으면 점검 입력 — onOpenBelt가 판단)
  const onSearchEnter = (e) => {
    if (e.key !== 'Enter') return;
    if (resultBelts.length > 0) onOpenBelt(resultBelts[0].name);
  };

  // 해당일 점검 대상: 예정 ∪ 실제 기록(완료 후 예정일이 넘어가도 다시 열람·수정 가능)
  const selBelts = beltsForDate(schedules, records, selectedDate);
  const inspectedSet = new Set(beltsInspectedOn(records, selectedDate));

  return (
    <>
      <header>
        <span className="logo" style={{ color: 'var(--accent)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 18h20" /><path d="M4 18a8 8 0 0 1 16 0" /><path d="M10.5 6.2a2 2 0 0 1 3 0V10" /><path d="M8 10V7.5" /><path d="M16 10V7.5" />
          </svg>
        </span>
        <h1>3선탄 통합관리</h1>
        {onOpenLeaderboard && (
          <button className="hdr-btn labeled" onClick={onOpenLeaderboard} aria-label="점검 포인트 랭킹">
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
        <a className="hdr-btn labeled" href="/manual.html" target="_blank" rel="noopener" aria-label="사용설명서">
          <svg className="hdr-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span className="hdr-lbl">설명서</span>
        </a>
        <span className="mode-badge mode-field">점검모드</span>
      </header>
      <div className="body">
        {onFieldTab && (
          <div className="seg" style={{ marginBottom: 14 }}>
            <button className={fieldTab === 'belt' ? 'active' : ''} onClick={() => onFieldTab('belt')}>🦺 벨트</button>
            <button className={fieldTab === 'collector' ? 'active' : ''} onClick={() => onFieldTab('collector')}>🌀 집진기</button>
          </div>
        )}
        {onOpenDeviceInspector && (
          <button className="device-insp" onClick={onOpenDeviceInspector}>
            <span>👤 점검자: {fixedInspector ? <b>{fixedInspector}</b> : <span className="none">미고정 (이 기기)</span>}</span>
            <span className="set">{fixedInspector ? '변경' : '고정하기'}</span>
          </button>
        )}

        {setFilters && (
          <>
            <input
              className="search"
              placeholder="🔍 벨트명 검색 후 Enter (예: S-101, K-651)"
              value={f.query}
              onChange={(e) => setF({ query: e.target.value })}
              onKeyDown={onSearchEnter}
            />
            <div className="stats">
              {STAT_DEFS.map((s) => (
                <div
                  key={s.key}
                  className={'stat ' + s.cls + (f.status === s.key ? ' sel-' + s.cls : '')}
                  onClick={() => toggleStatus(s.key)}
                >
                  <div className="num">{counts[s.key] || 0}</div>
                  <div className="lbl">{s.label}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {showResults && (
          <>
            <div className="sel-date-title">
              {q ? `🔍 "${f.query}" 검색 결과` : `📋 ${STATUS_LABEL[f.status]} 벨트`}
              <span className="badge">{resultBelts.length}대</span>
              <button className="clear-filter" onClick={() => setF({ query: '', status: null })}>✕ 해제</button>
            </div>
            <div className="belt-grid">
              {resultBelts.length === 0 && <div className="note">조건에 맞는 벨트가 없습니다.</div>}
              {resultBelts.map((b) => {
                const s = statusOf(b.name);
                return (
                  <div key={b.name} className="belt">
                    <span className={'dot ' + s} />
                    <button className="belt-tap" onClick={() => onOpenBelt(b.name)}>
                      <div className="info">
                        <div className="name">{b.name}</div>
                        <div className="sub">{b.group} · {STATUS_LABEL[s]}</div>
                      </div>
                    </button>
                    {s === 'none' ? (
                      <button className="due none belt-act" onClick={() => onOpenBelt(b.name)}>점검하기</button>
                    ) : (
                      <>
                        <button className="due none belt-act" onClick={() => onOpenBelt(b.name)}>결과보기</button>
                        {onEditBelt && (
                          <button className="due belt-act belt-edit" onClick={() => onEditBelt(b.name)}>✏ 수정</button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="cal-head">
          <button onClick={onPrev} aria-label="이전 달">‹</button>
          <span className="ym">{year}년 {month}월</span>
          <button onClick={onNext} aria-label="다음 달">›</button>
        </div>

        {!showResults && (
          <>
            <div className="sel-date-title">
              📋 {selectedDate} 점검 예정
              <span className="badge">{selBelts.length}대</span>
            </div>
            <div className="belt-grid">
              {selBelts.length === 0 && <div className="note">이 날짜에 편성된 점검이 없습니다.</div>}
              {selBelts.map((b) => {
                const s = statusOf(b);
                const done = inspectedSet.has(b);
                return (
                  <button key={b} className="belt" onClick={() => onPickBelt(b, selectedDate)}>
                    <span className={'dot ' + s} />
                    <div className="info">
                      <div className="name">{b}</div>
                      <div className="sub">{groupOf(b)} · {done ? '점검완료' : (s === 'none' ? '미점검' : '점검됨')}</div>
                    </div>
                    <span className="due none">{done ? '결과보기·수정' : '입력하기'}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="cal">
          {WD.map((w, i) => (
            <div key={w} className={'wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</div>
          ))}
          {cells.map((d, i) => {
            if (d == null) return <div key={'e' + i} className="day empty" />;
            const ds = dateStr(d);
            const belts = beltsScheduledOn(schedules, ds).filter(matchFilter);
            const isToday = ds === today;
            const isSel = ds === selectedDate;
            return (
              <button
                key={ds}
                className={'day' + (isToday ? ' today' : '') + (isSel && !isToday ? ' sel' : '')}
                onClick={() => onSelectDate(ds)}
              >
                {d}
                {belts.length > 0 && (
                  <span className="cnt">
                    {belts.slice(0, 3).map((b, k) => {
                      const s = statusOf(b);
                      const cls = s === 'none' ? 'wait' : s === 'bad' ? 'bad' : 'ok';
                      return <i key={k} className={'pp ' + cls} />;
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span><i className="pp ok" />완료/정상</span>
          <span><i className="pp wait" />예정/미점검</span>
          <span><i className="pp bad" />이상발생</span>
        </div>
        <div className="note">날짜를 누르면 해당일 점검 대상이 위쪽에 표시됩니다 · 기본값: 오늘</div>
      </div>
    </>
  );
}
