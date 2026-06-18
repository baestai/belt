import { useMemo, useState } from 'react';
import {
  SHIFT_GROUPS,
  SHIFT_LABEL,
  SHIFT_TIME,
  fmtYmd,
  shiftsOnDate,
  shiftOfGroup,
  eligibleShift,
  eligibleSubstitutes,
  groupOfPerson,
  settlementPeriod,
  inPeriod,
  substituteCounts,
  hasPin,
  verifyPin,
} from '../lib/shift.js';

const SHIFT_CLASS = { day: 'sub-day', night: 'sub-night', off: 'sub-off' };

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return fmtYmd(new Date(y, m - 1, d + n));
}
function fmtKDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${wd})`;
}

// ── 로그인 게이트 ──────────────────────────────────────
function LoginGate({ shiftGroups, shiftPins, onLogin, onSetPin }) {
  const allNames = SHIFT_GROUPS.flatMap((g) => shiftGroups[g] || []);
  const [name, setName] = useState(allNames[0] || '');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const needSetup = name && !hasPin(shiftPins, name);

  const submit = () => {
    setErr('');
    try {
      if (needSetup) {
        onSetPin(name, pin); // 4자리+ 숫자 검증은 setPin에서
        onLogin(name);
      } else if (verifyPin(shiftPins, name, pin)) {
        onLogin(name);
      } else {
        setErr('PIN이 올바르지 않습니다.');
      }
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>🔐 대근 관리 로그인</h3>
      <label className="sub-lbl">이름</label>
      <select
        className="sub-input"
        value={name}
        onChange={(e) => { setName(e.target.value); setPin(''); setErr(''); }}
      >
        {SHIFT_GROUPS.map((g) => (
          <optgroup key={g} label={`${g}조`}>
            {(shiftGroups[g] || []).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <label className="sub-lbl">
        {needSetup ? '새 PIN 설정 (숫자 4자리 이상)' : 'PIN'}
      </label>
      <input
        className="sub-input"
        type="password"
        inputMode="numeric"
        value={pin}
        placeholder={needSetup ? '처음이시면 PIN을 만드세요' : 'PIN 입력'}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {needSetup && (
        <p className="sub-hint">⚠️ 등록된 PIN이 없습니다. 입력한 값이 내 PIN으로 저장됩니다. (내부 인원 구분용)</p>
      )}
      {err && <p className="sub-err">{err}</p>}
      <button className="primary-btn" onClick={submit}>
        {needSetup ? 'PIN 만들고 시작' : '로그인'}
      </button>
    </div>
  );
}

// 정산기간(start~end) 전체 날짜 배열
function daysInPeriod(start, end) {
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

// ── 정산기간 교대표 (16일~익월15일) ───────────────────
function ShiftBoard({ start, end, today, myGroup, substitutions = [], onPickOpen }) {
  const days = daysInPeriod(start, end);
  // { 'date|group': [sub, ...] } 빠른 조회
  const subMap = {};
  for (const s of substitutions) {
    const k = `${s.date}|${s.group}`;
    (subMap[k] || (subMap[k] = [])).push(s);
  }
  return (
    <div className="sub-board">
      <table className="sub-table">
        <thead>
          <tr>
            <th>날짜</th>
            {SHIFT_GROUPS.map((g) => (
              <th key={g} className={g === myGroup ? 'sub-me-col' : ''}>{g}조</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const s = shiftsOnDate(d);
            return (
              <tr key={d} className={d === today ? 'sub-today-row' : ''}>
                <td className="sub-date">{fmtKDate(d)}</td>
                {SHIFT_GROUPS.map((g) => {
                  const subs = subMap[`${d}|${g}`] || [];
                  return (
                    <td key={g} className={`${SHIFT_CLASS[s[g]]} ${g === myGroup ? 'sub-me-col' : ''}`}>
                      {SHIFT_LABEL[s[g]]}
                      {subs.map((sub) => (
                        <div key={sub.id} className="sub-cell-swap">
                          <span className="sub-cell-req">{sub.requester}</span>
                          <span className="sub-cell-arrow">↓</span>
                          {sub.substitute ? (
                            <span className="sub-cell-sub">{sub.substitute}</span>
                          ) : (
                            <button
                              type="button"
                              className="sub-cell-sub open"
                              onClick={() => onPickOpen && onPickOpen(sub)}
                            >
                              모집중 ▾
                            </button>
                          )}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sub-legend">
        <span className="sub-day">주간 {SHIFT_TIME.day}</span> ·{' '}
        <span className="sub-night">야간 {SHIFT_TIME.night}</span> ·{' '}
        <span className="sub-off">휴무</span>
      </p>
      <p className="sub-legend">셀의 <span className="sub-cell-req">윗줄</span>=원 근무자 · <span className="sub-cell-sub">아랫줄</span>=대근자</p>
    </div>
  );
}

// ── 대근자 선택(모집중 클릭) ──────────────────────────
function ClaimPicker({ sub, shiftGroups, onClaim, onClose }) {
  const candidates = eligibleSubstitutes(shiftGroups, sub.date, sub.shift, [sub.requester]);
  const [pick, setPick] = useState(candidates[0]?.name || '');
  const [err, setErr] = useState('');

  const submit = () => {
    setErr('');
    try {
      onClaim(sub.id, pick);
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>🙋 대근자 선택</h3>
        <p className="sub-hint">
          {fmtKDate(sub.date)} · {SHIFT_LABEL[sub.shift]} · 원 근무자 {sub.requester}({sub.group}조)
        </p>
        {candidates.length === 0 ? (
          <p className="sub-err" style={{ marginTop: 12 }}>
            이 날 대근 가능한 인원이 없습니다.
          </p>
        ) : (
          <>
            <label>대근 가능자</label>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.group}조)</option>
              ))}
            </select>
          </>
        )}
        {err && <p className="sub-err">{err}</p>}
        <div className="modal-actions">
          <button className="add-btn secondary" onClick={onClose}>취소</button>
          <button className="add-btn" disabled={!pick} onClick={submit}>대근 확정</button>
        </div>
      </div>
    </div>
  );
}

// ── 대근 신청 폼 ───────────────────────────────────────
function RequestForm({ me, myGroup, today, onCreate, onClose }) {
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('휴가');
  const [err, setErr] = useState('');
  const shift = shiftOfGroup(myGroup, date);
  const isWork = shift === 'day' || shift === 'night';

  const submit = () => {
    setErr('');
    try {
      onCreate({ date, group: myGroup, requester: me, reason });
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>📝 대근 신청</h3>
        <label>신청자</label>
        <input value={`${me} (${myGroup}조)`} disabled />
        <label>날짜</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="sub-hint">
          {isWork
            ? `이 날 ${myGroup}조는 ${SHIFT_LABEL[shift]} 근무입니다.`
            : `이 날 ${myGroup}조는 휴무라 대근 신청이 필요 없습니다.`}
        </p>
        <label>사유</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>휴가</option>
          <option>교육</option>
          <option>병가</option>
          <option>경조사</option>
          <option>기타</option>
        </select>
        {err && <p className="sub-err">{err}</p>}
        <div className="modal-actions">
          <button className="add-btn secondary" onClick={onClose}>취소</button>
          <button className="add-btn" disabled={!isWork} onClick={submit}>신청</button>
        </div>
      </div>
    </div>
  );
}

// ── 대근 카드 1건 ──────────────────────────────────────
function SubCard({ sub, me, shiftGroups, onClaim, onUnclaim, onCancel }) {
  const myGroup = groupOfPerson(shiftGroups, me);
  const canClaim =
    sub.status === 'open' &&
    sub.requester !== me &&
    eligibleShift(myGroup, sub.date) === sub.shift;
  const isMine = sub.requester === me;
  const iAmSub = sub.substitute === me;

  return (
    <div className={`sub-card ${sub.status}`}>
      <div className="sub-card-top">
        <span className={`sub-badge ${SHIFT_CLASS[sub.shift]}`}>{SHIFT_LABEL[sub.shift]}</span>
        <span className="sub-card-date">{fmtKDate(sub.date)}</span>
        <span className={`sub-status ${sub.status}`}>
          {sub.status === 'filled' ? '확정' : '모집중'}
        </span>
      </div>
      <div className="sub-card-body">
        <div>원 근무자: <b>{sub.requester}</b> ({sub.group}조){sub.reason ? ` · ${sub.reason}` : ''}</div>
        <div>대근자: {sub.substitute ? <b>{sub.substitute}</b> : <span className="sub-muted">미정</span>}</div>
      </div>
      <div className="sub-card-actions">
        {canClaim && <button className="add-btn" onClick={() => onClaim(sub.id)}>내가 대근하기</button>}
        {iAmSub && sub.status === 'filled' && (
          <button className="add-btn secondary" onClick={() => onUnclaim(sub.id)}>대근 취소</button>
        )}
        {isMine && sub.status === 'open' && (
          <button className="add-btn secondary" onClick={() => onCancel(sub.id)}>신청 삭제</button>
        )}
      </div>
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────
export default function SubstitutionPage({
  shiftGroups,
  shiftPins,
  substitutions,
  today,
  onSetPin,
  onCreateSub,
  onClaimSub,
  onUnclaimSub,
  onCancelSub,
}) {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('list'); // 'list' | 'board' | 'count'
  const [onlyMine, setOnlyMine] = useState(false);
  const [showReq, setShowReq] = useState(false);
  const [pickFor, setPickFor] = useState(null); // 모집중 클릭한 대근 건
  const [boardRef, setBoardRef] = useState(today); // 근무표가 보여줄 정산기간 기준일
  const boardPeriod = settlementPeriod(boardRef);

  const myGroup = me ? groupOfPerson(shiftGroups, me) : null;
  const period = settlementPeriod(today);
  const counts = useMemo(() => substituteCounts(substitutions, period), [substitutions, period.start, period.end]);

  const sorted = useMemo(
    () => [...substitutions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [substitutions]
  );
  const visible = onlyMine
    ? sorted.filter((s) => s.requester === me || s.substitute === me)
    : sorted;

  if (!me) {
    return (
      <>
        <header>
          <span className="logo">🔁</span>
          <h1>대근(代勤) 관리</h1>
        </header>
        <main style={{ padding: 16 }}>
          <LoginGate
            shiftGroups={shiftGroups}
            shiftPins={shiftPins}
            onLogin={setMe}
            onSetPin={onSetPin}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <header>
        <span className="logo">🔁</span>
        <h1>대근 관리</h1>
        <button className="hdr-btn" title="로그아웃" onClick={() => setMe(null)}>🚪</button>
        <span className="mode-badge" style={{ background: 'var(--accent)', color: '#fff' }}>
          {me} · {myGroup}조
        </span>
      </header>

      <main style={{ padding: 16 }}>
        <div className="seg">
          <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>대근 목록</button>
          <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>근무표</button>
          <button className={tab === 'count' ? 'active' : ''} onClick={() => setTab('count')}>집계</button>
        </div>

        {tab === 'list' && (
          <>
            <div className="sub-toolbar">
              <button className="primary-btn" style={{ marginTop: 0 }} onClick={() => setShowReq(true)}>
                ＋ 대근 신청
              </button>
              <label className="sub-check">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                내 관련만
              </label>
            </div>
            {visible.length === 0 ? (
              <p className="sub-empty">대근 신청 내역이 없습니다.</p>
            ) : (
              visible.map((s) => (
                <SubCard
                  key={s.id}
                  sub={s}
                  me={me}
                  shiftGroups={shiftGroups}
                  onClaim={(id) => onClaimSub(id, me)}
                  onUnclaim={onUnclaimSub}
                  onCancel={onCancelSub}
                />
              ))
            )}
          </>
        )}

        {tab === 'board' && (
          <>
            <div className="sub-toolbar">
              <button className="add-btn secondary" onClick={() => setBoardRef(addDays(boardPeriod.start, -1))}>◀ 이전</button>
              <button className="add-btn secondary" onClick={() => setBoardRef(today)}>이번</button>
              <button className="add-btn secondary" onClick={() => setBoardRef(addDays(boardPeriod.end, 1))}>다음 ▶</button>
            </div>
            <p className="sub-period">{boardPeriod.start} ~ {boardPeriod.end}</p>
            <ShiftBoard
              start={boardPeriod.start}
              end={boardPeriod.end}
              today={today}
              myGroup={myGroup}
              substitutions={substitutions}
              onPickOpen={setPickFor}
            />
          </>
        )}

        {tab === 'count' && (
          <div className="card">
            <h3>🏅 대근 집계 <span className="count">{period.start} ~ {period.end}</span></h3>
            {counts.length === 0 ? (
              <p className="sub-empty">이 정산 기간 확정된 대근이 없습니다.</p>
            ) : (
              <ol className="sub-rank">
                {counts.map((c, i) => (
                  <li key={c.name} className={c.name === me ? 'sub-me-row' : ''}>
                    <span className="sub-rank-no">{i + 1}</span>
                    <span className="sub-rank-name">{c.name}</span>
                    <span className="sub-rank-cnt">{c.count}건</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </main>

      {showReq && (
        <RequestForm
          me={me}
          myGroup={myGroup}
          today={today}
          onCreate={onCreateSub}
          onClose={() => setShowReq(false)}
        />
      )}

      {pickFor && (
        <ClaimPicker
          sub={pickFor}
          shiftGroups={shiftGroups}
          onClaim={onClaimSub}
          onClose={() => setPickFor(null)}
        />
      )}
    </>
  );
}
