import { useState } from 'react';
import {
  INSPECTION_ITEMS,
  DEFAULT_PULLEYS,
  emptyRecord,
  normalizeRecord,
  validateRecord,
} from '../lib/inspectionItems.js';
import { checkPassword } from '../lib/auth.js';

// 새 점검 기록에 직전 점검의 '편집 가능한' 구분 구성을 이어받는다(상태/온도는 초기화).
function seedFromPrev(base, prev) {
  if (!prev?.items) return base;
  const items = { ...base.items };
  for (const def of INSPECTION_ITEMS) {
    const p = prev.items[def.key];
    if (!p?.subs) continue;
    if (def.type === 'pulley') {
      const subs = {}, temps = {};
      for (const s of Object.keys(p.subs)) { subs[s] = 'ok'; temps[s] = ''; }
      items[def.key] = { ...items[def.key], subs, temps };
    } else if (def.type === 'subs' && def.editable) {
      const subs = {};
      for (const s of Object.keys(p.subs)) subs[s] = 'ok';
      items[def.key] = { ...items[def.key], subs };
    }
  }
  return { ...base, items };
}

export default function InspectionForm({ belt, date, inspectors, pulleys = DEFAULT_PULLEYS, adminPw, initialRecord, prevRecord, onCancel, onSave }) {
  const [record, setRecord] = useState(() =>
    initialRecord
      ? normalizeRecord(initialRecord, pulleys)
      : seedFromPrev(emptyRecord(belt.name, belt.group, date, inspectors[0] || '', pulleys), prevRecord)
  );
  const [touched, setTouched] = useState(() => new Set());
  const [error, setError] = useState('');
  const [newRow, setNewRow] = useState({}); // 항목 key별 '새 구분명' 입력값

  const markTouched = (key) =>
    setTouched((prev) => {
      const n = new Set(prev);
      n.add(key);
      return n;
    });

  const setItem = (key, updater) => {
    markTouched(key);
    setRecord((r) => {
      const item = { ...r.items[key] };
      updater(item);
      return { ...r, items: { ...r.items, [key]: item } };
    });
  };

  const setStatus = (key, status) => setItem(key, (it) => (it.status = status));
  const setMemo = (key, memo) => setItem(key, (it) => (it.memo = memo));
  const setSub = (key, sub, status) =>
    setItem(key, (it) => (it.subs = { ...it.subs, [sub]: status }));
  const setTemp = (key, sub, val) =>
    setItem(key, (it) => (it.temps = { ...it.temps, [sub]: val }));
  const setValue = (key, field, val) =>
    setItem(key, (it) => (it.values = { ...it.values, [field]: val }));

  // 구분 추가/삭제는 관리자 비밀번호 확인 후 즉시 반영한다.
  const requireAdmin = () => {
    const pw = window.prompt('관리자 비밀번호를 입력하세요:');
    if (pw === null) return false;
    if (!checkPassword(pw, adminPw)) {
      window.alert('관리자 비밀번호가 올바르지 않습니다.');
      return false;
    }
    return true;
  };

  // 벨트마다 설치 상태가 달라 점검 폼에서 행을 추가/삭제한다.
  // (Pulley: subs+temps / 전기장치: subs)
  const addRow = (key) => {
    const n = String(newRow[key] || '').trim();
    if (!n) return;
    if (record.items[key].subs && n in record.items[key].subs) {
      window.alert('이미 등록된 구분입니다.');
      return;
    }
    if (!requireAdmin()) return;
    setNewRow((m) => ({ ...m, [key]: '' }));
    setItem(key, (it) => {
      it.subs = { ...it.subs, [n]: 'ok' };
      if (it.temps) it.temps = { ...it.temps, [n]: '' };
    });
  };
  const removeRow = (key, name) => {
    if (!window.confirm(`"${name}" 구분을 삭제할까요?`)) return;
    if (!requireAdmin()) return;
    setItem(key, (it) => {
      const subs = { ...it.subs };
      delete subs[name];
      it.subs = subs;
      if (it.temps) {
        const temps = { ...it.temps };
        delete temps[name];
        it.temps = temps;
      }
    });
  };

  const progress = Math.round((touched.size / INSPECTION_ITEMS.length) * 100);

  const handleSave = () => {
    const errs = validateRecord(record);
    if (errs.length) {
      setError(errs.join('\n'));
      return;
    }
    onSave(record);
  };

  return (
    <>
      <header>
        <span className="logo">🦺</span>
        <h1>현장 점검</h1>
        <span className="mode-badge mode-field">점검모드</span>
      </header>
      <div className="body">
        <div className="field-belt">
          <span className="dot none" />
          <div>
            <div className="name">{belt.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {belt.group} · 점검일 {record.date}
            </div>
          </div>
          <button className="change" onClick={onCancel}>변경</button>
        </div>

        <div className="num-row">
          <label>점검자</label>
          <select
            value={record.inspector}
            onChange={(e) => setRecord((r) => ({ ...r, inspector: e.target.value }))}
          >
            {inspectors.length === 0 && <option value="">(점검자 없음)</option>}
            {inspectors.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="progress"><div style={{ width: progress + '%' }} /></div>

        {INSPECTION_ITEMS.map((def) => {
          const it = record.items[def.key];
          return (
            <div className="insp-item" key={def.key}>
              <div className="title">{def.no}. {def.title}</div>

              {def.type === 'yn' && (
                <div className="ynbtns">
                  <button
                    className={it.status === 'ok' ? 'sel-ok' : ''}
                    onClick={() => setStatus(def.key, 'ok')}
                  >양호</button>
                  <button
                    className={it.status === 'bad' ? 'sel-bad' : ''}
                    onClick={() => setStatus(def.key, 'bad')}
                  >불량</button>
                </div>
              )}

              {def.type === 'subs' && (
                <>
                  <table className="pulley-tbl">
                    <thead><tr><th>구분</th><th>상태</th>{def.editable && <th></th>}</tr></thead>
                    <tbody>
                      {(def.editable ? Object.keys(it.subs) : def.subs).map((s) => (
                        <tr key={s}>
                          <td className="nm">{s}</td>
                          <td>
                            <span className="mini-yn">
                              <button
                                className={it.subs[s] === 'ok' ? 'on-ok' : ''}
                                onClick={() => setSub(def.key, s, 'ok')}
                              >양호</button>
                              <button
                                className={it.subs[s] === 'bad' ? 'on-bad' : ''}
                                onClick={() => setSub(def.key, s, 'bad')}
                              >불량</button>
                            </span>
                          </td>
                          {def.editable && (
                            <td>
                              <button
                                className="x"
                                aria-label={`${s} 삭제`}
                                onClick={() => removeRow(def.key, s)}
                              >🗑</button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {def.editable && Object.keys(it.subs).length === 0 && (
                        <tr><td colSpan={3} className="note">설치된 항목이 없습니다. 아래에서 추가하세요.</td></tr>
                      )}
                    </tbody>
                  </table>
                  {def.editable && (
                    <div className="num-row" style={{ marginTop: 8 }}>
                      <input
                        value={newRow[def.key] || ''}
                        onChange={(e) => setNewRow((m) => ({ ...m, [def.key]: e.target.value }))}
                        placeholder="구분 추가 (예: Belt S/W)"
                        onKeyDown={(e) => { if (e.key === 'Enter') addRow(def.key); }}
                      />
                      <button className="change" onClick={() => addRow(def.key)}>➕ 추가</button>
                    </div>
                  )}
                </>
              )}

              {def.type === 'pulley' && (
                <>
                  <table className="pulley-tbl">
                    <thead><tr><th>구분</th><th>베어링</th><th>온도(℃)</th><th></th></tr></thead>
                    <tbody>
                      {Object.keys(it.subs).map((s) => (
                        <tr key={s}>
                          <td className="nm">{s}</td>
                          <td>
                            <span className="mini-yn">
                              <button
                                className={it.subs[s] === 'ok' ? 'on-ok' : ''}
                                onClick={() => setSub(def.key, s, 'ok')}
                              >양호</button>
                              <button
                                className={it.subs[s] === 'bad' ? 'on-bad' : ''}
                                onClick={() => setSub(def.key, s, 'bad')}
                              >불량</button>
                            </span>
                          </td>
                          <td>
                            <input
                              className="temp-in"
                              inputMode="decimal"
                              value={it.temps[s]}
                              onChange={(e) => setTemp(def.key, s, e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              className="x"
                              aria-label={`${s} 삭제`}
                              onClick={() => removeRow(def.key, s)}
                            >🗑</button>
                          </td>
                        </tr>
                      ))}
                      {Object.keys(it.subs).length === 0 && (
                        <tr><td colSpan={4} className="note">설치된 Pulley가 없습니다. 아래에서 추가하세요.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="num-row" style={{ marginTop: 8 }}>
                    <input
                      value={newRow[def.key] || ''}
                      onChange={(e) => setNewRow((m) => ({ ...m, [def.key]: e.target.value }))}
                      placeholder="Pulley 구분 추가 (예: Bend)"
                      onKeyDown={(e) => { if (e.key === 'Enter') addRow(def.key); }}
                    />
                    <button className="change" onClick={() => addRow(def.key)}>➕ 추가</button>
                  </div>
                </>
              )}

              {def.type === 'num' && (
                <>
                  <div className="ynbtns">
                    <button
                      className={it.status === 'ok' ? 'sel-ok' : ''}
                      onClick={() => setStatus(def.key, 'ok')}
                    >양호</button>
                    <button
                      className={it.status === 'bad' ? 'sel-bad' : ''}
                      onClick={() => setStatus(def.key, 'bad')}
                    >불량</button>
                  </div>
                  {def.fields.map((f) => (
                    <div className="num-row" key={f.key}>
                      <label>{f.label}</label>
                      <input
                        inputMode="decimal"
                        value={it.values[f.key]}
                        onChange={(e) => setValue(def.key, f.key, e.target.value)}
                      />
                      <span className="unit">{f.unit}</span>
                    </div>
                  ))}
                </>
              )}

              <textarea
                className="memo"
                style={{ marginTop: 10 }}
                placeholder="특이사항 메모..."
                value={it.memo}
                onChange={(e) => setMemo(def.key, e.target.value)}
              />
            </div>
          );
        })}

        {error && <div className="err">{error}</div>}
        <button className="primary-btn" onClick={handleSave}>✅ 점검 완료 저장</button>
        <button className="ghost-btn" onClick={onCancel}>취소</button>
        <div className="note">저장 시 기록이 보관되며 관리모드 상태에 반영됩니다.</div>
      </div>
    </>
  );
}
