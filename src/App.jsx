import { useEffect, useMemo, useRef, useState } from 'react';
import { loadState, saveState } from './data/store.js';
import { isCloudConfigured } from './data/supabaseClient.js';
import { fetchCloud, seedCloud, syncToCloud, subscribeCloud } from './data/cloudStore.js';
import { addBelt as addBeltFn, removeBelt as removeBeltFn } from './lib/belts.js';
import {
  checkPassword,
  addInspector as addInspectorFn,
  removeInspector as removeInspectorFn,
} from './lib/auth.js';
import { DEFAULT_PULLEYS, INSPECTION_ITEMS } from './lib/inspectionItems.js';
import { statusOf as statusOfFn, latestRecord, nextDateFrom } from './lib/selectors.js';
import Dashboard from './components/Dashboard.jsx';
import AdminList from './components/AdminList.jsx';
import BeltDetail from './components/BeltDetail.jsx';
import FieldCalendar from './components/FieldCalendar.jsx';
import InspectionForm from './components/InspectionForm.jsx';
import CollectorCalendar from './components/CollectorCalendar.jsx';
import CollectorForm from './components/CollectorForm.jsx';
import { defaultCollectors, updateCollector, addCollector, removeCollector, latestCollectorRecord, aggregateCollectorStatus } from './lib/collectors.js';
import PrintableRecord from './components/PrintableRecord.jsx';
import SubstitutionPage from './components/SubstitutionPage.jsx';
import {
  defaultShiftGroups,
  SHIFT_LABEL,
  setPin as setPinFn,
  createSubstitution,
  claimSubstitution,
  unclaimSubstitution,
  cancelSubstitution,
  adminCreateSubstitution,
  adminUpdateSubstitution,
  createExtraWork,
  cancelExtraWork,
  adminUpdateExtraWork,
  exceedsWeeklyLimit,
  appendSubLog,
  createSwapRequest,
  acceptSwap,
  rejectSwap,
  cancelSwap,
} from './lib/shift.js';
import { AddBeltModal, InspectorModal, ReportModal, BackupModal, LeaderboardModal, QuickMemoModal, DeviceInspectorModal, ShiftGroupModal, ResultModal, CollectorManageModal, RepairHistoryModal, AuditLogModal } from './components/Modals.jsx';
import { exportBackup, parseBackup, buildBackup, maybeSnapshot, listSnapshots, getSnapshot } from './lib/backup.js';
import { appendLog } from './lib/auditlog.js';
import { aggregateStatus } from './lib/belts.js';
import { getDeviceInspector, setDeviceInspector } from './lib/device.js';

// 점검일은 07시 기준으로 갱신된다(주간 근무 시작 시각).
// 07시 이전이면 아직 전날 점검일로 취급한다. (예: 23일 06:59 → 22일, 23일 07:00 → 23일)
function inspectionNow() {
  const d = new Date();
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  return d;
}

function todayStr() {
  const d = inspectionNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 다크/라이트 테마 전환 (전 화면 공통, 우하단 플로팅 버튼)
function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f6fa' : '#0e1116');
  }, [theme]);
  const dark = theme === 'dark';
  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={dark ? '라이트 모드' : '다크 모드'}
    >
      {dark ? (
        // 해 (라이트로 전환)
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        // 달 (다크로 전환)
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
}

// 편집 가능한 항목의 기본(default) 구분 목록
function defaultItemList(state, key) {
  if (key === 'pulley') return state.pulleys?.length ? state.pulleys : DEFAULT_PULLEYS;
  const def = INSPECTION_ITEMS.find((d) => d.key === key);
  return def?.subs || [];
}

// 특정 벨트의 실제 설치 구성(없으면 기본값)
function effectiveItemList(state, beltName, key) {
  const cfg = state.beltConfigs?.[beltName];
  if (cfg && cfg[key]) return cfg[key];
  return defaultItemList(state, key);
}

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [view, setView] = useState('dashboard'); // dashboard | list | detail | calendar | form | collectorForm
  const [fieldTab, setFieldTab] = useState('belt'); // 점검모드: 'belt' | 'collector'
  const [collectorCtx, setCollectorCtx] = useState(null); // { name, date }
  const [selectedBelt, setSelectedBelt] = useState(null);
  const [detailFrom, setDetailFrom] = useState('list'); // 상세 진입 출처(뒤로가기 대상)
  const [formCtx, setFormCtx] = useState(null); // { belt, date }
  const [filters, setFilters] = useState({ group: '전체', status: null, query: '' });
  const today = todayStr();
  const [cal, setCal] = useState(() => {
    const d = inspectionNow();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [selDate, setSelDate] = useState(today);
  const [modal, setModal] = useState(null); // 'add' | 'inspectors' | 'report' | 'backup'
  const [printTarget, setPrintTarget] = useState(null); // 인쇄(PDF)할 점검 기록
  const [resultTarget, setResultTarget] = useState(null); // 읽기전용 결과보기 대상 기록
  const [fixedInspector, setFixedInspector] = useState(() => getDeviceInspector()); // 기기 고정 점검자
  const [adminAuthed, setAdminAuthed] = useState(false); // 관리모드 인증 여부(세션 단위)

  const stateRef = useRef(state);
  stateRef.current = state;
  const lastSynced = useRef(null); // 마지막으로 클라우드와 일치한 state (diff 기준)
  const cloudReady = useRef(false);

  // 최초 1회: 클라우드 상태로 화해(reconcile). 비어있으면 현재 상태로 시드.
  useEffect(() => {
    if (!isCloudConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchCloud();
        if (cancelled) return;
        if (remote) {
          lastSynced.current = remote;
          setState(remote);
        } else {
          await seedCloud(stateRef.current);
          lastSynced.current = stateRef.current;
        }
        cloudReady.current = true;
      } catch (e) {
        console.warn('[cloud] 초기 동기화 실패, 로컬로 동작합니다:', e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 다른 기기의 변경을 실시간 수신해 반영
  useEffect(() => {
    if (!isCloudConfigured) return;
    return subscribeCloud(async () => {
      try {
        const remote = await fetchCloud();
        if (!remote) return;
        lastSynced.current = remote;
        setState(remote);
      } catch (e) {
        console.warn('[cloud] 실시간 갱신 실패:', e?.message || e);
      }
    });
  }, []);

  // 상태 변경 시: 로컬 저장(항상) + 클라우드에 변경분 반영
  useEffect(() => {
    saveState(state);
    if (!isCloudConfigured || !cloudReady.current) return;
    if (lastSynced.current === state) return; // 원격에서 적용된 변경이면 되쏘지 않음
    const prev = lastSynced.current;
    lastSynced.current = state;
    syncToCloud(prev, state).catch((e) => console.warn('[cloud] 동기화 실패:', e?.message || e));
  }, [state]);

  // 자동 백업 스냅샷: 최초 로드 후(클라우드 화해 반영 시간 확보) 12시간 경과 시 1회 저장
  const [snapshots, setSnapshots] = useState(() => listSnapshots());
  useEffect(() => {
    const t = setTimeout(() => {
      if (maybeSnapshot(stateRef.current)) setSnapshots(listSnapshots());
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  const { groups, inspectors, records, schedules } = state;
  const quickMemos = state.quickMemos || [];

  const statusOf = useMemo(() => (name) => statusOfFn(records, name), [records]);
  const lastInfoOf = useMemo(
    () => (name) => {
      const r = latestRecord(records, name);
      return r ? { date: r.date, inspector: r.inspector } : null;
    },
    [records]
  );
  const groupOf = useMemo(
    () => (name) => Object.keys(groups).find((g) => groups[g].includes(name)) || '',
    [groups]
  );

  // ===== 핸들러 =====
  const handleSelectBelt = (belt, from = 'list') => {
    setSelectedBelt(belt);
    setDetailFrom(from);
    setView('detail');
  };

  // 감사 로그 헬퍼: setState 업데이터 안에서 logs에 누적
  const withAudit = (s, entry) => ({ ...s, logs: appendLog(s.logs || [], entry) });

  const handleAddBelt = (group, name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => withAudit({ ...s, groups: addBeltFn(s.groups, group, name) }, { actor: '관리자', action: '벨트 추가', detail: `${group} · ${name}` }));
    setFilters((f) => ({ ...f, group, status: null }));
    setModal(null);
  };

  const handleDeleteBelt = (name) => {
    const pw = window.prompt(`"${name}" 벨트를 삭제(철거)합니다.\n점검 이력도 함께 제거됩니다.\n\n관리자 비밀번호를 입력하세요:`);
    if (pw === null) return;
    if (!checkPassword(pw, state.adminPw)) {
      window.alert('관리자 비밀번호가 올바르지 않습니다.');
      return;
    }
    setState((s) => {
      const sched = { ...s.schedules };
      delete sched[name];
      return withAudit({
        ...s,
        groups: removeBeltFn(s.groups, name),
        records: s.records.filter((r) => r.belt !== name),
        schedules: sched,
      }, { actor: '관리자', action: '벨트 삭제', detail: name });
    });
    setView('list');
  };

  const handleSaveSchedule = (name, sched) => {
    setState((s) => ({ ...s, schedules: { ...s.schedules, [name]: sched } }));
    window.alert(`${name} 점검일이 편성되었습니다.`);
  };

  const handleAddInspector = (name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, inspectors: addInspectorFn(s.inspectors, name) }));
  };

  const handleRemoveInspector = (name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, inspectors: removeInspectorFn(s.inspectors, name) }));
  };

  // 빠른 메모 칩 관리 (관리모드)
  const handleAddQuickMemo = (name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const n = String(name || '').trim();
    if (!n) throw new Error('메모 문구를 입력하세요.');
    if ((state.quickMemos || []).includes(n)) throw new Error('이미 등록된 문구입니다.');
    setState((s) => ({ ...s, quickMemos: [...(s.quickMemos || []), n] }));
  };

  const handleRemoveQuickMemo = (name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, quickMemos: (s.quickMemos || []).filter((x) => x !== name) }));
  };

  // 점검모드: 벨트별 설치 구성(Pulley/전기장치) 추가·삭제를 즉시 영속 (점검 완료 저장과 무관)
  // 설치구성 편집은 비밀번호 없이 누구나 가능 (관리자/일반 사용자 공통)
  const handleAddBeltItem = (beltName, key, name) => {
    const n = String(name || '').trim();
    if (!n) throw new Error('구분명을 입력하세요.');
    if (effectiveItemList(state, beltName, key).includes(n)) throw new Error('이미 등록된 구분입니다.');
    setState((s) => {
      const cfg = s.beltConfigs?.[beltName] || {};
      const cur = cfg[key] || effectiveItemList(s, beltName, key);
      return {
        ...s,
        beltConfigs: { ...s.beltConfigs, [beltName]: { ...cfg, [key]: [...cur, n] } },
      };
    });
  };

  const handleRemoveBeltItem = (beltName, key, name) => {
    setState((s) => {
      const cfg = s.beltConfigs?.[beltName] || {};
      const cur = cfg[key] || effectiveItemList(s, beltName, key);
      return {
        ...s,
        beltConfigs: {
          ...s.beltConfigs,
          [beltName]: { ...cfg, [key]: cur.filter((x) => x !== name) },
        },
      };
    });
  };

  // 한 벨트의 Pulley/전기장치 설치 구성을 같은 구분(그룹)의 다른 벨트들에 일괄 복사
  const handleCopyConfigToGroup = (sourceName, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const g = groupOf(sourceName);
    if (!g) throw new Error('대상 구분을 찾을 수 없습니다.');
    const cfg = {
      pulley: [...effectiveItemList(state, sourceName, 'pulley')],
      electric: [...effectiveItemList(state, sourceName, 'electric')],
    };
    const targets = (state.groups[g] || []).filter((n) => n !== sourceName);
    setState((s) => {
      const beltConfigs = { ...s.beltConfigs };
      for (const name of targets) {
        beltConfigs[name] = {
          ...(beltConfigs[name] || {}),
          pulley: [...cfg.pulley],
          electric: [...cfg.electric],
        };
      }
      return { ...s, beltConfigs };
    });
    return { group: g, count: targets.length };
  };

  // 기기 고정 점검자: localStorage에만 저장(클라우드 동기화 X)
  const handleFixInspector = (name) => {
    setDeviceInspector(name);
    setFixedInspector(getDeviceInspector());
    setModal(null);
  };
  const handleClearFixInspector = () => {
    setDeviceInspector('');
    setFixedInspector('');
    setModal(null);
  };

  // 데이터 백업: 전체 상태를 JSON으로 내보내기
  const handleExportBackup = () => exportBackup(stateRef.current);

  // 데이터 복원: 백업 JSON으로 전체 상태 덮어쓰기 (비밀번호 확인)
  const handleImportBackup = (text, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const restored = parseBackup(text);
    setState((s) => ({
      ...s,
      groups: restored.groups,
      inspectors: restored.inspectors,
      pulleys: restored.pulleys ?? s.pulleys,
      quickMemos: restored.quickMemos ?? s.quickMemos,
      beltConfigs: restored.beltConfigs,
      adminPw: restored.adminPw ?? s.adminPw,
      schedules: restored.schedules,
      records: restored.records,
      collectors: restored.collectors ?? s.collectors,
      collectorRecords: restored.collectorRecords ?? s.collectorRecords,
      repairs: restored.repairs ?? s.repairs,
      repairHistory: restored.repairHistory ?? s.repairHistory,
      logs: restored.logs ?? s.logs,
    }));
    window.alert(`복원 완료: 벨트 ${Object.values(restored.groups).reduce((a, b) => a + b.length, 0)}대 · 기록 ${restored.records.length}건`);
    setModal(null);
  };

  // 자동 스냅샷 복원: 선택한 스냅샷의 상태로 되돌림 (비밀번호 확인)
  const handleRestoreSnapshot = (id, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const snap = getSnapshot(id);
    if (!snap) throw new Error('스냅샷을 찾을 수 없습니다.');
    handleImportBackup(buildBackup(snap.state), pw);
  };

  const handleInspect = (belt, date) => {
    setFormCtx({ belt, date });
    setView('form');
  };

  const handlePickBelt = (name, date) => {
    setFormCtx({ belt: { name, group: groupOf(name) }, date });
    setView('form');
  };

  // 특정 점검 기록을 그 날짜로 열어 수정 (점검 이력의 ✏ 수정)
  const handleEditRecord = (record) => {
    setFormCtx({ belt: { name: record.belt, group: record.group || groupOf(record.belt) }, date: record.date });
    setView('form');
  };

  // 점검모드 검색/상태 목록에서 벨트 선택: 최근 점검결과가 있으면 상세(결과)로,
  // 없으면 바로 점검 입력 화면으로 이동
  const handleOpenBeltSmart = (name) => {
    if (latestRecord(records, name)) {
      handleSelectBelt({ name, group: groupOf(name) }, 'calendar');
    } else {
      handlePickBelt(name, selDate);
    }
  };

  // 점검모드 목록(정상/주의/이상)에서 바로 점검결과 수정: 최근 기록을 그 날짜로 열어 편집
  const handleEditBeltLatest = (name) => {
    const rec = latestRecord(records, name);
    if (rec) handleEditRecord(rec);
    else handlePickBelt(name, selDate);
  };

  const handleSaveRecord = (record, origDate) => {
    setState((s) => {
      // 같은 벨트+같은 날짜 기록은 덮어쓰기. 점검일을 바꿔 저장한 경우 원래 날짜 기록도 정리.
      const others = s.records.filter(
        (r) => !(r.belt === record.belt && (r.date === record.date || (origDate && r.date === origDate)))
      );
      const records = [...others, record];
      // 점검 완료 시 다음 예정일 자동 계산
      const cur = s.schedules[record.belt];
      const cycle = cur?.cycle || 'monthly';
      const next = nextDateFrom(record.date, cycle);
      const schedules = { ...s.schedules, [record.belt]: { nextDate: next, cycle } };
      const st = aggregateStatus(record);
      return withAudit({ ...s, records, schedules }, {
        actor: record.inspector || '(미지정)', action: '벨트 점검',
        detail: `${record.belt} · ${st === 'ok' ? '정상' : '이상'} (${record.date})`,
      });
    });
    setView('calendar');
  };

  // ── 대시보드 이상 항목 수리요청 워크플로 ──
  // entry: { name, date, ... }, it: { title, sub, itemKey, status, ... }
  const repairKeyFor = (kind, entry, it) =>
    `${kind}|${entry.name}|${entry.date}|${it.itemKey}|${it.sub || ''}`;

  // 수리 상태/담당자/예상일 갱신 (정비의뢰 단계). 수리완료는 onResolve가 처리.
  const handleSetRepair = (kind, entry, it, patch) => {
    const key = repairKeyFor(kind, entry, it);
    setState((s) => {
      const repairs = { ...(s.repairs || {}) };
      const isNew = !repairs[key];
      const prev = repairs[key] || {
        kind,
        equip: entry.name,
        group: entry.group || null,
        date: entry.date,
        itemKey: it.itemKey,
        sub: it.sub || null,
        title: it.title,
        status: 'requested',
        requestedAt: new Date().toISOString(),
      };
      repairs[key] = { ...prev, ...patch, updatedAt: new Date().toISOString() };
      // 신규 정비의뢰만 로그 (담당자/예상일 수정은 로그 생략)
      const next = { ...s, repairs };
      return isNew
        ? withAudit(next, { actor: '관리자', action: '정비의뢰', detail: `${entry.name} · ${it.title}${it.sub ? ` (${it.sub})` : ''}` })
        : next;
    });
  };

  // 수리완료: 점검 항목을 양호로 되돌리고, 정비 이력(repairHistory)으로 이관 + 로그
  const completeRepair = (s, kind, entry, it) => {
    const key = repairKeyFor(kind, entry, it);
    const prior = (s.repairs || {})[key] || {};
    const repairs = { ...(s.repairs || {}) };
    delete repairs[key];
    const histEntry = {
      id: `rh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      kind,
      equip: entry.name,
      group: entry.group || null,
      date: entry.date,
      itemKey: it.itemKey,
      sub: it.sub || null,
      title: it.title,
      assignee: prior.assignee || '',
      dueDate: prior.dueDate || '',
      requestedAt: prior.requestedAt || null,
      completedAt: new Date().toISOString(),
    };
    const repairHistory = [histEntry, ...(s.repairHistory || [])].slice(0, 1000);
    return withAudit({ ...s, repairs, repairHistory }, {
      actor: '관리자', action: '수리완료',
      detail: `${entry.name} · ${it.title}${it.sub ? ` (${it.sub})` : ''}${prior.assignee ? ` · 담당 ${prior.assignee}` : ''}`,
    });
  };

  const handleResolveBeltIssue = (entry, it) => {
    if (!window.confirm(`"${entry.name}" ${it.title}${it.sub ? ` (${it.sub})` : ''} 수리를 완료 처리할까요?\n(점검 상태가 양호로 변경되고 정비 이력에 기록됩니다)`)) return;
    setState((s) => {
      const records = s.records.map((r) => {
        if (r.belt !== entry.name || r.date !== entry.date) return r;
        const items = { ...r.items };
        const item = { ...(items[it.itemKey] || {}) };
        if (it.sub) {
          item.subs = { ...item.subs, [it.sub]: 'ok' };
        } else {
          item.status = 'ok';
        }
        items[it.itemKey] = item;
        return { ...r, items };
      });
      return completeRepair({ ...s, records }, 'belt', entry, it);
    });
  };

  const handleResolveCollectorIssue = (entry, it) => {
    if (!window.confirm(`"${entry.name}" ${it.title}${it.sub ? ` (${it.sub})` : ''} 수리를 완료 처리할까요?\n(점검 상태가 양호로 변경되고 정비 이력에 기록됩니다)`)) return;
    setState((s) => {
      const collectorRecords = (s.collectorRecords || []).map((r) => {
        if (r.collector !== entry.name || r.date !== entry.date) return r;
        const items = { ...r.items };
        const item = { ...(items[it.itemKey] || {}) };
        if (it.sub) {
          item.subs = { ...item.subs, [it.sub]: 'ok' };
        } else {
          item.status = 'ok';
        }
        items[it.itemKey] = item;
        return { ...r, items };
      });
      return completeRepair({ ...s, collectorRecords }, 'collector', entry, it);
    });
  };

  // ── 집진기 점검 핸들러 ──
  const handlePickCollector = (name, date) => {
    setCollectorCtx({ name, date });
    setView('collectorForm');
  };
  // 관리모드 목록에서 집진기 선택: 최근 점검 결과를 읽기전용으로 표시(없으면 안내)
  const handleSelectCollectorAdmin = (name) => {
    const rec = latestCollectorRecord(state.collectorRecords || [], name);
    if (rec) setResultTarget(rec);
    else window.alert(`${name}\n점검 이력이 없습니다.`);
  };
  const handleSaveCollectorRecord = (record, origDate) => {
    setState((s) => {
      const others = (s.collectorRecords || []).filter(
        (r) => !(r.collector === record.collector && (r.date === record.date || (origDate && r.date === origDate)))
      );
      const st = aggregateCollectorStatus(record);
      return withAudit({ ...s, collectorRecords: [...others, record] }, {
        actor: record.inspector || '(미지정)', action: '집진기 점검',
        detail: `${record.collector} · ${st === 'ok' ? '정상' : '이상'} (${record.date})`,
      });
    });
    setView('calendar');
  };
  const handleSetCollectorExterior = (name, subs) => {
    setState((s) => ({
      ...s,
      collectors: updateCollector(s.collectors || defaultCollectors(), name, { exterior: subs }),
    }));
  };
  // 관리모드: 집진기 목록/점검일 추가·수정·삭제 (비밀번호 확인)
  const handleAddCollector = (name, days, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const next = addCollector(stateRef.current.collectors || defaultCollectors(), name, days);
    setState((s) => ({ ...s, collectors: next }));
  };
  const handleUpdateCollector = (name, patch, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, collectors: updateCollector(s.collectors || defaultCollectors(), name, patch) }));
  };
  const handleRemoveCollector = (name, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, collectors: removeCollector(s.collectors || defaultCollectors(), name) }));
  };

  // ===== 대근(代勤) 핸들러 =====
  const handleSetPin = (name, pin) => {
    // setPinFn이 형식(숫자 4자리+) 검증 후 throw → 컴포넌트에서 처리
    const pins = setPinFn(state.shiftPins || {}, name, pin);
    setState((s) => ({ ...s, shiftPins: pins }));
  };
  // 주 52시간 초과 확인 (대근/추가근무 반영된 예정 상태로 계산)
  // 차단이 아닌 알림: 초과 시 확인창을 띄우고, 사용자가 계속 진행을 누르면 true
  const confirmWeekly = (person, date, { substitutions, extraWorks }) => {
    if (!person) return true;
    const sg = stateRef.current.shiftGroups || defaultShiftGroups();
    if (exceedsWeeklyLimit(person, date, {
      shiftGroups: sg,
      substitutions: substitutions ?? (stateRef.current.substitutions || []),
      extraWorks: extraWorks ?? (stateRef.current.extraWorks || []),
    })) {
      return window.confirm('주 52시간 초과되었습니다.\n그래도 계속 진행하시겠습니까?');
    }
    return true;
  };
  // 대근 변경 이력(감사 로그) 헬퍼: setState 업데이터 안에서 subLogs에 누적
  const withLog = (s, patch, entry) => ({
    ...s,
    ...patch,
    subLogs: appendSubLog(s.subLogs || [], entry),
  });
  const fmtSub = (sub) => `${sub.date} ${SHIFT_LABEL[sub.shift] || ''} ${sub.requester}(${sub.group}조)${sub.reason ? ` · ${sub.reason}` : ''}`;
  // 순수 함수가 throw할 수 있으므로 setState 업데이터 밖에서 먼저 계산(렌더 중 throw로 인한 빈 화면 방지)
  const handleCreateSub = (payload, opts) => {
    const next = createSubstitution(stateRef.current.substitutions || [], payload, opts);
    const sub = next[next.length - 1];
    setState((s) => withLog(s, { substitutions: next }, { actor: payload.requester, action: '대근 신청', detail: fmtSub(sub) }));
  };
  const handleClaimSub = (id, substitute) => {
    const sg = stateRef.current.shiftGroups || defaultShiftGroups();
    const next = claimSubstitution(stateRef.current.substitutions || [], id, substitute, sg);
    const sub = next.find((x) => x.id === id);
    if (sub && !confirmWeekly(substitute, sub.date, { substitutions: next })) return;
    setState((s) => withLog(s, { substitutions: next }, { actor: substitute, action: '대근 확정', detail: sub ? `${sub.date} ${sub.requester} → ${substitute}` : '' }));
  };
  const handleUnclaimSub = (id) => {
    const sub = (stateRef.current.substitutions || []).find((x) => x.id === id);
    setState((s) => withLog(s, { substitutions: unclaimSubstitution(s.substitutions || [], id) }, { actor: sub?.substitute || '대근자', action: '대근 취소', detail: sub ? `${sub.date} ${sub.requester}` : '' }));
  };
  const handleCancelSub = (id) => {
    const sub = (stateRef.current.substitutions || []).find((x) => x.id === id);
    setState((s) => withLog(s, { substitutions: cancelSubstitution(s.substitutions || [], id) }, { actor: sub?.requester || '신청자', action: '신청 삭제', detail: sub ? fmtSub(sub) : '' }));
  };
  // 관리자 대근 편성: 비밀번호 확인 후 입력/수정/삭제 (throw 가능 → setState 밖에서 계산)
  const verifyAdmin = (pw) => checkPassword(pw, stateRef.current.adminPw);
  const handleAdminCreateSub = (payload, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const next = adminCreateSubstitution(stateRef.current.substitutions || [], payload);
    if (payload.substitute && !confirmWeekly(payload.substitute, payload.date, { substitutions: next })) return;
    const sub = next[next.length - 1];
    setState((s) => withLog(s, { substitutions: next }, { actor: '관리자', action: '편성 추가', detail: `${fmtSub(sub)}${sub.substitute ? ` → ${sub.substitute}` : ''}` }));
  };
  const handleAdminUpdateSub = (id, patch, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const next = adminUpdateSubstitution(stateRef.current.substitutions || [], id, patch);
    const sub = next.find((x) => x.id === id);
    if (sub && sub.substitute && !confirmWeekly(sub.substitute, sub.date, { substitutions: next })) return;
    setState((s) => withLog(s, { substitutions: next }, { actor: '관리자', action: '편성 수정', detail: sub ? `${fmtSub(sub)}${sub.substitute ? ` → ${sub.substitute}` : ''}` : '' }));
  };
  const handleAdminDeleteSub = (id, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const sub = (stateRef.current.substitutions || []).find((x) => x.id === id);
    setState((s) => withLog(s, { substitutions: cancelSubstitution(s.substitutions || [], id) }, { actor: '관리자', action: '편성 삭제', detail: sub ? fmtSub(sub) : '' }));
  };
  // 관리자 추가 근무 편성: 비밀번호 확인 후 입력/수정/삭제
  const handleAdminCreateExtra = (payload, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const next = createExtraWork(stateRef.current.extraWorks || [], payload);
    if (!confirmWeekly(payload.person, payload.date, { extraWorks: next })) return;
    setState((s) => ({ ...s, extraWorks: next }));
  };
  const handleAdminUpdateExtra = (id, patch, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const next = adminUpdateExtraWork(stateRef.current.extraWorks || [], id, patch);
    const ex = next.find((x) => x.id === id);
    if (ex && !confirmWeekly(ex.person, ex.date, { extraWorks: next })) return;
    setState((s) => ({ ...s, extraWorks: next }));
  };
  const handleAdminDeleteExtra = (id, pw) => {
    if (!checkPassword(pw, stateRef.current.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, extraWorks: cancelExtraWork(s.extraWorks || [], id) }));
  };
  // 추가 근무(교육대근/GIB/PSM) — throw 가능하므로 setState 밖에서 계산
  const handleCreateExtra = (payload) => {
    const next = createExtraWork(stateRef.current.extraWorks || [], payload);
    if (!confirmWeekly(payload.person, payload.date, { extraWorks: next })) return;
    setState((s) => ({ ...s, extraWorks: next }));
  };
  const handleCancelExtra = (id) => {
    setState((s) => ({ ...s, extraWorks: cancelExtraWork(s.extraWorks || [], id) }));
  };

  // 대근 맞교환(스왑) — throw 가능하므로 setState 밖에서 계산
  const handleCreateSwap = (payload) => {
    const sg = stateRef.current.shiftGroups || defaultShiftGroups();
    const next = createSwapRequest(stateRef.current.swaps || [], payload, sg);
    setState((s) => withLog(s, { swaps: next }, {
      actor: payload.requester, action: '맞교환 요청',
      detail: `${payload.requester}(${payload.requesterDate}) ↔ ${payload.target}(${payload.targetDate})`,
    }));
  };
  const handleAcceptSwap = (id) => {
    const sg = stateRef.current.shiftGroups || defaultShiftGroups();
    const swap = (stateRef.current.swaps || []).find((w) => w.id === id);
    const res = acceptSwap(stateRef.current.swaps || [], stateRef.current.substitutions || [], id, sg);
    if (swap) {
      if (!confirmWeekly(swap.target, swap.requesterDate, { substitutions: res.substitutions })) return;
      if (!confirmWeekly(swap.requester, swap.targetDate, { substitutions: res.substitutions })) return;
    }
    setState((s) => withLog(s, { swaps: res.swaps, substitutions: res.substitutions }, {
      actor: swap?.target || '대상자', action: '맞교환 수락',
      detail: swap ? `${swap.requester}(${swap.requesterDate}) ↔ ${swap.target}(${swap.targetDate})` : '',
    }));
  };
  const handleRejectSwap = (id) => {
    const swap = (stateRef.current.swaps || []).find((w) => w.id === id);
    setState((s) => withLog(s, { swaps: rejectSwap(s.swaps || [], id) }, {
      actor: swap?.target || '대상자', action: '맞교환 거절',
      detail: swap ? `${swap.requester} ↔ ${swap.target}` : '',
    }));
  };
  const handleCancelSwap = (id) => {
    const swap = (stateRef.current.swaps || []).find((w) => w.id === id);
    const res = cancelSwap(stateRef.current.swaps || [], stateRef.current.substitutions || [], id);
    setState((s) => withLog(s, res, {
      actor: swap?.requester || '신청자', action: '맞교환 철회',
      detail: swap ? `${swap.requester} ↔ ${swap.target}` : '',
    }));
  };

  // PIN 초기화: 사용자가 신청 → 관리모드에서 승인하면 해당 PIN 삭제(재설정 가능)
  const handleRequestPinReset = (name) => {
    setState((s) => {
      const cur = s.pinResets || [];
      if (cur.includes(name)) return s;
      return { ...s, pinResets: [...cur, name] };
    });
  };
  const handleApprovePinReset = (name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => {
      const pins = { ...(s.shiftPins || {}) };
      delete pins[name];
      return { ...s, shiftPins: pins, pinResets: (s.pinResets || []).filter((x) => x !== name) };
    });
  };

  // 교대조 인원 편성 (관리모드)
  const handleAddShiftMember = (group, name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    const n = String(name || '').trim();
    if (!n) throw new Error('이름을 입력하세요.');
    const cur = state.shiftGroups || defaultShiftGroups();
    for (const g of Object.keys(cur)) {
      if ((cur[g] || []).includes(n)) throw new Error(`이미 ${g}조에 편성된 인원입니다.`);
    }
    setState((s) => {
      const sg = s.shiftGroups || defaultShiftGroups();
      return { ...s, shiftGroups: { ...sg, [group]: [...(sg[group] || []), n] } };
    });
  };
  const handleRemoveShiftMember = (group, name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => {
      const sg = s.shiftGroups || defaultShiftGroups();
      return { ...s, shiftGroups: { ...sg, [group]: (sg[group] || []).filter((x) => x !== name) } };
    });
  };

  // 점검표 인쇄/PDF: 대상 기록을 렌더한 뒤 브라우저 인쇄 대화상자 호출
  useEffect(() => {
    if (!printTarget) return;
    const t = setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 100);
    return () => clearTimeout(t);
  }, [printTarget]);

  // 관리모드 진입: 최초 1회 비밀번호 확인(이후 세션 동안 유지)
  const goAdmin = () => {
    if (adminAuthed) {
      setView('list');
      return;
    }
    const pw = window.prompt('관리모드 진입 — 관리자 비밀번호를 입력하세요:');
    if (pw === null) return;
    if (!checkPassword(pw, state.adminPw)) {
      window.alert('관리자 비밀번호가 올바르지 않습니다.');
      return;
    }
    setAdminAuthed(true);
    setView('list');
  };

  const navMonth = (delta) => {
    setCal((c) => {
      let m = c.month + delta;
      let y = c.year;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      return { year: y, month: m };
    });
  };

  // ===== 렌더 =====
  return (
    <div className="app">
      {view === 'dashboard' && (
        <Dashboard
          today={today}
          groups={groups}
          records={records}
          schedules={schedules}
          collectors={state.collectors || defaultCollectors()}
          collectorRecords={state.collectorRecords || []}
          substitutions={state.substitutions || []}
          shiftGroups={state.shiftGroups || defaultShiftGroups()}
          onGoField={() => setView('calendar')}
          onGoAdmin={goAdmin}
          onOpenLeaderboard={() => setModal('leaderboard')}
          onOpenShift={() => setView('shift')}
          repairs={state.repairs || {}}
          onSetRepair={handleSetRepair}
          onResolveBeltIssue={handleResolveBeltIssue}
          onResolveCollectorIssue={handleResolveCollectorIssue}
        />
      )}

      {view === 'list' && (
        <AdminList
          groups={groups}
          records={records}
          schedules={schedules}
          today={today}
          statusOf={statusOf}
          lastInfoOf={lastInfoOf}
          filters={filters}
          setFilters={setFilters}
          onSelectBelt={handleSelectBelt}
          collectors={state.collectors || defaultCollectors()}
          collectorRecords={state.collectorRecords || []}
          onSelectCollector={handleSelectCollectorAdmin}
          onOpenAdd={() => setModal('add')}
          onOpenInspectors={() => setModal('inspectors')}
          onOpenQuickMemos={() => setModal('quickMemos')}
          onOpenReport={() => setModal('report')}
          onOpenBackup={() => setModal('backup')}
          onOpenLeaderboard={() => setModal('leaderboard')}
          onOpenShiftGroups={() => setModal('shiftGroups')}
          onOpenCollectors={() => setModal('collectorManage')}
          onOpenRepairHistory={() => setModal('repairHistory')}
          onOpenAuditLog={() => setModal('auditLog')}
          cloud={isCloudConfigured}
        />
      )}

      {view === 'detail' && selectedBelt && (
        <BeltDetail
          belt={selectedBelt}
          records={records}
          schedule={schedules[selectedBelt.name]}
          today={today}
          onBack={() => setView(detailFrom)}
          onInspect={handleInspect}
          onDeleteBelt={handleDeleteBelt}
          onSaveSchedule={handleSaveSchedule}
          onCopyConfig={handleCopyConfigToGroup}
          onPrint={setPrintTarget}
          onViewResult={setResultTarget}
          onEditRecord={handleEditRecord}
          groupCount={(groups[selectedBelt.group] || []).length}
        />
      )}

      {view === 'calendar' && fieldTab === 'belt' && (
        <FieldCalendar
          year={cal.year}
          month={cal.month}
          groups={groups}
          schedules={schedules}
          records={records}
          today={today}
          statusOf={statusOf}
          selectedDate={selDate}
          onSelectDate={setSelDate}
          onPrev={() => navMonth(-1)}
          onNext={() => navMonth(1)}
          onPickBelt={handlePickBelt}
          onOpenBelt={handleOpenBeltSmart}
          onEditBelt={handleEditBeltLatest}
          groupOf={groupOf}
          filters={filters}
          setFilters={setFilters}
          onOpenLeaderboard={() => setModal('leaderboard')}
          onOpenShift={() => setView('shift')}
          fixedInspector={fixedInspector}
          onOpenDeviceInspector={() => setModal('deviceInspector')}
          fieldTab={fieldTab}
          onFieldTab={setFieldTab}
        />
      )}

      {view === 'calendar' && fieldTab === 'collector' && (
        <CollectorCalendar
          year={cal.year}
          month={cal.month}
          today={today}
          selectedDate={selDate}
          onSelectDate={setSelDate}
          onPrev={() => navMonth(-1)}
          onNext={() => navMonth(1)}
          collectors={state.collectors || defaultCollectors()}
          collectorRecords={state.collectorRecords || []}
          onPickCollector={handlePickCollector}
          fieldTab={fieldTab}
          onFieldTab={setFieldTab}
          onOpenLeaderboard={() => setModal('leaderboard')}
          onOpenShift={() => setView('shift')}
        />
      )}

      {view === 'collectorForm' && collectorCtx && (
        <CollectorForm
          collector={(state.collectors || defaultCollectors()).find((c) => c.name === collectorCtx.name) || { name: collectorCtx.name, days: [] }}
          date={collectorCtx.date}
          inspectors={inspectors}
          quickMemos={quickMemos}
          defaultInspector={fixedInspector && inspectors.includes(fixedInspector) ? fixedInspector : (inspectors[0] || '')}
          initialRecord={(state.collectorRecords || []).find((r) => r.collector === collectorCtx.name && r.date === collectorCtx.date)}
          records={state.collectorRecords || []}
          onSetExterior={handleSetCollectorExterior}
          onCancel={() => setView('calendar')}
          onSave={handleSaveCollectorRecord}
          onPrint={setPrintTarget}
          onViewResult={setResultTarget}
        />
      )}

      {view === 'shift' && (
        <SubstitutionPage
          shiftGroups={state.shiftGroups || defaultShiftGroups()}
          shiftPins={state.shiftPins || {}}
          pinResets={state.pinResets || []}
          substitutions={state.substitutions || []}
          extraWorks={state.extraWorks || []}
          swaps={state.swaps || []}
          subLogs={state.subLogs || []}
          today={today}
          onSetPin={handleSetPin}
          onCreateSwap={handleCreateSwap}
          onAcceptSwap={handleAcceptSwap}
          onRejectSwap={handleRejectSwap}
          onCancelSwap={handleCancelSwap}
          onRequestPinReset={handleRequestPinReset}
          onCreateSub={handleCreateSub}
          onClaimSub={handleClaimSub}
          onUnclaimSub={handleUnclaimSub}
          onCancelSub={handleCancelSub}
          onCreateExtra={handleCreateExtra}
          onCancelExtra={handleCancelExtra}
          onVerifyAdmin={verifyAdmin}
          onAdminCreateSub={handleAdminCreateSub}
          onAdminUpdateSub={handleAdminUpdateSub}
          onAdminDeleteSub={handleAdminDeleteSub}
          onAdminCreateExtra={handleAdminCreateExtra}
          onAdminUpdateExtra={handleAdminUpdateExtra}
          onAdminDeleteExtra={handleAdminDeleteExtra}
          onClose={() => setView('calendar')}
        />
      )}

      {view === 'form' && formCtx && (
        <InspectionForm
          belt={formCtx.belt}
          date={formCtx.date}
          inspectors={inspectors}
          beltItems={{
            pulley: effectiveItemList(state, formCtx.belt.name, 'pulley'),
            electric: effectiveItemList(state, formCtx.belt.name, 'electric'),
          }}
          quickMemos={quickMemos}
          defaultInspector={fixedInspector && inspectors.includes(fixedInspector) ? fixedInspector : (inspectors[0] || '')}
          initialRecord={records.find(
            (r) => r.belt === formCtx.belt.name && r.date === formCtx.date
          )}
          records={records}
          onAddItem={handleAddBeltItem}
          onRemoveItem={handleRemoveBeltItem}
          onCancel={() => setView('calendar')}
          onSave={handleSaveRecord}
        />
      )}

      {modal === 'add' && (
        <AddBeltModal
          groups={groups}
          defaultGroup={filters.group !== '전체' ? filters.group : null}
          onAdd={handleAddBelt}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'inspectors' && (
        <InspectorModal
          inspectors={inspectors}
          onAdd={handleAddInspector}
          onRemove={handleRemoveInspector}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'report' && (
        <ReportModal records={records} collectorRecords={state.collectorRecords || []} onClose={() => setModal(null)} />
      )}
      {modal === 'backup' && (
        <BackupModal
          state={state}
          onExport={handleExportBackup}
          onImport={handleImportBackup}
          snapshots={snapshots}
          onRestoreSnapshot={handleRestoreSnapshot}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'repairHistory' && (
        <RepairHistoryModal history={state.repairHistory || []} onClose={() => setModal(null)} />
      )}
      {modal === 'auditLog' && (
        <AuditLogModal logs={state.logs || []} onClose={() => setModal(null)} />
      )}
      {modal === 'leaderboard' && (
        <LeaderboardModal records={records} collectorRecords={state.collectorRecords || []} onClose={() => setModal(null)} />
      )}
      {modal === 'quickMemos' && (
        <QuickMemoModal
          memos={quickMemos}
          onAdd={handleAddQuickMemo}
          onRemove={handleRemoveQuickMemo}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'shiftGroups' && (
        <ShiftGroupModal
          shiftGroups={state.shiftGroups || defaultShiftGroups()}
          pinResets={state.pinResets || []}
          onAdd={handleAddShiftMember}
          onRemove={handleRemoveShiftMember}
          onApproveReset={handleApprovePinReset}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'deviceInspector' && (
        <DeviceInspectorModal
          inspectors={inspectors}
          current={fixedInspector}
          onSave={handleFixInspector}
          onClear={handleClearFixInspector}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'collectorManage' && (
        <CollectorManageModal
          collectors={state.collectors || defaultCollectors()}
          onAdd={handleAddCollector}
          onUpdate={handleUpdateCollector}
          onRemove={handleRemoveCollector}
          onClose={() => setModal(null)}
        />
      )}

      {resultTarget && (
        <ResultModal
          record={resultTarget}
          onPrint={(r) => { setResultTarget(null); setPrintTarget(r); }}
          onClose={() => setResultTarget(null)}
        />
      )}

      {printTarget && <PrintableRecord record={printTarget} />}

      <ThemeToggle />

      <div className="tabbar">
        <button
          className={view === 'dashboard' ? 'active' : ''}
          onClick={() => setView('dashboard')}
        >
          <span className="ic">🏠</span>홈
        </button>
        <button
          className={view === 'calendar' || view === 'form' || view === 'collectorForm' ? 'active' : ''}
          onClick={() => setView('calendar')}
        >
          <span className="ic">🦺</span>점검모드
        </button>
        <button
          className={view === 'list' || view === 'detail' ? 'active' : ''}
          onClick={goAdmin}
        >
          <span className="ic">📊</span>관리모드
        </button>
      </div>
    </div>
  );
}
