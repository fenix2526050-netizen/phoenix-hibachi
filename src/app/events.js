import { canDownloadPdf } from '../services/authService.js';
import { toast } from '../ui/toast.js';

let eventsBound = false;

export function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.addEventListener('click', async (event) => {
    const pdfBtn = event.target.closest?.('[data-phoenix-download-pdf]');
    if (!pdfBtn) return;

    if (!canDownloadPdf()) {
      event.preventDefault();
      toast('You do not have permission to download this PDF.', 'error');
      return;
    }

    const url = pdfBtn.getAttribute('data-pdf-url') || pdfBtn.getAttribute('href') || '';
    if (!url || url === '#') {
      event.preventDefault();
      toast('No PDF is available for this order yet.', 'info');
    }
  }, true);
}
