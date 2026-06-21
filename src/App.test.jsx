import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from './App.jsx';
import { clearState } from './data/store.js';

// 기본 화면이 점검모드(캘린더)이므로, 관리목록을 보려면 관리모드 탭을 눌러 진입한다.
// 관리모드는 비밀번호 게이트가 있어 prompt를 올바른 비밀번호로 응답한다.
function openAdmin() {
  window.prompt = () => 'tkatjsxks**';
  fireEvent.click(screen.getByText('관리모드'));
}

// 기본 화면이 홈 대시보드이므로, 점검모드(캘린더)를 보려면 탭으로 진입한다.
function openField() {
  fireEvent.click(screen.getByText('점검모드'));
}

describe('App 통합 렌더', () => {
  beforeEach(() => {
    clearState();
  });

  it('홈 대시보드가 기본 화면으로 열린다', () => {
    render(<App />);
    expect(screen.getAllByText('3선탄 통합관리').length).toBeGreaterThan(0);
    expect(screen.getByText('금일 점검현황')).toBeInTheDocument();
  });

  it('점검모드에 검색창과 상태 통계가 보인다 (구역 칩 없음)', () => {
    render(<App />);
    openField();
    expect(screen.getByPlaceholderText(/벨트명 검색/)).toBeInTheDocument();
    expect(screen.getByText('미점검')).toBeInTheDocument();
  });

  it('점검모드 상태 통계 클릭 시 해당 상태 벨트 목록이 표시된다', () => {
    render(<App />);
    openField();
    fireEvent.click(screen.getByText('미점검'));
    expect(screen.getByText(/미점검 벨트/)).toBeInTheDocument();
    // 시드 데이터의 미점검 벨트가 목록에 나타난다
    expect(screen.getAllByText('S-101').length).toBeGreaterThan(0);
  });

  it('점검모드: 점검결과 없는 벨트 검색 후 Enter 시 점검 입력화면으로 이동', () => {
    render(<App />);
    openField();
    const box = screen.getByPlaceholderText(/벨트명 검색/);
    fireEvent.change(box, { target: { value: 'S-101' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    // 점검 입력 폼으로 이동 (점검 완료 저장 버튼)
    expect(screen.getByText('✅ 점검 완료 저장')).toBeInTheDocument();
  });

  it('점검모드: 점검결과 있는 벨트 검색 후 Enter 시 최근 결과(상세)로 이동', () => {
    render(<App />);
    // 먼저 S-101 점검을 한 건 저장 (관리모드 → 상세 → 점검 → 저장)
    openAdmin();
    fireEvent.click(screen.getByText('S-101'));
    fireEvent.click(screen.getByText('📋 이 벨트 점검하기'));
    fireEvent.click(screen.getByText('✅ 점검 완료 저장'));
    // 저장 후 점검모드(캘린더)로 복귀 → 검색 후 Enter
    const box = screen.getByPlaceholderText(/벨트명 검색/);
    fireEvent.change(box, { target: { value: 'S-101' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByText('벨트 상세')).toBeInTheDocument();
  });

  it('관리모드 탭을 누르면 목록이 렌더된다', () => {
    render(<App />);
    openAdmin();
    expect(screen.getByText('3선탄 통합관리')).toBeInTheDocument();
    expect(screen.getByText('S-101')).toBeInTheDocument();
  });

  it('점검모드 탭으로 전환하면 캘린더가 보인다', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('점검모드'));
    expect(screen.getAllByText('3선탄 통합관리').length).toBeGreaterThan(0);
    expect(screen.getByText(/점검 예정/)).toBeInTheDocument();
  });

  it('구역 칩으로 필터하면 해당 구역만 보인다', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('수송 21'));
    expect(screen.getByText('K-651A')).toBeInTheDocument();
    expect(screen.queryByText('S-101')).not.toBeInTheDocument();
  });

  it('벨트 추가 모달: 비밀번호 틀리면 에러', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('➕ 벨트 추가'));
    fireEvent.change(screen.getByPlaceholderText('예: S-330'), { target: { value: 'S-777' } });
    fireEvent.change(screen.getByPlaceholderText('비밀번호 입력'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('추가'));
    expect(screen.getByText(/비밀번호가 올바르지 않습니다/)).toBeInTheDocument();
  });

  it('벨트 추가 모달: 올바른 비밀번호로 추가되면 목록에 표시', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('➕ 벨트 추가'));
    fireEvent.change(screen.getByPlaceholderText('예: S-330'), { target: { value: 'S-777' } });
    fireEvent.change(screen.getByPlaceholderText('비밀번호 입력'), { target: { value: 'tkatjsxks**' } });
    fireEvent.click(screen.getByText('추가'));
    expect(screen.getByText('S-777')).toBeInTheDocument();
  });

  it('벨트 상세로 진입하고 점검 폼까지 이동', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('S-101'));
    expect(screen.getByText('벨트 상세')).toBeInTheDocument();
    fireEvent.click(screen.getByText('📋 이 벨트 점검하기'));
    expect(screen.getByText(/Pulley/)).toBeInTheDocument();
  });

  it('점검 폼 저장 후 상태가 반영된다', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('S-101'));
    fireEvent.click(screen.getByText('📋 이 벨트 점검하기'));
    // 첫 항목(벨트 상태) 불량 선택
    const items = document.querySelectorAll('.insp-item');
    const firstItem = items[0];
    fireEvent.click(within(firstItem).getByText('불량'));
    fireEvent.click(screen.getByText('✅ 점검 완료 저장'));
    // 저장 후 캘린더로 이동
    expect(screen.getAllByText('3선탄 통합관리').length).toBeGreaterThan(0);
  });

  it('점검자 관리 모달이 열린다', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('👷 점검자 관리'));
    expect(screen.getByText('강요섭')).toBeInTheDocument();
  });

  it('보고서 모달이 열린다', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('📄 보고서'));
    expect(screen.getByText(/점검 보고서/)).toBeInTheDocument();
  });
});
