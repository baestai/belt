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
import { DEFAULT_PULLEYS, addPulley as addPulleyFn, removePulley as removePulleyFn } from './lib/inspectionItems.js';
import { statusOf as statusOfFn, latestRecord, nextDateFrom } from './lib/selectors.js';
import AdminList from './components/AdminList.jsx';
import BeltDetail from './components/BeltDetail.jsx';
import FieldCalendar from './components/FieldCalendar.jsx';
import InspectionForm from './components/InspectionForm.jsx';
import { AddBeltModal, InspectorModal, PulleyModal, ReportModal } from './components/Modals.jsx';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [view, setView] = useState('calendar'); // list | detail | calendar | form
  const [selectedBelt, setSelectedBelt] = useState(null);
  const [formCtx, setFormCtx] = useState(null); // { belt, date }
  const [filters, setFilters] = useState({ group: '전체', status: null, query: '' });
  const today = todayStr();
  const [cal, setCal] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [selDate, setSelDate] = useState(today);
  const [modal, setModal] = useState(null); // 'add' | 'inspectors' | 'report'

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

  const { groups, inspectors, records, schedules } = state;
  const pulleys = state.pulleys && state.pulleys.length ? state.pulleys : DEFAULT_PULLEYS;

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
  const handleSelectBelt = (belt) => {
    setSelectedBelt(belt);
    setView('detail');
  };

  const handleAddBelt = (group, name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, groups: addBeltFn(s.groups, group, name) }));
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
      return {
        ...s,
        groups: removeBeltFn(s.groups, name),
        records: s.records.filter((r) => r.belt !== name),
        schedules: sched,
      };
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

  const handleAddPulley = (name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, pulleys: addPulleyFn(s.pulleys || DEFAULT_PULLEYS, name) }));
  };

  const handleRemovePulley = (name, pw) => {
    if (!checkPassword(pw, state.adminPw)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    setState((s) => ({ ...s, pulleys: removePulleyFn(s.pulleys || DEFAULT_PULLEYS, name) }));
  };

  const handleInspect = (belt, date) => {
    setFormCtx({ belt, date });
    setView('form');
  };

  const handlePickBelt = (name, date) => {
    setFormCtx({ belt: { name, group: groupOf(name) }, date });
    setView('form');
  };

  const handleSaveRecord = (record) => {
    setState((s) => {
      // 같은 벨트+같은 날짜 기록은 덮어쓰기
      const others = s.records.filter((r) => !(r.belt === record.belt && r.date === record.date));
      const records = [...others, record];
      // 점검 완료 시 다음 예정일 자동 계산
      const cur = s.schedules[record.belt];
      const cycle = cur?.cycle || 'monthly';
      const next = nextDateFrom(record.date, cycle);
      const schedules = { ...s.schedules, [record.belt]: { nextDate: next, cycle } };
      return { ...s, records, schedules };
    });
    setView('calendar');
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
          onOpenAdd={() => setModal('add')}
          onOpenInspectors={() => setModal('inspectors')}
          onOpenPulleys={() => setModal('pulleys')}
          onOpenReport={() => setModal('report')}
          cloud={isCloudConfigured}
        />
      )}

      {view === 'detail' && selectedBelt && (
        <BeltDetail
          belt={selectedBelt}
          records={records}
          schedule={schedules[selectedBelt.name]}
          today={today}
          onBack={() => setView('list')}
          onInspect={handleInspect}
          onDeleteBelt={handleDeleteBelt}
          onSaveSchedule={handleSaveSchedule}
        />
      )}

      {view === 'calendar' && (
        <FieldCalendar
          year={cal.year}
          month={cal.month}
          schedules={schedules}
          today={today}
          statusOf={statusOf}
          selectedDate={selDate}
          onSelectDate={setSelDate}
          onPrev={() => navMonth(-1)}
          onNext={() => navMonth(1)}
          onPickBelt={handlePickBelt}
          groupOf={groupOf}
        />
      )}

      {view === 'form' && formCtx && (
        <InspectionForm
          belt={formCtx.belt}
          date={formCtx.date}
          inspectors={inspectors}
          adminPw={state.adminPw}
          pulleys={(() => {
            // 같은 벨트의 직전 점검 기록에 설정된 Pulley 구성을 이어받는다.
            const last = latestRecord(records, formCtx.belt.name);
            const keys = last?.items?.pulley?.subs
              ? Object.keys(last.items.pulley.subs)
              : [];
            return keys.length ? keys : pulleys;
          })()}
          initialRecord={records.find(
            (r) => r.belt === formCtx.belt.name && r.date === formCtx.date
          )}
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
      {modal === 'pulleys' && (
        <PulleyModal
          pulleys={pulleys}
          onAdd={handleAddPulley}
          onRemove={handleRemovePulley}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'report' && (
        <ReportModal records={records} onClose={() => setModal(null)} />
      )}

      <div className="tabbar">
        <button
          className={view === 'calendar' || view === 'form' ? 'active' : ''}
          onClick={() => setView('calendar')}
        >
          <span className="ic">🦺</span>점검모드
        </button>
        <button
          className={view === 'list' || view === 'detail' ? 'active' : ''}
          onClick={() => setView('list')}
        >
          <span className="ic">📊</span>관리모드
        </button>
      </div>
    </div>
  );
}
