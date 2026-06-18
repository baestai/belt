import { INSPECTION_ITEMS, normalizeTemp } from '../lib/inspectionItems.js';
import { aggregateStatus, statusLabel } from '../lib/belts.js';

const KO = { ok: '양호', bad: '불량', warn: '주의' };

// 한 항목의 점검 결과를 사람이 읽는 문자열로
export function itemText(def, it) {
  if (!it) return '-';
  if (def.type === 'subs' || def.type === 'pulley') {
    const subs = it.subs || {};
    const keys = Object.keys(subs);
    if (keys.length === 0) return '해당 없음';
    return keys
      .map((k) => {
        const st = subs[k] === 'ok' ? '양호' : '불량';
        let temp = '';
        if (def.type === 'pulley' && it.temps && it.temps[k]) {
          const t = normalizeTemp(it.temps[k]);
          const parts = [];
          if (t.L !== '' && t.L != null) parts.push(`L ${t.L}`);
          if (t.R !== '' && t.R != null) parts.push(`R ${t.R}`);
          if (parts.length) temp = ` ${parts.join('/')}℃`;
        }
        return `${k}: ${st}${temp}`;
      })
      .join(', ');
  }
  if (def.type === 'num') {
    const parts = (def.fields || []).map((f) => `${f.label} ${(it.values && it.values[f.key]) || '-'}${f.unit}`);
    return `${KO[it.status] || '-'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
  }
  return KO[it.status] || '-';
}

// 점검 기록을 인쇄용(PDF) 점검표로 렌더. window.print()로 출력/저장.
export default function PrintableRecord({ record }) {
  if (!record) return null;
  const overall = statusLabel(aggregateStatus(record));
  return (
    <div className="print-area">
      <div className="pr-sheet">
        <h1>벨트컨베이어 점검표</h1>
        <div className="pr-meta">
          <span><b>벨트</b> {record.belt}</span>
          <span><b>구분</b> {record.group}</span>
          <span><b>점검일</b> {record.date}</span>
          <span><b>점검자</b> {record.inspector}</span>
          <span><b>종합</b> {overall}</span>
        </div>
        <table className="pr-table">
          <thead>
            <tr><th style={{ width: 40 }}>No</th><th style={{ width: 160 }}>점검 항목</th><th>점검 결과</th><th style={{ width: 180 }}>메모</th></tr>
          </thead>
          <tbody>
            {INSPECTION_ITEMS.map((def) => {
              const it = record.items?.[def.key];
              const txt = itemText(def, it);
              const bad = /불량/.test(txt);
              return (
                <tr key={def.key}>
                  <td>{def.no}</td>
                  <td>{def.title}</td>
                  <td className={bad ? 'pr-bad' : undefined}>{txt}</td>
                  <td>{it?.memo || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
