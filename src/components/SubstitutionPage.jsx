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
  isSlotFull,
  settlementPeriod,
  inPeriod,
  substituteCounts,
  hasPin,
  verifyPin,
  EXTRA_WORK_REASONS,
  extraWorkCounts,
  recommendSubstitutes,
  extraBurdenSummary,
} from '../lib/shift.js';

const SHIFT_CLASS = { day: 'sub-day', night: 'sub-night', off: 'sub-off' };
const SUB_REASONS = ['휴가', '교육', '청원', '검진'];

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
function LoginGate({ shiftGroups, shiftPins, pinResets = [], onLogin, onSetPin, onRequestPinReset, onVerifyAdmin, onAdminLogin }) {
  const allNames = SHIFT_GROUPS.flatMap((g) => shiftGroups[g] || []);
  const [name, setName] = useState(allNames[0] || '');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminErr, setAdminErr] = useState('');
  const needSetup = name && !hasPin(shiftPins, name);
  const resetPending = name && pinResets.includes(name);

  const adminSubmit = () => {
    setAdminErr('');
    if (onVerifyAdmin && onVerifyAdmin(adminPw)) {
      onAdminLogin(adminPw);
    } else {
      setAdminErr('관리자 비밀번호가 올바르지 않습니다.');
    }
  };

  const submit = () => {
    setErr('');
    try {
      if (needSetup) {
        onSetPin(name, pin); // 4~6자리 숫자 검증은 setPin에서
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

  const requestReset = () => {
    if (!name) return;
    onRequestPinReset && onRequestPinReset(name);
    window.alert(`${name}님의 PIN 초기화를 신청했습니다.\n관리자 승인 후 새 PIN을 설정할 수 있습니다.`);
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
        {needSetup ? '새 PIN 설정 (숫자 4~6자리)' : 'PIN'}
      </label>
      <input
        className="sub-input"
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        placeholder={needSetup ? '처음이시면 PIN을 만드세요 (4~6자리)' : 'PIN 입력'}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {needSetup && (
        <p className="sub-hint">⚠️ 등록된 PIN이 없습니다. 입력한 값이 내 PIN으로 저장됩니다. (내부 인원 구분용)</p>
      )}
      {resetPending && (
        <p className="sub-hint">⏳ PIN 초기화 신청이 접수되었습니다. 관리자 승인 후 새 PIN을 설정하세요.</p>
      )}
      {err && <p className="sub-err">{err}</p>}
      <button className="primary-btn" onClick={submit}>
        {needSetup ? 'PIN 만들고 시작' : '로그인'}
      </button>
      {!needSetup && (
        <button className="ghost-btn" onClick={requestReset}>PIN 분실 — 초기화 신청</button>
      )}
      {onAdminLogin && (
        <div className="sub-admin-login">
          {!adminOpen ? (
            <button className="ghost-btn" onClick={() => setAdminOpen(true)}>🔧 관리자 모드 (대근 편성 관리)</button>
          ) : (
            <>
              <label className="sub-lbl">관리자 비밀번호</label>
              <input
                className="sub-input"
                type="password"
                value={adminPw}
                placeholder="관리자 비밀번호 입력"
                onChange={(e) => setAdminPw(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adminSubmit()}
              />
              <p className="sub-hint">관리자는 모든 대근 편성을 입력·수정·삭제할 수 있습니다.</p>
              {adminErr && <p className="sub-err">{adminErr}</p>}
              <button className="primary-btn" onClick={adminSubmit}>관리자로 로그인</button>
            </>
          )}
        </div>
      )}
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
function ShiftBoard({ start, end, today, myGroup, substitutions = [], extraWorks = [], shiftGroups = {}, onPickOpen, isAdmin = false, onEditSub, onEditExtra }) {
  const days = daysInPeriod(start, end);
  // { 'date|group': [sub, ...] } 빠른 조회
  const subMap = {};
  for (const s of substitutions) {
    const k = `${s.date}|${s.group}`;
    (subMap[k] || (subMap[k] = [])).push(s);
  }
  // 추가근무: 신청자의 소속 조 기준으로 날짜|조 셀에 표시
  const extraMap = {};
  for (const e of extraWorks) {
    const g = groupOfPerson(shiftGroups, e.person);
    if (!g) continue;
    const k = `${e.date}|${g}`;
    (extraMap[k] || (extraMap[k] = [])).push(e);
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
                  const extras = extraMap[`${d}|${g}`] || [];
                  return (
                    <td key={g} className={`${SHIFT_CLASS[s[g]]} ${g === myGroup ? 'sub-me-col' : ''}`}>
                      {SHIFT_LABEL[s[g]]}
                      {subs.map((sub) => (
                        isAdmin ? (
                          <button
                            key={sub.id}
                            type="button"
                            className="sub-cell-swap sub-cell-admin"
                            onClick={() => onEditSub && onEditSub(sub)}
                            title="클릭하여 수정"
                          >
                            <span className="sub-cell-req">{sub.requester}</span>
                            <span className="sub-cell-arrow">↓</span>
                            <span className="sub-cell-sub">{sub.substitute || '미정'}</span>
                          </button>
                        ) : (
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
                                대근 ▾
                              </button>
                            )}
                          </div>
                        )
                      ))}
                      {extras.map((e) => (
                        isAdmin ? (
                          <button
                            key={e.id}
                            type="button"
                            className="sub-cell-extra sub-cell-admin"
                            onClick={() => onEditExtra && onEditExtra(e)}
                            title="클릭하여 수정"
                          >
                            <span className="sub-cell-extra-tag">{e.reason}</span>
                            <span className="sub-cell-extra-nm">{e.person}</span>
                          </button>
                        ) : (
                          <div key={e.id} className="sub-cell-extra">
                            <span className="sub-cell-extra-tag">{e.reason}</span>
                            <span className="sub-cell-extra-nm">{e.person}</span>
                          </div>
                        )
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
      <p className="sub-legend">셀의 <span className="sub-cell-req">윗줄</span>=원 근무자 · <span className="sub-cell-sub">아랫줄</span>=대근자 · <span className="sub-cell-extra-tag">교육대근/GIB/PSM</span>=추가근무</p>
    </div>
  );
}

// ── 대근 편성 월간 캘린더 ──────────────────────────────
const CAL_WD = ['일', '월', '화', '수', '목', '금', '토'];
function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}
function ShiftCalendar({ refDate, selected, today, substitutions = [], extraWorks = [], onSelectDate, onPrevMonth, onNextMonth }) {
  const [y, m] = refDate.split('-').map(Number); // m: 1-based
  const startWd = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const dateStr = (d) => `${y}-${pad2(m)}-${pad2(d)}`;

  const subByDate = {};
  for (const s of substitutions) (subByDate[s.date] || (subByDate[s.date] = [])).push(s);
  const extraByDate = {};
  for (const e of extraWorks) (extraByDate[e.date] || (extraByDate[e.date] = [])).push(e);

  return (
    <div className="sc-wrap">
      <div className="sc-head">
        <button onClick={onPrevMonth} aria-label="이전 달">‹</button>
        <span className="sc-ym">{y}년 {m}월</span>
        <button onClick={onNextMonth} aria-label="다음 달">›</button>
      </div>
      <div className="sc-grid">
        {CAL_WD.map((w, i) => (
          <div key={w} className={'sc-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={'e' + i} className="sc-empty" />;
          const ds = dateStr(d);
          const s = shiftsOnDate(ds);
          const dayG = SHIFT_GROUPS.find((g) => s[g] === 'day');
          const nightG = SHIFT_GROUPS.find((g) => s[g] === 'night');
          const subs = subByDate[ds] || [];
          const extras = extraByDate[ds] || [];
          const wd = new Date(y, m - 1, d).getDay();
          const isToday = ds === today;
          const isSel = ds === selected;
          return (
            <button
              key={ds}
              className={'sc-cell' + (isToday ? ' today' : '') + (isSel && !isToday ? ' sel' : '')}
              onClick={() => onSelectDate(ds)}
            >
              <span className="sc-top">
                <span className={'sc-date' + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : '')}>{d}</span>
                {(subs.length > 0 || extras.length > 0) && (
                  <span className="sc-dots">
                    {subs.length > 0 && <i className="sc-dot sub" title={`대근 ${subs.length}건`} />}
                    {extras.length > 0 && <i className="sc-dot extra" title={`추가근무 ${extras.length}건`} />}
                  </span>
                )}
              </span>
              <span className="sc-shift day"><b>주</b>{dayG || '-'}</span>
              <span className="sc-shift night"><b>야</b>{nightG || '-'}</span>
            </button>
          );
        })}
      </div>
      <div className="sc-legend">
        <span><i className="sc-tag day">주</i>주간조</span>
        <span><i className="sc-tag night">야</i>야간조</span>
        <span><i className="sc-dot sub" />대근</span>
        <span><i className="sc-dot extra" />추가근무</span>
      </div>
    </div>
  );
}

// ── 선택일 근무현황 상세 ───────────────────────────────
function DayDetail({ date, substitutions = [], extraWorks = [], onEditSub, onEditExtra }) {
  const s = shiftsOnDate(date);
  const subs = substitutions.filter((x) => x.date === date);
  const extras = extraWorks.filter((x) => x.date === date);
  return (
    <div className="card sub-day-detail">
      <h3>📅 {fmtKDate(date)} 근무현황</h3>
      <div className="sub-day-grid">
        {SHIFT_GROUPS.map((g) => {
          const subsG = subs.filter((x) => x.group === g);
          return (
            <div key={g} className={`sub-day-col ${SHIFT_CLASS[s[g]]}`}>
              <div className="sub-day-ghead">{g}조 · {SHIFT_LABEL[s[g]]}</div>
              {subsG.length === 0 ? (
                <div className="sub-day-empty">—</div>
              ) : (
                subsG.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className="sub-day-swap"
                    onClick={() => onEditSub && onEditSub(sub)}
                    title="클릭하여 수정"
                  >
                    <span className="sub-cell-req">{sub.requester}</span>
                    {sub.reason ? <span className="sub-day-reason"> {sub.reason}</span> : null}
                    <span className="sub-cell-arrow"> ↓ </span>
                    <span className="sub-cell-sub">{sub.substitute || '미정'}</span>
                  </button>
                ))
              )}
            </div>
          );
        })}
      </div>
      <div className="sub-day-extras">
        <div className="sub-day-ghead">추가근무</div>
        {extras.length === 0 ? (
          <div className="sub-day-empty">—</div>
        ) : (
          extras.map((e) => (
            <button
              key={e.id}
              type="button"
              className="sub-cell-extra sub-day-extra-btn"
              onClick={() => onEditExtra && onEditExtra(e)}
              title="클릭하여 수정"
            >
              <span className="sub-cell-extra-tag">{e.reason}</span>
              <span className="sub-cell-extra-nm">{e.person}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── 대근자 선택(모집중 클릭) — 자동 추천 정렬 ──────────
function ClaimPicker({ sub, shiftGroups, substitutions = [], extraWorks = [], onClaim, onClose }) {
  // 같은 날 이미 대근을 맡은 직원은 제외 (1일 최대 1회)
  const busy = substitutions
    .filter((s) => s.date === sub.date && s.substitute && s.id !== sub.id)
    .map((s) => s.substitute);
  // 공평순(그 주 근무시간↓ → 정산기간 대근수↓) 추천 정렬
  const candidates = recommendSubstitutes(
    shiftGroups, sub.date, sub.shift,
    { substitutions, extraWorks },
    [sub.requester, ...busy]
  );
  const [pick, setPick] = useState(candidates[0]?.name || '');
  const [err, setErr] = useState('');
  const best = candidates[0];

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
            {best && (
              <p className="sub-reco">⭐ 추천: <b>{best.name}</b> ({best.group}조) · 이번주 {best.weekHours}h · 기간 대근 {best.periodSubs}건</p>
            )}
            <label>대근 가능자 (공평순 정렬)</label>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              {candidates.map((c, i) => (
                <option key={c.name} value={c.name}>
                  {i === 0 ? '⭐ ' : ''}{c.name} ({c.group}조) · 이번주 {c.weekHours}h · 대근 {c.periodSubs}건
                </option>
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

// ── 알림 벨 (개인 맞춤 알림) ───────────────────────────
function buildNotifications(me, myGroup, { substitutions = [], swaps = [], today }) {
  const out = [];
  for (const s of substitutions) {
    if (s.date < today) continue;
    // 내가 자격되는 모집중 대근
    if (s.status === 'open' && s.requester !== me && myGroup && eligibleShift(myGroup, s.date) === s.shift) {
      out.push({ id: 'open_' + s.id, icon: '🙋', text: `대근 모집: ${fmtKDate(s.date)} ${SHIFT_LABEL[s.shift]} (${s.requester})`, date: s.date });
    }
    // 내 신청이 대근 확정됨
    if (s.requester === me && s.status === 'filled' && s.substitute) {
      out.push({ id: 'filled_' + s.id, icon: '✅', text: `내 대근 확정: ${fmtKDate(s.date)} → ${s.substitute}`, date: s.date });
    }
    // 내가 대근 맡은 예정 근무
    if (s.substitute === me && s.status === 'filled') {
      out.push({ id: 'mysub_' + s.id, icon: '📌', text: `대근 예정: ${fmtKDate(s.date)} ${SHIFT_LABEL[s.shift]} (${s.requester} 대신)`, date: s.date });
    }
  }
  // 나에게 온 맞교환 요청 (대기중)
  for (const w of swaps) {
    if (w.status === 'pending' && w.target === me) {
      out.push({ id: 'swap_' + w.id, icon: '🔄', text: `맞교환 요청: ${w.requester} (${fmtKDate(w.requesterDate)} ↔ ${fmtKDate(w.targetDate)})`, date: w.requesterDate });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function NotificationBell({ me, myGroup, substitutions, swaps, today }) {
  const [open, setOpen] = useState(false);
  const notifs = buildNotifications(me, myGroup, { substitutions, swaps, today });
  const seenKey = `subNotifSeen_${me}`;
  const seen = (() => { try { return new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch { return new Set(); } })();
  const unread = notifs.filter((n) => !seen.has(n.id)).length;
  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      try { localStorage.setItem(seenKey, JSON.stringify(notifs.map((n) => n.id))); } catch {}
    }
  };
  return (
    <span className="notif-wrap">
      <button className="hdr-btn notif-btn" onClick={toggle} aria-label="알림" title="알림">
        🔔{unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-head">알림 {notifs.length > 0 && `(${notifs.length})`}</div>
            {notifs.length === 0 ? (
              <div className="notif-empty">새 알림이 없습니다.</div>
            ) : (
              notifs.map((n) => (
                <div key={n.id} className="notif-item">
                  <span className="notif-ico">{n.icon}</span>
                  <span className="notif-txt">{n.text}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </span>
  );
}

// ── 대근 신청 폼 ───────────────────────────────────────
function RequestForm({ me, myGroup, today, substitutions = [], onCreate, onClose }) {
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('휴가');
  const [err, setErr] = useState('');
  const shift = shiftOfGroup(myGroup, date);
  const isWork = shift === 'day' || shift === 'night';

  const submit = () => {
    setErr('');
    const payload = { date, group: myGroup, requester: me, reason };
    try {
      // 정원(주간/야간 각 3명) 초과 시: 빈 화면 대신 확인창 → 확인하면 강행
      if (isWork && isSlotFull(substitutions, date, shift)) {
        const ok = window.confirm('대근 가능 인원이 초과되었습니다.\n그래도 대근 신청하시겠습니까?');
        if (!ok) return;
        onCreate(payload, { force: true });
      } else {
        onCreate(payload);
      }
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
          {SUB_REASONS.map((r) => <option key={r}>{r}</option>)}
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
function SubCard({ sub, me, shiftGroups, substitutions = [], onClaim, onUnclaim, onCancel }) {
  const myGroup = groupOfPerson(shiftGroups, me);
  const eligible =
    sub.status === 'open' &&
    sub.requester !== me &&
    eligibleShift(myGroup, sub.date) === sub.shift;
  // 같은 날 내가 이미 다른 대근을 맡고 있으면 불가 (1일 최대 1회)
  const myBusyToday = substitutions.some(
    (s) => s.id !== sub.id && s.date === sub.date && s.substitute === me
  );
  const canClaim = eligible && !myBusyToday;
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
        {eligible && myBusyToday && (
          <button className="add-btn secondary" disabled title="해당 날짜에 이미 대근을 맡았습니다 (1일 최대 1회)">대근 불가</button>
        )}
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

// ── 추가 근무 신청 폼 ──────────────────────────────────
function ExtraWorkForm({ me, myGroup, today, onCreate, onClose }) {
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState(EXTRA_WORK_REASONS[0]);
  const [err, setErr] = useState('');

  const submit = () => {
    setErr('');
    try {
      onCreate({ date, person: me, reason });
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>➕ 추가 근무 신청</h3>
        <label>신청자</label>
        <input value={`${me} (${myGroup}조)`} disabled />
        <label>날짜</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="sub-hint">대근과 무관하게 신청하는 추가 근무입니다.</p>
        <label>사유</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {EXTRA_WORK_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        {err && <p className="sub-err">{err}</p>}
        <div className="modal-actions">
          <button className="add-btn secondary" onClick={onClose}>취소</button>
          <button className="add-btn" onClick={submit}>신청</button>
        </div>
      </div>
    </div>
  );
}

// ── 추가 근무 카드 1건 ─────────────────────────────────
function ExtraCard({ extra, me, onCancel }) {
  const isMine = extra.person === me;
  return (
    <div className="sub-card filled">
      <div className="sub-card-top">
        <span className="sub-badge sub-extra">{extra.reason}</span>
        <span className="sub-card-date">{fmtKDate(extra.date)}</span>
        <span className="sub-status">추가 근무</span>
      </div>
      <div className="sub-card-body">
        <div>근무자: <b>{extra.person}</b></div>
      </div>
      {isMine && (
        <div className="sub-card-actions">
          <button className="add-btn secondary" onClick={() => onCancel(extra.id)}>신청 삭제</button>
        </div>
      )}
    </div>
  );
}

// ── 관리자 대근 편성 입력/수정 폼 ──────────────────────
function AdminSubForm({ shiftGroups, today, edit, onSubmit, onClose }) {
  const allNames = SHIFT_GROUPS.flatMap((g) => shiftGroups[g] || []);
  const [date, setDate] = useState(edit?.date || today);
  const [group, setGroup] = useState(edit?.group || SHIFT_GROUPS[0]);
  const [requester, setRequester] = useState(edit?.requester || (shiftGroups[edit?.group || SHIFT_GROUPS[0]] || [])[0] || '');
  const [reason, setReason] = useState(edit?.reason || '휴가');
  const [substitute, setSubstitute] = useState(edit?.substitute || '');
  const [err, setErr] = useState('');

  const members = shiftGroups[group] || [];
  const shift = shiftOfGroup(group, date);
  const isWork = shift === 'day' || shift === 'night';

  const changeGroup = (g) => {
    setGroup(g);
    const ms = shiftGroups[g] || [];
    if (!ms.includes(requester)) setRequester(ms[0] || '');
  };

  const submit = () => {
    setErr('');
    try {
      onSubmit({ date, group, requester, reason, substitute: substitute || null });
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>{edit ? '✏ 대근 편성 수정' : '➕ 대근 편성 추가'}</h3>
        <label>날짜</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="sub-hint">
          {isWork
            ? `이 날 ${group}조는 ${SHIFT_LABEL[shift]} 근무입니다.`
            : `이 날 ${group}조는 휴무입니다. (주간으로 편성됩니다)`}
        </p>
        <label>조</label>
        <select value={group} onChange={(e) => changeGroup(e.target.value)}>
          {SHIFT_GROUPS.map((g) => <option key={g} value={g}>{g}조</option>)}
        </select>
        <label>원 근무자</label>
        <select value={requester} onChange={(e) => setRequester(e.target.value)}>
          {members.length === 0 && <option value="">(편성된 인원 없음)</option>}
          {members.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label>사유</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {SUB_REASONS.map((r) => <option key={r}>{r}</option>)}
          {reason && !SUB_REASONS.includes(reason) && <option>{reason}</option>}
        </select>
        <label>대근자 (선택)</label>
        <select value={substitute} onChange={(e) => setSubstitute(e.target.value)}>
          <option value="">미정 (모집중)</option>
          {allNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {err && <p className="sub-err">{err}</p>}
        <div className="modal-actions">
          <button className="add-btn secondary" onClick={onClose}>취소</button>
          <button className="add-btn" disabled={!requester} onClick={submit}>{edit ? '수정 저장' : '편성 추가'}</button>
        </div>
      </div>
    </div>
  );
}

// ── 관리자용 대근 카드 (수정/삭제) ─────────────────────
function AdminSubCard({ sub, onEdit, onDelete }) {
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
        <button className="add-btn secondary" onClick={() => onEdit(sub)}>✏ 수정</button>
        <button className="add-btn secondary" onClick={() => onDelete(sub)}>🗑 삭제</button>
      </div>
    </div>
  );
}

// ── 관리자 추가 근무 편성 입력/수정 폼 ─────────────────
function AdminExtraForm({ shiftGroups, today, edit, onSubmit, onClose }) {
  const allNames = SHIFT_GROUPS.flatMap((g) => shiftGroups[g] || []);
  const [date, setDate] = useState(edit?.date || today);
  const [person, setPerson] = useState(edit?.person || allNames[0] || '');
  const [reason, setReason] = useState(edit?.reason || EXTRA_WORK_REASONS[0]);
  const [err, setErr] = useState('');

  const submit = () => {
    setErr('');
    try {
      onSubmit({ date, person, reason });
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>{edit ? '✏ 추가 근무 수정' : '➕ 추가 근무 편성 추가'}</h3>
        <label>날짜</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>근무자</label>
        <select value={person} onChange={(e) => setPerson(e.target.value)}>
          {allNames.length === 0 && <option value="">(편성된 인원 없음)</option>}
          {SHIFT_GROUPS.map((g) => (
            <optgroup key={g} label={`${g}조`}>
              {(shiftGroups[g] || []).map((n) => <option key={n} value={n}>{n}</option>)}
            </optgroup>
          ))}
        </select>
        <label>사유</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {EXTRA_WORK_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        {err && <p className="sub-err">{err}</p>}
        <div className="modal-actions">
          <button className="add-btn secondary" onClick={onClose}>취소</button>
          <button className="add-btn" disabled={!person} onClick={submit}>{edit ? '수정 저장' : '편성 추가'}</button>
        </div>
      </div>
    </div>
  );
}

// ── 관리자용 추가 근무 카드 (수정/삭제) ────────────────
function AdminExtraCard({ extra, onEdit, onDelete }) {
  return (
    <div className="sub-card filled">
      <div className="sub-card-top">
        <span className="sub-badge sub-extra">{extra.reason}</span>
        <span className="sub-card-date">{fmtKDate(extra.date)}</span>
        <span className="sub-status">추가 근무</span>
      </div>
      <div className="sub-card-body">
        <div>근무자: <b>{extra.person}</b></div>
      </div>
      <div className="sub-card-actions">
        <button className="add-btn secondary" onClick={() => onEdit(extra)}>✏ 수정</button>
        <button className="add-btn secondary" onClick={() => onDelete(extra)}>🗑 삭제</button>
      </div>
    </div>
  );
}

// ── 대근 맞교환 신청 폼 ────────────────────────────────
function SwapForm({ me, myGroup, shiftGroups, today, onCreate, onClose }) {
  const [myDate, setMyDate] = useState(today);
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState(today);
  const [err, setErr] = useState('');

  const myShift = shiftOfGroup(myGroup, myDate);
  const myWork = myShift === 'day' || myShift === 'night';
  const targetGroup = target ? groupOfPerson(shiftGroups, target) : null;
  const targetShift = targetGroup ? shiftOfGroup(targetGroup, targetDate) : null;
  const targetWork = targetShift === 'day' || targetShift === 'night';

  const submit = () => {
    setErr('');
    try {
      onCreate({ requester: me, requesterDate: myDate, target, targetDate });
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>🔄 대근 맞교환 신청</h3>
        <label>내 근무 날짜</label>
        <input type="date" value={myDate} onChange={(e) => setMyDate(e.target.value)} />
        <p className="sub-hint">
          {myWork ? `이 날 ${myGroup}조는 ${SHIFT_LABEL[myShift]} 근무입니다.` : `⚠️ 이 날 ${myGroup}조는 휴무입니다. 근무일을 선택하세요.`}
        </p>
        <label>맞교환 상대</label>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">상대 선택</option>
          {SHIFT_GROUPS.map((g) => (
            <optgroup key={g} label={`${g}조`}>
              {(shiftGroups[g] || []).filter((n) => n !== me).map((n) => <option key={n} value={n}>{n}</option>)}
            </optgroup>
          ))}
        </select>
        <label>상대 근무 날짜</label>
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        {target && (
          <p className="sub-hint">
            {targetWork ? `이 날 ${target}(${targetGroup}조)는 ${SHIFT_LABEL[targetShift]} 근무입니다.` : `⚠️ 이 날 ${target}는 휴무입니다. 근무일을 선택하세요.`}
          </p>
        )}
        {err && <p className="sub-err">{err}</p>}
        <p className="sub-hint">상대가 수락하면 양쪽 근무가 서로 대근으로 자동 반영됩니다.</p>
        <div className="modal-actions">
          <button className="add-btn secondary" onClick={onClose}>취소</button>
          <button className="add-btn" disabled={!myWork || !targetWork || !target} onClick={submit}>맞교환 요청</button>
        </div>
      </div>
    </div>
  );
}

// ── 맞교환 카드 1건 ────────────────────────────────────
function SwapCard({ swap, me, isAdmin, onAccept, onReject, onCancel }) {
  const incoming = swap.target === me && swap.status === 'pending';
  const mine = swap.requester === me;
  const statusLabel = { pending: '대기중', accepted: '수락됨', rejected: '거절됨' }[swap.status] || swap.status;
  return (
    <div className={`sub-card ${swap.status === 'accepted' ? 'filled' : ''}`}>
      <div className="sub-card-top">
        <span className="sub-badge">🔄 맞교환</span>
        <span className={`sub-status ${swap.status === 'accepted' ? 'filled' : 'open'}`}>{statusLabel}</span>
      </div>
      <div className="sub-card-body">
        <div><b>{swap.requester}</b> {fmtKDate(swap.requesterDate)}</div>
        <div className="sub-swap-arrow">⇅</div>
        <div><b>{swap.target}</b> {fmtKDate(swap.targetDate)}</div>
      </div>
      <div className="sub-card-actions">
        {incoming && <button className="add-btn" onClick={() => onAccept(swap.id)}>수락</button>}
        {incoming && <button className="add-btn secondary" onClick={() => onReject(swap.id)}>거절</button>}
        {(mine || isAdmin) && swap.status !== 'rejected' && (
          <button className="add-btn secondary" onClick={() => onCancel(swap.id)}>
            {swap.status === 'accepted' ? '맞교환 해제' : '요청 철회'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── 변경 이력 목록 ─────────────────────────────────────
function LogList({ logs = [] }) {
  if (logs.length === 0) return <p className="sub-empty">변경 이력이 없습니다.</p>;
  const fmtAt = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return (
    <div className="log-list">
      {logs.map((l) => (
        <div key={l.id} className="log-row">
          <div className="log-meta">
            <span className="log-action">{l.action}</span>
            <span className="log-actor">{l.actor}</span>
            <span className="log-at">{fmtAt(l.at)}</span>
          </div>
          {l.detail && <div className="log-detail">{l.detail}</div>}
        </div>
      ))}
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────
export default function SubstitutionPage({
  shiftGroups,
  shiftPins,
  pinResets = [],
  substitutions,
  extraWorks = [],
  swaps = [],
  subLogs = [],
  today,
  onSetPin,
  onRequestPinReset,
  onCreateSwap,
  onAcceptSwap,
  onRejectSwap,
  onCancelSwap,
  onCreateSub,
  onClaimSub,
  onUnclaimSub,
  onCancelSub,
  onCreateExtra,
  onCancelExtra,
  onVerifyAdmin,
  onAdminCreateSub,
  onAdminUpdateSub,
  onAdminDeleteSub,
  onAdminCreateExtra,
  onAdminUpdateExtra,
  onAdminDeleteExtra,
  onClose,
}) {
  const [me, setMe] = useState(null);
  const [adminPw, setAdminPw] = useState(null); // 관리자 로그인 시 입력한 비밀번호
  const [adminForm, setAdminForm] = useState(null); // { edit } | { create:true }
  const [adminExtraForm, setAdminExtraForm] = useState(null); // { edit } | { create:true }
  const [tab, setTab] = useState('list'); // 'list' | 'extra' | 'swap' | 'board' | 'count' | 'log'
  const [onlyMine, setOnlyMine] = useState(false);
  const [showReq, setShowReq] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [pickFor, setPickFor] = useState(null); // 모집중 클릭한 대근 건
  const [boardRef, setBoardRef] = useState(today); // 근무표가 보여줄 정산기간 기준일
  const boardPeriod = settlementPeriod(boardRef);
  const [calRef, setCalRef] = useState(today); // 편성 캘린더가 보여줄 달
  const [calSel, setCalSel] = useState(today); // 캘린더에서 선택한 날짜
  const calPrev = () => { const [y, m] = calRef.split('-').map(Number); setCalRef(fmtYmd(new Date(y, m - 2, 1))); };
  const calNext = () => { const [y, m] = calRef.split('-').map(Number); setCalRef(fmtYmd(new Date(y, m, 1))); };

  const isAdmin = !!adminPw;
  const myGroup = me && !isAdmin ? groupOfPerson(shiftGroups, me) : null;
  const period = settlementPeriod(today);

  const submitAdminForm = (payload) => {
    if (adminForm && adminForm.edit) {
      onAdminUpdateSub(adminForm.edit.id, payload, adminPw);
    } else {
      onAdminCreateSub(payload, adminPw);
    }
  };
  const deleteAdminSub = (sub) => {
    if (!window.confirm(`${fmtKDate(sub.date)} ${sub.requester}(${sub.group}조)의 대근 편성을 삭제할까요?`)) return;
    try {
      onAdminDeleteSub(sub.id, adminPw);
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };

  const submitAdminExtraForm = (payload) => {
    if (adminExtraForm && adminExtraForm.edit) {
      onAdminUpdateExtra(adminExtraForm.edit.id, payload, adminPw);
    } else {
      onAdminCreateExtra(payload, adminPw);
    }
  };
  const deleteAdminExtra = (extra) => {
    if (!window.confirm(`${fmtKDate(extra.date)} ${extra.person}의 추가 근무(${extra.reason})를 삭제할까요?`)) return;
    try {
      onAdminDeleteExtra(extra.id, adminPw);
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };
  const counts = useMemo(() => substituteCounts(substitutions, period), [substitutions, period.start, period.end]);
  const extraCounts = useMemo(() => extraWorkCounts(extraWorks, period), [extraWorks, period.start, period.end]);

  const sorted = useMemo(
    () => [...substitutions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [substitutions]
  );
  const visible = onlyMine
    ? sorted.filter((s) => s.requester === me || s.substitute === me)
    : sorted;

  // 관리자 전체 편성 목록: 오늘 이후만, 가까운 날짜가 위로(오름차순)
  const upcomingSorted = useMemo(
    () =>
      substitutions
        .filter((s) => s.date >= today)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [substitutions, today]
  );

  const sortedExtra = useMemo(
    () => [...extraWorks].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [extraWorks]
  );
  const visibleExtra = onlyMine ? sortedExtra.filter((e) => e.person === me) : sortedExtra;

  // (7) 시간 합산 대시보드 데이터
  const burden = useMemo(() => extraBurdenSummary(period, { substitutions, extraWorks }), [substitutions, extraWorks, period.start, period.end]);
  const burdenMax = burden.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  // (9) 맞교환: 관리자는 전체, 본인은 나와 관련된 것만, 최신순
  const sortedSwaps = useMemo(
    () => [...swaps].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [swaps]
  );
  const visibleSwaps = isAdmin ? sortedSwaps : sortedSwaps.filter((w) => w.requester === me || w.target === me);
  const incomingCount = swaps.filter((w) => w.status === 'pending' && w.target === me).length;

  if (!me) {
    return (
      <>
        <header>
          {onClose && (
            <button className="hdr-btn" onClick={onClose} aria-label="점검모드로">←</button>
          )}
          <span className="logo">🔁</span>
          <h1>대근(代勤) 관리</h1>
          <a className="hdr-btn" href="/manual.html" target="_blank" rel="noopener" aria-label="사용설명서" title="사용설명서" style={{ marginLeft: 'auto' }}>
            <svg className="hdr-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </a>
        </header>
        <main style={{ padding: 16 }}>
          <LoginGate
            shiftGroups={shiftGroups}
            shiftPins={shiftPins}
            pinResets={pinResets}
            onLogin={setMe}
            onSetPin={onSetPin}
            onRequestPinReset={onRequestPinReset}
            onVerifyAdmin={onVerifyAdmin}
            onAdminLogin={(pw) => { setAdminPw(pw); setMe('관리자'); }}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <header>
        {onClose && (
          <button className="hdr-btn" onClick={onClose} aria-label="점검모드로">←</button>
        )}
        <span className="logo">🔁</span>
        <h1>대근 관리</h1>
        {!isAdmin && (
          <NotificationBell me={me} myGroup={myGroup} substitutions={substitutions} swaps={swaps} today={today} />
        )}
        <a className="hdr-btn" href="/manual.html" target="_blank" rel="noopener" aria-label="사용설명서" title="사용설명서">
          <svg className="hdr-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </a>
        <button className="hdr-btn" title="로그아웃" onClick={() => { setMe(null); setAdminPw(null); }}>🚪</button>
        <span className="mode-badge" style={{ background: 'var(--accent)', color: '#fff' }}>
          {isAdmin ? '🔧 관리자' : `${me} · ${myGroup}조`}
        </span>
      </header>

      <main style={{ padding: 16 }}>
        <div className="seg">
          <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>대근 {isAdmin ? '편성' : '목록'}</button>
          <button className={tab === 'extra' ? 'active' : ''} onClick={() => setTab('extra')}>추가 근무{isAdmin ? ' 편성' : ''}</button>
          {!isAdmin && (
            <button className={tab === 'swap' ? 'active' : ''} onClick={() => setTab('swap')}>
              맞교환{incomingCount > 0 && <span className="seg-badge">{incomingCount}</span>}
            </button>
          )}
          <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>근무표</button>
          <button className={tab === 'count' ? 'active' : ''} onClick={() => setTab('count')}>집계</button>
          {isAdmin && (
            <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>이력</button>
          )}
        </div>

        {tab === 'list' && isAdmin && (
          <>
            <div className="sub-toolbar">
              <button className="primary-btn" style={{ marginTop: 0 }} onClick={() => setAdminForm({ create: true })}>
                ＋ 대근 편성 추가
              </button>
            </div>
            <p className="sub-hint">관리자는 모든 대근 편성을 추가·수정·삭제할 수 있습니다.</p>

            <ShiftCalendar
              refDate={calRef}
              selected={calSel}
              today={today}
              substitutions={substitutions}
              extraWorks={extraWorks}
              onSelectDate={setCalSel}
              onPrevMonth={calPrev}
              onNextMonth={calNext}
            />
            <DayDetail
              date={calSel}
              substitutions={substitutions}
              extraWorks={extraWorks}
              onEditSub={(sub) => setAdminForm({ edit: sub })}
              onEditExtra={(ex) => setAdminExtraForm({ edit: ex })}
            />

            <p className="sub-hint" style={{ marginTop: 16 }}>다가오는 편성 목록 (오늘 이후)</p>
            {upcomingSorted.length === 0 ? (
              <p className="sub-empty">예정된 대근 편성이 없습니다.</p>
            ) : (
              upcomingSorted.map((s) => (
                <AdminSubCard
                  key={s.id}
                  sub={s}
                  onEdit={(sub) => setAdminForm({ edit: sub })}
                  onDelete={deleteAdminSub}
                />
              ))
            )}
          </>
        )}

        {tab === 'list' && !isAdmin && (
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
                  substitutions={substitutions}
                  onClaim={(id) => onClaimSub(id, me)}
                  onUnclaim={onUnclaimSub}
                  onCancel={onCancelSub}
                />
              ))
            )}
          </>
        )}

        {tab === 'extra' && isAdmin && (
          <>
            <div className="sub-toolbar">
              <button className="primary-btn" style={{ marginTop: 0 }} onClick={() => setAdminExtraForm({ create: true })}>
                ＋ 추가 근무 편성 추가
              </button>
            </div>
            <p className="sub-hint">관리자는 모든 추가 근무 편성을 추가·수정·삭제할 수 있습니다.</p>
            {sortedExtra.length === 0 ? (
              <p className="sub-empty">추가 근무 편성 내역이 없습니다.</p>
            ) : (
              sortedExtra.map((e) => (
                <AdminExtraCard
                  key={e.id}
                  extra={e}
                  onEdit={(ex) => setAdminExtraForm({ edit: ex })}
                  onDelete={deleteAdminExtra}
                />
              ))
            )}
          </>
        )}

        {tab === 'extra' && !isAdmin && (
          <>
            <div className="sub-toolbar">
              <button className="primary-btn" style={{ marginTop: 0 }} onClick={() => setShowExtra(true)}>
                ＋ 추가 근무 신청
              </button>
              <label className="sub-check">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                내 관련만
              </label>
            </div>
            {visibleExtra.length === 0 ? (
              <p className="sub-empty">추가 근무 신청 내역이 없습니다.</p>
            ) : (
              visibleExtra.map((e) => (
                <ExtraCard key={e.id} extra={e} me={me} onCancel={onCancelExtra} />
              ))
            )}
          </>
        )}

        {tab === 'swap' && !isAdmin && (
          <>
            <div className="sub-toolbar">
              <button className="primary-btn" style={{ marginTop: 0 }} onClick={() => setShowSwap(true)}>
                ＋ 맞교환 신청
              </button>
            </div>
            <p className="sub-hint">내 근무를 동료의 근무와 1:1로 맞바꿉니다. 상대가 수락하면 양쪽이 서로의 대근으로 자동 반영됩니다.</p>
            {visibleSwaps.length === 0 ? (
              <p className="sub-empty">맞교환 내역이 없습니다.</p>
            ) : (
              visibleSwaps.map((w) => (
                <SwapCard
                  key={w.id}
                  swap={w}
                  me={me}
                  isAdmin={isAdmin}
                  onAccept={onAcceptSwap}
                  onReject={onRejectSwap}
                  onCancel={onCancelSwap}
                />
              ))
            )}
          </>
        )}

        {tab === 'log' && isAdmin && (
          <>
            <p className="sub-hint">대근·맞교환 편성의 모든 변경 이력입니다. (최신순, 최대 500건)</p>
            <LogList logs={subLogs} />
          </>
        )}

        {tab === 'board' && (
          <>
            <div className="sub-toolbar">
              <button className="add-btn secondary" onClick={() => setBoardRef(addDays(boardPeriod.start, -1))}>◀ 이전</button>
              <button className="add-btn secondary" onClick={() => setBoardRef(today)}>금월</button>
              <button className="add-btn secondary" onClick={() => setBoardRef(addDays(boardPeriod.end, 1))}>다음 ▶</button>
            </div>
            <p className="sub-period">{boardPeriod.start} ~ {boardPeriod.end}</p>
            <ShiftBoard
              start={boardPeriod.start}
              end={boardPeriod.end}
              today={today}
              myGroup={myGroup}
              substitutions={substitutions}
              extraWorks={extraWorks}
              shiftGroups={shiftGroups}
              onPickOpen={setPickFor}
              isAdmin={isAdmin}
              onEditSub={(sub) => setAdminForm({ edit: sub })}
              onEditExtra={(ex) => setAdminExtraForm({ edit: ex })}
            />
          </>
        )}

        {tab === 'count' && (
          <>
            <div className="card">
              <h3>⏱ 부담시간 합산 <span className="count">{period.start} ~ {period.end}</span></h3>
              {burden.length === 0 ? (
                <p className="sub-empty">이 정산 기간 대근·추가근무가 없습니다.</p>
              ) : (
                <div className="burden-list">
                  {burden.map((r) => (
                    <div key={r.name} className={'burden-row' + (r.name === me ? ' me' : '')}>
                      <div className="burden-head">
                        <span className="burden-name">{r.name}</span>
                        <span className="burden-total">{r.total}h</span>
                      </div>
                      <div className="burden-bar">
                        {r.subHours > 0 && (
                          <span className="burden-seg sub" style={{ width: `${(r.subHours / burdenMax) * 100}%` }} title={`대근 ${r.subHours}h`} />
                        )}
                        {r.extraHours > 0 && (
                          <span className="burden-seg extra" style={{ width: `${(r.extraHours / burdenMax) * 100}%` }} title={`추가근무 ${r.extraHours}h`} />
                        )}
                      </div>
                      <div className="burden-meta">대근 {r.subCount}건({r.subHours}h) · 추가 {r.extraCount}건({r.extraHours}h)</div>
                    </div>
                  ))}
                  <p className="sub-legend" style={{ marginTop: 4 }}>
                    <i className="burden-key sub" /> 대근 · <i className="burden-key extra" /> 추가근무
                  </p>
                </div>
              )}
            </div>
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
            <div className="card">
              <h3>➕ 추가 근무 집계 <span className="count">{period.start} ~ {period.end}</span></h3>
              {extraCounts.length === 0 ? (
                <p className="sub-empty">이 정산 기간 추가 근무가 없습니다.</p>
              ) : (
                <ol className="sub-rank">
                  {extraCounts.map((c, i) => (
                    <li key={c.name} className={c.name === me ? 'sub-me-row' : ''}>
                      <span className="sub-rank-no">{i + 1}</span>
                      <span className="sub-rank-name">{c.name}</span>
                      <span className="sub-rank-cnt">{c.count}건</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </main>

      {showReq && (
        <RequestForm
          me={me}
          myGroup={myGroup}
          today={today}
          substitutions={substitutions}
          onCreate={onCreateSub}
          onClose={() => setShowReq(false)}
        />
      )}

      {showExtra && (
        <ExtraWorkForm
          me={me}
          myGroup={myGroup}
          today={today}
          onCreate={onCreateExtra}
          onClose={() => setShowExtra(false)}
        />
      )}

      {showSwap && (
        <SwapForm
          me={me}
          myGroup={myGroup}
          shiftGroups={shiftGroups}
          today={today}
          onCreate={onCreateSwap}
          onClose={() => setShowSwap(false)}
        />
      )}

      {pickFor && (
        <ClaimPicker
          sub={pickFor}
          shiftGroups={shiftGroups}
          substitutions={substitutions}
          extraWorks={extraWorks}
          onClaim={onClaimSub}
          onClose={() => setPickFor(null)}
        />
      )}

      {adminForm && (
        <AdminSubForm
          shiftGroups={shiftGroups}
          today={today}
          edit={adminForm.edit}
          onSubmit={submitAdminForm}
          onClose={() => setAdminForm(null)}
        />
      )}

      {adminExtraForm && (
        <AdminExtraForm
          shiftGroups={shiftGroups}
          today={today}
          edit={adminExtraForm.edit}
          onSubmit={submitAdminExtraForm}
          onClose={() => setAdminExtraForm(null)}
        />
      )}
    </>
  );
}
