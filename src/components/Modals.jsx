import { useRef, useState } from 'react';
import { GROUP_ORDER } from '../lib/belts.js';
import { monthlyReport, recordsToTable, downloadCSV } from '../lib/report.js';
import { leaderboard, POINTS } from '../lib/points.js';

const MEDAL = ['🥇', '🥈', '🥉'];

export function LeaderboardModal({ records, onClose }) {
  const now = new Date();
  const thisYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [scope, setScope] = useState('all'); // 'all' | 'month'
  const top = leaderboard(records, { ym: scope === 'month' ? thisYm : undefined, limit: 10 });

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>🏆 점검 포인트 TOP 10</h3>
        <div className="lb-tabs">
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>전체 누적</button>
          <button className={scope === 'month' ? 'on' : ''} onClick={() => setScope('month')}>이번 달 ({thisYm.slice(5)}월)</button>
        </div>
        <div className="note" style={{ padding: '4px 0 10px' }}>
          점검 1건 +{POINTS.base}점 · 이상 발견 1건당 +{POINTS.perIssue}점
        </div>
        {top.length === 0 && <div className="note">아직 점검 기록이 없습니다.</div>}
        <div className="lb-list">
          {top.map((e, i) => (
            <div className={'lb-row' + (i < 3 ? ' top' : '')} key={e.inspector}>
              <span className="lb-rank">{MEDAL[i] || i + 1}</span>
              <span className="lb-name">{e.inspector}</span>
              <span className="lb-sub">{e.count}건 · 이상 {e.issues}</span>
              <span className="lb-pts">{e.points}점</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ma-cancel" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

export function AddBeltModal({ groups, defaultGroup, onAdd, onClose }) {
  const groupNames = Object.keys(groups).sort(
    (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)
  );
  const [group, setGroup] = useState(
    defaultGroup && groups[defaultGroup] ? defaultGroup : groupNames[0]
  );
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    try {
      onAdd(group, name, pw);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>➕ 신규 벨트 추가</h3>
        <label>구분 (구역)</label>
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label>벨트명</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: S-330" />
        <label>🔒 관리자 비밀번호</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호 입력" />
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button className="ma-cancel" onClick={onClose}>취소</button>
          <button className="ma-ok" onClick={submit}>추가</button>
        </div>
      </div>
    </div>
  );
}

export function InspectorModal({ inspectors, onAdd, onRemove, onClose }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    try {
      onAdd(name, pw);
      setName('');
      setPw('');
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = (n) => {
    try {
      onRemove(n, pw);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>👷 점검자 관리</h3>
        <div>
          {inspectors.length === 0 && <div className="note">등록된 점검자가 없습니다.</div>}
          {inspectors.map((n) => (
            <div className="insp-row" key={n}>
              <span className="nm">{n}</span>
              <button className="x" onClick={() => remove(n)} aria-label={`${n} 삭제`}>🗑</button>
            </div>
          ))}
        </div>
        <label>새 점검자 이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 정안전" />
        <label>🔒 관리자 비밀번호</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="추가/삭제 시 필요" />
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button className="ma-cancel" onClick={onClose}>닫기</button>
          <button className="ma-ok" onClick={add}>추가</button>
        </div>
      </div>
    </div>
  );
}

export function PulleyModal({ pulleys, onAdd, onRemove, onClose }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    try {
      onAdd(name, pw);
      setName('');
      setPw('');
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = (n) => {
    try {
      onRemove(n, pw);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>🛞 Pulley 구분 관리</h3>
        <div>
          {pulleys.length === 0 && <div className="note">등록된 Pulley 구분이 없습니다.</div>}
          {pulleys.map((n) => (
            <div className="insp-row" key={n}>
              <span className="nm">{n}</span>
              <button className="x" onClick={() => remove(n)} aria-label={`${n} 삭제`}>🗑</button>
            </div>
          ))}
        </div>
        <label>새 Pulley 구분명</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: Bend Pulley" />
        <label>🔒 관리자 비밀번호</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="추가/삭제 시 필요" />
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button className="ma-cancel" onClick={onClose}>닫기</button>
          <button className="ma-ok" onClick={add}>추가</button>
        </div>
      </div>
    </div>
  );
}

export function BackupModal({ state, onExport, onImport, onClose }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const fileRef = useRef(null);

  const beltCount = Object.values(state.groups || {}).reduce((a, b) => a + b.length, 0);

  const pickFile = () => {
    setError('');
    if (!pw) {
      setError('가져오기에는 관리자 비밀번호가 필요합니다.');
      return;
    }
    fileRef.current?.click();
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onImport(String(reader.result), pw);
        setInfo('복원이 완료되었습니다.');
        setError('');
      } catch (err) {
        setError(err.message);
        setInfo('');
      }
    };
    reader.onerror = () => setError('파일을 읽는 중 오류가 발생했습니다.');
    reader.readAsText(file);
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>💾 데이터 백업 / 복원</h3>
        <div className="card" style={{ marginTop: 4 }}>
          <div className="kv"><span className="k">벨트 수</span><span>{beltCount}대</span></div>
          <div className="kv"><span className="k">점검 기록</span><span>{(state.records || []).length}건</span></div>
          <div className="kv"><span className="k">점검자</span><span>{(state.inspectors || []).length}명</span></div>
        </div>

        <div className="note" style={{ marginTop: 10 }}>
          📤 내보내기: 현재 모든 데이터를 JSON 파일로 저장합니다.
        </div>
        <button className="ghost-btn" onClick={onExport}>JSON 파일로 내보내기</button>

        <div className="note" style={{ marginTop: 14 }}>
          📥 가져오기: 백업 파일로 현재 데이터를 <b>전부 덮어씁니다</b>. 관리자 비밀번호가 필요합니다.
        </div>
        <label>🔒 관리자 비밀번호</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="가져오기 시 필요" />
        <button className="ghost-btn" onClick={pickFile}>JSON 파일 선택 후 복원</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onFile}
        />

        {error && <div className="err">{error}</div>}
        {info && <div className="note" style={{ color: 'var(--ok)' }}>{info}</div>}
        <div className="modal-actions">
          <button className="ma-cancel" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

export function ReportModal({ records, onClose }) {
  const now = new Date();
  const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [ym, setYm] = useState(defaultYm);
  const rep = monthlyReport(records, ym);

  const exportExcel = () => {
    const inMonth = records.filter((r) => String(r.date).slice(0, 7) === ym);
    downloadCSV(`점검보고서_${ym}.csv`, recordsToTable(inMonth));
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>📄 월간 점검 보고서</h3>
        <label>대상 월</label>
        <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} />
        <div className="card" style={{ marginTop: 14 }}>
          <div className="kv"><span className="k">점검 건수</span><span>{rep.total}건</span></div>
          <div className="kv"><span className="k">정상</span><span style={{ color: 'var(--ok)' }}>{rep.counts.ok}</span></div>
          <div className="kv"><span className="k">주의</span><span style={{ color: 'var(--warn)' }}>{rep.counts.warn}</span></div>
          <div className="kv"><span className="k">이상</span><span style={{ color: 'var(--bad)' }}>{rep.counts.bad}</span></div>
        </div>
        <div className="modal-actions">
          <button className="ma-cancel" onClick={onClose}>닫기</button>
          <button className="ma-ok" onClick={exportExcel} disabled={rep.total === 0}>엑셀 다운로드</button>
        </div>
      </div>
    </div>
  );
}
