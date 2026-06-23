import { useRef, useState } from 'react';
import { GROUP_ORDER, aggregateStatus, statusLabel } from '../lib/belts.js';
import { recordsToTable, downloadCSV, collectorRecordsToTable, ymKey } from '../lib/report.js';
import { leaderboardCombined, POINTS } from '../lib/points.js';
import { INSPECTION_ITEMS } from '../lib/inspectionItems.js';
import { COLLECTOR_ITEMS, aggregateCollectorStatus, normalizeDays } from '../lib/collectors.js';
import { itemText } from './PrintableRecord.jsx';

const MEDAL = ['🥇', '🥈', '🥉'];

// 점검 결과 읽기전용 보기 — 점검모드/관리모드 공통
export function ResultModal({ record, onClose, onPrint }) {
  if (!record) return null;
  const isCol = !!record.collector;
  const defs = isCol ? COLLECTOR_ITEMS : INSPECTION_ITEMS;
  const name = isCol ? record.collector : record.belt;
  const overall = statusLabel(isCol ? aggregateCollectorStatus(record) : aggregateStatus(record));
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>📄 점검 결과 — {name}</h3>
        <div className="note" style={{ padding: '0 0 8px' }}>
          {isCol ? '집진기' : record.group} · 점검일 {record.date} · 점검자 {record.inspector} · 종합 {overall}
        </div>
        <table className="result-tbl">
          <thead>
            <tr><th style={{ width: 32 }}>No</th><th>점검 항목</th><th>결과</th></tr>
          </thead>
          <tbody>
            {defs.map((def) => {
              const it = record.items?.[def.key];
              const txt = itemText(def, it);
              const bad = /불량/.test(txt);
              return (
                <tr key={def.key}>
                  <td>{def.no}</td>
                  <td>
                    {def.title}
                    {it?.memo ? <div className="result-memo">📝 {it.memo}</div> : null}
                  </td>
                  <td className={bad ? 'result-bad' : undefined}>{txt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="modal-actions">
          {onPrint && <button className="ma-cancel" onClick={() => onPrint(record)}>🖨 점검표 인쇄</button>}
          <button className="ma-ok" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

export function LeaderboardModal({ records, collectorRecords = [], onClose }) {
  const now = new Date();
  const thisYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [scope, setScope] = useState('all'); // 'all' | 'month'
  const top = leaderboardCombined(
    [
      { records, itemDefs: INSPECTION_ITEMS },
      { records: collectorRecords, itemDefs: COLLECTOR_ITEMS },
    ],
    { ym: scope === 'month' ? thisYm : undefined, limit: 10 }
  );

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

export function BackupModal({ state, onExport, onImport, snapshots = [], onRestoreSnapshot, onClose }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const fileRef = useRef(null);

  const restoreSnap = (id) => {
    setError('');
    if (!pw) { setError('스냅샷 복원에는 관리자 비밀번호가 필요합니다.'); return; }
    if (!window.confirm('이 스냅샷 시점으로 전체 데이터를 되돌립니다. 현재 데이터는 덮어쓰여집니다. 진행할까요?')) return;
    try {
      onRestoreSnapshot(id, pw);
      setInfo('스냅샷 복원이 완료되었습니다.');
    } catch (err) {
      setError(err.message);
      setInfo('');
    }
  };

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

        {snapshots && snapshots.length > 0 && (
          <>
            <div className="note" style={{ marginTop: 14 }}>
              🕒 자동 스냅샷: 12시간마다 이 기기에 자동 저장된 백업입니다 (최근 {snapshots.length}개). 비밀번호 입력 후 복원하세요.
            </div>
            <div className="snap-list">
              {snapshots.map((sn) => (
                <div key={sn.id} className="snap-row">
                  <div className="snap-meta">
                    <span className="snap-at">{fmtSnapAt(sn.at)}</span>
                    <span className="snap-sub">벨트 {sn.beltCount}대 · 기록 {sn.recordCount}건</span>
                  </div>
                  <button className="add-btn secondary" onClick={() => restoreSnap(sn.id)}>복원</button>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div className="err">{error}</div>}
        {info && <div className="note" style={{ color: 'var(--ok)' }}>{info}</div>}
        <div className="modal-actions">
          <button className="ma-cancel" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// 감사 로그/정비 이력 공통: ISO → 'M/D HH:mm'
function fmtAtShort(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '-';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtSnapAt(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '-';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 정비 이력 대장 (완료된 수리 기록)
export function RepairHistoryModal({ history = [], onClose }) {
  const [q, setQ] = useState('');
  const qq = q.trim().toLowerCase();
  const rows = (history || []).filter((h) => !qq || String(h.equip).toLowerCase().includes(qq));
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>🔧 정비 이력 대장 <span className="count">{history.length}건</span></h3>
        <input className="search" style={{ marginBottom: 10 }} placeholder="🔍 설비명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {rows.length === 0 ? (
          <p className="sub-empty">완료된 정비 이력이 없습니다.</p>
        ) : (
          <div className="rh-list">
            {rows.map((h) => (
              <div key={h.id} className="rh-row">
                <div className="rh-top">
                  <span className={'rh-kind ' + h.kind}>{h.kind === 'belt' ? '벨트' : '집진기'}</span>
                  <span className="rh-equip">{h.equip}{h.group ? ` [${h.group}]` : ''}</span>
                  <span className="rh-done">✓ {fmtAtShort(h.completedAt)}</span>
                </div>
                <div className="rh-item">{h.title}{h.sub ? ` › ${h.sub}` : ''}</div>
                <div className="rh-meta">
                  점검일 {h.date}{h.assignee ? ` · 담당 ${h.assignee}` : ''}{h.dueDate ? ` · 예정 ${h.dueDate}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="ma-ok" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// 변경 이력(감사 로그)
export function AuditLogModal({ logs = [], onClose }) {
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>📋 변경 이력 <span className="count">최근 {logs.length}건</span></h3>
        {logs.length === 0 ? (
          <p className="sub-empty">기록된 변경 이력이 없습니다.</p>
        ) : (
          <div className="log-list">
            {logs.map((l) => (
              <div key={l.id} className="log-row">
                <div className="log-meta">
                  <span className="log-action">{l.action}</span>
                  <span className="log-actor">{l.actor}</span>
                  <span className="log-at">{fmtAtShort(l.at)}</span>
                </div>
                {l.detail && <div className="log-detail">{l.detail}</div>}
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="ma-ok" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

export function DeviceInspectorModal({ inspectors, current, required, onSave, onClear, onClose }) {
  const [sel, setSel] = useState(current || inspectors[0] || '');

  return (
    <div className="modal" onClick={(e) => !required && e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>📱 이 기기 점검자 {required ? '선택' : '고정'}</h3>
        {required ? (
          <div className="note" style={{ padding: '0 0 8px', textAlign: 'left', color: 'var(--bad)', fontWeight: 700 }}>
            점검을 시작하기 전에 점검자를 먼저 선택해 주세요.
          </div>
        ) : (
          <div className="note" style={{ padding: '0 0 8px', textAlign: 'left' }}>
            이 기기에서 점검할 때 기본 점검자로 자동 선택됩니다. 직접 바꾸기 전까지 유지돼요.
            <br />이 설정은 <b>이 기기에만</b> 저장되며 다른 기기·PC와 공유되지 않습니다.
            여러 사람이 함께 쓰는 PC라면 고정하지 마세요.
          </div>
        )}
        {current && !required && (
          <div className="kv"><span className="k">현재 고정</span><span>👤 {current}</span></div>
        )}
        <label>점검자 선택</label>
        <select value={sel} onChange={(e) => setSel(e.target.value)}>
          {inspectors.length === 0 && <option value="">(등록된 점검자 없음)</option>}
          {inspectors.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="modal-actions">
          {required
            ? <button className="ma-cancel" onClick={onClose}>취소</button>
            : <>
                <button className="ma-cancel" onClick={onClose}>닫기</button>
                {current && <button className="ma-cancel" onClick={onClear}>고정 해제</button>}
              </>
          }
          <button className="ma-ok" onClick={() => onSave(sel)} disabled={!sel}>
            {required ? '선택 후 점검 시작' : '이 기기에 고정'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuickMemoModal({ memos, onAdd, onRemove, onClose }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    try {
      onAdd(name, pw);
      setName('');
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
        <h3>💬 빠른 메모 관리</h3>
        <div className="note" style={{ padding: '0 0 8px' }}>
          점검 메모란에 탭 한 번으로 입력되는 문구입니다.
        </div>
        <div>
          {memos.length === 0 && <div className="note">등록된 빠른 메모가 없습니다.</div>}
          {memos.map((n) => (
            <div className="insp-row" key={n}>
              <span className="nm">{n}</span>
              <button className="x" onClick={() => remove(n)} aria-label={`${n} 삭제`}>🗑</button>
            </div>
          ))}
        </div>
        <label>새 빠른 메모 문구</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 베어링 소음 발생"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
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

export function ShiftGroupModal({ shiftGroups, pinResets = [], onAdd, onRemove, onApproveReset, onClose }) {
  const groupNames = ['A', 'B', 'C', 'D'];
  const [group, setGroup] = useState('A');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    try {
      onAdd(group, name, pw);
      setName('');
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = (g, n) => {
    try {
      onRemove(g, n, pw);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const approve = (n) => {
    try {
      onApproveReset(n, pw);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>🔁 교대조 인원 편성</h3>
        <div className="note" style={{ padding: '0 0 8px' }}>
          A·B·C·D조 인원을 편집합니다. 대근 관리의 로그인·근무표·대근 가능자 판정에 사용됩니다.
        </div>

        <label>🔒 관리자 비밀번호</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="추가·삭제·승인 시 필요" />
        {error && <div className="err">{error}</div>}

        {pinResets.length > 0 && (
          <div className="card" style={{ marginTop: 4, borderColor: 'var(--warn)' }}>
            <h3 style={{ marginBottom: 8 }}>🔑 PIN 초기화 신청 ({pinResets.length})</h3>
            <div className="note" style={{ padding: '0 0 6px' }}>
              승인하면 해당 인원의 PIN이 삭제되어 다음 로그인 시 새 PIN을 설정합니다. (관리자 비밀번호 필요)
            </div>
            {pinResets.map((n) => (
              <div className="insp-row" key={n}>
                <span className="nm">{n}</span>
                <button className="add-btn" onClick={() => approve(n)}>승인</button>
              </div>
            ))}
          </div>
        )}
        {groupNames.map((g) => (
          <div key={g} style={{ marginBottom: 10 }}>
            <div className="group-title" style={{ marginBottom: 4 }}>
              {g}조{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                ({(shiftGroups[g] || []).length}명)
              </span>
            </div>
            {(shiftGroups[g] || []).length === 0 && (
              <div className="note">편성된 인원이 없습니다.</div>
            )}
            {(shiftGroups[g] || []).map((n) => (
              <div className="insp-row" key={n}>
                <span className="nm">{n}</span>
                <button className="x" onClick={() => remove(g, n)} aria-label={`${n} 삭제`}>🗑</button>
              </div>
            ))}
          </div>
        ))}
        <label>인원 추가 — 대상 조</label>
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groupNames.map((g) => <option key={g} value={g}>{g}조</option>)}
        </select>
        <label>이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 홍길동"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <div className="modal-actions">
          <button className="ma-cancel" onClick={onClose}>닫기</button>
          <button className="ma-ok" onClick={add}>추가</button>
        </div>
      </div>
    </div>
  );
}

export function ReportModal({ records, collectorRecords = [], onClose }) {
  const now = new Date();
  const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [startYm, setStartYm] = useState(defaultYm);
  const [endYm, setEndYm] = useState(defaultYm);
  const [inspector, setInspector] = useState('전체');
  const [onlyBad, setOnlyBad] = useState(false);

  // 시작월 > 종료월이면 자동 보정
  const lo = startYm <= endYm ? startYm : endYm;
  const hi = startYm <= endYm ? endYm : startYm;

  // 점검자 후보 목록 (벨트·집진기 통합, 가나다순)
  const inspectorOptions = (() => {
    const set = new Set();
    for (const r of records) if (r.inspector) set.add(r.inspector);
    for (const r of collectorRecords) if (r.inspector) set.add(r.inspector);
    return ['전체', ...[...set].sort((a, b) => a.localeCompare(b))];
  })();

  const inRange = (r) => {
    const k = ymKey(r.date);
    if (k < lo || k > hi) return false;
    if (inspector !== '전체' && r.inspector !== inspector) return false;
    return true;
  };
  const beltFiltered = records.filter((r) => inRange(r) && (!onlyBad || aggregateStatus(r) !== 'ok'));
  const colFiltered = collectorRecords.filter((r) => inRange(r) && (!onlyBad || aggregateCollectorStatus(r) !== 'ok'));

  const countOf = (list, statusFn) => {
    let ok = 0, bad = 0;
    for (const r of list) (statusFn(r) === 'ok' ? ok++ : bad++);
    return { ok, bad };
  };
  const bc = countOf(beltFiltered, aggregateStatus);
  const cc = countOf(colFiltered, aggregateCollectorStatus);

  const rangeTag = lo === hi ? lo : `${lo}_${hi}`;
  const exportBelt = () => downloadCSV(`벨트점검보고서_${rangeTag}.csv`, recordsToTable(beltFiltered));
  const exportCollector = () => downloadCSV(`집진기점검보고서_${rangeTag}.csv`, collectorRecordsToTable(colFiltered));

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>📄 점검 보고서 · 데이터 조회</h3>

        <label>기간 (시작월 ~ 종료월)</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={startYm} onChange={(e) => setStartYm(e.target.value)} />
          <span style={{ color: 'var(--muted)' }}>~</span>
          <input type="month" value={endYm} onChange={(e) => setEndYm(e.target.value)} />
        </div>

        <label>점검자</label>
        <select value={inspector} onChange={(e) => setInspector(e.target.value)}>
          {inspectorOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        <label className="sub-check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />
          이상(불량) 기록만 보기
        </label>

        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 14 }}>🦺 벨트 <span className="count">{beltFiltered.length}건</span></h3>
          <div className="kv"><span className="k">정상</span><span style={{ color: 'var(--ok)' }}>{bc.ok}</span></div>
          <div className="kv"><span className="k">이상</span><span style={{ color: 'var(--bad)' }}>{bc.bad}</span></div>
          <button className="ghost-btn" style={{ marginTop: 10 }} onClick={exportBelt} disabled={beltFiltered.length === 0}>벨트 엑셀 다운로드</button>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14 }}>🌀 집진기 <span className="count">{colFiltered.length}건</span></h3>
          <div className="kv"><span className="k">정상</span><span style={{ color: 'var(--ok)' }}>{cc.ok}</span></div>
          <div className="kv"><span className="k">이상</span><span style={{ color: 'var(--bad)' }}>{cc.bad}</span></div>
          <button className="ghost-btn" style={{ marginTop: 10 }} onClick={exportCollector} disabled={colFiltered.length === 0}>집진기 엑셀 다운로드</button>
        </div>

        <div className="modal-actions">
          <button className="ma-ok" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// 관리모드: 집진기 목록/점검일 추가·수정·삭제
export function CollectorManageModal({ collectors = [], onAdd, onUpdate, onRemove, onClose }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // name being edited
  const [editDays, setEditDays] = useState('');

  const submitAdd = () => {
    setError('');
    try { onAdd(name, days, pw); setName(''); setDays(''); }
    catch (e) { setError(e.message); }
  };
  const saveEdit = (cName) => {
    setError('');
    try { onUpdate(cName, { days: editDays }, pw); setEditing(null); }
    catch (e) { setError(e.message); }
  };
  const del = (cName) => {
    setError('');
    if (!window.confirm(`"${cName}"를 삭제할까요?`)) return;
    try { onRemove(cName, pw); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>🌀 집진기 관리 <span className="count">{collectors.length}대</span></h3>
        <label>🔒 관리자 비밀번호 (추가·수정·삭제 공통)</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호 입력" />

        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 14 }}>➕ 새 집진기 추가</h3>
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: K-700 집진기" />
          <label>점검일 (1~31, 쉼표로 여러 날: 예 10,20,30)</label>
          <input value={days} onChange={(e) => setDays(e.target.value)} placeholder="예: 17" />
          <button className="ghost-btn" style={{ marginTop: 10 }} onClick={submitAdd}>추가</button>
        </div>

        {error && <div className="err">{error}</div>}

        <div className="insp-list" style={{ marginTop: 12 }}>
          {collectors.map((c) => (
            <div key={c.name} className="insp-row" style={{ flexWrap: 'wrap' }}>
              <span className="nm">{c.name}</span>
              {editing === c.name ? (
                <>
                  <input style={{ width: 110 }} value={editDays} onChange={(e) => setEditDays(e.target.value)} placeholder="점검일" />
                  <button className="add-btn" onClick={() => saveEdit(c.name)}>저장</button>
                  <button className="add-btn secondary" onClick={() => setEditing(null)}>취소</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>매월 {normalizeDays(c.days).join('·')}일</span>
                  <button className="add-btn secondary" onClick={() => { setEditing(c.name); setEditDays((c.days || []).join(',')); }}>✏</button>
                  <button className="x" onClick={() => del(c.name)}>🗑</button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="ma-ok" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
