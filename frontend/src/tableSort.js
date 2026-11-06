export function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true });
}

export function compareNumber(a, b) {
  const n = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const av = n(a);
  const bv = n(b);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return av - bv;
}

export const sequenceColumn = {
  title: '#',
  key: 'seq',
  width: 64,
  align: 'right',
  render: (_v, _r, index) => index + 1,
};
