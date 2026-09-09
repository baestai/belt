import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Dashboard from './Dashboard.jsx';

describe('설비 중심 홈', () => {
  it('근무현황을 제외하고 설비 종류에 맞는 점검 화면으로 이동한다', () => {
    const onGoField = vi.fn();
    render(<Dashboard today="2026-09-09" groups={{}} records={[]} schedules={{}} collectors={[]} collectorRecords={[]} onGoField={onGoField} />);
    expect(screen.queryByText(/근무현황|대근/)).not.toBeInTheDocument();
    expect(screen.getByText('아직 등록된 점검 기록이 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /집진기 점검/}));
    expect(onGoField).toHaveBeenLastCalledWith('collector');
    fireEvent.click(screen.getByRole('button', {name: /벨트 점검/}));
    expect(onGoField).toHaveBeenLastCalledWith('belt');
  });
});
