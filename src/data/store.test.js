import { describe, it, expect, beforeEach } from 'vitest';
import { loadState, saveState, clearState, defaultState, STORAGE_KEY } from './store.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

describe('상태 저장/로드', () => {
  let store;
  beforeEach(() => {
    store = fakeStorage();
  });

  it('기본 상태에는 111개 벨트와 점검자 3명', () => {
    const s = defaultState();
    const total = Object.values(s.groups).reduce((a, g) => a + g.length, 0);
    expect(total).toBe(111);
    expect(s.inspectors.length).toBe(3);
    expect(s.adminPw).toBe('tkatjsxks**');
  });

  it('비어있으면 기본 상태 로드', () => {
    const s = loadState(store);
    expect(s.records).toEqual([]);
  });

  it('저장 후 다시 로드하면 동일', () => {
    const s = defaultState();
    s.records.push({ belt: 'S-101', date: '2026-06-15', inspector: '김현장', items: {} });
    saveState(s, store);
    const loaded = loadState(store);
    expect(loaded.records.length).toBe(1);
    expect(loaded.records[0].belt).toBe('S-101');
  });

  it('손상된 JSON은 기본 상태로 폴백', () => {
    store.setItem(STORAGE_KEY, '{깨진json');
    const s = loadState(store);
    expect(s.records).toEqual([]);
  });

  it('clearState는 저장소를 비운다', () => {
    saveState(defaultState(), store);
    clearState(store);
    expect(store.getItem(STORAGE_KEY)).toBe(null);
  });
});
