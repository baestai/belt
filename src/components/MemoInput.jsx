import { useEffect, useRef, useState } from 'react';

function SpeechCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// 메모 입력기: 빠른 메모 칩 + 음성 인식(한국어) + 직접 입력
// quickMemos: 관리모드에서 설정한 빠른 메모 목록 (없으면 칩 미표시)
export default function MemoInput({ value, onChange, placeholder, quickMemos = [] }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const supported = !!SpeechCtor();

  useEffect(() => {
    return () => {
      try { recRef.current?.stop(); } catch { /* noop */ }
    };
  }, []);

  const append = (text) => {
    const t = String(text || '').trim();
    if (!t) return;
    onChange(value ? `${value} ${t}` : t);
  };

  const toggleVoice = () => {
    if (listening) {
      try { recRef.current?.stop(); } catch { /* noop */ }
      return;
    }
    const SR = SpeechCtor();
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      append(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  return (
    <div className="memo-wrap">
      {(quickMemos.length > 0 || supported) && (
        <div className="quick-memos">
          {quickMemos.map((q) => (
            <button type="button" key={q} className="qm" onClick={() => append(q)}>{q}</button>
          ))}
          {supported && (
            <button
              type="button"
              className={'qm voice' + (listening ? ' on' : '')}
              onClick={toggleVoice}
              aria-label="음성으로 메모 입력"
            >
              {listening ? '🔴 듣는 중…' : '🎤 음성'}
            </button>
          )}
        </div>
      )}
      <textarea
        className="memo"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
