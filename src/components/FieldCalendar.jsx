import { beltsScheduledOn } from '../lib/selectors.js';

const WD = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

export default function FieldCalendar({
  year,
  month, // 1-based
  schedules,
  today,
  statusOf,
  selectedDate,
  onSelectDate,
  onPrev,
  onNext,
  onPickBelt,
  groupOf,
  onOpenLeaderboard,
  fixedInspector,
  onOpenDeviceInspector,
}) {
  const first = new Date(year, month - 1, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dateStr = (d) => `${year}-${pad(month)}-${pad(d)}`;

  const selBelts = beltsScheduledOn(schedules, selectedDate);

  return (
    <>
      <header>
        <span className="logo">🦺</span>
        <h1>3선탄 벨트컨베이어 주기점검</h1>
        {onOpenLeaderboard && (
          <button className="hdr-btn" onClick={onOpenLeaderboard} aria-label="점검 포인트 랭킹">🏆</button>
        )}
        <a className="hdr-btn" href="/manual.html" target="_blank" rel="noopener" aria-label="사용설명서">📖</a>
        <span className="mode-badge mode-field">점검모드</span>
      </header>
      <div className="body">
        {onOpenDeviceInspector && (
          <button className="device-insp" onClick={onOpenDeviceInspector}>
            <span>👤 점검자: {fixedInspector ? <b>{fixedInspector}</b> : <span className="none">미고정 (이 기기)</span>}</span>
            <span className="set">{fixedInspector ? '변경' : '고정하기'}</span>
          </button>
        )}
        <div className="cal-head">
          <button onClick={onPrev} aria-label="이전 달">‹</button>
          <span className="ym">{year}년 {month}월</span>
          <button onClick={onNext} aria-label="다음 달">›</button>
        </div>

        <div className="sel-date-title">
          📋 {selectedDate} 점검 예정
          <span className="badge">{selBelts.length}대</span>
        </div>
        <div className="belt-grid">
          {selBelts.length === 0 && <div className="note">이 날짜에 편성된 점검이 없습니다.</div>}
          {selBelts.map((b) => {
            const s = statusOf(b);
            return (
              <button key={b} className="belt" onClick={() => onPickBelt(b, selectedDate)}>
                <span className={'dot ' + s} />
                <div className="info">
                  <div className="name">{b}</div>
                  <div className="sub">{groupOf(b)} · {s === 'none' ? '미점검' : '점검됨'}</div>
                </div>
                <span className="due none">입력하기</span>
              </button>
            );
          })}
        </div>

        <div className="cal">
          {WD.map((w, i) => (
            <div key={w} className={'wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</div>
          ))}
          {cells.map((d, i) => {
            if (d == null) return <div key={'e' + i} className="day empty" />;
            const ds = dateStr(d);
            const belts = beltsScheduledOn(schedules, ds);
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
