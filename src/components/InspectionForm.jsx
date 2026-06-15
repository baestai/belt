import { useState } from 'react';
import {
  INSPECTION_ITEMS,
  DEFAULT_PULLEYS,
  emptyRecord,
  normalizeRecord,
  validateRecord,
} from '../lib/inspectionItems.js';

export default function InspectionForm({ belt, date, inspectors, pulleys = DEFAULT_PULLEYS, initialRecord, onCancel, onSave }) {
  const [record, setRecord] = useState(() =>
    initialRecord
      ? normalizeRecord(initialRecord, pulleys)
      : emptyRecord(belt.name, belt.group, date, inspectors[0] || '', pulleys)
  );
  const [touched, setTouched] = useState(() => new Set());
  const [error, setError] = useState('');

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
                <table className="pulley-tbl">
                  <thead><tr><th>구분</th><th>상태</th></tr></thead>
                  <tbody>
                    {def.subs.map((s) => (
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {def.type === 'pulley' && (
                <table className="pulley-tbl">
                  <thead><tr><th>구분</th><th>베어링</th><th>온도(℃)</th></tr></thead>
                  <tbody>
                    {pulleys.map((s) => (
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
                      </tr>
                    ))}
                  </tbody>
                </table>
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
