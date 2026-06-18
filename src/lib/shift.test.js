import { describe, it, expect } from 'vitest';
import {
  SHIFT_GROUPS,
  defaultShiftGroups,
  cyclePosition,
  shiftOfGroup,
  shiftsOnDate,
  eligibleShift,
  eligibleSubstitutes,
  groupOfPerson,
  createSubstitution,
  isSlotFull,
  claimSubstitution,
  cancelSubstitution,
  unclaimSubstitution,
  settlementPeriod,
  inPeriod,
  substituteCounts,
  hasPin,
  verifyPin,
  setPin,
} from './shift.js';

describe('교대 근무표 — 기준 사실 검증', () => {
  it('2026-06-18: A=주간, B=휴무, C=휴무, D=야간', () => {
    expect(shiftsOnDate('2026-06-18')).toEqual({
      A: 'day', B: 'off', C: 'off', D: 'night',
    });
  });

  it('2026-06-19: 6/18과 동일 (각 조 2일차)', () => {
    expect(shiftsOnDate('2026-06-19')).toEqual({
      A: 'day', B: 'off', C: 'off', D: 'night',
    });
  });

  it('2026-06-20: A=휴무, B=주간, C=야간, D=휴무', () => {
    expect(shiftsOnDate('2026-06-20')).toEqual({
      A: 'off', B: 'day', C: 'night', D: 'off',
    });
  });

  it('2026-06-21: 6/20과 동일', () => {
    expect(shiftsOnDate('2026-06-21')).toEqual({
      A: 'off', B: 'day', C: 'night', D: 'off',
    });
  });

  it('8일 후 주기가 반복된다', () => {
    expect(shiftsOnDate('2026-06-26')).toEqual(shiftsOnDate('2026-06-18'));
  });
});

describe('cyclePosition / shiftOfGroup', () => {
  it('A조 6/18은 주간 1일차(위치 0)', () => {
    expect(cyclePosition('A', '2026-06-18')).toBe(0);
    expect(shiftOfGroup('A', '2026-06-18')).toBe('day');
  });

  it('알 수 없는 조는 null', () => {
    expect(cyclePosition('Z', '2026-06-18')).toBe(null);
    expect(shiftOfGroup('Z', '2026-06-18')).toBe(null);
  });

  it('기준일 이전 날짜도 음수 모듈러 처리', () => {
    expect(cyclePosition('A', '2026-06-10')).toBeGreaterThanOrEqual(0);
    expect(cyclePosition('A', '2026-06-10')).toBeLessThan(8);
  });
});

describe('대근 가능 판정 (eligibleShift)', () => {
  // 주간 2일(0,1) 근무 → 다음날(2, 첫 휴무) 주간 대근, 다다음날(3, 둘째 휴무) 야간 대근
  // 야간 2일(4,5) 근무 → 다음날(6, 첫 휴무) 야간 대근, 다다음날(7, 둘째 휴무) 주간 대근
  it('위치 2,7 → 주간 대근 가능', () => {
    expect(eligibleShift('C', '2026-06-18')).toBe('day'); // C 위치 2
  });

  it('위치 3,6 → 야간 대근 가능', () => {
    // B는 6/18 위치 6
    expect(eligibleShift('B', '2026-06-18')).toBe('night');
  });

  it('근무일(주간/야간 중)에는 대근 불가(null)', () => {
    expect(eligibleShift('A', '2026-06-18')).toBe(null); // A 주간 근무중
    expect(eligibleShift('D', '2026-06-18')).toBe(null); // D 야간 근무중
  });
});

describe('eligibleSubstitutes / groupOfPerson', () => {
  const groups = defaultShiftGroups();

  it('특정일 주간 대근 가능자 = 위치 2 또는 7 조의 인원', () => {
    const subs = eligibleSubstitutes(groups, '2026-06-18', 'day');
    const names = subs.map((s) => s.name);
    // C조(위치2)와 D? D는 야간근무중. 위치7인 조 확인
    expect(subs.every((s) => eligibleShift(s.group, '2026-06-18') === 'day')).toBe(true);
    expect(names).toContain('김영진'); // C조 멤버
  });

  it('exclude 목록은 제외된다', () => {
    const subs = eligibleSubstitutes(groups, '2026-06-18', 'day', ['김영진']);
    expect(subs.map((s) => s.name)).not.toContain('김영진');
  });

  it('groupOfPerson은 소속 조를 찾는다', () => {
    expect(groupOfPerson(groups, '백종호')).toBe('A');
    expect(groupOfPerson(groups, '없는사람')).toBe(null);
  });
});

describe('대근 신청/확정 (불변 연산)', () => {
  const groups = defaultShiftGroups();

  it('근무일에 신청하면 shift가 자동 산출되고 status=open', () => {
    const list = createSubstitution([], {
      date: '2026-06-18', group: 'A', requester: '백종호', reason: '휴가',
    });
    expect(list.length).toBe(1);
    expect(list[0].shift).toBe('day');
    expect(list[0].status).toBe('open');
    expect(list[0].substitute).toBe(null);
  });

  it('같은 날 같은 시간대 대근 신청은 최대 3명', () => {
    // 6/18 A조 주간 근무: 7명 → 4명째 신청 시 에러
    let list = [];
    const names = ['백종호', '고영철', '이경운', '김주홍'];
    for (let i = 0; i < 3; i++) {
      list = createSubstitution(list, {
        date: '2026-06-18', group: 'A', requester: names[i], reason: '휴가',
      });
    }
    expect(list.length).toBe(3);
    expect(() => createSubstitution(list, {
      date: '2026-06-18', group: 'A', requester: names[3], reason: '휴가',
    })).toThrow(/최대 3/);
  });

  it('isSlotFull: 정원 도달 여부 / force로 초과 신청 가능', () => {
    let list = [];
    const names = ['백종호', '고영철', '이경운', '김주홍'];
    for (let i = 0; i < 3; i++) {
      list = createSubstitution(list, { date: '2026-06-18', group: 'A', requester: names[i], reason: '휴가' });
    }
    expect(isSlotFull(list, '2026-06-18', 'day')).toBe(true);
    // force 없이는 에러, force=true면 통과
    expect(() => createSubstitution(list, { date: '2026-06-18', group: 'A', requester: names[3], reason: '휴가' })).toThrow();
    const forced = createSubstitution(list, { date: '2026-06-18', group: 'A', requester: names[3], reason: '휴가' }, { force: true });
    expect(forced.length).toBe(4);
  });

  it('동일인이 같은 날 같은 시간대 중복 신청하면 에러', () => {
    let list = createSubstitution([], {
      date: '2026-06-18', group: 'A', requester: '백종호', reason: '휴가',
    });
    expect(() => createSubstitution(list, {
      date: '2026-06-18', group: 'A', requester: '백종호', reason: '교육',
    })).toThrow();
  });

  it('휴무일에 신청하면 에러', () => {
    expect(() => createSubstitution([], {
      date: '2026-06-18', group: 'B', requester: '김세준', reason: 'x',
    })).toThrow();
  });

  it('대근 가능자가 확정하면 status=filled', () => {
    let list = createSubstitution([], {
      date: '2026-06-18', group: 'A', requester: '백종호', reason: '휴가',
    });
    const id = list[0].id;
    // 6/18 주간 대근 가능자(위치2) 김영진(C)
    list = claimSubstitution(list, id, '김영진', groups);
    expect(list[0].status).toBe('filled');
    expect(list[0].substitute).toBe('김영진');
  });

  it('대근 불가능자가 확정하면 에러', () => {
    let list = createSubstitution([], {
      date: '2026-06-18', group: 'A', requester: '백종호', reason: '휴가',
    });
    const id = list[0].id;
    // D조는 야간 근무중 → 주간 대근 불가
    expect(() => claimSubstitution(list, id, '정영균', groups)).toThrow();
  });

  it('본인은 대근할 수 없다', () => {
    let list = createSubstitution([], {
      date: '2026-06-18', group: 'A', requester: '백종호', reason: '휴가',
    });
    const id = list[0].id;
    expect(() => claimSubstitution(list, id, '백종호', groups)).toThrow();
  });

  it('취소(삭제)와 확정취소', () => {
    let list = createSubstitution([], {
      date: '2026-06-18', group: 'A', requester: '백종호', reason: '휴가',
    });
    const id = list[0].id;
    list = claimSubstitution(list, id, '김영진', groups);
    list = unclaimSubstitution(list, id);
    expect(list[0].status).toBe('open');
    expect(list[0].substitute).toBe(null);
    list = cancelSubstitution(list, id);
    expect(list.length).toBe(0);
  });
});

describe('정산 기간 / 집계', () => {
  it('16일 이후는 당월16일~다음달15일', () => {
    expect(settlementPeriod('2026-06-18')).toEqual({
      start: '2026-06-16', end: '2026-07-15',
    });
  });

  it('15일 이하는 전월16일~당월15일', () => {
    expect(settlementPeriod('2026-06-10')).toEqual({
      start: '2026-05-16', end: '2026-06-15',
    });
  });

  it('1월 초는 전년 12월16일~당월15일', () => {
    expect(settlementPeriod('2026-01-05')).toEqual({
      start: '2025-12-16', end: '2026-01-15',
    });
  });

  it('inPeriod 경계 포함', () => {
    const p = { start: '2026-06-16', end: '2026-07-15' };
    expect(inPeriod('2026-06-16', p)).toBe(true);
    expect(inPeriod('2026-07-15', p)).toBe(true);
    expect(inPeriod('2026-06-15', p)).toBe(false);
  });

  it('substituteCounts는 filled 건만 대근자별 내림차순 집계', () => {
    const period = { start: '2026-06-16', end: '2026-07-15' };
    const list = [
      { date: '2026-06-20', status: 'filled', substitute: '김영진' },
      { date: '2026-06-22', status: 'filled', substitute: '김영진' },
      { date: '2026-06-25', status: 'filled', substitute: '곽환' },
      { date: '2026-06-25', status: 'open', substitute: null },
      { date: '2026-05-01', status: 'filled', substitute: '김영진' }, // 기간 외
    ];
    expect(substituteCounts(list, period)).toEqual([
      { name: '김영진', count: 2 },
      { name: '곽환', count: 1 },
    ]);
  });
});

describe('PIN', () => {
  it('setPin은 4~6자리 숫자만 허용', () => {
    expect(() => setPin({}, '백종호', '12')).toThrow();
    expect(() => setPin({}, '백종호', 'abcd')).toThrow();
    expect(() => setPin({}, '백종호', '1234567')).toThrow(); // 7자리 초과
    expect(hasPin(setPin({}, '백종호', '1234'), '백종호')).toBe(true);
    expect(hasPin(setPin({}, '백종호', '123456'), '백종호')).toBe(true);
  });

  it('verifyPin은 일치 여부 반환', () => {
    const pins = setPin({}, '백종호', '1234');
    expect(verifyPin(pins, '백종호', '1234')).toBe(true);
    expect(verifyPin(pins, '백종호', '0000')).toBe(false);
  });
});
