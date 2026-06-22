// 측정값 추이 라인 차트 (순수 SVG, 외부 라이브러리 없음)
// series: [{ date:'YYYY-MM-DD', value:number }] (오름차순), unit, color
export default function TrendChart({ series = [], unit = '', color = 'var(--accent)', height = 120 }) {
  if (!series || series.length === 0) {
    return <div className="note" style={{ padding: '14px 0' }}>표시할 측정값이 없습니다.</div>;
  }
  if (series.length === 1) {
    const p = series[0];
    return (
      <div className="trend-single">
        <b>{p.value}{unit}</b> <span style={{ color: 'var(--muted)' }}>({p.date}) · 점검 1회 — 추이는 2회 이상부터</span>
      </div>
    );
  }

  const W = 320;
  const H = height;
  const padL = 34, padR = 10, padT = 12, padB = 22;
  const vals = series.map((s) => s.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i) => padL + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const pts = series.map((s, i) => `${x(i)},${y(s.value)}`).join(' ');
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = last.value - prev.value;

  // y축 눈금 3개 (min, mid, max)
  const ticks = [max, (min + max) / 2, min];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="측정값 추이">
        {ticks.map((t, i) => {
          const ty = y(t);
          return (
            <g key={i}>
              <line x1={padL} y1={ty} x2={W - padR} y2={ty} stroke="var(--line)" strokeWidth="1" />
              <text x={padL - 5} y={ty + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{Math.round(t * 10) / 10}</text>
            </g>
          );
        })}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((s, i) => (
          <circle key={i} cx={x(i)} cy={y(s.value)} r="3" fill={color} />
        ))}
        {/* x축 라벨: 처음/마지막 (MM-DD) */}
        <text x={x(0)} y={H - 6} textAnchor="start" fontSize="9" fill="var(--muted)">{series[0].date.slice(5)}</text>
        <text x={x(series.length - 1)} y={H - 6} textAnchor="end" fontSize="9" fill="var(--muted)">{last.date.slice(5)}</text>
      </svg>
      <div className="trend-foot">
        최근 <b>{last.value}{unit}</b>
        {delta !== 0 && (
          <span className={'trend-delta ' + (delta > 0 ? 'up' : 'down')}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 10) / 10)}{unit}
          </span>
        )}
        <span style={{ color: 'var(--muted)' }}> · 점검 {series.length}회</span>
      </div>
    </div>
  );
}
