import { describe, it, expect, beforeEach } from 'vitest';
import { getDeviceInspector, setDeviceInspector, clearDeviceInspector } from './device.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('기기별 점검자 고정', () => {
  let s;
  beforeEach(() => { s = fakeStorage(); });

  it('미설정 시 빈 문자열', () => {
    expect(getDeviceInspector(s)).toBe('');
  });

  it('저장 후 유지', () => {
    setDeviceInspector('김현장', s);
    expect(getDeviceInspector(s)).toBe('김현장');
  });

  it('공백은 트림, 빈 값이면 해제', () => {
    setDeviceInspector('  이정비  ', s);
    expect(getDeviceInspector(s)).toBe('이정비');
    setDeviceInspector('', s);
    expect(getDeviceInspector(s)).toBe('');
  });

  it('clear로 해제', () => {
    setDeviceInspector('박점검', s);
    clearDeviceInspector(s);
    expect(getDeviceInspector(s)).toBe('');
  });
});
