// 측정값 추이(시계열) 추출 — 순수 함수
// 점검 기록에서 수치 항목을 날짜 오름차순 시계열로 뽑아 차트에 공급한다.

function toNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 벨트 Pulley 온도 추이: 각 점검의 모든 Pulley L/R 중 최고 온도
// 반환: [{ date, value }] (값이 있는 점검만, 날짜 오름차순)
export function beltTempSeries(records, beltName) {
  const out = [];
  for (const r of records || []) {
    if (r.belt !== beltName) continue;
    const temps = r.items?.pulley?.temps || {};
    let max = null;
    for (const k of Object.keys(temps)) {
      const t = temps[k] || {};
      for (const side of ['L', 'R']) {
        const n = toNum(t[side]);
        if (n != null) max = max == null ? n : Math.max(max, n);
      }
    }
    if (max != null) out.push({ date: r.date, value: max });
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// 집진기 수치 항목 추이: items[itemKey].values[field]
// 반환: [{ date, value }] (값이 있는 점검만, 날짜 오름차순)
export function collectorFieldSeries(records, collectorName, itemKey, field) {
  const out = [];
  for (const r of records || []) {
    if (r.collector !== collectorName) continue;
    const n = toNum(r.items?.[itemKey]?.values?.[field]);
    if (n != null) out.push({ date: r.date, value: n });
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
