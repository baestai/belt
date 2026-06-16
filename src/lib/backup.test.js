import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup } from './backup.js';

const sampleState = {
  groups: { CWF: ['5A CWF #1', '5A CWF #2'] },
  inspectors: ['홍길동'],
  pulleys: ['Head', 'Tail'],
  beltConfigs: { '5A CWF #1': { pulley: ['Head'], electric: ['Chute S/W'] } },
  adminPw: 'secret',
  schedules: { '5A CWF #1': { nextDate: '2026-07-01', cycle: 'monthly' } },
  records: [{ belt: '5A CWF #1', group: 'CWF', date: '2026-06-01', inspector: '홍길동', items: {} }],
};

describe('backup', () => {
  it('buildBackup -> parseBackup 라운드트립', () => {
    const text = buildBackup(sampleState);
    const restored = parseBackup(text);
    expect(restored.groups).toEqual(sampleState.groups);
    expect(restored.inspectors).toEqual(sampleState.inspectors);
    expect(restored.beltConfigs).toEqual(sampleState.beltConfigs);
    expect(restored.schedules).toEqual(sampleState.schedules);
    expect(restored.records).toEqual(sampleState.records);
    expect(restored.adminPw).toBe('secret');
  });

  it('buildBackup 출력에 메타데이터가 포함된다', () => {
    const obj = JSON.parse(buildBackup(sampleState));
    expect(obj._type).toBe('belt-inspection-backup');
    expect(obj._version).toBe(1);
    expect(obj.state.records).toHaveLength(1);
  });

  it('state 래퍼 없는 평면 객체도 복원한다', () => {
    const restored = parseBackup(JSON.stringify(sampleState));
    expect(restored.groups).toEqual(sampleState.groups);
  });

  it('잘못된 JSON은 오류', () => {
    expect(() => parseBackup('{not json')).toThrow();
  });

  it('groups 없는 백업은 오류', () => {
    expect(() => parseBackup(JSON.stringify({ records: [] }))).toThrow();
  });

  it('records 배열이 아니면 오류', () => {
    expect(() => parseBackup(JSON.stringify({ groups: {}, records: {} }))).toThrow();
  });

  it('누락된 선택 필드는 기본값으로 채운다', () => {
    const restored = parseBackup(JSON.stringify({ groups: { A: [] }, records: [] }));
    expect(restored.inspectors).toEqual([]);
    expect(restored.beltConfigs).toEqual({});
    expect(restored.schedules).toEqual({});
  });
});
