export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

export function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function normalizeBookingNumber(value = '') {
  return String(value || '').trim().toUpperCase();
}
