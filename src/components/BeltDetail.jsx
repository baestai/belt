import { useState } from 'react';
import { INSPECTION_ITEMS } from '../lib/inspectionItems.js';
import { statusLabel, aggregateStatus } from '../lib/belts.js';
import { recordsForBelt, latestRecord, openIssues, dueInfo } from '../lib/selectors.js';

const SIGNAL = { ok: '🟢', warn: '🟡', bad: '🔴', none: '⚪' };
const STATUS_TEXT = {
  ok: '정상',
  warn: '주의 — 관찰 필요',
  bad: '이상 — 즉시 조치 필요',
  none: '미점검 — 점검 필요',
};
const CYCLES = [
  { v: 'monthly', t: '매월 (월 1회)' },
  { v: 'bimonthly', t: '2개월마다' },
  { v: 'quarterly', t: '분기마다' },
  { v: 'none', t: '반복 없음' },
];

export default function BeltDetail({ belt, records, schedule, today, onBack, onInspect, onDeleteBelt, onSaveSchedule, onCopyConfig, onPrint, onViewResult, onEditRecord, groupCount = 0 }) {
  const history = recordsForBelt(records, belt.name);
  const latest = latestRecord(records, belt.name);
  const st = latest ? aggregateStatus(latest) : 'none';
  const issues = openIssues(latest, INSPECTION_ITEMS);
  const due = dueInfo(schedule, today);

  const [date, setDate] = useState(schedule?.nextDate || today);
  const [cycle, setCycle] = useState(schedule?.cycle || 'monthly');

  const copyConfig = () => {
    const others = Math.max(0, groupCount - 1);
    if (others === 0) {
      window.alert('같은 구분에 복사할 다른 벨트가 없습니다.');
      return;
    }
    if (!window.confirm(
      `"${belt.name}"의 Pulley·전기장치 설치 구성을\n같은 구분(${belt.group})의 다른 ${others}대에 복사합니다.\n각 벨트의 기존 구성은 덮어쓰여집니다. 진행할까요?`
    )) return;
    const pw = window.prompt('관리자 비밀번호를 입력하세요:');
    if (pw === null) return;
    try {
      const res = onCopyConfig(belt.name, pw);
      window.alert(`${res.group} 구분의 ${res.count}대에 구성을 복사했습니다.`);
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <>
      <header>
        <span className="logo">🏭</span>
        <h1>벨트 상세</h1>
        <span className="mode-badge mode-admin">관리모드</span>
      </header>
      <div className="body">
        <button className="back" onClick={onBack}>← 목록으로</button>
        <div className="detail-head">
          <div className={'signal ' + st}>{SIGNAL[st]}</div>
          <div>
            <h2>{belt.name}</h2>
            <div className="meta">{belt.group}</div>
            <div className={'status-text ' + st}>{STATUS_TEXT[st]}</div>
          </div>
        </div>

        <div className="card">
          <div className="kv"><span className="k">최근 점검일</span><span>{latest ? latest.date : '-'}</span></div>
          <div className="kv"><span className="k">점검 담당자</span><span>{latest ? latest.inspector : '-'}</span></div>
          <div className="kv">
            <span className="k">다음 예정일</span>
            <span style={due.kind === 'over' ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>
              {schedule?.nextDate ? `${schedule.nextDate}${due.kind === 'over' ? ' (지연)' : ''}` : '미편성'}
            </span>
          </div>
        </div>

        <div className="card">
          <h3>📅 점검일 편성</h3>
          <div className="num-row">
            <label>점검 예정일</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="num-row">
            <label>반복 주기</label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {CYCLES.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
            </select>
          </div>
          <button className="ghost-btn" onClick={() => onSaveSchedule(belt.name, { nextDate: date, cycle })}>
            편성 저장
          </button>
        </div>

        <div className="card">
          <h3>🛞 설치 구성 복사</h3>
          <div className="note" style={{ marginBottom: 8 }}>
            이 벨트의 Pulley·전기장치 구성을 같은 구분({belt.group})의 다른 벨트들에 일괄 복사합니다.
          </div>
          <button className="ghost-btn" onClick={copyConfig}>
            같은 구분의 다른 벨트에 구성 복사
          </button>
        </div>

        <div className="card">
          <h3>⚠️ 미해결 이상 <span className="count">{issues.length}건</span></h3>
          {issues.length === 0 && <div className="note">미해결 이상이 없습니다.</div>}
          {issues.map((is, i) => (
            <div className="issue" key={i}>
              <span className={'ibadge ' + is.status}>{statusLabel(is.status)}</span>
              <div className="itext">
                {is.title}{is.detail ? ` — ${is.detail}` : ''}
                {latest && <div className="idate">{latest.date} · {latest.inspector}</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>🕒 점검 이력</h3>
          {history.length === 0 && <div className="note">점검 이력이 없습니다.</div>}
          <div className="tl">
            {history.map((r, i) => {
              const s = aggregateStatus(r);
              const cnt = openIssues(r, INSPECTION_ITEMS).length;
              return (
                <div className={'tl-item ' + s} key={i}>
                  <div className="tl-date">{r.date} · {r.inspector}</div>
                  <div className="tl-text">{s === 'ok' ? '전체 정상' : `이상/주의 ${cnt}건`}</div>
                  {onViewResult && (
                    <button className="tl-print" onClick={() => onViewResult(r)} aria-label={`${r.date} 결과보기`}>📄 결과보기</button>
                  )}
                  {onEditRecord && (
                    <button className="tl-print" onClick={() => onEditRecord(r)} aria-label={`${r.date} 수정`}>✏ 수정</button>
                  )}
                  {onPrint && (
                    <button className="tl-print" onClick={() => onPrint(r)} aria-label={`${r.date} 점검표 인쇄`}>🖨 점검표</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {latest && onPrint && (
          <button className="ghost-btn" onClick={() => onPrint(latest)}>🖨 최근 점검표 인쇄 / PDF 저장</button>
        )}
        <button className="primary-btn" onClick={() => onInspect(belt, today)}>📋 이 벨트 점검하기</button>
        <button className="del-btn" onClick={() => onDeleteBelt(belt.name)}>🗑 이 벨트 삭제 (철거)</button>
      </div>
    </>
  );
}
