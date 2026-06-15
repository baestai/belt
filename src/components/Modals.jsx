import { useState } from 'react';
import { GROUP_ORDER } from '../lib/belts.js';
import { monthlyReport, recordsToTable, downloadCSV } from '../lib/report.js';

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
