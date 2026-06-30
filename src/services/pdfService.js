export function safeOrderPdfFileName(bookingNumber = '') {
  const clean = String(bookingNumber || 'draft').replace(/[^a-z0-9_-]+/gi, '-');
  return `Phoenix-Hibachi-Order-${clean}.pdf`;
}

export function openLegacyGuestInvoice(order) {
  if (typeof window.openPrintModalForOrder === 'function') {
    window.openPrintModalForOrder(order, 'guest');
    return true;
  }
  return false;
}

export async function generatePdfBlobFromHtml() {
  throw new Error('Browser PDF generation is intentionally not wired here. Use the Supabase Edge Function for production PDF generation.');
}
