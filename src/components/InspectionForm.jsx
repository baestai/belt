import { useMemo, useState } from 'react';
import {
  INSPECTION_ITEMS,
  DEFAULT_PULLEYS,
  emptyRecord,
  normalizeRecord,
  normalizeTemp,
  validateRecord,
} from '../lib/inspectionItems.js';
import MemoInput from './MemoInput.jsx';

// 벨트별 설치 구성(beltItems)에 맞춰 빈 기록을 만든다.
// 편집 가능한 subs 항목(전기장치 등)의 구분 목록을 beltItems로 덮어쓴다.
function buildEmpty(belt, date, inspector, beltItems) {
  const base = emptyRecord(belt.name, belt.group, date, inspector, beltItems.pulley || DEFAULT_PULLEYS);
  const items = { ...base.items };
  for (const def of INSPECTION_ITEMS) {
    if (def.type === 'subs' && def.editable && beltItems[def.key]) {
      const subs = {};
      for (const s of beltItems[def.key]) subs[s] = 'ok';
      items[def.key] = { ...items[def.key], subs };
    }
  }
  return { ...base, items };
}

const KO_STATUS = { ok: '양호', bad: '불량', warn: '주의' };

// 지난 점검 온도 대비 추세: 상승 'up' / 하강 'down' / 비교불가·동일 null
function tempTrend(cur, prev) {
  const c = parseFloat(cur);
  const p = parseFloat(prev);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null; // 첫 입력이거나 이전 값 없음
  if (c > p) return 'up';
  if (c < p) return 'down';
  return null; // 동일
}
// 온도 옆 추세 세모 (상승=빨강▲ / 하강=파랑▼)
function TempTrend({ cur, prev }) {
  const t = tempTrend(cur, prev);
  if (!t) return null;
  return (
    <span
      className={`temp-trend ${t}`}
      title={t === 'up' ? `지난점검(${prev}℃)보다 상승` : `지난점검(${prev}℃)보다 하강`}
    >
      {t === 'up' ? '▲' : '▼'}
    </span>
  );
}

// 지난 점검의 해당 항목 요약 문자열 (전월 대비 비교용). 비교할 게 없으면 null
function prevSummary(def, prevItem) {
  if (!prevItem) return null;
  if (def.type === 'yn' || def.type === 'num') {
    let s = KO_STATUS[prevItem.status] || '-';
    if (def.type === 'num' && def.fields && prevItem.values) {
      const parts = def.fields
        .map((f) => (prevItem.values[f.key] ? `${f.label} ${prevItem.values[f.key]}${f.unit}` : null))
        .filter(Boolean);
      if (parts.length) s += ` (${parts.join(', ')})`;
    }
    return s;
  }
  if (def.type === 'subs' || def.type === 'pulley') {
    const subs = prevItem.subs || {};
    const bad = Object.keys(subs).filter((k) => subs[k] !== 'ok');
    if (def.type === 'pulley' && prevItem.temps) {
      const temps = Object.keys(prevItem.temps)
        .map((k) => {
          const t = normalizeTemp(prevItem.temps[k]);
          const parts = [];
          if (t.L !== '' && t.L != null) parts.push(`L ${t.L}`);
          if (t.R !== '' && t.R != null) parts.push(`R ${t.R}`);
          return parts.length ? `${k} ${parts.join('/')}℃` : null;
        })
        .filter(Boolean);
      const base = bad.length ? `불량: ${bad.join(', ')}` : '전체 양호';
      return temps.length ? `${base} · ${temps.join(', ')}` : base;
    }
    return bad.length ? `불량: ${bad.join(', ')}` : '전체 양호';
  }
  return null;
}

export default function InspectionForm({ belt, date, inspectors, beltItems = {}, quickMemos = [], defaultInspector, initialRecord, records = [], onAddItem, onRemoveItem, onCancel, onSave }) {
  const [record, setRecord] = useState(() =>
    initialRecord
      ? normalizeRecord(initialRecord, beltItems.pulley)
      : buildEmpty(belt, date, defaultInspector || inspectors[0] || '', beltItems)
  );
  const [touched, setTouched] = useState(() => new Set());
  const [error, setError] = useState('');
  const [newRow, setNewRow] = useState({}); // 항목 key별 '새 구분명' 입력값
  const origDate = date; // 폼 열 때의 원래 점검일 (저장 시 날짜 변경 정리용)

  // 지난 점검(전월) = 이 점검일보다 앞선 날짜 중 가장 최근 기록.
  // 점검일을 바꾸면 비교 대상도 즉시 갱신되고, 늦게 입력해도 날짜 순서로 비교한다.
  const prevRecord = useMemo(() => {
    const cur = record.date;
    return (records || [])
      .filter((r) => r.belt === belt.name && String(r.date) < String(cur))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0] || null;
  }, [records, belt.name, record.date]);

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
  const setTemp = (key, sub, side, val) =>
    setItem(key, (it) => {
      const cur = it.temps[sub] && typeof it.temps[sub] === 'object' ? it.temps[sub] : { L: '', R: '' };
      it.temps = { ...it.temps, [sub]: { ...cur, [side]: val } };
    });
  const setValue = (key, field, val) =>
    setItem(key, (it) => (it.values = { ...it.values, [field]: val }));

  // 벨트마다 설치 상태가 달라 점검 폼에서 행을 추가/삭제한다.
  // 설치구성(Pulley/전기장치) 추가·삭제는 비밀번호 없이 누구나 가능하며,
  // 앱 상태(벨트별 구성)에 '즉시 영속'하고 현재 폼에도 반영한다.
  // (Pulley: subs+temps / 전기장치: subs)
  const addRow = (key) => {
    const n = String(newRow[key] || '').trim();
    if (!n) return;
    if (record.items[key].subs && n in record.items[key].subs) {
      window.alert('이미 등록된 구분입니다.');
      return;
    }
    try {
      onAddItem(belt.name, key, n); // 즉시 영속
    } catch (e) {
      window.alert(e.message);
      return;
    }
    setNewRow((m) => ({ ...m, [key]: '' }));
    setItem(key, (it) => {
      it.subs = { ...it.subs, [n]: 'ok' };
      if (it.temps) it.temps = { ...it.temps, [n]: { L: '', R: '' } };
    });
  };
  const removeRow = (key, name) => {
    if (!window.confirm(`"${name}" 구분을 삭제할까요?`)) return;
    try {
      onRemoveItem(belt.name, key, name); // 즉시 영속
    } catch (e) {
      window.alert(e.message);
      return;
    }
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
    onSave(record, origDate);
  };

  return (
    <>
      <header>
        <button className="hdr-back" onClick={onCancel} aria-label="점검 목록으로 돌아가기">← 목록</button>
        <span className="logo">🦺</span>
        <h1>3선탄 통합관리</h1>
        <span className="mode-badge mode-field">점검모드</span>
      </header>
      <div className="body">
        <button className="exit-list-btn" onClick={onCancel}>← 점검 목록으로 돌아가기</button>
        <div className="field-belt">
          <span className="dot none" />
          <div>
            <div className="name">{belt.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{belt.group}</div>
          </div>
          <button className="change" onClick={onCancel}>다른 벨트</button>
        </div>

        <div className="num-row">
          <label>점검일</label>
          <input
            type="date"
            value={record.date}
            onChange={(e) => setRecord((r) => ({ ...r, date: e.target.value }))}
            aria-label="점검일"
          />
        </div>
        <p className="prev-cmp" style={{ marginTop: -4, marginBottom: 10 }}>
          🕒 지난 점검 비교 기준: {prevRecord ? `${prevRecord.date} (이 점검일 직전 기록)` : '없음 (이 점검일 이전 기록 없음 — 변화 표시 없음)'}
        </p>
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
          const prevText = prevRecord ? prevSummary(def, prevRecord.items?.[def.key]) : null;
          return (
            <div className="insp-item" key={def.key}>
              <div className="title">{def.no}. {def.title}</div>
              {prevText && (
                <div className="prev-cmp">🕒 지난점검({prevRecord.date}): {prevText}</div>
              )}

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
                    <thead><tr><th>구분</th><th>베어링</th><th>온도 L(℃)</th><th>온도 R(℃)</th><th></th></tr></thead>
                    <tbody>
                      {Object.keys(it.subs).map((s) => {
                        const t = it.temps[s] && typeof it.temps[s] === 'object' ? it.temps[s] : { L: '', R: '' };
                        const prevT = normalizeTemp(prevRecord?.items?.[def.key]?.temps?.[s]);
                        return (
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
                            <span className="temp-cell">
                              <input
                                className="temp-in"
                                inputMode="decimal"
                                aria-label={`${s} 온도 L`}
                                value={t.L}
                                onChange={(e) => setTemp(def.key, s, 'L', e.target.value)}
                              />
                              <TempTrend cur={t.L} prev={prevT.L} />
                            </span>
                          </td>
                          <td>
                            <span className="temp-cell">
                              <input
                                className="temp-in"
                                inputMode="decimal"
                                aria-label={`${s} 온도 R`}
                                value={t.R}
                                onChange={(e) => setTemp(def.key, s, 'R', e.target.value)}
                              />
                              <TempTrend cur={t.R} prev={prevT.R} />
                            </span>
                          </td>
                          <td>
                            <button
                              className="x"
                              aria-label={`${s} 삭제`}
                              onClick={() => removeRow(def.key, s)}
                            >🗑</button>
                          </td>
                        </tr>
                        );
                      })}
                      {Object.keys(it.subs).length === 0 && (
                        <tr><td colSpan={5} className="note">설치된 Pulley가 없습니다. 아래에서 추가하세요.</td></tr>
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

              <MemoInput
                value={it.memo}
                placeholder="특이사항 메모..."
                quickMemos={quickMemos}
                onChange={(v) => setMemo(def.key, v)}
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
