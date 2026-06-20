import { useMemo, useState } from 'react';
import {
  COLLECTOR_ITEMS,
  emptyCollectorRecord,
  normalizeCollectorRecord,
  validateCollectorRecord,
} from '../lib/collectors.js';
import MemoInput from './MemoInput.jsx';

// 집진기의 항목 정의 (exterior 구분만 장비별로 덮어쓰기 가능)
function itemDefsFor(collector) {
  return COLLECTOR_ITEMS.map((def) =>
    def.key === 'exterior' && Array.isArray(collector.exterior) && collector.exterior.length
      ? { ...def, subs: collector.exterior }
      : def
  );
}

// 지난 점검 대비 추세: 상승 'up' / 하강 'down' / 비교불가·동일 null
function trend(cur, prev) {
  const c = parseFloat(cur);
  const p = parseFloat(prev);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
  if (c > p) return 'up';
  if (c < p) return 'down';
  return null;
}
function Trend({ cur, prev }) {
  const t = trend(cur, prev);
  if (!t) return null;
  return (
    <span className={`temp-trend ${t}`} title={t === 'up' ? `지난점검(${prev})보다 상승` : `지난점검(${prev})보다 하강`}>
      {t === 'up' ? '▲' : '▼'}
    </span>
  );
}

export default function CollectorForm({ collector, date, inspectors, quickMemos = [], defaultInspector, initialRecord, records = [], onSetExterior, onCancel, onSave, onPrint, onViewResult }) {
  const defs = itemDefsFor(collector);
  const [record, setRecord] = useState(() =>
    initialRecord
      ? normalizeCollectorRecord(initialRecord, defs)
      : emptyCollectorRecord(collector.name, date, defaultInspector || inspectors[0] || '', defs)
  );
  const [touched, setTouched] = useState(() => new Set());
  const [error, setError] = useState('');
  const [newRow, setNewRow] = useState('');
  const origDate = date;

  const prevRecord = useMemo(() => {
    const cur = record.date;
    return (records || [])
      .filter((r) => r.collector === collector.name && String(r.date) < String(cur))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0] || null;
  }, [records, collector.name, record.date]);

  const markTouched = (key) => setTouched((p) => new Set(p).add(key));
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
  const setSub = (key, sub, status) => setItem(key, (it) => (it.subs = { ...it.subs, [sub]: status }));
  const setValue = (key, field, val) => setItem(key, (it) => (it.values = { ...it.values, [field]: val }));

  const addRow = () => {
    const n = String(newRow || '').trim();
    if (!n) return;
    if (record.items.exterior.subs && n in record.items.exterior.subs) {
      window.alert('이미 등록된 구분입니다.');
      return;
    }
    const nextSubs = [...Object.keys(record.items.exterior.subs), n];
    onSetExterior && onSetExterior(collector.name, nextSubs);
    setNewRow('');
    setItem('exterior', (it) => (it.subs = { ...it.subs, [n]: 'ok' }));
  };
  const removeRow = (name) => {
    if (!window.confirm(`"${name}" 구분을 삭제할까요?`)) return;
    const nextSubs = Object.keys(record.items.exterior.subs).filter((s) => s !== name);
    onSetExterior && onSetExterior(collector.name, nextSubs);
    setItem('exterior', (it) => {
      const subs = { ...it.subs };
      delete subs[name];
      it.subs = subs;
    });
  };

  const progress = Math.round((touched.size / defs.length) * 100);

  const handleSave = () => {
    const errs = validateCollectorRecord(record, defs);
    if (errs.length) {
      setError(errs.join('\n'));
      return;
    }
    onSave(record, origDate);
  };

  const prevItem = (key) => prevRecord?.items?.[key];

  return (
    <>
      <header>
        <button className="hdr-back" onClick={onCancel} aria-label="점검 목록으로 돌아가기">← 목록</button>
        <span className="logo">🌀</span>
        <h1>집진기 점검</h1>
        <span className="mode-badge mode-field" style={{ marginLeft: 'auto' }}>점검모드</span>
      </header>
      <div className="body">
        <button className="exit-list-btn" onClick={onCancel}>← 점검 목록으로 돌아가기</button>
        {initialRecord && (onViewResult || onPrint) && (
          <div className="addbar">
            {onViewResult && <button className="add-btn secondary" onClick={() => onViewResult(initialRecord)}>📄 결과보기</button>}
            {onPrint && <button className="add-btn secondary" onClick={() => onPrint(initialRecord)}>🖨 점검표 인쇄</button>}
          </div>
        )}
        <div className="field-belt">
          <span className="dot none" />
          <div>
            <div className="name">{collector.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>집진기</div>
          </div>
          <button className="change" onClick={onCancel}>다른 집진기</button>
        </div>

        <div className="num-row">
          <label>점검일</label>
          <input type="date" value={record.date} onChange={(e) => setRecord((r) => ({ ...r, date: e.target.value }))} aria-label="점검일" />
        </div>
        <p className="prev-cmp" style={{ marginTop: -4, marginBottom: 10 }}>
          🕒 지난 점검 비교 기준: {prevRecord ? `${prevRecord.date} (이 점검일 직전 기록)` : '없음 (이 점검일 이전 기록 없음 — 변화 표시 없음)'}
        </p>
        <div className="num-row">
          <label>점검자</label>
          <select value={record.inspector} onChange={(e) => setRecord((r) => ({ ...r, inspector: e.target.value }))}>
            {inspectors.length === 0 && <option value="">(점검자 없음)</option>}
            {inspectors.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="progress"><div style={{ width: progress + '%' }} /></div>

        {(() => {
          // group 속성이 같은 연속 항목들을 하나의 카드로 묶어 렌더링
          const rendered = [];
          let i = 0;
          while (i < defs.length) {
            const def = defs[i];
            if (def.group) {
              // 같은 group의 연속 항목 수집
              const groupDefs = [];
              while (i < defs.length && defs[i].group === def.group) groupDefs.push(defs[i++]);
              const groupNo = groupDefs[0].no;
              rendered.push(
                <div className="insp-item" key={def.group}>
                  <div className="title">{groupNo}–{groupDefs[groupDefs.length - 1].no}. {def.group}</div>
                  {groupDefs.map((gdef) => {
                    const it = record.items[gdef.key];
                    return (
                      <div key={gdef.key} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>{gdef.title}</div>
                        {gdef.type === 'subs' && (
                          <table className="pulley-tbl">
                            <thead><tr><th>구분</th><th>상태</th></tr></thead>
                            <tbody>
                              {gdef.subs.map((s) => (
                                <tr key={s}>
                                  <td className="nm">{s}</td>
                                  <td>
                                    <span className="mini-yn">
                                      <button className={it.subs[s] === 'ok' ? 'on-ok' : ''} onClick={() => setSub(gdef.key, s, 'ok')}>양호</button>
                                      <button className={it.subs[s] === 'bad' ? 'on-bad' : ''} onClick={() => setSub(gdef.key, s, 'bad')}>불량</button>
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {gdef.type === 'num' && (
                          <>
                            {!gdef.noStatus && (
                              <div className="ynbtns">
                                <button className={it.status === 'ok' ? 'sel-ok' : ''} onClick={() => setStatus(gdef.key, 'ok')}>양호</button>
                                <button className={it.status === 'bad' ? 'sel-bad' : ''} onClick={() => setStatus(gdef.key, 'bad')}>불량</button>
                              </div>
                            )}
                            {gdef.fields.map((f) => {
                              const pv = prevItem(gdef.key)?.values?.[f.key];
                              return (
                                <div className="num-row" key={f.key}>
                                  <label>{f.label}</label>
                                  <span className="temp-cell">
                                    <input inputMode="decimal" value={it.values[f.key]} onChange={(e) => setValue(gdef.key, f.key, e.target.value)} />
                                    <Trend cur={it.values[f.key]} prev={pv} />
                                  </span>
                                  <span className="unit">{f.unit}</span>
                                </div>
                              );
                            })}
                          </>
                        )}
                        <MemoInput value={it.memo} placeholder="특이사항 메모..." quickMemos={quickMemos} onChange={(v) => setMemo(gdef.key, v)} />
                      </div>
                    );
                  })}
                </div>
              );
            } else {
              const it = record.items[def.key];
              rendered.push(
                <div className="insp-item" key={def.key}>
                  <div className="title">{def.no}. {def.title}</div>

                  {def.type === 'yn' && (
                    <div className="ynbtns">
                      <button className={it.status === 'ok' ? 'sel-ok' : ''} onClick={() => setStatus(def.key, 'ok')}>양호</button>
                      <button className={it.status === 'bad' ? 'sel-bad' : ''} onClick={() => setStatus(def.key, 'bad')}>불량</button>
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
                                  <button className={it.subs[s] === 'ok' ? 'on-ok' : ''} onClick={() => setSub(def.key, s, 'ok')}>양호</button>
                                  <button className={it.subs[s] === 'bad' ? 'on-bad' : ''} onClick={() => setSub(def.key, s, 'bad')}>불량</button>
                                </span>
                              </td>
                              {def.editable && (
                                <td><button className="x" aria-label={`${s} 삭제`} onClick={() => removeRow(s)}>🗑</button></td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {def.editable && (
                        <div className="num-row" style={{ marginTop: 8 }}>
                          <input value={newRow} onChange={(e) => setNewRow(e.target.value)} placeholder="구분 추가 (예: 댐퍼2)" onKeyDown={(e) => { if (e.key === 'Enter') addRow(); }} />
                          <button className="change" onClick={addRow}>➕ 추가</button>
                        </div>
                      )}
                    </>
                  )}

                  {def.type === 'num' && (
                    <>
                      {!def.noStatus && (
                        <div className="ynbtns">
                          <button className={it.status === 'ok' ? 'sel-ok' : ''} onClick={() => setStatus(def.key, 'ok')}>양호</button>
                          <button className={it.status === 'bad' ? 'sel-bad' : ''} onClick={() => setStatus(def.key, 'bad')}>불량</button>
                        </div>
                      )}
                      {def.fields.map((f) => {
                        const pv = prevItem(def.key)?.values?.[f.key];
                        return (
                          <div className="num-row" key={f.key}>
                            <label>{f.label}</label>
                            <span className="temp-cell">
                              <input inputMode="decimal" value={it.values[f.key]} onChange={(e) => setValue(def.key, f.key, e.target.value)} />
                              <Trend cur={it.values[f.key]} prev={pv} />
                            </span>
                            <span className="unit">{f.unit}</span>
                          </div>
                        );
                      })}
                    </>
                  )}

                  <MemoInput value={it.memo} placeholder="특이사항 메모..." quickMemos={quickMemos} onChange={(v) => setMemo(def.key, v)} />
                </div>
              );
              i++;
            }
          }
          return rendered;
        })()}

        {error && <p className="err">{error}</p>}
        <button className="primary-btn" onClick={handleSave}>✅ 점검 완료 저장</button>
        <div style={{ height: 20 }} />
      </div>
    </>
  );
}
