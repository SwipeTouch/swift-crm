import { Empty, Typography, theme } from 'antd';

const { Text } = Typography;

function point(cx, cy, r, angle) {
  const a = ((angle - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function donutSlice(cx, cy, outer, inner, start, end) {
  const large = end - start > 180 ? 1 : 0;
  const [x0, y0] = point(cx, cy, outer, start);
  const [x1, y1] = point(cx, cy, outer, end);
  const [x2, y2] = point(cx, cy, inner, end);
  const [x3, y3] = point(cx, cy, inner, start);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`;
}

// Donut of named slices. `center` sits in the hole.
export function DonutChart({ slices, center, caption, size = 168 }) {
  const { token } = theme.useToken();
  const parts = (slices || []).filter((s) => s.value > 0);
  const total = parts.reduce((sum, s) => sum + s.value, 0);
  if (!total) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />;
  }
  const cx = size / 2;
  const outer = size / 2 - 2;
  const inner = outer * 0.64;
  const gap = parts.length > 1 ? 1.4 : 0;
  let cursor = 0;
  const paths = parts.map((s) => {
    const sweep = (s.value / total) * 360;
    const start = cursor + gap / 2;
    const end = cursor + sweep - gap / 2;
    cursor += sweep;
    if (sweep >= 359.9) {
      return { ...s, full: true };
    }
    return { ...s, d: donutSlice(cx, cx, outer, inner, start, Math.max(start + 0.2, end)) };
  });

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={caption || 'Chart'}>
          {paths.map((s) => (s.full ? (
            <circle key={s.label} cx={cx} cy={cx} r={(outer + inner) / 2} fill="none" stroke={s.color} strokeWidth={outer - inner} />
          ) : (
            <path key={s.label} d={s.d} fill={s.color} />
          )))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 28 }}>
          <div style={{ fontWeight: 650, fontSize: 18, lineHeight: 1.15, color: token.colorText }}>{center}</div>
          {caption && <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>{caption}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
        {parts.map((s) => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <span>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />
              {s.label}
            </span>
            <Text type="secondary">{s.display || s.value}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

// Horizontal bars. A dark tick marks the target when one is set.
export function MeterList({ items, empty = 'No data' }) {
  const { token } = theme.useToken();
  const rows = items || [];
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
  const max = Math.max(1, ...rows.map((it) => Math.max(it.value || 0, it.target || 0)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 280, overflowY: 'auto' }}>
      {rows.map((it) => (
        <div key={it.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            <span style={{ flex: '0 0 auto' }}>{it.display}</span>
          </div>
          {it.hint && <Text type="secondary" style={{ fontSize: 12 }}>{it.hint}</Text>}
          <div style={{ position: 'relative', height: 8, borderRadius: 4, background: token.colorFillSecondary, marginTop: 4 }}>
            <div style={{ width: `${Math.min(100, ((it.value || 0) / max) * 100)}%`, height: '100%', borderRadius: 4, background: it.color || token.colorPrimary }} />
            {it.target > 0 && (
              <div style={{ position: 'absolute', left: `calc(${Math.min(100, (it.target / max) * 100)}% - 1px)`, top: -3, bottom: -3, width: 2, background: token.colorText }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
