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

describe('App 통합 렌더', () => {
  beforeEach(() => {
    clearState();
  });

  it('점검모드가 기본 화면으로 열린다', () => {
    render(<App />);
    expect(screen.getAllByText('3선탄 벨트컨베이어 주기점검').length).toBeGreaterThan(0);
    expect(screen.getByText(/점검 예정/)).toBeInTheDocument();
  });

  it('점검모드에도 검색·구역칩·상태 통계가 보인다', () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/벨트명 검색/)).toBeInTheDocument();
    expect(screen.getByText('미점검')).toBeInTheDocument();
    expect(screen.getByText(/전체/)).toBeInTheDocument();
  });

  it('관리모드 탭을 누르면 목록이 렌더된다', () => {
    render(<App />);
    openAdmin();
    expect(screen.getByText('3선탄 벨트컨베이어 주기점검')).toBeInTheDocument();
    expect(screen.getByText('S-101')).toBeInTheDocument();
  });

  it('점검모드 탭으로 전환하면 캘린더가 보인다', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('점검모드'));
    expect(screen.getAllByText('3선탄 벨트컨베이어 주기점검').length).toBeGreaterThan(0);
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
    expect(screen.getByText(/RSC/)).toBeInTheDocument();
  });

  it('점검 폼 저장 후 상태가 반영된다', () => {
    render(<App />);
    openAdmin();
    fireEvent.click(screen.getByText('S-101'));
    fireEvent.click(screen.getByText('📋 이 벨트 점검하기'));
    // 낙광 상태 불량 선택
    const items = document.querySelectorAll('.insp-item');
    const firstItem = items[0];
    fireEvent.click(within(firstItem).getByText('불량'));
    fireEvent.click(screen.getByText('✅ 점검 완료 저장'));
    // 저장 후 캘린더로 이동
    expect(screen.getAllByText('3선탄 벨트컨베이어 주기점검').length).toBeGreaterThan(0);
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
    expect(screen.getByText(/월간 점검 보고서/)).toBeInTheDocument();
  });
});
