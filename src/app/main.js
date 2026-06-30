import { PHOENIX_APP_VERSION } from '../config/appConfig.js';
import { bindEvents } from './events.js';
import * as bookings from '../services/bookingService.js';
import * as pdf from '../services/pdfService.js';
import * as email from '../services/emailService.js';
import * as storage from '../services/storageService.js';
import * as auth from '../services/authService.js';

export function initPhoenixApp() {
  if (window.__PHOENIX_APP_READY__) return;
  window.__PHOENIX_APP_READY__ = true;
  window.PhoenixApp = Object.freeze({
    version: PHOENIX_APP_VERSION,
    services: { bookings, pdf, email, storage, auth },
  });
  bindEvents();
  console.info(`[Phoenix Hibachi] ${PHOENIX_APP_VERSION} loaded`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhoenixApp, { once: true });
} else {
  initPhoenixApp();
}
