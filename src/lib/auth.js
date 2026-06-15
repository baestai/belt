// 관리자 비밀번호 + 점검자 관리 순수 로직

export const DEFAULT_ADMIN_PW = 'tkatjsxks**';

export function checkPassword(input, current = DEFAULT_ADMIN_PW) {
  return String(input) === String(current);
}

export function defaultInspectors() {
  return [
    '강요섭', '고영철', '공윤식', '곽환', '김세준', '김영진', '김완주', '김용호',
    '김주홍', '김지후', '김철근', '문수완', '백정동', '백종호', '서창환', '유승환',
    '윤경배', '윤광민', '이경운', '이동철', '이범화', '이종술', '이휘민', '임채관',
    '정균태', '정영균', '정희창', '조민수', '조재권', '최준민', '최충환', '한준수',
    '홍진형',
  ];
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
