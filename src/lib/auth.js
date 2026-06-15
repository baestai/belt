// 관리자 비밀번호 + 점검자 관리 순수 로직

export const DEFAULT_ADMIN_PW = 'tkatjsxks**';

export function checkPassword(input, current = DEFAULT_ADMIN_PW) {
  return String(input) === String(current);
}

export function defaultInspectors() {
  return ['김현장', '이정비', '박점검'];
}

export function addInspector(list, name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('점검자 이름을 입력하세요.');
  if (list.includes(n)) throw new Error('이미 등록된 점검자입니다.');
  return [...list, n];
}

export function removeInspector(list, name) {
  return list.filter((x) => x !== name);
}
