import { useState } from 'react';
import {
  collectorsDueOn,
  collectorsForDate,
  collectorsInspectedOn,
  statusOfCollector,
  aggregateCollectorStatus,
} from '../lib/collectors.js';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const STAT_DEFS = [
  { key: 'ok', label: '정상', cls: 'ok' },
  { key: 'bad', label: '이상', cls: 'bad' },
  { key: 'none', label: '미점검', cls: 'none' },
];
const STATUS_LABEL = { ok: '정상', warn: '주의', bad: '이상', none: '미점검' };

function pad(n) { return n < 10 ? '0' + n : '' + n; }

export default function CollectorCalendar({
  year, month, today, selectedDate, onSelectDate, onPrev, onNext,
  collectors = [], collectorRecords = [], onPickCollector,
  fieldTab, onFieldTab, onOpenLeaderboard, onOpenShift,
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  const first = new Date(year, month - 1, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const dateStr = (d) => `${year}-${pad(month)}-${pad(d)}`;

  const statusOf = (name) => statusOfCollector(collectorRecords, name);
  // 해당 월(ym) 점검 기록 기준 상태. 그 달 점검 없으면 'none'(미점검).
  const statusInMonth = (name, ym) => {
    const recs = (collectorRecords || [])
      .filter((r) => r.collector === name && String(r.date).slice(0, 7) === ym)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return recs[0] ? aggregateCollectorStatus(recs[0]) : 'none';
  };

  // 금월(오늘 기준 월) 상태: 통계·필터는 이번 달 기준. 주의(warn)는 이상으로 묶음.
  const monthStatusOf = (name) => {
    const s = statusInMonth(name, String(today).slice(0, 7));
    return s === 'warn' ? 'bad' : s;
  };

  // 개요 통계 (금월 기준)
  const counts = { ok: 0, bad: 0, none: 0 };
  for (const c of collectors) counts[monthStatusOf(c.name)]++;

  const q = query.trim().toLowerCase();
  const showResults = !!(q || statusFilter);
  const resultList = collectors
    .filter((c) => (!q || c.name.toLowerCase().includes(q)) && (!statusFilter || monthStatusOf(c.name) === statusFilter))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selDue = collectorsForDate(collectors, collectorRecords, selectedDate);
  const inspectedSet = new Set(collectorsInspectedOn(collectorRecords, selectedDate));

  return (
    <>
      <header>
        <span className="logo">🌀</span>
        <h1>3선탄 통합관리</h1>
        {onOpenLeaderboard && (
          <button className="hdr-btn labeled" onClick={onOpenLeaderboard} aria-label="점검 포인트 랭킹">
            <svg className="hdr-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
            <span className="hdr-lbl">Top10</span>
          </button>
        )}
        {onOpenShift && (
          <button className="hdr-btn labeled" onClick={onOpenShift} aria-label="대근 관리">
            <svg className="hdr-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6" /><path d="M21 12A9 9 0 0 0 6 5.3L3 8" /><path d="M21 22v-6h-6" /><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" /></svg>
            <span className="hdr-lbl">대근</span>
          </button>
        )}
        <a className="hdr-btn labeled" href="/manual.html" target="_blank" rel="noopener" aria-label="사용설명서">
          <svg className="hdr-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
          <span className="hdr-lbl">설명서</span>
        </a>
        <span className="mode-badge mode-field">점검모드</span>
      </header>
      <div className="body">
        <div className="seg" style={{ marginBottom: 14 }}>
          <button className={fieldTab === 'belt' ? 'active' : ''} onClick={() => onFieldTab('belt')}>🦺 벨트</button>
          <button className={fieldTab === 'collector' ? 'active' : ''} onClick={() => onFieldTab('collector')}>🌀 집진기</button>
        </div>

        <input
          className="search"
          placeholder="🔍 집진기명 검색 (예: K-655, Surge)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="stats">
          {STAT_DEFS.map((s) => (
            <div
              key={s.key}
              className={'stat ' + s.cls + (statusFilter === s.key ? ' sel-' + s.cls : '')}
              onClick={() => setStatusFilter(statusFilter === s.key ? null : s.key)}
            >
              <div className="num">{counts[s.key] || 0}</div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>

        {showResults && (
          <>
            <div className="sel-date-title">
              {q ? `🔍 "${query}" 검색 결과` : `📋 ${STATUS_LABEL[statusFilter]} 집진기`}
              <span className="badge">{resultList.length}대</span>
              <button className="clear-filter" onClick={() => { setQuery(''); setStatusFilter(null); }}>✕ 해제</button>
            </div>
            <div className="belt-grid">
              {resultList.length === 0 && <div className="note">조건에 맞는 집진기가 없습니다.</div>}
              {resultList.map((c) => {
                const s = monthStatusOf(c.name); // 금월 기준
                return (
                  <button key={c.name} className="belt" onClick={() => onPickCollector(c.name, selectedDate)}>
                    <span className={'dot ' + s} />
                    <div className="info">
                      <div className="name">{c.name}</div>
                      <div className="sub">매월 {c.days.join('·')}일 · {STATUS_LABEL[s]}</div>
                    </div>
                    <span className="due none">{s === 'none' ? '점검하기' : '결과·수정'}</span>
                  </button>
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
              <span className="badge">{selDue.length}대</span>
            </div>
            <div className="belt-grid">
              {selDue.length === 0 && <div className="note">이 날짜에 점검 예정인 집진기가 없습니다.</div>}
              {selDue.map((name) => {
                const s = statusInMonth(name, selectedDate.slice(0, 7)); // 금월 기준
                const done = inspectedSet.has(name);
                return (
                  <button key={name} className="belt" onClick={() => onPickCollector(name, selectedDate)}>
                    <span className={'dot ' + s} />
                    <div className="info">
                      <div className="name">{name}</div>
                      <div className="sub">{done ? '점검완료' : (s === 'none' ? '미점검' : '점검됨')}</div>
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
            const due = collectorsDueOn(collectors, ds);
            const isToday = ds === today;
            const isSel = ds === selectedDate;
            return (
              <button
                key={ds}
                className={'day' + (isToday ? ' today' : '') + (isSel && !isToday ? ' sel' : '')}
                onClick={() => onSelectDate(ds)}
              >
                {d}
                {due.length > 0 && (
                  <span className="cnt">
                    {due.slice(0, 3).map((name, k) => {
                      const s = statusInMonth(name, ds.slice(0, 7));
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
        <div className="note">날짜를 누르면 해당일 점검 예정 집진기가 위쪽에 표시됩니다 · 기본값: 오늘</div>
      </div>
    </>
  );
}
