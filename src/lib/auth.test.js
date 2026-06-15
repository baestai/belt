import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ADMIN_PW,
  checkPassword,
  defaultInspectors,
  addInspector,
  removeInspector,
} from './auth.js';

describe('관리자 비밀번호', () => {
  it('기본 비밀번호 일치', () => {
    expect(checkPassword('tkatjsxks**')).toBe(true);
    expect(checkPassword(DEFAULT_ADMIN_PW)).toBe(true);
  });

  it('불일치 시 false', () => {
    expect(checkPassword('1234')).toBe(false);
  });

  it('커스텀 비밀번호와 비교', () => {
    expect(checkPassword('abcd', 'abcd')).toBe(true);
    expect(checkPassword('0000', 'abcd')).toBe(false);
  });
});

describe('점검자 관리', () => {
  it('기본 점검자 33명, 가나다순 정렬', () => {
    const list = defaultInspectors();
    expect(list.length).toBe(33);
    expect(list[0]).toBe('강요섭');
    expect(list[list.length - 1]).toBe('홍진형');
    const sorted = [...list].sort((a, b) => a.localeCompare(b, 'ko'));
    expect(list).toEqual(sorted);
  });

  it('추가는 불변', () => {
    const list = defaultInspectors();
    const before = list.length;
    const next = addInspector(list, '정안전');
    expect(list.length).toBe(before);
    expect(next).toContain('정안전');
  });

  it('빈 이름 추가 에러', () => {
    expect(() => addInspector([], '  ')).toThrow();
  });

  it('중복 추가 에러', () => {
    expect(() => addInspector(['김현장'], '김현장')).toThrow(/이미 등록/);
  });

  it('삭제', () => {
    expect(removeInspector(['김현장', '이정비'], '김현장')).toEqual(['이정비']);
  });
});
