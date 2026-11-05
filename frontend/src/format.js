// Indian-rupee formatting and lead ageing helpers.
export const inr = (v) =>
  v === null || v === undefined || v === ''
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

// Whole days since the lead date (0 if in the future / missing).
export const ageingDays = (leadDate) => {
  if (!leadDate) return null;
  const d = new Date(leadDate);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

export const isReminderDue = (reminderAt) => {
  if (!reminderAt) return false;
  return new Date(reminderAt).getTime() <= Date.now();
};
