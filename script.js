window.PHX_BUILD_VERSION = 'V120_HOTFIX_SAFE_ROLLBACK_TO_V119';

/* ======================================================================
   V78 TOP-LAYER DIALOG DELETE FIX + NO LOGIN SUCCESS POPUP
   Reason:
   The dashboard uses <dialog>. Div-based confirmations can sit behind the
   browser top-layer dialog, so the click feels like nothing happened.
   This patch uses a real <dialog> for delete confirmation and catches delete
   clicks at window capture level before older handlers can swallow them.
   ====================================================================== */
(function initPHXV78(){
  if (window.__PHX_V78_INSTALLED__) return;
  window.__PHX_V78_INSTALLED__ = true;

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, s => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[s]));
  }

  function toast(message, type='success', timeout=3600){
    let stack = document.getElementById('phxV78ToastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'phxV78ToastStack';
      stack.className = 'phx-v78-toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `phx-v78-toast ${type}`;
    el.innerHTML = `<span>${esc(message)}</span><button type="button" aria-label="Close">×</button>`;
    el.querySelector('button')?.addEventListener('click', () => el.remove());
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 220);
    }, timeout);
  }

  function ensureConfirmDialog(){
    let dialog = document.getElementById('phxV78ConfirmDialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'phxV78ConfirmDialog';
    dialog.className = 'phx-v78-confirm-dialog';
    dialog.innerHTML = `
      <div class="phx-v78-confirm-card">
        <button type="button" class="phx-v78-x" data-v78-cancel aria-label="Close">×</button>
        <p class="phx-v78-eyebrow">Confirm action</p>
        <h3 data-v78-title>Confirm</h3>
        <p data-v78-message>Continue?</p>
        <div class="phx-v78-actions">
          <button type="button" class="phx-v78-cancel" data-v78-cancel>Cancel</button>
          <button type="button" class="phx-v78-danger" data-v78-ok>Yes, continue</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function confirmDialog({title='Confirm', message='Continue?', okText='Yes, continue', cancelText='Cancel'} = {}){
    const dialog = ensureConfirmDialog();
    dialog.querySelector('[data-v78-title]').textContent = title;
    dialog.querySelector('[data-v78-message]').textContent = message;
    dialog.querySelector('[data-v78-ok]').textContent = okText;
    dialog.querySelector('.phx-v78-cancel[data-v78-cancel]').textContent = cancelText;
    const topCloseV80 = dialog.querySelector('.phx-v78-x[data-v78-cancel]');
    if (topCloseV80) topCloseV80.textContent = '×';

    return new Promise(resolve => {
      let finished = false;
      const done = (value) => {
        if (finished) return;
        finished = true;
        dialog.removeEventListener('click', onClick, true);
        dialog.removeEventListener('cancel', onCancel, true);
        try { dialog.close(); } catch {}
        resolve(value);
      };
      const onClick = (event) => {
        if (event.target.closest('[data-v78-ok]')) done(true);
        else if (event.target.closest('[data-v78-cancel]')) done(false);
      };
      const onCancel = (event) => {
        event.preventDefault();
        done(false);
      };

      dialog.addEventListener('click', onClick, true);
      dialog.addEventListener('cancel', onCancel, true);

      try {
        if (!dialog.open) dialog.showModal();
      } catch (error) {
        console.warn('V78 dialog showModal failed, using native confirm fallback:', error);
        done(window.confirm(message));
        return;
      }
      setTimeout(() => dialog.querySelector('[data-v78-cancel]')?.focus(), 20);
    });
  }

  function getOrderId(btn){
    const direct = btn?.dataset?.deleteOrder || btn?.getAttribute?.('data-delete-order');
    const directClean = String(direct || '').match(/PHX-\d{6}-[A-Z0-9]{4}/i)?.[0] || '';
    if (directClean) return directClean;
    const text = btn?.closest?.('.order-card,.dispatch-card,article,section')?.textContent || '';
    return text.match(/PHX-\d{6}-[A-Z0-9]{4}/i)?.[0] || '';
  }

  function getPersonId(btn){
    return btn?.dataset?.personDelete || btn?.getAttribute?.('data-person-delete') || '';
  }

  function deletedSet(key){
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]').map(String)); }
    catch { return new Set(); }
  }

  function addDeleted(key, id){
    if (!id) return;
    const set = deletedSet(key);
    set.add(String(id));
    localStorage.setItem(key, JSON.stringify([...set]));
  }

  function markOrderDeleted(id){
    ['phoenix_deleted_orders_v70','phoenix_deleted_orders_v71','phoenix_deleted_orders_v72','phoenix_deleted_orders_v73','phoenix_deleted_orders_v75','phoenix_deleted_orders_v78'].forEach(k => addDeleted(k, id));
  }

  function markPersonDeleted(id){
    ['phoenix_deleted_dashboard_records_v69','phoenix_deleted_dashboard_records_v73','phoenix_deleted_dashboard_records_v75','phoenix_deleted_dashboard_records_v78'].forEach(k => addDeleted(k, id));
  }

  function hideCard(btn){
    const card = btn?.closest?.('.order-card,.dispatch-card,.customer-row,.application-card,article');
    if (!card) return;
    card.classList.add('phx-v78-removing');
    setTimeout(() => card.remove(), 220);
  }

  async function softDeleteOrder(orderId){
    try {
      const client = typeof initSupabaseClient === 'function' ? initSupabaseClient() : null;
      const session = typeof supabaseSession !== 'undefined' ? supabaseSession : null;
      if (!client || !session) return false;
      const { error } = await client.from('bookings').update({ status:'deleted' }).eq('booking_number', String(orderId));
      if (error) {
        console.warn('V78 Supabase order delete failed:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.warn('V78 Supabase order delete threw:', error);
      return false;
    }
  }

  async function softDeletePerson(id){
    try {
      const client = typeof initSupabaseClient === 'function' ? initSupabaseClient() : null;
      const session = typeof supabaseSession !== 'undefined' ? supabaseSession : null;
      if (!client || !session) return false;
      const { error } = await client.from('chef_applications').update({ status:'deleted', account_status:'deleted' }).eq('id', String(id));
      if (error) {
        console.warn('V78 Supabase person/application delete failed:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.warn('V78 Supabase person/application delete threw:', error);
      return false;
    }
  }

  let running = false;

  async function deleteOrder(btn){
    if (running) return false;
    running = true;
    try {
      const orderId = getOrderId(btn);
      if (!orderId) {
        toast('找不到订单号，请刷新后再试。', 'info', 4600);
        return false;
      }

      const ok = await confirmDialog({
        title: 'Delete this order?',
        message: `确定删除订单 ${orderId} 吗？确认后后台会隐藏；如果连接 Supabase，会标记为 deleted。`,
        okText: 'Yes, delete order',
        cancelText: 'Cancel'
      });
      if (!ok) return false;

      btn && (btn.disabled = true);
      markOrderDeleted(orderId);

      try { saveStoredOrders(getStoredOrders().filter(o => String(o.id) !== String(orderId))); } catch {}
      try { if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.filter(o => String(o.id) !== String(orderId)); } catch {}

      hideCard(btn);
      const remoteOk = await softDeleteOrder(orderId);

      try { renderDashboard(currentDashboardRole || 'Admin'); } catch {}
      try { if (!calendarSummaryPanel?.hidden) renderCalendarSummary(); } catch {}

      toast(remoteOk ? `订单 ${orderId} 已删除并同步 Supabase。` : `订单 ${orderId} 已从后台隐藏。`, 'success', 4200);
      return false;
    } finally {
      setTimeout(() => { running = false; }, 450);
    }
  }

  async function deletePerson(btn){
    if (running) return false;
    running = true;
    try {
      const id = getPersonId(btn);
      if (!id) {
        toast('找不到记录 ID，请刷新后再试。', 'info', 4600);
        return false;
      }

      const ok = await confirmDialog({
        title: 'Delete this record?',
        message: '确定删除这条人员/申请记录吗？确认后后台会隐藏；真实 Supabase Auth 登录账号仍需在 Supabase Authentication 处理。',
        okText: 'Yes, delete record',
        cancelText: 'Cancel'
      });
      if (!ok) return false;

      btn && (btn.disabled = true);
      markPersonDeleted(id);

      try { savePeopleRecords(getPeopleRecords().filter(p => String(p.id) !== String(id))); } catch {}
      try { saveStoredChefApplications(getStoredChefApplications().filter(p => String(p.id) !== String(id))); } catch {}
      try { saveMembershipApplications(getMembershipApplications().filter(p => String(p.id) !== String(id))); } catch {}
      try { if (Array.isArray(remoteChefApplicationsCache)) remoteChefApplicationsCache = remoteChefApplicationsCache.filter(p => String(p.id) !== String(id)); } catch {}

      hideCard(btn);
      await softDeletePerson(id);
      try { renderDashboard(currentDashboardRole || 'Admin'); } catch {}

      toast('记录已从后台隐藏。', 'success', 4200);
      return false;
    } finally {
      setTimeout(() => { running = false; }, 450);
    }
  }

  window.PHX_DELETE_ORDER_V78 = function(event, btn){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    deleteOrder(btn || event?.target?.closest?.('[data-delete-order]'));
    return false;
  };

  window.PHX_DELETE_PERSON_V78 = function(event, btn){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    deletePerson(btn || event?.target?.closest?.('[data-person-delete]'));
    return false;
  };

  // Highest priority: installed at the top of script.js, before older handlers.
  window.addEventListener('click', function(event){
    const orderBtn = event.target?.closest?.('[data-delete-order]');
    const personBtn = event.target?.closest?.('[data-person-delete]');
    if (!orderBtn && !personBtn) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (orderBtn) deleteOrder(orderBtn);
    else deletePerson(personBtn);
    return false;
  }, true);

  function attachInline(){
    document.querySelectorAll('[data-delete-order]').forEach(btn => {
      btn.classList.add('phx-v78-delete-ready');
      btn.setAttribute('onclick', 'return window.PHX_DELETE_ORDER_V78(event,this)');
    });
    document.querySelectorAll('[data-person-delete]').forEach(btn => {
      btn.classList.add('phx-v78-delete-ready');
      btn.setAttribute('onclick', 'return window.PHX_DELETE_PERSON_V78(event,this)');
    });
  }

  function installFilters(){
    if (!window.__PHX_V78_FILTERS_INSTALLED__ && typeof getDashboardOrders === 'function') {
      window.__PHX_V78_FILTERS_INSTALLED__ = true;
      const prev = getDashboardOrders;
      getDashboardOrders = function(){
        const deleted = new Set([
          ...deletedSet('phoenix_deleted_orders_v70'),
          ...deletedSet('phoenix_deleted_orders_v71'),
          ...deletedSet('phoenix_deleted_orders_v72'),
          ...deletedSet('phoenix_deleted_orders_v73'),
          ...deletedSet('phoenix_deleted_orders_v75'),
          ...deletedSet('phoenix_deleted_orders_v78')
        ]);
        return (prev() || [])
          .filter(o => !deleted.has(String(o.id || o.booking_number || o.dbId || '')))
          .filter(o => !['deleted','removed'].includes(String(o.status || '').toLowerCase()));
      };
    }

    if (!window.__PHX_V78_APP_FILTERS_INSTALLED__ && typeof getDashboardApplications === 'function') {
      window.__PHX_V78_APP_FILTERS_INSTALLED__ = true;
      const prevApps = getDashboardApplications;
      getDashboardApplications = function(){
        const deleted = new Set([
          ...deletedSet('phoenix_deleted_dashboard_records_v69'),
          ...deletedSet('phoenix_deleted_dashboard_records_v73'),
          ...deletedSet('phoenix_deleted_dashboard_records_v75'),
          ...deletedSet('phoenix_deleted_dashboard_records_v78')
        ]);
        return (prevApps() || [])
          .filter(o => !deleted.has(String(o.id || '')))
          .filter(o => !['deleted','removed'].includes(String(o.status || o.accountStatus || o.account_status || '').toLowerCase()));
      };
    }

    if (!window.__PHX_V78_RENDER_WRAPPED__ && typeof renderDashboard === 'function') {
      window.__PHX_V78_RENDER_WRAPPED__ = true;
      const prevRender = renderDashboard;
      renderDashboard = function(role = currentDashboardRole || 'Admin'){
        const out = prevRender(role);
        setTimeout(attachInline, 0);
        setTimeout(attachInline, 250);
        return out;
      };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    installFilters();
    attachInline();
  });
  setTimeout(() => { installFilters(); attachInline(); }, 0);
  setTimeout(() => { installFilters(); attachInline(); }, 500);
  setInterval(attachInline, 1200);
})();


window.PHX_BUILD_VERSION = 'V77_PRODUCTION_CLEAN';





const header = document.getElementById('header');
const menuBtn = document.getElementById('menuBtn');
const mobileNav = document.getElementById('mobileNav');
const bookingModal = document.getElementById('bookingModal');
const loginModal = document.getElementById('loginModal');
const contactModal = document.getElementById('contactModal');
const modalPackage = document.getElementById('modalPackage');


// Supabase real backend connection (v16)
// Public/publishable key is safe in browser only when RLS policies are enabled.
const SUPABASE_URL = 'https://bylcjsycyzbyuvpddpmd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5xTLwD9wumDdL1D3WGGnGw_GMJIvrqw';
let supabaseClient = null;
let supabaseSession = null;
let supabaseProfile = null;
let remoteOrdersCache = null;
let remoteChefApplicationsCache = null;
const PORTAL_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const PORTAL_SESSION_META_KEY = 'phoenixPortalSessionMetaV1';
const PORTAL_TAB_KEY = 'phoenixPortalPreferredTabV1';

function initSupabaseClient() {
  try {
    if (window.supabase && !supabaseClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    }
  } catch (error) {
    console.warn('Supabase client init failed:', error);
  }
  return supabaseClient;
}
initSupabaseClient();


function isPortalRoute() {
  return window.location.hash === '#portal' || new URLSearchParams(window.location.search).get('portal') === '1';
}
function cleanIndexUrl() {
  // v52: Always return the actual index.html file, never a folder URL.
  // This fixes local ZIP previews that previously jumped to the Temp/360zip directory listing.
  try {
    const current = new URL(window.location.href);
    current.hash = '';
    current.search = '';
    let path = current.pathname || '';
    if (/index\.html$/i.test(path)) {
      return current.href;
    }
    if (/\.[a-z0-9]+$/i.test(path)) {
      path = path.replace(/[^/]+$/, 'index.html');
    } else {
      path = path.replace(/\/?$/, '/index.html');
    }
    current.pathname = path;
    return current.href;
  } catch {
    return './index.html';
  }
}
function portalBaseUrl() {
  return cleanIndexUrl() + '#portal';
}
function openPortalInNewTab(tab = '') {
  if (tab) { try { localStorage.setItem(PORTAL_TAB_KEY, tab); } catch {} }
  const url = portalBaseUrl();
  // Do not use noopener here; portal tabs opened by script can then close themselves cleanly.
  const win = window.open(url, '_blank');
  if (!win) window.location.href = url;
}
function setPortalSessionMeta(role, email) {
  try {
    localStorage.setItem(PORTAL_SESSION_META_KEY, JSON.stringify({ role, email, loginAt: Date.now() }));
  } catch {}
  updateAccountMenuState();
}
function getPortalSessionMeta() {
  try { return JSON.parse(localStorage.getItem(PORTAL_SESSION_META_KEY) || 'null'); } catch { return null; }
}
function clearPortalSessionMeta() {
  try { localStorage.removeItem(PORTAL_SESSION_META_KEY); localStorage.removeItem(PORTAL_TAB_KEY); } catch {}
  updateAccountMenuState();
}
function isPortalSessionExpired() {
  const meta = getPortalSessionMeta();
  if (!meta?.loginAt) return false;
  return Date.now() - Number(meta.loginAt) > PORTAL_TIMEOUT_MS;
}

function updateAccountMenuState() {
  const meta = getPortalSessionMeta();
  const active = !!(meta?.email && !isPortalSessionExpired());
  const loginButtons = document.querySelectorAll('.login-entry, .mobile-login-entry');
  const account = document.getElementById('portalAccount');
  const mobileEntry = document.getElementById('mobilePortalEntry');
  const label = document.getElementById('accountLabel');
  const avatar = document.getElementById('accountAvatar');
  loginButtons.forEach(btn => {
    btn.hidden = active;
    btn.style.display = active ? 'none' : '';
    btn.setAttribute('aria-hidden', active ? 'true' : 'false');
  });
  if (account) {
    account.hidden = !active;
    account.style.display = active ? 'inline-flex' : 'none';
  }
  if (mobileEntry) {
    mobileEntry.hidden = !active;
    mobileEntry.style.display = active ? 'block' : 'none';
  }
  if (active) {
    const email = meta.email || 'Account';
    const role = meta.role || 'Portal';
    if (label) label.textContent = role === 'Admin' ? 'Admin' : role === 'Member' ? 'Member' : email.split('@')[0];
    if (avatar) avatar.textContent = role === 'Admin' ? 'A' : role === 'Chef' ? 'C' : role === 'Member' ? 'M' : '👤';
  }
}
function closeAccountDropdown() {
  const menu = document.getElementById('accountDropdown');
  const btn = document.getElementById('accountMenuBtn');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function toggleAccountDropdown() {
  const menu = document.getElementById('accountDropdown');
  const btn = document.getElementById('accountMenuBtn');
  if (!menu || !btn) return;
  const next = !menu.hidden;
  menu.hidden = next;
  btn.setAttribute('aria-expanded', String(!next));
}

async function signOutPortal(reason = '') {
  const client = initSupabaseClient();
  try { if (client) await client.auth.signOut(); } catch {}
  supabaseSession = null;
  supabaseProfile = null;
  remoteOrdersCache = null;
  remoteChefApplicationsCache = null;
  clearPortalSessionMeta();
  if (dashboardModal?.open) dashboardModal.close();
  if (isPortalRoute() && reason && typeof loginModal?.showModal === 'function' && !loginModal.open) loginModal.showModal();
  if (reason) alert(reason);
}
function closePortalTabOrReturnHome() {
  const homeUrl = cleanIndexUrl();
  document.body.classList.remove('portal-mode');
  try { if (dashboardModal?.open) dashboardModal.close(); } catch {}
  try { if (loginModal?.open) loginModal.close(); } catch {}
  try {
    if (window.opener && !window.opener.closed) {
      try { window.opener.focus(); } catch {}
      window.close();
      setTimeout(() => {
        // If browser blocks closing, force this same tab back to index.html.
        if (!document.closed && document.visibilityState !== 'hidden') window.location.href = homeUrl;
      }, 450);
      return;
    }
  } catch {}
  window.location.href = homeUrl;
}
async function signOutAndClosePortal() {
  await signOutPortal('');
  if (isPortalRoute()) closePortalTabOrReturnHome();
}

async function tryResumePortalSession() {
  const client = initSupabaseClient();
  if (!client) return false;
  if (isPortalSessionExpired()) {
    await signOutPortal('Your Phoenix Portal session expired after 8 hours. Please login again.');
    return false;
  }
  const { data } = await client.auth.getSession();
  const session = data?.session;
  if (!session?.user) return false;
  supabaseSession = session;
  const { data: profile, error } = await client.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !profile) return false;
  supabaseProfile = profile;
  const role = roleToUi(profile.role || getPortalSessionMeta()?.role || 'Manager');
  setPortalSessionMeta(role, session.user.email || profile.email || '');
  await loadDashboardDataFromSupabase();
  renderDashboard(role);
  if (loginModal?.open) loginModal.close();
  if (typeof dashboardModal?.showModal === 'function' && !dashboardModal.open) dashboardModal.showModal();
  return true;
}
function bootstrapPortalRoute() {
  if (!isPortalRoute()) return;
  document.body.classList.add('portal-mode');
  tryResumePortalSession().then(ok => {
    if (!ok && typeof loginModal?.showModal === 'function' && !loginModal.open) loginModal.showModal();
  });
}
function copyTextWithFallback(text, successMessage = 'Copied.') {
  const value = String(text || '');
  if (!value.trim()) {
    alert('Nothing to copy yet. Submit or load records first.');
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(() => alert(successMessage)).catch(() => fallbackCopyText(value, successMessage));
  } else {
    fallbackCopyText(value, successMessage);
  }
}
function fallbackCopyText(text, successMessage) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); alert(successMessage); }
  catch { alert('Copy failed. Select and copy this manually:\n\n' + text); }
  finally { document.body.removeChild(ta); }
}

function parseEventDateForDb(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
function parseEventTimeForDb(value) {
  if (!value) return '16:00:00';
  const clean = String(value).trim();
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return '16:00:00';
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const ap = match[3].toUpperCase();
  if (ap === 'PM' && hour !== 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;
}
function formatDbDateForUi(value) {
  if (!value) return '';
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3) return value;
  return new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'});
}
function formatDbTimeForUi(value) {
  if (!value) return '';
  const [h,m] = String(value).split(':').map(Number);
  if (Number.isNaN(h)) return value;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m || 0).padStart(2,'0')} ${ap}`;
}
function preferredTimeFromNotes(notes, fallback = '') {
  const match = String(notes || '').match(/Preferred arrival window:\s*([^\n]+)/i);
  return match ? match[1].trim() : fallback;
}
function attachPreferredTimeNote(notes, eventTime, customTimeRequest = '') {
  const parts = [];
  if (notes) parts.push(String(notes));
  if (eventTime) parts.push(`Preferred arrival window: ${eventTime}`);
  if (customTimeRequest) parts.push(`Custom time request: ${customTimeRequest}`);
  parts.push('Party start time will be confirmed within 24 hours before the event based on chef routing.');
  return parts.join('\n');
}
function firstReadableTime(value) {
  const match = String(value || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return '4:00 PM';
  return `${Number(match[1])}:${match[2] || '00'} ${match[3].toUpperCase()}`;
}
function roleToUi(role) {
  return ({admin:'Admin', manager:'Manager', customer_service:'Customer Service', chef:'Chef', customer:'Member'}[role] || 'Member');
}
function uiRoleToDb(role) {
  return ({Admin:'admin', Manager:'manager', 'Customer Service':'customer_service', Chef:'chef', Member:'customer', Customer:'customer'}[role] || 'customer');
}
function orderToBookingRow(order) {
  // V98: keep the public booking insert compatible with older Supabase schemas.
  // PDF fields are still supported in the dashboard when the migration is added,
  // but the customer booking request must not fail just because pdf_url/pdf_path
  // has not been added yet.
  return {
    booking_number: order.id,
    customer_name: order.name || 'Guest',
    customer_email: order.email || null,
    customer_phone: order.phone || null,
    event_date: parseEventDateForDb(order.eventDate) || new Date().toISOString().slice(0,10),
    event_time: parseEventTimeForDb(order.eventTime),
    adults: Number(order.adults || 0),
    kids: Number(order.kids || 0),
    guest_count: Number(order.totalGuests || order.guest_count || 10),
    package_name: order.package || 'Classic',
    add_ons: order.addons || [],
    address: order.address || 'Address pending',
    latitude: order.addressLat ? Number(order.addressLat) : null,
    longitude: order.addressLon ? Number(order.addressLon) : null,
    allergies: order.allergies || [],
    allergy_notes: order.allergyNotes || null,
    rain_plan: order.rainPlan || null,
    parking_notes: order.parking || null,
    delay_policy: order.arrivalFlex || null,
    customer_late_policy: order.guestDelay || null,
    travel_fee: Number(order.travelFee || 0),
    deposit_amount: Number(order.depositPaid || order.deposit_amount || 0),
    payment_status: order.paymentStatus || order.payment_status || 'unpaid',
    status: order.status || 'pending',
    admin_notes: attachPreferredTimeNote([order.specialNotes || '', proteinNoteForOrder(order)].filter(Boolean).join('\n'), order.eventTime || '', order.customTimeRequest || '')
  };
}

function removeMissingColumnFromPayload(payload, errorMessage) {
  const message = String(errorMessage || '');
  const match = message.match(/Could not find the '([^']+)' column/i) || message.match(/column "([^"]+)" .* does not exist/i);
  const column = match?.[1];
  if (!column || !(column in payload)) return null;
  const next = { ...payload };
  delete next[column];
  return next;
}
function bookingRowToOrder(row) {
  return autoAssignOrder({
    id: row.booking_number || row.id,
    dbId: row.id,
    createdAt: row.created_at,
    status: row.status || 'pending',
    name: row.customer_name || '',
    phone: row.customer_phone || '',
    email: row.customer_email || '',
    address: row.address || '',
    addressLat: row.latitude || '',
    addressLon: row.longitude || '',
    package: row.package_name || 'Classic',
    adults: row.adults || 0,
    kids: row.kids || 0,
    totalGuests: row.guest_count || 0,
    eventDate: formatDbDateForUi(row.event_date),
    eventTime: preferredTimeFromNotes(row.admin_notes, formatDbTimeForUi(row.event_time)),
    addons: Array.isArray(row.add_ons) ? row.add_ons : [],
    allergies: Array.isArray(row.allergies) ? row.allergies : [],
    allergyNotes: row.allergy_notes || '',
    rainPlan: row.rain_plan || '',
    parking: row.parking_notes || '',
    arrivalFlex: row.delay_policy || '',
    guestDelay: row.customer_late_policy || '',
    travelFee: Number(row.travel_fee || 0),
    depositRequired: MONEY_RULES.depositRequired,
    depositPaid: Number(row.deposit_amount || 0),
    paymentStatus: row.payment_status || 'unpaid',
    customTimeRequest: (String(row.admin_notes || '').match(/Custom time request:\s*([^\n]+)/i)?.[1] || ''),
    proteinSelections: proteinSelectionsFromText(row.admin_notes || ''),
    proteinSummary: proteinSummary(proteinSelectionsFromText(row.admin_notes || '')),
    proteinUpcharge: proteinUpgradeAmount(proteinSelectionsFromText(row.admin_notes || '')),
    specialNotes: row.admin_notes || '',
    pdfUrl: row.pdf_url || row.invoice_pdf_url || ''
  }, getStoredOrders());
}
function getDashboardOrders() {
  return Array.isArray(remoteOrdersCache) ? remoteOrdersCache : getStoredOrders();
}
function getDashboardApplications() {
  return Array.isArray(remoteChefApplicationsCache) ? remoteChefApplicationsCache : getStoredChefApplications();
}
async function saveBookingToSupabase(order) {
  const client = initSupabaseClient();
  if (!client) return {ok:false, error:'Supabase client not loaded'};
  let payload = orderToBookingRow(order);

  // V99: public booking submission must be INSERT-only.
  // Do NOT call .select().single() here. Anonymous customers are allowed to create
  // bookings, but they should not have SELECT permission on the bookings table.
  // Asking Supabase to return the inserted row requires SELECT and causes
  // "permission denied for table bookings" even when INSERT is correctly allowed.
  let result = await client.from('bookings').insert(payload);

  // If the live Supabase table is still on an older schema, retry once by removing
  // the missing column instead of losing the customer booking request.
  if (result.error) {
    const retryPayload = removeMissingColumnFromPayload(payload, result.error.message);
    if (retryPayload) {
      console.warn('Retrying booking insert without missing Supabase column:', result.error.message);
      payload = retryPayload;
      result = await client.from('bookings').insert(payload);
    }
  }

  if (result.error) {
    console.error('Supabase booking insert failed:', result.error);
    return {ok:false, error:result.error.message};
  }

  const data = payload;

  // Commercial workflow hook: email + PDF generation should run in a Supabase Edge Function.
  // The function is intentionally non-blocking so the customer does not lose a confirmed order
  // if email/PDF provider has a temporary outage. See supabase/functions/booking-created.
  try {
    await client.functions.invoke('booking-created', { body: { booking_number: order.id, booking: data } });
  } catch (notifyError) {
    console.warn('Booking saved, but notification/PDF function did not complete:', notifyError);
  }

  return {ok:true, data};
}
async function signInPortal(email, password) {
  const client = initSupabaseClient();
  if (!client || !email || !password) return null;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  supabaseSession = data.session;
  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', data.user.id).single();
  if (profileError) throw profileError;
  if (profile?.account_status && profile.account_status !== 'active') {
    await client.auth.signOut().catch(() => {});
    supabaseSession = null;
    supabaseProfile = null;
    throw new Error(`This account is ${profile.account_status}. Chef accounts must be approved by an admin before login.`);
  }
  supabaseProfile = profile;
  return profile;
}
async function loadDashboardDataFromSupabase() {
  const client = initSupabaseClient();
  if (!client || !supabaseSession) return;
  const { data: rows, error } = await client.from('bookings').select('*').order('created_at', { ascending:false });
  if (!error) remoteOrdersCache = (rows || []).map(bookingRowToOrder);
  else console.warn('Supabase bookings fetch failed:', error);
  const { data: apps, error: appsError } = await client.from('chef_applications').select('*').order('created_at', { ascending:false });
  if (!appsError) {
    remoteChefApplicationsCache = (apps || []).map(row => ({
      id: row.id,
      createdAt: row.created_at,
      createdAtLabel: new Date(row.created_at).toLocaleString(),
      name: row.applicant_name || '',
      phone: row.phone || '',
      email: row.email || '',
      baseZip: row.home_zip || '',
      experience: row.experience_years || '',
      transportation: row.has_transportation ? 'Has reliable car' : 'Transportation not confirmed',
      availability: Array.isArray(row.availability) ? row.availability.join(', ') : '',
      serviceAreas: Array.isArray(row.service_areas) ? row.service_areas.join(', ') : '',
      notes: row.notes || '',
      files: Array.isArray(row.attachment_files) ? row.attachment_files : []
    }));
  } else console.warn('Supabase chef applications fetch failed:', appsError);
}
async function uploadChefApplicationFiles(appId, files) {
  const client = initSupabaseClient();
  if (!client || !files?.length) return [];
  const uploaded = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
    const ownerFolder = supabaseSession?.user?.id || appId;
    const path = `${ownerFolder}/${Date.now()}-${safeName}`;
    const { data, error } = await client.storage.from('chef-application-files').upload(path, file, { upsert:false });
    if (error) {
      console.warn('Chef file upload failed:', error);
      uploaded.push({ name:file.name, type:file.type || 'file', size:file.size, sizeLabel:`${Math.max(1, Math.round(file.size/1024))} KB`, uploadError:error.message });
    } else {
      uploaded.push({ name:file.name, type:file.type || 'file', size:file.size, sizeLabel:`${Math.max(1, Math.round(file.size/1024))} KB`, path:data.path });
    }
  }
  return uploaded;
}
async function saveChefApplicationToSupabase(app, files) {
  const client = initSupabaseClient();
  if (!client) return {ok:false, error:'Supabase client not loaded', files:app.files || []};
  const uploadedFiles = await uploadChefApplicationFiles(app.id, files);
  const row = {
    user_id: app.userId || null,
    applicant_name: app.name || 'Chef applicant',
    phone: app.phone || null,
    email: app.email || null,
    account_email: app.email || null,
    home_zip: app.baseZip || null,
    experience_years: app.experience || null,
    has_transportation: String(app.transportation || '').toLowerCase().includes('car'),
    availability: app.availability ? String(app.availability).split(',').map(s => s.trim()).filter(Boolean) : [],
    service_areas: app.serviceAreas ? String(app.serviceAreas).split(',').map(s => s.trim()).filter(Boolean) : [],
    notes: app.notes || null,
    attachment_files: uploadedFiles,
    status: 'new',
    account_status: app.accountStatus || 'pending'
  };
  const { error } = await client.from('chef_applications').insert(row);
  if (error) {
    console.warn('Chef application insert failed:', error);
    return {ok:false, error:error.message, files:uploadedFiles};
  }
  return {ok:true, files:uploadedFiles};
}


const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
let mainMonth = new Date(2026, 6, 1); // July 2026
let miniMonth = new Date(2026, 6, 1);
let selectedDateState = new Date(2026, 6, 11);
let selectedStatusState = 'limited';
let selectedTimeState = '4:00 PM - 6:00 PM';

const daysGrid = document.getElementById('daysGrid');
const currentMonthLabel = document.getElementById('currentMonthLabel');
const selectedDate = document.getElementById('selectedDate');
const selectedTime = document.getElementById('selectedTime');
const slotList = document.getElementById('slotList');
const selectedDateInput = document.getElementById('selectedDateInput');
const selectedTimeInput = document.getElementById('selectedTimeInput');
const customTimeRequest = document.getElementById('customTimeRequest');
const miniDaysGrid = document.getElementById('miniDaysGrid');
const miniMonthLabel = document.getElementById('miniMonthLabel');
const summaryText = document.getElementById('bookingSummaryText');

window.addEventListener('scroll', () => header?.classList.toggle('scrolled', window.scrollY > 20));

menuBtn?.addEventListener('click', () => {
  const open = mobileNav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});
mobileNav?.querySelectorAll('a,button').forEach(item => item.addEventListener('click', () => mobileNav.classList.remove('open')));

function formatDate(date) {
  return date.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
}
function formatShortDate(date) {
  return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
function sameDay(a,b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// V67: past dates should be gray and not clickable. Uses visitor's local date.
function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function isPastDate(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return false;
  const d = startOfLocalDay(new Date(date));
  const today = startOfLocalDay(new Date());
  return d.getTime() < today.getTime();
}
function getNextSelectableDate(fromDate = new Date(), maxLookAheadDays = 180) {
  const d = startOfLocalDay(fromDate);
  for (let i = 0; i <= maxLookAheadDays; i += 1) {
    const candidate = new Date(d);
    candidate.setDate(d.getDate() + i);
    const status = getStatus(candidate);
    if (!['past', 'full', 'off'].includes(status)) return candidate;
  }
  return d;
}
function isSelectableCalendarDate(date, status = getStatus(date)) {
  return !isPastDate(date) && !['full', 'off', 'past'].includes(status);
}
function getStatus(date) {
  if (isPastDate(date)) return 'past';
  if (isDatePaused(date)) return 'full';
  const day = date.getDay();
  const n = date.getDate();
  if (day === 1 || n % 17 === 0) return 'off';
  if (n % 9 === 0 || (day === 6 && n % 3 === 0)) return 'full';
  if ([0,5,6].includes(day) || n % 5 === 0) return 'limited';
  return 'open';
}
function getSlotsForStatus(status) {
  if (status === 'past') {
    return [{time:'Date passed', note:'Please choose today or a future event date', booked:'Unavailable', status:'Past date', disabled:true}];
  }
  if (status === 'full') {
    return [{time:'Fully booked', note:'This date is full or temporarily closed', booked:'0 available slots', status:'Full', disabled:true}];
  }
  if (status === 'off') {
    return [{time:'Unavailable', note:'Please choose another date', booked:'0/0 orders booked', status:'Unavailable', disabled:true}];
  }
  if (status === 'limited') {
    return [
      {time:'11:00 AM - 1:00 PM', note:'Limited · lunch route review required', booked:'2/3 orders booked', status:'Limited'},
      {time:'2:00 PM - 4:00 PM', note:'Limited · afternoon route review required', booked:'2/3 orders booked', status:'Limited'},
      {time:'4:00 PM - 6:00 PM', note:'Limited · early dinner route review required', booked:'2/3 orders booked', status:'Limited'},
      {time:'7:00 PM - 9:00 PM', note:'Open dinner window', booked:'0/2 orders booked', status:'Open'}
    ];
  }
  return [
    {time:'11:00 AM - 1:00 PM', note:'Preferred lunch window', booked:'0/3 orders booked', status:'Open'},
    {time:'2:00 PM - 4:00 PM', note:'Preferred afternoon window', booked:'0/3 orders booked', status:'Open'},
    {time:'4:00 PM - 6:00 PM', note:'Preferred early dinner window', booked:'0/3 orders booked', status:'Open'},
    {time:'7:00 PM - 9:00 PM', note:'Preferred dinner window', booked:'0/2 orders booked', status:'Open'}
  ];
}
function buildMonthDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({length:42}, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
function chooseDate(date, status = getStatus(date), openModal = false) {
  if (!isSelectableCalendarDate(date, status)) {
    if (status === 'past') return;
  }
  selectedDateState = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  selectedStatusState = getStatus(selectedDateState);
  selectedDate.textContent = formatDate(selectedDateState);
  selectedDateInput.value = formatShortDate(selectedDateState);
  renderSlots();
  renderMainCalendar();
  renderMiniCalendar();
  renderBookingAcceptanceState();
  updateBookingReadyState();
  updateSummary();
  if (openModal && isSelectableCalendarDate(selectedDateState, selectedStatusState)) openBookingModal({prefix:'Selected date'});
}
function renderMainCalendar() {
  if (!daysGrid) return;
  currentMonthLabel.textContent = `${monthNames[mainMonth.getMonth()]} ${mainMonth.getFullYear()}`;
  daysGrid.innerHTML = buildMonthDays(mainMonth).map(date => {
    const inMonth = date.getMonth() === mainMonth.getMonth();
    const status = inMonth ? getStatus(date) : 'dim';
    const selected = sameDay(date, selectedDateState) ? 'selected' : '';
    const disabled = !inMonth || !isSelectableCalendarDate(date, status);
    const label = `${formatDate(date)} · ${status === 'past' ? 'past date' : status}`;
    return `<button type="button" aria-label="${label}" class="day ${status} ${!inMonth ? 'dim' : ''} ${selected}" data-date="${date.toISOString()}" data-status="${status}" ${disabled ? 'disabled' : ''}>${date.getDate()}</button>`;
  }).join('');
  daysGrid.querySelectorAll('.day:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => chooseDate(new Date(btn.dataset.date), btn.dataset.status));
  });
}
function renderSlots() {
  if (!slotList) return;
  const slots = getSlotsForStatus(selectedStatusState);
  slotList.innerHTML = slots.map(s => `<button type="button" class="slot" data-time="${s.time}" ${s.disabled ? 'disabled' : ''}><strong>${s.time}</strong><small>${s.note}</small><small>${s.booked} · ${s.status}</small></button>`).join('');
  slotList.querySelectorAll('.slot:not([disabled])').forEach(button => {
    button.addEventListener('click', () => {
      selectedTimeState = button.dataset.time;
      selectedTime.textContent = selectedTimeState;
      syncTimeControlsFromString(selectedTimeState);
      updateSummary();
      openBookingModal({prefix:'Calendar slot'});
    });
  });
}
function renderMiniCalendar() {
  if (!miniDaysGrid) return;
  miniMonthLabel.textContent = `${monthNames[miniMonth.getMonth()]} ${miniMonth.getFullYear()}`;
  miniDaysGrid.innerHTML = buildMonthDays(miniMonth).map(date => {
    const inMonth = date.getMonth() === miniMonth.getMonth();
    const status = inMonth ? getStatus(date) : 'dim';
    const selected = sameDay(date, selectedDateState) ? 'selected' : '';
    const disabled = !inMonth || !isSelectableCalendarDate(date, status);
    return `<button type="button" aria-label="${formatDate(date)} · ${status === 'past' ? 'past date' : status}" class="mini-day ${status} ${!inMonth ? 'dim' : ''} ${selected}" data-date="${date.toISOString()}" data-status="${status}" ${disabled ? 'disabled' : ''}>${date.getDate()}</button>`;
  }).join('');
  miniDaysGrid.querySelectorAll('.mini-day:not([disabled])').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      chooseDate(new Date(btn.dataset.date), btn.dataset.status);
    });
  });
}

document.getElementById('prevMonth')?.addEventListener('click', () => { mainMonth.setMonth(mainMonth.getMonth() - 1); renderMainCalendar(); });
document.getElementById('nextMonth')?.addEventListener('click', () => { mainMonth.setMonth(mainMonth.getMonth() + 1); renderMainCalendar(); });
document.getElementById('miniPrevMonth')?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); miniMonth.setMonth(miniMonth.getMonth() - 1); renderMiniCalendar(); });
document.getElementById('miniNextMonth')?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); miniMonth.setMonth(miniMonth.getMonth() + 1); renderMiniCalendar(); });

document.querySelector('.mini-calendar-card')?.addEventListener('pointerdown', event => event.stopPropagation());
document.querySelector('.mini-calendar-card')?.addEventListener('click', event => event.stopPropagation());

function openBookingModal(context = {}) {
  const requestedPackage = context.package;
  if (['Classic','Premium','Signature'].includes(requestedPackage)) selectPackage(requestedPackage);
  miniMonth = new Date(selectedDateState.getFullYear(), selectedDateState.getMonth(), 1);
  renderMiniCalendar();
  syncTimeControlsFromString(selectedTimeState);
  updateGuestCount();
  updateSummary();
  if (typeof bookingModal?.showModal === 'function') bookingModal.showModal();
  else location.hash = '#booking';
}

document.querySelectorAll('[data-open-booking]').forEach(btn => {
  btn.addEventListener('click', () => {
    openBookingModal({package: btn.getAttribute('data-package') || 'Phoenix Hibachi event'});
  });
});
function openLoginModal() {
  if (typeof loginModal?.showModal === 'function') loginModal.showModal();
  else openPortalInNewTab();
}
document.querySelectorAll('[data-open-login]').forEach(btn => btn.addEventListener('click', openLoginModal));

document.querySelectorAll('[data-open-contact]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (typeof contactModal?.showModal === 'function') contactModal.showModal();
    else location.hash = '#booking';
  });
});
document.querySelectorAll('[data-contact-feedback]').forEach(btn => btn.addEventListener('click', () => {
  contactModal?.close();
  document.getElementById('booking')?.scrollIntoView({behavior:'smooth', block:'start'});
}));
document.querySelectorAll('[data-contact-booking]').forEach(btn => btn.addEventListener('click', () => {
  contactModal?.close();
  openBookingModal({package: 'Phoenix Hibachi event'});
}));
document.querySelectorAll('[data-contact-ai]').forEach(btn => btn.addEventListener('click', () => {
  contactModal?.close();
  setAiOpen(true);
}));

// Login role tabs control which application shortcut is shown.
function currentLoginRoleChoice() {
  return document.querySelector('.login-tabs .active')?.textContent?.trim() || 'Member';
}
function updateLoginApplyShortcut() {
  const btn = document.getElementById('loginApplyActionBtn');
  if (!btn) return;
  const role = currentLoginRoleChoice();
  if (role === 'Member') {
    btn.hidden = false;
    btn.textContent = 'Apply for Membership';
  } else if (role === 'Chef') {
    btn.hidden = false;
    btn.textContent = 'Apply to Join Chef Team';
  } else {
    btn.hidden = true;
  }
}
document.querySelectorAll('.login-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.login-tabs button').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    updateLoginApplyShortcut();
  });
});
document.getElementById('loginApplyActionBtn')?.addEventListener('click', (event) => {
  event.preventDefault();
  const role = currentLoginRoleChoice();
  if (role === 'Chef') {
    try { loginModal?.close?.(); } catch {}
    chefApplyModal?.showModal?.();
  } else {
    try { loginModal?.close?.(); } catch {}
    memberSignupModal?.showModal?.();
  }
});
updateLoginApplyShortcut();

const bookingState = {
  package: 'Classic',
  adults: 10,
  kids: 0,
  total: 10,
  addons: [],
  proteins: {},
  proteinUpcharge: 0
};
const packagePrices = { Classic:55, Premium:65, Signature:110 };
const PACKAGE_PROTEIN_PORTIONS = { Classic:2, Premium:3, Signature:4 };
const PROTEIN_UPCHARGE_PER_PORTION = 5;
const PREMIUM_PROTEINS = ['Scallop','Lobster','Filet Mignon'];
const ADDON_PRICE_MAP = {
  'Sushi Roll Tray':85,
  'Premium Sushi Tray':130,
  'Sushi & Sashimi Combo':160,
  'Extra Gyoza Tray':45,
  'Extra Edamame Tray':35,
  'Noodle / Yakisoba Tray':50
};
const MONEY_RULES = {
  depositRequired: 200,
  memberCreditBuy: 1000,
  memberCreditBonus: 100,
  firstPartyCoupon: 50,
  birthdayCoupon: 50,
  socialCoupon: 50,
  couponMinimumParty: 600,
  chefAdultRate: 15,
  chefKidRate: 7.5,
  chefMinimumPayout: 150,
  minimumBillableGuests: 10
};
const adultsInput = document.getElementById('adultsValue');
const kidsInput = document.getElementById('kidsValue');
const totalValue = document.getElementById('totalValue');
const totalGuestsInput = document.getElementById('totalGuestsInput');
const billableGuestsInput = document.getElementById('billableGuestsInput');
const billableGuestCard = document.getElementById('billableGuestCard');
const guestMinimumHelp = document.getElementById('guestMinimumHelp');
const sendBookingRequestBtn = document.getElementById('sendBookingRequestBtn');
const bookingReadyHelp = document.getElementById('bookingReadyHelp');
const noAddonChoice = document.getElementById('noAddonChoice');
const bookingPolicyAgree = document.getElementById('bookingPolicyAgree');
const proteinChoiceGrid = document.getElementById('proteinChoiceGrid');
const proteinUsedCount = document.getElementById('proteinUsedCount');
const proteinRequiredCount = document.getElementById('proteinRequiredCount');
const proteinUpgradeTotal = document.getElementById('proteinUpgradeTotal');
const proteinSelectionsInput = document.getElementById('proteinSelectionsInput');
const proteinSummaryInput = document.getElementById('proteinSummaryInput');
const proteinUpchargeInput = document.getElementById('proteinUpchargeInput');
const proteinHelpText = document.getElementById('proteinHelpText');
const hourSelect = document.getElementById('hourSelect');
const minuteSelect = document.getElementById('minuteSelect');
const ampmSelect = document.getElementById('ampmSelect');
const modalTimeChips = document.getElementById('modalTimeChips');

function initTimeSelects() {
  if (hourSelect && !hourSelect.options.length) {
    hourSelect.innerHTML = Array.from({length:12}, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
  }
  if (minuteSelect && !minuteSelect.options.length) {
    minuteSelect.innerHTML = Array.from({length:12}, (_, i) => {
      const value = String(i * 5).padStart(2, '0');
      return `<option value="${value}">${value}</option>`;
    }).join('');
  }
  [hourSelect, minuteSelect, ampmSelect].forEach(select => select?.addEventListener('change', updateTimeFromSelects));
  syncTimeControlsFromString(selectedTimeState);
}


function proteinPortionsPerGuest(packageName = bookingState.package) {
  return PACKAGE_PROTEIN_PORTIONS[packageName] || PACKAGE_PROTEIN_PORTIONS.Classic;
}
function physicalGuestCount(orderLike = bookingState) {
  const adults = Number(orderLike.adults ?? bookingState.adults ?? 0);
  const kids = Number(orderLike.kids ?? bookingState.kids ?? 0);
  return Math.max(0, adults + kids);
}
function actualBillableGuestCount(orderLike = bookingState) {
  const adults = Number(orderLike.adults ?? bookingState.adults ?? 0);
  const kids = Number(orderLike.kids ?? bookingState.kids ?? 0);
  return Math.max(0, adults + kids * 0.5);
}
function billableGuestCount(orderLike = bookingState) {
  const adults = Number(orderLike.adults ?? bookingState.adults ?? 0);
  const kids = Number(orderLike.kids ?? bookingState.kids ?? 0);
  const stored = Number(orderLike.billableGuests || orderLike.billable_guests || 0);
  const totalFallback = Number(orderLike.totalGuests || orderLike.total || 0);
  const calculated = adults + kids * 0.5;
  return Math.max(MONEY_RULES.minimumBillableGuests, stored || calculated || totalFallback || 0);
}
function formatGuestNumber(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}
function requiredProteinPortions(orderLike = bookingState) {
  const packageName = orderLike.package || bookingState.package || 'Classic';
  const guests = billableGuestCount(orderLike);
  return Math.ceil(guests * proteinPortionsPerGuest(packageName));
}
function readProteinSelectionsFromDom() {
  const selections = {};
  proteinChoiceGrid?.querySelectorAll('.protein-row').forEach(row => {
    const name = row.dataset.protein;
    const value = Math.max(0, Math.floor(Number(row.querySelector('input')?.value || 0)));
    if (value > 0) selections[name] = value;
  });
  return selections;
}
function proteinTotal(selections = {}) {
  return Object.values(selections || {}).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
}
function premiumProteinCount(selections = {}) {
  return PREMIUM_PROTEINS.reduce((sum, name) => sum + Math.max(0, Number(selections?.[name] || 0)), 0);
}
function proteinUpgradeAmount(selections = {}) {
  return premiumProteinCount(selections) * PROTEIN_UPCHARGE_PER_PORTION;
}
function proteinSummary(selections = {}) {
  const parts = Object.entries(selections || {}).filter(([,count]) => Number(count) > 0).map(([name,count]) => `${name} × ${count}`);
  return parts.length ? parts.join(', ') : 'Not selected yet';
}
function proteinSelectionsFromText(text = '') {
  const match = String(text || '').match(/Protein selections:\s*([^\n]+)/i);
  if (!match) return {};
  const selections = {};
  match[1].split(',').forEach(part => {
    const m = part.trim().match(/^(.+?)\s*[×x]\s*(\d+)/i);
    if (m) selections[m[1].trim()] = Number(m[2]);
  });
  return selections;
}
function proteinNoteForOrder(order = {}) {
  const selections = order.proteinSelections || {};
  const total = proteinTotal(selections);
  if (!total) return '';
  return `Protein selections: ${proteinSummary(selections)}\nPremium protein upgrade: ${money(proteinUpgradeAmount(selections))}`;
}
function setProteinRowValue(row, value) {
  const input = row?.querySelector('input');
  if (!input) return;
  input.value = String(Math.max(0, Math.floor(Number(value || 0))));
}
function updateProteinState() {
  const required = requiredProteinPortions();
  let selections = readProteinSelectionsFromDom();
  let used = proteinTotal(selections);
  if (used > required) {
    let over = used - required;
    [...(proteinChoiceGrid?.querySelectorAll('.protein-row') || [])].reverse().forEach(row => {
      if (over <= 0) return;
      const input = row.querySelector('input');
      const current = Number(input?.value || 0);
      const remove = Math.min(current, over);
      if (remove > 0) {
        setProteinRowValue(row, current - remove);
        over -= remove;
      }
    });
    selections = readProteinSelectionsFromDom();
    used = proteinTotal(selections);
  }
  bookingState.proteins = selections;
  bookingState.proteinUpcharge = proteinUpgradeAmount(selections);
  if (proteinUsedCount) proteinUsedCount.textContent = String(used);
  if (proteinRequiredCount) proteinRequiredCount.textContent = String(required);
  if (proteinUpgradeTotal) proteinUpgradeTotal.textContent = `Premium upgrade: +${money(bookingState.proteinUpcharge)}`;
  if (proteinSelectionsInput) proteinSelectionsInput.value = JSON.stringify(selections);
  if (proteinSummaryInput) proteinSummaryInput.value = proteinSummary(selections);
  if (proteinUpchargeInput) proteinUpchargeInput.value = String(bookingState.proteinUpcharge);
  const packageName = bookingState.package || 'Classic';
  if (proteinHelpText) {
    proteinHelpText.textContent = `${packageName} for ${formatGuestNumber(billableGuestCount())} billable guests includes ${required} protein portions. Kids count as half a guest. Filet mignon, lobster and scallop add $5 per selected portion.`;
    proteinHelpText.classList.toggle('protein-warning', used !== required);
  }
  proteinChoiceGrid?.querySelectorAll('.protein-row').forEach(row => {
    const plus = row.querySelector('[data-protein-action="plus"]');
    const minus = row.querySelector('[data-protein-action="minus"]');
    const input = row.querySelector('input');
    const value = Number(input?.value || 0);
    if (plus) plus.disabled = used >= required;
    if (minus) minus.disabled = value <= 0;
  });
  updateBookingReadyState();
  updateSummary();
}
function validateProteinSelections() {
  updateProteinState();
  const required = requiredProteinPortions();
  const used = proteinTotal(bookingState.proteins);
  if (used !== required) {
    alert(`Please choose exactly ${required} protein portions before submitting. You selected ${used}.`);
    return false;
  }
  return true;
}
function bookingReadinessIssues() {
  const issues = [];
  if (isPastDate(selectedDateState)) issues.push('Choose today or a future event date');
  if (!isAcceptingOrders()) issues.push('Selected date is full / not accepting new booking requests');
  // Guests are allowed to choose any actual headcount. The price still uses the
  // 10-adult minimum through billableGuestCount(), so under-minimum parties can submit.
  const requiredProteins = requiredProteinPortions();
  const selectedProteins = proteinTotal(bookingState.proteins);
  if (selectedProteins !== requiredProteins) issues.push(`Choose ${requiredProteins} protein portions`);
  updateAddonsState();
  if (!bookingState.addonDecisionMade) issues.push('Choose add-ons or No thank you');
  if (bookingPolicyAgree && !bookingPolicyAgree.checked) issues.push('Check agreement box');
  return issues;
}
function updateBookingReadyState() {
  const issues = bookingReadinessIssues();
  const ready = issues.length === 0;
  if (sendBookingRequestBtn) sendBookingRequestBtn.disabled = !ready;
  if (bookingReadyHelp) {
    bookingReadyHelp.textContent = ready ? 'Ready to send booking request.' : issues.join(' · ');
    bookingReadyHelp.classList.toggle('ready', ready);
  }
}
proteinChoiceGrid?.querySelectorAll('.protein-row').forEach(row => {
  const input = row.querySelector('input');
  row.querySelectorAll('[data-protein-action]').forEach(button => {
    button.addEventListener('click', () => {
      const change = button.dataset.proteinAction === 'plus' ? 1 : -1;
      const current = Number(input?.value || 0);
      setProteinRowValue(row, current + change);
      updateProteinState();
    });
  });
  input?.addEventListener('input', updateProteinState);
  input?.addEventListener('blur', updateProteinState);
});

function selectPackage(packageName) {
  bookingState.package = packageName || 'Classic';
  document.querySelectorAll('.package-choice').forEach(card => {
    const selected = card.dataset.packageCard === bookingState.package;
    card.classList.toggle('selected', selected);
    const input = card.querySelector('input');
    if (input) input.checked = selected;
  });
  updateProteinState();
}

document.querySelectorAll('.package-choice input').forEach(input => {
  input.addEventListener('change', () => selectPackage(input.value));
});

document.querySelectorAll('.addon-choice input').forEach(input => {
  input.addEventListener('change', () => {
    if (input === noAddonChoice && input.checked) {
      document.querySelectorAll('.addon-choice input[name="addons"]').forEach(addonInput => {
        addonInput.checked = false;
        addonInput.closest('.addon-choice')?.classList.remove('selected');
      });
    }
    if (input.name === 'addons' && input.checked && noAddonChoice) {
      noAddonChoice.checked = false;
      noAddonChoice.closest('.addon-choice')?.classList.remove('selected');
    }
    input.closest('.addon-choice')?.classList.toggle('selected', input.checked);
    updateAddonsState();
    updateSummary();
  });
});

function updateAddonsState() {
  bookingState.addons = [...document.querySelectorAll('.addon-choice input[name="addons"]:checked')].map(input => ({
    name: input.value,
    price: Number(input.dataset.price || 0)
  }));
  bookingState.addonDecisionMade = Boolean(noAddonChoice?.checked || bookingState.addons.length > 0);
}
function validateAddonDecision() {
  updateAddonsState();
  if (!bookingState.addonDecisionMade) {
    alert('Please select add-ons or choose No thank you before submitting.');
    return false;
  }
  return true;
}

function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function updateGuestCount() {
  bookingState.adults = clamp(adultsInput?.value ?? 10, 0, 60);
  bookingState.kids = clamp(kidsInput?.value ?? 0, 0, 40);
  bookingState.physicalGuests = physicalGuestCount(bookingState);
  bookingState.actualBillableGuests = actualBillableGuestCount(bookingState);
  bookingState.chargedBillableGuests = billableGuestCount(bookingState);
  bookingState.total = bookingState.chargedBillableGuests;
  if (adultsInput) adultsInput.value = bookingState.adults;
  if (kidsInput) kidsInput.value = bookingState.kids;
  if (totalValue) totalValue.textContent = formatGuestNumber(bookingState.chargedBillableGuests);
  if (totalGuestsInput) totalGuestsInput.value = String(bookingState.physicalGuests);
  if (billableGuestsInput) billableGuestsInput.value = formatGuestNumber(bookingState.chargedBillableGuests);
  const actual = bookingState.actualBillableGuests;
  const charged = bookingState.chargedBillableGuests;
  if (guestMinimumHelp) {
    guestMinimumHelp.textContent = actual < MONEY_RULES.minimumBillableGuests
      ? `Actual adult-equivalent guests: ${formatGuestNumber(actual)} · minimum charge applies: ${formatGuestNumber(charged)} billable guests`
      : `Minimum met · charged as ${formatGuestNumber(charged)} billable guests`;
  }
  billableGuestCard?.classList.remove('below-minimum');
  updateProteinState();
}
function validateGuestMinimum() {
  // Under-minimum guest counts are allowed. The order is simply charged at the
  // 10-adult minimum through billableGuestCount().
  updateGuestCount();
  return true;
}

document.querySelectorAll('.counter-card[data-counter]').forEach(card => {
  const key = card.dataset.counter;
  const input = key === 'adults' ? adultsInput : kidsInput;
  card.querySelectorAll('[data-count-action]').forEach(button => {
    button.addEventListener('click', () => {
      const change = button.dataset.countAction === 'plus' ? 1 : -1;
      input.value = Number(input.value || 0) + change;
      updateGuestCount();
    });
  });
  input?.addEventListener('input', updateGuestCount);
  input?.addEventListener('blur', updateGuestCount);
});
bookingPolicyAgree?.addEventListener('change', updateBookingReadyState);

function updateTimeFromSelects() {
  if (!hourSelect || !minuteSelect || !ampmSelect) return;
  selectedTimeState = `Requested: ${hourSelect.value}:${minuteSelect.value} ${ampmSelect.value}`;
  if (customTimeRequest) customTimeRequest.value = `${hourSelect.value}:${minuteSelect.value} ${ampmSelect.value}`;
  selectedTimeInput.value = selectedTimeState;
  if (selectedTime) selectedTime.textContent = selectedTimeState;
  markSelectedTimeChip(selectedTimeState);
  updateSummary();
}

function syncTimeControlsFromString(timeString) {
  const clean = String(timeString || '').trim();
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (match) {
    if (hourSelect) hourSelect.value = String(Number(match[1]));
    if (minuteSelect) minuteSelect.value = match[2] || '00';
    if (ampmSelect) ampmSelect.value = match[3].toUpperCase();
  }
  selectedTimeState = clean || '4:00 PM - 6:00 PM';
  if (customTimeRequest && !selectedTimeState.startsWith('Requested:')) customTimeRequest.value = '';
  if (selectedTimeInput) selectedTimeInput.value = selectedTimeState;
  if (selectedTime) selectedTime.textContent = selectedTimeState;
  markSelectedTimeChip(selectedTimeState);
  updateSummary();
}

function markSelectedTimeChip(timeString) {
  modalTimeChips?.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.timeChip === timeString);
  });
}

modalTimeChips?.querySelectorAll('[data-time-chip]').forEach(button => {
  button.addEventListener('click', () => syncTimeControlsFromString(button.dataset.timeChip));
});

customTimeRequest?.addEventListener('input', () => {
  const value = customTimeRequest.value.trim();
  if (value) {
    selectedTimeState = `Requested: ${value}`;
    if (selectedTimeInput) selectedTimeInput.value = selectedTimeState;
    if (selectedTime) selectedTime.textContent = selectedTimeState;
    markSelectedTimeChip(selectedTimeState);
    updateSummary();
  }
});

function updateSummary() {
  if (selectedDateInput) selectedDateInput.value = formatShortDate(selectedDateState);
  if (selectedTimeInput) selectedTimeInput.value = selectedTimeState;
  updateAddonsState();
  const dateText = selectedDateInput?.value || 'Date not selected';
  const addonTotal = bookingState.addons.reduce((sum, item) => sum + item.price, 0);
  const addonText = bookingState.addons.length ? `${bookingState.addons.length} add-ons +$${addonTotal}` : 'no add-ons';
  const packageText = `${bookingState.package} $${packagePrices[bookingState.package] || 0}/person`;
  const proteinText = `Proteins ${proteinTotal(bookingState.proteins)}/${requiredProteinPortions()} · premium +${money(bookingState.proteinUpcharge || 0)}`;
  const estimate = calculateOrderMoney({
    package: bookingState.package,
    adults: bookingState.adults,
    kids: bookingState.kids,
    totalGuests: physicalGuestCount(bookingState),
    billableGuests: billableGuestCount(bookingState),
    addons: bookingState.addons,
    proteinSelections: bookingState.proteins,
    proteinUpcharge: bookingState.proteinUpcharge,
    city: eventCityInput?.value || '',
    state: eventStateInput?.value || '',
    zip: eventZipInput?.value || '',
    address: addressInput?.value || '',
    travelFee: Number(travelFeeInput?.value || 0),
    depositPaid: 0
  });
  const guestText = `${physicalGuestCount(bookingState)} actual guests / charged as ${formatGuestNumber(billableGuestCount(bookingState))} billable`;
  const totalText = `Est. total ${money(estimate.guestTotalBeforeDeposit)}`;
  if (modalPackage) modalPackage.value = `${packageText} · ${dateText} · ${guestText} · ${selectedTimeState} · ${proteinText} · ${addonText} · ${totalText}`;
  if (summaryText) summaryText.textContent = `${packageText} · ${dateText} · ${guestText} · ${selectedTimeState} · ${proteinText} · ${addonText} · ${totalText}`;
  updateBookingReadyState();
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}


// v7: Geoapify map address autocomplete.
// This uses Geoapify Autocomplete API so guests can type a street address and pick a standardized map address.
// Important: before public launch, restrict this API key to your Replit preview domain and final website domain in Geoapify.
const GEOAPIFY_API_KEY = 'a02a60045022429e98c3b4aa14fbaf08';
const addressInput = document.getElementById('eventAddressInput');
const addressSuggestBox = document.getElementById('addressSuggestBox');
const addressLatInput = document.getElementById('eventAddressLat');
const addressLonInput = document.getElementById('eventAddressLon');
const addressPlaceIdInput = document.getElementById('eventAddressPlaceId');
const eventCityInput = document.getElementById('eventCityInput');
const eventStateInput = document.getElementById('eventStateInput');
const eventZipInput = document.getElementById('eventZipInput');
const travelFeeInput = document.getElementById('travelFeeInput');
const travelEstimate = document.getElementById('travelEstimate');
[eventCityInput, eventStateInput, eventZipInput, travelFeeInput].forEach(input => input?.addEventListener('input', updateSummary));
let addressAbortController = null;
const addressCache = new Map();
const fallbackAddressSuggestions = [
  { formatted: '840 64th St, Brooklyn, NY 11220, United States' },
  { formatted: '6202 18th Ave, Brooklyn, NY 11204, United States' },
  { formatted: '2655 Richmond Ave, Staten Island, NY 10314, United States' },
  { formatted: '55 Victory Blvd, Staten Island, NY 10301, United States' },
  { formatted: '136-20 Roosevelt Ave, Flushing, NY 11354, United States' },
  { formatted: '1000 Northern Blvd, Great Neck, NY 11021, United States' },
  { formatted: '160 Walt Whitman Rd, Huntington Station, NY 11746, United States' },
  { formatted: '1 Garden State Plaza Blvd, Paramus, NJ 07652, United States' },
  { formatted: '30 Mall Dr W, Jersey City, NJ 07310, United States' },
  { formatted: '1 Greenwich Ave, Greenwich, CT 06830, United States' },
  { formatted: '125 Main St, Westport, CT 06880, United States' }
];


function ordinalSuffixForStreetNumber(value) {
  const n = Math.abs(Number(value));
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function normalizeLooseStreetQuery(raw) {
  let q = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!q) return q;
  q = q
    .replace(/\bstr\.?\b/gi, 'St')
    .replace(/\bstreet\b/gi, 'St')
    .replace(/\bav\.?\b/gi, 'Ave')
    .replace(/\bavenue\b/gi, 'Ave')
    .replace(/\broad\b/gi, 'Rd')
    .replace(/\bboulevard\b/gi, 'Blvd');

  // Handles common NYC typing like "546 57st", "546 57 st", or "546 57".
  q = q.replace(/^\s*(\d+)\s+(\d{1,3})(?:\s*(st|nd|rd|th))?(?:\s*(st|street))?\b/i, (match, house, streetNo) => {
    return `${house} ${streetNo}${ordinalSuffixForStreetNumber(streetNo)} St`;
  });
  return q;
}

function buildGeoapifyQueryVariants(query) {
  const clean = String(query || '').trim().replace(/\s+/g, ' ');
  const normalized = normalizeLooseStreetQuery(clean);
  const variants = [];
  const push = (value) => {
    const v = String(value || '').trim();
    if (v && !variants.includes(v)) variants.push(v);
  };

  // Prefer normalized search first. This makes fuzzy input like "546 57st" search as "546 57th St" before raw typo results.
  push(normalized);
  if (!/\b(ny|new york|brooklyn|queens|staten island|long island|nj|new jersey|ct|connecticut|\d{5})\b/i.test(normalized)) {
    push(`${normalized}, Brooklyn, NY`);
    push(`${normalized}, Brooklyn, NY 11220`);
    push(`${normalized}, New York, NY`);
    push(`${normalized}, Staten Island, NY`);
    push(`${normalized}, Long Island, NY`);
  }
  push(clean);
  if (!/\b(ny|new york|brooklyn|queens|staten island|long island|nj|new jersey|ct|connecticut|\d{5})\b/i.test(clean)) {
    push(`${clean}, Brooklyn, NY`);
    push(`${clean}, New York, NY`);
  }
  // Do not run too many sequential map searches. Too many calls can leave the UI stuck on "Searching".
  return variants.slice(0, 6);
}

function addressAlreadyHasRegion(value = '') {
  return /\b(brooklyn|queens|staten island|long island|manhattan|bronx|ny|new york|nj|new jersey|ct|connecticut|\d{5})\b/i.test(value);
}

function parseAddressRegionParts(value = '') {
  const text = String(value || '');
  const zip = (text.match(/\b\d{5}(?:-\d{4})?\b/) || [''])[0];
  let state = '';
  if (/\b(ny|new york|brooklyn|queens|staten island|manhattan|bronx|long island)\b/i.test(text)) state = 'NY';
  else if (/\b(nj|new jersey)\b/i.test(text)) state = 'NJ';
  else if (/\b(ct|connecticut)\b/i.test(text)) state = 'CT';
  return { zip, state };
}

function normalizeStateCode(value = '') {
  const text = String(value || '').trim();
  if (/^(NY|NEW YORK)$/i.test(text)) return 'NY';
  if (/^(NJ|NEW JERSEY)$/i.test(text)) return 'NJ';
  if (/^(CT|CONNECTICUT)$/i.test(text)) return 'CT';
  return text.toUpperCase();
}

function parseFullAddressParts(value = '') {
  const raw = String(value || '').replace(/,\s*United States(?: of America)?\.?$/i, '').trim();
  const pieces = raw.split(',').map(x => x.trim()).filter(Boolean);
  const street = pieces[0] || raw;
  let city = pieces[1] || '';
  let state = '';
  let zip = '';
  const tail = pieces.slice(1).join(' ');
  const zipMatch = tail.match(/\b\d{5}(?:-\d{4})?\b/);
  if (zipMatch) zip = zipMatch[0];
  const stateMatch = tail.match(/\b(NY|NJ|CT|New York|New Jersey|Connecticut)\b/i);
  if (stateMatch) state = normalizeStateCode(stateMatch[1]);
  if (!city) {
    if (/brooklyn/i.test(raw)) city = 'Brooklyn';
    else if (/staten island/i.test(raw)) city = 'Staten Island';
    else if (/flushing/i.test(raw)) city = 'Flushing';
    else if (/queens/i.test(raw)) city = 'Queens';
    else if (/new york/i.test(raw)) city = 'New York';
    else if (/jersey city/i.test(raw)) city = 'Jersey City';
    else if (/paramus/i.test(raw)) city = 'Paramus';
    else if (/greenwich/i.test(raw)) city = 'Greenwich';
  }
  if (!state) state = parseAddressRegionParts(raw).state;
  if (!zip) zip = parseAddressRegionParts(raw).zip || quickZipForNYCAddress(raw);
  const boroughFromRaw = nycBoroughFromText(raw);
  if (boroughFromRaw) city = boroughFromRaw;
  city = cityFromZipFallback(zip, city);
  return { street, city, state, zip };
}

function nycBoroughFromText(value = '') {
  const text = String(value || '').toLowerCase();
  if (/\bbrooklyn\b|\bkings county\b/.test(text)) return 'Brooklyn';
  if (/\bqueens\b|\bqueens county\b|\bflushing\b|\bastoria\b|\blong island city\b/.test(text)) return 'Queens';
  if (/\bbronx\b|\bbronx county\b/.test(text)) return 'Bronx';
  if (/\bstaten island\b|\brichmond county\b/.test(text)) return 'Staten Island';
  if (/\bmanhattan\b|\bnew york county\b/.test(text)) return 'New York';
  return '';
}

function cityFromZipFallback(zip = '', currentCity = '') {
  const z = String(zip || '').trim();
  const city = String(currentCity || '').trim();
  if (/^112/.test(z)) return 'Brooklyn';
  if (/^(111|113|114|116)/.test(z)) return 'Queens';
  if (/^104/.test(z)) return 'Bronx';
  if (/^103/.test(z)) return 'Staten Island';
  if (/^(100|101|102)/.test(z)) return 'New York';
  return city;
}

function cityFromGeoapifyProps(props = {}) {
  // Geoapify often returns Brooklyn addresses as city=New York and borough/district/suburb=Brooklyn.
  // For operations, route grouping, and customer clarity, Phoenix should show the NYC borough when available.
  const borough = nycBoroughFromText([
    props.borough, props.city_district, props.district, props.suburb, props.county,
    props.address_line2, props.formatted
  ].filter(Boolean).join(' '));
  const rawCity = props.city || props.town || props.village || props.municipality || props.suburb || props.county || '';
  const postcode = props.postcode || props.postal_code || '';
  if (borough) return borough;
  return cityFromZipFallback(postcode, rawCity);
}

function streetLineFromGeoapifyProps(props = {}) {
  return props.address_line1 || [props.housenumber, props.street || props.name].filter(Boolean).join(' ').trim() || props.formatted || '';
}

function applySelectedAddressToFields(item = {}, fields = {}) {
  const parsed = parseFullAddressParts(item.formatted || item.addressLine1 || '');
  const street = item.addressLine1 || parsed.street || item.formatted || '';
  const state = normalizeStateCode(item.state || parsed.state || '');
  const zip = item.postcode || parsed.zip || '';
  const city = cityFromZipFallback(zip, nycBoroughFromText(item.formatted || '') || item.city || parsed.city || '');
  if (fields.address) fields.address.value = street;
  if (fields.lat) fields.lat.value = item.lat || '';
  if (fields.lon) fields.lon.value = item.lon || '';
  if (fields.placeId) fields.placeId.value = item.placeId || '';
  if (fields.city && city) fields.city.value = city;
  if (fields.state && state) fields.state.value = state;
  if (fields.zip && zip) fields.zip.value = zip;
  fields.address?.dispatchEvent(new Event('change', { bubbles: true }));
  fields.city?.dispatchEvent(new Event('input', { bubbles: true }));
  fields.state?.dispatchEvent(new Event('input', { bubbles: true }));
  fields.zip?.dispatchEvent(new Event('input', { bubbles: true }));
}

function quickZipForNYCAddress(value = '') {
  const text = String(value || '').toLowerCase();
  // Practical Brooklyn fallback for common 5th/8th Ave, 55th-59th St Sunset Park addresses.
  if (/brooklyn/.test(text) && /\b5[5-9](st|nd|rd|th)?\s+st\b/.test(text)) return '11220';
  if (/brooklyn/.test(text) && /\b(50|51|52|53|54|55|56|57|58|59|60)\w*\s+st\b/.test(text)) return '11220';
  return '';
}

function buildQuickAddressItem(formatted, line2 = 'Quick standardized suggestion. Choose this if it matches the customer address.') {
  const parsed = parseFullAddressParts(formatted);
  const zip = parsed.zip || quickZipForNYCAddress(formatted);
  const state = parsed.state || (/brooklyn|new york|ny/i.test(formatted) ? 'NY' : '');
  return {
    formatted,
    addressLine1: parsed.street || formatted,
    city: cityFromZipFallback(zip, nycBoroughFromText(formatted) || parsed.city || ''),
    line2,
    lat: '',
    lon: '',
    postcode: zip,
    state,
    placeId: `quick:${formatted}`,
    isManual: true,
    quick: true
  };
}

function makeLocalAddressSuggestions(query) {
  const clean = String(query || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 3) return [];
  const normalized = normalizeLooseStreetQuery(clean);
  const hasRegion = addressAlreadyHasRegion(normalized);
  const suggestions = [];

  if (hasRegion) {
    const regionText = /united states/i.test(normalized) ? normalized : `${normalized}, United States`;
    suggestions.push(buildQuickAddressItem(regionText, 'Quick/fuzzy address option from your typing.'));
  } else {
    suggestions.push(buildQuickAddressItem(`${normalized}, Brooklyn, NY, United States`, 'Fast Brooklyn city/state suggestion while standard map results load.'));
    suggestions.push(buildQuickAddressItem(`${normalized}, New York, NY, United States`, 'NYC backup option while the map search loads.'));
    suggestions.push(buildQuickAddressItem(`${normalized}, Staten Island, NY, United States`, 'Staten Island / NY backup option.'));
  }

  return suggestions;
}
function mergeAddressItems(primary = [], backup = []) {
  const seen = new Set();
  return [...primary, ...backup].filter(item => {
    const key = `${item.formatted}|${item.lat}|${item.lon}`.toLowerCase();
    if (!item.formatted || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

async function fetchJsonWithTimeout(url, signal, ms = 3800) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), ms);
  const onAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url.toString(), { method: 'GET', signal: timeoutController.signal });
    if (!response.ok) throw new Error(`Geoapify request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function getGeoapifyItemsForQuery(query, signal) {
  const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  url.searchParams.set('text', query);
  url.searchParams.set('apiKey', GEOAPIFY_API_KEY);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('filter', 'countrycode:us');
  url.searchParams.set('bias', 'proximity:-73.9857,40.7484');
  const data = await fetchJsonWithTimeout(url, signal, 3800);
  return normalizeGeoapifyItems(data);
}

async function getSmartAddressSuggestions(query, signal) {
  const variants = buildGeoapifyQueryVariants(query);
  // Run the most useful searches in parallel. This fixes the old issue where the dropdown stayed on "Searching" while multiple slow searches ran one-by-one.
  const settled = await Promise.allSettled(variants.map(variant => getGeoapifyItemsForQuery(variant, signal)));
  const all = [];
  settled.forEach(result => {
    if (result.status === 'fulfilled') result.value.forEach(item => all.push(item));
  });
  return mergeAddressItems(all, []);
}

function clearAddressGeoFields() {
  if (addressLatInput) addressLatInput.value = '';
  if (addressLonInput) addressLonInput.value = '';
  if (addressPlaceIdInput) addressPlaceIdInput.value = '';
  if (travelFeeInput) travelFeeInput.value = '0';
  if (travelEstimate) travelEstimate.textContent = 'Travel fee estimate appears after choosing a standard map address.';
}

function normalizeGeoapifyItems(data) {
  const source = Array.isArray(data?.features) ? data.features : Array.isArray(data?.results) ? data.results : [];
  return source.map(item => {
    const props = item.properties || item;
    const coords = item.geometry?.coordinates || [props.lon, props.lat];
    const city = cityFromGeoapifyProps(props);
    const state = normalizeStateCode(props.state_code || props.state || '');
    const addressLine1 = streetLineFromGeoapifyProps(props);
    return {
      formatted: props.formatted || addressLine1 || props.name || '',
      addressLine1,
      city,
      state,
      line2: props.address_line2 || [city, state, props.postcode || props.postal_code].filter(Boolean).join(', '),
      lat: props.lat || coords?.[1] || '',
      lon: props.lon || coords?.[0] || '',
      postcode: props.postcode || props.postal_code || '',
      placeId: props.place_id || props.place_id || ''
    };
  }).filter(item => item.formatted).slice(0, 7);
}

function renderAddressSuggestions(items, message = '') {
  if (!addressSuggestBox || !addressInput) return;
  addressSuggestBox.innerHTML = '';
  if (message) {
    const note = document.createElement('div');
    note.className = 'address-suggest-note';
    note.textContent = message;
    addressSuggestBox.appendChild(note);
  }
  items.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `address-suggestion-btn ${item.quick ? 'quick-standard' : 'map-standard'}`;
    const main = document.createElement('strong');
    main.textContent = item.formatted;
    button.appendChild(main);
    if (item.line2) {
      const sub = document.createElement('small');
      sub.textContent = item.line2;
      button.appendChild(sub);
    }
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      applySelectedAddressToFields(item, { address: addressInput, lat: addressLatInput, lon: addressLonInput, placeId: addressPlaceIdInput, city: eventCityInput, state: eventStateInput, zip: eventZipInput });
      updateTravelEstimateFromCoords(item.lat, item.lon, item.formatted);
      addressSuggestBox.classList.remove('open');
    });
    addressSuggestBox.appendChild(button);
  });
  addressSuggestBox.classList.toggle('open', Boolean((items.length || message) && document.activeElement === addressInput));
}

async function fetchGeoapifyAddressSuggestions(query) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 3) {
    renderAddressSuggestions([], 'Type at least 3 letters of the street address.');
    return;
  }
  const localSuggestions = makeLocalAddressSuggestions(cleanQuery);
  const cacheKey = normalizeLooseStreetQuery(cleanQuery).toLowerCase();
  if (addressCache.has(cacheKey)) {
    renderAddressSuggestions(mergeAddressItems(addressCache.get(cacheKey), localSuggestions));
    return;
  }
  if (addressAbortController) addressAbortController.abort();
  addressAbortController = new AbortController();
  renderAddressSuggestions(localSuggestions, 'Searching map addresses... You can also choose the manual/fuzzy option below.');
  try {
    const items = await getSmartAddressSuggestions(cleanQuery, addressAbortController.signal);
    const merged = mergeAddressItems(items, localSuggestions);
    addressCache.set(cacheKey, merged);
    renderAddressSuggestions(merged, items.length ? 'Choose the standard map address if available.' : 'No exact map result yet. You can choose the fuzzy/manual option or add city/ZIP.');
  } catch (error) {
    if (error.name === 'AbortError') return;
    const normalized = normalizeLooseStreetQuery(cleanQuery).toLowerCase();
    const fallback = fallbackAddressSuggestions.filter(item => item.formatted.toLowerCase().includes(normalized) || item.formatted.toLowerCase().includes(cleanQuery.toLowerCase())).slice(0, 6);
    renderAddressSuggestions(mergeAddressItems(fallback, localSuggestions), fallback.length ? 'Map service paused. Showing fallback examples and manual option.' : 'Map service paused. Choose the fuzzy/manual option or type the full address manually.');
  }
}

const debouncedAddressSearch = debounce(fetchGeoapifyAddressSuggestions, 160);
addressInput?.addEventListener('input', () => {
  clearAddressGeoFields();
  const q = addressInput.value.trim();
  if (q.length >= 3) renderAddressSuggestions(makeLocalAddressSuggestions(q), 'Fast suggestions shown first. Map results will appear below when available.');
  debouncedAddressSearch(addressInput.value);
});
addressInput?.addEventListener('focus', () => {
  if (addressInput.value.trim().length >= 3) debouncedAddressSearch(addressInput.value);
});
addressInput?.addEventListener('blur', () => setTimeout(() => addressSuggestBox?.classList.remove('open'), 180));
addressSuggestBox?.addEventListener('pointerdown', event => event.stopPropagation());
addressSuggestBox?.addEventListener('click', event => event.stopPropagation());


// v32: Membership address autocomplete uses the same smart/fuzzy map search as the booking address.
const memberAddressInput = document.getElementById('memberAddressInput');
const memberAddressSuggestBox = document.getElementById('memberAddressSuggestBox');
const memberAddressLatInput = document.getElementById('memberAddressLat');
const memberAddressLonInput = document.getElementById('memberAddressLon');
const memberAddressPlaceIdInput = document.getElementById('memberAddressPlaceId');
const memberCityInput = document.getElementById('memberCityInput');
const memberStateInput = document.getElementById('memberStateInput');
const memberZipInput = document.getElementById('memberZipInput');
let memberAddressAbortController = null;
const memberAddressCache = new Map();

function clearMemberAddressGeoFields() {
  if (memberAddressLatInput) memberAddressLatInput.value = '';
  if (memberAddressLonInput) memberAddressLonInput.value = '';
  if (memberAddressPlaceIdInput) memberAddressPlaceIdInput.value = '';
}

function renderMemberAddressSuggestions(items, message = '') {
  if (!memberAddressSuggestBox || !memberAddressInput) return;
  memberAddressSuggestBox.innerHTML = '';
  if (message) {
    const note = document.createElement('div');
    note.className = 'address-suggest-note';
    note.textContent = message;
    memberAddressSuggestBox.appendChild(note);
  }
  items.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `address-suggestion-btn ${item.quick ? 'quick-standard' : 'map-standard'}`;
    const main = document.createElement('strong');
    main.textContent = item.formatted;
    button.appendChild(main);
    if (item.line2) {
      const sub = document.createElement('small');
      sub.textContent = item.line2;
      button.appendChild(sub);
    }
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      applySelectedAddressToFields(item, { address: memberAddressInput, lat: memberAddressLatInput, lon: memberAddressLonInput, placeId: memberAddressPlaceIdInput, city: memberCityInput, state: memberStateInput, zip: memberZipInput });
      memberAddressSuggestBox.classList.remove('open');
    });
    memberAddressSuggestBox.appendChild(button);
  });
  memberAddressSuggestBox.classList.toggle('open', Boolean((items.length || message) && document.activeElement === memberAddressInput));
}

async function fetchMemberGeoapifyAddressSuggestions(query) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 3) {
    renderMemberAddressSuggestions([], 'Type at least 3 letters of the address.');
    return;
  }
  const localSuggestions = makeLocalAddressSuggestions(cleanQuery);
  const cacheKey = normalizeLooseStreetQuery(cleanQuery).toLowerCase();
  if (memberAddressCache.has(cacheKey)) {
    renderMemberAddressSuggestions(mergeAddressItems(memberAddressCache.get(cacheKey), localSuggestions));
    return;
  }
  if (memberAddressAbortController) memberAddressAbortController.abort();
  memberAddressAbortController = new AbortController();
  renderMemberAddressSuggestions(localSuggestions, 'Searching map addresses... You can also choose the manual/fuzzy option below.');
  try {
    const items = await getSmartAddressSuggestions(cleanQuery, memberAddressAbortController.signal);
    const merged = mergeAddressItems(items, localSuggestions);
    memberAddressCache.set(cacheKey, merged);
    renderMemberAddressSuggestions(merged, items.length ? 'Choose the standard map address if available.' : 'No exact map result yet. You can choose the fuzzy/manual option or add city/ZIP.');
  } catch (error) {
    if (error.name === 'AbortError') return;
    const normalized = normalizeLooseStreetQuery(cleanQuery).toLowerCase();
    const fallback = fallbackAddressSuggestions.filter(item => item.formatted.toLowerCase().includes(normalized) || item.formatted.toLowerCase().includes(cleanQuery.toLowerCase())).slice(0, 6);
    renderMemberAddressSuggestions(mergeAddressItems(fallback, localSuggestions), fallback.length ? 'Map service paused. Showing fallback examples and manual option.' : 'Map service paused. Choose the fuzzy/manual option or type the full address manually.');
  }
}

const debouncedMemberAddressSearch = debounce(fetchMemberGeoapifyAddressSuggestions, 160);
memberAddressInput?.addEventListener('input', () => {
  clearMemberAddressGeoFields();
  const q = memberAddressInput.value.trim();
  if (q.length >= 3) renderMemberAddressSuggestions(makeLocalAddressSuggestions(q), 'Fast suggestions shown first. Map results will appear below when available.');
  debouncedMemberAddressSearch(memberAddressInput.value);
});
memberAddressInput?.addEventListener('focus', () => {
  if (memberAddressInput.value.trim().length >= 3) debouncedMemberAddressSearch(memberAddressInput.value);
});
memberAddressInput?.addEventListener('blur', () => setTimeout(() => memberAddressSuggestBox?.classList.remove('open'), 180));
memberAddressSuggestBox?.addEventListener('pointerdown', event => event.stopPropagation());
memberAddressSuggestBox?.addEventListener('click', event => event.stopPropagation());


// v11: Native Phoenix Assistant. No third-party branding in the visitor UI.
const aiToggle = document.getElementById('aiToggle');
const aiPanel = document.getElementById('aiPanel');
const aiClose = document.getElementById('aiClose');
const aiMessages = document.getElementById('aiMessages');
const aiForm = document.getElementById('aiForm');
const aiInput = document.getElementById('aiInput');
const aiQuick = document.getElementById('aiQuick');

function addAiMessage(text, who = 'bot', actions = []) {
  if (!aiMessages) return;
  const p = document.createElement('p');
  p.className = who;
  p.textContent = text;
  if (actions.length) {
    const row = document.createElement('span');
    row.className = 'action-row';
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', action.onClick);
      row.appendChild(btn);
    });
    p.appendChild(row);
  }
  aiMessages.appendChild(p);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function setAiOpen(open) {
  aiPanel?.classList.toggle('open', open);
  if (open) setTimeout(() => aiInput?.focus(), 100);
}

function assistantReply(question) {
  const q = question.toLowerCase();
  if (q.includes('book') || q.includes('availability') || q.includes('date') || q.includes('预约')) {
    addAiMessage('Great — choose a date/time on the calendar or start the booking form. We need your name, phone, event address, guest count, package, allergies, rain plan, and parking notes.', 'bot', [
      {label:'Start booking', onClick: () => openBookingModal({package:'Phoenix Hibachi event'})},
      {label:'Go to calendar', onClick: () => document.getElementById('calendar')?.scrollIntoView({behavior:'smooth', block:'start'})}
    ]);
    return;
  }
  if (q.includes('package') || q.includes('price') || q.includes('cost') || q.includes('套餐') || q.includes('价格')) {
    addAiMessage('Packages start at Classic $55/person, Premium $65/person, and Signature $110/person. Minimum charge is based on 10 guests. Add-ons like sushi tray, gyoza, edamame, and noodles can be added during booking.', 'bot', [
      {label:'See packages', onClick: () => document.getElementById('packages')?.scrollIntoView({behavior:'smooth', block:'start'})},
      {label:'Start booking', onClick: () => openBookingModal({package:'Premium'})}
    ]);
    return;
  }
  if (q.includes('allergy') || q.includes('gluten') || q.includes('shellfish') || q.includes('过敏')) {
    addAiMessage('We ask guests to list all allergies before confirmation. Gluten, shellfish, seafood, nuts, egg, dairy, soy, and sesame can be selected in the booking form. Severe allergies require manager review.', 'bot', [
      {label:'Add allergy notes', onClick: () => openBookingModal({package:'Phoenix Hibachi event'})}
    ]);
    return;
  }
  if (q.includes('rain') || q.includes('weather') || q.includes('下雨')) {
    addAiMessage('For rain, we need a safe covered outdoor cooking area such as garage, tent, or covered patio. If unsafe, the manager may reschedule or adjust the plan.', 'bot');
    return;
  }
  if (q.includes('late') || q.includes('delay') || q.includes('迟到')) {
    addAiMessage('Route/weather delays can happen. The booking form asks whether you can accept a 15 or 30 minute chef arrival window, and how long the chef should wait if guests are late.', 'bot');
    return;
  }
  if (q.includes('complaint') || q.includes('refund') || q.includes('feedback') || q.includes('投诉') || q.includes('退钱')) {
    addAiMessage('For existing booking support, please leave your name, phone, event date, and what happened. A manager should review complaints, billing, refund, rain, delay, or food safety issues.', 'bot', [
      {label:'Leave feedback', onClick: () => document.getElementById('booking')?.scrollIntoView({behavior:'smooth', block:'start'})},
      {label:'Contact us', onClick: () => contactModal?.showModal()}
    ]);
    return;
  }
  addAiMessage('I can help with booking, pricing, availability, allergies, rain plans, delays, add-ons, and existing booking support. For faster help, tell me your date, location, guest count, and question.', 'bot', [
    {label:'Start booking', onClick: () => openBookingModal({package:'Phoenix Hibachi event'})},
    {label:'Contact us', onClick: () => contactModal?.showModal()}
  ]);
}

aiToggle?.addEventListener('click', () => setAiOpen(!aiPanel?.classList.contains('open')));
aiClose?.addEventListener('click', () => setAiOpen(false));
aiQuick?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-ai-question]');
  if (!btn) return;
  const q = btn.dataset.aiQuestion;
  addAiMessage(q, 'user');
  assistantReply(q);
});
aiForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const q = aiInput?.value.trim();
  if (!q) return;
  addAiMessage(q, 'user');
  aiInput.value = '';
  assistantReply(q);
});





// v12: prototype order storage, cancellation rules, chef dispatch, and route planning.
const ORDERS_KEY = 'phoenixHibachiOrdersV12';
const FEEDBACK_KEY = 'phoenixHibachiFeedbackV12';
const MEMBERSHIP_KEY = 'phoenixHibachiMembershipApplicationsV22';
const SOCIAL_COUPON_KEY = 'phoenixHibachiSocialCouponRequestsV22';
const ACCEPTING_ORDERS_KEY = 'phoenixHibachiAcceptingOrdersV37';
const PAUSED_BOOKING_DATES_KEY = 'phoenixHibachiPausedBookingDatesV38';
const HIDDEN_PEOPLE_RECORDS_KEY = 'phoenixHibachiHiddenPeopleRecordsV38';
const PEOPLE_MANAGEMENT_KEY = 'phoenixHibachiPeopleManagementV37';
const successModal = document.getElementById('successModal');
const successReceipt = document.getElementById('successReceipt');
const printModal = document.getElementById('printModal');
const printArea = document.getElementById('printArea');
const socialRewardModal = document.getElementById('socialRewardModal');
let lastSubmittedOrder = null;
const dashboardModal = document.getElementById('dashboardModal');
const dashboardTitle = document.getElementById('dashboardTitle');
const dashboardHelp = document.getElementById('dashboardHelp');
const orderList = document.getElementById('orderList');
const chefDispatch = document.getElementById('chefDispatch');
const feedbackList = document.getElementById('feedbackList');
const customerList = document.getElementById('customerList');
const portalLoginForm = document.getElementById('portalLoginForm');
const primaryDashboardHeading = document.getElementById('primaryDashboardHeading');
const dispatchDashboardHeading = document.getElementById('dispatchDashboardHeading');
const calendarSummaryBtn = document.getElementById('calendarSummaryBtn');
const calendarSummaryPanel = document.getElementById('calendarSummaryPanel');
const calendarSummaryMode = document.getElementById('calendarSummaryMode');
const calendarSummaryMonth = document.getElementById('calendarSummaryMonth');
const calendarSummaryDate = document.getElementById('calendarSummaryDate');
const calendarSummaryMonthWrap = document.getElementById('calendarSummaryMonthWrap');
const calendarSummaryDateWrap = document.getElementById('calendarSummaryDateWrap');
const calendarSummaryList = document.getElementById('calendarSummaryList');
let currentDashboardRole = 'Admin';
let currentDashboardTab = 'orders';

const DISPATCH_CONFIG = {
  shop: { name:'Phoenix Hibachi base', lat:40.6306, lon:-74.0093, address:'Brooklyn, NY' },
  averageMph: 28,
  setupBufferMin: 20,
  packBufferMin: 15,
  baseTravelFee: 35,
  feePerMile: 2.25,
  minimumTravelFee: 0
};
const CHEFS = [
  { id:'ken', name:'Chef Ken', phone:'+1 000-000-0101', base:'Brooklyn / Queens', lat:40.6306, lon:-74.0093, maxParties:3 },
  { id:'allen', name:'Chef Allen', phone:'+1 000-000-0102', base:'Staten Island / NJ', lat:40.5795, lon:-74.1502, maxParties:3 },
  { id:'jason', name:'Chef Jason', phone:'+1 000-000-0103', base:'Long Island', lat:40.7359, lon:-73.0821, maxParties:3 },
  { id:'mike', name:'Chef Mike', phone:'+1 000-000-0104', base:'Connecticut / Westchester', lat:41.0262, lon:-73.6282, maxParties:3 }
];

const ROUTE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ROUTE_COLOR_CLASSES = ['route-color-1','route-color-2','route-color-3','route-color-4','route-color-5','route-color-6'];
const routePlanDateSelect = document.getElementById('routePlanDateSelect');
const routeMapBoard = document.getElementById('routeMapBoard');
const routePlanSummary = document.getElementById('routePlanSummary');

function routeLabelForIndex(index) {
  if (index < ROUTE_LETTERS.length) return ROUTE_LETTERS[index];
  return `A${index - ROUTE_LETTERS.length + 1}`;
}
function orderHasCoords(order) {
  const p = orderPoint(order);
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat !== 0 && p.lon !== 0;
}
function routeColorClass(key = '', index = 0) {
  const chefIndex = CHEFS.findIndex(c => c.id === key || c.name === key);
  return ROUTE_COLOR_CLASSES[(chefIndex >= 0 ? chefIndex : index) % ROUTE_COLOR_CLASSES.length];
}
function getRouteDateKeys(orders = []) {
  return [...new Set(orders.map(normalizeDateKey).filter(Boolean))]
    .sort((a,b) => String(a).localeCompare(String(b)));
}
function chooseDefaultRouteDate(orders = []) {
  const keys = getRouteDateKeys(orders);
  if (!keys.length) return '';
  const today = new Date();
  today.setHours(0,0,0,0);
  const future = keys.find(key => {
    if (key === 'Date pending') return false;
    const parts = String(key).split('-').map(Number);
    if (parts.length !== 3) return false;
    const dt = new Date(parts[0], parts[1]-1, parts[2]);
    return dt >= today;
  });
  return future || keys[0];
}
function ordersForRouteDate(orders = [], dateKey = '') {
  const sorted = [...orders].sort((a,b) => (parseOrderDateTime(a)?.getTime() || 0) - (parseOrderDateTime(b)?.getTime() || 0));
  return sorted.filter(o => !dateKey || normalizeDateKey(o) === dateKey).map((order, index) => ({...order, routeLabel: routeLabelForIndex(index)}));
}
function buildPointToPointPlan(orders = []) {
  const byDate = orders.reduce((acc, order) => {
    const key = normalizeDateKey(order);
    (acc[key] ||= []).push(order);
    return acc;
  }, {});
  const planned = [];
  Object.entries(byDate).sort(([a],[b]) => String(a).localeCompare(String(b))).forEach(([, rows]) => {
    const dayRows = [...rows].sort((a,b) => (parseOrderDateTime(a)?.getTime() || 0) - (parseOrderDateTime(b)?.getTime() || 0));
    const dayPlan = [];
    dayRows.forEach((order, index) => {
      const assigned = autoAssignOrder({...order, routeLabel: routeLabelForIndex(index)}, [...planned, ...dayPlan]);
      dayPlan.push({...assigned, routeLabel: routeLabelForIndex(index)});
    });
    planned.push(...dayPlan);
  });
  // Save newest first to keep the rest of the dashboard behavior consistent.
  return planned.sort((a,b) => (parseOrderDateTime(b)?.getTime() || 0) - (parseOrderDateTime(a)?.getTime() || 0));
}
function syncRouteDateSelect(orders = []) {
  if (!routePlanDateSelect) return '';
  const keys = getRouteDateKeys(orders);
  const previous = routePlanDateSelect.value;
  const selected = keys.includes(previous) ? previous : chooseDefaultRouteDate(orders);
  routePlanDateSelect.innerHTML = keys.length
    ? keys.map(key => `<option value="${escapeHtml(key)}" ${key === selected ? 'selected' : ''}>${escapeHtml(shortDateHeading(key))}</option>`).join('')
    : '<option value="">No orders</option>';
  return selected;
}
function projectRoutePoints(rows = []) {
  const withCoords = rows.filter(orderHasCoords);
  const pointsSource = withCoords.length >= 2 ? withCoords : rows;
  const lats = pointsSource.map(o => orderHasCoords(o) ? Number(o.addressLat) : 40.55 + (rows.indexOf(o) * 0.035));
  const lons = pointsSource.map(o => orderHasCoords(o) ? Number(o.addressLon) : -74.18 + (rows.indexOf(o) * 0.055));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latRange = Math.max(0.02, maxLat - minLat);
  const lonRange = Math.max(0.02, maxLon - minLon);
  return rows.map((order, index) => {
    const has = orderHasCoords(order);
    const lat = has ? Number(order.addressLat) : 40.55 + (index * 0.035);
    const lon = has ? Number(order.addressLon) : -74.18 + (index * 0.055);
    const x = 8 + ((lon - minLon) / lonRange) * 84;
    const y = 92 - ((lat - minLat) / latRange) * 84;
    return { order, index, x: Math.max(7, Math.min(93, x)), y: Math.max(8, Math.min(92, y)), hasCoords: has };
  });
}
function routeGroupsForRows(rows = []) {
  const groups = new Map();
  rows.forEach((order) => {
    const key = order.assignedChefId || order.assignedChef || 'unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  });
  return [...groups.entries()].map(([key, group], idx) => ({
    key,
    label: group[0]?.assignedChef || CHEFS.find(c => c.id === key)?.name || 'Needs chef',
    colorClass: routeColorClass(key, idx),
    rows: group.sort((a,b) => (parseOrderDateTime(a)?.getTime() || 0) - (parseOrderDateTime(b)?.getTime() || 0))
  }));
}
function renderRoutePlanner(orders = [], role = currentDashboardRole) {
  if (!routeMapBoard || !routePlanSummary || !routePlanDateSelect) return;
  if (!['Admin','Manager','Customer Service','Chef'].includes(role)) {
    routeMapBoard.innerHTML = '<div class="empty-state">Route map is only visible to staff and chef accounts.</div>';
    routePlanSummary.innerHTML = '';
    return;
  }
  const selectedDate = syncRouteDateSelect(orders);
  const rows = ordersForRouteDate(orders, selectedDate);
  if (!rows.length) {
    routeMapBoard.innerHTML = '<div class="empty-state">No orders to map yet.</div>';
    routePlanSummary.innerHTML = '';
    return;
  }
  const projected = projectRoutePoints(rows);
  const pointById = new Map(projected.map(p => [String(p.order.id), p]));
  const groups = routeGroupsForRows(rows);
  const lines = groups.map(group => {
    const pts = group.rows.map(o => pointById.get(String(o.id))).filter(Boolean);
    if (pts.length < 2) return '';
    const path = pts.map((pt,i) => `${i ? 'L' : 'M'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ');
    return `<path class="route-line ${group.colorClass}" d="${path}" />`;
  }).join('');
  const markers = projected.map((pt) => {
    const order = pt.order;
    const groupIndex = groups.findIndex(g => g.rows.some(o => String(o.id) === String(order.id)));
    const colorClass = groups[groupIndex]?.colorClass || routeColorClass('', pt.index);
    const mapUrl = searchMapUrl(order.address);
    return `<a href="${mapUrl}" target="_blank" rel="noreferrer" aria-label="Open map for order ${escapeHtml(order.routeLabel)}"><g class="route-marker ${colorClass}"><circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="5.2"></circle><text x="${pt.x.toFixed(2)}" y="${(pt.y + 1.8).toFixed(2)}">${escapeHtml(order.routeLabel)}</text></g></a>`;
  }).join('');
  const labels = projected.map(pt => {
    const order = pt.order;
    return `<div class="route-map-label" style="left:${pt.x}%;top:${pt.y}%"><b>${escapeHtml(order.routeLabel)}</b><span>${escapeHtml(firstReadableTime(order.eventTime || ''))}</span></div>`;
  }).join('');
  routeMapBoard.innerHTML = `<div class="route-map-canvas"><svg viewBox="0 0 100 100" role="img" aria-label="Phoenix Hibachi route map"><rect x="0" y="0" width="100" height="100" rx="8" class="route-map-bg"></rect><path class="route-grid" d="M10 25 H90 M10 50 H90 M10 75 H90 M25 10 V90 M50 10 V90 M75 10 V90"></path>${lines}${markers}</svg>${labels}</div>`;
  const missing = rows.filter(o => !orderHasCoords(o)).length;
  const legend = groups.map(group => `<span class="route-legend ${group.colorClass}"><i></i>${escapeHtml(group.label)} · ${group.rows.map(o => o.routeLabel).join(' → ')}</span>`).join('');
  const routeList = rows.map(order => {
    const m = calculateOrderMoney(order);
    const next = rows[rows.indexOf(order)+1];
    const drive = next ? estimateTravelMinutes(milesBetween(orderPoint(order), orderPoint(next))) : null;
    return `<article class="route-stop"><strong>${escapeHtml(order.routeLabel)} · ${escapeHtml(firstReadableTime(order.eventTime || 'Time pending'))}</strong><span>${escapeHtml(order.name || 'Guest')} · ${escapeHtml(order.address || 'No address')}</span><small>${escapeHtml(order.assignedChef || 'Needs chef')} · ${m.totalGuests} guests · ${drive ? `${drive} min to next stop` : 'last stop'}</small></article>`;
  }).join('');
  routePlanSummary.innerHTML = `<div class="route-legend-row">${legend}</div>${missing ? `<p class="route-warning">${missing} order(s) do not have saved map coordinates yet. Use the standard Geoapify address suggestion, not the manual/fuzzy option, so the map can place them accurately.</p>` : ''}<p class="small-muted">Live traffic routing requires Geoapify Routing or Google Distance Matrix. This panel can label A/B/C and draw a review map when orders have latitude/longitude.</p><div class="route-stop-list">${routeList}</div>`;
}

function generateOrderId(prefix = 'PHX') {
  const stamp = new Date().toISOString().slice(2,10).replace(/-/g,'');
  const rand = Math.random().toString(36).slice(2,6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}
function getStoredOrders() { try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); } catch { return []; } }
function saveStoredOrders(orders) { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }
function getStoredFeedback() { try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]'); } catch { return []; } }
function getCheckedValues(form, name) { return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
function milesBetween(a, b) {
  if (!a?.lat || !a?.lon || !b?.lat || !b?.lon) return null;
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLon = toRad(Number(b.lon) - Number(a.lon));
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function estimateTravelMinutes(miles) {
  if (miles == null) return 45;
  return Math.max(12, Math.round((miles / DISPATCH_CONFIG.averageMph) * 60 + 10));
}
function estimateTravelFeeByMiles(miles) {
  if (miles == null) return 50;
  if (miles < 8) return 0;
  return Math.ceil((DISPATCH_CONFIG.baseTravelFee + miles * DISPATCH_CONFIG.feePerMile) / 5) * 5;
}
function updateTravelEstimateFromCoords(lat, lon, formatted = '') {
  const miles = milesBetween(DISPATCH_CONFIG.shop, {lat, lon});
  const fee = estimateTravelFeeByMiles(miles);
  if (travelFeeInput) travelFeeInput.value = String(fee);
  if (travelEstimate) travelEstimate.innerHTML = miles == null
    ? 'Travel fee will be confirmed by manager after address review.'
    : `Estimated travel from base: <strong>${miles.toFixed(1)} mi</strong> · estimated travel fee: <strong>$${fee}</strong>. Final fee depends on tolls, parking and chef route.`;
}
function parseOrderDateTime(order) {
  const time = firstReadableTime(order.eventTime || '4:00 PM');
  const raw = `${order.eventDate || ''} ${time}`.replace(/,/g,'');
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function addMinutes(date, minutes) { return new Date(date.getTime() + minutes * 60000); }
function eventBlockMinutes(order) {
  const total = Number(order.totalGuests || 10);
  const cookBlocks = Math.max(1, Math.ceil(total / 15));
  const cook = cookBlocks * 60;
  return cook + DISPATCH_CONFIG.setupBufferMin + DISPATCH_CONFIG.packBufferMin;
}
function canCancelOrder(order) {
  const eventStart = parseOrderDateTime(order);
  if (!eventStart) return false;
  return (eventStart.getTime() - Date.now()) > 48 * 60 * 60 * 1000;
}
function cancellationMessage(order) {
  return canCancelOrder(order)
    ? 'Eligible: more than 48 hours before event. Customer can request cancellation for manager review.'
    : 'Inside 48 hours: deposit is non-refundable. Reschedule only, subject to chef availability.';
}
function orderPoint(order) {
  return { lat:Number(order.addressLat || 0), lon:Number(order.addressLon || 0) };
}
function routeMapUrl(fromAddress, toAddress) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromAddress || 'Brooklyn, NY')}&destination=${encodeURIComponent(toAddress || 'Brooklyn, NY')}&travelmode=driving`;
}
function searchMapUrl(address) { return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '#'; }
function satelliteMapUrl(address) { return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}&basemap=satellite` : '#'; }
function dispatchCheckForChef(order, chef, orders) {
  const start = parseOrderDateTime(order) || new Date();
  const blockMin = eventBlockMinutes(order);
  const end = addMinutes(start, blockMin);
  const candidatePoint = orderPoint(order);
  const sameChefOrders = orders
    .filter(o => o.id !== order.id && (o.assignedChefId === chef.id || o.assignedChef === chef.name))
    .filter(o => parseOrderDateTime(o)?.toDateString() === start.toDateString())
    .sort((a,b) => parseOrderDateTime(a) - parseOrderDateTime(b));
  const previous = [...sameChefOrders].reverse().find(o => parseOrderDateTime(o) < start);
  const next = sameChefOrders.find(o => parseOrderDateTime(o) > start);
  const baseToOrderMiles = milesBetween({lat:chef.lat, lon:chef.lon}, candidatePoint) ?? 18;
  let previousTravelMin = estimateTravelMinutes(baseToOrderMiles);
  let previousAddress = chef.base;
  if (previous) {
    const prevEnd = addMinutes(parseOrderDateTime(previous), eventBlockMinutes(previous));
    previousTravelMin = estimateTravelMinutes(milesBetween(orderPoint(previous), candidatePoint));
    previousAddress = previous.address;
    const arrivalEarliest = addMinutes(prevEnd, previousTravelMin);
    if (arrivalEarliest > start) {
      return { ok:false, score:9999, reason:`Cannot connect from previous order ${previous.id}. Needs ${previousTravelMin} min drive after ${prevEnd.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}.`, previous, next:null, travelMin:previousTravelMin, miles:baseToOrderMiles };
    }
  }
  if (next) {
    const toNextTravelMin = estimateTravelMinutes(milesBetween(candidatePoint, orderPoint(next)));
    const latestLeave = addMinutes(end, toNextTravelMin);
    const nextStart = parseOrderDateTime(next);
    if (latestLeave > nextStart) {
      return { ok:false, score:9999, reason:`Cannot reach next order ${next.id}. Needs ${toNextTravelMin} min drive after this party ends.`, previous, next, travelMin:toNextTravelMin, miles:baseToOrderMiles };
    }
  }
  const ordersToday = sameChefOrders.length;
  if (ordersToday >= chef.maxParties) {
    return { ok:false, score:9999, reason:`${chef.name} already has ${ordersToday} parties that day.`, previous, next, travelMin:previousTravelMin, miles:baseToOrderMiles };
  }
  const score = previousTravelMin + (ordersToday * 18) + baseToOrderMiles;
  const reason = previous
    ? `Best chain after ${previous.id}. Estimated ${previousTravelMin} min drive from previous order.`
    : `Starts from ${chef.base}. Estimated ${previousTravelMin} min drive to first order.`;
  return { ok:true, score, reason, previous, next, travelMin:previousTravelMin, miles:baseToOrderMiles, previousAddress };
}
function autoAssignOrder(order, existingOrders = getStoredOrders()) {
  const checks = CHEFS.map(chef => ({ chef, ...dispatchCheckForChef(order, chef, existingOrders) }));
  const best = checks.filter(x => x.ok).sort((a,b) => a.score - b.score)[0] || checks.sort((a,b) => a.score - b.score)[0];
  const travelFee = order.travelFee || estimateTravelFeeByMiles(best?.miles);
  return {
    ...order,
    assignedChef: best?.chef?.name || 'Unassigned',
    assignedChefId: best?.chef?.id || '',
    assignmentStatus: best?.ok ? 'Auto assigned · needs manager confirmation' : 'Needs manual dispatch review',
    assignmentReason: best?.reason || 'No route found yet.',
    estimatedDriveMin: best?.travelMin || 45,
    estimatedDistanceMiles: best?.miles ? Number(best.miles.toFixed(1)) : '',
    eventBlockMin: eventBlockMinutes(order),
    travelFee: travelFee || 0,
    routeFromAddress: best?.previousAddress || best?.chef?.base || DISPATCH_CONFIG.shop.address
  };
}

function assignOrderToSpecificChef(order, chefId, existingOrders = getStoredOrders()) {
  const chef = CHEFS.find(c => c.id === chefId);
  if (!chef) return {...order, assignedChef:'Unassigned', assignedChefId:'', assignmentStatus:'Manual review', assignmentReason:'No chef selected yet.'};
  const check = dispatchCheckForChef(order, chef, existingOrders.filter(o => o.id !== order.id));
  return {
    ...order,
    assignedChef: chef.name,
    assignedChefId: chef.id,
    assignmentStatus: check.ok ? 'Manually assigned · route fits' : 'Manually assigned · route conflict warning',
    assignmentReason: check.reason,
    estimatedDriveMin: check.travelMin || 45,
    estimatedDistanceMiles: check.miles ? Number(check.miles.toFixed(1)) : '',
    eventBlockMin: eventBlockMinutes(order),
    routeFromAddress: check.previousAddress || chef.base,
    travelFee: order.travelFee || estimateTravelFeeByMiles(check.miles)
  };
}
function autoDispatchAll() {
  const planned = buildPointToPointPlan(getDashboardOrders());
  saveStoredOrders(planned);
  if (Array.isArray(remoteOrdersCache)) {
    const plannedById = new Map(planned.map(o => [String(o.id), o]));
    remoteOrdersCache = remoteOrdersCache.map(o => plannedById.get(String(o.id)) || o);
  }
  renderDashboard(currentDashboardRole);
}
function fullAddressFromParts(street = '', city = '', state = '', zip = '') {
  const parts = [];
  const line1 = String(street || '').trim();
  const cityText = String(city || '').trim();
  const stateText = String(state || '').trim().toUpperCase();
  const zipText = String(zip || '').trim();
  if (line1) parts.push(line1);
  const region = [cityText, stateText, zipText].filter(Boolean).join(', ').replace(/, (\d{5})$/, ' $1');
  if (region) parts.push(region);
  return parts.join(', ');
}

function buildOrderFromForm(form) {
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  const addons = getCheckedValues(form, 'addons');
  const allergies = getCheckedValues(form, 'allergy');
  const baseOrder = {
    id: generateOrderId('PHX'), createdAt: new Date().toISOString(), status: 'New request',
    name: data.name || '', phone: data.phone || '', email: data.email || '', eventType: data.eventType || '', address: fullAddressFromParts(data.address, data.city, data.state, data.zip) || data.address || '',
    addressLat: data.addressLat || '', addressLon: data.addressLon || '', addressPlaceId: data.addressPlaceId || '', city: data.city || '', state: data.state || '', zip: data.zip || '',
    package: data.package || bookingState.package, adults: data.adults || bookingState.adults, kids: data.kids || bookingState.kids,
    totalGuests: data.totalGuests || physicalGuestCount(bookingState), billableGuests: data.billableGuests || actualBillableGuestCount(bookingState), eventDate: data.eventDate || selectedDateInput?.value || '', eventTime: (data.customTimeRequest ? `Requested: ${data.customTimeRequest}` : (data.eventTime || selectedTimeInput?.value || '')),
    customTimeRequest: data.customTimeRequest || '', addons, allergies, allergyNotes: data.allergyNotes || '', rainPlan: data.rainPlan || '', arrivalFlex: data.arrivalFlex || '', guestDelay: data.guestDelay || '', parking: data.parking || '', specialNotes: data.specialNotes || '',
    proteinSelections: (() => { try { return JSON.parse(data.proteinSelections || '{}'); } catch { return bookingState.proteins || {}; } })(),
    proteinSummary: data.proteinSummary || proteinSummary(bookingState.proteins || {}),
    proteinUpcharge: Number(data.proteinUpcharge || bookingState.proteinUpcharge || 0),
    travelFee: Number(data.travelFee || 0), depositRequired: MONEY_RULES.depositRequired, depositPaid: Number(data.depositPaid || 0), couponDiscount: Number(data.couponDiscount || 0), memberCreditUsed: Number(data.memberCreditUsed || 0), cancellationPolicy: cancellationMessage({eventDate:data.eventDate, eventTime:data.eventTime})
  };
  return autoAssignOrder(baseOrder, getStoredOrders());
}

function money(value) {
  const n = Number(value || 0);
  return '$' + (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2));
}
function moneyPlain(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2);
}
function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeAddonsForMoney(addons = []) {
  return (Array.isArray(addons) ? addons : []).map(item => {
    if (typeof item === 'string') return { name:item, price: ADDON_PRICE_MAP[item] || 0 };
    return { name:item.name || item.label || String(item), price:Number(item.price || ADDON_PRICE_MAP[item.name] || 0) };
  });
}
function inferOrderState(order = {}) {
  const raw = String(order.state || order.eventState || '').trim().toUpperCase();
  if (raw) return raw.replace(/[^A-Z]/g, '').slice(0,2);
  const address = String(order.address || '').toUpperCase();
  if (/\bNJ\b|NEW JERSEY/.test(address)) return 'NJ';
  if (/\bCT\b|CONNECTICUT/.test(address)) return 'CT';
  if (/\bNY\b|NEW YORK|BROOKLYN|QUEENS|STATEN ISLAND|BRONX|MANHATTAN|LONG ISLAND|NASSAU|SUFFOLK/.test(address)) return 'NY';
  const zip = String(order.zip || '').trim();
  if (/^0[67]/.test(zip)) return 'NJ';
  if (/^06/.test(zip)) return 'CT';
  if (/^1/.test(zip)) return 'NY';
  return 'NY';
}
function salesTaxRateForOrder(order = {}) {
  const state = inferOrderState(order);
  const address = String(order.address || '').toUpperCase();
  const zip = String(order.zip || '').trim();
  if (state === 'NJ') return 0.06625;
  if (state === 'CT') return 0.0635;
  if (state === 'NY') {
    if (/^11[5789]/.test(zip) || /LONG ISLAND|NASSAU|SUFFOLK/.test(address)) return 0.08625;
    return 0.08875;
  }
  return 0;
}
function salesTaxLabelForOrder(order = {}) {
  const state = inferOrderState(order);
  const rate = salesTaxRateForOrder(order);
  if (state === 'NY') {
    const address = String(order.address || '').toUpperCase();
    const zip = String(order.zip || '').trim();
    const area = (/^11[5789]/.test(zip) || /LONG ISLAND|NASSAU|SUFFOLK/.test(address)) ? 'NY / Long Island est.' : 'NYC / NY est.';
    return `${area} ${(rate * 100).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}%`;
  }
  return `${state || 'Tax'} ${(rate * 100).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}%`;
}
function calculateOrderMoney(order = {}) {
  const adults = Math.max(0, numberValue(order.adults, 0));
  const kids = Math.max(0, numberValue(order.kids, 0));
  const totalGuests = Math.max(adults + kids, numberValue(order.totalGuests, 0));
  const billableGuests = billableGuestCount({...order, adults, kids});
  const packageName = order.package || 'Classic';
  const packagePrice = packagePrices[packageName] || packagePrices.Classic;
  const adultFoodTotal = adults * packagePrice;
  // Guest-facing kids price is set at half package price in this invoice template. Change here if you want kids charged differently.
  const kidFoodPrice = packagePrice / 2;
  const kidFoodTotal = kids * kidFoodPrice;
  const minimumFoodTotal = MONEY_RULES.minimumBillableGuests * packagePrice;
  const packageSubtotal = billableGuests * packagePrice;
  const addons = normalizeAddonsForMoney(order.addons);
  const addonsTotal = addons.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const proteinSelections = order.proteinSelections && Object.keys(order.proteinSelections).length ? order.proteinSelections : proteinSelectionsFromText(order.specialNotes || '');
  const proteinSelectedTotal = proteinTotal(proteinSelections);
  const proteinRequiredTotal = requiredProteinPortions({package: packageName, adults, kids, totalGuests, billableGuests});
  const proteinPremiumCount = premiumProteinCount(proteinSelections);
  const proteinUpcharge = Math.max(0, numberValue(order.proteinUpcharge, proteinUpgradeAmount(proteinSelections)));
  const foodSubtotal = packageSubtotal + proteinUpcharge + addonsTotal;
  const discount = Math.max(0, numberValue(order.couponDiscount, 0) + numberValue(order.memberCreditUsed, 0));
  const depositRequired = numberValue(order.depositRequired, MONEY_RULES.depositRequired);
  const depositPaid = Math.max(0, numberValue(order.depositPaid ?? order.deposit_amount, 0));
  const travelFee = Math.max(0, numberValue(order.travelFee, 0));
  const companyFoodTotalAfterDiscount = Math.max(0, foodSubtotal - discount);
  const taxRate = salesTaxRateForOrder(order);
  const taxLabel = salesTaxLabelForOrder(order);
  const taxableSubtotal = Math.max(0, companyFoodTotalAfterDiscount + travelFee);
  const salesTax = Math.round(taxableSubtotal * taxRate * 100) / 100;
  const companyBalanceDue = Math.max(0, companyFoodTotalAfterDiscount + salesTax - depositPaid);
  const guestTotalBeforeDeposit = companyFoodTotalAfterDiscount + travelFee + salesTax;
  const guestTotalAfterDeposit = Math.max(0, guestTotalBeforeDeposit - depositPaid);
  const chefGuestRaw = adults * MONEY_RULES.chefAdultRate + kids * MONEY_RULES.chefKidRate;
  const chefGuestPayout = Math.max(MONEY_RULES.chefMinimumPayout, chefGuestRaw);
  const chefKeepsBeforeTip = chefGuestPayout + travelFee;
  const chefReturnToCompany = Math.max(0, companyBalanceDue - chefGuestPayout);
  const ownerOwesChef = Math.max(0, chefGuestPayout - companyBalanceDue);
  const tip20 = Math.round(guestTotalBeforeDeposit * 0.20);
  const tip25 = Math.round(guestTotalBeforeDeposit * 0.25);
  const tip30 = Math.round(guestTotalBeforeDeposit * 0.30);
  return { adults, kids, totalGuests, billableGuests, packageName, packagePrice, adultFoodTotal, kidFoodPrice, kidFoodTotal, minimumFoodTotal, packageSubtotal, proteinSelections, proteinSelectedTotal, proteinRequiredTotal, proteinPremiumCount, proteinUpcharge, addons, addonsTotal, foodSubtotal, discount, depositRequired, depositPaid, travelFee, taxRate, taxLabel, taxableSubtotal, salesTax, companyFoodTotalAfterDiscount, companyBalanceDue, guestTotalBeforeDeposit, guestTotalAfterDeposit, chefGuestRaw, chefGuestPayout, chefKeepsBeforeTip, chefReturnToCompany, ownerOwesChef, tip20, tip25, tip30 };
}
function invoiceDateLine(order) {
  return [order.eventDate, order.eventTime].filter(Boolean).join(' ');
}
function printSafe(value) { return escapeHtml(value ?? ''); }
function guestInvoiceHtml(order) {
  const m = calculateOrderMoney(order);
  const ref = printSafe(order.id || generateOrderId('PHX'));
  const addonsRows = m.addons.length ? m.addons.map(item => `<div class="invoice-row"><span>${printSafe(item.name)}</span><span>Total: ${money(item.price)}</span></div>`).join('') : `<div class="invoice-row"><span>Add-ons</span><span>Total: $0</span></div>`;
  const premiumProteinRow = m.proteinUpcharge > 0 ? `<div class="invoice-row"><span>Premium protein upgrade</span><em>${m.proteinPremiumCount || 0} × $5</em><b>Total: ${money(m.proteinUpcharge)}</b></div>` : '';
  const proteinLine = `${m.proteinSelectedTotal || 0}/${m.proteinRequiredTotal || 0} portions ${proteinSummary(m.proteinSelections)}`;
  const allergies = (order.allergies || []).join(', ') || order.allergyNotes || 'None listed';
  return `<section class="guest-invoice">
    <div class="invoice-top-line"></div>
    <div class="invoice-ref">Ref ID: ${ref}</div>
    <div class="invoice-brand"><strong>PHOENIX HIBACHI</strong><span>347-471-9190</span><span>www.phoenixhibachi.com</span></div>
    <div class="invoice-main-grid">
      <div class="invoice-labels">
        <div><b>When:</b><span>${printSafe(invoiceDateLine(order))}</span></div>
        <div><b>Name:</b><span>${printSafe(order.name)}</span></div>
        <div><b>Phone:</b><span>${printSafe(order.phone)}</span></div>
        <div><b>Address:</b><span>${printSafe(order.address)}</span></div>
        <div><b>Number of Adult:</b><span>${m.adults}</span></div>
        <div><b>Number of Kids:</b><span>${m.kids}</span></div>
      </div>
      <div class="invoice-money-block">
        <div class="invoice-row"><span>Adult</span><em>Total: ${m.adults}</em><b>Total: ${money(m.adultFoodTotal)}</b></div>
        <div class="invoice-row"><span>Kid</span><em>Total: ${m.kids}</em><b>Total: ${money(m.kidFoodTotal)}</b></div>
        <div class="invoice-row"><span>Package charge</span><em>${printSafe(m.packageName)}</em><b>Total: ${money(m.packageSubtotal)}</b></div>
        ${premiumProteinRow}
        ${addonsRows}
        <div class="invoice-row"><span>Travel Fee</span><em></em><b>Total: ${money(m.travelFee)}</b></div>
        <div class="invoice-row"><span>Sales Tax</span><em>${printSafe(m.taxLabel)}</em><b>Total: ${money(m.salesTax)}</b></div>
      </div>
    </div>
    <div class="invoice-selected-items"><b>Adult</b><span>${printSafe(`${m.adults} adult guest(s)`)} </span><br><b>Kids</b><span>${m.kids ? `${m.kids} kid guest(s)` : '0'}</span></div>
    <div class="invoice-totals">
      <div><b>Promotion code:</b><span>${order.couponCode ? printSafe(order.couponCode) : ''}</span></div>
      <div><b>Discount:</b><span>${money(m.discount)}</span></div>
      <div><b>Subtotal before tax:</b><span>${money(m.foodSubtotal + m.travelFee)}</span></div>
      <div><b>Sales tax:</b><span>${money(m.salesTax)}</span></div>
      <div><b>Total:</b><span>${money(m.guestTotalBeforeDeposit)}</span></div>
      <div><b>Deposit paid:</b><span>${money(m.depositPaid)}</span></div>
      <div><b>Balance due:</b><span>${money(m.guestTotalAfterDeposit)}</span></div>
      <small>(Food/package balance and tax belong to Phoenix Hibachi. Travel fee and optional tips belong to the chef.)</small>
    </div>
    <div class="invoice-notes"><b>Any food allergies?</b><span>${printSafe(allergies)}</span></div>
    <div class="invoice-protein-detail"><b>Protein selections</b><span>${printSafe(proteinLine)}</span></div>
    <div class="invoice-rule-box">
      <b>Member / Coupon Rules</b>
      <span>Member credit special: add $1,000 Phoenix Party Credit and receive $100 bonus credit after staff activation.</span>
      <span>First completed party over $600: $50 off, not combinable with other coupons.</span>
      <span>Birthday month: $50 coupon, valid for parties over $600.</span>
      <span>Confirmed/completed-event social share: $50 next-party coupon after staff review, valid only for the next party over $600.</span>
    </div>
    <div class="tip-suggestions"><b>Tip Suggestions:</b><div>20% = ${money(m.tip20)} <span>Total: ${money(m.guestTotalAfterDeposit + m.tip20)}</span></div><div>25% = ${money(m.tip25)} <span>Total: ${money(m.guestTotalAfterDeposit + m.tip25)}</span></div><div>30% = ${money(m.tip30)} <span>Total: ${money(m.guestTotalAfterDeposit + m.tip30)}</span></div></div>
    <div class="invoice-footer-red">THIS IS AN AUTOMATED EMAIL / INVOICE. PLEASE DO NOT REPLY TO THIS MESSAGE.</div>
  </section>`;
}

function chefSettlementHtml(order) {
  const m = calculateOrderMoney(order);
  const settlementId = `SET-${String(order.id || '').replace(/^PHX-?/,'') || generateOrderId('SET')}`;
  return `<section class="chef-settlement-sheet">
    <div class="invoice-top-line"></div>
    <div class="invoice-ref">Backend Settlement #: ${printSafe(settlementId)}</div>
    <div class="invoice-brand"><strong>PHOENIX HIBACHI</strong><span>Chef Settlement / 师傅结算单</span><span>${printSafe(order.id || '')}</span></div>
    <div class="settlement-grid">
      <div><b>Date / Time</b><span>${printSafe(invoiceDateLine(order))}</span></div>
      <div><b>Assigned Chef</b><span>${printSafe(order.assignedChef || 'Unassigned')}</span></div>
      <div><b>Customer</b><span>${printSafe(order.name)} · ${printSafe(order.phone)}</span></div>
      <div><b>Address</b><span>${printSafe(order.address)}</span></div>
      <div><b>Guests</b><span>${m.adults} adults · ${m.kids} kids</span></div>
      <div><b>Package</b><span>${printSafe(m.packageName)} · ${money(m.packagePrice)}/adult</span></div>
      <div><b>Proteins</b><span>${printSafe(proteinSummary(m.proteinSelections))}</span></div>
    </div>
    <div class="settlement-money">
      <div><span>Package subtotal</span><b>${money(m.packageSubtotal)}</b></div>
      ${m.proteinUpcharge > 0 ? `<div><span>Premium protein upgrade</span><b>${money(m.proteinUpcharge)}</b></div>` : ''}
      <div><span>Add-ons total</span><b>${money(m.addonsTotal)}</b></div>
      <div><span>Food / package subtotal</span><b>${money(m.foodSubtotal)}</b></div>
      <div><span>Coupon / member credit discount</span><b>-${money(m.discount)}</b></div>
      <div><span>Sales tax (${printSafe(m.taxLabel)})</span><b>${money(m.salesTax)}</b></div>
      <div><span>Deposit already paid to company</span><b>-${money(m.depositPaid)}</b></div>
      <div class="important"><span>Food balance collected onsite</span><b>${money(m.companyBalanceDue)}</b></div>
      <div><span>Chef guest payout rule</span><b>$15/adult · $7.50/kid · minimum $150</b></div>
      <div class="important"><span>Chef guest payout</span><b>${money(m.chefGuestPayout)}</b></div>
      <div><span>Travel fee belongs to chef</span><b>${money(m.travelFee)}</b></div>
      <div><span>Optional tips belong to chef</span><b>100% chef</b></div>
      <div class="important"><span>Chef keeps now before tips</span><b>${money(m.chefKeepsBeforeTip)}</b></div>
      <div class="important return"><span>Chef returns to Phoenix Hibachi</span><b>${money(m.chefReturnToCompany)}</b></div>
      ${m.ownerOwesChef ? `<div class="important owed"><span>Owner owes chef after balance collected</span><b>${money(m.ownerOwesChef)}</b></div>` : ''}
    </div>
    <div class="settlement-checks">
      <label>□ Food balance collected from guest</label>
      <label>□ Chef kept guest payout</label>
      <label>□ Travel fee paid to chef</label>
      <label>□ Tips received by chef: $________</label>
      <label>□ Cash/Zelle returned to Phoenix: $________</label>
      <label>□ Manager verified: __________ Date: __________</label>
    </div>
    <div class="invoice-footer-red">INTERNAL CHEF SETTLEMENT. FOOD BALANCE MUST MATCH PHOENIX HIBACHI BACKEND RECORD.</div>
  </section>`;
}
function openPrintModalForOrder(order, type = 'guest') {
  if (!order) { alert('Order not found.'); return; }
  if (!printArea || !printModal) return;
  printArea.innerHTML = type === 'chef' ? chefSettlementHtml(order) : guestInvoiceHtml(order);
  if (typeof printModal.showModal === 'function') printModal.showModal();
}
function findDashboardOrder(orderId) {
  return getDashboardOrders().find(o => String(o.id) === String(orderId)) || getStoredOrders().find(o => String(o.id) === String(orderId));
}

function normalizeOrderNumber(value = '') {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}
function sameOrderNumber(a, b) {
  return normalizeOrderNumber(a) === normalizeOrderNumber(b);
}
function humanOrderStatus(status = '') {
  const key = String(status || '').toLowerCase();
  if (key.includes('prep')) return 'Prep started / 已经开始备货';
  if (key.includes('complete')) return 'Completed / 已完成';
  if (key.includes('accept') || key.includes('confirm')) return 'Accepted / 已确定接受订单';
  if (key.includes('cancel')) return 'Cancelled / 已取消';
  return 'Pending manager review / 等待经理确认';
}
function orderProgressSteps(order = {}) {
  const key = String(order.status || '').toLowerCase();
  const accepted = key.includes('accept') || key.includes('confirm') || key.includes('prep') || key.includes('complete');
  const prep = key.includes('prep') || key.includes('complete');
  const completed = key.includes('complete');
  const chefAssigned = Boolean(order.assignedChef && order.assignedChef !== 'Unassigned');
  return [
    { label:'Request received', done:true },
    { label:'Order accepted', done:accepted },
    { label:'Chef assigned', done:chefAssigned },
    { label:'Prep started', done:prep },
    { label:'Completed', done:completed }
  ];
}
async function lookupOrderByNumber(orderNumber) {
  const needle = normalizeOrderNumber(orderNumber);
  if (!needle) return null;
  const local = [...getDashboardOrders(), ...getStoredOrders()].find(o => sameOrderNumber(o.id, needle));
  if (local) return local;
  const client = initSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('bookings').select('*').eq('booking_number', needle).maybeSingle();
    if (error) {
      console.warn('Order lookup failed:', error);
      return null;
    }
    return data ? bookingRowToOrder(data) : null;
  } catch (error) {
    console.warn('Order lookup exception:', error);
    return null;
  }
}
function orderLookupResultHtml(order) {
  const m = calculateOrderMoney(order);
  const steps = orderProgressSteps(order).map(step => `<span class="lookup-step ${step.done ? 'done' : ''}">${step.done ? '✓' : '○'} ${escapeHtml(step.label)}</span>`).join('');
  return `<div class="lookup-card">
    <header><strong>${escapeHtml(order.id || '')}</strong><span class="tag accepted">${escapeHtml(humanOrderStatus(order.status))}</span></header>
    <div class="lookup-steps">${steps}</div>
    <p><b>Date / Time:</b> ${escapeHtml(order.eventDate || '')} · ${escapeHtml(order.eventTime || '')}<br>
    <b>Guest:</b> ${escapeHtml(order.name || 'Guest')} · ${escapeHtml(order.phone || '')}<br>
    <b>Address:</b> ${escapeHtml(order.address || 'Not entered')}<br>
    <b>Package:</b> ${escapeHtml(order.package || 'Classic')} · ${formatGuestNumber(m.billableGuests)} billable guests<br>
    <b>Estimated total:</b> ${money(m.guestTotalBeforeDeposit)}<br>
    <b>Chef:</b> ${escapeHtml(order.assignedChef && order.assignedChef !== 'Unassigned' ? order.assignedChef : 'Pending chef assignment')}<br>
    <b>Payment:</b> ${escapeHtml(order.paymentStatus || 'Not paid yet')}</p>
    <small>No automatic SMS is sent. Use this order number to check updates anytime.</small>
  </div>`;
}
function orderChefText(order) {
  return `Phoenix Hibachi dispatch ${order.id}
Chef: ${order.assignedChef || 'Unassigned'}
Date: ${order.eventDate} ${order.eventTime}
Customer: ${order.name} ${order.phone}
Guests: ${order.totalGuests} (${order.adults} adults, ${order.kids} kids)
Package: ${order.package}
Proteins: ${proteinSummary(calculateOrderMoney(order).proteinSelections)}
Premium protein upgrade: ${money(calculateOrderMoney(order).proteinUpcharge)}
Add-ons: ${order.addons?.join(', ') || 'None'}
Address: ${order.address}
Travel fee paid/quoted: $${order.travelFee || 0}
Chef settlement: keeps ${money(calculateOrderMoney(order).chefKeepsBeforeTip)} before tips; returns ${money(calculateOrderMoney(order).chefReturnToCompany)} to Phoenix
Estimated drive: ${order.estimatedDriveMin || '?'} min · ${order.estimatedDistanceMiles || '?'} mi
Event block: ${order.eventBlockMin || eventBlockMinutes(order)} min including cook/setup/pack
Route note: ${order.assignmentReason || '-'}
Allergies: ${order.allergies?.join(', ') || 'None'}
Rain plan: ${order.rainPlan}
Parking: ${order.parking}
Cancellation policy: ${cancellationMessage(order)}
Notes: ${order.specialNotes || '-'}`;
}
function showBookingSuccess(order) {
  lastSubmittedOrder = order;
  const m = calculateOrderMoney(order);
  if (successReceipt) {
    successReceipt.innerHTML = [
      ['Order ID', order.id], ['Status lookup', 'Use the magnifying glass on the homepage to check this order number. No automatic SMS is sent.'], ['Date / Time', `${order.eventDate} · ${order.eventTime}`], ['Guest', `${order.name} · ${order.phone}`], ['Address', order.address || 'Not entered'], ['Package', `${order.package} · ${money(m.packagePrice)}/adult`], ['Guests', `${m.adults} adults · ${m.kids} kids · ${formatGuestNumber(m.billableGuests)} billable guests`], ['Proteins', proteinSummary(m.proteinSelections)], ['Premium protein upgrade', money(m.proteinUpcharge)], ['Food subtotal', money(m.foodSubtotal)], ['Travel fee to chef', money(m.travelFee)], ['Estimated total', money(m.guestTotalBeforeDeposit)], ['Payment status', 'Not paid yet'], ['Minimum deposit to hold time', money(MONEY_RULES.depositRequired)], ['Auto Dispatch', `${order.assignedChef || 'Unassigned'} · ${order.estimatedDriveMin || '?'} min drive`], ['Cancellation', cancellationMessage(order)]
    ].map(([label,value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }
  if (typeof successModal?.showModal === 'function') successModal.showModal();
}
function chefOptions(selectedId = '') {
  return ['<option value="">Unassigned</option>', ...CHEFS.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)} · ${escapeHtml(c.base)}</option>`)].join('');
}
function staffCanAssign(role = currentDashboardRole) { return ['Admin','Manager','Customer Service'].includes(role); }
function orderCard(order) {
  const m = calculateOrderMoney(order);
  const maps = googleMapUrl(order.address);
  const sms = `sms:${order.phone || ''}?&body=${encodeURIComponent(guestTextTemplate(order))}`;
  const statusKey = String(order.status || '').toLowerCase();
  const accepted = statusKey.includes('accepted') || statusKey.includes('confirmed') || statusKey.includes('completed');
  const completed = statusKey.includes('completed');
  const assignControls = staffCanAssign() ? `<div class="assign-box"><label>Assign Chef<select data-chef-select="${escapeHtml(order.id)}">${CHEFS.map(c => `<option value="${c.id}" ${order.assignedChefId===c.id?'selected':''}>${c.name} · ${c.zone}</option>`).join('')}</select></label><button type="button" data-run-auto="${escapeHtml(order.id)}">Auto best chef</button></div>` : '';
  const confirmAction = staffCanAssign() ? `<button type="button" data-confirm-order="${escapeHtml(order.id)}" ${accepted || completed ? 'disabled' : ''}>${accepted || completed ? 'Accepted' : 'Accept order'}</button>` : '';
  const completeAction = staffCanAssign() ? `<button type="button" data-complete-order="${escapeHtml(order.id)}" ${completed ? 'disabled' : ''}>${completed ? 'Completed' : 'Mark completed'}</button>` : '';
  const deleteAction = staffCanAssign() ? `<button type="button" class="danger-btn" data-delete-order="${escapeHtml(order.id)}" onclick="return window.PHX_DELETE_ORDER_V78(event,this)">Delete order</button>` : '';
  return `<article class="order-card"><header><div><strong>${order.routeLabel ? `<span class="route-letter-badge">${escapeHtml(order.routeLabel)}</span> ` : ''}${escapeHtml(order.id)}</strong><p>${escapeHtml(order.eventDate)} · ${escapeHtml(order.eventTime)}</p></div><span class="tag ${accepted || completed ? 'accepted' : ''}">${escapeHtml(order.status)}</span></header><p><b>${escapeHtml(order.name)}</b> · ${escapeHtml(order.phone || 'No phone')}<br>${escapeHtml(order.email || 'No email')}<br>${escapeHtml(order.address || 'No address')}<br>${escapeHtml(order.package)} · ${m.adults} adults · ${m.kids} kids · Food ${money(m.foodSubtotal)} · Tax ${money(m.salesTax)} · Total ${money(m.guestTotalBeforeDeposit)} · Travel fee ${money(m.travelFee)}<br>Proteins: ${escapeHtml(proteinSummary(m.proteinSelections))}</p><p>Chef: <b>${escapeHtml(order.assignedChef || 'Unassigned')}</b><br>Chef keeps before tips: <b>${money(m.chefKeepsBeforeTip)}</b> · Return to Phoenix: <b>${money(m.chefReturnToCompany)}</b><br>Drive: ${escapeHtml(order.estimatedDriveMin || '?')} min · Event block: ${escapeHtml(order.eventBlockMin || eventBlockMinutes(order))} min</p><p>Cancellation: ${escapeHtml(cancellationMessage(order))}</p>${assignControls}<div class="order-actions"><a href="${sms}">Manual text guest</a><a href="${maps}" target="_blank" rel="noreferrer">Map</a><button type="button" data-print-guest="${escapeHtml(order.id)}">Guest invoice</button><button type="button" data-print-chef="${escapeHtml(order.id)}">Chef settlement</button><button type="button" data-download-pdf="${escapeHtml(order.id)}">Download PDF</button><button type="button" data-copy-order="${escapeHtml(order.id)}">Copy chef note</button>${confirmAction}${completeAction}${deleteAction}</div></article>`;
}

function customerOrderCard(order) {
  const statusKey = String(order.status || '').toLowerCase();
  const accepted = statusKey.includes('accepted') || statusKey.includes('confirmed') || statusKey.includes('prep') || statusKey.includes('completed');
  const m = calculateOrderMoney(order);
  const statusNote = statusKey.includes('prep') ? 'Your order has been accepted and prep has started.' : accepted ? 'Your request has been accepted by Phoenix Hibachi. Deposit/payment and final route confirmation may still be required.' : 'Your request is pending manager review.';
  return `<article class="order-card"><header><div><strong>${escapeHtml(order.id)}</strong><p>${escapeHtml(order.eventDate)} · ${escapeHtml(order.eventTime)}</p></div><span class="tag ${accepted ? 'accepted' : ''}">${escapeHtml(order.status || 'Pending')}</span></header><p><b>${escapeHtml(statusNote)}</b><br>${escapeHtml(order.package)} · ${escapeHtml(order.totalGuests)} actual guests / ${formatGuestNumber(m.billableGuests)} billable<br>Proteins: ${escapeHtml(proteinSummary(m.proteinSelections))}<br>${escapeHtml(order.address || 'No address')}<br>Estimated total: <b>${money(m.guestTotalBeforeDeposit)}</b><br>Payment hold: $200 minimum deposit recommended · Final arrival window confirmed 24 hours before event<br>Cancellation policy: ${escapeHtml(cancellationMessage(order))}</p><div class="order-actions"><button type="button" data-print-guest="${escapeHtml(order.id)}">Print invoice</button><button type="button" data-download-pdf="${escapeHtml(order.id)}">Download PDF</button><button type="button" data-customer-cancel="${escapeHtml(order.id)}">Request cancellation</button><button type="button" data-customer-reschedule="${escapeHtml(order.id)}">Request reschedule</button>${accepted ? `<button type="button" data-open-share-reward>Social coupon</button>` : ``}<a href="${searchMapUrl(order.address)}" target="_blank" rel="noreferrer">Event map</a></div></article>`;
}
function chefOrderCard(order) {
  const m = calculateOrderMoney(order);
  const route = googleMapUrl(order.address);
  return `<article class="dispatch-card"><strong>${order.routeLabel ? `<span class="route-letter-badge">${escapeHtml(order.routeLabel)}</span> ` : ''}${escapeHtml(order.eventDate)} · ${escapeHtml(order.eventTime)}</strong><p><b>Order:</b> ${escapeHtml(order.id)}<br>${escapeHtml(order.address || 'No address')}<br>${escapeHtml(order.package)} · ${m.adults} adults · ${m.kids} kids<br>Proteins: ${escapeHtml(proteinSummary(m.proteinSelections))}<br>Chef guest payout: <b>${money(m.chefGuestPayout)}</b><br>Travel fee to chef: <b>${money(m.travelFee)}</b><br>Chef keeps before tips: <b>${money(m.chefKeepsBeforeTip)}</b><br>Return to Phoenix: <b>${money(m.chefReturnToCompany)}</b><br>Drive: ${escapeHtml(order.estimatedDriveMin || '?')} min · Route source: ${escapeHtml(order.routeFromAddress || 'Base')}<br>Event block: ${escapeHtml(order.eventBlockMin || eventBlockMinutes(order))} min</p><div class="order-actions"><a href="${route}" target="_blank" rel="noreferrer">Map</a><button type="button" data-print-chef="${escapeHtml(order.id)}">Print settlement</button><button type="button" data-download-pdf="${escapeHtml(order.id)}">Download PDF</button><button type="button" data-copy-order="${escapeHtml(order.id)}">Copy dispatch</button><a href="sms:?&body=${encodeURIComponent(orderChefText(order))}">SMS dispatch</a></div></article>`;
}

function feedbackCard(item) { return `<article class="feedback-card"><strong>${escapeHtml(item.id)}</strong><p>${escapeHtml(item.feedbackType || 'Feedback')} · ${escapeHtml(item.name || '')} · ${escapeHtml(item.phone || '')}</p><p>${escapeHtml(item.message || '')}</p></article>`; }

const CHEF_APPLICATIONS_KEY = 'phoenix_chef_applications_v1';
const REVIEW_HIGHLIGHTS_KEY = 'phoenix_review_highlights_v1';
const GOOGLE_REVIEW_URL = '#'; // Replace with your real Google Business Profile review link.
function getStoredChefApplications() { try { return JSON.parse(localStorage.getItem(CHEF_APPLICATIONS_KEY) || '[]'); } catch { return []; } }
function saveStoredChefApplications(items) { localStorage.setItem(CHEF_APPLICATIONS_KEY, JSON.stringify(items)); }
function getStoredReviewHighlights() { try { return JSON.parse(localStorage.getItem(REVIEW_HIGHLIGHTS_KEY) || '[]'); } catch { return []; } }
function saveStoredReviewHighlights(items) { localStorage.setItem(REVIEW_HIGHLIGHTS_KEY, JSON.stringify(items)); }
function fileSummary(files) {
  return [...(files || [])].map(file => ({ name:file.name, type:file.type || 'file', size:file.size, sizeLabel:`${Math.max(1, Math.round(file.size/1024))} KB` }));
}
function applicationCard(app) {
  const files = (app.files || []).map(f => `<span>${escapeHtml(f.name)} · ${escapeHtml(f.type)} · ${escapeHtml(f.sizeLabel)}</span>`).join('');
  return `<article class="order-card application-card"><header><div><strong>${escapeHtml(app.id)}</strong><p>${escapeHtml(app.createdAtLabel)}</p></div><span class="tag">Chef application</span></header><p><b>${escapeHtml(app.name)}</b> · ${escapeHtml(app.phone)}<br>${escapeHtml(app.email || 'No email')}<br>Base: ${escapeHtml(app.baseZip || '-')} · Experience: ${escapeHtml(app.experience || '-')} · ${escapeHtml(app.transportation || '-')}</p><p>Available: ${escapeHtml(app.availability || '-')}<br>Areas: ${escapeHtml(app.serviceAreas || '-')}<br>Notes: ${escapeHtml(app.notes || '-')}</p>${files ? `<div class="file-list">${files}</div>` : '<p>No attachments listed.</p>'}<div class="order-actions"><a href="sms:${encodeURIComponent(app.phone || '')}">Text applicant</a><a href="mailto:${encodeURIComponent(app.email || '')}">Email</a><button type="button" data-copy-application="${escapeHtml(app.id)}">Copy application</button></div></article>`;
}
async function openChefAttachment(path) {
  const client = initSupabaseClient();
  if (!client || !path) { alert('Attachment path is not available yet.'); return; }
  const { data, error } = await client.storage.from('chef-application-files').createSignedUrl(path, 60 * 10);
  if (error) { alert('Could not open attachment: ' + error.message); return; }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
function renderReviewHighlights() {
  const link = document.getElementById('googleReviewLink');
  if (link && GOOGLE_REVIEW_URL && GOOGLE_REVIEW_URL !== '#') link.href = GOOGLE_REVIEW_URL;
  const target = document.getElementById('reviewHighlights');
  if (!target) return;
  const items = getStoredReviewHighlights();
  target.innerHTML = items.length ? items.slice(0,3).map(item => `<article class="review-highlight"><strong>${escapeHtml(item.title || 'Guest highlight')}</strong><p>${escapeHtml(item.text || '')}</p></article>`).join('') : '';
}

function normalizeDateKey(order) {
  const dt = parseOrderDateTime(order);
  if (!dt) return order.eventDate || 'Date pending';
  return dt.toISOString().slice(0,10);
}
function shortDateHeading(dateKey) {
  if (!dateKey || dateKey === 'Date pending') return 'Date pending';
  const parts = String(dateKey).split('-').map(Number);
  if (parts.length === 3) return new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  return dateKey;
}
function renderOrdersByDate(orders, role) {
  if (!orders.length) return '<div class="empty-state">No booking requests yet. Submit a test booking first.</div>';
  const sorted = [...orders].sort((a,b) => (parseOrderDateTime(a)?.getTime() || 0) - (parseOrderDateTime(b)?.getTime() || 0));
  const groups = sorted.reduce((acc, order) => {
    const key = normalizeDateKey(order);
    (acc[key] ||= []).push(order);
    return acc;
  }, {});
  return Object.entries(groups).map(([date, rows]) => {
    const labeledRows = rows.map((order, index) => ({...order, routeLabel: order.routeLabel || routeLabelForIndex(index)}));
    const totalGuests = labeledRows.reduce((sum, o) => sum + Number(o.totalGuests || 0), 0);
    return `<section class="date-group"><header><div><span class="date-pill">${escapeHtml(shortDateHeading(date))}</span><strong>${labeledRows.length} order${labeledRows.length > 1 ? 's' : ''}</strong></div><p>${totalGuests} guests total · ${labeledRows.filter(o => o.assignedChef && o.assignedChef !== 'Unassigned').length} assigned · route ${labeledRows.map(o => o.routeLabel).join(' → ')}</p></header><div class="date-orders">${labeledRows.map(role === 'Member' ? customerOrderCard : orderCard).join('')}</div></section>`;
  }).join('');
}

function getSocialCouponRequests(){
  try { return JSON.parse(localStorage.getItem(SOCIAL_COUPON_KEY) || '[]'); } catch { return []; }
}
function socialCouponToFeedback(item){
  return {
    id: item.id,
    createdAt: item.createdAt,
    feedbackType: 'Social share coupon request',
    name: 'Guest social share',
    phone: '',
    email: '',
    status: item.status || 'Pending review',
    message: `${item.platform || 'Social'} share submitted for $50 next-party coupon: ${item.postLink || ''}`
  };
}
function buildCustomerRows(orders) {
  const map = new Map();
  orders.forEach(order => {
    const key = (order.email || order.phone || order.name || order.id || '').toLowerCase();
    if (!key) return;
    const current = map.get(key) || {name: order.name || 'Guest', phone: order.phone || '', email: order.email || '', address: order.address || '', city:'', zip:'', orders:0, guests:0, lastDate:'', packages:new Set()};
    current.name = current.name || order.name || 'Guest';
    current.phone = current.phone || order.phone || '';
    current.email = current.email || order.email || '';
    current.address = order.address || current.address || '';
    current.orders += 1;
    current.guests += Number(order.totalGuests || 0);
    current.lastDate = order.eventDate || current.lastDate;
    if (order.package) current.packages.add(order.package);
    map.set(key, current);
  });
  getMembershipApplications().forEach(member => {
    const key = (member.email || member.phone || member.fullName || member.id || '').toLowerCase();
    if (!key) return;
    const current = map.get(key) || {name: member.fullName || 'Member applicant', phone: member.phone || '', email: member.email || '', address: member.address || '', city:'', zip: member.zip || '', orders:0, guests:0, lastDate:'', packages:new Set(), birthday:'', memberOffer:'Membership pending', accountStatus:''};
    current.name = current.name || member.fullName || 'Member applicant';
    current.phone = current.phone || member.phone || '';
    current.email = current.email || member.email || '';
    current.address = current.address || member.address || '';
    current.zip = current.zip || member.zip || '';
    current.birthday = current.birthday || member.birthday || '';
    current.accountStatus = current.accountStatus || member.accountStatus || (member.passwordCreated ? 'Password created' : 'No password yet');
    current.memberOffer = member.offer || current.memberOffer || 'Membership pending';
    map.set(key, current);
  });
  return [...map.values()].map(x => ({...x, packages:[...x.packages].join(', ')}));
}
function renderCustomerManagement(orders) {
  const rows = buildCustomerRows(orders);
  if (!rows.length) return '<div class="empty-state">No customers yet. Customers will appear after bookings are submitted.</div>';
  return `<div class="customer-table"><div class="customer-row customer-head"><span>Name</span><span>Phone</span><span>Email</span><span>Address / Birthday</span><span>Orders / Member</span><span>Actions</span></div>${rows.map(c => `<div class="customer-row"><span><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.packages || 'Member / no package yet')}</small></span><span>${escapeHtml(c.phone || '-')}</span><span>${escapeHtml(c.email || '-')}</span><span>${escapeHtml(c.address || '-')}<br><small>ZIP: ${escapeHtml(c.zip || '-')} · Birthday: ${escapeHtml(c.birthday || '-')}</small></span><span>${c.orders} · ${c.guests} guests<br><small>${escapeHtml(c.lastDate || c.accountStatus || c.memberOffer || '')}</small></span><span class="mini-actions"><a href="sms:${encodeURIComponent(c.phone || '')}">SMS</a><a href="mailto:${encodeURIComponent(c.email || '')}">Email</a><button type="button" data-copy-customer="${escapeHtml(c.phone || c.email || c.name)}">Copy</button></span></div>`).join('')}</div>`;
}
function feedbackCard(item) {
  const aiDraft = makeFeedbackReply(item);
  return `<article class="feedback-card"><header><div><strong>${escapeHtml(item.id)}</strong><p>${escapeHtml(item.feedbackType || 'Feedback')} · ${escapeHtml(item.name || '')} · ${escapeHtml(item.phone || '')}</p></div><span class="tag">${escapeHtml(item.status || 'New')}</span></header><p>${escapeHtml(item.message || '')}</p><div class="reply-draft" id="reply-${escapeHtml(item.id)}" hidden>${escapeHtml(aiDraft)}</div><div class="order-actions"><button type="button" data-ai-feedback="${escapeHtml(item.id)}">AI reply draft</button><button type="button" data-thank-feedback="${escapeHtml(item.id)}">Thank-you reply</button><a href="sms:${encodeURIComponent(item.phone || '')}?&body=${encodeURIComponent(aiDraft)}">Text reply</a><a href="mailto:${encodeURIComponent(item.email || '')}?subject=${encodeURIComponent('Phoenix Hibachi support')}&body=${encodeURIComponent(aiDraft)}">Email reply</a></div></article>`;
}
function makeFeedbackReply(item) {
  const type = String(item.feedbackType || '').toLowerCase();
  if (type.includes('complaint') || type.includes('refund') || type.includes('safety')) {
    return `Hi ${item.name || 'there'}, thank you for contacting Phoenix Hibachi. We received your message and a manager will review it carefully. Please send any photos, order date, and best callback number so we can follow up properly.`;
  }
  return `Hi ${item.name || 'there'}, thank you for your message and for choosing Phoenix Hibachi. We appreciate your feedback and our team will follow up shortly if more information is needed.`;
}
function applicationCard(app) {
  const files = (app.files || []).map((f, index) => {
    const label = `${f.name || 'Attachment'} · ${f.sizeLabel || ''}`;
    return f.path ? `<button type="button" data-open-attachment="${escapeHtml(f.path)}">Attachment ${index + 1}</button>` : `<span>${escapeHtml(label)}</span>`;
  }).join('');
  const status = app.accountStatus || app.account_status || app.status || 'pending';
  const staffActions = ['Admin','Manager'].includes(currentDashboardRole)
    ? `<button type="button" data-person-activate="${escapeHtml(app.id)}">Approve / Activate</button><button type="button" data-person-pause="${escapeHtml(app.id)}">Pause chef</button><button type="button" data-person-delete="${escapeHtml(app.id)}">Delete</button>`
    : '';
  return `<article class="order-card application-card"><header><div><strong>${escapeHtml(app.name || app.id)}</strong><p>${escapeHtml(app.createdAtLabel || '')}</p></div><span class="tag">Chef application · ${escapeHtml(status)}</span></header><div class="customer-table compact-table"><div class="customer-row"><span>Phone<br><b>${escapeHtml(app.phone || '-')}</b></span><span>Email<br><b>${escapeHtml(app.email || '-')}</b></span><span>Base ZIP<br><b>${escapeHtml(app.baseZip || '-')}</b></span><span>Experience<br><b>${escapeHtml(app.experience || '-')}</b></span><span>Transport<br><b>${escapeHtml(app.transportation || '-')}</b></span></div></div><p>Available: ${escapeHtml(app.availability || '-')}<br>Areas: ${escapeHtml(app.serviceAreas || '-')}<br>Notes: ${escapeHtml(app.notes || '-')}</p>${files ? `<div class="file-list attachment-buttons">${files}</div>` : '<p>No attachments listed.</p>'}<div class="order-actions"><a href="sms:${encodeURIComponent(app.phone || '')}">Text applicant</a><a href="mailto:${encodeURIComponent(app.email || '')}">Email</a><button type="button" data-copy-application="${escapeHtml(app.id)}">Copy application</button>${staffActions}</div></article>`;
}

function ensureCalendarDefaults() {
  const today = new Date();
  if (calendarSummaryMonth && !calendarSummaryMonth.value) calendarSummaryMonth.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}`;
  if (calendarSummaryDate && !calendarSummaryDate.value) calendarSummaryDate.value = today.toISOString().slice(0,10);
}
function orderMatchesCalendarFilter(order) {
  const dt = parseOrderDateTime(order);
  if (!dt) return false;
  const key = dt.toISOString().slice(0,10);
  const mode = calendarSummaryMode?.value || 'month';
  if (mode === 'date') return key === calendarSummaryDate?.value;
  return key.slice(0,7) === calendarSummaryMonth?.value;
}
function renderCalendarSummary() {
  if (!calendarSummaryList) return;
  ensureCalendarDefaults();
  if (calendarSummaryMonthWrap) calendarSummaryMonthWrap.hidden = (calendarSummaryMode?.value === 'date');
  if (calendarSummaryDateWrap) calendarSummaryDateWrap.hidden = (calendarSummaryMode?.value !== 'date');
  const orders = getDashboardOrders().filter(orderMatchesCalendarFilter).sort((a,b)=>(parseOrderDateTime(a)?.getTime()||0)-(parseOrderDateTime(b)?.getTime()||0));
  const label = calendarSummaryMode?.value === 'date'
    ? (calendarSummaryDate?.value || 'selected date')
    : (calendarSummaryMonth?.value || 'selected month');
  calendarSummaryList.innerHTML = orders.length
    ? `<div class="calendar-summary-header"><strong>${escapeHtml(label)}</strong><span>${orders.length} order${orders.length > 1 ? 's' : ''}</span></div>${orders.map(orderCard).join('')}`
    : `<div class="empty-state">No orders found for ${escapeHtml(label)}.</div>`;
}
function toggleCalendarSummary(forceOpen = null) {
  if (!calendarSummaryPanel) return;
  const shouldOpen = forceOpen === null ? calendarSummaryPanel.hidden : forceOpen;
  calendarSummaryPanel.hidden = !shouldOpen;
  if (shouldOpen) renderCalendarSummary();
}
async function updateOrderStatus(orderId, status) {
  const client = initSupabaseClient();
  let remoteOk = false;
  if (client && supabaseSession) {
    const { error } = await client.from('bookings').update({ status }).eq('booking_number', orderId);
    if (error) console.warn('Supabase status update failed:', error);
    else remoteOk = true;
  }
  const stored = getStoredOrders().map(o => o.id === orderId ? { ...o, status } : o);
  saveStoredOrders(stored);
  if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.map(o => o.id === orderId ? { ...o, status } : o);
  if (remoteOk) await loadDashboardDataFromSupabase();
  renderDashboard(currentDashboardRole);
  if (!calendarSummaryPanel?.hidden) renderCalendarSummary();
  return remoteOk;
}

async function deleteOrderRecord(orderId) {
  const client = initSupabaseClient();
  if (client && supabaseSession) {
    try {
      const { error } = await client.from('bookings').delete().eq('booking_number', orderId);
      if (error) console.warn('Supabase delete failed:', error);
    } catch (error) {
      console.warn('Supabase delete threw:', error);
    }
  }
  saveStoredOrders(getStoredOrders().filter(o => String(o.id) !== String(orderId)));
  if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.filter(o => String(o.id) !== String(orderId));
  renderDashboard(currentDashboardRole);
  if (!calendarSummaryPanel?.hidden) renderCalendarSummary();
  return true;
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const dt = new Date(String(value));
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0,10);
}
function selectedBookingDateKey() {
  return selectedDateState ? selectedDateState.toISOString().slice(0,10) : normalizeDateKey(selectedDateInput?.value);
}
function getPausedBookingDates() {
  try { return JSON.parse(localStorage.getItem(PAUSED_BOOKING_DATES_KEY) || '{}') || {}; } catch { return {}; }
}
function savePausedBookingDates(map) {
  localStorage.setItem(PAUSED_BOOKING_DATES_KEY, JSON.stringify(map || {}));
}
function isDatePaused(dateKey) {
  const key = normalizeDateKey(dateKey);
  return Boolean(key && getPausedBookingDates()[key]);
}
function isAcceptingOrders(dateKey = selectedBookingDateKey()) {
  // v38 uses date-specific pause. Ignore the old all-site paused flag so a previous test does not block every day.
  if (localStorage.getItem(ACCEPTING_ORDERS_KEY) === 'paused') localStorage.setItem(ACCEPTING_ORDERS_KEY, 'open');
  const parsed = new Date(dateKey);
  if (!Number.isNaN(parsed.getTime()) && isPastDate(parsed)) return false;
  return !isDatePaused(dateKey);
}
function pauseBookingDate(dateKey) {
  const key = normalizeDateKey(dateKey);
  if (!key) return false;
  const map = getPausedBookingDates();
  map[key] = { paused:true, updatedAt:new Date().toISOString(), reason:'Admin paused this date' };
  savePausedBookingDates(map);
  selectedStatusState = getStatus(selectedDateState);
  renderBookingAcceptanceState();
  renderMainCalendar();
  renderMiniCalendar();
  renderSlots();
  updateBookingReadyState();
  return true;
}
function resumeBookingDate(dateKey) {
  const key = normalizeDateKey(dateKey);
  if (!key) return false;
  const map = getPausedBookingDates();
  delete map[key];
  savePausedBookingDates(map);
  selectedStatusState = getStatus(selectedDateState);
  renderBookingAcceptanceState();
  renderMainCalendar();
  renderMiniCalendar();
  renderSlots();
  updateBookingReadyState();
  return true;
}
function renderBookingAcceptanceState() {
  const status = document.getElementById('acceptingOrdersStatus');
  const dateInput = document.getElementById('bookingPauseDateInput');
  const selectedKey = normalizeDateKey(dateInput?.value || selectedBookingDateKey());
  if (dateInput && !dateInput.value && selectedKey) dateInput.value = selectedKey;
  const accepting = isAcceptingOrders(selectedKey);
  if (status) status.innerHTML = accepting
    ? `<b class="status-ok">Open</b> · ${escapeHtml(selectedKey || 'Selected date')} is accepting booking requests.`
    : `<b class="status-warn">Paused</b> · ${escapeHtml(selectedKey || 'Selected date')} is not accepting new booking requests.`;
  const list = document.getElementById('pausedDatesList');
  if (list) {
    const keys = Object.keys(getPausedBookingDates()).sort();
    list.innerHTML = keys.length
      ? `Paused dates: ${keys.map(k => `<button type="button" class="date-chip" data-resume-paused-date="${escapeHtml(k)}">${escapeHtml(k)} ×</button>`).join(' ')}`
      : 'No paused dates.';
  }
}
function getPeopleRecords() {
  try { return JSON.parse(localStorage.getItem(PEOPLE_MANAGEMENT_KEY) || '[]'); } catch { return []; }
}
function savePeopleRecords(list) { localStorage.setItem(PEOPLE_MANAGEMENT_KEY, JSON.stringify(list)); }
function getHiddenPeopleIds() { try { return JSON.parse(localStorage.getItem(HIDDEN_PEOPLE_RECORDS_KEY) || '[]'); } catch { return []; } }
function saveHiddenPeopleIds(list) { localStorage.setItem(HIDDEN_PEOPLE_RECORDS_KEY, JSON.stringify([...new Set((list || []).map(String))])); }
function hidePeopleRecord(id) { const list = getHiddenPeopleIds(); list.push(String(id)); saveHiddenPeopleIds(list); }
function basePeopleRecords() {
  const hidden = new Set(getHiddenPeopleIds().map(String));
  const records = [];
  if (supabaseProfile) records.push({ id:supabaseProfile.id || supabaseProfile.email, name:supabaseProfile.full_name || 'Current user', email:supabaseProfile.email || '', role:supabaseProfile.role || currentDashboardRole, status:supabaseProfile.account_status || 'active', source:'Current login', sourceType:'profile' });
  getDashboardApplications().forEach(app => records.push({ id:app.id, name:app.name || 'Chef applicant', email:app.email || '', phone:app.phone || '', role:'chef', status:app.accountStatus || app.account_status || 'pending', source:'Chef application', sourceType:'chef_application' }));
  getMembershipApplications().forEach(mem => records.push({ id:mem.id, name:mem.fullName || 'Member applicant', email:mem.email || '', phone:mem.phone || '', role:'customer', status:mem.accountStatus || 'pending', source:'Membership application', sourceType:'membership_application' }));
  return records.filter(r => !hidden.has(String(r.id)));
}
function roleLabel(role) {
  return ({customer:'Member', chef:'Chef', customer_service:'Customer Service', manager:'Manager', admin:'Admin'}[String(role)] || role || '-');
}
function renderPeopleManagement(role = currentDashboardRole) {
  renderBookingAcceptanceState();
  const target = document.getElementById('peopleManagementList');
  if (!target) return;
  if (role !== 'Admin') {
    target.innerHTML = '<div class="empty-state">Only Admin can add, delete, pause, or change member levels. Customer Service can view customer/chef information in their own tabs but cannot manage permissions.</div>';
    return;
  }
  const merged = [...basePeopleRecords(), ...getPeopleRecords().filter(r => !getHiddenPeopleIds().map(String).includes(String(r.id)))];
  if (!merged.length) {
    target.innerHTML = '<div class="empty-state">No people records yet. Create Supabase Auth users first, then add role/status records here or approve applications.</div>';
    return;
  }
  const rows = merged.map(person => {
    const role = String(person.role || '').toLowerCase();
    const isChef = role === 'chef';
    const isCustomer = role === 'customer' || role === 'member';
    const isCurrentLogin = person.sourceType === 'profile' || person.source === 'Current login';
    const status = person.status || 'active';
    let actions = '';
    if (isChef) {
      actions = `<button type="button" data-person-activate="${escapeHtml(person.id)}">Approve / Activate</button><button type="button" data-person-pause="${escapeHtml(person.id)}">Pause chef</button><button type="button" data-person-delete="${escapeHtml(person.id)}" onclick="return window.PHX_DELETE_PERSON_V78(event,this)">Delete</button>`;
    } else if (isCustomer) {
      actions = `<button type="button" data-person-delete="${escapeHtml(person.id)}" onclick="return window.PHX_DELETE_PERSON_V78(event,this)">Delete record</button>`;
    } else if (!isCurrentLogin) {
      actions = `<button type="button" data-person-activate="${escapeHtml(person.id)}">Activate</button><button type="button" data-person-pause="${escapeHtml(person.id)}">Pause</button><button type="button" data-person-delete="${escapeHtml(person.id)}" onclick="return window.PHX_DELETE_PERSON_V78(event,this)">Delete</button>`;
    } else {
      actions = '<small>Current login</small>';
    }
    return `<div class="customer-row"><span><b>${escapeHtml(person.name || '-')}</b><small>${escapeHtml(person.id || '')}</small></span><span>${escapeHtml(roleLabel(person.role))}</span><span>${escapeHtml(status)}</span><span>${escapeHtml(person.phone || '')}<br><small>${escapeHtml(person.email || '-')}</small></span><span>${escapeHtml(person.source || 'Manual')}</span><span class="mini-actions">${actions}</span></div>`;
  }).join('');
  target.innerHTML = `<div class="customer-table people-table"><div class="customer-row customer-head"><span>Name</span><span>Role / level</span><span>Status</span><span>Contact</span><span>Source</span><span>Actions</span></div>${rows}</div>`;
}
function setDashboardTab(tab) {
  currentDashboardTab = tab || 'orders';
  document.querySelectorAll('[data-dashboard-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.dashboardTab === currentDashboardTab));
  document.querySelectorAll('[data-dashboard-page]').forEach(page => page.classList.toggle('active', page.dataset.dashboardPage === currentDashboardTab));
}
function renderDashboard(role = 'Admin') {
  currentDashboardRole = role;
  try {
    const orders = getDashboardOrders();
    const feedback = [...getStoredFeedback(), ...getSocialCouponRequests().map(socialCouponToFeedback)];
    const apps = getDashboardApplications();
    if (dashboardTitle) dashboardTitle.textContent = `${role} Dashboard`;
    if (dashboardHelp) dashboardHelp.innerHTML = `<span class="role-badge">${escapeHtml(role)}</span> ${Array.isArray(remoteOrdersCache) ? '<span class="role-badge">Supabase live</span>' : '<span class="role-badge">Local demo</span>'} ${role === 'Member' ? 'Member portal: cancellation is available only more than 48 hours before the event. Inside 48 hours, reschedule only and deposit is non-refundable.' : role === 'Chef' ? 'Chef view: assigned parties, customer information, map, travel time and travel fee.' : 'Staff dashboard: orders, customer contacts, complaints, chef applications and dispatch are separated by tabs.'}`;
    const statNew = document.getElementById('statNew');
    const statPending = document.getElementById('statPending');
    const statFeedback = document.getElementById('statFeedback');
    if (statNew) statNew.textContent = orders.filter(o => ['New request','pending','Pending','new'].includes(o.status)).length;
    if (statPending) statPending.textContent = orders.filter(o => o.assignedChef && o.assignedChef !== 'Unassigned').length;
    if (statFeedback) statFeedback.textContent = feedback.length;
    if (primaryDashboardHeading) primaryDashboardHeading.textContent = role === 'Member' ? 'My bookings by date' : role === 'Chef' ? 'My assigned parties by date' : 'Orders by calendar date';
    if (dispatchDashboardHeading) dispatchDashboardHeading.textContent = role === 'Chef' ? 'My route, customer details & travel fee' : 'Chef dispatch & routing';
    let visibleOrders = orders;
    if (role === 'Chef') visibleOrders = orders.filter(o => o.assignedChef && o.assignedChef !== 'Unassigned');
    if (orderList) orderList.innerHTML = role === 'Member' ? (orders.length ? orders.map(customerOrderCard).join('') : '<div class="empty-state">No member bookings yet.</div>') : renderOrdersByDate(visibleOrders, role);
    if (customerList) customerList.innerHTML = ['Admin','Manager','Customer Service'].includes(role) ? renderCustomerManagement(orders) : '<div class="empty-state">Member/customer management is only visible to staff accounts.</div>';
    try { renderPeopleManagement(role); } catch (error) { console.error('People management render failed', error); const peopleList = document.getElementById('peopleManagementList'); if (peopleList) peopleList.innerHTML = '<div class="empty-state">People panel could not load. Other dashboard panels are still available.</div>'; }
    if (feedbackList) feedbackList.innerHTML = ['Admin','Manager','Customer Service'].includes(role) ? (feedback.length ? feedback.map(feedbackCard).join('') : '<div class="empty-state">No complaints or suggestions yet.</div>') : '<div class="empty-state">Support tickets are only visible to staff accounts.</div>';
    const chefApplicationsList = document.getElementById('chefApplicationsList');
    if (chefApplicationsList) chefApplicationsList.innerHTML = ['Admin','Manager','Customer Service'].includes(role) ? (apps.length ? apps.map(applicationCard).join('') : '<div class="empty-state">No chef applications yet. Use Submit Chef Resume to test.</div>') : '<div class="empty-state">Chef applications are only visible to Manager/Admin/Customer Service.</div>';
    if (chefDispatch) chefDispatch.innerHTML = visibleOrders.length ? ordersForRouteDate(visibleOrders, routePlanDateSelect?.value || '').map(chefOrderCard).join('') : '<div class="empty-state">Assigned routes will appear here.</div>';
    try { renderRoutePlanner(visibleOrders, role); } catch (error) { console.error('Route planner render failed', error); const target = document.getElementById('routePlannerPanel'); if (target) target.innerHTML = '<div class="empty-state">Route map could not load yet. Orders still loaded below.</div>'; }
    let preferredTab = '';
    try { preferredTab = localStorage.getItem(PORTAL_TAB_KEY) || ''; localStorage.removeItem(PORTAL_TAB_KEY); } catch {}
    const firstTab = preferredTab || (role === 'Chef' ? 'dispatch' : role === 'Member' ? 'orders' : currentDashboardTab);
    setDashboardTab(firstTab);
    if (!calendarSummaryPanel?.hidden) renderCalendarSummary();
  } catch (error) {
    console.error('Dashboard render failed:', error);
    if (dashboardTitle) dashboardTitle.textContent = `${role} Dashboard`;
    if (dashboardHelp) dashboardHelp.innerHTML = '<span class="role-badge">Dashboard recovery mode</span> A panel failed to render, but the portal is still open. Refresh after uploading this fixed version if you still see this.';
    if (orderList) orderList.innerHTML = '<div class="empty-state">Dashboard data could not render. Please clear browser cache or open an incognito window, then try again.</div>';
  }
}
portalLoginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const active = portalLoginForm.querySelector('.login-tabs .active');
  let role = active?.textContent?.trim() || 'Member';
  const email = portalLoginForm.querySelector('input[type="email"]')?.value?.trim();
  const password = portalLoginForm.querySelector('input[type="password"]')?.value || '';
  if (!email || !password) {
    alert('Please enter your portal email and password. Blank demo login is disabled.');
    return;
  }
  try {
    const profile = await signInPortal(email, password);
    if (profile?.role) role = roleToUi(profile.role);
    setPortalSessionMeta(role, email);
    await loadDashboardDataFromSupabase();
  } catch (error) {
    alert('Login failed: ' + (error.message || error) + '\n\nCheck that this email exists in Supabase Authentication > Users, the password is correct, and the user has a matching profiles row.');
    return;
  }
  loginModal?.close();
  if (isPortalRoute()) {
    renderDashboard(role);
    if (typeof dashboardModal?.showModal === 'function' && !dashboardModal.open) dashboardModal.showModal();
  } else {
    openPortalInNewTab();
  }
});
document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-chef-select]');
  if (!select) return;
  const chef = CHEFS.find(c => c.id === select.value);
  const allOrders = getStoredOrders();
  const orders = allOrders.map(o => o.id === select.dataset.chefSelect ? assignOrderToSpecificChef(o, select.value, allOrders) : o);
  saveStoredOrders(orders);
  renderDashboard(currentDashboardRole);
});
document.addEventListener('click', (event) => {
  const copyBtn = event.target.closest('[data-copy-order]');
  if (copyBtn) {
    const order = getStoredOrders().find(o => o.id === copyBtn.dataset.copyOrder);
    if (order) navigator.clipboard?.writeText(orderChefText(order)).then(() => alert('Chef route note copied. Send it by SMS/WeChat/WhatsApp.'));
  }
  const confirmBtn = event.target.closest('[data-confirm-order]');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    const orderId = confirmBtn.dataset.confirmOrder;
    updateOrderStatus(orderId, 'Accepted').then(remoteOk => {
      alert(remoteOk ? 'Order accepted. Customer portal status has been updated.' : 'Order accepted locally. Supabase update did not confirm; check connection and RLS permissions.');
    });
  }
  const printGuest = event.target.closest('[data-print-guest]');
  if (printGuest) {
    openPrintModalForOrder(findDashboardOrder(printGuest.dataset.printGuest), 'guest');
  }
  const printChef = event.target.closest('[data-print-chef]');
  if (printChef) {
    openPrintModalForOrder(findDashboardOrder(printChef.dataset.printChef), 'chef');
  }
  const downloadPdf = event.target.closest('[data-download-pdf]');
  if (downloadPdf) {
    const order = findDashboardOrder(downloadPdf.dataset.downloadPdf);
    if (!order) { alert('Order not found.'); return; }
    if (order.pdfUrl) { window.open(order.pdfUrl, '_blank', 'noopener'); return; }
    openPrintModalForOrder(order, 'guest');
    alert('PDF is not generated yet. Use Print → Save as PDF for now, or deploy the booking-created Edge Function to generate PDFs automatically.');
  }
  const prepBtn = event.target.closest('[data-prep-order]');
  if (prepBtn) {
    prepBtn.disabled = true;
    updateOrderStatus(prepBtn.dataset.prepOrder, 'Prep started').then(() => alert('Order status updated: prep started. Customer lookup will show this status.'));
  }
  const completeBtn = event.target.closest('[data-complete-order]');
  if (completeBtn) {
    completeBtn.disabled = true;
    updateOrderStatus(completeBtn.dataset.completeOrder, 'Completed').then(() => alert('Order marked completed. Invoice and chef settlement are ready to print.'));
  }
  const deleteOrderBtn = event.target.closest('[data-delete-order]');
  if (deleteOrderBtn) {
    const orderId = deleteOrderBtn.dataset.deleteOrder;
    if (!confirm(`Delete order ${orderId}?\n\nThis cannot be undone from this dashboard. Continue?`)) return;
    deleteOrderBtn.disabled = true;
    deleteOrderRecord(orderId).then(() => alert(`Order ${orderId} deleted.`));
  }
  const assignBtn = event.target.closest('[data-assign-order]');
  if (assignBtn) {
    updateOrderStatus(assignBtn.dataset.assignOrder, 'Accepted');
  }
  const autoBtn = event.target.closest('[data-run-auto]');
  if (autoBtn) {
    const orders = getStoredOrders();
    const order = orders.find(o => o.id === autoBtn.dataset.runAuto);
    if (order) {
      const updated = autoAssignOrder(order, orders.filter(o => o.id !== order.id));
      saveStoredOrders(orders.map(o => o.id === order.id ? updated : o));
      renderDashboard(currentDashboardRole);
    }
  }
  const cancelBtn = event.target.closest('[data-customer-cancel]');
  if (cancelBtn) {
    const order = getStoredOrders().find(o => o.id === cancelBtn.dataset.customerCancel);
    alert(order ? cancellationMessage(order) : 'Order not found.');
  }
  const resBtn = event.target.closest('[data-customer-reschedule]');
  if (resBtn) {
    alert('Reschedule request captured in demo. In the real system this should create a support ticket and notify manager/customer service.');
  }
  const aiFeedback = event.target.closest('[data-ai-feedback]');
  if (aiFeedback) {
    const box = document.getElementById('reply-' + aiFeedback.dataset.aiFeedback);
    if (box) { box.hidden = !box.hidden; if (!box.hidden) navigator.clipboard?.writeText(box.textContent || ''); }
  }
  const thanksFeedback = event.target.closest('[data-thank-feedback]');
  if (thanksFeedback) {
    const item = getStoredFeedback().find(x => x.id === thanksFeedback.dataset.thankFeedback);
    const text = `Hi ${item?.name || 'there'}, thank you for reaching out to Phoenix Hibachi. We received your message and appreciate you taking the time to contact us.`;
    navigator.clipboard?.writeText(text).then(() => alert('Thank-you reply copied.'));
  }
  const copyCustomer = event.target.closest('[data-copy-customer]');
  if (copyCustomer) {
    const text = copyCustomer.closest('.customer-row')?.innerText || copyCustomer.dataset.copyCustomer;
    navigator.clipboard?.writeText(text).then(() => alert('Customer row copied.'));
  }
  const openAttachment = event.target.closest('[data-open-attachment]');
  if (openAttachment) {
    openChefAttachment(openAttachment.dataset.openAttachment);
  }
});
document.getElementById('autoDispatchBtn')?.addEventListener('click', () => { autoDispatchAll(); alert('Route plan rebuilt. Orders are labeled A/B/C by time and grouped into color-coded chef chains. Manager still needs to review before final confirmation.'); });
document.getElementById('exportOrdersBtn')?.addEventListener('click', () => {
  const payload = JSON.stringify({orders:getStoredOrders(), feedback:getStoredFeedback(), chefs:CHEFS}, null, 2);
  navigator.clipboard?.writeText(payload).then(() => alert('Dashboard JSON copied. This is a demo export.'));
});

document.querySelectorAll('[data-dashboard-tab]').forEach(btn => btn.addEventListener('click', () => setDashboardTab(btn.dataset.dashboardTab)));
document.getElementById('copyCustomerContactsBtn')?.addEventListener('click', () => {
  const contacts = buildCustomerRows(getDashboardOrders()).map(c => `${c.name}\t${c.phone}\t${c.email}\t${c.address}`).join('\n');
  copyTextWithFallback(contacts, 'Customer contacts copied. Use responsibly and follow SMS/email marketing consent rules.');
});
calendarSummaryBtn?.addEventListener('click', () => toggleCalendarSummary());
calendarSummaryMode?.addEventListener('change', renderCalendarSummary);
calendarSummaryMonth?.addEventListener('change', renderCalendarSummary);
calendarSummaryDate?.addEventListener('change', renderCalendarSummary);
routePlanDateSelect?.addEventListener('change', () => { renderRoutePlanner(getDashboardOrders(), currentDashboardRole); if (chefDispatch) chefDispatch.innerHTML = ordersForRouteDate(getDashboardOrders(), routePlanDateSelect.value).map(chefOrderCard).join('') || '<div class="empty-state">Assigned routes will appear here.</div>'; });
document.getElementById('calendarSummaryClearBtn')?.addEventListener('click', () => {
  if (calendarSummaryPanel) calendarSummaryPanel.hidden = true;
});
document.getElementById('portalNewBookingBtn')?.addEventListener('click', () => {
  if (dashboardModal?.open) dashboardModal.close();
  openBookingModal({package:'Classic'});
});



document.addEventListener('click', (event) => {
  const logout = event.target.closest('[data-portal-logout]');
  if (!logout) return;
  if (isPortalRoute()) signOutAndClosePortal();
  else signOutPortal('You have been logged out of Phoenix Portal.');
});
setInterval(() => {
  if (supabaseSession && isPortalSessionExpired()) signOutPortal('Your Phoenix Portal session expired after 8 hours. Please login again.');
}, 60 * 1000);

/* ======================================================================
   V68 admin dashboard visibility + data consistency fix
   - Keeps existing design and Supabase security.
   - Fixes dashboard recovery mode caused by one panel throwing.
   - Shows orders/applications reliably.
   - Merges chef pending records into Chef Applications.
   - Loads/saves contact settings from Supabase app_settings when connected.
   ====================================================================== */

function normalizeContactSettingsFromDbV68(value = {}) {
  return {
    phone: value.business_phone || value.phone || DEFAULT_V60_CONTACTS.phone,
    textPhone: value.text_phone || value.textPhone || value.business_phone || value.phone || DEFAULT_V60_CONTACTS.textPhone,
    bookingEmail: value.booking_email || value.bookingEmail || DEFAULT_V60_CONTACTS.bookingEmail,
    supportEmail: value.support_email || value.supportEmail || value.booking_email || DEFAULT_V60_CONTACTS.supportEmail,
    policy: value.cancellation_policy_text || value.policy || DEFAULT_V60_CONTACTS.policy
  };
}
function contactSettingsToDbV68(settings = getContactSettingsV60()) {
  return {
    business_phone: settings.phone || DEFAULT_V60_CONTACTS.phone,
    text_phone: settings.textPhone || settings.phone || DEFAULT_V60_CONTACTS.textPhone,
    booking_email: settings.bookingEmail || DEFAULT_V60_CONTACTS.bookingEmail,
    support_email: settings.supportEmail || settings.bookingEmail || DEFAULT_V60_CONTACTS.supportEmail,
    business_name: 'Phoenix Hibachi',
    service_area_text: 'NY, NJ, CT, Long Island',
    cancellation_policy_title: '48-Hour Policy',
    cancellation_policy_text: settings.policy || DEFAULT_V60_CONTACTS.policy
  };
}
async function loadContactSettingsFromSupabaseV68() {
  const client = initSupabaseClient();
  if (!client || !supabaseSession) return;
  try {
    const { data, error } = await client
      .from('app_settings')
      .select('value')
      .eq('key', 'contact_settings')
      .maybeSingle();
    if (!error && data?.value) {
      saveContactSettingsV60(normalizeContactSettingsFromDbV68(data.value));
      applyContactSettingsV60();
    }
  } catch (error) {
    console.warn('V68 contact settings load skipped:', error);
  }
}

function normalizeChefApplicationV68(raw = {}, source = 'application') {
  const addressParts = [
    raw.chef_address_street,
    raw.chef_address_city,
    raw.chef_address_state,
    raw.chef_address_zip
  ].filter(Boolean);
  const legacyAreas = Array.isArray(raw.service_areas) ? raw.service_areas.join(', ') : (raw.serviceAreas || '');
  const preferredAreas = Array.isArray(raw.preferred_order_areas) ? raw.preferred_order_areas.join(', ') : (raw.baseZip || raw.home_zip || '');
  const availableDays = Array.isArray(raw.available_days) ? raw.available_days.join(', ') : (Array.isArray(raw.availability) ? raw.availability.join(', ') : (raw.availability || ''));
  const attachments = [];
  ['attachment_files','driver_license_files','performance_video_files'].forEach(key => {
    const value = raw[key];
    if (Array.isArray(value)) value.forEach(file => attachments.push(file));
  });
  if (Array.isArray(raw.files)) raw.files.forEach(file => attachments.push(file));
  return {
    id: raw.id || raw.applicant_id || raw.email || `chef-${Date.now()}`,
    createdAt: raw.created_at || raw.createdAt || '',
    createdAtLabel: raw.createdAtLabel || (raw.created_at ? new Date(raw.created_at).toLocaleString() : ''),
    name: raw.applicant_name || raw.name || raw.full_name || 'Chef applicant',
    phone: raw.phone || '',
    email: raw.email || raw.account_email || '',
    baseZip: preferredAreas || raw.home_zip || '',
    experience: raw.experience_years || raw.experience || '',
    transportation: raw.vehicle_type || raw.transportation || (raw.has_transportation ? 'Has reliable car' : ''),
    availability: availableDays,
    serviceAreas: addressParts.length ? addressParts.join(', ') : legacyAreas,
    notes: raw.self_introduction || raw.notes || '',
    files: attachments,
    accountStatus: raw.account_status || raw.accountStatus || raw.status || (source === 'people' ? 'pending' : 'pending'),
    status: raw.status || raw.account_status || raw.accountStatus || 'pending',
    sourceType: source
  };
}
function getDashboardApplications() {
  const byId = new Map();
  const add = (app, source) => {
    const item = normalizeChefApplicationV68(app, source);
    if (!item.id) return;
    byId.set(String(item.id), item);
  };
  if (Array.isArray(remoteChefApplicationsCache)) remoteChefApplicationsCache.forEach(app => add(app, 'supabase'));
  getStoredChefApplications().forEach(app => add(app, 'local'));
  try {
    getPeopleRecords()
      .filter(p => String(p.role || '').toLowerCase() === 'chef')
      .forEach(p => add({
        id: p.id,
        name: p.name,
        full_name: p.name,
        email: p.email,
        phone: p.phone,
        status: p.status || 'pending',
        account_status: p.status || 'pending',
        notes: 'Created from People / Settings record. Review or activate from Admin.'
      }, 'people'));
  } catch (error) {
    console.warn('V68 people-to-applications merge skipped:', error);
  }
  return [...byId.values()].sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function loadDashboardDataFromSupabase() {
  const client = initSupabaseClient();
  if (!client || !supabaseSession) return;
  try {
    const { data: rows, error } = await client.from('bookings').select('*').order('created_at', { ascending:false });
    if (!error) remoteOrdersCache = (rows || []).map(bookingRowToOrder);
    else console.warn('Supabase bookings fetch failed:', error);
  } catch (error) {
    console.warn('Supabase bookings fetch threw:', error);
  }
  try {
    const { data: apps, error: appsError } = await client.from('chef_applications').select('*').order('created_at', { ascending:false });
    if (!appsError) remoteChefApplicationsCache = (apps || []).map(row => normalizeChefApplicationV68(row, 'supabase'));
    else console.warn('Supabase chef applications fetch failed:', appsError);
  } catch (error) {
    console.warn('Supabase chef applications fetch threw:', error);
  }
  await loadContactSettingsFromSupabaseV68();
}

function safeSetHtmlV68(node, html, fallback = '<div class="empty-state">This panel could not render, but the dashboard is still open.</div>') {
  if (!node) return;
  try { node.innerHTML = html; }
  catch (error) { console.error('V68 panel render failed:', error); node.innerHTML = fallback; }
}
function simpleOrdersHtmlV68(orders = []) {
  return orders.length
    ? orders.map(order => {
        try { return orderCard(order); }
        catch (error) {
          return `<article class="order-card"><header><div><strong>${escapeHtml(order.id || 'Order')}</strong><p>${escapeHtml(order.eventDate || '')} · ${escapeHtml(order.eventTime || '')}</p></div><span class="tag">${escapeHtml(order.status || 'pending')}</span></header><p>${escapeHtml(order.name || '')} · ${escapeHtml(order.phone || '')}<br>${escapeHtml(order.address || '')}</p></article>`;
        }
      }).join('')
    : '<div class="empty-state">No orders loaded yet.</div>';
}

renderDashboard = function(role = 'Admin') {
  currentDashboardRole = role;
  const orders = Array.isArray(getDashboardOrders()) ? getDashboardOrders() : [];
  const feedback = [...getStoredFeedback(), ...getSocialCouponRequests().map(socialCouponToFeedback)];
  const apps = getDashboardApplications();
  let visibleOrders = orders;
  if (role === 'Chef') visibleOrders = orders.filter(o => o.assignedChef && o.assignedChef !== 'Unassigned');

  if (dashboardTitle) dashboardTitle.textContent = `${role} Dashboard`;
  if (dashboardHelp) {
    dashboardHelp.innerHTML = `<span class="role-badge">${escapeHtml(role)}</span> ${Array.isArray(remoteOrdersCache) ? '<span class="role-badge">Supabase live</span>' : '<span class="role-badge">Local demo</span>'} Dashboard loaded. Use the tabs below to review orders, applications, people, contact settings, and dispatch.`;
  }

  const statNew = document.getElementById('statNew');
  const statPending = document.getElementById('statPending');
  const statFeedback = document.getElementById('statFeedback');
  if (statNew) statNew.textContent = orders.filter(o => ['New request','pending','Pending','new'].includes(o.status)).length;
  if (statPending) statPending.textContent = orders.filter(o => o.assignedChef && o.assignedChef !== 'Unassigned').length;
  if (statFeedback) statFeedback.textContent = feedback.length;

  if (primaryDashboardHeading) primaryDashboardHeading.textContent = role === 'Member' ? 'My bookings by date' : role === 'Chef' ? 'My assigned parties by date' : 'Orders by calendar date';
  if (dispatchDashboardHeading) dispatchDashboardHeading.textContent = role === 'Chef' ? 'My route, customer details & travel fee' : 'Chef dispatch & routing';

  try {
    const orderHtml = role === 'Member'
      ? (orders.length ? orders.map(customerOrderCard).join('') : '<div class="empty-state">No member bookings yet.</div>')
      : (visibleOrders.length ? renderOrdersByDate(visibleOrders, role) : '<div class="empty-state">No orders loaded yet.</div>');
    safeSetHtmlV68(orderList, orderHtml, simpleOrdersHtmlV68(visibleOrders));
  } catch (error) {
    console.error('V68 orders render fallback:', error);
    safeSetHtmlV68(orderList, simpleOrdersHtmlV68(visibleOrders));
  }

  try {
    safeSetHtmlV68(customerList, ['Admin','Manager','Customer Service'].includes(role) ? renderCustomerManagement(orders) : '<div class="empty-state">Member/customer management is only visible to staff accounts.</div>');
  } catch (error) {
    console.error('V68 customer panel fallback:', error);
    safeSetHtmlV68(customerList, '<div class="empty-state">Customer panel could not render.</div>');
  }

  try { renderPeopleManagement(role); }
  catch (error) {
    console.error('V68 people panel fallback:', error);
    const peopleList = document.getElementById('peopleManagementList');
    safeSetHtmlV68(peopleList, '<div class="empty-state">People panel could not render. Orders and applications are still available.</div>');
  }

  try {
    safeSetHtmlV68(feedbackList, ['Admin','Manager','Customer Service'].includes(role) ? (feedback.length ? feedback.map(feedbackCard).join('') : '<div class="empty-state">No complaints or suggestions yet.</div>') : '<div class="empty-state">Support tickets are only visible to staff accounts.</div>');
  } catch (error) {
    console.error('V68 feedback panel fallback:', error);
  }

  const chefApplicationsList = document.getElementById('chefApplicationsList');
  try {
    safeSetHtmlV68(chefApplicationsList, ['Admin','Manager','Customer Service'].includes(role) ? (apps.length ? apps.map(applicationCard).join('') : '<div class="empty-state">No chef applications yet. Use Submit Chef Resume to test.</div>') : '<div class="empty-state">Chef applications are only visible to Manager/Admin/Customer Service.</div>');
  } catch (error) {
    console.error('V68 applications panel fallback:', error);
    safeSetHtmlV68(chefApplicationsList, '<div class="empty-state">Chef applications could not render. Check applicant data format.</div>');
  }

  try {
    safeSetHtmlV68(chefDispatch, visibleOrders.length ? ordersForRouteDate(visibleOrders, routePlanDateSelect?.value || '').map(chefOrderCard).join('') : '<div class="empty-state">Assigned routes will appear here.</div>');
  } catch (error) {
    console.error('V68 dispatch fallback:', error);
  }

  try { renderRoutePlanner(visibleOrders, role); }
  catch (error) {
    console.error('V68 route planner fallback:', error);
    const target = document.getElementById('routePlannerPanel');
    if (target) target.innerHTML = '<div class="empty-state">Route map could not load yet. Orders still loaded below.</div>';
  }

  applyContactSettingsV60();
  let preferredTab = '';
  try { preferredTab = localStorage.getItem(PORTAL_TAB_KEY) || ''; localStorage.removeItem(PORTAL_TAB_KEY); } catch {}
  const firstTab = preferredTab || (role === 'Chef' ? 'dispatch' : role === 'Member' ? 'orders' : currentDashboardTab || 'orders');
  setDashboardTab(firstTab);
  if (!calendarSummaryPanel?.hidden) {
    try { renderCalendarSummary(); } catch (error) { console.warn('V68 calendar summary skipped:', error); }
  }
};

// Save contact settings to Supabase app_settings when admin is connected.
// Capture phase blocks the older local-only alert.
document.getElementById('saveContactSettingsBtn')?.addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (currentDashboardRole && currentDashboardRole !== 'Admin') { alert('Only Admin can change public contact settings.'); return; }
  const settings = {
    phone: document.getElementById('sitePhoneInput')?.value?.trim() || DEFAULT_V60_CONTACTS.phone,
    textPhone: document.getElementById('siteTextPhoneInput')?.value?.trim() || DEFAULT_V60_CONTACTS.textPhone,
    bookingEmail: document.getElementById('siteBookingEmailInput')?.value?.trim() || DEFAULT_V60_CONTACTS.bookingEmail,
    supportEmail: document.getElementById('siteSupportEmailInput')?.value?.trim() || DEFAULT_V60_CONTACTS.supportEmail,
    policy: document.getElementById('sitePolicyInput')?.value?.trim() || DEFAULT_V60_CONTACTS.policy
  };
  saveContactSettingsV60(settings);
  const client = initSupabaseClient();
  if (client && supabaseSession) {
    try {
      const { error } = await client.from('app_settings').upsert({
        key: 'contact_settings',
        value: contactSettingsToDbV68(settings),
        updated_by: supabaseSession.user.id
      }, { onConflict: 'key' });
      if (error) throw error;
      alert('Contact settings saved to Supabase.');
    } catch (error) {
      console.warn('V68 Supabase contact save failed:', error);
      alert('Saved locally, but Supabase save failed: ' + (error.message || error));
    }
  } else {
    alert('Contact settings saved locally. Login as Admin to save to Supabase.');
  }
  applyContactSettingsV60();
}, true);

loadContactSettingsFromSupabaseV68().catch(error => console.warn('V68 initial contact load skipped:', error));

bootstrapPortalRoute();

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('visible'); });
}, {threshold:.12});
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

document.getElementById('quoteForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const feedback = { id: generateOrderId('FB'), createdAt: new Date().toISOString(), status: 'New', ...data };
  const list = getStoredFeedback();
  list.unshift(feedback);
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list));
  alert('Thanks. Your message was captured in the demo dashboard. For launch, connect this form to email/SMS/backend.');
  form.reset();
});
document.querySelectorAll('[data-open-share-reward]').forEach(btn => btn.addEventListener('click', () => socialRewardModal?.showModal()));
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-open-share-reward]')) socialRewardModal?.showModal();
});
function saveLastSubmittedPaymentPreference(extra = {}) {
  if (!lastSubmittedOrder) return null;
  const choice = document.querySelector('input[name="paymentPreference"]:checked')?.value || 'Not selected';
  lastSubmittedOrder = {
    ...lastSubmittedOrder,
    paymentPreference: choice,
    depositRequired: MONEY_RULES.depositRequired,
    ...extra
  };
  const orders = getStoredOrders().map(o => String(o.id) === String(lastSubmittedOrder.id)
    ? {...o, paymentPreference: choice, depositRequired: MONEY_RULES.depositRequired, ...extra}
    : o
  );
  saveStoredOrders(orders);
  return choice;
}

document.getElementById('savePaymentPreferenceBtn')?.addEventListener('click', () => {
  if (!lastSubmittedOrder) { alert('No booking request found yet.'); return; }
  const choice = saveLastSubmittedPaymentPreference();
  alert('Payment preference saved: ' + choice + '. No payment has been collected on this screen.');
});

document.getElementById('confirmBookingRequestBtn')?.addEventListener('click', () => {
  if (!lastSubmittedOrder) { alert('No booking request found yet.'); return; }
  const choice = saveLastSubmittedPaymentPreference({
    customerRequestConfirmed: true,
    customerConfirmedAt: new Date().toISOString(),
    membershipOptional: true
  });
  successModal?.close();
  alert('Booking request confirmed. Membership is optional. Your payment preference was saved as: ' + choice + '. Phoenix Hibachi will review and contact you.');
});
document.getElementById('printGuestInvoiceBtn')?.addEventListener('click', () => openPrintModalForOrder(lastSubmittedOrder, 'guest'));
document.getElementById('printChefSettlementBtn')?.addEventListener('click', () => openPrintModalForOrder(lastSubmittedOrder, 'chef'));
document.getElementById('runPrintBtn')?.addEventListener('click', () => {
  document.body.classList.add('printing-invoice');
  setTimeout(() => window.print(), 50);
});
window.addEventListener('afterprint', () => document.body.classList.remove('printing-invoice'));

// V98: booking submit errors must appear inside the booking form immediately.
// A normal alert or an outside modal can appear behind a native <dialog> on mobile,
// so customers now see a clear inline error without closing the booking form.
function ensureBookingSubmitNoticeV98(){
  const form = document.getElementById('bookingPopupForm');
  if (!form) return null;
  let box = document.getElementById('bookingSubmitNoticeV98');
  if (box) return box;
  box = document.createElement('div');
  box.id = 'bookingSubmitNoticeV98';
  box.className = 'booking-submit-notice-v98';
  box.setAttribute('role', 'alert');
  box.setAttribute('tabindex', '-1');
  box.hidden = true;
  const summary = form.querySelector('.booking-summary');
  if (summary) summary.parentNode.insertBefore(box, summary);
  else form.appendChild(box);
  return box;
}
function clearBookingSubmitNoticeV98(){
  const box = document.getElementById('bookingSubmitNoticeV98');
  if (box) {
    box.hidden = true;
    box.classList.remove('show');
    box.innerHTML = '';
  }
}
function showBookingSubmitNoticeV98(error){
  const box = ensureBookingSubmitNoticeV98();
  const cleanError = String(error || 'Unknown booking error').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const supportPhone = '347-471-9190';
  if (!box) {
    alert('Your booking was NOT submitted. Please call/text Phoenix Hibachi at ' + supportPhone + ' or try again. Error: ' + error);
    return;
  }
  box.innerHTML = `
    <strong>Booking was not submitted.</strong>
    <span>Please check the highlighted issue, try again, or call/text Phoenix Hibachi at <a href="tel:13474719190">${supportPhone}</a>.</span>
    <small>Error: ${cleanError}</small>
  `;
  box.hidden = false;
  requestAnimationFrame(() => box.classList.add('show'));
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => box.focus({ preventScroll: true }), 250);
}


const orderLookupModal = document.getElementById('orderLookupModal');
const orderLookupForm = document.getElementById('orderLookupForm');
const orderLookupInput = document.getElementById('orderLookupInput');
const orderLookupResult = document.getElementById('orderLookupResult');
document.querySelectorAll('[data-open-order-lookup]').forEach(btn => btn.addEventListener('click', () => {
  if (orderLookupResult) orderLookupResult.innerHTML = '<div class="empty-state">Enter your order number to see the latest status.</div>';
  orderLookupModal?.showModal();
  setTimeout(() => orderLookupInput?.focus(), 50);
}));
orderLookupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = orderLookupInput?.value || '';
  if (orderLookupResult) orderLookupResult.innerHTML = '<div class="empty-state">Searching order status...</div>';
  const order = await lookupOrderByNumber(value);
  if (!order) {
    if (orderLookupResult) orderLookupResult.innerHTML = '<div class="empty-state">Order not found. Check the order number, or contact Phoenix Hibachi if this was submitted on another device.</div>';
    return;
  }
  if (orderLookupResult) orderLookupResult.innerHTML = orderLookupResultHtml(order);
});

document.getElementById('bookingPopupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  clearBookingSubmitNoticeV98();
  if (!validateGuestMinimum()) return;
  if (!validateProteinSelections()) return;
  if (!validateAddonDecision()) return;
  updateBookingReadyState();
  if (sendBookingRequestBtn?.disabled) {
    showBookingSubmitNoticeV98(bookingReadyHelp?.textContent || 'Please complete all required booking details.');
    return;
  }
  if (sendBookingRequestBtn) {
    sendBookingRequestBtn.disabled = true;
    sendBookingRequestBtn.dataset.v98Sending = 'true';
    sendBookingRequestBtn.textContent = 'Sending...';
  }
  const order = buildOrderFromForm(form);
  const saved = await saveBookingToSupabase(order);
  if (sendBookingRequestBtn) {
    delete sendBookingRequestBtn.dataset.v98Sending;
    sendBookingRequestBtn.textContent = 'Send booking request';
  }
  if (!saved.ok) {
    updateBookingReadyState();
    showBookingSubmitNoticeV98(saved.error);
    return;
  }
  const orders = getStoredOrders().filter(existing => String(existing.id) !== String(order.id));
  orders.unshift(order);
  saveStoredOrders(orders);
  bookingModal?.close();
  showBookingSuccess(order);
  if (supabaseSession) await loadDashboardDataFromSupabase();
  renderDashboard(currentDashboardRole || 'Manager');
});



const memberSignupModal = document.getElementById('memberSignupModal');
document.querySelectorAll('[data-open-member]').forEach(btn => btn.addEventListener('click', () => memberSignupModal?.showModal()));
function getMembershipApplications(){
  try { return JSON.parse(localStorage.getItem(MEMBERSHIP_KEY) || '[]'); } catch { return []; }
}
function saveMembershipApplications(list){ localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(list)); }
async function tryCreateMemberPortalAccount(item, password) {
  const client = initSupabaseClient();
  if (!client || !item?.email || !password) return { ok:false, message:'Saved as membership application only. Supabase account creation is not available in this preview.' };
  try {
    const { data, error } = await client.auth.signUp({
      email: item.email,
      password,
      options: { data: { full_name: item.fullName || '', phone: item.phone || '' } }
    });
    if (error) return { ok:false, message:error.message || 'Signup failed' };
    const userId = data?.user?.id;
    if (userId) {
      try {
        await client.from('profiles').upsert({
          id: userId,
          email: item.email,
          full_name: item.fullName || '',
          phone: item.phone || '',
          role: 'customer'
        });
      } catch (profileError) {
        console.warn('Member profile upsert skipped:', profileError);
      }
    }
    return { ok:true, message:'Member portal account created. If email confirmation is enabled, customer should confirm email before login.' };
  } catch (error) {
    return { ok:false, message:error.message || String(error) };
  }
}
document.getElementById('memberSignupForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fd = new FormData(form);
  const password = String(fd.get('password') || '');
  const confirmPassword = String(fd.get('confirmPassword') || '');
  if (password.length < 6) { alert('Please create a password with at least 6 characters.'); return; }
  if (password !== confirmPassword) { alert('Password and confirm password do not match.'); return; }
  const item = {
    id: generateOrderId('MEM'),
    createdAt: new Date().toISOString(),
    fullName: fd.get('fullName') || '',
    phone: fd.get('phone') || '',
    email: fd.get('email') || '',
    birthday: fd.get('birthday') || '',
    address: fd.get('address') || '',
    addressLat: fd.get('addressLat') || '',
    addressLon: fd.get('addressLon') || '',
    addressPlaceId: fd.get('addressPlaceId') || '',
    city: fd.get('city') || '',
    state: fd.get('state') || '',
    zip: fd.get('zip') || '',
    accountEmail: fd.get('email') || '',
    passwordCreated: true,
    partyArea: fd.get('partyArea') || '',
    notes: fd.get('notes') || '',
    promoConsent: !!fd.get('promoConsent'),
    offer: 'First $1,000 party credit purchase gets $100 bonus credit after staff activation; first completed party over $600 gets $50 off; birthday month gets $50 coupon over $600; confirmed/completed-event social share gets $50 next-party coupon after review.'
  };
  const accountResult = await tryCreateMemberPortalAccount(item, password);
  item.accountStatus = accountResult.ok ? 'Portal account created / pending email confirmation' : `Application saved; account setup pending (${accountResult.message})`;
  const list = getMembershipApplications();
  list.unshift(item);
  saveMembershipApplications(list);
  form.reset();
  memberSignupModal?.close();
  alert(`Membership application received.

Login account: ${item.email}
Password: the password you just created

${item.accountStatus}

Member credit special: add $1,000 Phoenix Party Credit and receive $100 bonus credit after activation.`);
  if (dashboardModal?.open) renderDashboard(currentDashboardRole || 'Admin');
});

document.getElementById('socialCouponForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const link = String(fd.get('postLink') || '').trim();
  if (!link) { alert('Please paste your social media post link first.'); return; }
  const request = {
    id: generateOrderId('CPN'),
    createdAt: new Date().toISOString(),
    platform: fd.get('platform') || 'Social',
    postLink: link,
    orderId: lastSubmittedOrder?.id || '',
    coupon: '$50 next-party coupon only · minimum next party $600 · cannot combine',
    status: 'pending staff review after order acceptance/completion'
  };
  const list = JSON.parse(localStorage.getItem(SOCIAL_COUPON_KEY) || '[]');
  list.unshift(request);
  localStorage.setItem(SOCIAL_COUPON_KEY, JSON.stringify(list));
  event.currentTarget.reset();
  alert('Share link submitted. Staff will review it before issuing the $50 next-party coupon.');
});


async function tryCreateChefPortalAccount(app, password) {
  const client = initSupabaseClient();
  if (!client || !app?.email || !password) return { ok:false, userId:null, message:'Saved as chef application only. Supabase chef account creation is not available in this preview.' };
  try {
    const { data, error } = await client.auth.signUp({
      email: app.email,
      password,
      options: { data: { requested_role:'chef', full_name: app.name || '', phone: app.phone || '' } }
    });
    if (error) return { ok:false, userId:null, message:error.message || 'Chef signup failed' };
    const userId = data?.user?.id || null;
    if (userId) {
      await client.from('profiles').upsert({
        id: userId,
        email: app.email,
        full_name: app.name || '',
        phone: app.phone || '',
        role: 'chef',
        account_status: 'pending'
      }).catch(profileError => console.warn('Chef pending profile upsert skipped:', profileError));
    }
    return { ok:true, userId, message:'Chef portal account created with pending status. Admin approval is required before login.' };
  } catch (error) {
    return { ok:false, userId:null, message:error.message || String(error) };
  }
}
const chefApplyModal = document.getElementById('chefApplyModal');
function openChefApplyModal() {
  try { if (memberSignupModal?.open) memberSignupModal.close(); } catch {}
  try { if (loginModal?.open) loginModal.close(); } catch {}
  try { if (chefApplyModal && !chefApplyModal.open) chefApplyModal.showModal(); } catch (error) {
    console.error('Unable to open chef application modal:', error);
    alert('Chef application form could not open. Please refresh the page and try again.');
  }
}
document.querySelectorAll('[data-open-chef-apply]').forEach(btn => btn.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  openChefApplyModal();
}, true));
const openChefApplyBtn = document.getElementById('openChefApplyBtn');
if (openChefApplyBtn) openChefApplyBtn.onclick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  openChefApplyModal();
};
document.getElementById('chefApplicationForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fd = new FormData(form);
  const filesInput = form.querySelector('input[type="file"]');
  const password = String(fd.get('password') || '');
  const confirmPassword = String(fd.get('confirmPassword') || '');
  if (password.length < 6) { alert('Please create a chef portal password with at least 6 characters.'); return; }
  if (password !== confirmPassword) { alert('Chef password and confirm password do not match.'); return; }
  const app = {
    id: generateOrderId('CHEF'),
    createdAt: new Date().toISOString(),
    createdAtLabel: new Date().toLocaleString(),
    name: fd.get('name') || '',
    phone: fd.get('phone') || '',
    email: fd.get('email') || '',
    baseZip: fd.get('baseZip') || '',
    experience: fd.get('experience') || '',
    transportation: fd.get('transportation') || '',
    availability: fd.get('availability') || '',
    serviceAreas: fd.get('serviceAreas') || '',
    notes: fd.get('notes') || '',
    files: fileSummary(filesInput?.files || []),
    accountStatus: 'pending'
  };
  const accountResult = await tryCreateChefPortalAccount(app, password);
  if (accountResult.userId) app.userId = accountResult.userId;
  const result = await saveChefApplicationToSupabase(app, filesInput?.files || []);
  if (result.files?.length) app.files = result.files;
  app.accountSetup = accountResult.message;
  const items = getStoredChefApplications();
  items.unshift(app);
  saveStoredChefApplications(items);
  form.reset();
  chefApplyModal?.close();
  alert(result.ok ? 'Welcome to the Phoenix Hibachi chef family. Your application was submitted and your chef account is pending admin verification. Once approved, you can log in and start receiving dispatch opportunities.' : 'Application saved locally, but Supabase had an issue: ' + result.error + '\n\nYour chef account may still need admin setup.');
  if (supabaseSession) await loadDashboardDataFromSupabase();
  renderDashboard(currentDashboardRole || 'Manager');
});
document.addEventListener('click', (event) => {
  const copyApp = event.target.closest('[data-copy-application]');
  if (copyApp) {
    const app = getStoredChefApplications().find(x => x.id === copyApp.dataset.copyApplication);
    if (app) navigator.clipboard?.writeText(JSON.stringify(app, null, 2)).then(() => alert('Chef application copied.'));
  }
});


document.getElementById('pauseBookingDateBtn')?.addEventListener('click', () => {
  if (currentDashboardRole !== 'Admin') { alert('Only Admin can pause booking dates.'); return; }
  const date = document.getElementById('bookingPauseDateInput')?.value || selectedBookingDateKey();
  if (!date) { alert('Choose a date first.'); return; }
  pauseBookingDate(date);
  updateBookingReadyState();
});
document.getElementById('resumeBookingDateBtn')?.addEventListener('click', () => {
  if (currentDashboardRole !== 'Admin') { alert('Only Admin can resume booking dates.'); return; }
  const date = document.getElementById('bookingPauseDateInput')?.value || selectedBookingDateKey();
  if (!date) { alert('Choose a date first.'); return; }
  resumeBookingDate(date);
  updateBookingReadyState();
});
document.getElementById('bookingPauseDateInput')?.addEventListener('change', renderBookingAcceptanceState);
document.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-resume-paused-date]');
  if (!chip || currentDashboardRole !== 'Admin') return;
  resumeBookingDate(chip.dataset.resumePausedDate);
  updateBookingReadyState();
});
document.getElementById('addPeopleRecordBtn')?.addEventListener('click', () => {
  if (currentDashboardRole !== 'Admin') { alert('Only Admin can add people records.'); return; }
  const name = document.getElementById('peopleNameInput')?.value?.trim() || '';
  const email = document.getElementById('peopleEmailInput')?.value?.trim() || '';
  const role = document.getElementById('peopleRoleSelect')?.value || 'customer_service';
  if (!email) { alert('Enter the email login first. Real account creation still happens in Supabase Authentication.'); return; }
  const list = getPeopleRecords();
  list.unshift({ id:generateOrderId('USR'), name:name || email, email, role, status:'active', source:'Manual admin record', createdAt:new Date().toISOString() });
  savePeopleRecords(list);
  renderPeopleManagement(currentDashboardRole);
});
document.addEventListener('click', (event) => {
  const activate = event.target.closest('[data-person-activate]');
  const pause = event.target.closest('[data-person-pause]');
  const del = event.target.closest('[data-person-delete]');
  const id = activate?.dataset.personActivate || pause?.dataset.personPause || del?.dataset.personDelete;
  if (!id || currentDashboardRole !== 'Admin') return;
  if (del && !confirm('Delete this local/admin record from the People panel? This does not delete a Supabase Auth login.')) return;
  let list = getPeopleRecords();
  let changedManual = false;
  if (del) {
    const before = list.length;
    list = list.filter(p => String(p.id) !== String(id));
    changedManual = before !== list.length;
    if (!changedManual) {
      saveMembershipApplications(getMembershipApplications().filter(p => String(p.id) !== String(id)));
      saveStoredChefApplications(getStoredChefApplications().filter(p => String(p.id) !== String(id)));
      hidePeopleRecord(id);
    }
  }
  if (activate) {
    list = list.map(p => String(p.id) === String(id) ? {...p, status:'active'} : p);
    saveStoredChefApplications(getStoredChefApplications().map(p => String(p.id) === String(id) ? {...p, status:'approved', accountStatus:'active'} : p));
  }
  if (pause) {
    list = list.map(p => String(p.id) === String(id) ? {...p, status:'paused'} : p);
    saveStoredChefApplications(getStoredChefApplications().map(p => String(p.id) === String(id) ? {...p, status:'paused', accountStatus:'paused'} : p));
  }
  savePeopleRecords(list);
  alert(del ? 'Record removed from this dashboard. If this is a live Supabase Auth user, delete or disable the Auth user/profile in Supabase too.' : 'Chef/staff status updated locally. For live Supabase users, also update the profiles row or approval function.');
  renderDashboard(currentDashboardRole);
});
renderBookingAcceptanceState();
// v20 account menu controls
updateAccountMenuState();
document.getElementById('accountMenuBtn')?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleAccountDropdown();
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('#portalAccount')) closeAccountDropdown();
});
document.getElementById('mobilePortalEntry')?.addEventListener('click', () => openPortalInNewTab());
document.getElementById('accountDropdown')?.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-account-action]')?.dataset.accountAction;
  if (!action) return;
  closeAccountDropdown();
  if (action === 'logout') {
    if (isPortalRoute()) await signOutAndClosePortal();
    else await signOutPortal('You have been logged out.');
    return;
  }
  if (action === 'customers') {
    openPortalInNewTab('customers');
    return;
  }
  if (action === 'profile') {
    const meta = getPortalSessionMeta();
    alert(`Account
Email: ${meta?.email || '-'}
Role: ${meta?.role || '-'}`);
    return;
  }
  openPortalInNewTab();
});

renderReviewHighlights();

// V67: initialize booking calendar on today or the next available future date.
selectedDateState = getNextSelectableDate(new Date());
selectedStatusState = getStatus(selectedDateState);
mainMonth = new Date(selectedDateState.getFullYear(), selectedDateState.getMonth(), 1);
miniMonth = new Date(selectedDateState.getFullYear(), selectedDateState.getMonth(), 1);

renderMainCalendar();
chooseDate(selectedDateState, selectedStatusState);
initTimeSelects();
updateGuestCount();
selectPackage(bookingState.package);
updateSummary();

// v4: modal close buttons must close even when required booking fields are incomplete.
document.querySelectorAll('[data-close-modal]').forEach(button => {
  button.addEventListener('click', () => {
    const dialog = button.closest('dialog');
    if (isPortalRoute() && (dialog?.id === 'dashboardModal' || dialog?.id === 'loginModal')) {
      closePortalTabOrReturnHome();
      return;
    }
    if (dialog && typeof dialog.close === 'function') dialog.close();
  });
});

document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', (event) => {
    // Only close when the real dialog backdrop is clicked.
    // This prevents calendar re-render clicks inside the booking popup from accidentally closing it.
    // v21: In portal route, do NOT close the login/dashboard dialog by clicking the blank backdrop,
    // because the portal page intentionally hides the public site behind it. Closing it caused a black screen.
    if (event.target === dialog && typeof dialog.close === 'function') {
      if (isPortalRoute() && (dialog.id === 'loginModal' || dialog.id === 'dashboardModal')) return;
      dialog.close();
    }
  });
});


// v41 hard fix: the chef resume button must never open membership.
document.addEventListener('click', (event) => {
  const chefBtn = event.target.closest('#openChefApplyBtn, [data-open-chef-apply]');
  if (!chefBtn) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  try { memberSignupModal?.close?.(); } catch {}
  try { loginModal?.close?.(); } catch {}
  try { chefApplyModal?.showModal?.(); } catch (error) { console.error(error); alert('Chef application form could not open. Please refresh and try again.'); }
}, true);



// v45: light / dark theme toggle
(function initPhoenixThemeToggle(){
  const root = document.body;
  const btn = document.getElementById('themeToggleBtn');
  const label = document.getElementById('themeLabel');
  const icon = document.getElementById('themeIcon');
  if (!btn || !root) return;
  const applyTheme = (theme) => {
    const isLight = theme === 'light';
    root.classList.toggle('light-theme', isLight);
    if (label) label.textContent = isLight ? 'Dark' : 'Light';
    if (icon) icon.textContent = isLight ? '☾' : '☀';
    btn.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
  };
  const saved = localStorage.getItem('phoenixTheme') || 'dark';
  applyTheme(saved);
  btn.addEventListener('click', () => {
    const next = root.classList.contains('light-theme') ? 'dark' : 'light';
    localStorage.setItem('phoenixTheme', next);
    applyTheme(next);
  });
})();


/* ======================================================================
   V60 account/security + chef application + contact settings patch
   ====================================================================== */
const V60_CONTACT_SETTINGS_KEY = 'phoenixHibachiContactSettingsV60';
const V60_FORCE_PASSWORD_KEY = 'phoenixHibachiForcePasswordChangeV60';
const DEFAULT_V60_CONTACTS = {
  phone: '3474719190',
  textPhone: '3474719190',
  bookingEmail: 'phoenix4719190@gmail.com',
  supportEmail: 'phoenix4719190@gmail.com',
  policy: 'Over 48 hours: cancellation can be reviewed. Inside 48 hours: deposit is non-refundable; reschedule only.'
};
function formatPhoneV60(value){
  const digits=String(value||'').replace(/\D/g,'');
  if(digits.length===10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  return value || '';
}
function getContactSettingsV60(){
  try { return {...DEFAULT_V60_CONTACTS, ...JSON.parse(localStorage.getItem(V60_CONTACT_SETTINGS_KEY)||'{}')}; } catch { return {...DEFAULT_V60_CONTACTS}; }
}
function saveContactSettingsV60(settings){ localStorage.setItem(V60_CONTACT_SETTINGS_KEY, JSON.stringify({...getContactSettingsV60(), ...settings})); }
function applyContactSettingsV60(){
  const s=getContactSettingsV60();
  const phoneDigits=String(s.phone||'').replace(/\D/g,'');
  const textDigits=String(s.textPhone||s.phone||'').replace(/\D/g,'');
  const email=s.bookingEmail||s.supportEmail||DEFAULT_V60_CONTACTS.bookingEmail;
  const call=document.getElementById('contactCallCard'); if(call){ call.href=`tel:+1${phoneDigits}`; call.querySelector('span') && (call.querySelector('span').textContent=formatPhoneV60(s.phone)); }
  const text=document.getElementById('contactTextCard'); if(text){ text.href=`sms:+1${textDigits}`; text.querySelector('span') && (text.querySelector('span').textContent=`${formatPhoneV60(s.textPhone||s.phone)} · Fastest for same-week party questions`); }
  const mail=document.getElementById('contactEmailCard'); if(mail){ mail.href=`mailto:${email}`; mail.querySelector('span') && (mail.querySelector('span').textContent=email); }
  document.querySelectorAll('a[href^="tel:+10000000000"],a[href^="tel:+13474719190"]').forEach(a=>a.href=`tel:+1${phoneDigits}`);
  document.querySelectorAll('a[href^="sms:+10000000000"],a[href^="sms:+13474719190"]').forEach(a=>a.href=`sms:+1${textDigits}`);
  document.querySelectorAll('a[href^="mailto:bookings@phoenixhibachi.com"],a[href^="mailto:phoenix4719190@gmail.com"]').forEach(a=>a.href=`mailto:${email}`);
  const policyBox=[...document.querySelectorAll('.contact-modal .contact-card, .contact-modal .policy-box, .contact-modal [class*="policy"]')].find(el=>/48-hour/i.test(el.textContent||''));
  if(policyBox){ const p=policyBox.querySelector('p,span') || policyBox; if(p) p.textContent=s.policy; }
  const phoneInput=document.getElementById('sitePhoneInput'); if(phoneInput) phoneInput.value=s.phone;
  const textInput=document.getElementById('siteTextPhoneInput'); if(textInput) textInput.value=s.textPhone;
  const bookInput=document.getElementById('siteBookingEmailInput'); if(bookInput) bookInput.value=s.bookingEmail;
  const supportInput=document.getElementById('siteSupportEmailInput'); if(supportInput) supportInput.value=s.supportEmail;
  const policyInput=document.getElementById('sitePolicyInput'); if(policyInput) policyInput.value=s.policy;
}
applyContactSettingsV60();
document.getElementById('saveContactSettingsBtn')?.addEventListener('click',()=>{
  if(currentDashboardRole && currentDashboardRole !== 'Admin'){ alert('Only Admin can change public contact settings.'); return; }
  saveContactSettingsV60({
    phone:document.getElementById('sitePhoneInput')?.value?.trim()||DEFAULT_V60_CONTACTS.phone,
    textPhone:document.getElementById('siteTextPhoneInput')?.value?.trim()||DEFAULT_V60_CONTACTS.textPhone,
    bookingEmail:document.getElementById('siteBookingEmailInput')?.value?.trim()||DEFAULT_V60_CONTACTS.bookingEmail,
    supportEmail:document.getElementById('siteSupportEmailInput')?.value?.trim()||DEFAULT_V60_CONTACTS.supportEmail,
    policy:document.getElementById('sitePolicyInput')?.value?.trim()||DEFAULT_V60_CONTACTS.policy
  });
  applyContactSettingsV60();
  alert('Contact settings saved for this browser preview. Connect Supabase site_settings for live multi-device storage.');
});

function setLoginRoleV60(role, chefOnly=false){
  const form=document.getElementById('portalLoginForm');
  const buttons=[...document.querySelectorAll('.login-tabs button')];
  if(!buttons.length) return;
  const target=buttons.find(b=>b.textContent.trim()===role) || buttons[0];
  buttons.forEach(b=>b.classList.toggle('active', b===target));
  form?.classList.toggle('chef-only-mode', !!chefOnly);
  updateLoginApplyShortcut?.();
}
document.querySelectorAll('[data-open-login]').forEach(btn=>{
  btn.addEventListener('click',(event)=>{
    const role=btn.getAttribute('data-login-role') || '';
    if(role){ event.preventDefault(); event.stopImmediatePropagation(); setLoginRoleV60(role,true); loginModal?.showModal?.(); }
    else { setLoginRoleV60('Member',false); }
  }, true);
});

const forgotPasswordModal=document.getElementById('forgotPasswordModal');
const changePasswordModal=document.getElementById('changePasswordModal');
document.getElementById('forgotPasswordBtn')?.addEventListener('click',()=>{ loginModal?.close?.(); forgotPasswordModal?.showModal?.(); });
document.getElementById('profileForgotPasswordBtn')?.addEventListener('click',()=>{ changePasswordModal?.close?.(); forgotPasswordModal?.showModal?.(); });
document.getElementById('forgotPasswordForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const email=new FormData(event.currentTarget).get('email');
  if(!email){ alert('Enter the account email first.'); return; }
  const client=initSupabaseClient();
  if(client){
    const { error }=await client.auth.resetPasswordForEmail(email, { redirectTo: cleanIndexUrl() });
    if(error){ alert('Reset email failed: '+error.message); return; }
  }
  forgotPasswordModal?.close?.();
  alert('If this account exists, a password reset email has been sent.');
});
document.getElementById('changePasswordForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const fd=new FormData(event.currentTarget);
  const next=String(fd.get('newPassword')||'');
  const confirm=String(fd.get('confirmNewPassword')||'');
  if(next.length<6){ alert('New password must be at least 6 characters.'); return; }
  if(next!==confirm){ alert('New password and confirmation do not match.'); return; }
  const client=initSupabaseClient();
  if(client && supabaseSession){
    const { error }=await client.auth.updateUser({ password: next });
    if(error){ alert('Password update failed: '+error.message); return; }
  }
  changePasswordModal?.close?.();
  alert('Password updated. If this was a local preview account, update the real Supabase Auth password before launch.');
});

// Replace profile alert with a profile/password modal.
document.getElementById('accountDropdown')?.addEventListener('click',(event)=>{
  const action=event.target.closest('[data-account-action]')?.dataset.accountAction;
  if(action!=='profile') return;
  event.preventDefault(); event.stopImmediatePropagation();
  const meta=getPortalSessionMeta?.();
  const info=document.getElementById('profileInfoText');
  if(info) info.textContent=`Email: ${meta?.email || '-'} · Role: ${meta?.role || '-'} — update your password below.`;
  changePasswordModal?.showModal?.();
}, true);

// Enhance People rows with reset password action.
const oldRenderPeopleManagementV60 = typeof renderPeopleManagement === 'function' ? renderPeopleManagement : null;
if(oldRenderPeopleManagementV60){
  renderPeopleManagement = function(role=currentDashboardRole){
    oldRenderPeopleManagementV60(role);
    const target=document.getElementById('peopleManagementList');
    if(!target || role !== 'Admin') return;
    const people=[...basePeopleRecords(), ...getPeopleRecords().filter(r=>!getHiddenPeopleIds().map(String).includes(String(r.id)))];
    target.querySelectorAll('.customer-row:not(.customer-head)').forEach((row,idx)=>{
      const p=people[idx]; if(!p) return;
      const actions=row.querySelector('.mini-actions');
      if(actions && p.email && !actions.querySelector('[data-reset-password]')){
        actions.insertAdjacentHTML('afterbegin', `<button type="button" data-reset-password="${escapeHtml(p.id)}" data-reset-email="${escapeHtml(p.email)}">Reset Password</button>`);
      }
    });
  }
}
document.addEventListener('click',async(event)=>{
  const btn=event.target.closest('[data-reset-password]');
  if(!btn) return;
  event.preventDefault(); event.stopPropagation();
  if(currentDashboardRole !== 'Admin'){ alert('Only Admin can reset passwords.'); return; }
  const email=btn.dataset.resetEmail;
  if(!email){ alert('No email is attached to this record.'); return; }
  const mode=confirm(`Send password reset email to ${email}?\n\nPress Cancel to create a local temporary-password note instead.`);
  if(mode){
    const client=initSupabaseClient();
    if(client){ const { error }=await client.auth.resetPasswordForEmail(email,{redirectTo: cleanIndexUrl()}); if(error){ alert('Supabase reset email failed: '+error.message); return; } }
    alert('Password reset email sent if the Supabase account exists.');
  } else {
    const temp=prompt('Enter temporary password to give this person. They should change it at next login.');
    if(!temp) return;
    const flags=JSON.parse(localStorage.getItem(V60_FORCE_PASSWORD_KEY)||'{}'); flags[email]={force:true,tempSetAt:new Date().toISOString()}; localStorage.setItem(V60_FORCE_PASSWORD_KEY,JSON.stringify(flags));
    alert('Temporary password note saved locally. For a live Supabase account, update the user password through a secure admin Edge Function or Supabase Dashboard.');
  }
});

// Chef application V60 field behavior and submit override.
function syncChefApplicationV60(form=document.getElementById('chefApplicationForm')){
  if(!form) return;
  const days=[...form.querySelectorAll('input[name="availabilityDay"]:checked')].map(x=>x.value);
  const areas=[...form.querySelectorAll('input[name="preferredArea"]:checked')].map(x=>x.value);
  const address=[form.chefStreet?.value, form.chefCity?.value, form.chefState?.value, form.chefZip?.value].filter(Boolean).join(', ');
  const a=form.querySelector('input[name="availability"]'); if(a) a.value=days.join(', ');
  const b=form.querySelector('input[name="baseZip"]'); if(b) b.value=areas.join(', ');
  const c=form.querySelector('input[name="serviceAreas"]'); if(c) c.value=address;
}
document.getElementById('chefApplicationForm')?.addEventListener('change',(event)=>{
  const form=event.currentTarget;
  if(event.target?.id==='chefEverydayCheck'){
    form.querySelectorAll('input[name="availabilityDay"]').forEach(cb=>cb.checked=event.target.checked);
  } else if(event.target?.name==='availabilityDay') {
    const boxes=[...form.querySelectorAll('input[name="availabilityDay"]')];
    const every=form.querySelector('#chefEverydayCheck'); if(every) every.checked=boxes.every(cb=>cb.checked);
  }
  syncChefApplicationV60(form);
});
document.getElementById('chefApplicationForm')?.addEventListener('input',(event)=>syncChefApplicationV60(event.currentTarget));
function collectFilesV60(form){
  const files=[];
  form.querySelectorAll('input[type="file"]').forEach(input=>{ [...(input.files||[])].forEach(file=>files.push(file)); });
  return files;
}
document.getElementById('chefApplicationForm')?.addEventListener('submit', async (event)=>{
  event.preventDefault(); event.stopImmediatePropagation();
  const form=event.currentTarget; syncChefApplicationV60(form);
  const fd=new FormData(form); const files=collectFilesV60(form);
  const password=String(fd.get('password')||''); const confirmPassword=String(fd.get('confirmPassword')||'');
  if(password.length<6){ alert('Please create a chef portal password with at least 6 characters.'); return; }
  if(password!==confirmPassword){ alert('Chef password and confirm password do not match.'); return; }
  const app={
    id:generateOrderId('CHEF'), createdAt:new Date().toISOString(), createdAtLabel:new Date().toLocaleString(),
    name:fd.get('name')||'', phone:fd.get('phone')||'', email:fd.get('email')||'',
    baseZip:fd.get('baseZip')||'', experience:fd.get('experience')||'', transportation:fd.get('transportation')||'',
    availability:fd.get('availability')||'', serviceAreas:fd.get('serviceAreas')||'', notes:fd.get('notes')||'',
    recoveryContact:fd.get('recoveryContact')||'', recoveryPinSet:!!fd.get('recoveryPin'),
    driverLicenseFiles:[...(form.querySelector('input[name="driverLicenseFiles"]')?.files||[])].map(f=>f.name),
    performanceVideoFiles:[...(form.querySelector('input[name="performanceVideoFiles"]')?.files||[])].map(f=>f.name),
    files:fileSummary(files), accountStatus:'pending'
  };
  const accountResult=await tryCreateChefPortalAccount(app,password); if(accountResult.userId) app.userId=accountResult.userId;
  const result=await saveChefApplicationToSupabase(app,files); if(result.files?.length) app.files=result.files;
  app.accountSetup=accountResult.message;
  const items=getStoredChefApplications(); items.unshift(app); saveStoredChefApplications(items);
  form.reset(); chefApplyModal?.close();
  alert(result.ok ? 'Chef application submitted. Your chef account is pending admin verification.' : 'Application saved locally, but Supabase had an issue: '+result.error+'\n\nYour chef account may still need admin setup.');
  if(supabaseSession) await loadDashboardDataFromSupabase(); renderDashboard(currentDashboardRole||'Manager');
}, true);

// Override application card labels for V60.
if(typeof applicationCard==='function'){
  applicationCard = function(app){
    const files=(app.files||[]).map((f,index)=>{ const label=`${f.name||'Attachment'} · ${f.sizeLabel||''}`; return f.path?`<button type="button" data-open-attachment="${escapeHtml(f.path)}">Attachment ${index+1}</button>`:`<span>${escapeHtml(label)}</span>`; }).join('');
    const status=app.accountStatus||app.account_status||app.status||'pending';
    const staffActions=['Admin','Manager'].includes(currentDashboardRole)?`<button type="button" data-person-activate="${escapeHtml(app.id)}">Approve / Activate</button><button type="button" data-person-pause="${escapeHtml(app.id)}">Pause chef</button><button type="button" data-person-delete="${escapeHtml(app.id)}">Delete</button>`:'';
    return `<article class="order-card application-card"><header><div><strong>${escapeHtml(app.name||app.id)}</strong><p>${escapeHtml(app.createdAtLabel||'')}</p></div><span class="tag">Chef application · ${escapeHtml(status)}</span></header><div class="customer-table compact-table"><div class="customer-row"><span>Phone<br><b>${escapeHtml(app.phone||'-')}</b></span><span>Email<br><b>${escapeHtml(app.email||'-')}</b></span><span>Preferred Order Area<br><b>${escapeHtml(app.baseZip||'-')}</b></span><span>Experience<br><b>${escapeHtml(app.experience||'-')}</b></span><span>Vehicle Type<br><b>${escapeHtml(app.transportation||'-')}</b></span></div></div><p>Available Days: ${escapeHtml(app.availability||'-')}<br>Chef Address: ${escapeHtml(app.serviceAreas||'-')}<br>Self Introduction: ${escapeHtml(app.notes||'-')}</p>${files?`<div class="file-list attachment-buttons">${files}</div>`:'<p>No optional license/video attachments listed.</p>'}<div class="order-actions"><a href="sms:${encodeURIComponent(app.phone||'')}">Text applicant</a><a href="mailto:${encodeURIComponent(app.email||'')}">Email</a><button type="button" data-copy-application="${escapeHtml(app.id)}">Copy application</button>${staffActions}</div></article>`;
  }
}

// Store member recovery fields by appending to notes for local preview without showing PIN.
const memberFormV60=document.getElementById('memberSignupForm');
memberFormV60?.addEventListener('submit',()=>{
  const rec=memberFormV60.querySelector('[name="recoveryContact"]')?.value?.trim();
  const pin=memberFormV60.querySelector('[name="recoveryPin"]')?.value?.trim();
  const notes=memberFormV60.querySelector('[name="notes"]');
  if(notes && (rec||pin)) notes.value = `${notes.value || ''}\nRecovery contact: ${rec || '-'}\nRecovery PIN set: ${pin ? 'Yes' : 'No'}`.trim();
}, true);

try { applyContactSettingsV60(); renderPeopleManagement?.(currentDashboardRole||'Admin'); } catch(e){ console.warn('V60 init skipped:',e); }





/* ======================================================================
   V71 staff login + add staff duplicate guard + delete order hardening
   - Fixes Customer Service local login not responding.
   - Add Staff gives feedback, prevents duplicate email/role records.
   - Delete Order uses a reliable confirmation modal and always responds.
   ====================================================================== */

(function initV71Tools(){
  if (!window.phoenixToastV71) {
    window.phoenixToastV71 = function(message, type='info', timeout=3800){
      if (typeof window.phoenixToast === 'function') return window.phoenixToast(message, type, timeout);
      let stack = document.getElementById('phoenixToastStack');
      if(!stack){
        stack = document.createElement('div');
        stack.id = 'phoenixToastStack';
        stack.className = 'phoenix-toast-stack';
        document.body.appendChild(stack);
      }
      const toast = document.createElement('div');
      toast.className = `phoenix-toast ${type}`;
      toast.innerHTML = `<span>${String(message || 'Done').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}</span><button type="button">×</button>`;
      toast.querySelector('button')?.addEventListener('click',()=>toast.remove());
      stack.appendChild(toast);
      requestAnimationFrame(()=>toast.classList.add('show'));
      setTimeout(()=>{ toast.classList.remove('show'); setTimeout(()=>toast.remove(),220); }, timeout);
      return toast;
    };
  }

  if (!window.phoenixConfirmV71) {
    window.phoenixConfirmV71 = function({title='Please confirm', message='Continue?', okText='Yes', cancelText='Cancel'} = {}){
      let modal = document.getElementById('phoenixConfirmModalV71');
      if(!modal){
        modal = document.createElement('div');
        modal.id = 'phoenixConfirmModalV71';
        modal.className = 'phoenix-confirm-backdrop v71-confirm';
        modal.hidden = true;
        modal.innerHTML = `
          <section class="phoenix-confirm-card" role="dialog" aria-modal="true">
            <p class="confirm-eyebrow">Confirm action</p>
            <h3 data-v71-title></h3>
            <p data-v71-message></p>
            <div class="phoenix-confirm-actions">
              <button type="button" class="btn-ghost" data-v71-cancel></button>
              <button type="button" class="btn-danger" data-v71-ok></button>
            </div>
          </section>`;
        document.body.appendChild(modal);
      }
      modal.querySelector('[data-v71-title]').textContent = title;
      modal.querySelector('[data-v71-message]').textContent = message;
      modal.querySelector('[data-v71-ok]').textContent = okText;
      modal.querySelector('[data-v71-cancel]').textContent = cancelText;
      modal.hidden = false;
      modal.classList.add('open');
      return new Promise(resolve => {
        const done = (value) => {
          modal.hidden = true;
          modal.classList.remove('open');
          modal.removeEventListener('click', onClick, true);
          document.removeEventListener('keydown', onKey, true);
          resolve(value);
        };
        const onClick = (event) => {
          if (event.target.closest('[data-v71-ok]')) done(true);
          else if (event.target.closest('[data-v71-cancel]') || event.target === modal) done(false);
        };
        const onKey = (event) => { if(event.key === 'Escape') done(false); };
        modal.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
        setTimeout(()=>modal.querySelector('[data-v71-cancel]')?.focus(), 20);
      });
    };
  }
})();

function normalizeRoleToUiV71(value){
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase().replace(/\s+/g, '_');
  const map = {
    admin:'Admin',
    manager:'Manager',
    customer_service:'Customer Service',
    customer:'Member',
    member:'Member',
    chef:'Chef'
  };
  return map[lower] || ({'Customer Service':'Customer Service', 'Admin':'Admin', 'Chef':'Chef', 'Member':'Member', 'Manager':'Manager'}[raw]) || 'Member';
}
function normalizeRoleToDbV71(value){
  const ui = normalizeRoleToUiV71(value);
  return ({Admin:'admin', Manager:'manager', 'Customer Service':'customer_service', Chef:'chef', Member:'customer'}[ui] || 'customer');
}
function selectedLoginRoleV71(){
  const active = document.querySelector('#portalLoginForm .login-tabs .active');
  return normalizeRoleToUiV71(active?.textContent?.replace(/\/.*/,'').trim() || 'Member');
}
function openDashboardForRoleV71(role, email){
  const uiRole = normalizeRoleToUiV71(role);
  setPortalSessionMeta?.(uiRole, email || '');
  if (isPortalRoute?.()) {
    try { renderDashboard(uiRole); } catch(error) { console.warn('V71 render dashboard fallback:', error); }
    try { loginModal?.close(); } catch {}
    if (typeof dashboardModal?.showModal === 'function' && !dashboardModal.open) dashboardModal.showModal();
  } else {
    try { localStorage.setItem(PORTAL_TAB_KEY, uiRole === 'Customer Service' ? 'orders' : ''); } catch {}
    openPortalInNewTab?.();
  }
}
function findLocalPeopleLoginV71(email, password, desiredRole){
  const target = String(email || '').trim().toLowerCase();
  const desired = normalizeRoleToDbV71(desiredRole);
  const people = (typeof getPeopleRecords === 'function' ? getPeopleRecords() : []);
  return people.find(p => {
    const emailMatch = String(p.email || '').trim().toLowerCase() === target;
    const roleMatch = normalizeRoleToDbV71(p.role || p.level || '') === desired;
    const statusOk = !['paused','deleted','removed','inactive'].includes(String(p.status || '').toLowerCase());
    const savedPassword = String(p.tempPassword || p.password || '').trim();
    const passwordOk = savedPassword ? savedPassword === String(password || '') : true;
    return emailMatch && roleMatch && statusOk && passwordOk;
  });
}

// Reliable login handler, including local staff records created from Admin / People Settings.
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('#portalLoginForm');
  if (!form) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const email = form.querySelector('input[type="email"]')?.value?.trim() || '';
  const password = form.querySelector('input[type="password"]')?.value || '';
  const requestedRole = selectedLoginRoleV71();

  if (!email || !password) {
    window.phoenixToastV71('Enter email and password first.', 'info');
    return;
  }

  const submitBtn = form.querySelector('button.gold-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalText = submitBtn.textContent;
    submitBtn.textContent = 'Logging in...';
  }

  try {
    // First try real Supabase login.
    const client = initSupabaseClient?.();
    if (client) {
      try {
        const profile = await signInPortal(email, password);
        if (profile) {
          const realRole = normalizeRoleToUiV71(profile.role || requestedRole);
          await loadDashboardDataFromSupabase?.();
          openDashboardForRoleV71(realRole, email);
      // V78: no success popup after login.
          return;
        }
      } catch (supabaseError) {
        console.warn('V71 Supabase login failed, trying local staff record:', supabaseError);
      }
    }

    // Local preview / manual staff record login.
    const local = findLocalPeopleLoginV71(email, password, requestedRole);
    if (local) {
      const role = normalizeRoleToUiV71(local.role);
      openDashboardForRoleV71(role, email);
      // V78: no success popup after login.
      return;
    }

    window.phoenixToastV71('Login failed. This account is not in Supabase Auth or the local Staff records, or the role/password does not match.', 'info', 6500);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.originalText || 'Login';
    }
  }
}, true);

// Add staff/member record: clear role choices, duplicate guard, clear feedback.
function installPeopleRoleOptionsV71(){
  const select = document.getElementById('peopleRoleSelect');
  if(!select) return;
  const current = select.value || 'customer_service';
  select.innerHTML = `
    <option value="customer_service">Customer Service / 客服</option>
    <option value="chef">Chef / 师傅</option>
    <option value="customer">Customer / 顾客</option>
    <option value="manager">Manager / 经理</option>
    <option value="admin">Admin / 管理员</option>`;
  select.value = [...select.options].some(o => o.value === current) ? current : 'customer_service';
}
installPeopleRoleOptionsV71();

document.addEventListener('click', (event) => {
  const btn = event.target.closest('#addPeopleRecordBtn');
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (currentDashboardRole && currentDashboardRole !== 'Admin') {
    window.phoenixToastV71('Only Admin can add staff/member records.', 'info');
    return;
  }

  const nameInput = document.getElementById('peopleNameInput');
  const emailInput = document.getElementById('peopleEmailInput');
  const passInput = document.getElementById('peopleTempPasswordInput');
  const roleSelect = document.getElementById('peopleRoleSelect');

  const name = nameInput?.value?.trim() || '';
  const email = emailInput?.value?.trim().toLowerCase() || '';
  const tempPassword = passInput?.value?.trim() || '';
  const role = roleSelect?.value || 'customer_service';

  if (!email) {
    window.phoenixToastV71('Enter the login email first.', 'info');
    emailInput?.focus();
    return;
  }

  const list = typeof getPeopleRecords === 'function' ? getPeopleRecords() : [];
  const duplicate = list.find(p =>
    String(p.email || '').trim().toLowerCase() === email &&
    normalizeRoleToDbV71(p.role || '') === normalizeRoleToDbV71(role) &&
    !['deleted','removed'].includes(String(p.status || '').toLowerCase())
  );
  if (duplicate) {
    window.phoenixToastV71('This email already exists for the selected role. I did not add a duplicate.', 'info', 5200);
    return;
  }

  btn.disabled = true;
  try {
    const record = {
      id: generateOrderId?.('USR') || `USR-${Date.now()}`,
      name: name || email,
      email,
      phone: '',
      role,
      status: role === 'chef' ? 'pending' : 'active',
      source: 'Manual admin record',
      tempPassword,
      createdAt: new Date().toISOString()
    };
    list.unshift(record);
    savePeopleRecords?.(list);
    renderPeopleManagement?.(currentDashboardRole || 'Admin');
    nameInput && (nameInput.value = '');
    emailInput && (emailInput.value = '');
    passInput && (passInput.value = '');
    window.phoenixToastV71(`${normalizeRoleToUiV71(role)} record added. ${tempPassword ? 'Local preview login can use that temporary password.' : 'No temporary password was saved.'}`, 'success', 5600);
  } finally {
    setTimeout(() => { btn.disabled = false; }, 500);
  }
}, true);

// Deleted orders: independent visibility layer.
function getDeletedOrderIdsV71(){
  try { return new Set(JSON.parse(localStorage.getItem('phoenix_deleted_orders_v71') || '[]').map(String)); }
  catch { return new Set(); }
}
function saveDeletedOrderIdsV71(set){
  localStorage.setItem('phoenix_deleted_orders_v71', JSON.stringify([...set].map(String)));
}
function markOrderDeletedV71(orderId){
  if(!orderId) return;
  const set = getDeletedOrderIdsV71();
  set.add(String(orderId));
  saveDeletedOrderIdsV71(set);
}
const previousGetDashboardOrdersV71 = typeof getDashboardOrders === 'function' ? getDashboardOrders : null;
if (previousGetDashboardOrdersV71) {
  getDashboardOrders = function(){
    const deleted = getDeletedOrderIdsV71();
    return (previousGetDashboardOrdersV71() || [])
      .filter(o => !deleted.has(String(o.id || o.booking_number || o.dbId || '')))
      .filter(o => !['deleted','removed'].includes(String(o.status || '').toLowerCase()));
  };
}
async function deleteOrderV71(orderId){
  if(!orderId) return;
  markOrderDeletedV71(orderId);
  try { saveStoredOrders(getStoredOrders().filter(o => String(o.id) !== String(orderId))); } catch {}
  try { if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.filter(o => String(o.id) !== String(orderId)); } catch {}
  const client = initSupabaseClient?.();
  if (client && supabaseSession) {
    try {
      const { error } = await client.from('bookings').update({status:'deleted'}).eq('booking_number', String(orderId));
      if (error) console.warn('V71 Supabase soft-delete failed:', error);
    } catch(error) {
      console.warn('V71 Supabase soft-delete threw:', error);
    }
  }
  try { renderDashboard(currentDashboardRole || 'Admin'); } catch {}
  try { if (!calendarSummaryPanel?.hidden) renderCalendarSummary(); } catch {}
}
document.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-delete-order]');
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const orderId = btn.dataset.deleteOrder || btn.closest('.order-card')?.querySelector('strong')?.textContent?.match(/\bPHX-[A-Z0-9-]+\b/i)?.[0] || '';
  const ok = await window.phoenixConfirmV71({
    title: 'Delete this order?',
    message: `Order ${orderId || ''} will be hidden from this dashboard. Connected Supabase orders will be marked deleted. Continue?`,
    okText: 'Yes, delete order',
    cancelText: 'Cancel'
  });
  if (!ok) return;
  btn.disabled = true;
  await deleteOrderV71(orderId);
  window.phoenixToastV71(`Order ${orderId} deleted/hidden.`, 'success');
}, true);

const previousRenderDashboardV71 = typeof renderDashboard === 'function' ? renderDashboard : null;
if(previousRenderDashboardV71){
  renderDashboard = function(role = currentDashboardRole || 'Admin'){
    previousRenderDashboardV71(role);
    setTimeout(() => {
      installPeopleRoleOptionsV71();
      if(['Admin','Manager','Customer Service'].includes(currentDashboardRole || role || '')){
        document.querySelectorAll('.order-card').forEach(card => {
          if(card.querySelector('[data-delete-order]')) return;
          const text = card.textContent || '';
          const match = text.match(/PHX-\d{6}-[A-Z0-9]{4}/i);
          if(!match) return;
          let actions = card.querySelector('.order-actions');
          if(!actions){ actions = document.createElement('div'); actions.className = 'order-actions'; card.appendChild(actions); }
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'danger-btn';
          b.dataset.deleteOrder = match[0];
          b.textContent = 'Delete order';
          actions.appendChild(b);
        });
      }
    }, 0);
  };
}


/* ======================================================================
   V70 admin confirm + order delete + contact save + route guide fix
   - Custom confirmation modal before destructive actions.
   - Delegated Contact Settings save so it works after dashboard re-render.
   - Adds/guarantees Delete buttons on order cards for staff.
   - Deleted orders are filtered locally and soft-deleted in Supabase when possible.
   - Adds plain-English explanation for route planner.
   ====================================================================== */

(function initPhoenixConfirmV70(){
  if (window.phoenixConfirmV70) return;
  function ensureModal(){
    let modal = document.getElementById('phoenixConfirmModalV70');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'phoenixConfirmModalV70';
    modal.className = 'phoenix-confirm-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="phoenix-confirm-card" role="dialog" aria-modal="true" aria-labelledby="phoenixConfirmTitleV70">
        <p class="confirm-eyebrow">Please confirm</p>
        <h3 id="phoenixConfirmTitleV70">Are you sure?</h3>
        <p id="phoenixConfirmMessageV70">This action cannot be undone from this dashboard.</p>
        <div class="phoenix-confirm-actions">
          <button type="button" class="btn-ghost" data-confirm-cancel>No, cancel</button>
          <button type="button" class="btn-danger" data-confirm-ok>Yes, continue</button>
        </div>
      </section>`;
    document.body.appendChild(modal);
    return modal;
  }
  window.phoenixConfirmV70 = function({title='Are you sure?', message='This action cannot be undone from this dashboard.', okText='Yes, continue', cancelText='No, cancel'} = {}){
    const modal = ensureModal();
    modal.querySelector('#phoenixConfirmTitleV70').textContent = title;
    modal.querySelector('#phoenixConfirmMessageV70').textContent = message;
    modal.querySelector('[data-confirm-ok]').textContent = okText;
    modal.querySelector('[data-confirm-cancel]').textContent = cancelText;
    modal.hidden = false;
    modal.classList.add('open');
    return new Promise(resolve => {
      const done = (value) => {
        modal.classList.remove('open');
        modal.hidden = true;
        modal.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        resolve(value);
      };
      const onClick = (event) => {
        if (event.target.closest('[data-confirm-ok]')) done(true);
        else if (event.target.closest('[data-confirm-cancel]') || event.target === modal) done(false);
      };
      const onKey = (event) => {
        if (event.key === 'Escape') done(false);
      };
      modal.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => modal.querySelector('[data-confirm-cancel]')?.focus(), 20);
    });
  };
})();

function toastV70(message, type='info', timeout=3600){
  if (typeof window.phoenixToast === 'function') return window.phoenixToast(message, type, timeout);
  if (typeof window.alert === 'function') return window.alert(message);
}

function getDeletedOrderIdsV70(){
  try { return new Set(JSON.parse(localStorage.getItem('phoenix_deleted_orders_v70') || '[]').map(String)); }
  catch { return new Set(); }
}
function saveDeletedOrderIdsV70(set){
  localStorage.setItem('phoenix_deleted_orders_v70', JSON.stringify([...set].map(String)));
}
function markOrderDeletedV70(orderId){
  const set = getDeletedOrderIdsV70();
  set.add(String(orderId));
  saveDeletedOrderIdsV70(set);
}
function isOrderVisibleV70(order){
  if (!order) return false;
  const status = String(order.status || '').toLowerCase();
  if (['deleted','removed','cancelled hidden'].includes(status)) return false;
  return !getDeletedOrderIdsV70().has(String(order.id || order.booking_number || order.dbId || ''));
}

const previousGetDashboardOrdersV70 = typeof getDashboardOrders === 'function' ? getDashboardOrders : null;
if (previousGetDashboardOrdersV70) {
  getDashboardOrders = function(){
    const rows = previousGetDashboardOrdersV70() || [];
    return rows.filter(isOrderVisibleV70);
  };
}

async function deleteOrderRecordV70(orderId){
  if (!orderId) return false;
  markOrderDeletedV70(orderId);

  // First hide it from local/dashboard caches immediately.
  try { saveStoredOrders(getStoredOrders().filter(o => String(o.id) !== String(orderId))); } catch {}
  try { if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.filter(o => String(o.id) !== String(orderId)); } catch {}

  // Supabase: DELETE likely needs a delete policy. If that fails, soft-delete via UPDATE, which staff already has.
  const client = initSupabaseClient?.();
  if (client && supabaseSession) {
    try {
      const { error: updateError } = await client
        .from('bookings')
        .update({ status:'deleted' })
        .eq('booking_number', orderId);
      if (updateError) console.warn('V70 Supabase order soft-delete failed:', updateError);
    } catch(error) {
      console.warn('V70 Supabase order soft-delete threw:', error);
    }
  }
  try { renderDashboard(currentDashboardRole || 'Admin'); } catch {}
  try { if (!calendarSummaryPanel?.hidden) renderCalendarSummary(); } catch {}
  return true;
}

function extractOrderIdFromCardV70(card){
  if (!card) return '';
  const direct = card.querySelector('[data-delete-order],[data-confirm-order],[data-complete-order],[data-copy-order],[data-print-guest],[data-print-chef]');
  const val = direct?.dataset?.deleteOrder || direct?.dataset?.confirmOrder || direct?.dataset?.completeOrder || direct?.dataset?.copyOrder || direct?.dataset?.printGuest || direct?.dataset?.printChef;
  if (val) return val;
  const text = card.textContent || '';
  const match = text.match(/PHX-\d{6}-[A-Z0-9]{4}/i);
  return match ? match[0] : '';
}
function ensureOrderDeleteButtonsV70(){
  if (!['Admin','Manager','Customer Service'].includes(currentDashboardRole || '')) return;
  document.querySelectorAll('.order-card').forEach(card => {
    const orderId = extractOrderIdFromCardV70(card);
    if (!orderId || card.querySelector('[data-delete-order]')) return;
    let actions = card.querySelector('.order-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'order-actions';
      card.appendChild(actions);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'danger-btn v70-delete-order';
    btn.dataset.deleteOrder = orderId;
    btn.textContent = 'Delete order';
    actions.appendChild(btn);
  });
}

function ensureRoutePlannerGuideV70(){
  const panel = document.getElementById('routePlannerPanel');
  if (!panel || document.getElementById('routePlannerGuideV70')) return;
  const guide = document.createElement('div');
  guide.id = 'routePlannerGuideV70';
  guide.className = 'route-guide-v70';
  guide.innerHTML = `
    <strong>Route planner 是什么？</strong>
    <p>这是后台给你自己用的派单路线预览：同一天多个订单时，系统会按时间、地址和师傅分成 A/B/C 路线，方便你判断谁先去、谁接下一单。它不是给顾客看的。地址没有地图坐标时会提示你用标准地址，暂时看不懂可以先忽略。</p>
    <button type="button" data-toggle-route-panel-v70>Hide route planner</button>`;
  panel.parentElement?.insertBefore(guide, panel);
}
document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-toggle-route-panel-v70]');
  if (!toggle) return;
  const panel = document.getElementById('routePlannerPanel');
  if (!panel) return;
  const hidden = panel.hidden || panel.classList.toggle('is-collapsed-v70');
  toggle.textContent = panel.classList.contains('is-collapsed-v70') ? 'Show route planner' : 'Hide route planner';
});

const previousRenderDashboardV70 = typeof renderDashboard === 'function' ? renderDashboard : null;
if (previousRenderDashboardV70) {
  renderDashboard = function(role = currentDashboardRole || 'Admin'){
    previousRenderDashboardV70(role);
    setTimeout(() => {
      try { ensureOrderDeleteButtonsV70(); } catch(error) { console.warn('V70 delete button repair skipped:', error); }
      try { ensureRoutePlannerGuideV70(); } catch(error) { console.warn('V70 route guide skipped:', error); }
    }, 0);
  };
}

// Destructive actions: custom confirmation first, then action.
document.addEventListener('click', async (event) => {
  const deleteOrderBtn = event.target.closest('[data-delete-order]');
  const deletePersonBtn = event.target.closest('[data-person-delete]');

  if (!deleteOrderBtn && !deletePersonBtn) return;
  if (!['Admin','Manager','Customer Service'].includes(currentDashboardRole || 'Admin')) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (deleteOrderBtn) {
    const orderId = deleteOrderBtn.dataset.deleteOrder || extractOrderIdFromCardV70(deleteOrderBtn.closest('.order-card'));
    const ok = await window.phoenixConfirmV70({
      title: 'Delete this order?',
      message: `Order ${orderId || ''} will be hidden from this dashboard. If connected to Supabase, it will be marked deleted. Continue?`,
      okText: 'Yes, delete order',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    deleteOrderBtn.disabled = true;
    await deleteOrderRecordV70(orderId);
    toastV70(`Order ${orderId} deleted/hidden.`, 'success');
    return;
  }

  if (deletePersonBtn) {
    const id = deletePersonBtn.dataset.personDelete;
    const ok = await window.phoenixConfirmV70({
      title: 'Delete this record?',
      message: 'This removes the record from the dashboard view. A real Supabase Auth login must still be disabled or deleted in Supabase Authentication. Continue?',
      okText: 'Yes, delete record',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    try { removeDashboardRecordEverywhereV69?.(id); }
    catch(error) {
      console.warn('V70 person delete fallback:', error);
      try { savePeopleRecords(getPeopleRecords().filter(p => String(p.id) !== String(id))); } catch {}
      try { saveStoredChefApplications(getStoredChefApplications().filter(p => String(p.id) !== String(id))); } catch {}
      try { saveMembershipApplications(getMembershipApplications().filter(p => String(p.id) !== String(id))); } catch {}
    }
    deletePersonBtn.closest('.customer-row, .order-card, .application-card')?.remove();
    try { renderDashboard(currentDashboardRole || 'Admin'); } catch {}
    toastV70('Record deleted/hidden from dashboard.', 'success');
  }
}, true);

// Delegated Contact Settings save. Direct listener can miss buttons rendered after dashboard refresh.
document.addEventListener('click', async (event) => {
  const btn = event.target.closest('#saveContactSettingsBtn');
  if (!btn) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (currentDashboardRole && currentDashboardRole !== 'Admin') {
    toastV70('Only Admin can change public contact settings.', 'info');
    return;
  }

  const settings = {
    phone: document.getElementById('sitePhoneInput')?.value?.trim() || DEFAULT_V60_CONTACTS.phone,
    textPhone: document.getElementById('siteTextPhoneInput')?.value?.trim() || DEFAULT_V60_CONTACTS.textPhone,
    bookingEmail: document.getElementById('siteBookingEmailInput')?.value?.trim() || DEFAULT_V60_CONTACTS.bookingEmail,
    supportEmail: document.getElementById('siteSupportEmailInput')?.value?.trim() || DEFAULT_V60_CONTACTS.supportEmail,
    policy: document.getElementById('sitePolicyInput')?.value?.trim() || DEFAULT_V60_CONTACTS.policy
  };

  saveContactSettingsV60(settings);
  applyContactSettingsV60();

  const client = initSupabaseClient?.();
  if (client && supabaseSession) {
    try {
      const value = typeof contactSettingsToDbV68 === 'function' ? contactSettingsToDbV68(settings) : {
        business_phone: settings.phone,
        text_phone: settings.textPhone,
        booking_email: settings.bookingEmail,
        support_email: settings.supportEmail,
        cancellation_policy_text: settings.policy,
        business_name: 'Phoenix Hibachi'
      };
      const { error } = await client.from('app_settings').upsert({
        key: 'contact_settings',
        value,
        updated_by: supabaseSession.user.id
      }, { onConflict: 'key' });
      if (error) throw error;
      toastV70('Contact settings saved to Supabase.', 'success');
    } catch(error) {
      console.warn('V70 Supabase contact save failed:', error);
      toastV70('Saved locally, but Supabase save failed. Check RLS/login.', 'info', 5200);
    }
  } else {
    toastV70('Contact settings saved locally. Login as Admin to save to Supabase.', 'success', 4600);
  }
}, true);

setTimeout(() => {
  try { ensureOrderDeleteButtonsV70(); } catch {}
  try { ensureRoutePlannerGuideV70(); } catch {}
}, 500);




/* ======================================================================
   V74 CENTER LOGIN NOTICE FIX
   Problem:
   Login failure toast was created behind/around the login dialog, so users only
   noticed it after closing the login window.
   Fix:
   - Login errors show in a centered high-z-index notice above every dialog.
   - Login modal also gets an inline error box.
   - Duplicate login-failed notices are collapsed so repeated clicks do not stack.
   ====================================================================== */
(function initV74CenterLoginNotice(){
  if (window.__phoenixV74CenterNoticeInstalled) return;
  window.__phoenixV74CenterNoticeInstalled = true;

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, s => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[s]));
  }

  function ensureCenterNotice(){
    let modal = document.getElementById('phoenixCenterNoticeV74');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'phoenixCenterNoticeV74';
    modal.className = 'phoenix-center-notice-v74';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="phoenix-center-card-v74" role="alertdialog" aria-modal="true" aria-labelledby="phoenixCenterTitleV74">
        <button type="button" class="phoenix-center-close-v74" data-center-close aria-label="Close">×</button>
        <p class="center-eyebrow-v74" data-center-eyebrow>Portal Notice</p>
        <h3 id="phoenixCenterTitleV74" data-center-title>Notice</h3>
        <p data-center-message></p>
        <div class="phoenix-center-actions-v74">
          <button type="button" class="gold-btn-v74" data-center-ok>Got it</button>
        </div>
      </section>`;
    document.body.appendChild(modal);

    const close = () => {
      modal.classList.remove('open');
      modal.hidden = true;
    };
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-center-close],[data-center-ok]')) close();
    }, true);
    document.addEventListener('keydown', (event) => {
      if (!modal.hidden && event.key === 'Escape') close();
    }, true);

    return modal;
  }

  function setLoginInlineError(message){
    const form = document.getElementById('portalLoginForm');
    if (!form) return;
    let box = document.getElementById('portalLoginInlineErrorV74');
    if (!box) {
      box = document.createElement('div');
      box.id = 'portalLoginInlineErrorV74';
      box.className = 'portal-login-error-v74';
      const passwordLabel = form.querySelector('label:has(input[type="password"])');
      const loginBtn = form.querySelector('button.gold-btn');
      form.insertBefore(box, loginBtn || passwordLabel?.nextSibling || form.firstChild);
    }
    box.textContent = message;
    box.hidden = false;
  }

  function clearLoginInlineError(){
    const box = document.getElementById('portalLoginInlineErrorV74');
    if (box) {
      box.textContent = '';
      box.hidden = true;
    }
  }

  window.phoenixCenterNoticeV74 = function(message, options = {}){
    const text = String(message || 'Something happened.');
    const modal = ensureCenterNotice();
    const isLogin = /login failed|account is not in supabase|password does not match|登录失败|登入失败/i.test(text);

    modal.querySelector('[data-center-eyebrow]').textContent = options.eyebrow || (isLogin ? 'Login failed' : 'Phoenix Notice');
    modal.querySelector('[data-center-title]').textContent = options.title || (isLogin ? 'Login failed' : 'Notice');
    modal.querySelector('[data-center-message]').innerHTML = esc(text);
    modal.hidden = false;
    modal.classList.add('open');

    if (isLogin) setLoginInlineError(text);

    setTimeout(() => {
      modal.querySelector('[data-center-ok]')?.focus();
    }, 30);

    return modal;
  };

  // Replace alert with center notice for important messages.
  const previousAlert = window.alert ? window.alert.bind(window) : null;
  window.alert = function(message){
    const text = String(message || '');
    if (/login failed|account is not in supabase|password does not match|failed|error|delete|deleted|saved|登录|登入/i.test(text)) {
      return window.phoenixCenterNoticeV74(text);
    }
    if (previousAlert) return previousAlert(text);
    return window.phoenixCenterNoticeV74(text);
  };

  // Wrap existing toast functions. Login failures must be center-front, not right-side toast.
  ['phoenixToast','phoenixToastV71','phoenixToastV72','phoenixToastV73'].forEach(name => {
    const old = window[name];
    window[name] = function(message, type='info', timeout=3800){
      const text = String(message || '');
      if (/login failed|account is not in supabase|password does not match|登录失败|登入失败/i.test(text)) {
        return window.phoenixCenterNoticeV74(text, {eyebrow:'Login failed', title:'Login failed'});
      }
      if (typeof old === 'function') return old(message, type, timeout);
      return window.phoenixCenterNoticeV74(text);
    };
  });

  // Keep login modal clean on typing / role switching.
  document.addEventListener('input', (event) => {
    if (event.target.closest('#portalLoginForm')) clearLoginInlineError();
  }, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('#portalLoginForm .login-tabs button')) clearLoginInlineError();
  }, true);

  // Prevent repeated rapid submit spam from stacking many errors.
  let lastSubmitAt = 0;
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('#portalLoginForm');
    if (!form) return;
    const now = Date.now();
    if (now - lastSubmitAt < 900) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      window.phoenixCenterNoticeV74('Please wait a second before trying again.', {eyebrow:'Login', title:'Please wait'});
      return false;
    }
    lastSubmitAt = now;
    clearLoginInlineError();
  }, true);

  // If an old toast was already created behind the login modal, clicking login again now shows center notice.
  window.addEventListener('click', (event) => {
    const loginButton = event.target?.closest?.('#portalLoginForm button.gold-btn');
    if (!loginButton) return;
    clearLoginInlineError();
  }, true);
})();

/* V77 ACTIVE FINAL FIXES: consolidated from V75 and V76 */
/* Phoenix Hibachi V75 final fixes
   1. Hard delete buttons: pointerdown + click + direct inline fallback.
   2. Paused dates are visibly marked in the booking calendars and in an admin pause calendar.
*/
(function(){
  if (window.__PHX_V75_INSTALLED__) return;
  window.__PHX_V75_INSTALLED__ = true;

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  function normalizeDate(value){
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
  }

  function makeToast(message, type='success', timeout=4300){
    let stack = document.getElementById('phxV75ToastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'phxV75ToastStack';
      stack.className = 'phx-v75-toast-stack';
      document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = `phx-v75-toast ${type}`;
    toast.innerHTML = `<span>${esc(message)}</span><button type="button" aria-label="Close">×</button>`;
    toast.querySelector('button')?.addEventListener('click', () => toast.remove());
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }, timeout);
  }

  function confirmCenter({title='Confirm', message='Continue?', okText='Yes', cancelText='Cancel'} = {}){
    let modal = document.getElementById('phxV75Confirm');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'phxV75Confirm';
      modal.className = 'phx-v75-confirm-backdrop';
      modal.hidden = true;
      modal.innerHTML = `
        <section class="phx-v75-confirm-card" role="dialog" aria-modal="true">
          <p class="phx-v75-eyebrow">Confirm action</p>
          <h3 data-title></h3>
          <p data-message></p>
          <div class="phx-v75-actions">
            <button type="button" class="phx-v75-cancel" data-cancel></button>
            <button type="button" class="phx-v75-delete" data-ok></button>
          </div>
        </section>`;
      document.body.appendChild(modal);
    }

    modal.querySelector('[data-title]').textContent = title;
    modal.querySelector('[data-message]').textContent = message;
    modal.querySelector('[data-ok]').textContent = okText;
    modal.querySelector('[data-cancel]').textContent = cancelText;
    modal.hidden = false;
    modal.classList.add('open');

    return new Promise(resolve => {
      let closed = false;
      const finish = (value) => {
        if (closed) return;
        closed = true;
        modal.hidden = true;
        modal.classList.remove('open');
        modal.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        resolve(value);
      };
      const onClick = (event) => {
        if (event.target.closest('[data-ok]')) finish(true);
        else if (event.target.closest('[data-cancel]') || event.target === modal) finish(false);
      };
      const onKey = (event) => {
        if (event.key === 'Escape') finish(false);
      };
      modal.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => modal.querySelector('[data-cancel]')?.focus(), 20);
    });
  }

  function deletedSet(key){
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]').map(String)); }
    catch { return new Set(); }
  }
  function addDeleted(key, id){
    if (!id) return;
    const set = deletedSet(key);
    set.add(String(id));
    localStorage.setItem(key, JSON.stringify([...set]));
  }

  function findOrderId(btn){
    const direct = btn?.dataset?.deleteOrder || btn?.getAttribute?.('data-delete-order');
    if (direct) return String(direct).trim();
    const text = btn?.closest?.('.order-card,.dispatch-card,article,section')?.textContent || '';
    return text.match(/PHX-\d{6}-[A-Z0-9]{4}/i)?.[0] || '';
  }

  function findPersonId(btn){
    return btn?.dataset?.personDelete || btn?.getAttribute?.('data-person-delete') || '';
  }

  function hideElementCard(btn){
    const card = btn?.closest?.('.order-card,.dispatch-card,.customer-row,.application-card,article');
    if (!card) return;
    card.classList.add('phx-v75-removing');
    setTimeout(() => card.remove(), 220);
  }

  async function softDeleteOrderSupabase(orderId){
    try {
      const client = typeof initSupabaseClient === 'function' ? initSupabaseClient() : null;
      const session = typeof supabaseSession !== 'undefined' ? supabaseSession : null;
      if (!client || !session) return false;
      const { error } = await client.from('bookings').update({status:'deleted'}).eq('booking_number', String(orderId));
      if (error) {
        console.warn('V75 Supabase order soft delete failed:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.warn('V75 Supabase order soft delete threw:', error);
      return false;
    }
  }

  async function softDeletePersonSupabase(id){
    try {
      const client = typeof initSupabaseClient === 'function' ? initSupabaseClient() : null;
      const session = typeof supabaseSession !== 'undefined' ? supabaseSession : null;
      if (!client || !session) return false;
      const { error } = await client.from('chef_applications').update({status:'deleted', account_status:'deleted'}).eq('id', String(id));
      if (error) {
        console.warn('V75 Supabase person soft delete failed:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.warn('V75 Supabase person soft delete threw:', error);
      return false;
    }
  }

  let lastDeleteAt = 0;

  window.PHX_FORCE_DELETE_ORDER_V75 = async function(event, button){
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }

    // Avoid pointerdown + click double firing.
    const now = Date.now();
    if (now - lastDeleteAt < 650) return false;
    lastDeleteAt = now;

    const btn = button || event?.target?.closest?.('[data-delete-order]');
    const orderId = findOrderId(btn);
    if (!orderId) {
      makeToast('找不到订单号，刷新页面后再试。', 'info', 5200);
      return false;
    }

    const ok = await confirmCenter({
      title: 'Delete this order?',
      message: `确定删除订单 ${orderId} 吗？删除后后台会隐藏；如果连接 Supabase，会把它标记为 deleted。`,
      okText: 'Yes, delete order',
      cancelText: 'Cancel'
    });
    if (!ok) return false;

    btn && (btn.disabled = true);

    ['phoenix_deleted_orders_v70','phoenix_deleted_orders_v71','phoenix_deleted_orders_v72','phoenix_deleted_orders_v73','phoenix_deleted_orders_v75'].forEach(k => addDeleted(k, orderId));

    try { saveStoredOrders(getStoredOrders().filter(o => String(o.id) !== String(orderId))); } catch {}
    try { if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.filter(o => String(o.id) !== String(orderId)); } catch {}

    hideElementCard(btn);
    const remoteOk = await softDeleteOrderSupabase(orderId);

    try { renderDashboard(currentDashboardRole || 'Admin'); } catch {}
    try { if (!calendarSummaryPanel?.hidden) renderCalendarSummary(); } catch {}

    makeToast(remoteOk ? `订单 ${orderId} 已删除并同步 Supabase。` : `订单 ${orderId} 已从后台隐藏。`, 'success', 5200);
    return false;
  };

  window.PHX_FORCE_DELETE_PERSON_V75 = async function(event, button){
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }

    const now = Date.now();
    if (now - lastDeleteAt < 650) return false;
    lastDeleteAt = now;

    const btn = button || event?.target?.closest?.('[data-person-delete]');
    const id = findPersonId(btn);
    if (!id) {
      makeToast('找不到记录 ID，刷新页面后再试。', 'info', 5200);
      return false;
    }

    const ok = await confirmCenter({
      title: 'Delete this record?',
      message: '确定删除这条人员/申请记录吗？这会从后台隐藏；真实 Supabase Auth 登录账号仍需要在 Supabase Authentication 里处理。',
      okText: 'Yes, delete record',
      cancelText: 'Cancel'
    });
    if (!ok) return false;

    btn && (btn.disabled = true);

    ['phoenix_deleted_dashboard_records_v69','phoenix_deleted_dashboard_records_v73','phoenix_deleted_dashboard_records_v75'].forEach(k => addDeleted(k, id));

    try { savePeopleRecords(getPeopleRecords().filter(p => String(p.id) !== String(id))); } catch {}
    try { saveStoredChefApplications(getStoredChefApplications().filter(p => String(p.id) !== String(id))); } catch {}
    try { saveMembershipApplications(getMembershipApplications().filter(p => String(p.id) !== String(id))); } catch {}
    try { if (Array.isArray(remoteChefApplicationsCache)) remoteChefApplicationsCache = remoteChefApplicationsCache.filter(p => String(p.id) !== String(id)); } catch {}

    hideElementCard(btn);
    await softDeletePersonSupabase(id);
    try { renderDashboard(currentDashboardRole || 'Admin'); } catch {}

    makeToast('记录已从后台隐藏。', 'success', 5200);
    return false;
  };

  // Highest-level capture for mouse and touch/pointer.
  ['pointerdown','mousedown','click','touchstart'].forEach(type => {
    window.addEventListener(type, function(event){
      const orderBtn = event.target?.closest?.('[data-delete-order]');
      const personBtn = event.target?.closest?.('[data-person-delete]');
      if (!orderBtn && !personBtn) return;
      if (type !== 'click') event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (orderBtn) window.PHX_FORCE_DELETE_ORDER_V75(event, orderBtn);
      else window.PHX_FORCE_DELETE_PERSON_V75(event, personBtn);
      return false;
    }, true);
  });

  function attachInlineDeleteFallbacks(){
    document.querySelectorAll('[data-delete-order]').forEach(btn => {
      btn.classList.add('phx-v75-delete-ready');
      btn.setAttribute('onpointerdown', 'return window.PHX_FORCE_DELETE_ORDER_V75(event,this)');
      btn.setAttribute('onclick', 'return window.PHX_FORCE_DELETE_ORDER_V75(event,this)');
    });
    document.querySelectorAll('[data-person-delete]').forEach(btn => {
      btn.classList.add('phx-v75-delete-ready');
      btn.setAttribute('onpointerdown', 'return window.PHX_FORCE_DELETE_PERSON_V75(event,this)');
      btn.setAttribute('onclick', 'return window.PHX_FORCE_DELETE_PERSON_V75(event,this)');
    });
  }

  // Filter deleted rows after old dashboard render.
  const prevGetOrders = typeof getDashboardOrders === 'function' ? getDashboardOrders : null;
  if (prevGetOrders) {
    getDashboardOrders = function(){
      const deleted = new Set([
        ...deletedSet('phoenix_deleted_orders_v70'),
        ...deletedSet('phoenix_deleted_orders_v71'),
        ...deletedSet('phoenix_deleted_orders_v72'),
        ...deletedSet('phoenix_deleted_orders_v73'),
        ...deletedSet('phoenix_deleted_orders_v75')
      ]);
      return (prevGetOrders() || [])
        .filter(o => !deleted.has(String(o.id || o.booking_number || o.dbId || '')))
        .filter(o => !['deleted','removed'].includes(String(o.status || '').toLowerCase()));
    };
  }

  const prevGetApps = typeof getDashboardApplications === 'function' ? getDashboardApplications : null;
  if (prevGetApps) {
    getDashboardApplications = function(){
      const deleted = new Set([
        ...deletedSet('phoenix_deleted_dashboard_records_v69'),
        ...deletedSet('phoenix_deleted_dashboard_records_v73'),
        ...deletedSet('phoenix_deleted_dashboard_records_v75')
      ]);
      return (prevGetApps() || [])
        .filter(o => !deleted.has(String(o.id || '')))
        .filter(o => !['deleted','removed'].includes(String(o.status || o.accountStatus || o.account_status || '').toLowerCase()));
    };
  }

  // Paused date calendar marking.
  function isPausedDateV75(date){
    try {
      const key = normalizeDate(date);
      return Boolean(key && getPausedBookingDates && getPausedBookingDates()[key]);
    } catch { return false; }
  }

  const originalGetStatus = typeof getStatus === 'function' ? getStatus : null;
  if (originalGetStatus) {
    getStatus = function(date){
      if (typeof isPastDate === 'function' && isPastDate(date)) return 'past';
      if (isPausedDateV75(date)) return 'paused';
      return originalGetStatus(date);
    };
  }

  const originalGetSlots = typeof getSlotsForStatus === 'function' ? getSlotsForStatus : null;
  if (originalGetSlots) {
    getSlotsForStatus = function(status){
      if (status === 'paused') {
        return [{time:'Date paused', note:'Admin paused this event date', booked:'Not accepting requests', status:'Paused', disabled:true}];
      }
      return originalGetSlots(status);
    };
  }

  function renderPausedAdminCalendarV75(){
    const host = document.getElementById('pausedDatesList');
    if (!host) return;

    let panel = document.getElementById('phxPausedCalendarV75');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'phxPausedCalendarV75';
      panel.className = 'phx-paused-calendar-v75';
      host.insertAdjacentElement('afterend', panel);
    }

    let base = document.getElementById('bookingPauseDateInput')?.value || '';
    let baseDate = base ? new Date(base + 'T00:00:00') : new Date();
    if (Number.isNaN(baseDate.getTime())) baseDate = new Date();

    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const paused = typeof getPausedBookingDates === 'function' ? getPausedBookingDates() : {};

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = normalizeDate(d);
      const inMonth = d.getMonth() === month;
      const isPaused = Boolean(paused[key]);
      cells.push(`<button type="button" class="${inMonth ? '' : 'dim'} ${isPaused ? 'paused' : ''}" data-v75-pause-date="${key}" title="${isPaused ? 'Paused date' : 'Click to select date'}"><span>${d.getDate()}</span>${isPaused ? '<b>Paused</b>' : ''}</button>`);
    }

    const label = baseDate.toLocaleDateString('en-US', {month:'long', year:'numeric'});
    panel.innerHTML = `
      <div class="phx-paused-calendar-head-v75">
        <strong>Paused date marker</strong>
        <small>${label} · paused dates are marked red</small>
      </div>
      <div class="phx-paused-week-v75"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
      <div class="phx-paused-grid-v75">${cells.join('')}</div>
      <p class="small-muted">注意：浏览器自带的日期下拉框不能被网页标记颜色；这里的自定义小日历会标记 paused 日期。</p>
    `;
  }

  document.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-v75-pause-date]');
    if (!cell) return;
    const input = document.getElementById('bookingPauseDateInput');
    if (input) {
      input.value = cell.dataset.v75PauseDate;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    }
    try { renderBookingAcceptanceState(); } catch {}
    renderPausedAdminCalendarV75();
  }, true);

  const prevRenderBookingAcceptance = typeof renderBookingAcceptanceState === 'function' ? renderBookingAcceptanceState : null;
  if (prevRenderBookingAcceptance) {
    renderBookingAcceptanceState = function(){
      const out = prevRenderBookingAcceptance();
      renderPausedAdminCalendarV75();
      return out;
    };
  }

  const prevPause = typeof pauseBookingDate === 'function' ? pauseBookingDate : null;
  if (prevPause) {
    pauseBookingDate = function(dateKey){
      const out = prevPause(dateKey);
      try { renderMainCalendar(); renderMiniCalendar(); renderSlots(); } catch {}
      renderPausedAdminCalendarV75();
      makeToast(`Paused date marked: ${normalizeDate(dateKey)}`, 'success', 3600);
      return out;
    };
  }

  const prevResume = typeof resumeBookingDate === 'function' ? resumeBookingDate : null;
  if (prevResume) {
    resumeBookingDate = function(dateKey){
      const out = prevResume(dateKey);
      try { renderMainCalendar(); renderMiniCalendar(); renderSlots(); } catch {}
      renderPausedAdminCalendarV75();
      makeToast(`Resumed date: ${normalizeDate(dateKey)}`, 'success', 3600);
      return out;
    };
  }

  const prevRenderDashboard = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (prevRenderDashboard) {
    renderDashboard = function(role = currentDashboardRole || 'Admin'){
      const out = prevRenderDashboard(role);
      setTimeout(() => {
        attachInlineDeleteFallbacks();
        renderPausedAdminCalendarV75();
        try { renderMainCalendar(); renderMiniCalendar(); } catch {}
      }, 0);
      setTimeout(attachInlineDeleteFallbacks, 300);
      return out;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    attachInlineDeleteFallbacks();
    renderPausedAdminCalendarV75();
    try { renderMainCalendar(); renderMiniCalendar(); } catch {}
  });

  setInterval(attachInlineDeleteFallbacks, 1000);
  setTimeout(() => {
    attachInlineDeleteFallbacks();
    renderPausedAdminCalendarV75();
    try { renderMainCalendar(); renderMiniCalendar(); } catch {}
  }, 500);
})();



/* Phoenix Hibachi V76 Calendar Availability Fix
   Fix:
   - Old demo logic made every Monday unavailable/off.
   - Real business should not auto-close Mondays unless Admin pauses the date.
   - Past dates remain disabled.
   - Admin paused dates remain marked as paused/red.
   - Existing demo full/limited pattern remains, but no weekday is forced unavailable.
*/
(function(){
  if (window.__PHX_V76_CALENDAR_FIX__) return;
  window.__PHX_V76_CALENDAR_FIX__ = true;

  function normalizeDateV76(value){
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
  }

  function isPausedV76(date){
    try {
      const key = normalizeDateV76(date);
      return Boolean(key && typeof getPausedBookingDates === 'function' && getPausedBookingDates()[key]);
    } catch {
      return false;
    }
  }

  // Main fix: no weekday is automatically unavailable.
  // Monday can be open/limited/full the same as other days.
  window.getStatus = function(date){
    if (typeof isPastDate === 'function' && isPastDate(date)) return 'past';
    if (isPausedV76(date)) return 'paused';

    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return 'open';

    // Demo availability pattern:
    // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    // Keep some limited/full color variation, but do NOT force Mondays off.
    const day = d.getDay();
    const dayNumber = d.getDate();

    // Saturdays / busy dates: limited or full sometimes
    if (day === 6 || day === 5 || day === 0) {
      if (dayNumber % 7 === 0) return 'full';
      return 'limited';
    }

    // Some midweek dates limited for demo load.
    if (dayNumber % 5 === 0) return 'limited';

    // Otherwise open.
    return 'open';
  };

  // Slots for paused dates.
  const previousSlotsV76 = typeof getSlotsForStatus === 'function' ? getSlotsForStatus : null;
  if (previousSlotsV76) {
    window.getSlotsForStatus = function(status){
      if (status === 'paused') {
        return [{time:'Date paused', note:'Admin paused this event date', booked:'Not accepting requests', status:'Paused', disabled:true}];
      }
      return previousSlotsV76(status);
    };
  }

  // Re-render calendars after this override.
  setTimeout(() => {
    try { renderMainCalendar(); } catch {}
    try { renderMiniCalendar(); } catch {}
    try { renderSlots(); } catch {}
    try { renderBookingAcceptanceState(); } catch {}
  }, 80);
})();



/* ======================================================================
   V81 ORDER DELETE ID FIX
   Fixes order deletion staying visible because old text extraction captured:
   PHX-260626-TVADJuly instead of PHX-260626-TVAD.
   ====================================================================== */
(function initPHXV81OrderDeleteIdFix(){
  if (window.__PHX_V81_ORDER_DELETE_FIX__) return;
  window.__PHX_V81_ORDER_DELETE_FIX__ = true;

  function cleanOrderIdV81(value){
    return String(value || '').match(/PHX-\d{6}-[A-Z0-9]{4}/i)?.[0] || '';
  }

  function deletedSetV81(key){
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]').map(String)); }
    catch { return new Set(); }
  }

  function allDeletedOrderIdsV81(){
    return new Set([
      ...deletedSetV81('phoenix_deleted_orders_v70'),
      ...deletedSetV81('phoenix_deleted_orders_v71'),
      ...deletedSetV81('phoenix_deleted_orders_v72'),
      ...deletedSetV81('phoenix_deleted_orders_v73'),
      ...deletedSetV81('phoenix_deleted_orders_v75'),
      ...deletedSetV81('phoenix_deleted_orders_v78'),
      ...deletedSetV81('phoenix_deleted_orders_v81')
    ]);
  }

  function addDeletedV81(id){
    const clean = cleanOrderIdV81(id);
    if (!clean) return clean;
    [
      'phoenix_deleted_orders_v70',
      'phoenix_deleted_orders_v71',
      'phoenix_deleted_orders_v72',
      'phoenix_deleted_orders_v73',
      'phoenix_deleted_orders_v75',
      'phoenix_deleted_orders_v78',
      'phoenix_deleted_orders_v81'
    ].forEach(key => {
      const set = deletedSetV81(key);
      set.add(clean);
      localStorage.setItem(key, JSON.stringify([...set]));
    });
    return clean;
  }

  function removeDeletedCardsV81(){
    const deleted = allDeletedOrderIdsV81();
    document.querySelectorAll('.order-card, .dispatch-card, article').forEach(card => {
      const id = cleanOrderIdV81(card.textContent || '');
      if (id && deleted.has(id)) card.remove();
    });
  }

  // Clean any data-delete-order value that older code attached incorrectly.
  function repairDeleteButtonsV81(){
    document.querySelectorAll('[data-delete-order]').forEach(btn => {
      const clean = cleanOrderIdV81(btn.dataset.deleteOrder || btn.getAttribute('data-delete-order') || btn.closest('.order-card,.dispatch-card,article')?.textContent || '');
      if (clean) {
        btn.dataset.deleteOrder = clean;
        btn.setAttribute('data-delete-order', clean);
      }
    });
    removeDeletedCardsV81();
  }

  // Wrap V78 handler so the deleted ID is stored cleanly before the original logic runs.
  const oldDelete = window.PHX_DELETE_ORDER_V78;
  if (typeof oldDelete === 'function') {
    window.PHX_DELETE_ORDER_V78 = function(event, btn){
      const clean = cleanOrderIdV81(btn?.dataset?.deleteOrder || btn?.getAttribute?.('data-delete-order') || btn?.closest?.('.order-card,.dispatch-card,article')?.textContent || '');
      if (clean && btn) {
        btn.dataset.deleteOrder = clean;
        btn.setAttribute('data-delete-order', clean);
      }
      return oldDelete(event, btn);
    };
  }

  // Wrap render to remove already-deleted cards after dashboard refresh.
  const oldRender = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (oldRender && !window.__PHX_V81_RENDER_WRAPPED__) {
    window.__PHX_V81_RENDER_WRAPPED__ = true;
    renderDashboard = function(role = currentDashboardRole || 'Admin'){
      const out = oldRender(role);
      setTimeout(repairDeleteButtonsV81, 0);
      setTimeout(removeDeletedCardsV81, 260);
      return out;
    };
  }

  // Last-resort: after clicking a delete confirmation button, clean visible rows again.
  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const deleteBtn = event.target.closest?.('[data-delete-order]');
    if (deleteBtn) {
      const clean = cleanOrderIdV81(deleteBtn.dataset.deleteOrder || deleteBtn.closest('.order-card,.dispatch-card,article')?.textContent || '');
      if (clean) {
        deleteBtn.dataset.deleteOrder = clean;
        deleteBtn.setAttribute('data-delete-order', clean);
      }
    }

    const ok = event.target.closest?.('.phx-v78-danger,[data-v78-ok]');
    if (ok) {
      setTimeout(repairDeleteButtonsV81, 120);
      setTimeout(removeDeletedCardsV81, 520);
    }
  }, true);

  document.addEventListener('DOMContentLoaded', repairDeleteButtonsV81);
  setTimeout(repairDeleteButtonsV81, 300);
  setTimeout(repairDeleteButtonsV81, 900);
})();




/* ======================================================================
   V85 ROLE VISIBILITY ONLY — LOGIN RESTORED TO V81
   This patch intentionally does NOT change:
   - portal login submit
   - openPortalInNewTab
   - session storage
   - login modal behavior

   It only hides dashboard tabs/pages that the logged-in role should not see.
   ====================================================================== */
(function initPHXV85RoleVisibilityOnly(){
  if (window.__PHX_V85_ROLE_VISIBILITY_ONLY__) return;
  window.__PHX_V85_ROLE_VISIBILITY_ONLY__ = true;

  const ROLE_TABS = {
    Admin: ['orders','customers','people','feedback','applications','dispatch'],
    Manager: ['orders','customers','feedback','applications','dispatch'],
    'Customer Service': ['orders','customers','feedback'],
    Chef: ['dispatch'],
    Member: ['orders'],
    Customer: ['orders']
  };

  function normalizeRole(role){
    const raw = String(role || currentDashboardRole || '').trim();
    const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (lower.includes('customer_service')) return 'Customer Service';
    if (lower === 'admin') return 'Admin';
    if (lower === 'manager') return 'Manager';
    if (lower === 'chef') return 'Chef';
    if (lower === 'customer' || lower === 'member') return 'Member';
    return raw || 'Member';
  }

  function allowedTabs(role){
    return ROLE_TABS[normalizeRole(role)] || ['orders'];
  }

  function firstAllowed(role){
    return allowedTabs(role)[0] || 'orders';
  }

  function isAllowed(tab, role){
    return allowedTabs(role).includes(tab);
  }

  window.PHX_APPLY_ROLE_VISIBILITY_V85 = function(role = currentDashboardRole || 'Member'){
    const clean = normalizeRole(role);
    const allowed = new Set(allowedTabs(clean));

    document.querySelectorAll('[data-dashboard-tab]').forEach(btn => {
      const tab = btn.dataset.dashboardTab;
      const show = allowed.has(tab);
      btn.hidden = !show;
      btn.style.display = show ? '' : 'none';
      btn.disabled = !show;
      btn.setAttribute('aria-hidden', show ? 'false' : 'true');
      if (!show) btn.classList.remove('active');
    });

    document.querySelectorAll('[data-dashboard-page]').forEach(page => {
      const tab = page.dataset.dashboardPage;
      const show = allowed.has(tab);
      page.hidden = !show;
      page.style.display = show ? '' : 'none';
      if (!show) page.classList.remove('active');
    });

    const current = currentDashboardTab || document.querySelector('[data-dashboard-tab].active')?.dataset.dashboardTab || '';
    const safe = allowed.has(current) ? current : firstAllowed(clean);

    document.querySelectorAll('[data-dashboard-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dashboardTab === safe && allowed.has(safe));
    });

    document.querySelectorAll('[data-dashboard-page]').forEach(page => {
      const active = page.dataset.dashboardPage === safe && allowed.has(safe);
      page.classList.toggle('active', active);
      if (active) {
        page.hidden = false;
        page.style.display = '';
      }
    });

    currentDashboardTab = safe;

    // Friendly role-specific dashboard help text.
    const help = document.getElementById('dashboardHelp');
    if (help) {
      const copy = {
        Admin: 'Full admin dashboard: orders, customers, people/settings, support, applications, and dispatch.',
        Manager: 'Manager dashboard: orders, customers, support, chef applications, and dispatch.',
        'Customer Service': 'Customer Service dashboard: orders, customer/member contacts, and complaints/suggestions only.',
        Chef: 'Chef dashboard: assigned parties, route notes, customer details, travel time, and travel fee only.',
        Member: 'Member portal: your bookings and request status only.'
      };
      help.innerHTML = `<span class="role-badge">${clean}</span> ${copy[clean] || copy.Member}`;
    }
  };

  const oldSetDashboardTab = typeof setDashboardTab === 'function' ? setDashboardTab : null;
  if (oldSetDashboardTab && !window.__PHX_V85_SET_TAB_WRAPPED__) {
    window.__PHX_V85_SET_TAB_WRAPPED__ = true;
    setDashboardTab = function(tab){
      const role = normalizeRole(currentDashboardRole);
      const safe = isAllowed(tab, role) ? tab : firstAllowed(role);
      oldSetDashboardTab(safe);
      window.PHX_APPLY_ROLE_VISIBILITY_V85(role);
    };
  }

  const oldRenderDashboard = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (oldRenderDashboard && !window.__PHX_V85_RENDER_WRAPPED__) {
    window.__PHX_V85_RENDER_WRAPPED__ = true;
    renderDashboard = function(role = currentDashboardRole || 'Member'){
      const clean = normalizeRole(role);
      currentDashboardRole = clean;
      const out = oldRenderDashboard(clean);
      setTimeout(() => window.PHX_APPLY_ROLE_VISIBILITY_V85(clean), 0);
      setTimeout(() => window.PHX_APPLY_ROLE_VISIBILITY_V85(clean), 120);
      setTimeout(() => window.PHX_APPLY_ROLE_VISIBILITY_V85(clean), 350);
      return out;
    };
  }

  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const btn = event.target.closest?.('[data-dashboard-tab]');
    if (!btn) return;
    const tab = btn.dataset.dashboardTab;
    const role = normalizeRole(currentDashboardRole);
    if (!isAllowed(tab, role)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      window.PHX_APPLY_ROLE_VISIBILITY_V85(role);
      return false;
    }
  }, true);
})();




/* ======================================================================
   V86 CLOSE LOGIN MODAL AFTER PORTAL OPENS
   Restores V81-style login flow:
   - Successful login still opens dashboard in a new tab.
   - Original page closes the login popup and returns to the normal homepage.
   - Does not replace login submit/session/openPortalInNewTab logic.
   ====================================================================== */
(function initPHXV86CloseLoginAfterPortalOpen(){
  if (window.__PHX_V86_CLOSE_LOGIN__) return;
  window.__PHX_V86_CLOSE_LOGIN__ = true;

  function closeLoginModalV86(){
    const login = document.getElementById('loginModal');
    try {
      if (login && login.open && typeof login.close === 'function') login.close();
    } catch {}

    document.body.classList.remove('modal-open', 'dialog-open', 'no-scroll');
    document.documentElement.classList.remove('modal-open', 'dialog-open', 'no-scroll');

    // Clear focus from the old login button/input so the page looks restored.
    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } catch {}

    // Remove only temporary inline overflow locks if any old modal code added them.
    try {
      if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
      if (document.documentElement.style.overflow === 'hidden') document.documentElement.style.overflow = '';
    } catch {}
  }

  // The original V81 behavior opens the dashboard through openPortalInNewTab.
  // We keep that behavior, but close the login popup on the original page after it fires.
  const oldOpenPortalInNewTabV86 = typeof openPortalInNewTab === 'function' ? openPortalInNewTab : null;
  if (oldOpenPortalInNewTabV86 && !window.__PHX_V86_OPEN_PORTAL_WRAPPED__) {
    window.__PHX_V86_OPEN_PORTAL_WRAPPED__ = true;
    openPortalInNewTab = function(){
      const result = oldOpenPortalInNewTabV86.apply(this, arguments);
      setTimeout(closeLoginModalV86, 60);
      setTimeout(closeLoginModalV86, 250);
      return result;
    };
  }

  // Backup: if a portal tab was opened by an older direct call, close login after a successful-looking submit.
  // This does not stop login failure messages; it only closes if a dashboard session/role appears.
  document.addEventListener('submit', function(event){
    const form = event.target.closest?.('#portalLoginForm');
    if (!form) return;
    setTimeout(() => {
      let hasPortalSession = false;
      try {
        hasPortalSession = Boolean(
          localStorage.getItem('phoenix_portal_role') ||
          localStorage.getItem('phoenix_portal_session_v83') ||
          localStorage.getItem('phoenix_portal_session_meta') ||
          localStorage.getItem('phoenixPortalSession')
        );
      } catch {}
      if (hasPortalSession) closeLoginModalV86();
    }, 700);
  }, false);

  window.PHX_CLOSE_LOGIN_MODAL_V86 = closeLoginModalV86;
})();




/* ======================================================================
   V87 PORTAL NEW-TAB DIRECT DASHBOARD FIX
   Keeps V81/V85 login flow:
   - Successful login opens a new portal tab.
   Fix:
   - The new #portal tab now receives role/email through the URL + localStorage bridge.
   - It opens the correct dashboard directly instead of showing Login again.
   ====================================================================== */
(function initPHXV87PortalDirectDashboard(){
  if (window.__PHX_V87_PORTAL_DIRECT__) return;
  window.__PHX_V87_PORTAL_DIRECT__ = true;

  const BRIDGE_KEY = 'phoenix_portal_bridge_v87';

  function normalizeRoleV87(role){
    const raw = String(role || '').trim();
    const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (lower.includes('customer_service')) return 'Customer Service';
    if (lower === 'admin') return 'Admin';
    if (lower === 'manager') return 'Manager';
    if (lower === 'chef') return 'Chef';
    if (lower === 'customer' || lower === 'member') return 'Member';
    return raw || 'Member';
  }

  function getSelectedLoginRoleV87(){
    const active = document.querySelector('#portalLoginForm .login-tabs .active');
    return normalizeRoleV87(active?.textContent?.replace(/\/.*/,'').trim() || currentDashboardRole || 'Member');
  }

  function getLoginEmailV87(){
    return document.querySelector('#portalLoginForm input[type="email"]')?.value?.trim() || '';
  }

  function saveBridgeV87(role, email){
    const payload = {
      role: normalizeRoleV87(role),
      email: String(email || ''),
      createdAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000
    };
    try {
      localStorage.setItem(BRIDGE_KEY, JSON.stringify(payload));
      localStorage.setItem('phoenix_portal_role', payload.role);
      localStorage.setItem('phoenix_portal_email', payload.email);
    } catch {}
    return payload;
  }

  function readBridgeV87(){
    try {
      const item = localStorage.getItem(BRIDGE_KEY);
      if (!item) return null;
      const parsed = JSON.parse(item);
      if (parsed.expiresAt && Number(parsed.expiresAt) < Date.now()) return null;
      return {
        role: normalizeRoleV87(parsed.role),
        email: parsed.email || ''
      };
    } catch {
      return null;
    }
  }

  function parsePortalHashV87(){
    const hash = window.location.hash || '';
    if (!hash.startsWith('#portal')) return null;
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return null;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    return {
      role: normalizeRoleV87(params.get('role') || ''),
      email: params.get('email') || ''
    };
  }

  function closeLoginV87(){
    const login = document.getElementById('loginModal');
    try { if (login?.open) login.close(); } catch {}
    document.body.classList.remove('modal-open', 'dialog-open', 'no-scroll');
    document.documentElement.classList.remove('modal-open', 'dialog-open', 'no-scroll');
    try { document.activeElement?.blur?.(); } catch {}
  }

  function openDashboardDirectV87(role, email){
    const clean = normalizeRoleV87(role);
    if (!clean) return false;

    saveBridgeV87(clean, email || '');
    currentDashboardRole = clean;
    closeLoginV87();

    try {
      if (typeof renderDashboard === 'function') renderDashboard(clean);
    } catch (error) {
      console.warn('V87 renderDashboard failed:', error);
    }

    try {
      const dashboard = document.getElementById('dashboardModal');
      if (dashboard && typeof dashboard.showModal === 'function' && !dashboard.open) dashboard.showModal();
    } catch (error) {
      console.warn('V87 dashboard showModal failed:', error);
    }

    try { window.PHX_APPLY_ROLE_VISIBILITY_V85?.(clean); } catch {}
    setTimeout(() => { try { window.PHX_APPLY_ROLE_VISIBILITY_V85?.(clean); } catch {} }, 120);
    setTimeout(() => { try { window.PHX_APPLY_ROLE_VISIBILITY_V85?.(clean); } catch {} }, 400);

    return true;
  }

  // Save selected role/email before old login handler opens the portal tab.
  window.addEventListener('submit', function(event){
    const form = event.target?.closest?.('#portalLoginForm');
    if (!form) return;
    saveBridgeV87(getSelectedLoginRoleV87(), getLoginEmailV87());
  }, true);

  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const btn = event.target.closest?.('#portalLoginForm button.gold-btn');
    if (!btn) return;
    saveBridgeV87(getSelectedLoginRoleV87(), getLoginEmailV87());
  }, true);

  // Keep the old new-tab behavior, but pass role/email through hash params.
  const previousOpenPortalV87 = typeof openPortalInNewTab === 'function' ? openPortalInNewTab : null;
  openPortalInNewTab = function(){
    const role = getSelectedLoginRoleV87();
    const email = getLoginEmailV87();
    saveBridgeV87(role, email);

    const url = new URL(window.location.href);
    url.hash = `#portal?role=${encodeURIComponent(role)}&email=${encodeURIComponent(email)}`;

    const opened = window.open(url.toString(), '_blank', 'noopener');
    setTimeout(closeLoginV87, 80);
    setTimeout(closeLoginV87, 280);

    // If popup blocked, fall back to the old function.
    if (!opened && previousOpenPortalV87) {
      const result = previousOpenPortalV87.apply(this, arguments);
      setTimeout(closeLoginV87, 80);
      return result;
    }
    return opened;
  };

  function bootstrapPortalV87(){
    const hashData = parsePortalHashV87();
    const bridge = readBridgeV87();
    const role = hashData?.role || bridge?.role;
    const email = hashData?.email || bridge?.email || '';

    if ((window.location.hash || '').startsWith('#portal') && role) {
      openDashboardDirectV87(role, email);
      return true;
    }
    return false;
  }

  // Run after older #portal bootstrap, so if older code shows login, we close it and open dashboard.
  function scheduleBootstrapV87(){
    bootstrapPortalV87();
    setTimeout(bootstrapPortalV87, 80);
    setTimeout(bootstrapPortalV87, 250);
    setTimeout(bootstrapPortalV87, 700);
    setTimeout(bootstrapPortalV87, 1300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleBootstrapV87);
  } else {
    scheduleBootstrapV87();
  }
})();



/* ======================================================================
   V95 SINGLE-ENTRY PORTAL STABILITY FIX
   Purpose:
   - Keep index.html as the only HTML entry.
   - Fix #portal?role=... not being recognized as portal mode.
   - Stop Admin login from opening a Member dashboard because of the old
     V87 login-tab bridge.
   - Remove the separate Member/Customer Management shortcut from the
     account dropdown; members only need one dashboard.
   - Keep the public homepage untouched after login opens the portal tab.
   ====================================================================== */
(function initPHXV95SingleEntryPortalFix(){
  if (window.__PHX_V95_SINGLE_ENTRY_PORTAL_FIX__) return;
  window.__PHX_V95_SINGLE_ENTRY_PORTAL_FIX__ = true;

  const META_KEY = 'phoenixPortalSessionMetaV1';
  const BRIDGE_KEY = 'phoenix_portal_bridge_v87';

  function normalizeRoleV95(role){
    const raw = String(role || '').trim();
    const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (lower.includes('customer_service')) return 'Customer Service';
    if (lower === 'admin') return 'Admin';
    if (lower === 'manager') return 'Manager';
    if (lower === 'chef') return 'Chef';
    if (lower === 'member' || lower === 'customer') return 'Member';
    return raw || 'Member';
  }

  function isPortalHashV95(){
    return String(window.location.hash || '').startsWith('#portal') || new URLSearchParams(window.location.search).get('portal') === '1';
  }

  // Replace the older exact-match route checker. Older code checked only
  // hash === '#portal', so '#portal?role=Admin' opened the dashboard without
  // portal-mode CSS and exposed the homepage underneath.
  try {
    isPortalRoute = function(){ return isPortalHashV95(); };
    window.isPortalRoute = isPortalRoute;
  } catch {}

  function readJson(key){
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }

  function readMeta(){
    const meta = readJson(META_KEY);
    if (!meta) return null;
    const age = Date.now() - Number(meta.loginAt || 0);
    if (meta.loginAt && age > 8 * 60 * 60 * 1000) return null;
    return meta;
  }

  function readBridge(){
    const bridge = readJson(BRIDGE_KEY);
    if (!bridge) return null;
    if (bridge.expiresAt && Number(bridge.expiresAt) < Date.now()) return null;
    return bridge;
  }

  function readHashRole(){
    const hash = String(window.location.hash || '');
    if (!hash.startsWith('#portal')) return null;
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return null;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const role = params.get('role');
    const email = params.get('email');
    if (!role && !email) return null;
    return { role, email };
  }

  function currentSessionRole(){
    const meta = readMeta();
    if (meta?.role) return { role: normalizeRoleV95(meta.role), email: meta.email || '' };
    const hash = readHashRole();
    if (hash?.role) return { role: normalizeRoleV95(hash.role), email: hash.email || '' };
    const bridge = readBridge();
    if (bridge?.role) return { role: normalizeRoleV95(bridge.role), email: bridge.email || '' };
    return null;
  }

  function setMeta(role, email){
    const clean = normalizeRoleV95(role);
    try {
      localStorage.setItem(META_KEY, JSON.stringify({ role: clean, email: email || '', loginAt: Date.now() }));
      localStorage.setItem(BRIDGE_KEY, JSON.stringify({ role: clean, email: email || '', createdAt: Date.now(), expiresAt: Date.now() + 8 * 60 * 60 * 1000 }));
      localStorage.setItem('phoenix_portal_role', clean);
      localStorage.setItem('phoenix_portal_email', email || '');
    } catch {}
    try { updateAccountMenuState?.(); } catch {}
    return clean;
  }

  function cleanIndexForPortal(){
    try {
      if (typeof cleanIndexUrl === 'function') return cleanIndexUrl();
    } catch {}
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    if (!/index\.html$/i.test(url.pathname || '')) {
      url.pathname = (url.pathname || '/').replace(/[^/]*$/, 'index.html');
    }
    return url.toString();
  }

  function selectedLoginRole(){
    const active = document.querySelector('#portalLoginForm .login-tabs .active');
    return normalizeRoleV95(active?.textContent?.replace(/\/.*$/,'').trim() || 'Member');
  }

  function selectedLoginEmail(){
    return document.querySelector('#portalLoginForm input[type="email"]')?.value?.trim() || '';
  }

  // Override V87's selected-tab based opener. After real login, the profile
  // role stored in META_KEY wins. This fixes Admin accounts opening Member Dashboard.
  openPortalInNewTab = function(tab = ''){
    if (tab && tab === 'customers') tab = 'orders';
    if (tab) { try { localStorage.setItem('phoenixPortalPreferredTabV1', tab); } catch {} }

    const existing = currentSessionRole();
    const role = existing?.role || selectedLoginRole();
    const email = existing?.email || selectedLoginEmail();
    const clean = setMeta(role, email);

    const url = new URL(cleanIndexForPortal());
    url.hash = `#portal?role=${encodeURIComponent(clean)}&email=${encodeURIComponent(email || '')}`;
    const opened = window.open(url.toString(), '_blank');
    try { document.getElementById('loginModal')?.close?.(); } catch {}
    if (!opened) window.location.href = url.toString();
    return opened;
  };

  function enterPortalMode(){
    if (!isPortalHashV95()) return false;
    document.body.classList.add('portal-mode');
    return true;
  }

  function showDashboardForCurrentRole(){
    if (!enterPortalMode()) return false;
    const session = currentSessionRole();
    if (!session?.role) {
      try {
        const login = document.getElementById('loginModal');
        if (login && typeof login.showModal === 'function' && !login.open) login.showModal();
      } catch {}
      return false;
    }

    const clean = setMeta(session.role, session.email || '');
    try { currentDashboardRole = clean; } catch {}
    try { renderDashboard?.(clean); } catch (error) { console.warn('V95 renderDashboard failed:', error); }
    try { window.PHX_APPLY_ROLE_VISIBILITY_V85?.(clean); } catch {}
    try {
      const dashboard = document.getElementById('dashboardModal');
      const login = document.getElementById('loginModal');
      if (login?.open) login.close();
      if (dashboard && typeof dashboard.showModal === 'function' && !dashboard.open) dashboard.showModal();
    } catch (error) { console.warn('V95 dashboard open failed:', error); }
    return true;
  }

  // On portal tabs, Supabase profile is the source of truth when available.
  async function upgradeRoleFromSupabase(){
    if (!isPortalHashV95()) return;
    try {
      const client = initSupabaseClient?.();
      if (!client) return;
      const { data } = await client.auth.getSession();
      const user = data?.session?.user;
      if (!user) return;
      const { data: profile } = await client.from('profiles').select('*').eq('id', user.id).single();
      if (!profile?.role) return;
      const clean = setMeta(profile.role, user.email || profile.email || '');
      try { supabaseSession = data.session; supabaseProfile = profile; } catch {}
      try { await loadDashboardDataFromSupabase?.(); } catch {}
      try { renderDashboard?.(clean); } catch {}
      try { window.PHX_APPLY_ROLE_VISIBILITY_V85?.(clean); } catch {}
    } catch (error) {
      console.warn('V95 Supabase role sync skipped:', error);
    }
  }

  function schedulePortalSync(){
    if (!isPortalHashV95()) return;
    showDashboardForCurrentRole();
    setTimeout(showDashboardForCurrentRole, 80);
    setTimeout(showDashboardForCurrentRole, 250);
    setTimeout(showDashboardForCurrentRole, 700);
    setTimeout(upgradeRoleFromSupabase, 350);
    setTimeout(upgradeRoleFromSupabase, 1200);
  }

  // Account dropdown cleanup: no separate customer-management shortcut.
  document.querySelector('[data-account-action="customers"]')?.remove();
  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const action = event.target.closest?.('[data-account-action]')?.dataset.accountAction;
    if (action !== 'customers') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openPortalInNewTab('orders');
    return false;
  }, true);

  window.addEventListener('hashchange', schedulePortalSync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedulePortalSync);
  else schedulePortalSync();
})();


/* ======================================================================
   V96 MEMBER PORTAL CLEANUP
   - Member dashboard hides route planner/map completely.
   - Member top action becomes Profile instead of Build Route Plan.
   - Member order cards show only customer-facing booking information.
   - Profile modal supports personal info, payment preference, balance view,
     and password update without exposing staff dispatch tools.
   ====================================================================== */
(function initPHXV96MemberPortalCleanup(){
  if (window.__PHX_V96_MEMBER_PORTAL_CLEANUP__) return;
  window.__PHX_V96_MEMBER_PORTAL_CLEANUP__ = true;

  const PROFILE_KEY = 'phoenix_member_profile_v96';

  function cleanRoleV96(role){
    const raw = String(role || currentDashboardRole || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (raw.includes('admin')) return 'Admin';
    if (raw.includes('manager')) return 'Manager';
    if (raw.includes('customer_service')) return 'Customer Service';
    if (raw.includes('chef')) return 'Chef';
    if (raw.includes('customer') || raw.includes('member')) return 'Member';
    return String(role || currentDashboardRole || 'Member');
  }

  function isMemberV96(role = currentDashboardRole){
    return cleanRoleV96(role) === 'Member';
  }

  function memberEmailV96(){
    try { return (supabaseSession?.user?.email || supabaseProfile?.email || getPortalSessionMeta?.()?.email || localStorage.getItem('phoenix_portal_email') || '').trim().toLowerCase(); } catch { return ''; }
  }

  function loadProfileV96(){
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {}; } catch { return {}; }
  }

  function saveProfileV96(profile){
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({...loadProfileV96(), ...profile, updatedAt: new Date().toISOString()})); } catch {}
  }

  function contactSettingsV96(){
    try { return getContactSettingsV60?.() || {}; } catch { return {}; }
  }

  function formatPhoneV96(value){
    try { return formatPhoneV60?.(value) || value || '347-471-9190'; } catch { return value || '347-471-9190'; }
  }

  function assignedChefInfoV96(order = {}){
    const assignedName = order.assignedChef && order.assignedChef !== 'Unassigned' ? order.assignedChef : '';
    const chef = (Array.isArray(CHEFS) ? CHEFS : []).find(c => c.id === order.assignedChefId || c.name === assignedName);
    return {
      name: assignedName || 'Pending chef assignment',
      phone: chef?.phone || ''
    };
  }

  function customerProgressHtmlV96(order = {}){
    try {
      return `<div class="lookup-steps member-order-progress-v96">${orderProgressSteps(order).map(step => `<span class="lookup-step ${step.done ? 'done' : ''}">${step.done ? '✓' : '○'} ${escapeHtml(step.label)}</span>`).join('')}</div>`;
    } catch { return ''; }
  }

  function memberFacingOrderCardV96(order = {}){
    const statusKey = String(order.status || '').toLowerCase();
    const accepted = statusKey.includes('accepted') || statusKey.includes('confirmed') || statusKey.includes('prep') || statusKey.includes('completed');
    const m = calculateOrderMoney(order);
    const settings = contactSettingsV96();
    const supportPhone = settings.textPhone || settings.phone || '3474719190';
    const supportEmail = settings.supportEmail || settings.bookingEmail || 'phoenix4719190@gmail.com';
    const chef = assignedChefInfoV96(order);
    const statusText = typeof humanOrderStatus === 'function' ? humanOrderStatus(order.status) : (order.status || 'Pending manager review');
    const chefLine = chef.phone ? `${chef.name} · ${formatPhoneV96(chef.phone)}` : chef.name;
    const payment = order.paymentStatus || order.paymentPreference || 'Not paid yet / waiting for manager confirmation';
    const arrival = accepted ? 'Final arrival window is confirmed by Phoenix staff.' : 'Final arrival window will be confirmed after manager review.';
    return `<article class="order-card member-order-card-v96">
      <header>
        <div><strong>${escapeHtml(order.id || 'Phoenix order')}</strong><p>${escapeHtml(order.eventDate || 'Date pending')} · ${escapeHtml(order.eventTime || 'Time pending')}</p></div>
        <span class="tag ${accepted ? 'accepted' : ''}">${escapeHtml(statusText)}</span>
      </header>
      ${customerProgressHtmlV96(order)}
      <div class="member-order-grid-v96">
        <p><b>Event</b><br>${escapeHtml(order.eventDate || '-')} · ${escapeHtml(order.eventTime || '-')}<br>${escapeHtml(order.address || 'Address pending')}</p>
        <p><b>Package / guests</b><br>${escapeHtml(order.package || 'Classic')} · ${escapeHtml(order.totalGuests || '')} actual guests<br>${formatGuestNumber(m.billableGuests)} billable guests · ${escapeHtml(proteinSummary(m.proteinSelections))}</p>
        <p><b>Estimated total</b><br>${money(m.guestTotalBeforeDeposit)}<br><small>Travel fee: ${money(m.travelFee)} · Payment: ${escapeHtml(payment)}</small></p>
        <p><b>Assigned chef</b><br>${escapeHtml(chefLine)}<br><small>${escapeHtml(arrival)}</small></p>
        <p><b>Customer service</b><br>${escapeHtml(formatPhoneV96(supportPhone))}<br><small>${escapeHtml(supportEmail)}</small></p>
        <p><b>Policy</b><br>${escapeHtml(cancellationMessage(order))}</p>
      </div>
      <div class="order-actions">
        <button type="button" data-print-guest="${escapeHtml(order.id || '')}">Print invoice</button>
        <button type="button" data-download-pdf="${escapeHtml(order.id || '')}">Download PDF</button>
        <button type="button" data-customer-reschedule="${escapeHtml(order.id || '')}">Request reschedule</button>
        <button type="button" data-customer-cancel="${escapeHtml(order.id || '')}">Request cancellation</button>
        ${accepted ? `<button type="button" data-open-share-reward>Social coupon</button>` : ``}
        <a href="sms:${encodeURIComponent(String(supportPhone).replace(/\D/g,''))}">Text support</a>
      </div>
    </article>`;
  }

  // Override member order cards only. Staff cards remain untouched.
  try { customerOrderCard = memberFacingOrderCardV96; } catch {}

  function memberOrdersV96(orders = []){
    const email = memberEmailV96();
    if (!email) return orders;
    const matching = orders.filter(o => String(o.email || '').trim().toLowerCase() === email);
    return matching.length ? matching : orders;
  }

  function ensureProfileModalV96(){
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    if (!modal || !form || form.dataset.v96ProfileReady === 'true') return;
    form.dataset.v96ProfileReady = 'true';
    form.innerHTML = `
      <button type="button" class="modal-close" data-close-modal aria-label="Close">×</button>
      <p class="eyebrow">My Profile</p>
      <h2>Profile & Member Wallet</h2>
      <p class="modal-help" id="profileInfoText">Update your contact information, preferred payment method, member balance view, and password.</p>
      <div class="form-grid two profile-grid-v96">
        <label>Full name<input name="fullName" placeholder="Full name"></label>
        <label>Phone<input name="phone" placeholder="Mobile number"></label>
        <label>Email / login<input type="email" name="email" placeholder="Email" readonly></label>
        <label>Preferred payment method<select name="paymentMethod"><option value="Deposit transfer / Zelle">Deposit transfer / Zelle</option><option value="Full payment transfer / Zelle">Full payment transfer / Zelle</option><option value="Onsite cash / Zelle">Onsite cash / Zelle</option><option value="Card payment when available">Card payment when available</option></select></label>
        <label class="wide">Address<input name="address" placeholder="Home / event address"></label>
      </div>
      <div class="member-wallet-v96">
        <div><span>Member balance</span><strong id="memberBalanceTextV96">$0.00</strong><small>Credits are applied after staff review.</small></div>
        <div><span>Coupons / rewards</span><strong id="memberRewardTextV96">Pending review</strong><small>Birthday and social-share rewards require approval.</small></div>
        <div><span>Payment status</span><strong id="memberPaymentStatusTextV96">No saved card</strong><small>Card vault is not enabled yet. Use Zelle/cash until payment gateway is connected.</small></div>
      </div>
      <div class="password-box-v96">
        <h3>Change password</h3>
        <p class="small-muted">Leave password fields empty if you only want to save profile information.</p>
        <label>Current password<input type="password" name="currentPassword" placeholder="Current password"></label>
        <label>New password<input type="password" name="newPassword" placeholder="New password" minlength="6"></label>
        <label>Confirm new password<input type="password" name="confirmNewPassword" placeholder="Confirm new password" minlength="6"></label>
      </div>
      <div class="modal-actions"><button class="gold-btn" type="submit">Save Profile</button><button class="outline-btn" type="button" id="profileForgotPasswordBtn">Forgot Password</button></div>`;

    form.addEventListener('submit', async function(event){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const fd = new FormData(form);
      const next = String(fd.get('newPassword') || '');
      const confirm = String(fd.get('confirmNewPassword') || '');
      if (next || confirm) {
        if (next.length < 6) { alert('New password must be at least 6 characters.'); return; }
        if (next !== confirm) { alert('New password and confirmation do not match.'); return; }
      }
      const profile = {
        fullName: String(fd.get('fullName') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        address: String(fd.get('address') || '').trim(),
        paymentMethod: String(fd.get('paymentMethod') || '').trim()
      };
      saveProfileV96(profile);
      const client = initSupabaseClient?.();
      try {
        if (client && supabaseSession?.user) {
          const updatePayload = { data: { full_name: profile.fullName, phone: profile.phone, address: profile.address, preferred_payment_method: profile.paymentMethod } };
          if (next) updatePayload.password = next;
          const { error: authError } = await client.auth.updateUser(updatePayload);
          if (authError) throw authError;
          // Keep this conservative: common columns only. Extra wallet fields can be added later by migration.
          await client.from('profiles').update({ full_name: profile.fullName || null, phone: profile.phone || null }).eq('id', supabaseSession.user.id);
        }
      } catch (error) {
        console.warn('Profile saved locally; Supabase profile update skipped:', error);
        alert('Profile saved on this browser. Supabase profile update needs matching profile columns/policies before launch.');
        modal.close?.();
        return;
      }
      modal.close?.();
      alert(next ? 'Profile and password updated.' : 'Profile updated.');
    }, true);
  }

  function fillProfileModalV96(){
    ensureProfileModalV96();
    const form = document.getElementById('changePasswordForm');
    if (!form) return;
    const local = loadProfileV96();
    const email = memberEmailV96() || local.email || '';
    const fullName = local.fullName || supabaseProfile?.full_name || supabaseSession?.user?.user_metadata?.full_name || '';
    const phone = local.phone || supabaseProfile?.phone || supabaseSession?.user?.user_metadata?.phone || '';
    const address = local.address || supabaseSession?.user?.user_metadata?.address || '';
    const paymentMethod = local.paymentMethod || supabaseSession?.user?.user_metadata?.preferred_payment_method || 'Deposit transfer / Zelle';
    const set = (name, value) => { const el = form.elements[name]; if (el) el.value = value || ''; };
    set('fullName', fullName);
    set('phone', phone);
    set('email', email);
    set('address', address);
    set('paymentMethod', paymentMethod);
    const balance = document.getElementById('memberBalanceTextV96');
    if (balance) balance.textContent = local.balance ? money(Number(local.balance) || 0) : '$0.00';
    const reward = document.getElementById('memberRewardTextV96');
    if (reward) reward.textContent = local.reward || 'Pending review';
    const status = document.getElementById('memberPaymentStatusTextV96');
    if (status) status.textContent = paymentMethod || 'No saved card';
    const info = document.getElementById('profileInfoText');
    if (info) info.textContent = `Email: ${email || '-'} · Role: ${cleanRoleV96(currentDashboardRole || 'Member')}`;
  }

  function openProfileV96(){
    fillProfileModalV96();
    const modal = document.getElementById('changePasswordModal');
    if (modal && typeof modal.showModal === 'function' && !modal.open) modal.showModal();
  }

  function applyMemberDashboardV96(role = currentDashboardRole){
    const member = isMemberV96(role);
    const autoBtn = document.getElementById('autoDispatchBtn');
    if (autoBtn) {
      autoBtn.textContent = member ? 'Profile' : 'Build Route Plan';
      autoBtn.dataset.v96Action = member ? 'profile' : 'route';
      autoBtn.hidden = false;
      autoBtn.style.display = '';
    }
    const routePanel = document.getElementById('routePlannerPanel');
    const guide = document.getElementById('routePlannerGuideV70');
    if (member) {
      if (routePanel) { routePanel.hidden = true; routePanel.style.display = 'none'; routePanel.setAttribute('aria-hidden','true'); }
      if (guide) { guide.hidden = true; guide.style.display = 'none'; guide.setAttribute('aria-hidden','true'); }
      if (primaryDashboardHeading) primaryDashboardHeading.textContent = 'My bookings';
      const orderPage = document.querySelector('[data-dashboard-page="orders"] .section-row .small-muted');
      if (orderPage) orderPage.textContent = 'Review your booking details, order status, assigned chef, customer service contact, invoice, and reschedule/cancellation options.';
      const orders = memberOrdersV96(getDashboardOrders());
      if (orderList) orderList.innerHTML = orders.length ? orders.map(memberFacingOrderCardV96).join('') : '<div class="empty-state">No bookings are linked to this member account yet. Use your booking email or ask Phoenix Hibachi support to link your order.</div>';
    } else {
      if (routePanel) { routePanel.hidden = false; routePanel.style.display = ''; routePanel.removeAttribute('aria-hidden'); }
      if (guide) { guide.hidden = false; guide.style.display = ''; guide.removeAttribute('aria-hidden'); }
    }
  }

  const previousRenderDashboardV96 = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (previousRenderDashboardV96) {
    renderDashboard = function(role = currentDashboardRole || 'Member'){
      const clean = cleanRoleV96(role);
      const out = previousRenderDashboardV96(clean);
      setTimeout(() => applyMemberDashboardV96(clean), 0);
      setTimeout(() => applyMemberDashboardV96(clean), 120);
      setTimeout(() => applyMemberDashboardV96(clean), 350);
      return out;
    };
  }

  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const autoBtn = event.target.closest?.('#autoDispatchBtn');
    if (autoBtn && isMemberV96()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openProfileV96();
      return false;
    }
    const action = event.target.closest?.('[data-account-action]')?.dataset.accountAction;
    if (action === 'profile') {
      setTimeout(openProfileV96, 0);
    }
  }, true);

  // Keep forgot-password button working after the profile form is rebuilt.
  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    if (event.target.closest?.('#profileForgotPasswordBtn')) {
      event.preventDefault();
      event.stopPropagation();
      try { document.getElementById('changePasswordModal')?.close?.(); } catch {}
      try { document.getElementById('forgotPasswordModal')?.showModal?.(); } catch {}
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { ensureProfileModalV96(); applyMemberDashboardV96(currentDashboardRole); });
  } else {
    ensureProfileModalV96();
    setTimeout(() => applyMemberDashboardV96(currentDashboardRole), 0);
  }
})();


/* ======================================================================
   V97 CHEF PROFILE + CHEF ORDER HISTORY
   - Chef portal gets a Profile action like Member.
   - Chef can update own contact/payout info and password.
   - Chef dashboard gets personal order history with day/week/month filters
     and estimated earnings before tips.
   - Admin/Manager route planner stays unchanged.
   ====================================================================== */
(function initPHXV97ChefProfileAndHistory(){
  if (window.__PHX_V97_CHEF_PROFILE_HISTORY__) return;
  window.__PHX_V97_CHEF_PROFILE_HISTORY__ = true;

  const STYLE_ID = 'phoenix-v97-chef-profile-history-style';
  const CHEF_PROFILE_KEY_PREFIX = 'phoenix_chef_profile_v97_';

  function injectStyleV97(){
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .chef-profile-summary-v97,
      .chef-history-panel-v97{
        border:1px solid rgba(255,199,89,.28);
        background:rgba(18,12,7,.82);
        border-radius:22px;
        padding:18px;
        margin:18px 0;
        box-shadow:0 18px 40px rgba(0,0,0,.18);
      }
      .chef-profile-summary-v97{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}
      .chef-profile-summary-v97 div,
      .chef-history-stat-v97{
        border:1px solid rgba(255,199,89,.18);
        border-radius:16px;
        padding:14px;
        background:rgba(255,255,255,.025);
      }
      .chef-profile-summary-v97 span,
      .chef-history-stat-v97 span{display:block;color:rgba(255,255,255,.68);font-size:.86rem;margin-bottom:6px;}
      .chef-profile-summary-v97 strong,
      .chef-history-stat-v97 strong{display:block;color:#ffd36b;font-size:1.35rem;line-height:1.2;}
      .chef-history-head-v97{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px;}
      .chef-history-controls-v97{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;justify-content:flex-end;}
      .chef-history-controls-v97 label{min-width:140px;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.72);font-weight:800;}
      .chef-history-controls-v97 select,
      .chef-history-controls-v97 input{
        width:100%;margin-top:6px;border-radius:999px;border:1px solid rgba(255,199,89,.35);
        background:#080604;color:#fff;padding:11px 13px;font-weight:800;
      }
      .chef-history-stats-v97{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0;}
      .chef-history-list-v97{display:grid;gap:12px;}
      .chef-history-card-v97{border:1px solid rgba(255,199,89,.24);border-radius:18px;padding:16px;background:rgba(0,0,0,.28);}
      .chef-history-card-v97 header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px;}
      .chef-history-card-v97 header strong{color:#ffd36b;font-size:1.02rem;}
      .chef-history-card-v97 p{margin:8px 0;color:rgba(255,255,255,.78);line-height:1.55;}
      .chef-history-money-v97{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px;}
      .chef-history-money-v97 div{border-radius:14px;background:rgba(255,199,89,.08);padding:10px;}
      .chef-history-money-v97 span{display:block;color:rgba(255,255,255,.64);font-size:.78rem;margin-bottom:4px;}
      .chef-history-money-v97 b{color:#ffd36b;}
      .chef-profile-modal-v97 .profile-grid-v97{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
      .chef-profile-modal-v97 .wide{grid-column:1/-1;}
      .chef-profile-note-v97{border:1px solid rgba(255,199,89,.22);background:rgba(255,199,89,.08);border-radius:16px;padding:12px;margin:12px 0;color:rgba(255,255,255,.78);line-height:1.45;}
      .chef-history-warning-v97{border:1px dashed rgba(255,199,89,.45);border-radius:16px;padding:12px;margin:12px 0;color:rgba(255,255,255,.72);}
      @media (max-width: 820px){
        .chef-profile-summary-v97,.chef-history-stats-v97,.chef-history-money-v97{grid-template-columns:1fr;}
        .chef-history-head-v97{display:block;}
        .chef-history-controls-v97{justify-content:stretch;margin-top:12px;}
        .chef-history-controls-v97 label{width:100%;}
        .chef-profile-modal-v97 .profile-grid-v97{grid-template-columns:1fr;}
      }
    `;
    document.head.appendChild(style);
  }

  function cleanRoleV97(role = currentDashboardRole){
    const raw = String(role || '').trim();
    const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (lower.includes('customer_service')) return 'Customer Service';
    if (lower === 'admin') return 'Admin';
    if (lower === 'manager') return 'Manager';
    if (lower === 'chef') return 'Chef';
    if (lower === 'customer' || lower === 'member') return 'Member';
    return raw || 'Member';
  }
  function isChefV97(role = currentDashboardRole){ return cleanRoleV97(role) === 'Chef'; }
  function safeTextV97(value, fallback = '-') { return String(value || fallback); }
  function emailV97(){
    try {
      return String(
        supabaseSession?.user?.email ||
        supabaseProfile?.email ||
        getPortalSessionMeta?.()?.email ||
        localStorage.getItem('phoenix_portal_email') ||
        ''
      ).trim().toLowerCase();
    } catch { return ''; }
  }
  function chefProfileKeyV97(){ return CHEF_PROFILE_KEY_PREFIX + (emailV97() || 'local'); }
  function loadChefProfileV97(){
    try { return JSON.parse(localStorage.getItem(chefProfileKeyV97()) || '{}') || {}; } catch { return {}; }
  }
  function saveChefProfileV97(profile){
    try { localStorage.setItem(chefProfileKeyV97(), JSON.stringify({...loadChefProfileV97(), ...profile, updatedAt:new Date().toISOString()})); } catch {}
  }
  function fullNameV97(){
    const local = loadChefProfileV97();
    return String(local.fullName || supabaseProfile?.full_name || supabaseSession?.user?.user_metadata?.full_name || '').trim();
  }
  function normalizedV97(value){ return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function chefIdentifiersV97(){
    const local = loadChefProfileV97();
    const ids = new Set();
    [local.chefId, local.fullName, local.displayName, supabaseProfile?.chef_id, supabaseProfile?.full_name, supabaseSession?.user?.user_metadata?.chef_id, supabaseSession?.user?.user_metadata?.full_name].forEach(v => {
      const x = normalizedV97(v);
      if (x) ids.add(x);
    });
    const email = emailV97();
    if (email) ids.add(normalizedV97(email));
    return [...ids];
  }
  function assignedOrderValuesV97(order){
    return [order.assignedChefId, order.assignedChef, order.chefId, order.chef_id, order.chefEmail, order.chef_email].map(normalizedV97).filter(Boolean);
  }
  function assignedOrdersOnlyV97(orders){
    return (orders || []).filter(o => String(o.assignedChef || o.assignedChefId || '').trim() && String(o.assignedChef || '').toLowerCase() !== 'unassigned');
  }
  function myChefOrdersV97(orders){
    const assigned = assignedOrdersOnlyV97(orders || []);
    const ids = chefIdentifiersV97();
    if (!ids.length) return {orders:assigned, linked:false};
    const matched = assigned.filter(order => {
      const values = assignedOrderValuesV97(order);
      return values.some(v => ids.some(id => v === id || v.includes(id) || id.includes(v)));
    });
    if (matched.length) return {orders:matched, linked:true};
    return {orders:assigned, linked:false};
  }
  function orderDateV97(order){
    if (typeof parseOrderDateTime === 'function') {
      const dt = parseOrderDateTime(order);
      if (dt && !Number.isNaN(dt.getTime())) return dt;
    }
    const raw = order?.eventDate || order?.date || order?.createdAt || order?.created_at || '';
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  function dateKeyV97(date){ return date ? date.toISOString().slice(0,10) : ''; }
  function startOfWeekV97(date){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    d.setHours(0,0,0,0);
    return d;
  }
  function endOfWeekV97(date){
    const d = startOfWeekV97(date);
    d.setDate(d.getDate() + 7);
    return d;
  }
  function weekValueV97(date = new Date()){
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
  }
  function weekRangeFromValueV97(value){
    if (!/^\d{4}-W\d{2}$/.test(String(value || ''))) {
      const now = new Date();
      return {start:startOfWeekV97(now), end:endOfWeekV97(now)};
    }
    const [year, week] = String(value).split('-W').map(Number);
    const jan4 = new Date(year, 0, 4);
    const start = startOfWeekV97(jan4);
    start.setDate(start.getDate() + (week - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {start, end};
  }
  function moneyV97(value){
    try { return typeof money === 'function' ? money(value) : `$${Number(value || 0).toFixed(2)}`; } catch { return `$${Number(value || 0).toFixed(2)}`; }
  }
  function escapeV97(value){
    try { return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    catch { return String(value ?? ''); }
  }
  function orderPayoutV97(order){
    try {
      const m = calculateOrderMoney(order);
      return {
        guestPayout: Number(m.chefGuestPayout || 0),
        travelFee: Number(m.travelFee || 0),
        keepsBeforeTip: Number(m.chefKeepsBeforeTip || 0),
        returnToCompany: Number(m.chefReturnToCompany || 0)
      };
    } catch { return {guestPayout:0, travelFee:0, keepsBeforeTip:0, returnToCompany:0}; }
  }
  function filterChefOrdersV97(orders){
    const mode = document.getElementById('chefHistoryModeV97')?.value || 'week';
    const dateValue = document.getElementById('chefHistoryDateV97')?.value || dateKeyV97(new Date());
    const weekValue = document.getElementById('chefHistoryWeekV97')?.value || weekValueV97(new Date());
    const monthValue = document.getElementById('chefHistoryMonthV97')?.value || dateKeyV97(new Date()).slice(0,7);
    return (orders || []).filter(order => {
      const dt = orderDateV97(order);
      if (!dt) return false;
      if (mode === 'date') return dateKeyV97(dt) === dateValue;
      if (mode === 'month') return dateKeyV97(dt).slice(0,7) === monthValue;
      const {start, end} = weekRangeFromValueV97(weekValue);
      return dt >= start && dt < end;
    }).sort((a,b)=>(orderDateV97(a)?.getTime()||0)-(orderDateV97(b)?.getTime()||0));
  }
  function ensureChefProfileModalV97(){
    if (document.getElementById('chefProfileModalV97')) return document.getElementById('chefProfileModalV97');
    const modal = document.createElement('dialog');
    modal.id = 'chefProfileModalV97';
    modal.className = 'login-modal chef-profile-modal-v97';
    modal.innerHTML = `
      <form method="dialog" class="modal-card login-card" id="chefProfileFormV97">
        <button type="button" class="modal-close" data-chef-profile-close-v97 aria-label="Close">×</button>
        <p class="eyebrow">Chef Profile</p>
        <h2>Profile & Payout Settings</h2>
        <p class="modal-help">Update your chef contact information, service base, payout preference, and portal password.</p>
        <div class="profile-grid-v97">
          <label>Full name<input name="fullName" placeholder="Chef name"></label>
          <label>Phone<input name="phone" placeholder="Mobile number"></label>
          <label>Email / login<input type="email" name="email" placeholder="Email" readonly></label>
          <label>Display name used on orders<input name="displayName" placeholder="Example: Chef Allen"></label>
          <label class="wide">Base / service area<input name="baseArea" placeholder="Brooklyn, Staten Island, Long Island..."></label>
          <label>Preferred payout method<select name="payoutMethod"><option>Zelle</option><option>Cash</option><option>Check</option><option>ACH / bank transfer</option><option>Other</option></select></label>
          <label>Payout account note<input name="payoutNote" placeholder="Zelle phone/email or internal note"></label>
        </div>
        <div class="chef-profile-note-v97">上线前建议在 Supabase profiles 表里绑定 <b>chef_id</b>，这样系统才能 100% 只显示该师傅自己的订单。当前版本会优先按 chef_id / 显示名 / 邮箱匹配。</div>
        <div class="password-box-v96">
          <h3>Change password</h3>
          <p class="small-muted">Leave password fields empty if you only want to save profile information.</p>
          <label>Current password<input type="password" name="currentPassword" placeholder="Current password"></label>
          <label>New password<input type="password" name="newPassword" placeholder="New password" minlength="6"></label>
          <label>Confirm new password<input type="password" name="confirmNewPassword" placeholder="Confirm new password" minlength="6"></label>
        </div>
        <div class="modal-actions"><button class="gold-btn" type="submit">Save Profile</button><button class="outline-btn" type="button" id="chefForgotPasswordBtnV97">Forgot Password</button></div>
      </form>`;
    document.body.appendChild(modal);
    const form = modal.querySelector('#chefProfileFormV97');
    form?.addEventListener('submit', async function(event){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const fd = new FormData(form);
      const next = String(fd.get('newPassword') || '');
      const confirm = String(fd.get('confirmNewPassword') || '');
      if (next || confirm) {
        if (next.length < 6) { alert('New password must be at least 6 characters.'); return; }
        if (next !== confirm) { alert('New password and confirmation do not match.'); return; }
      }
      const profile = {
        fullName: String(fd.get('fullName') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        displayName: String(fd.get('displayName') || '').trim(),
        baseArea: String(fd.get('baseArea') || '').trim(),
        payoutMethod: String(fd.get('payoutMethod') || '').trim(),
        payoutNote: String(fd.get('payoutNote') || '').trim()
      };
      saveChefProfileV97(profile);
      const client = initSupabaseClient?.();
      try {
        if (client && supabaseSession?.user) {
          const updatePayload = { data: { full_name: profile.fullName, phone: profile.phone, chef_display_name: profile.displayName, chef_base_area: profile.baseArea, payout_method: profile.payoutMethod } };
          if (next) updatePayload.password = next;
          const { error: authError } = await client.auth.updateUser(updatePayload);
          if (authError) throw authError;
          await client.from('profiles').update({ full_name: profile.fullName || null, phone: profile.phone || null }).eq('id', supabaseSession.user.id);
        }
      } catch (error) {
        console.warn('Chef profile saved locally; Supabase profile update skipped:', error);
        alert('Chef profile saved on this browser. Supabase profile columns/RLS should be completed before launch.');
        modal.close?.();
        applyChefDashboardV97(currentDashboardRole);
        return;
      }
      modal.close?.();
      alert(next ? 'Chef profile and password updated.' : 'Chef profile updated.');
      applyChefDashboardV97(currentDashboardRole);
    }, true);
    modal.addEventListener('click', function(event){
      if (event.target.closest?.('[data-chef-profile-close-v97]')) modal.close?.();
      if (event.target.closest?.('#chefForgotPasswordBtnV97')) {
        event.preventDefault();
        modal.close?.();
        try { document.getElementById('forgotPasswordModal')?.showModal?.(); } catch {}
      }
    }, true);
    return modal;
  }
  function fillChefProfileModalV97(){
    const modal = ensureChefProfileModalV97();
    const form = modal.querySelector('#chefProfileFormV97');
    if (!form) return modal;
    const local = loadChefProfileV97();
    const chefName = fullNameV97();
    const set = (name, value) => { const el = form.elements[name]; if (el) el.value = value || ''; };
    set('fullName', local.fullName || chefName || '');
    set('phone', local.phone || supabaseProfile?.phone || supabaseSession?.user?.user_metadata?.phone || '');
    set('email', emailV97() || local.email || '');
    set('displayName', local.displayName || chefName || '');
    set('baseArea', local.baseArea || supabaseSession?.user?.user_metadata?.chef_base_area || '');
    set('payoutMethod', local.payoutMethod || supabaseSession?.user?.user_metadata?.payout_method || 'Zelle');
    set('payoutNote', local.payoutNote || '');
    return modal;
  }
  function openChefProfileV97(){
    const modal = fillChefProfileModalV97();
    if (modal && typeof modal.showModal === 'function' && !modal.open) modal.showModal();
  }
  function ensureChefHistoryPanelV97(){
    injectStyleV97();
    const dispatchPage = document.querySelector('[data-dashboard-page="dispatch"]');
    if (!dispatchPage) return null;
    let summary = document.getElementById('chefProfileSummaryV97');
    if (!summary) {
      summary = document.createElement('div');
      summary.id = 'chefProfileSummaryV97';
      summary.className = 'chef-profile-summary-v97';
      dispatchPage.querySelector('.section-row')?.insertAdjacentElement('afterend', summary);
    }
    let panel = document.getElementById('chefHistoryPanelV97');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'chefHistoryPanelV97';
      panel.className = 'chef-history-panel-v97';
      summary.insertAdjacentElement('afterend', panel);
    }
    if (!document.getElementById('chefHistoryModeV97')) {
      panel.innerHTML = `
        <div class="chef-history-head-v97">
          <div>
            <p class="eyebrow">Chef Order History</p>
            <h3>My orders & earnings</h3>
            <p class="small-muted">Filter your assigned order history by day, week, or month. Earnings are estimated chef payout before optional tips.</p>
          </div>
          <div class="chef-history-controls-v97">
            <label>View<select id="chefHistoryModeV97"><option value="week">By week</option><option value="date">By day</option><option value="month">By month</option></select></label>
            <label id="chefHistoryDateWrapV97">Date<input type="date" id="chefHistoryDateV97"></label>
            <label id="chefHistoryWeekWrapV97">Week<input type="week" id="chefHistoryWeekV97"></label>
            <label id="chefHistoryMonthWrapV97">Month<input type="month" id="chefHistoryMonthV97"></label>
            <button type="button" class="outline-btn" id="chefHistoryTodayBtnV97">This week</button>
          </div>
        </div>
        <div class="chef-history-stats-v97" id="chefHistoryStatsV97"></div>
        <div class="chef-history-list-v97" id="chefHistoryListV97"></div>`;
      const today = new Date();
      const dateInput = document.getElementById('chefHistoryDateV97');
      const weekInput = document.getElementById('chefHistoryWeekV97');
      const monthInput = document.getElementById('chefHistoryMonthV97');
      if (dateInput && !dateInput.value) dateInput.value = dateKeyV97(today);
      if (weekInput && !weekInput.value) weekInput.value = weekValueV97(today);
      if (monthInput && !monthInput.value) monthInput.value = dateKeyV97(today).slice(0,7);
      ['chefHistoryModeV97','chefHistoryDateV97','chefHistoryWeekV97','chefHistoryMonthV97'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => renderChefHistoryV97(), true);
      });
      document.getElementById('chefHistoryTodayBtnV97')?.addEventListener('click', () => {
        const now = new Date();
        const mode = document.getElementById('chefHistoryModeV97');
        const week = document.getElementById('chefHistoryWeekV97');
        if (mode) mode.value = 'week';
        if (week) week.value = weekValueV97(now);
        renderChefHistoryV97();
      }, true);
    }
    return panel;
  }
  function updateChefHistoryControlsV97(){
    const mode = document.getElementById('chefHistoryModeV97')?.value || 'week';
    const dateWrap = document.getElementById('chefHistoryDateWrapV97');
    const weekWrap = document.getElementById('chefHistoryWeekWrapV97');
    const monthWrap = document.getElementById('chefHistoryMonthWrapV97');
    if (dateWrap) dateWrap.hidden = mode !== 'date';
    if (weekWrap) weekWrap.hidden = mode !== 'week';
    if (monthWrap) monthWrap.hidden = mode !== 'month';
  }
  function chefHistoryCardV97(order){
    const m = orderPayoutV97(order);
    const dt = orderDateV97(order);
    const maps = typeof googleMapUrl === 'function' ? googleMapUrl(order.address || '') : '#';
    const guest = `${safeTextV97(order.name, 'Guest')} · ${safeTextV97(order.phone || order.email, 'No contact')}`;
    return `<article class="chef-history-card-v97">
      <header><div><strong>${escapeV97(order.id || order.booking_number || 'Order')}</strong><p>${escapeV97(dt ? dt.toLocaleString() : (order.eventDate || 'Date pending'))}</p></div><span class="tag">${escapeV97(order.status || 'Pending')}</span></header>
      <p><b>Guest:</b> ${escapeV97(guest)}<br><b>Address:</b> ${escapeV97(order.address || 'No address')}<br><b>Package:</b> ${escapeV97(order.package || order.packageName || '-')} · ${escapeV97(order.adults || order.adultCount || 0)} adults · ${escapeV97(order.kids || order.kidCount || 0)} kids</p>
      <div class="chef-history-money-v97">
        <div><span>Chef guest payout</span><b>${moneyV97(m.guestPayout)}</b></div>
        <div><span>Travel fee</span><b>${moneyV97(m.travelFee)}</b></div>
        <div><span>Estimated keep before tips</span><b>${moneyV97(m.keepsBeforeTip)}</b></div>
      </div>
      <div class="order-actions"><a href="${maps}" target="_blank" rel="noreferrer">Map</a><button type="button" data-print-guest="${escapeV97(order.id)}">Guest invoice</button><button type="button" data-print-chef="${escapeV97(order.id)}">Chef settlement</button><button type="button" data-copy-order="${escapeV97(order.id)}">Copy chef note</button></div>
    </article>`;
  }
  function renderChefHistoryV97(){
    if (!isChefV97()) return;
    ensureChefHistoryPanelV97();
    updateChefHistoryControlsV97();
    const all = getDashboardOrders?.() || [];
    const mine = myChefOrdersV97(all);
    const filtered = filterChefOrdersV97(mine.orders);
    const selectedPayout = filtered.reduce((sum, order) => sum + orderPayoutV97(order).keepsBeforeTip, 0);
    const completed = filtered.filter(o => String(o.status || '').toLowerCase().includes('completed')).length;
    const upcoming = filtered.filter(o => {
      const dt = orderDateV97(o);
      return dt && dt >= new Date() && !String(o.status || '').toLowerCase().includes('completed');
    }).length;
    const thisWeekRange = weekRangeFromValueV97(document.getElementById('chefHistoryWeekV97')?.value || weekValueV97(new Date()));
    const weekOrders = mine.orders.filter(o => { const dt = orderDateV97(o); return dt && dt >= thisWeekRange.start && dt < thisWeekRange.end; });
    const weekPayout = weekOrders.reduce((sum, order) => sum + orderPayoutV97(order).keepsBeforeTip, 0);
    const summary = document.getElementById('chefProfileSummaryV97');
    const local = loadChefProfileV97();
    if (summary) {
      summary.hidden = false;
      summary.style.display = '';
      summary.innerHTML = `
        <div><span>Chef</span><strong>${escapeV97(local.displayName || fullNameV97() || 'Chef account')}</strong></div>
        <div><span>Phone</span><strong>${escapeV97(local.phone || supabaseProfile?.phone || '-')}</strong></div>
        <div><span>This week estimated</span><strong>${moneyV97(weekPayout)}</strong></div>
        <div><span>Assigned this week</span><strong>${weekOrders.length}</strong></div>`;
    }
    const stats = document.getElementById('chefHistoryStatsV97');
    if (stats) {
      stats.innerHTML = `
        <div class="chef-history-stat-v97"><span>Selected orders</span><strong>${filtered.length}</strong></div>
        <div class="chef-history-stat-v97"><span>Selected estimated earnings</span><strong>${moneyV97(selectedPayout)}</strong></div>
        <div class="chef-history-stat-v97"><span>Completed</span><strong>${completed}</strong></div>
        <div class="chef-history-stat-v97"><span>Upcoming</span><strong>${upcoming}</strong></div>`;
    }
    const list = document.getElementById('chefHistoryListV97');
    if (list) {
      const warning = mine.linked ? '' : '<div class="chef-history-warning-v97">This chef account is not fully linked to a chef_id yet, so the portal is showing assigned chef orders as a fallback. Before launch, bind profiles.chef_id to bookings.assigned_chef_id for strict privacy.</div>';
      list.innerHTML = `${warning}${filtered.length ? filtered.map(chefHistoryCardV97).join('') : '<div class="empty-state">No assigned orders found for this filter.</div>'}`;
    }
  }
  function applyChefDashboardV97(role = currentDashboardRole){
    injectStyleV97();
    const chef = isChefV97(role);
    const autoBtn = document.getElementById('autoDispatchBtn');
    if (chef && autoBtn) {
      autoBtn.textContent = 'Profile';
      autoBtn.dataset.v97Action = 'chef-profile';
      autoBtn.hidden = false;
      autoBtn.style.display = '';
    }
    const summary = document.getElementById('chefProfileSummaryV97');
    const panel = document.getElementById('chefHistoryPanelV97');
    if (!chef) {
      if (summary) { summary.hidden = true; summary.style.display = 'none'; }
      if (panel) { panel.hidden = true; panel.style.display = 'none'; }
      return;
    }
    ensureChefProfileModalV97();
    ensureChefHistoryPanelV97();
    renderChefHistoryV97();
  }

  const oldRenderDashboardV97 = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (oldRenderDashboardV97 && !window.__PHX_V97_RENDER_WRAPPED__) {
    window.__PHX_V97_RENDER_WRAPPED__ = true;
    renderDashboard = function(role = currentDashboardRole || 'Member'){
      const clean = cleanRoleV97(role);
      const out = oldRenderDashboardV97(clean);
      setTimeout(() => applyChefDashboardV97(clean), 0);
      setTimeout(() => applyChefDashboardV97(clean), 140);
      setTimeout(() => applyChefDashboardV97(clean), 420);
      return out;
    };
  }

  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const autoBtn = event.target.closest?.('#autoDispatchBtn');
    if (autoBtn && isChefV97()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openChefProfileV97();
      return false;
    }
    const profileAction = event.target.closest?.('[data-account-action="profile"]');
    if (profileAction && isChefV97()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openChefProfileV97();
      return false;
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyChefDashboardV97(currentDashboardRole));
  } else {
    setTimeout(() => applyChefDashboardV97(currentDashboardRole), 0);
  }
})();

/* V98 mobile video playback guard
   Some mobile in-app browsers block autoplay until the first touch. Keep the
   video muted/inline and retry on load, visibility return, and first touch. */
(function initV98HeroVideoPlayback(){
  if (window.__PHOENIX_V98_VIDEO_READY__) return;
  window.__PHOENIX_V98_VIDEO_READY__ = true;
  function setup(){
    const video = document.querySelector('.hero-live-video');
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    const tryPlay = () => {
      try {
        const promise = video.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => video.classList.add('needs-user-play-v98'));
        }
      } catch (_) {
        video.classList.add('needs-user-play-v98');
      }
    };
    tryPlay();
    window.addEventListener('load', tryPlay, { once:true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tryPlay(); });
    ['touchstart','click','pointerdown'].forEach(type => {
      document.addEventListener(type, tryPlay, { once:true, passive:true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once:true });
  else setup();
})();

/* ======================================================================
   PHX V101 — Staff order workflow tools
   - Adds Confirm, Details, Modify time/date, Assign chef, and Print actions
   - Uses existing bookings columns only: status, event_date, event_time, admin_notes
   - No new Supabase SQL required. Chef assignment is persisted inside admin_notes
     so it works even before assigned_chef_id migrations are finalized.
   ====================================================================== */
(function initPHXV101OrderWorkflow(){
  if (window.__PHX_V101_ORDER_WORKFLOW__) return;
  window.__PHX_V101_ORDER_WORKFLOW__ = true;

  const NOTE_LABELS = {
    chefId: 'Assigned chef ID',
    chefName: 'Assigned chef',
    chefPhone: 'Assigned chef phone',
    confirmedAt: 'Phoenix confirmed at',
    modifiedAt: 'Phoenix modified at',
    modifiedTime: 'Phoenix modified time',
    customerVisibleNote: 'Customer visible note'
  };

  function v101Text(value){ return String(value ?? '').trim(); }
  function v101Escape(value){ try { return escapeHtml(String(value ?? '')); } catch { return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); } }
  function v101Money(value){ try { return money(value); } catch { return `$${Number(value || 0).toFixed(2)}`; } }
  function v101NowLabel(){ return new Date().toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }); }

  function v101ReadNote(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(notes || '').match(new RegExp(`(?:^|\\n)${safe}:\\s*([^\\n]+)`, 'i'));
    return match ? match[1].trim() : '';
  }

  function v101RemoveNote(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(notes || '')
      .replace(new RegExp(`(?:^|\\n)${safe}:\\s*[^\\n]*`, 'ig'), '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function v101UpsertNote(notes, label, value){
    let out = v101RemoveNote(notes, label);
    if (v101Text(value)) out = `${out ? `${out}\n` : ''}${label}: ${v101Text(value)}`;
    return out.trim();
  }

  function v101ChefById(id){
    return (Array.isArray(CHEFS) ? CHEFS : []).find(c => String(c.id) === String(id)) || null;
  }

  function v101ChefByName(name){
    const target = v101Text(name).toLowerCase();
    return (Array.isArray(CHEFS) ? CHEFS : []).find(c => String(c.name || '').toLowerCase() === target) || null;
  }

  function v101ConfirmedChef(order = {}){
    const notes = order.specialNotes || order.admin_notes || '';
    const noteId = v101ReadNote(notes, NOTE_LABELS.chefId);
    const noteName = v101ReadNote(notes, NOTE_LABELS.chefName);
    const notePhone = v101ReadNote(notes, NOTE_LABELS.chefPhone);
    const chef = v101ChefById(noteId) || v101ChefByName(noteName);
    if (chef || noteName) {
      return {
        id: noteId || chef?.id || '',
        name: noteName || chef?.name || 'Assigned chef',
        phone: notePhone || chef?.phone || ''
      };
    }
    // Do not show auto-route suggestions as customer-facing assignment.
    return { id:'', name:'Pending chef assignment', phone:'' };
  }

  function v101InternalChef(order = {}){
    const confirmed = v101ConfirmedChef(order);
    if (confirmed.id || confirmed.name !== 'Pending chef assignment') return confirmed;
    const auto = v101ChefById(order.assignedChefId) || v101ChefByName(order.assignedChef);
    return auto ? { id:auto.id, name:auto.name, phone:auto.phone || '' } : { id:'', name: order.assignedChef || 'Unassigned', phone:'' };
  }

  function v101DateInputValue(order = {}){
    const raw = order.eventDate || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  }

  function v101FormatDateForUi(dateValue){
    try { return formatDbDateForUi(dateValue) || dateValue; } catch { return dateValue; }
  }

  function v101FormatTimeForUi(timeValue){
    try { return formatDbTimeForUi(timeValue) || timeValue; } catch { return timeValue; }
  }

  function v101TimeOptions(selected = ''){
    const current = firstReadableTime?.(selected || '') || selected || '';
    const presets = ['11:00 AM - 1:00 PM','2:00 PM - 4:00 PM','4:00 PM - 6:00 PM','7:00 PM - 9:00 PM'];
    const custom = current && !presets.includes(current) ? [`${current}`] : [];
    return [...custom, ...presets].map(t => `<option value="${v101Escape(t)}" ${t === current ? 'selected' : ''}>${v101Escape(t)}</option>`).join('');
  }

  function v101OrderPanel(order = {}){
    const m = calculateOrderMoney(order);
    const confirmedChef = v101ConfirmedChef(order);
    const staffChef = v101InternalChef(order);
    const currentChefId = confirmedChef.id || staffChef.id || '';
    const chefOptions = ['<option value="">Pending / unassigned</option>', ...(Array.isArray(CHEFS) ? CHEFS : []).map(c => `<option value="${v101Escape(c.id)}" ${String(currentChefId) === String(c.id) ? 'selected' : ''}>${v101Escape(c.name)} · ${v101Escape(c.base || c.zone || '')}</option>`)].join('');
    const map = googleMapUrl?.(order.address || '') || '#';
    return `<div class="order-workflow-panel-v101" data-v101-panel="${v101Escape(order.id || '')}" hidden>
      <div class="order-detail-grid-v101">
        <p><b>Customer</b><br>${v101Escape(order.name || 'Guest')}<br>${v101Escape(order.phone || 'No phone')}<br>${v101Escape(order.email || 'No email')}</p>
        <p><b>Event</b><br>${v101Escape(order.eventDate || 'Date pending')} · ${v101Escape(order.eventTime || 'Time pending')}<br>${v101Escape(order.address || 'No address')}</p>
        <p><b>Package / money</b><br>${v101Escape(order.package || 'Classic')} · ${v101Escape(order.totalGuests || '')} guests<br>Total ${v101Money(m.guestTotalBeforeDeposit)} · Travel ${v101Money(m.travelFee)}</p>
        <p><b>Proteins / notes</b><br>${v101Escape(proteinSummary(m.proteinSelections))}<br><small>${v101Escape((order.specialNotes || '').slice(0,260) || 'No notes')}</small></p>
      </div>
      <div class="workflow-tools-v101">
        <div class="workflow-box-v101">
          <h4>Modify date / time</h4>
          <div class="workflow-row-v101">
            <label>Date<input type="date" data-v101-date="${v101Escape(order.id || '')}" value="${v101Escape(v101DateInputValue(order))}"></label>
            <label>Time<select data-v101-time="${v101Escape(order.id || '')}">${v101TimeOptions(order.eventTime)}</select></label>
            <button type="button" data-v101-save-time="${v101Escape(order.id || '')}">Save time</button>
          </div>
        </div>
        <div class="workflow-box-v101">
          <h4>Assign chef</h4>
          <div class="workflow-row-v101">
            <label>Chef<select data-v101-chef="${v101Escape(order.id || '')}">${chefOptions}</select></label>
            <button type="button" data-v101-save-chef="${v101Escape(order.id || '')}">Save chef</button>
          </div>
          <small>Customer will see: ${v101Escape(confirmedChef.name)}${confirmedChef.phone ? ` · ${v101Escape(confirmedChef.phone)}` : ''}</small>
        </div>
      </div>
      <div class="order-actions workflow-actions-v101">
        <a href="${v101Escape(map)}" target="_blank" rel="noreferrer">Open map</a>
        <button type="button" data-print-guest="${v101Escape(order.id || '')}">Print customer invoice</button>
        <button type="button" data-print-chef="${v101Escape(order.id || '')}">Print chef settlement</button>
        <button type="button" data-copy-order="${v101Escape(order.id || '')}">Copy chef note</button>
      </div>
    </div>`;
  }

  function v101StatusClass(status){
    const s = String(status || '').toLowerCase();
    return s.includes('confirm') || s.includes('accept') || s.includes('complete') || s.includes('assigned') ? 'accepted' : '';
  }

  function v101StaffOrderCard(order = {}){
    const m = calculateOrderMoney(order);
    const status = order.status || 'pending';
    const confirmedChef = v101ConfirmedChef(order);
    const internalChef = v101InternalChef(order);
    const accepted = String(status).toLowerCase().includes('confirm') || String(status).toLowerCase().includes('accept') || String(status).toLowerCase().includes('complete');
    const completed = String(status).toLowerCase().includes('complete');
    const sms = `sms:${order.phone || ''}?&body=${encodeURIComponent(guestTextTemplate(order))}`;
    const maps = googleMapUrl?.(order.address || '') || '#';
    const customerChefLine = confirmedChef.id || confirmedChef.name !== 'Pending chef assignment'
      ? `${confirmedChef.name}${confirmedChef.phone ? ` · ${confirmedChef.phone}` : ''}`
      : 'Pending chef assignment';
    const internalChefLine = internalChef.id || internalChef.name !== 'Unassigned' ? `${internalChef.name}${internalChef.phone ? ` · ${internalChef.phone}` : ''}` : 'Unassigned';
    return `<article class="order-card order-card-v101" data-v101-order-card="${v101Escape(order.id || '')}">
      <header>
        <div><strong>${order.routeLabel ? `<span class="route-letter-badge">${v101Escape(order.routeLabel)}</span> ` : ''}${v101Escape(order.id || '')}</strong><p>${v101Escape(order.eventDate || 'Date pending')} · ${v101Escape(order.eventTime || 'Time pending')}</p></div>
        <span class="tag ${v101StatusClass(status)}">${v101Escape(status)}</span>
      </header>
      <p><b>${v101Escape(order.name || 'Guest')}</b> · ${v101Escape(order.phone || 'No phone')}<br>${v101Escape(order.email || 'No email')}<br>${v101Escape(order.address || 'No address')}<br>${v101Escape(order.package || 'Classic')} · ${m.adults} adults · ${m.kids} kids · Total ${v101Money(m.guestTotalBeforeDeposit)} · Travel fee ${v101Money(m.travelFee)}<br>Proteins: ${v101Escape(proteinSummary(m.proteinSelections))}</p>
      <p><b>Customer-visible chef:</b> ${v101Escape(customerChefLine)}<br><b>Internal route chef:</b> ${v101Escape(internalChefLine)}<br>Chef keeps before tips: <b>${v101Money(m.chefKeepsBeforeTip)}</b> · Return to Phoenix: <b>${v101Money(m.chefReturnToCompany)}</b><br>Drive: ${v101Escape(order.estimatedDriveMin || '?')} min · Event block: ${v101Escape(order.eventBlockMin || eventBlockMinutes(order))} min</p>
      <div class="order-actions order-actions-v101">
        <button type="button" class="gold-btn-mini" data-v101-confirm="${v101Escape(order.id || '')}" ${accepted || completed ? 'disabled' : ''}>${accepted || completed ? 'Confirmed' : 'Confirm order'}</button>
        <button type="button" data-v101-details="${v101Escape(order.id || '')}">Order details</button>
        <button type="button" data-v101-open-time="${v101Escape(order.id || '')}">Modify time</button>
        <button type="button" data-v101-open-chef="${v101Escape(order.id || '')}">Assign chef</button>
        <button type="button" data-print-guest="${v101Escape(order.id || '')}">Print</button>
        <a href="${v101Escape(sms)}">Text guest</a>
        <a href="${v101Escape(maps)}" target="_blank" rel="noreferrer">Map</a>
        <button type="button" data-download-pdf="${v101Escape(order.id || '')}">Download PDF</button>
        <button type="button" data-copy-order="${v101Escape(order.id || '')}">Copy chef note</button>
        ${staffCanAssign?.() ? `<button type="button" data-complete-order="${v101Escape(order.id || '')}" ${completed ? 'disabled' : ''}>${completed ? 'Completed' : 'Complete'}</button>` : ''}
      </div>
      ${v101OrderPanel(order)}
    </article>`;
  }

  function v101MemberOrderCard(order = {}){
    const m = calculateOrderMoney(order);
    const chef = v101ConfirmedChef(order);
    const settings = (() => { try { return getContactSettingsV60?.() || {}; } catch { return {}; } })();
    const supportPhone = settings.textPhone || settings.phone || '3474719190';
    const supportEmail = settings.supportEmail || settings.bookingEmail || 'phoenix4719190@gmail.com';
    const status = typeof humanOrderStatus === 'function' ? humanOrderStatus(order.status) : (order.status || 'Pending manager review');
    const confirmed = String(order.status || '').toLowerCase().match(/confirm|accept|assigned|complete|updated/);
    const chefLine = chef.phone ? `${chef.name} · ${chef.phone}` : chef.name;
    const modifiedAt = v101ReadNote(order.specialNotes || '', NOTE_LABELS.modifiedAt);
    const confirmedAt = v101ReadNote(order.specialNotes || '', NOTE_LABELS.confirmedAt);
    const visibleNote = v101ReadNote(order.specialNotes || '', NOTE_LABELS.customerVisibleNote);
    return `<article class="order-card member-order-card-v96 member-order-card-v101">
      <header>
        <div><strong>${v101Escape(order.id || 'Phoenix order')}</strong><p>${v101Escape(order.eventDate || 'Date pending')} · ${v101Escape(order.eventTime || 'Time pending')}</p></div>
        <span class="tag ${confirmed ? 'accepted' : ''}">${v101Escape(status)}</span>
      </header>
      <div class="member-order-grid-v96">
        <p><b>Order status</b><br>${v101Escape(status)}<br><small>${v101Escape(confirmedAt ? `Confirmed: ${confirmedAt}` : 'Waiting for Phoenix manager review')}</small></p>
        <p><b>Event date / time</b><br>${v101Escape(order.eventDate || '-')}<br>${v101Escape(order.eventTime || '-')}<br><small>${v101Escape(modifiedAt ? `Last updated: ${modifiedAt}` : 'No manager time change yet')}</small></p>
        <p><b>Address</b><br>${v101Escape(order.address || 'Address pending')}</p>
        <p><b>Package / guests</b><br>${v101Escape(order.package || 'Classic')} · ${v101Escape(order.totalGuests || '')} actual guests<br>${formatGuestNumber(m.billableGuests)} billable · ${v101Escape(proteinSummary(m.proteinSelections))}</p>
        <p><b>Estimated total</b><br>${v101Money(m.guestTotalBeforeDeposit)}<br><small>Payment: ${v101Escape(order.paymentStatus || 'Not paid yet')}</small></p>
        <p><b>Assigned chef</b><br>${v101Escape(chefLine)}<br><small>${chef.name === 'Pending chef assignment' ? 'Chef name appears after Phoenix confirms dispatch.' : 'Your chef assignment has been updated by Phoenix.'}</small></p>
        <p><b>Customer service</b><br>${v101Escape(supportPhone)}<br><small>${v101Escape(supportEmail)}</small></p>
        <p><b>Manager note</b><br>${v101Escape(visibleNote || cancellationMessage(order))}</p>
      </div>
      <div class="order-actions">
        <button type="button" data-print-guest="${v101Escape(order.id || '')}">Print invoice</button>
        <button type="button" data-download-pdf="${v101Escape(order.id || '')}">Download PDF</button>
        <button type="button" data-customer-reschedule="${v101Escape(order.id || '')}">Request reschedule</button>
        <button type="button" data-customer-cancel="${v101Escape(order.id || '')}">Request cancellation</button>
        <a href="sms:${encodeURIComponent(String(supportPhone).replace(/\D/g,''))}">Text support</a>
      </div>
    </article>`;
  }

  function v101FindOrder(orderId){
    try { return findDashboardOrder?.(orderId); } catch { return null; }
  }

  function v101PatchLocalOrder(orderId, localPatch = {}){
    try {
      const stored = getStoredOrders().map(o => String(o.id) === String(orderId) ? { ...o, ...localPatch } : o);
      saveStoredOrders(stored);
    } catch {}
    try {
      if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.map(o => String(o.id) === String(orderId) ? { ...o, ...localPatch } : o);
    } catch {}
  }

  async function v101UpdateBooking(orderId, dbPatch = {}, localPatch = {}){
    let remoteOk = false;
    const client = initSupabaseClient?.();
    if (client && supabaseSession) {
      try {
        const { error } = await client.from('bookings').update(dbPatch).eq('booking_number', orderId);
        if (error) console.warn('V101 booking update failed:', error);
        else remoteOk = true;
      } catch (error) { console.warn('V101 booking update threw:', error); }
    }
    v101PatchLocalOrder(orderId, localPatch);
    if (remoteOk) {
      try { await loadDashboardDataFromSupabase?.(); } catch {}
    }
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    try { if (!calendarSummaryPanel?.hidden) renderCalendarSummary?.(); } catch {}
    return remoteOk;
  }

  async function v101ConfirmOrder(orderId){
    const order = v101FindOrder(orderId);
    if (!order) { alert('Order not found.'); return; }
    let notes = order.specialNotes || '';
    notes = v101UpsertNote(notes, NOTE_LABELS.confirmedAt, v101NowLabel());
    notes = v101UpsertNote(notes, NOTE_LABELS.customerVisibleNote, 'Your booking request has been confirmed by Phoenix Hibachi. Final arrival routing may still be adjusted before the event.');
    const status = 'Confirmed';
    const ok = await v101UpdateBooking(orderId, { status, admin_notes: notes }, { status, specialNotes: notes });
    alert(ok ? 'Order confirmed. Customer status has been updated.' : 'Order confirmed locally. Supabase update did not confirm; check login/RLS before relying on customer portal.');
  }

  async function v101SaveTime(orderId){
    const order = v101FindOrder(orderId);
    if (!order) { alert('Order not found.'); return; }
    const card = document.querySelector(`[data-v101-order-card="${CSS.escape(String(orderId))}"]`);
    const dateValue = card?.querySelector(`[data-v101-date="${CSS.escape(String(orderId))}"]`)?.value || '';
    const timeValue = card?.querySelector(`[data-v101-time="${CSS.escape(String(orderId))}"]`)?.value || '';
    if (!dateValue || !timeValue) { alert('Choose a valid date and time.'); return; }
    let notes = order.specialNotes || '';
    notes = v101UpsertNote(notes, NOTE_LABELS.modifiedAt, v101NowLabel());
    notes = v101UpsertNote(notes, NOTE_LABELS.modifiedTime, `${v101FormatDateForUi(dateValue)} · ${timeValue}`);
    notes = v101UpsertNote(notes, NOTE_LABELS.customerVisibleNote, `Phoenix Hibachi updated the event time to ${v101FormatDateForUi(dateValue)} · ${timeValue}.`);
    const currentStatus = String(order.status || '').toLowerCase();
    const status = currentStatus.includes('confirm') || currentStatus.includes('accept') ? 'Confirmed - time updated' : 'Time updated';
    const ok = await v101UpdateBooking(orderId, { event_date: dateValue, event_time: parseEventTimeForDb(timeValue), status, admin_notes: notes }, { eventDate: v101FormatDateForUi(dateValue), eventTime: timeValue, status, specialNotes: notes });
    alert(ok ? 'Order date/time updated. Customer portal will show the new time.' : 'Time updated locally. Supabase update did not confirm; check login/RLS.');
  }

  async function v101SaveChef(orderId){
    const order = v101FindOrder(orderId);
    if (!order) { alert('Order not found.'); return; }
    const card = document.querySelector(`[data-v101-order-card="${CSS.escape(String(orderId))}"]`);
    const chefId = card?.querySelector(`[data-v101-chef="${CSS.escape(String(orderId))}"]`)?.value || '';
    const chef = v101ChefById(chefId);
    let notes = order.specialNotes || '';
    notes = v101UpsertNote(notes, NOTE_LABELS.chefId, chef?.id || '');
    notes = v101UpsertNote(notes, NOTE_LABELS.chefName, chef?.name || '');
    notes = v101UpsertNote(notes, NOTE_LABELS.chefPhone, chef?.phone || '');
    notes = v101UpsertNote(notes, NOTE_LABELS.customerVisibleNote, chef ? `Your assigned chef is ${chef.name}.` : 'Chef assignment is pending manager confirmation.');
    const status = chef ? (String(order.status || '').toLowerCase().includes('confirm') ? 'Confirmed - chef assigned' : 'Chef assigned') : 'Pending chef assignment';
    const ok = await v101UpdateBooking(orderId, { status, admin_notes: notes }, { status, specialNotes: notes, assignedChefId: chef?.id || '', assignedChef: chef?.name || 'Unassigned' });
    alert(ok ? 'Chef assignment saved. Customer portal will show the chef name.' : 'Chef assignment saved locally. Supabase update did not confirm; check login/RLS.');
  }

  function v101TogglePanel(orderId, focusMode = ''){
    const panel = document.querySelector(`[data-v101-panel="${CSS.escape(String(orderId))}"]`);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      if (focusMode === 'time') panel.querySelector(`[data-v101-date]`)?.focus?.();
      if (focusMode === 'chef') panel.querySelector(`[data-v101-chef]`)?.focus?.();
      panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }
  }

  // Patch customer lookup so public order search shows only confirmed staff updates,
  // not internal auto-route suggestions.
  try {
    const previousLookup = orderLookupResultHtml;
    orderLookupResultHtml = function(order = {}){
      const m = calculateOrderMoney(order);
      const steps = orderProgressSteps(order).map(step => `<span class="lookup-step ${step.done ? 'done' : ''}">${step.done ? '✓' : '○'} ${v101Escape(step.label)}</span>`).join('');
      const chef = v101ConfirmedChef(order);
      const modifiedAt = v101ReadNote(order.specialNotes || '', NOTE_LABELS.modifiedAt);
      const visibleNote = v101ReadNote(order.specialNotes || '', NOTE_LABELS.customerVisibleNote);
      return `<div class="lookup-card">
        <header><strong>${v101Escape(order.id || '')}</strong><span class="tag ${v101StatusClass(order.status)}">${v101Escape(humanOrderStatus(order.status))}</span></header>
        <div class="lookup-steps">${steps}</div>
        <p><b>Status:</b> ${v101Escape(humanOrderStatus(order.status))}<br>
        <b>Date / Time:</b> ${v101Escape(order.eventDate || '')} · ${v101Escape(order.eventTime || '')}${modifiedAt ? `<br><small>Last updated by Phoenix: ${v101Escape(modifiedAt)}</small>` : ''}<br>
        <b>Guest:</b> ${v101Escape(order.name || 'Guest')} · ${v101Escape(order.phone || '')}<br>
        <b>Address:</b> ${v101Escape(order.address || 'Not entered')}<br>
        <b>Package:</b> ${v101Escape(order.package || 'Classic')} · ${formatGuestNumber(m.billableGuests)} billable guests<br>
        <b>Estimated total:</b> ${v101Money(m.guestTotalBeforeDeposit)}<br>
        <b>Chef:</b> ${v101Escape(chef.phone ? `${chef.name} · ${chef.phone}` : chef.name)}<br>
        <b>Payment:</b> ${v101Escape(order.paymentStatus || 'Not paid yet')}</p>
        <small>${v101Escape(visibleNote || 'Use this order number to check updates anytime.')}</small>
      </div>`;
    };
  } catch (error) { console.warn('V101 lookup patch skipped:', error); }

  // Patch order rendering. Staff gets workflow controls; member gets clean customer view.
  try { orderCard = v101StaffOrderCard; } catch (error) { console.warn('V101 staff order card patch skipped:', error); }
  try { customerOrderCard = v101MemberOrderCard; } catch (error) { console.warn('V101 member order card patch skipped:', error); }

  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const confirmBtn = event.target.closest?.('[data-v101-confirm]');
    if (confirmBtn) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      confirmBtn.disabled = true;
      v101ConfirmOrder(confirmBtn.dataset.v101Confirm);
      return false;
    }
    const detailBtn = event.target.closest?.('[data-v101-details]');
    if (detailBtn) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      v101TogglePanel(detailBtn.dataset.v101Details, '');
      return false;
    }
    const timeBtn = event.target.closest?.('[data-v101-open-time]');
    if (timeBtn) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      v101TogglePanel(timeBtn.dataset.v101OpenTime, 'time');
      return false;
    }
    const chefBtn = event.target.closest?.('[data-v101-open-chef]');
    if (chefBtn) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      v101TogglePanel(chefBtn.dataset.v101OpenChef, 'chef');
      return false;
    }
    const saveTime = event.target.closest?.('[data-v101-save-time]');
    if (saveTime) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveTime.disabled = true;
      v101SaveTime(saveTime.dataset.v101SaveTime).finally(() => { saveTime.disabled = false; });
      return false;
    }
    const saveChef = event.target.closest?.('[data-v101-save-chef]');
    if (saveChef) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      saveChef.disabled = true;
      v101SaveChef(saveChef.dataset.v101SaveChef).finally(() => { saveChef.disabled = false; });
      return false;
    }
  }, true);

  // Re-apply member card after older V96/V97 wrappers render.
  const previousRenderV101 = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (previousRenderV101) {
    renderDashboard = function(role = currentDashboardRole || 'Member'){
      const out = previousRenderV101(role);
      setTimeout(() => {
        try {
          const clean = String(role || currentDashboardRole || '').toLowerCase();
          if (clean.includes('member') || clean.includes('customer')) {
            const orders = getDashboardOrders?.() || [];
            if (orderList) orderList.innerHTML = orders.length ? orders.map(v101MemberOrderCard).join('') : '<div class="empty-state">No bookings are linked to this member account yet.</div>';
          }
        } catch (error) { console.warn('V101 member re-render skipped:', error); }
      }, 420);
      return out;
    };
  }
})();


/* ======================================================================
   PHX V102 — Robust visible order tools
   Reason: some older dashboard render paths still output compact order cards.
   This DOM enhancer injects Confirm, Details, Modify time, Assign chef, and
   Print into any staff-visible order card after rendering. No new Supabase
   columns are required; chef assignment is stored in admin_notes.
   ====================================================================== */
(function initPHXV102VisibleOrderTools(){
  if (window.__PHX_V102_VISIBLE_ORDER_TOOLS__) return;
  window.__PHX_V102_VISIBLE_ORDER_TOOLS__ = true;

  const LABELS = {
    chefId: 'Assigned chef ID',
    chefName: 'Assigned chef',
    chefPhone: 'Assigned chef phone',
    confirmedAt: 'Phoenix confirmed at',
    modifiedAt: 'Phoenix modified at',
    modifiedTime: 'Phoenix modified time',
    customerVisibleNote: 'Customer visible note'
  };

  const staffRoles = ['admin','manager','customer service','chef'];
  const managerRoles = ['admin','manager','customer service'];

  function text(value){ return String(value ?? '').trim(); }
  function esc(value){
    try { return escapeHtml(String(value ?? '')); }
    catch { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  }
  function isStaffRole(){ return staffRoles.includes(String(currentDashboardRole || '').toLowerCase()); }
  function canManageOrders(){ return managerRoles.includes(String(currentDashboardRole || '').toLowerCase()); }
  function moneyV102(value){ try { return money(value); } catch { return `$${Number(value || 0).toFixed(2)}`; } }
  function nowLabel(){ return new Date().toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }); }

  function readNote(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(notes || '').match(new RegExp(`(?:^|\\n)${safe}:\\s*([^\\n]+)`, 'i'));
    return match ? match[1].trim() : '';
  }
  function removeNote(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(notes || '')
      .replace(new RegExp(`(?:^|\\n)${safe}:\\s*[^\\n]*`, 'ig'), '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function upsertNote(notes, label, value){
    let out = removeNote(notes, label);
    if (text(value)) out = `${out ? `${out}\n` : ''}${label}: ${text(value)}`;
    return out.trim();
  }

  function allOrders(){
    const map = new Map();
    const add = (o) => { if (o && o.id) map.set(String(o.id), o); };
    try { (getStoredOrders?.() || []).forEach(add); } catch {}
    try { (Array.isArray(remoteOrdersCache) ? remoteOrdersCache : []).forEach(add); } catch {}
    try { (getDashboardOrders?.() || []).forEach(add); } catch {}
    return [...map.values()];
  }
  function findOrder(orderId){
    const id = String(orderId || '').trim();
    if (!id) return null;
    return allOrders().find(o => String(o.id) === id || String(o.booking_number) === id) || null;
  }
  function orderForCard(card){
    if (!card) return null;
    const orders = allOrders();
    const body = card.textContent || '';
    return orders.find(o => o?.id && body.includes(String(o.id))) || null;
  }
  function chefById(id){ return (Array.isArray(CHEFS) ? CHEFS : []).find(c => String(c.id) === String(id)) || null; }
  function chefByName(name){
    const needle = text(name).toLowerCase();
    return (Array.isArray(CHEFS) ? CHEFS : []).find(c => String(c.name || '').toLowerCase() === needle) || null;
  }
  function confirmedChef(order = {}){
    const notes = order.specialNotes || order.admin_notes || '';
    const noteId = readNote(notes, LABELS.chefId);
    const noteName = readNote(notes, LABELS.chefName);
    const notePhone = readNote(notes, LABELS.chefPhone);
    const chef = chefById(noteId) || chefByName(noteName);
    if (chef || noteName) return { id: noteId || chef?.id || '', name: noteName || chef?.name || 'Assigned chef', phone: notePhone || chef?.phone || '' };
    return { id:'', name:'Pending chef assignment', phone:'' };
  }
  function dateInputValue(order = {}){
    const raw = order.eventDate || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  }
  function uiDate(dateValue){ try { return formatDbDateForUi(dateValue) || dateValue; } catch { return dateValue; } }
  function readableTime(value){ try { return firstReadableTime?.(value || '') || value || ''; } catch { return value || ''; } }
  function timeOptions(selected = ''){
    const current = readableTime(selected);
    const presets = ['11:00 AM - 1:00 PM','2:00 PM - 4:00 PM','4:00 PM - 6:00 PM','7:00 PM - 9:00 PM'];
    const all = current && !presets.includes(current) ? [current, ...presets] : presets;
    return all.map(t => `<option value="${esc(t)}" ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('');
  }
  function chefOptions(selectedId = ''){
    return ['<option value="">Pending / unassigned</option>', ...(Array.isArray(CHEFS) ? CHEFS : []).map(c => `<option value="${esc(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc(c.name)} · ${esc(c.base || c.zone || '')}</option>`)].join('');
  }

  function updateLocal(orderId, localPatch = {}){
    const id = String(orderId || '');
    try {
      const stored = (getStoredOrders?.() || []).map(o => String(o.id) === id ? { ...o, ...localPatch } : o);
      saveStoredOrders?.(stored);
    } catch {}
    try {
      if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.map(o => String(o.id) === id ? { ...o, ...localPatch } : o);
    } catch {}
  }
  async function updateRemote(orderId, dbPatch = {}, localPatch = {}){
    updateLocal(orderId, localPatch);
    const client = initSupabaseClient?.();
    let remoteOk = false;
    if (client && supabaseSession) {
      try {
        const { error } = await client.from('bookings').update(dbPatch).eq('booking_number', orderId);
        if (error) console.warn('V102 booking update failed:', error);
        else remoteOk = true;
      } catch (error) { console.warn('V102 booking update threw:', error); }
    }
    if (remoteOk) {
      try { await loadDashboardDataFromSupabase?.(); } catch {}
    }
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    try { if (!calendarSummaryPanel?.hidden) renderCalendarSummary?.(); } catch {}
    setTimeout(applyTools, 80);
    setTimeout(applyTools, 300);
    return remoteOk;
  }

  function detailsPanel(order){
    const m = calculateOrderMoney?.(order) || {};
    const chef = confirmedChef(order);
    const currentChef = chef.id || order.assignedChefId || '';
    const notes = order.specialNotes || order.admin_notes || '';
    return `<div class="v102-order-panel" data-v102-panel="${esc(order.id)}" hidden>
      <div class="v102-detail-grid">
        <p><b>Customer</b><br>${esc(order.name || 'Guest')}<br>${esc(order.phone || 'No phone')}<br>${esc(order.email || 'No email')}</p>
        <p><b>Event</b><br>${esc(order.eventDate || '')} · ${esc(order.eventTime || '')}<br>${esc(order.address || 'No address')}</p>
        <p><b>Package / money</b><br>${esc(order.package || 'Classic')} · ${esc(order.totalGuests || '')} guests<br>Total ${moneyV102(m.guestTotalBeforeDeposit || 0)} · Travel ${moneyV102(m.travelFee || order.travelFee || 0)}</p>
        <p><b>Chef visible to customer</b><br>${esc(chef.phone ? `${chef.name} · ${chef.phone}` : chef.name)}<br><small>${esc(readNote(notes, LABELS.customerVisibleNote) || 'No customer-facing note yet.')}</small></p>
      </div>
      <div class="v102-tool-boxes">
        <section>
          <h4>Modify event date / time</h4>
          <div class="v102-row"><label>Date<input type="date" data-v102-date="${esc(order.id)}" value="${esc(dateInputValue(order))}"></label><label>Time<select data-v102-time="${esc(order.id)}">${timeOptions(order.eventTime)}</select></label><button type="button" data-v102-save-time="${esc(order.id)}">Save time</button></div>
        </section>
        <section>
          <h4>Assign chef</h4>
          <div class="v102-row"><label>Chef<select data-v102-chef="${esc(order.id)}">${chefOptions(currentChef)}</select></label><button type="button" data-v102-save-chef="${esc(order.id)}">Save chef</button></div>
        </section>
      </div>
    </div>`;
  }

  function actionBar(order){
    const key = String(order.status || '').toLowerCase();
    const confirmed = key.includes('confirm') || key.includes('accept') || key.includes('complete');
    const disableManage = !canManageOrders();
    return `<div class="v102-order-tools" data-v102-tools="${esc(order.id)}">
      <button type="button" class="gold-btn-mini" data-v102-confirm="${esc(order.id)}" ${confirmed || disableManage ? 'disabled' : ''}>${confirmed ? 'Confirmed' : 'Confirm order'}</button>
      <button type="button" data-v102-details="${esc(order.id)}">Order details</button>
      <button type="button" data-v102-time-open="${esc(order.id)}" ${disableManage ? 'disabled' : ''}>Modify time</button>
      <button type="button" data-v102-chef-open="${esc(order.id)}" ${disableManage ? 'disabled' : ''}>Assign chef</button>
      <button type="button" data-v102-print="${esc(order.id)}">Print</button>
    </div>`;
  }

  function injectIntoCard(card, order){
    if (!card || !order?.id || card.querySelector('.v102-order-tools')) return;
    card.setAttribute('data-v102-order-card', order.id);
    const deleteBtn = card.querySelector('[data-delete-order], .danger-btn');
    const html = actionBar(order) + detailsPanel(order);
    const holder = document.createElement('div');
    holder.innerHTML = html;
    if (deleteBtn?.parentElement) deleteBtn.parentElement.insertAdjacentElement('beforebegin', holder);
    else card.insertAdjacentElement('beforeend', holder);
  }

  function applyTools(){
    if (!isStaffRole()) return;
    const roots = [document.getElementById('orderList'), document.getElementById('calendarSummaryList'), document.getElementById('chefDispatch')].filter(Boolean);
    roots.forEach(root => {
      root.querySelectorAll('article.order-card').forEach(card => {
        if (card.classList.contains('application-card') || card.classList.contains('feedback-card')) return;
        const order = orderForCard(card);
        if (order) injectIntoCard(card, order);
      });
    });
  }

  async function confirmOrder(orderId){
    const order = findOrder(orderId);
    if (!order) return alert('Order not found.');
    let notes = order.specialNotes || order.admin_notes || '';
    notes = upsertNote(notes, LABELS.confirmedAt, nowLabel());
    notes = upsertNote(notes, LABELS.customerVisibleNote, 'Your booking request has been confirmed by Phoenix Hibachi.');
    const ok = await updateRemote(orderId, { status:'Confirmed', admin_notes: notes }, { status:'Confirmed', specialNotes: notes });
    alert(ok ? 'Order confirmed. Customer can now see the updated status.' : 'Updated locally, but Supabase did not confirm. Check logged-in Admin permission/RLS before relying on customer portal.');
  }
  async function saveTime(orderId){
    const order = findOrder(orderId);
    if (!order) return alert('Order not found.');
    const card = document.querySelector(`[data-v102-order-card="${CSS.escape(String(orderId))}"]`);
    const dateValue = card?.querySelector(`[data-v102-date="${CSS.escape(String(orderId))}"]`)?.value || '';
    const timeValue = card?.querySelector(`[data-v102-time="${CSS.escape(String(orderId))}"]`)?.value || '';
    if (!dateValue || !timeValue) return alert('Choose a valid date and time.');
    let notes = order.specialNotes || order.admin_notes || '';
    notes = upsertNote(notes, LABELS.modifiedAt, nowLabel());
    notes = upsertNote(notes, LABELS.modifiedTime, `${uiDate(dateValue)} · ${timeValue}`);
    notes = upsertNote(notes, LABELS.customerVisibleNote, `Phoenix Hibachi updated your event time to ${uiDate(dateValue)} · ${timeValue}.`);
    const status = String(order.status || '').toLowerCase().includes('confirm') ? 'Confirmed - time updated' : 'Time updated';
    const dbTime = (typeof parseEventTimeForDb === 'function') ? parseEventTimeForDb(timeValue) : timeValue;
    const ok = await updateRemote(orderId, { event_date: dateValue, event_time: dbTime, status, admin_notes: notes }, { eventDate: uiDate(dateValue), eventTime: timeValue, status, specialNotes: notes });
    alert(ok ? 'Order time updated.' : 'Updated locally, but Supabase did not confirm.');
  }
  async function saveChef(orderId){
    const order = findOrder(orderId);
    if (!order) return alert('Order not found.');
    const card = document.querySelector(`[data-v102-order-card="${CSS.escape(String(orderId))}"]`);
    const chefId = card?.querySelector(`[data-v102-chef="${CSS.escape(String(orderId))}"]`)?.value || '';
    const chef = chefById(chefId);
    let notes = order.specialNotes || order.admin_notes || '';
    notes = upsertNote(notes, LABELS.chefId, chef?.id || '');
    notes = upsertNote(notes, LABELS.chefName, chef?.name || '');
    notes = upsertNote(notes, LABELS.chefPhone, chef?.phone || '');
    notes = upsertNote(notes, LABELS.customerVisibleNote, chef ? `Your assigned chef is ${chef.name}.` : 'Chef assignment is pending manager confirmation.');
    const status = chef ? (String(order.status || '').toLowerCase().includes('confirm') ? 'Confirmed - chef assigned' : 'Chef assigned') : 'Pending chef assignment';
    const ok = await updateRemote(orderId, { status, admin_notes: notes }, { status, specialNotes: notes, assignedChefId: chef?.id || '', assignedChef: chef?.name || 'Unassigned' });
    alert(ok ? 'Chef assignment saved.' : 'Saved locally, but Supabase did not confirm.');
  }
  function togglePanel(orderId, focus){
    const panel = document.querySelector(`[data-v102-panel="${CSS.escape(String(orderId))}"]`);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      if (focus === 'time') panel.querySelector('[data-v102-date]')?.focus?.();
      if (focus === 'chef') panel.querySelector('[data-v102-chef]')?.focus?.();
      panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }
  }

  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const confirmBtn = event.target.closest?.('[data-v102-confirm]');
    if (confirmBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); confirmBtn.disabled = true; confirmOrder(confirmBtn.dataset.v102Confirm).finally(()=>confirmBtn.disabled=false); return false; }
    const detailsBtn = event.target.closest?.('[data-v102-details]');
    if (detailsBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); togglePanel(detailsBtn.dataset.v102Details, ''); return false; }
    const timeBtn = event.target.closest?.('[data-v102-time-open]');
    if (timeBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); togglePanel(timeBtn.dataset.v102TimeOpen, 'time'); return false; }
    const chefBtn = event.target.closest?.('[data-v102-chef-open]');
    if (chefBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); togglePanel(chefBtn.dataset.v102ChefOpen, 'chef'); return false; }
    const saveTimeBtn = event.target.closest?.('[data-v102-save-time]');
    if (saveTimeBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); saveTimeBtn.disabled = true; saveTime(saveTimeBtn.dataset.v102SaveTime).finally(()=>saveTimeBtn.disabled=false); return false; }
    const saveChefBtn = event.target.closest?.('[data-v102-save-chef]');
    if (saveChefBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); saveChefBtn.disabled = true; saveChef(saveChefBtn.dataset.v102SaveChef).finally(()=>saveChefBtn.disabled=false); return false; }
    const printBtn = event.target.closest?.('[data-v102-print]');
    if (printBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); const order = findOrder(printBtn.dataset.v102Print); if (order) openPrintModalForOrder?.(order, 'guest'); return false; }
  }, true);

  // Make customer lookup stricter and customer-facing: show confirmed chef notes only.
  try {
    orderLookupResultHtml = function(order = {}){
      const m = calculateOrderMoney?.(order) || {};
      const steps = (orderProgressSteps?.(order) || []).map(step => `<span class="lookup-step ${step.done ? 'done' : ''}">${step.done ? '✓' : '○'} ${esc(step.label)}</span>`).join('');
      const chef = confirmedChef(order);
      const modifiedAt = readNote(order.specialNotes || order.admin_notes || '', LABELS.modifiedAt);
      const visibleNote = readNote(order.specialNotes || order.admin_notes || '', LABELS.customerVisibleNote);
      return `<div class="lookup-card">
        <header><strong>${esc(order.id || '')}</strong><span class="tag ${String(order.status || '').toLowerCase().includes('confirm') ? 'accepted' : ''}">${esc(humanOrderStatus?.(order.status) || order.status || 'Pending')}</span></header>
        <div class="lookup-steps">${steps}</div>
        <p><b>Status:</b> ${esc(humanOrderStatus?.(order.status) || order.status || 'Pending')}<br>
        <b>Date / Time:</b> ${esc(order.eventDate || '')} · ${esc(order.eventTime || '')}${modifiedAt ? `<br><small>Last updated by Phoenix: ${esc(modifiedAt)}</small>` : ''}<br>
        <b>Guest:</b> ${esc(order.name || 'Guest')} · ${esc(order.phone || '')}<br>
        <b>Address:</b> ${esc(order.address || 'Not entered')}<br>
        <b>Package:</b> ${esc(order.package || 'Classic')} · ${esc(formatGuestNumber?.(m.billableGuests) || order.totalGuests || '')} billable guests<br>
        <b>Estimated total:</b> ${moneyV102(m.guestTotalBeforeDeposit || 0)}<br>
        <b>Chef:</b> ${esc(chef.phone ? `${chef.name} · ${chef.phone}` : chef.name)}<br>
        <b>Payment:</b> ${esc(order.paymentStatus || 'Not paid yet')}</p>
        <small>${esc(visibleNote || 'Use this order number to check updates anytime.')}</small>
      </div>`;
    };
  } catch (error) { console.warn('V102 lookup patch skipped:', error); }

  // Re-apply after all older dashboard renderers finish.
  const oldRenderDashboardV102 = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (oldRenderDashboardV102 && !window.__PHX_V102_RENDER_WRAP__) {
    window.__PHX_V102_RENDER_WRAP__ = true;
    renderDashboard = function(role = currentDashboardRole || 'Admin'){
      const out = oldRenderDashboardV102(role);
      setTimeout(applyTools, 0);
      setTimeout(applyTools, 180);
      setTimeout(applyTools, 600);
      return out;
    };
  }
  const oldCalendarV102 = typeof renderCalendarSummary === 'function' ? renderCalendarSummary : null;
  if (oldCalendarV102 && !window.__PHX_V102_CALENDAR_WRAP__) {
    window.__PHX_V102_CALENDAR_WRAP__ = true;
    renderCalendarSummary = function(){
      const out = oldCalendarV102();
      setTimeout(applyTools, 80);
      return out;
    };
  }
  try {
    const observer = new MutationObserver(() => { clearTimeout(window.__PHX_V102_APPLY_TIMER__); window.__PHX_V102_APPLY_TIMER__ = setTimeout(applyTools, 80); });
    observer.observe(document.body, { childList:true, subtree:true });
  } catch {}
  window.PHX_V102_APPLY_ORDER_TOOLS = applyTools;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(applyTools, 300), { once:true });
  else setTimeout(applyTools, 300);
  setTimeout(applyTools, 1000);
})();

/* Phoenix Hibachi V103 — public lookup print + invoice watermark/logo */
(function(){
  if (window.__PHX_V103_PRINT_LOOKUP__) return;
  window.__PHX_V103_PRINT_LOOKUP__ = true;
  const esc = (value) => {
    try { return escapeHtml?.(value ?? '') || ''; } catch { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  };
  const moneySafe = (value) => {
    try { return money?.(value) || `$${Number(value || 0).toFixed(2)}`; } catch { return `$${Number(value || 0).toFixed(2)}`; }
  };
  const fmtGuests = (value) => {
    try { return formatGuestNumber?.(value) || String(value || ''); } catch { return String(value || ''); }
  };
  const readManagerNote = (order = {}) => {
    try {
      if (typeof readNote === 'function' && typeof LABELS === 'object') {
        return readNote(order.specialNotes || order.admin_notes || '', LABELS.customerVisibleNote) || '';
      }
      if (typeof v101ReadNote === 'function' && typeof NOTE_LABELS === 'object') {
        return v101ReadNote(order.specialNotes || order.admin_notes || '', NOTE_LABELS.customerVisibleNote) || '';
      }
    } catch {}
    return '';
  };
  const readModifiedAt = (order = {}) => {
    try {
      if (typeof readNote === 'function' && typeof LABELS === 'object') {
        return readNote(order.specialNotes || order.admin_notes || '', LABELS.modifiedAt) || '';
      }
      if (typeof v101ReadNote === 'function' && typeof NOTE_LABELS === 'object') {
        return v101ReadNote(order.specialNotes || order.admin_notes || '', NOTE_LABELS.modifiedAt) || '';
      }
    } catch {}
    return '';
  };
  const publicChef = (order = {}) => {
    try {
      if (typeof confirmedChef === 'function') return confirmedChef(order);
      if (typeof v101ConfirmedChef === 'function') return v101ConfirmedChef(order);
    } catch {}
    const name = order.assignedChef && String(order.assignedChef).toLowerCase() !== 'unassigned' ? order.assignedChef : 'Pending chef assignment';
    return { name, phone: order.assignedChefPhone || '' };
  };
  const statusText = (order = {}) => {
    try { return humanOrderStatus?.(order.status) || order.status || 'Pending manager review'; } catch { return order.status || 'Pending manager review'; }
  };
  const findOrderFromAnyCache = (orderId) => {
    const id = String(orderId || '');
    if (!id) return null;
    if (window.__PHX_LOOKUP_ORDER_CACHE__?.[id]) return window.__PHX_LOOKUP_ORDER_CACHE__[id];
    try { const found = findDashboardOrder?.(id); if (found) return found; } catch {}
    try { return getStoredOrders?.().find(o => String(o.id) === id || String(o.booking_number) === id) || null; } catch { return null; }
  };

  try {
    orderLookupResultHtml = function(order = {}){
      window.__PHX_LOOKUP_ORDER_CACHE__ = window.__PHX_LOOKUP_ORDER_CACHE__ || {};
      const id = String(order.id || order.booking_number || '').trim();
      if (id) window.__PHX_LOOKUP_ORDER_CACHE__[id] = order;
      const m = calculateOrderMoney?.(order) || {};
      const chef = publicChef(order);
      const modifiedAt = readModifiedAt(order);
      const visibleNote = readManagerNote(order);
      const st = statusText(order);
      const statusClass = String(order.status || '').toLowerCase().match(/confirm|accept|assigned|complete|updated/) ? 'accepted' : '';
      return `<div class="lookup-card lookup-card-v103">
        <header><strong>${esc(id || 'Phoenix order')}</strong><span class="tag ${statusClass}">${esc(st)}</span></header>
        <p><b>Status:</b> ${esc(st)}<br>
        <b>Date / Time:</b> ${esc(order.eventDate || order.event_date || '')} · ${esc(order.eventTime || order.event_time || '')}${modifiedAt ? `<br><small>Last updated by Phoenix: ${esc(modifiedAt)}</small>` : ''}<br>
        <b>Guest:</b> ${esc(order.name || order.customer_name || 'Guest')} · ${esc(order.phone || '')}<br>
        <b>Address:</b> ${esc(order.address || 'Not entered')}<br>
        <b>Package:</b> ${esc(order.package || order.packageName || 'Classic')} · ${esc(fmtGuests(m.billableGuests || order.totalGuests || ''))} billable guests<br>
        <b>Estimated total:</b> ${moneySafe(m.guestTotalBeforeDeposit || order.total || 0)}<br>
        <b>Chef:</b> ${esc(chef.phone ? `${chef.name} · ${chef.phone}` : chef.name)}<br>
        <b>Payment:</b> ${esc(order.paymentStatus || order.payment_status || 'Not paid yet')}</p>
        <div class="lookup-actions-v103">
          <button type="button" class="gold-btn-mini" data-print-lookup="${esc(id)}">Print invoice</button>
          <a href="tel:13474719190">Call Phoenix</a>
        </div>
        <small>${esc(visibleNote || 'Use this order number to check updates anytime.')}</small>
      </div>`;
    };
  } catch (error) { console.warn('V103 lookup print patch skipped:', error); }

  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const btn = event.target.closest?.('[data-print-lookup]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const order = findOrderFromAnyCache(btn.dataset.printLookup);
    if (!order) { alert('Order details are not loaded yet. Search the order number again, then print.'); return false; }
    openPrintModalForOrder?.(order, 'guest');
    return false;
  }, true);

  try {
    const previousGuestInvoiceHtml = guestInvoiceHtml;
    guestInvoiceHtml = function(order = {}){
      const html = previousGuestInvoiceHtml(order);
      const ref = esc(order.id || order.booking_number || 'PHX');
      const logo = `<img class="invoice-logo-v103" src="assets/phoenix-logo-transparent.png" alt="Phoenix Hibachi logo">`;
      const seal = `<div class="invoice-security-seal-v103"><b>Verified Phoenix Hibachi Order</b><span>Ref ${ref} · Generated from Phoenix Hibachi booking system</span></div>`;
      return String(html)
        .replace('<section class="guest-invoice">', `<section class="guest-invoice guest-invoice-v103" data-watermark="PHOENIX HIBACHI ${ref}">`)
        .replace('<div class="invoice-brand"><strong>PHOENIX HIBACHI</strong>', `<div class="invoice-brand invoice-brand-v103">${logo}<strong>PHOENIX HIBACHI</strong>`)
        .replace('<div class="invoice-footer-red">', `${seal}<div class="invoice-footer-red">`);
    };
  } catch (error) { console.warn('V103 invoice watermark patch skipped:', error); }
})();

/* Phoenix Hibachi V106 — choose one-page print density before browser print preview opens. */
(function(){
  if (window.__PHX_V106_PRINT_FIT__) return;
  window.__PHX_V106_PRINT_FIT__ = true;

  function preparePhoenixOnePagePrint(){
    const area = document.getElementById('printArea');
    if (!area) return;
    const sheet = area.querySelector('.guest-invoice, .chef-settlement-sheet');
    if (!sheet) return;

    area.classList.add('phx-one-page-fit');

    const textLength = (sheet.innerText || '').replace(/\s+/g, ' ').trim().length;
    const rowCount = sheet.querySelectorAll('.invoice-row,.invoice-labels div,.invoice-totals div,.invoice-rule-box span,.tip-suggestions div,.settlement-grid div,.settlement-money div,.settlement-checks label').length;
    const addonCount = sheet.querySelectorAll('.invoice-row').length;

    let mode = 'fill';
    if (textLength > 2200 || rowCount > 28 || addonCount > 8) mode = 'normal';
    if (textLength > 3200 || rowCount > 38 || addonCount > 13) mode = 'tight';

    area.dataset.printFit = mode;
  }

  const runPrintBtn = document.getElementById('runPrintBtn');
  runPrintBtn?.addEventListener('click', preparePhoenixOnePagePrint, true);

  window.addEventListener('afterprint', () => {
    const area = document.getElementById('printArea');
    if (!area) return;
    area.classList.remove('phx-one-page-fit');
    delete area.dataset.printFit;
  });
})();

/* ======================================================================
   PHX V107 — Admin payment & price adjustment workflow
   - Adds Payment / price tools to staff order cards.
   - No new Supabase SQL required: uses existing payment_status, deposit_amount,
     travel_fee, status, and admin_notes fields.
   - Stores manual adjustment metadata in admin_notes so customer lookup,
     member dashboard totals, and invoice printing can reflect the manager update.
   ====================================================================== */
(function initPHXV107PaymentPriceWorkflow(){
  if (window.__PHX_V107_PAYMENT_PRICE_WORKFLOW__) return;
  window.__PHX_V107_PAYMENT_PRICE_WORKFLOW__ = true;

  const LABELS = {
    paymentMethod: 'Payment method',
    paymentStatus: 'Payment status note',
    paymentReceived: 'Payment received',
    paymentConfirmedAt: 'Payment confirmed at',
    managerDiscount: 'Manager discount',
    finalTotal: 'Final total override',
    travelWaived: 'Travel fee waived',
    adjustmentReason: 'Adjustment reason',
    customerPaymentNote: 'Customer payment note'
  };

  const managerRoles = ['admin','manager','customer service'];

  function text(value){ return String(value ?? '').trim(); }
  function esc(value){
    try { return escapeHtml(String(value ?? '')); }
    catch { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  }
  function moneyV107(value){ try { return money(value); } catch { return '$' + Number(value || 0).toFixed(2); } }
  function numberV107(value, fallback = 0){ const n = Number(String(value ?? '').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? n : fallback; }
  function nowLabel(){ return new Date().toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }); }
  function canManagePayments(){ return managerRoles.includes(String(currentDashboardRole || '').toLowerCase()); }

  function readNote(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(notes || '').match(new RegExp(`(?:^|\\n)${safe}:\\s*([^\\n]+)`, 'i'));
    return match ? match[1].trim() : '';
  }
  function removeNote(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(notes || '')
      .replace(new RegExp(`(?:^|\\n)${safe}:\\s*[^\\n]*`, 'ig'), '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function upsertNote(notes, label, value){
    let out = removeNote(notes, label);
    if (text(value)) out = `${out ? `${out}\n` : ''}${label}: ${text(value)}`;
    return out.trim();
  }
  function notesOf(order = {}){ return order.specialNotes || order.admin_notes || ''; }

  function paymentMeta(order = {}){
    const notes = notesOf(order);
    const method = readNote(notes, LABELS.paymentMethod) || order.paymentMethod || order.paymentPreference || '';
    const status = readNote(notes, LABELS.paymentStatus) || order.paymentStatus || order.payment_status || 'unpaid';
    const received = Math.max(numberV107(order.depositPaid ?? order.deposit_amount, 0), numberV107(readNote(notes, LABELS.paymentReceived), 0));
    const discount = Math.max(0, numberV107(readNote(notes, LABELS.managerDiscount), 0));
    const finalRaw = readNote(notes, LABELS.finalTotal);
    const finalTotal = finalRaw === '' ? null : Math.max(0, numberV107(finalRaw, 0));
    const waived = /^yes|true|1|waived$/i.test(readNote(notes, LABELS.travelWaived));
    return {
      method,
      status,
      received,
      discount,
      finalTotal,
      waived,
      confirmedAt: readNote(notes, LABELS.paymentConfirmedAt),
      reason: readNote(notes, LABELS.adjustmentReason),
      customerNote: readNote(notes, LABELS.customerPaymentNote)
    };
  }

  // Make all totals shown after this patch honor manager price/payment adjustments.
  const originalCalculateOrderMoneyV107 = typeof calculateOrderMoney === 'function' ? calculateOrderMoney : null;
  if (originalCalculateOrderMoneyV107 && !window.__PHX_V107_CALC_WRAP__) {
    window.__PHX_V107_CALC_WRAP__ = true;
    calculateOrderMoney = function(order = {}){
      const base = originalCalculateOrderMoneyV107(order);
      const meta = paymentMeta(order);
      const originalTravel = Number(base.travelFee || 0);
      const travelFee = meta.waived ? 0 : originalTravel;
      let discount = Number(base.discount || 0) + Number(meta.discount || 0);
      let guestTotalBeforeDeposit = Number(base.guestTotalBeforeDeposit || 0);

      if (meta.waived) guestTotalBeforeDeposit = Math.max(0, guestTotalBeforeDeposit - originalTravel);
      if (meta.discount) guestTotalBeforeDeposit = Math.max(0, guestTotalBeforeDeposit - Number(meta.discount || 0));
      if (meta.finalTotal !== null) guestTotalBeforeDeposit = Number(meta.finalTotal || 0);

      const depositPaid = Math.max(Number(base.depositPaid || 0), Number(meta.received || 0));
      const guestTotalAfterDeposit = Math.max(0, guestTotalBeforeDeposit - depositPaid);
      const tip20 = Math.round(guestTotalBeforeDeposit * 0.20);
      const tip25 = Math.round(guestTotalBeforeDeposit * 0.25);
      const tip30 = Math.round(guestTotalBeforeDeposit * 0.30);
      const companyBalanceDue = Math.max(0, Number(base.companyBalanceDue || 0) - depositPaid - Number(meta.discount || 0));
      const chefKeepsBeforeTip = Number(base.chefGuestPayout || 0) + travelFee;
      const chefReturnToCompany = Math.max(0, companyBalanceDue - Number(base.chefGuestPayout || 0));
      return {
        ...base,
        travelFee,
        discount,
        managerDiscount: meta.discount,
        finalTotalOverride: meta.finalTotal,
        depositPaid,
        paymentReceived: depositPaid,
        paymentMethod: meta.method,
        paymentStatusOverride: meta.status,
        paymentConfirmedAt: meta.confirmedAt,
        paymentCustomerNote: meta.customerNote,
        paymentAdjustmentReason: meta.reason,
        guestTotalBeforeDeposit,
        guestTotalAfterDeposit,
        companyBalanceDue,
        chefKeepsBeforeTip,
        chefReturnToCompany,
        tip20,
        tip25,
        tip30
      };
    };
  }

  function allOrders(){
    const map = new Map();
    const add = (o) => { if (o && (o.id || o.booking_number)) map.set(String(o.id || o.booking_number), o); };
    try { (getStoredOrders?.() || []).forEach(add); } catch {}
    try { (Array.isArray(remoteOrdersCache) ? remoteOrdersCache : []).forEach(add); } catch {}
    try { (getDashboardOrders?.() || []).forEach(add); } catch {}
    try { Object.values(window.__PHX_LOOKUP_ORDER_CACHE__ || {}).forEach(add); } catch {}
    return [...map.values()];
  }
  function findOrder(orderId){
    const id = String(orderId || '').trim();
    return allOrders().find(o => String(o.id || o.booking_number) === id) || null;
  }
  function orderForCard(card){
    if (!card) return null;
    const body = card.textContent || '';
    return allOrders().find(o => (o.id || o.booking_number) && body.includes(String(o.id || o.booking_number))) || null;
  }

  function patchLocalOrder(orderId, patch = {}){
    const id = String(orderId || '');
    try { saveStoredOrders?.((getStoredOrders?.() || []).map(o => String(o.id) === id ? { ...o, ...patch } : o)); } catch {}
    try { if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.map(o => String(o.id || o.booking_number) === id ? { ...o, ...patch } : o); } catch {}
    try { if (window.__PHX_LOOKUP_ORDER_CACHE__?.[id]) window.__PHX_LOOKUP_ORDER_CACHE__[id] = { ...window.__PHX_LOOKUP_ORDER_CACHE__[id], ...patch }; } catch {}
  }

  async function updateBooking(orderId, dbPatch = {}, localPatch = {}){
    patchLocalOrder(orderId, localPatch);
    const client = initSupabaseClient?.();
    let remoteOk = false;
    if (client && supabaseSession) {
      try {
        const { error } = await client.from('bookings').update(dbPatch).eq('booking_number', orderId);
        if (error) console.warn('V107 payment update failed:', error);
        else remoteOk = true;
      } catch (error) { console.warn('V107 payment update threw:', error); }
    }
    if (remoteOk) { try { await loadDashboardDataFromSupabase?.(); } catch {} }
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    setTimeout(applyPaymentTools, 80);
    setTimeout(applyPaymentTools, 300);
    return remoteOk;
  }

  function paymentPanel(order = {}){
    const id = String(order.id || order.booking_number || '');
    const m = calculateOrderMoney?.(order) || {};
    const meta = paymentMeta(order);
    const currentTravel = meta.waived ? 0 : Number(order.travelFee || m.travelFee || 0);
    const finalTotal = meta.finalTotal === null ? '' : Number(meta.finalTotal || 0).toFixed(2);
    const received = Number(meta.received || 0).toFixed(2);
    const discount = Number(meta.discount || 0).toFixed(2);
    return `<section class="v107-payment-panel" data-v107-payment-panel="${esc(id)}" hidden>
      <header><div><h4>Payment / price adjustment</h4><p>Use this when you waive travel fee, discount a missed item, accept cash/Zelle, or manually override the final total.</p></div><span class="v107-balance-badge">Balance due ${moneyV107(m.guestTotalAfterDeposit || 0)}</span></header>
      <div class="v107-payment-grid">
        <label>Payment status<select data-v107-payment-status="${esc(id)}">
          ${['unpaid','transfer pending','deposit received','paid in full','cash deposit received','zelle deposit received','balance due','refunded / adjusted'].map(s => `<option value="${esc(s)}" ${String(meta.status).toLowerCase() === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select></label>
        <label>Payment method<select data-v107-payment-method="${esc(id)}">
          ${['','Zelle','Cash','Venmo','Cash App','Credit card','Check','Other transfer'].map(s => `<option value="${esc(s)}" ${String(meta.method) === s ? 'selected' : ''}>${s ? esc(s) : 'Not selected'}</option>`).join('')}
        </select></label>
        <label>Deposit / payment received<input type="number" min="0" step="0.01" data-v107-payment-received="${esc(id)}" value="${esc(received)}"></label>
        <label>Manager discount / credit<input type="number" min="0" step="0.01" data-v107-discount="${esc(id)}" value="${esc(discount)}"></label>
        <label>Final total override<input type="number" min="0" step="0.01" placeholder="Leave blank for calculated total" data-v107-final-total="${esc(id)}" value="${esc(finalTotal)}"></label>
        <label>Travel fee<input type="number" min="0" step="0.01" data-v107-travel-fee="${esc(id)}" value="${esc(Number(currentTravel || 0).toFixed(2))}"></label>
      </div>
      <label class="v107-check"><input type="checkbox" data-v107-waive-travel="${esc(id)}" ${meta.waived ? 'checked' : ''}> Waive travel fee / 免车费</label>
      <label>Reason / internal note<textarea rows="2" data-v107-reason="${esc(id)}" placeholder="Example: chef forgot sushi roll tray, manager approved $85 credit.">${esc(meta.reason || '')}</textarea></label>
      <label>Customer visible payment note<textarea rows="2" data-v107-customer-note="${esc(id)}" placeholder="Example: Deposit received by Zelle. Balance due at event.">${esc(meta.customerNote || '')}</textarea></label>
      <div class="v107-payment-summary"><b>Current estimate:</b> ${moneyV107(m.guestTotalBeforeDeposit || 0)} · <b>Received:</b> ${moneyV107(m.depositPaid || 0)} · <b>Balance:</b> ${moneyV107(m.guestTotalAfterDeposit || 0)}</div>
      <div class="v107-payment-actions"><button type="button" class="gold-btn-mini" data-v107-save-payment="${esc(id)}">Save payment / price</button><button type="button" data-v107-mark-deposit="${esc(id)}">Quick mark $200 deposit received</button><button type="button" data-print-guest="${esc(id)}">Print updated invoice</button></div>
    </section>`;
  }

  function injectIntoCard(card, order){
    if (!card || !order?.id || card.querySelector('.v107-payment-button')) return;
    const tools = card.querySelector('.v102-order-tools') || card.querySelector('.order-actions') || card;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v107-payment-button';
    btn.dataset.v107PaymentOpen = String(order.id || order.booking_number);
    btn.textContent = 'Payment / price';
    if (!canManagePayments()) btn.disabled = true;
    tools.appendChild(btn);
    const holder = document.createElement('div');
    holder.innerHTML = paymentPanel(order);
    card.appendChild(holder.firstElementChild);
  }

  function applyPaymentTools(){
    if (!canManagePayments()) return;
    const roots = [document.getElementById('orderList'), document.getElementById('calendarSummaryList'), document.getElementById('chefDispatch')].filter(Boolean);
    roots.forEach(root => root.querySelectorAll('article.order-card').forEach(card => {
      if (card.classList.contains('application-card') || card.classList.contains('feedback-card')) return;
      const order = orderForCard(card);
      if (order) injectIntoCard(card, order);
    }));
  }

  function togglePaymentPanel(orderId){
    const panel = document.querySelector(`[data-v107-payment-panel="${CSS.escape(String(orderId))}"]`);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      updatePaymentPreview(orderId);
      panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }
  }

  function paymentFieldOrderId(el){
    if (!el || !el.dataset) return '';
    return el.dataset.v107PaymentStatus
      || el.dataset.v107PaymentMethod
      || el.dataset.v107PaymentReceived
      || el.dataset.v107Discount
      || el.dataset.v107FinalTotal
      || el.dataset.v107TravelFee
      || el.dataset.v107WaiveTravel
      || el.dataset.v107Reason
      || el.dataset.v107CustomerNote
      || '';
  }

  function readPaymentDraft(orderId){
    const order = findOrder(orderId);
    const panel = document.querySelector(`[data-v107-payment-panel="${CSS.escape(String(orderId))}"]`);
    if (!order || !panel) return null;

    const base = originalCalculateOrderMoneyV107 ? originalCalculateOrderMoneyV107(order) : (calculateOrderMoney?.(order) || {});
    const originalTotal = Number(base.guestTotalBeforeDeposit || 0);
    const originalTravel = Number(base.travelFee || 0);
    const received = Math.max(0, numberV107(panel.querySelector(`[data-v107-payment-received]`)?.value, 0));
    const discount = Math.max(0, numberV107(panel.querySelector(`[data-v107-discount]`)?.value, 0));
    const finalRaw = text(panel.querySelector(`[data-v107-final-total]`)?.value || '');
    const travelFeeInput = Math.max(0, numberV107(panel.querySelector(`[data-v107-travel-fee]`)?.value, originalTravel));
    const waiveTravel = !!panel.querySelector(`[data-v107-waive-travel]`)?.checked;
    const draftTravel = waiveTravel ? 0 : travelFeeInput;

    let adjustedTotal = originalTotal - originalTravel + draftTravel - discount;
    if (finalRaw) adjustedTotal = Math.max(0, numberV107(finalRaw, 0));
    adjustedTotal = Math.max(0, adjustedTotal);
    const balance = Math.max(0, adjustedTotal - received);
    return { originalTotal, originalTravel, draftTravel, received, discount, finalRaw, finalOverride: finalRaw ? Number(finalRaw) : null, waiveTravel, adjustedTotal, balance };
  }

  function updatePaymentPreview(orderId){
    const panel = document.querySelector(`[data-v107-payment-panel="${CSS.escape(String(orderId))}"]`);
    if (!panel) return;
    const draft = readPaymentDraft(orderId);
    if (!draft) return;

    const badge = panel.querySelector('.v107-balance-badge');
    if (badge) {
      badge.textContent = `Balance due ${moneyV107(draft.balance)}`;
      badge.classList.toggle('is-paid', draft.balance <= 0);
    }

    const summary = panel.querySelector('.v107-payment-summary');
    if (summary) {
      const chips = [];
      chips.push(`<b>Adjusted total:</b> ${moneyV107(draft.adjustedTotal)}`);
      chips.push(`<b>Received:</b> ${moneyV107(draft.received)}`);
      chips.push(`<b>Balance:</b> ${moneyV107(draft.balance)}`);
      if (draft.discount > 0) chips.push(`<b>Discount:</b> -${moneyV107(draft.discount)}`);
      if (draft.waiveTravel) chips.push(`<b>Travel fee:</b> waived`);
      if (draft.finalOverride !== null) chips.push(`<b>Final override:</b> ${moneyV107(draft.finalOverride)}`);
      summary.innerHTML = chips.join(' · ');
      summary.classList.toggle('is-paid', draft.balance <= 0);
    }
  }

  async function savePayment(orderId, quickDeposit = false){
    const order = findOrder(orderId);
    if (!order) return alert('Order not found.');
    const panel = document.querySelector(`[data-v107-payment-panel="${CSS.escape(String(orderId))}"]`);
    if (!panel) return alert('Payment panel not found.');
    const baseMoney = calculateOrderMoney?.(order) || {};
    const status = panel.querySelector(`[data-v107-payment-status]`)?.value || 'unpaid';
    const method = panel.querySelector(`[data-v107-payment-method]`)?.value || '';
    const received = quickDeposit ? 200 : numberV107(panel.querySelector(`[data-v107-payment-received]`)?.value, 0);
    const discount = numberV107(panel.querySelector(`[data-v107-discount]`)?.value, 0);
    const finalRaw = text(panel.querySelector(`[data-v107-final-total]`)?.value || '');
    const travelFeeInput = numberV107(panel.querySelector(`[data-v107-travel-fee]`)?.value, Number(order.travelFee || baseMoney.travelFee || 0));
    const waiveTravel = !!panel.querySelector(`[data-v107-waive-travel]`)?.checked;
    const reason = text(panel.querySelector(`[data-v107-reason]`)?.value || '');
    let customerNote = text(panel.querySelector(`[data-v107-customer-note]`)?.value || '');
    const effectiveStatus = quickDeposit ? 'deposit received' : status;
    const effectiveMethod = quickDeposit && !method ? 'Zelle/Cash' : method;
    if (!customerNote && received > 0) {
      const methodText = effectiveMethod ? ` by ${effectiveMethod}` : '';
      customerNote = `Phoenix Hibachi confirmed ${moneyV107(received)} received${methodText}. Remaining balance will be confirmed on the invoice.`;
    }

    let notes = notesOf(order);
    notes = upsertNote(notes, LABELS.paymentStatus, effectiveStatus);
    notes = upsertNote(notes, LABELS.paymentMethod, effectiveMethod);
    notes = upsertNote(notes, LABELS.paymentReceived, received.toFixed(2));
    notes = upsertNote(notes, LABELS.paymentConfirmedAt, received > 0 ? nowLabel() : '');
    notes = upsertNote(notes, LABELS.managerDiscount, discount > 0 ? discount.toFixed(2) : '');
    notes = upsertNote(notes, LABELS.finalTotal, finalRaw);
    notes = upsertNote(notes, LABELS.travelWaived, waiveTravel ? 'yes' : '');
    notes = upsertNote(notes, LABELS.adjustmentReason, reason);
    notes = upsertNote(notes, LABELS.customerPaymentNote, customerNote);

    const newTravel = waiveTravel ? 0 : travelFeeInput;
    const localPatch = { specialNotes: notes, paymentStatus: effectiveStatus, depositPaid: received, travelFee: newTravel };
    const dbPatch = { admin_notes: notes, payment_status: effectiveStatus, deposit_amount: received, travel_fee: newTravel };
    const ok = await updateBooking(orderId, dbPatch, localPatch);
    alert(ok ? 'Payment / price saved. Customer lookup and invoice now show the updated payment status.' : 'Saved locally, but Supabase did not confirm. Check Admin update permission/RLS before relying on customer lookup.');
  }

  function handlePaymentPreviewEvent(event){
    const field = event.target?.closest?.('[data-v107-payment-status], [data-v107-payment-method], [data-v107-payment-received], [data-v107-discount], [data-v107-final-total], [data-v107-travel-fee], [data-v107-waive-travel], [data-v107-reason], [data-v107-customer-note]');
    const orderId = paymentFieldOrderId(field);
    if (orderId) updatePaymentPreview(orderId);
  }

  document.addEventListener('input', handlePaymentPreviewEvent, true);
  document.addEventListener('change', handlePaymentPreviewEvent, true);

  document.addEventListener('click', function(event){
    const openBtn = event.target.closest?.('[data-v107-payment-open]');
    if (openBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); togglePaymentPanel(openBtn.dataset.v107PaymentOpen); return false; }
    const saveBtn = event.target.closest?.('[data-v107-save-payment]');
    if (saveBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); saveBtn.disabled = true; savePayment(saveBtn.dataset.v107SavePayment, false).finally(()=>saveBtn.disabled=false); return false; }
    const depositBtn = event.target.closest?.('[data-v107-mark-deposit]');
    if (depositBtn) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); depositBtn.disabled = true; savePayment(depositBtn.dataset.v107MarkDeposit, true).finally(()=>depositBtn.disabled=false); return false; }
  }, true);

  // Customer lookup should show payment confirmation clearly.
  try {
    orderLookupResultHtml = function(order = {}){
      window.__PHX_LOOKUP_ORDER_CACHE__ = window.__PHX_LOOKUP_ORDER_CACHE__ || {};
      const id = String(order.id || order.booking_number || '').trim();
      if (id) window.__PHX_LOOKUP_ORDER_CACHE__[id] = order;
      const m = calculateOrderMoney?.(order) || {};
      const meta = paymentMeta(order);
      const st = (typeof humanOrderStatus === 'function' ? humanOrderStatus(order.status) : order.status) || 'Pending manager review';
      const statusClass = String(order.status || '').toLowerCase().match(/confirm|accept|assigned|complete|updated/) ? 'accepted' : '';
      let chef = { name: order.assignedChef || 'Pending chef assignment', phone: order.assignedChefPhone || '' };
      try { if (typeof confirmedChef === 'function') chef = confirmedChef(order); } catch {}
      return `<div class="lookup-card lookup-card-v103 lookup-card-v107">
        <header><strong>${esc(id || 'Phoenix order')}</strong><span class="tag ${statusClass}">${esc(st)}</span></header>
        <p><b>Status:</b> ${esc(st)}<br>
        <b>Date / Time:</b> ${esc(order.eventDate || order.event_date || '')} · ${esc(order.eventTime || order.event_time || '')}<br>
        <b>Guest:</b> ${esc(order.name || order.customer_name || 'Guest')} · ${esc(order.phone || order.customer_phone || '')}<br>
        <b>Address:</b> ${esc(order.address || 'Not entered')}<br>
        <b>Package:</b> ${esc(order.package || order.packageName || 'Classic')} · ${esc((typeof formatGuestNumber === 'function' ? formatGuestNumber(m.billableGuests) : m.billableGuests) || order.totalGuests || '')} billable guests<br>
        <b>Estimated total:</b> ${moneyV107(m.guestTotalBeforeDeposit || 0)}<br>
        <b>Received:</b> ${moneyV107(m.depositPaid || 0)} · <b>Balance:</b> ${moneyV107(m.guestTotalAfterDeposit || 0)}<br>
        <b>Chef:</b> ${esc(chef.phone ? `${chef.name} · ${chef.phone}` : chef.name)}<br>
        <b>Payment:</b> ${esc(meta.status || order.paymentStatus || order.payment_status || 'Not paid yet')}${meta.method ? ` · ${esc(meta.method)}` : ''}</p>
        ${meta.customerNote ? `<div class="lookup-payment-v107">${esc(meta.customerNote)}</div>` : ''}
        <div class="lookup-actions-v103"><button type="button" class="gold-btn-mini" data-print-lookup="${esc(id)}">Print invoice</button><a href="tel:13474719190">Call Phoenix</a></div>
        <small>Use this order number to check updates anytime.</small>
      </div>`;
    };
  } catch (error) { console.warn('V107 lookup payment patch skipped:', error); }

  // Add a compact adjustment summary to customer invoice printout.
  try {
    const previousGuestInvoiceHtmlV107 = guestInvoiceHtml;
    guestInvoiceHtml = function(order = {}){
      const html = previousGuestInvoiceHtmlV107(order);
      const m = calculateOrderMoney?.(order) || {};
      const meta = paymentMeta(order);
      const hasAdjustment = meta.method || meta.status || meta.discount || meta.finalTotal !== null || meta.waived || meta.received || meta.customerNote;
      if (!hasAdjustment || String(html).includes('invoice-payment-v107')) return html;
      const lines = [
        `<div><b>Payment status:</b><span>${esc(meta.status || order.paymentStatus || 'unpaid')}</span></div>`,
        meta.method ? `<div><b>Payment method:</b><span>${esc(meta.method)}</span></div>` : '',
        `<div><b>Payment received:</b><span>${moneyV107(m.depositPaid || 0)}</span></div>`,
        `<div><b>Balance due:</b><span>${moneyV107(m.guestTotalAfterDeposit || 0)}</span></div>`,
        meta.discount ? `<div><b>Manager discount:</b><span>-${moneyV107(meta.discount)}</span></div>` : '',
        meta.finalTotal !== null ? `<div><b>Manager final total:</b><span>${moneyV107(meta.finalTotal)}</span></div>` : '',
        meta.waived ? `<div><b>Travel fee:</b><span>Waived</span></div>` : '',
        meta.customerNote ? `<p>${esc(meta.customerNote)}</p>` : ''
      ].filter(Boolean).join('');
      return String(html).replace('<div class="invoice-footer-red">', `<div class="invoice-payment-v107">${lines}</div><div class="invoice-footer-red">`);
    };
  } catch (error) { console.warn('V107 invoice payment patch skipped:', error); }

  const oldRenderDashboardV107 = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (oldRenderDashboardV107 && !window.__PHX_V107_RENDER_WRAP__) {
    window.__PHX_V107_RENDER_WRAP__ = true;
    renderDashboard = function(role = currentDashboardRole || 'Admin'){
      const out = oldRenderDashboardV107(role);
      setTimeout(applyPaymentTools, 80);
      setTimeout(applyPaymentTools, 350);
      return out;
    };
  }
  try {
    const observer = new MutationObserver(() => { clearTimeout(window.__PHX_V107_APPLY_TIMER__); window.__PHX_V107_APPLY_TIMER__ = setTimeout(applyPaymentTools, 120); });
    observer.observe(document.body, { childList:true, subtree:true });
  } catch {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(applyPaymentTools, 500), { once:true });
  else setTimeout(applyPaymentTools, 500);
  window.PHX_V107_PAYMENT_META = paymentMeta;
  window.PHX_V107_APPLY_PAYMENT_TOOLS = applyPaymentTools;
})();

/* ======================================================================
   PHX V109 — Customer-visible schedule update confirmation
   - When staff modifies event date/time, the customer lookup / Member order
     details must show the latest schedule prominently.
   - No new Supabase SQL required. Uses existing event_date/event_time/status
     and the admin_notes lines written by V102.
   ====================================================================== */
(function initPHXV109CustomerScheduleVisibility(){
  if (window.__PHX_V109_SCHEDULE_VISIBILITY__) return;
  window.__PHX_V109_SCHEDULE_VISIBILITY__ = true;

  const SCHEDULE_LABELS = {
    modifiedAt: 'Phoenix modified at',
    modifiedTime: 'Phoenix modified time',
    customerVisibleNote: 'Customer visible note',
    chefName: 'Assigned chef',
    chefPhone: 'Assigned chef phone',
    paymentMethod: 'Payment method',
    paymentStatus: 'Payment status note',
    customerPaymentNote: 'Customer payment note'
  };

  function escV109(value){
    try { return escapeHtml(String(value ?? '')); }
    catch { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  }
  function moneyV109(value){ try { return money(value); } catch { return '$' + Number(value || 0).toFixed(2); } }
  function noteTextV109(order = {}){ return String(order.specialNotes || order.admin_notes || order.notes || ''); }
  function readNoteV109(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(notes || '').match(new RegExp(`(?:^|\\n)${safe}:\\s*([^\\n]+)`, 'i'));
    return match ? match[1].trim() : '';
  }
  function cleanDateV109(value){
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && typeof formatDbDateForUi === 'function') return formatDbDateForUi(raw) || raw;
      if (/^\d{4}-\d{2}-\d{2}/.test(raw) && typeof formatDbDateForUi === 'function') return formatDbDateForUi(raw.slice(0,10)) || raw.slice(0,10);
    } catch {}
    return raw;
  }
  function cleanTimeV109(value){
    const raw = String(value || '').trim();
    if (!raw) return '';
    try { if (typeof firstReadableTime === 'function') return firstReadableTime(raw) || raw; } catch {}
    return raw;
  }
  function scheduleLineV109(order = {}){
    const d = cleanDateV109(order.eventDate || order.event_date || '');
    const t = cleanTimeV109(order.eventTime || order.event_time || '');
    return [d, t].filter(Boolean).join(' · ') || 'Schedule pending';
  }
  function scheduleMetaV109(order = {}){
    const notes = noteTextV109(order);
    return {
      line: scheduleLineV109(order),
      modifiedAt: readNoteV109(notes, SCHEDULE_LABELS.modifiedAt),
      modifiedTime: readNoteV109(notes, SCHEDULE_LABELS.modifiedTime),
      customerNote: readNoteV109(notes, SCHEDULE_LABELS.customerVisibleNote),
      chefName: readNoteV109(notes, SCHEDULE_LABELS.chefName) || order.assignedChef || 'Pending chef assignment',
      chefPhone: readNoteV109(notes, SCHEDULE_LABELS.chefPhone) || order.assignedChefPhone || '',
      paymentStatus: readNoteV109(notes, SCHEDULE_LABELS.paymentStatus) || order.paymentStatus || order.payment_status || 'Not paid yet',
      paymentMethod: readNoteV109(notes, SCHEDULE_LABELS.paymentMethod) || order.paymentMethod || order.paymentPreference || '',
      paymentNote: readNoteV109(notes, SCHEDULE_LABELS.customerPaymentNote)
    };
  }
  function statusTextV109(order = {}){
    try { return humanOrderStatus(order.status) || order.status || 'Pending manager review'; }
    catch { return order.status || 'Pending manager review'; }
  }
  function statusClassV109(order = {}){
    return String(order.status || '').toLowerCase().match(/confirm|accept|assigned|complete|updated/) ? 'accepted' : '';
  }
  function scheduleBannerV109(order = {}){
    const meta = scheduleMetaV109(order);
    const changed = Boolean(meta.modifiedTime || meta.modifiedAt || String(order.status || '').toLowerCase().includes('time updated'));
    return `<div class="schedule-update-v109 ${changed ? 'changed' : ''}">
      <b>${changed ? 'Updated event time / 最新活动时间' : 'Scheduled event time / 活动时间'}</b>
      <strong>${escV109(meta.modifiedTime || meta.line)}</strong>
      ${meta.modifiedAt ? `<small>Last updated by Phoenix: ${escV109(meta.modifiedAt)}</small>` : ''}
      <small>${changed ? 'Phoenix customer service will call/text the guest when a manual schedule change is made.' : 'Use this order page to check the latest confirmed schedule.'}</small>
    </div>`;
  }

  function publicLookupHtmlV109(order = {}){
    window.__PHX_LOOKUP_ORDER_CACHE__ = window.__PHX_LOOKUP_ORDER_CACHE__ || {};
    const id = String(order.id || order.booking_number || '').trim();
    if (id) window.__PHX_LOOKUP_ORDER_CACHE__[id] = order;
    const m = (typeof calculateOrderMoney === 'function' ? calculateOrderMoney(order) : {}) || {};
    const meta = scheduleMetaV109(order);
    const chefLine = meta.chefPhone ? `${meta.chefName} · ${meta.chefPhone}` : meta.chefName;
    const paymentLine = `${meta.paymentStatus || 'Not paid yet'}${meta.paymentMethod ? ' · ' + meta.paymentMethod : ''}`;
    let billable = '';
    try { billable = (typeof formatGuestNumber === 'function' ? formatGuestNumber(m.billableGuests) : m.billableGuests) || order.totalGuests || ''; } catch { billable = order.totalGuests || ''; }
    return `<div class="lookup-card lookup-card-v103 lookup-card-v107 lookup-card-v109">
      <header><strong>${escV109(id || 'Phoenix order')}</strong><span class="tag ${statusClassV109(order)}">${escV109(statusTextV109(order))}</span></header>
      ${scheduleBannerV109(order)}
      <p><b>Status:</b> ${escV109(statusTextV109(order))}<br>
      <b>Date / Time:</b> ${escV109(meta.line)}<br>
      <b>Guest:</b> ${escV109(order.name || order.customer_name || 'Guest')} · ${escV109(order.phone || order.customer_phone || '')}<br>
      <b>Address:</b> ${escV109(order.address || 'Not entered')}<br>
      <b>Package:</b> ${escV109(order.package || order.packageName || 'Classic')} · ${escV109(billable)} billable guests<br>
      <b>Estimated total:</b> ${moneyV109(m.guestTotalBeforeDeposit || order.total || 0)}<br>
      <b>Received:</b> ${moneyV109(m.depositPaid || order.deposit_amount || 0)} · <b>Balance:</b> ${moneyV109(m.guestTotalAfterDeposit || 0)}<br>
      <b>Chef:</b> ${escV109(chefLine)}<br>
      <b>Payment:</b> ${escV109(paymentLine)}</p>
      ${meta.customerNote ? `<div class="lookup-note-v109">${escV109(meta.customerNote)}</div>` : ''}
      ${meta.paymentNote ? `<div class="lookup-payment-v107">${escV109(meta.paymentNote)}</div>` : ''}
      <div class="lookup-actions-v103"><button type="button" class="gold-btn-mini" data-print-lookup="${escV109(id)}">Print invoice</button><a href="tel:13474719190">Call Phoenix</a></div>
      <small>Use this order number to check updates anytime. The schedule shown above is the latest Phoenix Hibachi record.</small>
    </div>`;
  }

  try { orderLookupResultHtml = publicLookupHtmlV109; } catch (error) { console.warn('V109 lookup override skipped:', error); }

  // Member dashboard order card: inject a visible schedule banner above Event details.
  try {
    const previousCustomerOrderCardV109 = typeof customerOrderCard === 'function' ? customerOrderCard : null;
    if (previousCustomerOrderCardV109 && !window.__PHX_V109_MEMBER_CARD_WRAP__) {
      window.__PHX_V109_MEMBER_CARD_WRAP__ = true;
      customerOrderCard = function(order = {}){
        const html = previousCustomerOrderCardV109(order);
        if (String(html).includes('schedule-update-v109')) return html;
        return String(html).replace('<div class="member-order-grid-v96">', `${scheduleBannerV109(order)}<div class="member-order-grid-v96">`);
      };
    }
  } catch (error) { console.warn('V109 member card wrap skipped:', error); }

  // Add a small customer-service reminder under the manager modify-time tool.
  function addStaffScheduleReminderV109(){
    document.querySelectorAll('.v102-order-panel').forEach(panel => {
      if (panel.querySelector('.v109-staff-schedule-reminder')) return;
      const timeSection = [...panel.querySelectorAll('section')].find(section => /modify event date/i.test(section.textContent || ''));
      if (!timeSection) return;
      timeSection.insertAdjacentHTML('beforeend', '<div class="v109-staff-schedule-reminder"><b>Customer-facing update:</b> After saving, this exact date/time appears on the customer order details page. Customer service should call/text the guest after a manual change.</div>');
    });
  }
  try {
    const observer = new MutationObserver(() => { clearTimeout(window.__PHX_V109_REMINDER_TIMER__); window.__PHX_V109_REMINDER_TIMER__ = setTimeout(addStaffScheduleReminderV109, 80); });
    observer.observe(document.body, { childList:true, subtree:true });
  } catch {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(addStaffScheduleReminderV109, 300), { once:true });
  else setTimeout(addStaffScheduleReminderV109, 300);
})();

/* ======================================================================
   PHX V113 — Party start time label + customer notification workflow
   - Staff manual time changes now represent the exact party start time.
   - The exact time is written into admin_notes and event_time so Admin,
     Chef, Member, and public lookup all show the same latest Phoenix record.
   - Customer lookup shows deposit and schedule-change policy notices.
   ====================================================================== */
(function initPHXV110ExactScheduleSync(){
  if (window.__PHX_V110_EXACT_SCHEDULE_SYNC__) return;
  window.__PHX_V110_EXACT_SCHEDULE_SYNC__ = true;

  const LABELS = {
    exactArrivalTime: 'Phoenix party start time',
    exactArrivalDateTime: 'Phoenix party start datetime',
    modifiedAt: 'Phoenix modified at',
    modifiedTime: 'Phoenix modified time',
    customerVisibleNote: 'Customer visible note',
    preferredWindow: 'Preferred arrival window',
    chefName: 'Assigned chef',
    chefPhone: 'Assigned chef phone',
    paymentMethod: 'Payment method',
    paymentStatus: 'Payment status note',
    customerPaymentNote: 'Customer payment note',
    paymentReceived: 'Payment received'
  };

  function esc(value){
    try { return escapeHtml(String(value ?? '')); }
    catch { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  }
  function noteText(order = {}){ return String(order.specialNotes || order.admin_notes || order.notes || ''); }
  function readNote(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(notes || '').match(new RegExp(`(?:^|\\n)${safe}:\\s*([^\\n]+)`, 'i'));
    return match ? match[1].trim() : '';
  }
  function removeNote(notes, label){
    const safe = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(notes || '')
      .replace(new RegExp(`(?:^|\\n)${safe}:\\s*[^\\n]*`, 'ig'), '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function upsertNote(notes, label, value){
    let out = removeNote(notes, label);
    const v = String(value ?? '').trim();
    if (v) out = `${out ? `${out}\n` : ''}${label}: ${v}`;
    return out.trim();
  }
  function moneySafe(value){ try { return money(value); } catch { return '$' + Number(value || 0).toFixed(2); } }
  function nowLabel(){ return new Date().toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }); }
  function uiDate(dateValue){
    const raw = String(dateValue || '').trim();
    if (!raw) return '';
    try {
      if (/^\d{4}-\d{2}-\d{2}/.test(raw) && typeof formatDbDateForUi === 'function') return formatDbDateForUi(raw.slice(0,10)) || raw.slice(0,10);
    } catch {}
    return raw;
  }
  function two(n){ return String(n).padStart(2, '0'); }
  function time24FromDisplay(value){
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{1,2}:\d{2}$/.test(raw)) return raw;
    const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!match) return '';
    let h = Number(match[1]);
    const m = Number(match[2] || 0);
    const ap = match[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${two(h)}:${two(m)}`;
  }
  function displayFrom24(value){
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return raw;
    let h = Number(match[1]);
    const m = Number(match[2]);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${two(m)} ${ap}`;
  }
  function timeWheelParts(value){
    const h24 = time24FromDisplay(value) || '11:00';
    const match = h24.match(/^(\d{1,2}):(\d{2})/);
    let h = match ? Number(match[1]) : 11;
    const minute = match ? two(Number(match[2])) : '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = String(h % 12 || 12);
    return { hour, minute, ampm };
  }
  function optionList(values, selected){
    return values.map(v => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }
  function hourOptions(selected){
    return optionList(Array.from({ length: 12 }, (_, i) => String(i + 1)), selected);
  }
  function minuteOptions(selected){
    return optionList(Array.from({ length: 60 }, (_, i) => two(i)), selected);
  }
  function ampmOptions(selected){
    return optionList(['AM', 'PM'], selected || 'AM');
  }
  function time24FromWheel(hour, minute, ampm){
    let h = Number(hour || 0);
    const m = Number(minute || 0);
    const ap = String(ampm || 'AM').toUpperCase();
    if (!h || h < 1 || h > 12 || m < 0 || m > 59) return '';
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${two(h)}:${two(m)}`;
  }
  function firstTimeDisplay(value){
    const notes = String(value || '');
    const exact = readNote(notes, LABELS.exactArrivalTime);
    if (exact) return exact;
    const raw = String(value || '').trim();
    const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!match) return raw || '';
    return `${Number(match[1])}:${match[2] || '00'} ${match[3].toUpperCase()}`;
  }
  function exactTimeForOrder(order = {}){
    const notes = noteText(order);
    const exact = readNote(notes, LABELS.exactArrivalTime);
    if (exact) return exact;
    const modified = readNote(notes, LABELS.modifiedTime);
    const modMatch = modified.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (modMatch) return `${Number(modMatch[1])}:${modMatch[2] || '00'} ${modMatch[3].toUpperCase()}`;
    return firstTimeDisplay(order.eventTime || order.event_time || '');
  }
  function exactScheduleLine(order = {}){
    const notes = noteText(order);
    const exactDateTime = readNote(notes, LABELS.exactArrivalDateTime);
    if (exactDateTime) return exactDateTime;
    const modified = readNote(notes, LABELS.modifiedTime);
    if (modified) return modified;
    const d = uiDate(order.eventDate || order.event_date || '');
    const t = exactTimeForOrder(order);
    return [d, t].filter(Boolean).join(' · ') || 'Schedule pending';
  }
  function dateInputValue(order = {}){
    const raw = order.event_date || order.eventDate || '';
    if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) return String(raw).slice(0,10);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  }
  function orderIdOfPanel(panel){
    if (!panel) return '';
    const el = panel.querySelector('[data-v102-date], [data-v101-date], [data-v110-exact-time]');
    return el?.dataset?.v102Date || el?.dataset?.v101Date || el?.dataset?.v110ExactTime || panel.getAttribute('data-v102-panel') || '';
  }
  function allOrders(){
    const map = new Map();
    const add = (o) => { const id = String(o?.id || o?.booking_number || '').trim(); if (id) map.set(id, o); };
    try { (getStoredOrders?.() || []).forEach(add); } catch {}
    try { (Array.isArray(remoteOrdersCache) ? remoteOrdersCache : []).forEach(add); } catch {}
    try { (getDashboardOrders?.() || []).forEach(add); } catch {}
    return [...map.values()];
  }
  function findOrder(id){
    const key = String(id || '').trim();
    return allOrders().find(o => String(o.id || o.booking_number) === key) || null;
  }
  function patchLocal(orderId, patch){
    const id = String(orderId || '');
    try { saveStoredOrders?.((getStoredOrders?.() || []).map(o => String(o.id || o.booking_number) === id ? { ...o, ...patch } : o)); } catch {}
    try { if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.map(o => String(o.id || o.booking_number) === id ? { ...o, ...patch } : o); } catch {}
    try { if (window.__PHX_LOOKUP_ORDER_CACHE__?.[id]) window.__PHX_LOOKUP_ORDER_CACHE__[id] = { ...window.__PHX_LOOKUP_ORDER_CACHE__[id], ...patch }; } catch {}
  }
  async function updateRemote(orderId, dbPatch, localPatch){
    patchLocal(orderId, localPatch);
    let ok = false;
    const client = initSupabaseClient?.();
    if (client && supabaseSession) {
      try {
        const { error } = await client.from('bookings').update(dbPatch).eq('booking_number', orderId);
        if (error) console.warn('V110 exact schedule update failed:', error);
        else ok = true;
      } catch (error) { console.warn('V110 exact schedule update threw:', error); }
    }
    if (ok) {
      try { await loadDashboardDataFromSupabase?.(); } catch {}
    }
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    try { if (!calendarSummaryPanel?.hidden) renderCalendarSummary?.(); } catch {}
    setTimeout(enhancePanels, 120);
    setTimeout(enhanceCards, 180);
    return ok;
  }

  // Make Supabase row conversion prefer the latest manual Phoenix time instead of the old booking window.
  try {
    const oldPreferred = typeof preferredTimeFromNotes === 'function' ? preferredTimeFromNotes : null;
    preferredTimeFromNotes = function(notes, fallback = ''){
      const exact = readNote(notes, LABELS.exactArrivalTime);
      if (exact) return exact;
      const modified = readNote(notes, LABELS.modifiedTime);
      const match = String(modified || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
      if (match) return `${Number(match[1])}:${match[2] || '00'} ${match[3].toUpperCase()}`;
      return oldPreferred ? oldPreferred(notes, fallback) : (fallback || '');
    };
  } catch {}

  function enhancePanels(){
    document.querySelectorAll('.v102-order-panel, .v101-order-panel').forEach(panel => {
      const orderId = orderIdOfPanel(panel);
      if (!orderId || panel.querySelector('[data-v110-exact-time]')) return;
      const order = findOrder(orderId) || {};
      const section = [...panel.querySelectorAll('section')].find(s => /modify|date|time/i.test(s.textContent || '')) || panel;
      const current24 = time24FromDisplay(exactTimeForOrder(order)) || time24FromDisplay(order.eventTime || order.event_time || '') || '11:00';
      const parts = timeWheelParts(current24);
      section.querySelectorAll(`[data-v102-time="${CSS.escape(String(orderId))}"], [data-v101-time="${CSS.escape(String(orderId))}"]`).forEach(sel => {
        sel.disabled = true;
        const label = sel.closest('label');
        if (label) label.hidden = true;
      });
      const insert = `<div class="v111-time-wheel" data-v111-time-wheel="${esc(orderId)}">
          <span class="v111-time-title">Party start time / 派对开始时间</span>
          <label>Hour<select data-v111-hour="${esc(orderId)}">${hourOptions(parts.hour)}</select></label>
          <label>Minute<select data-v111-minute="${esc(orderId)}">${minuteOptions(parts.minute)}</select></label>
          <label>AM/PM<select data-v111-ampm="${esc(orderId)}">${ampmOptions(parts.ampm)}</select></label>
          <input type="hidden" data-v110-exact-time="${esc(orderId)}" value="${esc(current24)}">
        </div>
        <div class="v110-schedule-policy"><b>Customer notice:</b> the party start time saved here is the latest Phoenix record shown to the customer, chef, and staff. Customer service should call/text the guest. Time changes must be manually confirmed through Phoenix and completed at least 48 hours before the party whenever possible.</div>`;
      const row = section.querySelector('.v102-row, .v101-row') || section;
      row.insertAdjacentHTML('beforeend', insert);
      panel.querySelectorAll('[data-v102-save-time], [data-v101-save-time]').forEach(btn => {
        const id = btn.dataset.v102SaveTime || btn.dataset.v101SaveTime || orderId;
        btn.removeAttribute('data-v102-save-time');
        btn.removeAttribute('data-v101-save-time');
        btn.setAttribute('data-v110-save-time', id);
        btn.textContent = 'Save party start time';
      });
    });
  }

  function enhanceCards(){
    document.querySelectorAll('[data-v102-order-card], [data-v101-order-card], article.order-card').forEach(card => {
      const order = card.getAttribute('data-v102-order-card') ? findOrder(card.getAttribute('data-v102-order-card'))
        : card.getAttribute('data-v101-order-card') ? findOrder(card.getAttribute('data-v101-order-card'))
        : allOrders().find(o => String(card.textContent || '').includes(String(o.id || o.booking_number)));
      if (!order) return;
      const line = exactScheduleLine(order);
      const existing = card.querySelector('.v110-card-schedule');
      const html = `<div class="v110-card-schedule"><b>Latest party start time:</b> ${esc(line)}<small>Shown consistently to Admin, Chef, Member, and public order lookup.</small></div>`;
      if (existing) existing.outerHTML = html;
      else {
        const tools = card.querySelector('.v102-order-tools, .order-actions-v101, .order-actions');
        if (tools) tools.insertAdjacentHTML('beforebegin', html);
      }
    });
  }

  async function saveExactTime(orderId){
    const order = findOrder(orderId);
    if (!order) { alert('Order not found.'); return; }
    const panel = document.querySelector(`[data-v102-panel="${CSS.escape(String(orderId))}"], [data-v101-panel="${CSS.escape(String(orderId))}"]`) || document;
    const dateValue = panel.querySelector(`[data-v102-date="${CSS.escape(String(orderId))}"], [data-v101-date="${CSS.escape(String(orderId))}"]`)?.value || dateInputValue(order);
    const hourVal = panel.querySelector(`[data-v111-hour="${CSS.escape(String(orderId))}"]`)?.value || '';
    const minuteVal = panel.querySelector(`[data-v111-minute="${CSS.escape(String(orderId))}"]`)?.value || '';
    const ampmVal = panel.querySelector(`[data-v111-ampm="${CSS.escape(String(orderId))}"]`)?.value || '';
    const wheel24 = hourVal && minuteVal && ampmVal ? time24FromWheel(hourVal, minuteVal, ampmVal) : '';
    const exact24 = wheel24 || panel.querySelector(`[data-v110-exact-time="${CSS.escape(String(orderId))}"]`)?.value || '';
    const fallbackWindow = panel.querySelector(`[data-v102-time="${CSS.escape(String(orderId))}"], [data-v101-time="${CSS.escape(String(orderId))}"]`)?.value || order.eventTime || order.event_time || '';
    const displayTime = exact24 ? displayFrom24(exact24) : firstTimeDisplay(fallbackWindow);
    if (!dateValue || !displayTime) { alert('Choose a valid date and party start time.'); return; }
    const displayDate = uiDate(dateValue);
    const displayLine = `${displayDate} · ${displayTime}`;
    let notes = noteText(order);
    notes = upsertNote(notes, LABELS.exactArrivalTime, displayTime);
    notes = upsertNote(notes, LABELS.exactArrivalDateTime, displayLine);
    notes = upsertNote(notes, LABELS.modifiedAt, nowLabel());
    notes = upsertNote(notes, LABELS.modifiedTime, displayLine);
    notes = upsertNote(notes, LABELS.preferredWindow, displayTime);
    notes = upsertNote(notes, LABELS.customerVisibleNote, `Phoenix Hibachi confirmed the party start time as ${displayLine}. Customer service will call/text to confirm this manual schedule update.`);
    const currentStatus = String(order.status || '').toLowerCase();
    const status = currentStatus.includes('confirm') || currentStatus.includes('accept') ? 'Confirmed - party start time updated' : 'Party start time updated';
    const dbTime = exact24 ? `${exact24}:00` : (time24FromDisplay(displayTime) ? `${time24FromDisplay(displayTime)}:00` : displayTime);
    const localPatch = { eventDate: displayDate, event_date: dateValue, eventTime: displayTime, event_time: dbTime, status, specialNotes: notes, admin_notes: notes };
    const dbPatch = { event_date: dateValue, event_time: dbTime, status, admin_notes: notes };
    const ok = await updateRemote(orderId, dbPatch, localPatch);
    alert(ok ? 'Exact event time saved. Customer, chef, and staff views now use the same latest Phoenix time.' : 'Exact time saved locally. Supabase did not confirm; check Admin update permission before relying on customer lookup.');
  }

  document.addEventListener('change', function(event){
    const control = event.target.closest?.('[data-v111-hour], [data-v111-minute], [data-v111-ampm]');
    if (!control) return;
    const orderId = control.dataset.v111Hour || control.dataset.v111Minute || control.dataset.v111Ampm || '';
    const panel = document.querySelector(`[data-v102-panel="${CSS.escape(String(orderId))}"], [data-v101-panel="${CSS.escape(String(orderId))}"]`) || document;
    const hourVal = panel.querySelector(`[data-v111-hour="${CSS.escape(String(orderId))}"]`)?.value || '';
    const minuteVal = panel.querySelector(`[data-v111-minute="${CSS.escape(String(orderId))}"]`)?.value || '';
    const ampmVal = panel.querySelector(`[data-v111-ampm="${CSS.escape(String(orderId))}"]`)?.value || '';
    const hidden = panel.querySelector(`[data-v110-exact-time="${CSS.escape(String(orderId))}"]`);
    const value = time24FromWheel(hourVal, minuteVal, ampmVal);
    if (hidden && value) hidden.value = value;
  }, true);

  document.addEventListener('click', function(event){
    const btn = event.target.closest?.('[data-v110-save-time]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    btn.disabled = true;
    saveExactTime(btn.dataset.v110SaveTime).finally(() => { btn.disabled = false; });
    return false;
  }, true);

  function scheduleBanner(order = {}){
    const line = exactScheduleLine(order);
    const modifiedAt = readNote(noteText(order), LABELS.modifiedAt);
    return `<div class="schedule-update-v109 schedule-update-v110 changed"><b>Party start time / 派对开始时间</b><strong>${esc(line)}</strong>${modifiedAt ? `<small>Last updated by Phoenix: ${esc(modifiedAt)}</small>` : ''}<small>This is the latest Phoenix Hibachi schedule record. Customer service will call/text when a manual schedule change is made.</small></div>`;
  }
  function publicChef(order = {}){
    const notes = noteText(order);
    const name = readNote(notes, LABELS.chefName) || order.assignedChef || 'Pending chef assignment';
    const phone = readNote(notes, LABELS.chefPhone) || order.assignedChefPhone || '';
    return phone ? `${name} · ${phone}` : name;
  }
  function statusText(order = {}){ try { return humanOrderStatus(order.status) || order.status || 'Pending manager review'; } catch { return order.status || 'Pending manager review'; } }
  function paymentMeta(order = {}){
    const notes = noteText(order);
    const m = (typeof calculateOrderMoney === 'function' ? calculateOrderMoney(order) : {}) || {};
    return {
      status: readNote(notes, LABELS.paymentStatus) || order.paymentStatus || order.payment_status || 'Not paid yet',
      method: readNote(notes, LABELS.paymentMethod) || order.paymentMethod || order.paymentPreference || '',
      note: readNote(notes, LABELS.customerPaymentNote),
      received: Math.max(Number(order.depositPaid || order.deposit_amount || 0), Number(readNote(notes, LABELS.paymentReceived) || 0)),
      balance: Number(m.guestTotalAfterDeposit || 0),
      total: Number(m.guestTotalBeforeDeposit || order.total || 0)
    };
  }
  function publicLookupHtml(order = {}){
    window.__PHX_LOOKUP_ORDER_CACHE__ = window.__PHX_LOOKUP_ORDER_CACHE__ || {};
    const id = String(order.id || order.booking_number || '').trim();
    if (id) window.__PHX_LOOKUP_ORDER_CACHE__[id] = order;
    const m = (typeof calculateOrderMoney === 'function' ? calculateOrderMoney(order) : {}) || {};
    const pay = paymentMeta(order);
    let billable = '';
    try { billable = (typeof formatGuestNumber === 'function' ? formatGuestNumber(m.billableGuests) : m.billableGuests) || order.totalGuests || ''; } catch { billable = order.totalGuests || ''; }
    const paymentLine = `${pay.status || 'Not paid yet'}${pay.method ? ' · ' + pay.method : ''}`;
    return `<div class="lookup-card lookup-card-v103 lookup-card-v107 lookup-card-v109 lookup-card-v110">
      <header><strong>${esc(id || 'Phoenix order')}</strong><span class="tag ${String(order.status || '').toLowerCase().match(/confirm|accept|assigned|complete|updated/) ? 'accepted' : ''}">${esc(statusText(order))}</span></header>
      ${scheduleBanner(order)}
      <p><b>Status:</b> ${esc(statusText(order))}<br>
      <b>Date / Time:</b> ${esc(exactScheduleLine(order))}<br>
      <b>Guest:</b> ${esc(order.name || order.customer_name || 'Guest')} · ${esc(order.phone || order.customer_phone || '')}<br>
      <b>Address:</b> ${esc(order.address || 'Not entered')}<br>
      <b>Package:</b> ${esc(order.package || order.packageName || 'Classic')} · ${esc(billable)} billable guests<br>
      <b>Estimated total:</b> ${moneySafe(pay.total)}<br>
      <b>Received:</b> ${moneySafe(pay.received)} · <b>Balance:</b> ${moneySafe(pay.balance)}<br>
      <b>Chef:</b> ${esc(publicChef(order))}<br>
      <b>Payment:</b> ${esc(paymentLine)}</p>
      <div class="lookup-policy-v110"><b>Payment notice:</b> Orders may not be fully confirmed until Phoenix Hibachi confirms the deposit/payment has been received. If you paid by transfer, please allow customer service to verify it manually.</div>
      <div class="lookup-policy-v110"><b>Schedule change policy:</b> Event time changes must be handled by Phoenix customer service and manually confirmed. Please request changes at least 48 hours before the party whenever possible.</div>
      ${pay.note ? `<div class="lookup-payment-v107">${esc(pay.note)}</div>` : ''}
      <div class="lookup-actions-v103"><button type="button" class="gold-btn-mini" data-print-lookup="${esc(id)}">Print invoice</button><a href="tel:13474719190">Call Phoenix</a></div>
      <small>Use this order number to check updates anytime. This page shows the latest Phoenix Hibachi record.</small>
    </div>`;
  }
  try { orderLookupResultHtml = publicLookupHtml; } catch {}

  // Member dashboard uses the same exact schedule language.
  try {
    const previousCustomerCard = typeof customerOrderCard === 'function' ? customerOrderCard : null;
    if (previousCustomerCard && !window.__PHX_V110_MEMBER_CARD_WRAP__) {
      window.__PHX_V110_MEMBER_CARD_WRAP__ = true;
      customerOrderCard = function(order = {}){
        let html = previousCustomerCard(order);
        html = String(html).replace(/<p><b>Event date \/ time<\/b><br>[\s\S]*?<\/p>/, `<p><b>Party start time</b><br>${esc(exactScheduleLine(order))}<br><small>Latest Phoenix Hibachi record</small></p>`);
        if (!html.includes('lookup-policy-v110')) {
          html = html.replace('</div>\n      <div class="order-actions">', `<div class="lookup-policy-v110"><b>Payment notice:</b> Orders may not be fully confirmed until the deposit/payment is verified.</div><div class="lookup-policy-v110"><b>Schedule changes:</b> Call/text Phoenix customer service. Changes should be requested at least 48 hours before the event whenever possible.</div></div>\n      <div class="order-actions">`);
        }
        return html;
      };
    }
  } catch (error) { console.warn('V110 member card patch skipped:', error); }

  // Keep new panels/cards enhanced after dashboard re-renders.
  try {
    const observer = new MutationObserver(() => {
      clearTimeout(window.__PHX_V110_ENHANCE_TIMER__);
      window.__PHX_V110_ENHANCE_TIMER__ = setTimeout(() => { enhancePanels(); enhanceCards(); }, 120);
    });
    observer.observe(document.body, { childList:true, subtree:true });
  } catch {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => { enhancePanels(); enhanceCards(); }, 500), { once:true });
  else setTimeout(() => { enhancePanels(); enhanceCards(); }, 500);
  window.PHX_V110_EXACT_SCHEDULE_LINE = exactScheduleLine;
})();

/*
   PHX V114 — Flexible route plan logic
   - Route plan is a manager review tool, not a forced final route.
   - Default route order is chronological by party start time.
   - Admin/Manager can manually move a stop earlier/later within the same chef chain.
   - Manual route order is stored in admin_notes/specialNotes so it survives refresh without new SQL.
*/
(function(){
  if (window.__PHX_V114_ROUTE_LOGIC__) return;
  window.__PHX_V114_ROUTE_LOGIC__ = true;

  const ROUTE_SEQ_LABEL = 'Phoenix route sequence';
  const ROUTE_OVERRIDE_LABEL = 'Phoenix route override';
  const ROUTE_UPDATED_LABEL = 'Phoenix route updated';

  const esc = (value) => {
    try { return escapeHtml(value); } catch { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  };
  const cleanId = (order = {}) => String(order.id || order.booking_number || '').trim();
  const notesOf = (order = {}) => String(order.specialNotes || order.admin_notes || order.notes || '');
  const nowLabel = () => new Date().toLocaleString([], { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

  function readNoteLine(notes = '', label = ''){
    const target = String(label).toLowerCase();
    const line = String(notes || '').split(/\r?\n/).find(row => row.toLowerCase().startsWith(target + ':'));
    return line ? line.slice(line.indexOf(':') + 1).trim() : '';
  }
  function removeNoteLine(notes = '', label = ''){
    const target = String(label).toLowerCase();
    return String(notes || '').split(/\r?\n/).filter(row => !row.toLowerCase().startsWith(target + ':')).join('\n').trim();
  }
  function upsertNoteLine(notes = '', label = '', value = ''){
    let next = removeNoteLine(notes, label);
    if (String(value ?? '').trim()) next = `${next ? next + '\n' : ''}${label}: ${String(value).trim()}`;
    return next.trim();
  }
  function routeSeq(order = {}){
    const raw = readNoteLine(notesOf(order), ROUTE_SEQ_LABEL);
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  function hasManualRoute(order = {}){
    return routeSeq(order) !== null || /manual/i.test(readNoteLine(notesOf(order), ROUTE_OVERRIDE_LABEL));
  }
  function orderTimeValue(order = {}){
    try {
      const dt = parseOrderDateTime(order);
      if (dt && Number.isFinite(dt.getTime())) return dt.getTime();
    } catch {}
    return 9999999999999;
  }
  function routeSortValue(order = {}){
    const seq = routeSeq(order);
    if (seq !== null) return seq;
    return orderTimeValue(order);
  }
  function routeComparator(a, b){
    const av = routeSortValue(a), bv = routeSortValue(b);
    if (av !== bv) return av - bv;
    return orderTimeValue(a) - orderTimeValue(b);
  }
  function chefKey(order = {}){
    return String(order.assignedChefId || order.assigned_chef_id || order.assignedChef || order.assigned_chef || 'unassigned').trim() || 'unassigned';
  }
  function chefLabel(order = {}){
    const key = chefKey(order);
    return order.assignedChef || order.assigned_chef || (Array.isArray(CHEFS) ? CHEFS.find(c => c.id === key)?.name : '') || 'Needs chef';
  }
  function sameDate(order, key){
    try { return normalizeDateKey(order) === key; } catch { return false; }
  }
  function sameChef(a, b){ return chefKey(a) === chefKey(b); }

  const previousOrdersForRouteDate = typeof ordersForRouteDate === 'function' ? ordersForRouteDate : null;
  window.PHX_V114_ROUTE_COMPARE = routeComparator;

  try {
    ordersForRouteDate = function(orders = [], dateKey = ''){
      const filtered = [...orders].filter(o => !dateKey || sameDate(o, dateKey));
      const sorted = filtered.sort(routeComparator);
      return sorted.map((order, index) => ({ ...order, routeLabel: routeLabelForIndex(index) }));
    };
  } catch (error) { console.warn('V114 could not override ordersForRouteDate:', error); }

  try {
    routeGroupsForRows = function(rows = []){
      const groups = new Map();
      rows.forEach(order => {
        const key = chefKey(order);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(order);
      });
      return [...groups.entries()].map(([key, group], idx) => ({
        key,
        label: chefLabel(group[0] || {}),
        colorClass: routeColorClass(key, idx),
        rows: group.sort(routeComparator),
        manual: group.some(hasManualRoute)
      }));
    };
  } catch (error) { console.warn('V114 could not override routeGroupsForRows:', error); }

  async function patchRouteNotes(orderId, notes){
    const id = String(orderId || '').trim();
    const localPatch = { specialNotes: notes, admin_notes: notes };
    try {
      const current = getStoredOrders?.() || [];
      saveStoredOrders?.(current.map(o => cleanId(o) === id ? { ...o, ...localPatch } : o));
    } catch {}
    try {
      if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.map(o => cleanId(o) === id ? { ...o, ...localPatch } : o);
    } catch {}

    let remoteOk = false;
    try {
      const client = initSupabaseClient?.();
      if (client && supabaseSession) {
        const { error } = await client.from('bookings').update({ admin_notes: notes }).eq('booking_number', id);
        if (error) console.warn('V114 route note update failed:', error);
        else remoteOk = true;
      }
    } catch (error) { console.warn('V114 route note update threw:', error); }
    return remoteOk;
  }

  function routeGroupForOrder(orderId){
    const id = String(orderId || '').trim();
    const orders = getDashboardOrders?.() || [];
    const target = orders.find(o => cleanId(o) === id);
    if (!target) return { target:null, rows:[] };
    const key = (() => { try { return normalizeDateKey(target); } catch { return ''; } })();
    const rows = orders.filter(o => sameDate(o, key) && sameChef(o, target)).sort(routeComparator);
    return { target, rows, dateKey:key };
  }

  async function setManualRouteOrder(orderId, direction){
    const { target, rows } = routeGroupForOrder(orderId);
    if (!target || rows.length < 2) { alert('This chef chain has only one order. No route order change is needed.'); return; }
    const currentIndex = rows.findIndex(o => cleanId(o) === String(orderId));
    const nextIndex = currentIndex + Number(direction || 0);
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rows.length) return;

    const ordered = [...rows];
    [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[currentIndex]];
    const updates = ordered.map((order, idx) => {
      let notes = notesOf(order);
      notes = upsertNoteLine(notes, ROUTE_SEQ_LABEL, String((idx + 1) * 10));
      notes = upsertNoteLine(notes, ROUTE_OVERRIDE_LABEL, 'Manual manager route order');
      notes = upsertNoteLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      return { id: cleanId(order), notes };
    });
    for (const update of updates) await patchRouteNotes(update.id, update.notes);
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    setTimeout(() => { try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 150);
  }

  async function clearManualRouteOrder(orderId){
    const { target, rows } = routeGroupForOrder(orderId);
    if (!target) return;
    const updates = rows.map(order => {
      let notes = notesOf(order);
      notes = removeNoteLine(notes, ROUTE_SEQ_LABEL);
      notes = removeNoteLine(notes, ROUTE_OVERRIDE_LABEL);
      notes = upsertNoteLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      return { id: cleanId(order), notes };
    });
    for (const update of updates) await patchRouteNotes(update.id, update.notes);
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    setTimeout(() => { try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 150);
  }

  function minutesBetweenOrders(a, b){
    try {
      const aEnd = addMinutes(parseOrderDateTime(a), eventBlockMinutes(a));
      const travel = estimateTravelMinutes(milesBetween(orderPoint(a), orderPoint(b))) || 45;
      const bStart = parseOrderDateTime(b);
      if (!aEnd || !bStart) return null;
      return Math.round((bStart - addMinutes(aEnd, travel)) / 60000);
    } catch { return null; }
  }
  function riskBadge(current, next){
    if (!next) return '<small class="route-risk ok">last stop</small>';
    const buffer = minutesBetweenOrders(current, next);
    if (buffer === null) return '<small class="route-risk warn">drive time estimate pending</small>';
    if (buffer < 0) return `<small class="route-risk high">conflict: ${Math.abs(buffer)} min short</small>`;
    if (buffer < 30) return `<small class="route-risk warn">tight: ${buffer} min buffer</small>`;
    return `<small class="route-risk ok">${buffer} min buffer</small>`;
  }

  const previousRenderRoutePlanner = typeof renderRoutePlanner === 'function' ? renderRoutePlanner : null;
  try {
    renderRoutePlanner = function(orders = [], role = currentDashboardRole){
      if (previousRenderRoutePlanner) previousRenderRoutePlanner(orders, role);
      if (!routePlanSummary || !routeMapBoard || !routePlanDateSelect) return;
      if (!['Admin','Manager','Customer Service','Chef'].includes(role)) return;
      const selectedDate = routePlanDateSelect.value || chooseDefaultRouteDate(orders);
      const rows = (ordersForRouteDate || previousOrdersForRouteDate)(orders, selectedDate);
      if (!rows.length) return;
      const groups = routeGroupsForRows(rows);
      const canEdit = ['Admin','Manager','Customer Service'].includes(role);
      const missing = rows.filter(o => !orderHasCoords(o)).length;
      const legend = groups.map(group => {
        const chain = group.rows.map(o => o.routeLabel).join(' → ');
        const mode = group.manual ? 'Manual route order' : 'Auto time order';
        return `<span class="route-legend ${group.colorClass}"><i></i>${esc(group.label)} · ${esc(chain)} <em>${esc(mode)}</em></span>`;
      }).join('');
      const routeList = groups.map(group => {
        const stops = group.rows.map((order, idx) => {
          const m = calculateOrderMoney?.(order) || {};
          const id = cleanId(order);
          const next = group.rows[idx + 1];
          const buttons = canEdit ? `<div class="route-manual-actions"><button type="button" data-v114-route-move="-1" data-order-id="${esc(id)}" ${idx === 0 ? 'disabled' : ''}>Move earlier</button><button type="button" data-v114-route-move="1" data-order-id="${esc(id)}" ${idx === group.rows.length - 1 ? 'disabled' : ''}>Move later</button><button type="button" data-v114-route-reset="${esc(id)}">Use time order</button></div>` : '';
          return `<article class="route-stop route-stop-v114 ${hasManualRoute(order) ? 'manual' : ''}">
            <div class="route-stop-head"><strong>${esc(order.routeLabel)} · ${esc(firstReadableTime(order.eventTime || 'Time pending'))}</strong>${riskBadge(order, next)}</div>
            <span>${esc(order.name || 'Guest')} · ${esc(order.address || 'No address')}</span>
            <small>${esc(chefLabel(order))} · ${esc(m.totalGuests || '')} guests · ${hasManualRoute(order) ? 'manual manager sequence' : 'default chronological sequence'}</small>
            ${buttons}
          </article>`;
        }).join('');
        return `<section class="route-chain-v114"><header><b>${esc(group.label)}</b><span>${group.manual ? 'Manual override active' : 'Default: party start time order'}</span></header><div class="route-stop-list">${stops}</div></section>`;
      }).join('');
      routePlanSummary.innerHTML = `<div class="route-v114-note"><b>Route logic:</b> Phoenix shows the safest default route by party start time. Managers can manually move stops earlier/later when customer flexibility, chef location, or real-world routing requires it. Manual route order is a staff planning override, not a customer-facing promise.</div><div class="route-legend-row">${legend}</div>${missing ? `<p class="route-warning">${missing} order(s) do not have saved map coordinates yet. Use the standard Geoapify address suggestion, not the manual/fuzzy option, so the map can place them accurately.</p>` : ''}<p class="small-muted">Live traffic routing still requires Geoapify Routing or Google Distance Matrix. Until then, this is a manager review tool: verify travel time before confirming a chef chain.</p>${routeList}`;
    };
  } catch (error) { console.warn('V114 could not override renderRoutePlanner:', error); }

  try {
    buildPointToPointPlan = function(orders = []){
      const byDate = orders.reduce((acc, order) => {
        const key = normalizeDateKey(order);
        (acc[key] ||= []).push(order);
        return acc;
      }, {});
      const planned = [];
      Object.entries(byDate).sort(([a],[b]) => String(a).localeCompare(String(b))).forEach(([, rows]) => {
        const dayRows = [...rows].sort((a,b) => orderTimeValue(a) - orderTimeValue(b));
        const dayPlan = [];
        dayRows.forEach((order) => {
          const hasChef = order.assignedChef && !/unassigned|needs chef|pending/i.test(String(order.assignedChef));
          const plannedOrder = hasChef ? { ...order, assignmentStatus: order.assignmentStatus || 'Manager assigned · route review needed' } : autoAssignOrder({ ...order }, [...planned, ...dayPlan]);
          dayPlan.push(plannedOrder);
        });
        const labeled = dayPlan.sort(routeComparator).map((order, index) => ({ ...order, routeLabel: routeLabelForIndex(index) }));
        planned.push(...labeled);
      });
      return planned.sort((a,b) => orderTimeValue(b) - orderTimeValue(a));
    };
  } catch (error) { console.warn('V114 could not override buildPointToPointPlan:', error); }

  try {
    const btn = document.getElementById('autoDispatchBtn');
    if (btn) btn.textContent = 'Review route plan';
  } catch {}

  document.addEventListener('click', (event) => {
    const move = event.target.closest?.('[data-v114-route-move]');
    if (move) {
      const orderId = move.getAttribute('data-order-id');
      const direction = Number(move.getAttribute('data-v114-route-move'));
      move.disabled = true;
      setManualRouteOrder(orderId, direction).finally(() => { move.disabled = false; });
      return;
    }
    const reset = event.target.closest?.('[data-v114-route-reset]');
    if (reset) {
      const orderId = reset.getAttribute('data-v114-route-reset');
      if (confirm('Reset this chef chain to default party-start-time order?')) clearManualRouteOrder(orderId);
    }
  });

  setTimeout(() => { try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 700);
})();

/*
   PHX V115 — Route plan logic correction
   - Keep flexible manager routing.
   - Default route order is party start time order.
   - Manual order is allowed, but route risk no longer shows fake conflict numbers when coordinates are missing or date parsing is suspicious.
   - Route date dropdown is refreshed from actual orders.
*/
(function(){
  if (window.__PHX_V115_ROUTE_LOGIC_FIX__) return;
  window.__PHX_V115_ROUTE_LOGIC_FIX__ = true;

  const ROUTE_SEQ_LABEL = 'Phoenix route sequence';
  const ROUTE_OVERRIDE_LABEL = 'Phoenix route override';
  const ROUTE_UPDATED_LABEL = 'Phoenix route updated';

  const esc = (value) => {
    try { return escapeHtml(value); } catch { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  };
  const cleanId = (order = {}) => String(order.id || order.booking_number || '').trim();
  const notesOf = (order = {}) => String(order.specialNotes || order.admin_notes || order.notes || '');
  const nowLabel = () => new Date().toLocaleString([], { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

  function readNoteLine(notes = '', label = ''){
    const target = String(label).toLowerCase();
    const line = String(notes || '').split(/\r?\n/).find(row => row.toLowerCase().startsWith(target + ':'));
    return line ? line.slice(line.indexOf(':') + 1).trim() : '';
  }
  function removeNoteLine(notes = '', label = ''){
    const target = String(label).toLowerCase();
    return String(notes || '').split(/\r?\n/).filter(row => !row.toLowerCase().startsWith(target + ':')).join('\n').trim();
  }
  function upsertNoteLine(notes = '', label = '', value = ''){
    let next = removeNoteLine(notes, label);
    if (String(value ?? '').trim()) next = `${next ? next + '\n' : ''}${label}: ${String(value).trim()}`;
    return next.trim();
  }
  function routeSeq(order = {}){
    const raw = readNoteLine(notesOf(order), ROUTE_SEQ_LABEL);
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  function hasManualRoute(order = {}){
    return routeSeq(order) !== null || /manual/i.test(readNoteLine(notesOf(order), ROUTE_OVERRIDE_LABEL));
  }
  function chefKey(order = {}){
    return String(order.assignedChefId || order.assigned_chef_id || order.assignedChef || order.assigned_chef || 'unassigned').trim() || 'unassigned';
  }
  function chefLabel(order = {}){
    const key = chefKey(order);
    return order.assignedChef || order.assigned_chef || (Array.isArray(CHEFS) ? CHEFS.find(c => c.id === key)?.name : '') || 'Needs chef';
  }
  function sameDate(order, key){
    try { return normalizeDateKey(order) === key; } catch { return false; }
  }
  function sameChef(a, b){ return chefKey(a) === chefKey(b); }
  function orderTimeValue(order = {}){
    try {
      const dt = parseOrderDateTime(order);
      if (dt && Number.isFinite(dt.getTime())) return dt.getTime();
    } catch {}
    return 9999999999999;
  }
  function routeSortValue(order = {}){
    const seq = routeSeq(order);
    return seq !== null ? seq : orderTimeValue(order);
  }
  function routeComparator(a, b){
    const av = routeSortValue(a), bv = routeSortValue(b);
    if (av !== bv) return av - bv;
    return orderTimeValue(a) - orderTimeValue(b);
  }
  function defaultTimeComparator(a, b){ return orderTimeValue(a) - orderTimeValue(b); }
  window.PHX_V115_ROUTE_COMPARE = routeComparator;

  function readableGap(minutes){
    if (!Number.isFinite(minutes)) return '';
    const abs = Math.abs(Math.round(minutes));
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return h ? `${h} hr${h > 1 ? 's' : ''}${m ? ' ' + m + ' min' : ''}` : `${m} min`;
  }
  function hasCoords(order){
    try { return !!orderHasCoords(order); } catch { return !!(Number(order.addressLat || order.lat) && Number(order.addressLon || order.lon)); }
  }
  function point(order){
    try { return orderPoint(order); } catch { return { lat:Number(order.addressLat || order.lat || 0), lon:Number(order.addressLon || order.lon || 0) }; }
  }
  function safeEventBlockMinutes(order){
    // If the order still has an explicit range, use that range. Otherwise use a sensible default party block.
    const raw = String(order.eventTime || '');
    const matches = [...raw.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/ig)];
    if (matches.length >= 2) {
      const dateKey = (() => { try { return normalizeDateKey(order); } catch { return order.eventDate || new Date().toISOString().slice(0,10); } })();
      const build = (m) => new Date(`${dateKey} ${Number(m[1])}:${m[2] || '00'} ${String(m[3]).toUpperCase()}`.replace(/-/g,'/'));
      const a = build(matches[0]);
      const b = build(matches[1]);
      if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())) {
        let diff = Math.round((b - a) / 60000);
        if (diff < 0) diff += 24 * 60;
        if (diff >= 45 && diff <= 360) return diff;
      }
    }
    try {
      const n = Number(eventBlockMinutes(order));
      if (Number.isFinite(n)) return Math.min(Math.max(n, 90), 210);
    } catch {}
    return 120;
  }
  function routeTimingInfo(current, next){
    if (!next) return { type:'last', label:'last stop' };
    const currentStart = (() => { try { return parseOrderDateTime(current); } catch { return null; } })();
    const nextStart = (() => { try { return parseOrderDateTime(next); } catch { return null; } })();
    if (!currentStart || !nextStart || !Number.isFinite(currentStart.getTime()) || !Number.isFinite(nextStart.getTime())) {
      return { type:'warn', label:'time check needed' };
    }
    const startGap = Math.round((nextStart - currentStart) / 60000);
    if (startGap < 0) return { type:'warn', label:'manual order before earlier party' };

    const coordsReady = hasCoords(current) && hasCoords(next);
    if (!coordsReady) {
      return { type:'warn', label:`${readableGap(startGap)} apart · verify drive` };
    }

    const block = safeEventBlockMinutes(current);
    let travel = 45;
    try {
      const miles = milesBetween(point(current), point(next));
      travel = estimateTravelMinutes(miles);
    } catch {}
    if (!Number.isFinite(travel)) travel = 45;
    const buffer = startGap - block - travel;
    if (!Number.isFinite(buffer) || Math.abs(buffer) > 720) return { type:'warn', label:`${readableGap(startGap)} apart · time check` };
    if (buffer < 0) return { type:'high', label:`conflict: ${readableGap(Math.abs(buffer))} short` };
    if (buffer < 30) return { type:'warn', label:`tight: ${buffer} min buffer` };
    return { type:'ok', label:`${buffer} min buffer` };
  }
  function riskBadge(current, next){
    const info = routeTimingInfo(current, next);
    const cls = info.type === 'high' ? 'high' : info.type === 'ok' || info.type === 'last' ? 'ok' : 'warn';
    return `<small class="route-risk ${cls}">${esc(info.label)}</small>`;
  }

  function routeDateKeys(orders = []){
    const keys = [...new Set((orders || []).map(o => {
      try { return normalizeDateKey(o); } catch { return ''; }
    }).filter(Boolean))].sort();
    return keys;
  }
  function refreshRouteDateSelect(orders = [], selected = ''){
    if (!routePlanDateSelect) return '';
    const keys = routeDateKeys(orders);
    const current = keys.includes(selected) ? selected : (keys.includes(routePlanDateSelect.value) ? routePlanDateSelect.value : (keys[0] || ''));
    routePlanDateSelect.innerHTML = keys.length
      ? keys.map(key => `<option value="${esc(key)}" ${key === current ? 'selected' : ''}>${esc(shortDateHeading(key))}</option>`).join('')
      : '<option value="">No orders</option>';
    routePlanDateSelect.value = current;
    return current;
  }

  function ordersForRouteDateV115(orders = [], dateKey = ''){
    const filtered = [...orders].filter(o => !dateKey || sameDate(o, dateKey));
    return filtered.sort(routeComparator).map((order, index) => ({ ...order, routeLabel: routeLabelForIndex(index) }));
  }
  try { ordersForRouteDate = ordersForRouteDateV115; } catch {}

  function routeGroupsForRowsV115(rows = []){
    const groups = new Map();
    rows.forEach(order => {
      const key = chefKey(order);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    });
    return [...groups.entries()].map(([key, group], idx) => {
      const sorted = group.sort(routeComparator).map((order, index) => ({ ...order, routeLabel: routeLabelForIndex(index) }));
      return {
        key,
        label: chefLabel(sorted[0] || {}),
        colorClass: routeColorClass(key, idx),
        rows: sorted,
        manual: sorted.some(hasManualRoute)
      };
    });
  }
  try { routeGroupsForRows = routeGroupsForRowsV115; } catch {}

  async function patchRouteNotes(orderId, notes){
    const id = String(orderId || '').trim();
    const localPatch = { specialNotes: notes, admin_notes: notes };
    try {
      const current = getStoredOrders?.() || [];
      saveStoredOrders?.(current.map(o => cleanId(o) === id ? { ...o, ...localPatch } : o));
    } catch {}
    try {
      if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.map(o => cleanId(o) === id ? { ...o, ...localPatch } : o);
    } catch {}
    try {
      const client = initSupabaseClient?.();
      if (client && supabaseSession) await client.from('bookings').update({ admin_notes: notes }).eq('booking_number', id);
    } catch (error) { console.warn('V115 route note update failed:', error); }
  }
  function routeGroupForOrder(orderId){
    const id = String(orderId || '').trim();
    const orders = getDashboardOrders?.() || [];
    const target = orders.find(o => cleanId(o) === id);
    if (!target) return { target:null, rows:[] };
    const key = (() => { try { return normalizeDateKey(target); } catch { return ''; } })();
    const rows = orders.filter(o => sameDate(o, key) && sameChef(o, target)).sort(routeComparator);
    return { target, rows, dateKey:key };
  }
  async function setManualRouteOrder(orderId, direction){
    const { target, rows } = routeGroupForOrder(orderId);
    if (!target || rows.length < 2) { alert('This chef chain has only one order. No route order change is needed.'); return; }
    const currentIndex = rows.findIndex(o => cleanId(o) === String(orderId));
    const nextIndex = currentIndex + Number(direction || 0);
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
    const ordered = [...rows];
    [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[currentIndex]];
    const updates = ordered.map((order, idx) => {
      let notes = notesOf(order);
      notes = upsertNoteLine(notes, ROUTE_SEQ_LABEL, String((idx + 1) * 10));
      notes = upsertNoteLine(notes, ROUTE_OVERRIDE_LABEL, 'Manual manager route order');
      notes = upsertNoteLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      return { id: cleanId(order), notes };
    });
    for (const update of updates) await patchRouteNotes(update.id, update.notes);
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    setTimeout(() => { try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 150);
  }
  async function clearManualRouteOrder(orderId){
    const { target, rows } = routeGroupForOrder(orderId);
    if (!target) return;
    const updates = rows.map(order => {
      let notes = notesOf(order);
      notes = removeNoteLine(notes, ROUTE_SEQ_LABEL);
      notes = removeNoteLine(notes, ROUTE_OVERRIDE_LABEL);
      notes = upsertNoteLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      return { id: cleanId(order), notes };
    });
    for (const update of updates) await patchRouteNotes(update.id, update.notes);
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    setTimeout(() => { try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 150);
  }

  try {
    renderRoutePlanner = function(orders = [], role = currentDashboardRole){
      if (!routePlanSummary || !routeMapBoard || !routePlanDateSelect) return;
      if (!['Admin','Manager','Customer Service','Chef'].includes(role)) return;
      const selectedDate = refreshRouteDateSelect(orders, routePlanDateSelect.value || chooseDefaultRouteDate(orders));
      const rows = ordersForRouteDateV115(orders, selectedDate);
      if (!rows.length) {
        routePlanSummary.innerHTML = '<p class="small-muted">No orders for the selected route date.</p>';
        return;
      }
      const groups = routeGroupsForRowsV115(rows);
      const canEdit = ['Admin','Manager','Customer Service'].includes(role);
      const missing = rows.filter(o => !hasCoords(o)).length;
      const legend = groups.map(group => {
        const chain = group.rows.map(o => o.routeLabel).join(' → ');
        const mode = group.manual ? 'Manual override' : 'Time order';
        return `<span class="route-legend ${group.colorClass}"><i></i>${esc(group.label)} · ${esc(chain)} <em>${esc(mode)}</em></span>`;
      }).join('');
      const routeList = groups.map(group => {
        const stops = group.rows.map((order, idx) => {
          const m = calculateOrderMoney?.(order) || {};
          const id = cleanId(order);
          const next = group.rows[idx + 1];
          const buttons = canEdit ? `<div class="route-manual-actions"><button type="button" data-v115-route-move="-1" data-order-id="${esc(id)}" ${idx === 0 ? 'disabled' : ''}>Move earlier</button><button type="button" data-v115-route-move="1" data-order-id="${esc(id)}" ${idx === group.rows.length - 1 ? 'disabled' : ''}>Move later</button><button type="button" data-v115-route-reset="${esc(id)}">Use time order</button></div>` : '';
          return `<article class="route-stop route-stop-v114 route-stop-v115 ${hasManualRoute(order) ? 'manual' : ''}">
            <div class="route-stop-head"><strong>${esc(order.routeLabel)} · ${esc(firstReadableTime(order.eventTime || 'Time pending'))}</strong>${riskBadge(order, next)}</div>
            <span>${esc(order.name || 'Guest')} · ${esc(order.address || 'No address')}</span>
            <small>${esc(chefLabel(order))} · ${esc(m.totalGuests || '')} guests · ${hasManualRoute(order) ? 'manual manager sequence' : 'default party-start-time sequence'}</small>
            ${buttons}
          </article>`;
        }).join('');
        return `<section class="route-chain-v114 route-chain-v115"><header><b>${esc(group.label)}</b><span>${group.manual ? 'Manual override active' : 'Default: party start time order'}</span></header><div class="route-stop-list">${stops}</div></section>`;
      }).join('');
      routePlanSummary.innerHTML = `<div class="route-v114-note"><b>Route logic:</b> Default route is party start time order. Manager can override order manually, but conflict warnings only become reliable after each order has map coordinates and real routing is connected.</div><div class="route-legend-row">${legend}</div>${missing ? `<p class="route-warning">${missing} order(s) need map coordinates before drive-time conflict warnings can be trusted.</p>` : ''}<p class="small-muted">Use this as a manager planning board. Final route should be confirmed by customer service and the chef.</p>${routeList}`;
    };
  } catch (error) { console.warn('V115 could not override renderRoutePlanner:', error); }

  try {
    buildPointToPointPlan = function(orders = []){
      const byDate = orders.reduce((acc, order) => {
        const key = normalizeDateKey(order);
        (acc[key] ||= []).push(order);
        return acc;
      }, {});
      const planned = [];
      Object.entries(byDate).sort(([a],[b]) => String(a).localeCompare(String(b))).forEach(([, rows]) => {
        const dayRows = [...rows].sort(defaultTimeComparator);
        const dayPlan = [];
        dayRows.forEach((order) => {
          const hasChef = order.assignedChef && !/unassigned|needs chef|pending/i.test(String(order.assignedChef));
          const plannedOrder = hasChef ? { ...order, assignmentStatus: order.assignmentStatus || 'Manager assigned · route review needed' } : autoAssignOrder({ ...order }, [...planned, ...dayPlan]);
          dayPlan.push(plannedOrder);
        });
        const labeled = dayPlan.sort(routeComparator).map((order, index) => ({ ...order, routeLabel: routeLabelForIndex(index) }));
        planned.push(...labeled);
      });
      return planned.sort(routeComparator);
    };
  } catch (error) { console.warn('V115 could not override buildPointToPointPlan:', error); }

  document.addEventListener('click', (event) => {
    const move = event.target.closest?.('[data-v115-route-move]');
    if (move) {
      const orderId = move.getAttribute('data-order-id');
      const direction = Number(move.getAttribute('data-v115-route-move'));
      move.disabled = true;
      setManualRouteOrder(orderId, direction).finally(() => { move.disabled = false; });
      return;
    }
    const reset = event.target.closest?.('[data-v115-route-reset]');
    if (reset) {
      const orderId = reset.getAttribute('data-v115-route-reset');
      if (confirm('Reset this chef chain to default party-start-time order?')) clearManualRouteOrder(orderId);
    }
  }, true);

  setTimeout(() => { try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 800);
})();

/* ======================================================================
   PHX V116 — Date folder route planner
   - Orders are first grouped into date folders.
   - Route logic runs only inside the selected date folder.
   - This prevents cross-date orders from affecting A/B labels, map lines,
     route date dropdowns, and conflict notes.
   ====================================================================== */
(function initPHXV116DateFolderRoutes(){
  if (window.__PHX_V116_DATE_FOLDER_ROUTES__) return;
  window.__PHX_V116_DATE_FOLDER_ROUTES__ = true;

  const ROUTE_SEQ_LABEL = 'Phoenix route sequence';
  const ROUTE_OVERRIDE_LABEL = 'Phoenix route override';

  const esc = (value) => {
    try { return escapeHtml(value); }
    catch { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  };
  const idOf = (order = {}) => String(order.id || order.booking_number || '').trim();
  const notesOf = (order = {}) => String(order.specialNotes || order.admin_notes || order.notes || '');
  const dateKeyOf = (order = {}) => {
    try { return normalizeDateKey(order) || 'Date pending'; }
    catch { return String(order.eventDate || order.event_date || 'Date pending') || 'Date pending'; }
  };
  const dateLabelOf = (key) => {
    try { return shortDateHeading(key) || key; }
    catch { return key; }
  };
  function readRouteSeq(order = {}){
    const line = notesOf(order).split(/\r?\n/).find(row => row.toLowerCase().startsWith(ROUTE_SEQ_LABEL.toLowerCase() + ':'));
    const n = Number(line ? line.slice(line.indexOf(':') + 1).trim() : '');
    return Number.isFinite(n) ? n : null;
  }
  function hasManualRouteV116(order = {}){
    const notes = notesOf(order);
    return readRouteSeq(order) !== null || notes.toLowerCase().includes(ROUTE_OVERRIDE_LABEL.toLowerCase() + ':');
  }
  function orderTimeValueV116(order = {}){
    try {
      const dt = parseOrderDateTime(order);
      if (dt && Number.isFinite(dt.getTime())) return dt.getTime();
    } catch {}
    return 9999999999999;
  }
  function routeSortV116(a, b){
    const as = readRouteSeq(a), bs = readRouteSeq(b);
    const av = as !== null ? as : orderTimeValueV116(a);
    const bv = bs !== null ? bs : orderTimeValueV116(b);
    if (av !== bv) return av - bv;
    return String(idOf(a)).localeCompare(String(idOf(b)));
  }
  function chefKeyV116(order = {}){
    return String(order.assignedChefId || order.assigned_chef_id || order.assignedChef || order.assigned_chef || 'unassigned').trim() || 'unassigned';
  }
  function chefNameV116(order = {}){
    const key = chefKeyV116(order);
    return order.assignedChef || order.assigned_chef || (Array.isArray(CHEFS) ? CHEFS.find(c => c.id === key)?.name : '') || 'Needs chef';
  }
  function groupByDateFolders(orders = []){
    const folders = new Map();
    [...orders].forEach(order => {
      const key = dateKeyOf(order);
      if (!folders.has(key)) folders.set(key, []);
      folders.get(key).push(order);
    });
    return [...folders.entries()].sort(([a],[b]) => String(a).localeCompare(String(b))).map(([key, rows]) => {
      const sortedRows = rows.sort(routeSortV116).map((order, index) => ({ ...order, routeLabel: routeLabelForIndex(index) }));
      return { key, label: dateLabelOf(key), rows: sortedRows };
    });
  }
  function chooseSelectedFolder(folders = [], previous = ''){
    if (!folders.length) return '';
    if (previous && folders.some(folder => folder.key === previous)) return previous;
    const today = new Date();
    today.setHours(0,0,0,0);
    const future = folders.find(folder => {
      const parts = String(folder.key).split('-').map(Number);
      if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return false;
      return new Date(parts[0], parts[1] - 1, parts[2]) >= today;
    });
    return (future || folders[0]).key;
  }
  function syncRouteDateFolders(orders = [], preferred = ''){
    const folders = groupByDateFolders(orders);
    const selected = chooseSelectedFolder(folders, preferred || routePlanDateSelect?.value || '');
    if (routePlanDateSelect) {
      routePlanDateSelect.innerHTML = folders.length
        ? folders.map(folder => `<option value="${esc(folder.key)}" ${folder.key === selected ? 'selected' : ''}>${esc(folder.label)} · ${folder.rows.length} order${folder.rows.length > 1 ? 's' : ''}</option>`).join('')
        : '<option value="">No orders</option>';
      routePlanDateSelect.value = selected;
    }
    return { folders, selected, folder: folders.find(f => f.key === selected) || null };
  }
  function rowsForSelectedDate(orders = [], dateKey = ''){
    const folders = groupByDateFolders(orders);
    const key = chooseSelectedFolder(folders, dateKey || routePlanDateSelect?.value || '');
    return (folders.find(f => f.key === key)?.rows || []).map((order, index) => ({ ...order, routeLabel: routeLabelForIndex(index) }));
  }
  try { ordersForRouteDate = rowsForSelectedDate; } catch {}
  try { getRouteDateKeys = (orders = []) => groupByDateFolders(orders).map(folder => folder.key); } catch {}
  try { chooseDefaultRouteDate = (orders = []) => chooseSelectedFolder(groupByDateFolders(orders)); } catch {}
  try { syncRouteDateSelect = (orders = []) => syncRouteDateFolders(orders).selected; } catch {}

  function groupsForDateRows(rows = []){
    const groups = new Map();
    rows.forEach(order => {
      const key = chefKeyV116(order);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    });
    return [...groups.entries()].map(([key, rows], idx) => {
      const sorted = rows.sort(routeSortV116);
      return {
        key,
        label: chefNameV116(sorted[0] || {}),
        colorClass: routeColorClass(key, idx),
        manual: sorted.some(hasManualRouteV116),
        rows: sorted
      };
    });
  }
  try { routeGroupsForRows = groupsForDateRows; } catch {}

  function mapPointsForDate(rows = []){
    const hasCoords = (o) => {
      try { return orderHasCoords(o); } catch { return false; }
    };
    const coords = rows.filter(hasCoords);
    if (coords.length >= 2) {
      try { return projectRoutePoints(rows); } catch {}
    }
    const count = Math.max(1, rows.length);
    return rows.map((order, index) => {
      const t = count === 1 ? 0.5 : index / (count - 1);
      return { order, index, hasCoords:false, x: 12 + t * 76, y: 82 - t * 64 };
    });
  }
  function timeGapText(a, b){
    if (!a || !b) return 'last stop';
    const av = orderTimeValueV116(a), bv = orderTimeValueV116(b);
    if (!Number.isFinite(av) || !Number.isFinite(bv) || av >= 9999999999999 || bv >= 9999999999999) return 'time pending';
    const min = Math.max(0, Math.round((bv - av) / 60000));
    const h = Math.floor(min / 60), m = min % 60;
    const gap = `${h ? `${h} hr ` : ''}${m ? `${m} min` : ''}`.trim() || 'same time';
    return `${gap} apart · verify drive`;
  }
  function renderFolderButtons(folders = [], selected = ''){
    if (!folders.length) return '';
    return `<div class="route-date-folders-v116"><div class="route-date-folder-title-v116">Date folders / 按日期分组</div>${folders.map(folder => {
      const assigned = folder.rows.filter(o => chefKeyV116(o) !== 'unassigned' && !/needs chef|unassigned|pending/i.test(chefNameV116(o))).length;
      const manual = folder.rows.some(hasManualRouteV116);
      return `<button type="button" class="route-date-folder-v116 ${folder.key === selected ? 'active' : ''}" data-v116-route-date="${esc(folder.key)}"><b>${esc(folder.label)}</b><span>${folder.rows.length} order${folder.rows.length > 1 ? 's' : ''} · ${assigned} assigned${manual ? ' · manual route' : ''}</span></button>`;
    }).join('')}</div>`;
  }
  function renderDateRouteMap(rows = [], groups = []){
    if (!routeMapBoard) return;
    if (!rows.length) {
      routeMapBoard.innerHTML = '<div class="empty-state">Choose a date folder with orders to build a route plan.</div>';
      return;
    }
    const points = mapPointsForDate(rows);
    const pointById = new Map(points.map(pt => [idOf(pt.order), pt]));
    const lines = groups.map(group => {
      const pts = group.rows.map(o => pointById.get(idOf(o))).filter(Boolean);
      if (pts.length < 2) return '';
      const path = pts.map((pt, idx) => `${idx ? 'L' : 'M'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ');
      return `<path class="route-line ${group.colorClass}" d="${path}" />`;
    }).join('');
    const markers = points.map(pt => {
      const order = pt.order;
      const group = groups.find(g => g.rows.some(o => idOf(o) === idOf(order)));
      const colorClass = group?.colorClass || routeColorClass('', pt.index);
      const href = searchMapUrl(order.address || '');
      return `<a href="${href}" target="_blank" rel="noreferrer"><g class="route-marker ${colorClass}"><circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="5.2"></circle><text x="${pt.x.toFixed(2)}" y="${(pt.y + 1.8).toFixed(2)}">${esc(order.routeLabel)}</text></g></a>`;
    }).join('');
    const labels = points.map(pt => `<div class="route-map-label" style="left:${pt.x}%;top:${pt.y}%"><b>${esc(pt.order.routeLabel)}</b><span>${esc(firstReadableTime(pt.order.eventTime || 'Time pending'))}</span></div>`).join('');
    routeMapBoard.innerHTML = `<div class="route-map-canvas route-map-canvas-v116"><svg viewBox="0 0 100 100" role="img" aria-label="Phoenix Hibachi date folder route map"><rect x="0" y="0" width="100" height="100" rx="8" class="route-map-bg"></rect><path class="route-grid" d="M10 25 H90 M10 50 H90 M10 75 H90 M25 10 V90 M50 10 V90 M75 10 V90"></path>${lines}${markers}</svg>${labels}</div>`;
  }

  try {
    renderRoutePlanner = function(orders = [], role = currentDashboardRole){
      if (!routePlanSummary || !routeMapBoard || !routePlanDateSelect) return;
      if (!['Admin','Manager','Customer Service','Chef'].includes(role)) {
        routeMapBoard.innerHTML = '<div class="empty-state">Route map is only visible to staff and chef accounts.</div>';
        routePlanSummary.innerHTML = '';
        return;
      }
      const visible = Array.isArray(orders) ? orders : [];
      const { folders, selected, folder } = syncRouteDateFolders(visible, routePlanDateSelect.value || '');
      const rows = (folder?.rows || []).map((order, index) => ({ ...order, routeLabel: routeLabelForIndex(index) }));
      const groups = groupsForDateRows(rows);
      renderDateRouteMap(rows, groups);
      if (!folders.length) {
        routePlanSummary.innerHTML = '<p class="small-muted">No order date folders yet. Orders will appear here after customers submit booking requests.</p>';
        return;
      }
      const canEdit = ['Admin','Manager','Customer Service'].includes(role);
      const missing = rows.filter(o => { try { return !orderHasCoords(o); } catch { return true; } }).length;
      const legend = groups.map(group => `<span class="route-legend ${group.colorClass}"><i></i>${esc(group.label)} · ${esc(group.rows.map(o => o.routeLabel).join(' → ') || 'No stops')} <em>${group.manual ? 'Manual route inside date folder' : 'Party-time order inside date folder'}</em></span>`).join('');
      const chains = groups.map(group => {
        const stops = group.rows.map((order, idx) => {
          const next = group.rows[idx + 1];
          const m = (typeof calculateOrderMoney === 'function' ? calculateOrderMoney(order) : {}) || {};
          const buttons = canEdit ? `<div class="route-manual-actions"><button type="button" data-v115-route-move="-1" data-order-id="${esc(idOf(order))}" ${idx === 0 ? 'disabled' : ''}>Move earlier</button><button type="button" data-v115-route-move="1" data-order-id="${esc(idOf(order))}" ${idx === group.rows.length - 1 ? 'disabled' : ''}>Move later</button><button type="button" data-v115-route-reset="${esc(idOf(order))}">Use time order</button></div>` : '';
          return `<article class="route-stop route-stop-v116 ${hasManualRouteV116(order) ? 'manual' : ''}"><div class="route-stop-head"><strong>${esc(order.routeLabel)} · ${esc(firstReadableTime(order.eventTime || 'Time pending'))}</strong><span class="route-gap-v116">${esc(timeGapText(order, next))}</span></div><span>${esc(order.name || 'Guest')} · ${esc(order.address || 'No address')}</span><small>${esc(chefNameV116(order))} · ${esc(m.totalGuests || '')} guests · ${hasManualRouteV116(order) ? 'manual manager sequence' : 'default party-start-time sequence'}</small>${buttons}</article>`;
        }).join('');
        return `<section class="route-chain-v116"><header><b>${esc(group.label)}</b><span>${group.manual ? 'Manual override active for this date' : 'Default: party start time order'}</span></header><div class="route-stop-list route-stop-list-v116">${stops}</div></section>`;
      }).join('');
      routePlanSummary.innerHTML = `${renderFolderButtons(folders, selected)}<div class="route-v114-note route-v116-note"><b>Route logic:</b> Orders are first separated into date folders. Phoenix only analyzes route order inside the selected date. Default order is party start time; manager can manually override stops within the same date and chef chain.</div><div class="route-legend-row">${legend}</div>${missing ? `<p class="route-warning">${missing} order(s) in this date folder need map coordinates before driving-time warnings can be trusted.</p>` : ''}<p class="small-muted">Selected folder: <b>${esc(folder?.label || selected)}</b>. This is an internal dispatch planning tool, not a customer-facing promise.</p>${chains}`;
    };
  } catch (error) { console.warn('V116 could not override route planner:', error); }

  try {
    buildPointToPointPlan = function(orders = []){
      const planned = [];
      groupByDateFolders(orders).forEach(folder => {
        folder.rows.forEach((order, index) => {
          planned.push({ ...order, routeDateFolder: folder.key, routeLabel: routeLabelForIndex(index), assignmentStatus: order.assignmentStatus || 'Date-folder route review needed' });
        });
      });
      return planned.sort((a,b) => {
        const dk = String(dateKeyOf(a)).localeCompare(String(dateKeyOf(b)));
        return dk || routeSortV116(a,b);
      });
    };
  } catch (error) { console.warn('V116 could not override point-to-point plan:', error); }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest?.('[data-v116-route-date]');
    if (!btn) return;
    const key = btn.getAttribute('data-v116-route-date') || '';
    if (routePlanDateSelect) routePlanDateSelect.value = key;
    try { renderRoutePlanner(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {}
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target && event.target.id === 'routePlanDateSelect') {
      setTimeout(() => { try { renderRoutePlanner(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 0);
    }
  }, true);

  setTimeout(() => { try { renderRoutePlanner(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 1000);
})();


/* ======================================================================
   PHX V117 — Commercial route calendar + multi-chef planning
   - Removes text caret from non-editable UI through CSS and safety blur.
   - Route board groups by month -> week -> date; only selected date is routed.
   - Selected day route uses 1..N sequence numbers and chef-color route lines.
   - Adds customer chef-count request and staff chef-team controls, max 4 chefs.
   - If billable guests exceed 25, 2 chefs are recommended/required for planning.
   ====================================================================== */
(function initPHXV117RouteCalendarAndChefTeams(){
  if (window.__PHX_V117_ROUTE_CALENDAR__) return;
  window.__PHX_V117_ROUTE_CALENDAR__ = true;

  const TEAM_COUNT_LABEL = 'Phoenix chef team count';
  const TEAM_IDS_LABEL = 'Phoenix chef team ids';
  const TEAM_NAMES_LABEL = 'Phoenix chef team names';
  const TEAM_NOTE_LABEL = 'Phoenix chef team note';
  const ROUTE_SEQ_LABEL = 'Phoenix route sequence';
  const ROUTE_OVERRIDE_LABEL = 'Phoenix route override';
  const ROUTE_UPDATED_LABEL = 'Phoenix route updated';

  const esc = (value) => {
    try { return escapeHtml(value); }
    catch { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  };
  const idOf = (order = {}) => String(order.id || order.booking_number || '').trim();
  const notesOf = (order = {}) => String(order.specialNotes || order.admin_notes || order.notes || '');
  const nowLabel = () => new Date().toLocaleString([], { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  const isEditable = (el) => !!(el && (['INPUT','TEXTAREA','SELECT'].includes(el.tagName) || el.isContentEditable));

  document.addEventListener('mousedown', (event) => {
    if (!isEditable(event.target) && isEditable(document.activeElement)) {
      setTimeout(() => { try { document.activeElement.blur(); } catch {} }, 0);
    }
  }, true);

  function readLine(notes = '', label = ''){
    const target = String(label).toLowerCase() + ':';
    const line = String(notes || '').split(/\r?\n/).find(row => row.toLowerCase().startsWith(target));
    return line ? line.slice(line.indexOf(':') + 1).trim() : '';
  }
  function removeLine(notes = '', label = ''){
    const target = String(label).toLowerCase() + ':';
    return String(notes || '').split(/\r?\n/).filter(row => !row.toLowerCase().startsWith(target)).join('\n').trim();
  }
  function upsertLine(notes = '', label = '', value = ''){
    let next = removeLine(notes, label);
    if (String(value ?? '').trim()) next = `${next ? next + '\n' : ''}${label}: ${String(value).trim()}`;
    return next.trim();
  }
  function moneySafe(value){ try { return money(value); } catch { const n = Number(value || 0); return '$' + (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)); } }
  function dateKeyOf(order = {}){ try { return normalizeDateKey(order) || ''; } catch { return String(order.eventDate || order.event_date || ''); } }
  function dateObjFromKey(key = ''){ const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; }
  function dateLabel(key = ''){ try { return shortDateHeading(key) || key; } catch { return key; } }
  function monthKey(key = ''){ return String(key).slice(0,7) || 'unknown'; }
  function monthLabel(key = ''){ const d = dateObjFromKey(`${key}-01`); return d ? d.toLocaleDateString([], { month:'long', year:'numeric' }) : key; }
  function mondayStart(d){ const x = new Date(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
  function weekKeyForDateKey(key = ''){ const d = dateObjFromKey(key); if (!d) return 'unknown-week'; const m = mondayStart(d); return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`; }
  function weekLabel(weekKey = ''){ const d = dateObjFromKey(weekKey); if (!d) return 'Week'; const end = new Date(d); end.setDate(end.getDate()+6); return `${d.toLocaleDateString([], {month:'short', day:'numeric'})} - ${end.toLocaleDateString([], {month:'short', day:'numeric'})}`; }
  function orderTimeValue(order = {}){ try { const dt = parseOrderDateTime(order); if (dt && Number.isFinite(dt.getTime())) return dt.getTime(); } catch {} return 9999999999999; }
  function routeSeq(order = {}){ const n = Number(readLine(notesOf(order), ROUTE_SEQ_LABEL)); return Number.isFinite(n) ? n : null; }
  function hasManualRoute(order = {}){ return routeSeq(order) !== null || /manual/i.test(readLine(notesOf(order), ROUTE_OVERRIDE_LABEL)); }
  function routeSort(a,b){ const as=routeSeq(a), bs=routeSeq(b); const av = as!==null ? as : orderTimeValue(a); const bv = bs!==null ? bs : orderTimeValue(b); return av-bv || String(idOf(a)).localeCompare(String(idOf(b))); }
  function chefById(id){ return (Array.isArray(CHEFS) ? CHEFS : []).find(c => String(c.id) === String(id)) || null; }
  function chefKey(order = {}){ return String(order.assignedChefId || order.assigned_chef_id || order.assignedChef || order.assigned_chef || 'unassigned').trim() || 'unassigned'; }
  function chefName(order = {}){ const key=chefKey(order); return order.assignedChef || order.assigned_chef || chefById(key)?.name || 'Needs chef'; }
  function primaryChefId(order = {}){ const key = chefKey(order); const chef = chefById(key) || (Array.isArray(CHEFS) ? CHEFS.find(c => c.name === order.assignedChef) : null); return chef?.id || key || 'unassigned'; }
  function billable(order = {}){ try { return Number(calculateOrderMoney(order).billableGuests || order.billableGuests || order.totalGuests || 0); } catch { return Number(order.billableGuests || order.totalGuests || 0); } }
  function recommendedChefCountForOrder(order = {}){ const b = billable(order); if (b > 75) return 4; if (b > 50) return 3; if (b > 25) return 2; return 1; }
  function requestedChefCount(order = {}){ const raw = Number(order.chefCountRequested || readLine(notesOf(order), TEAM_COUNT_LABEL)); return Math.min(4, Math.max(1, Number.isFinite(raw) && raw ? raw : recommendedChefCountForOrder(order))); }
  function chefTeamIds(order = {}){ const fromNotes = readLine(notesOf(order), TEAM_IDS_LABEL); const arr = fromNotes ? fromNotes.split(',').map(s=>s.trim()).filter(Boolean) : []; const primary = primaryChefId(order); return [...new Set([primary, ...arr].filter(Boolean).filter(id => !/unassigned|needs chef|pending/i.test(String(id))))]; }
  function chefTeamNames(order = {}){ const noteNames = readLine(notesOf(order), TEAM_NAMES_LABEL); if (noteNames) return noteNames.split('|').map(s=>s.trim()).filter(Boolean); const ids = chefTeamIds(order); const names = ids.map(id => chefById(id)?.name || (id === primaryChefId(order) ? chefName(order) : id)).filter(Boolean); return names.length ? names : [chefName(order)]; }
  function splitSummary(order = {}){ const count = requestedChefCount(order); const m = (typeof calculateOrderMoney === 'function' ? calculateOrderMoney(order) : {}) || {}; const base = Number(m.chefKeepsBeforeTip || 0); const each = count > 1 ? base / count : base; return count > 1 ? `${count} chefs · estimated split before tips: ${moneySafe(each)} each. Tips/cash should be split evenly unless manager overrides.` : '1 chef'; }
  function groupKey(order = {}){ const ids = chefTeamIds(order); return ids.length > 1 ? ids.sort().join('+') : primaryChefId(order); }
  function groupLabel(order = {}){ const names = chefTeamNames(order); return names.length > 1 ? names.join(' + ') : (names[0] || chefName(order)); }
  function hasCoords(order){ try { return orderHasCoords(order); } catch { return false; } }
  function foldersByDate(orders = []){
    const map = new Map();
    (Array.isArray(orders) ? orders : []).forEach(order => { const key = dateKeyOf(order) || 'Date pending'; if (!map.has(key)) map.set(key, []); map.get(key).push(order); });
    return [...map.entries()].sort(([a],[b]) => String(a).localeCompare(String(b))).map(([key, rows]) => ({ key, label: dateLabel(key), rows: rows.sort(routeSort).map((o,i)=>({...o, routeLabel:String(i+1)})) }));
  }
  function chooseDate(folders = [], previous = ''){
    if (!folders.length) return '';
    if (previous && folders.some(f => f.key === previous)) return previous;
    const today = new Date(); today.setHours(0,0,0,0);
    return (folders.find(f => { const d=dateObjFromKey(f.key); return d && d >= today; }) || folders[0]).key;
  }
  function syncRouteDateSelectV117(orders = [], preferred = ''){
    const folders = foldersByDate(orders);
    const selected = chooseDate(folders, preferred || routePlanDateSelect?.value || '');
    if (routePlanDateSelect) {
      routePlanDateSelect.innerHTML = folders.length ? folders.map(f => `<option value="${esc(f.key)}" ${f.key===selected?'selected':''}>${esc(f.label)} · ${f.rows.length} order${f.rows.length>1?'s':''}</option>`).join('') : '<option value="">No orders</option>';
      routePlanDateSelect.value = selected;
    }
    return { folders, selected, folder: folders.find(f => f.key === selected) || null };
  }
  try { ordersForRouteDate = (orders = [], dateKey = '') => { const f = foldersByDate(orders); const key = chooseDate(f, dateKey || routePlanDateSelect?.value || ''); return (f.find(x=>x.key===key)?.rows || []).map((o,i)=>({...o, routeLabel:String(i+1)})); }; } catch {}
  try { chooseDefaultRouteDate = (orders = []) => chooseDate(foldersByDate(orders)); } catch {}

  function statusForDate(rows = []){
    const total = rows.length;
    const assigned = rows.filter(o => !/needs chef|unassigned|pending/i.test(chefName(o))).length;
    const requiresMore = rows.filter(o => requestedChefCount(o) < recommendedChefCountForOrder(o)).length;
    const manual = rows.some(hasManualRoute);
    return { total, assigned, requiresMore, manual, chefCount: new Set(rows.map(groupKey)).size };
  }
  function renderMonthWeekBoard(folders = [], selected = ''){
    if (!folders.length) return '';
    const byMonth = new Map();
    folders.forEach(folder => { const mk = monthKey(folder.key); if (!byMonth.has(mk)) byMonth.set(mk, []); byMonth.get(mk).push(folder); });
    return `<div class="route-calendar-v117">${[...byMonth.entries()].map(([mk, monthFolders]) => {
      const byWeek = new Map();
      monthFolders.forEach(folder => { const wk = weekKeyForDateKey(folder.key); if (!byWeek.has(wk)) byWeek.set(wk, []); byWeek.get(wk).push(folder); });
      const monthCount = monthFolders.reduce((s,f)=>s+f.rows.length,0);
      return `<section class="route-month-v117"><header><b>${esc(monthLabel(mk))}</b><span>${monthCount} order${monthCount>1?'s':''}</span></header><div class="route-week-grid-v117">${[...byWeek.entries()].map(([wk, weekFolders]) => `<div class="route-week-v117"><div class="route-week-label-v117">${esc(weekLabel(wk))}</div><div class="route-day-row-v117">${weekFolders.map(folder => {
        const st = statusForDate(folder.rows);
        return `<button type="button" class="route-day-v117 ${folder.key===selected?'active':''}" data-v117-route-date="${esc(folder.key)}"><b>${esc(folder.label)}</b><span>${st.total} order${st.total>1?'s':''} · ${st.assigned} assigned · ${st.chefCount} route${st.chefCount>1?'s':''}</span><span class="${st.requiresMore?'bad':st.manual?'warn':'ok'}">${st.requiresMore?`${st.requiresMore} need more chefs`:st.manual?'manual sequence':'ready to review'}</span></button>`;
      }).join('')}</div></div>`).join('')}</div></section>`;
    }).join('')}</div>`;
  }
  function groupsForRows(rows = []){
    const map = new Map();
    rows.forEach(order => { const key = groupKey(order); if (!map.has(key)) map.set(key, []); map.get(key).push(order); });
    return [...map.entries()].map(([key, rows], idx) => ({ key, label: groupLabel(rows[0] || {}), colorClass: routeColorClass(key, idx), rows: rows.sort(routeSort).map((o,i)=>({...o, routeLabel:String(i+1)})), manual: rows.some(hasManualRoute) }));
  }
  function fallbackPoints(rows = []){
    const count = Math.max(1, rows.length);
    const preset = [[12,82],[26,64],[40,76],[52,48],[64,68],[78,38],[88,58],[72,18],[48,22],[20,32],[34,44],[58,86]];
    return rows.map((order, index) => {
      const p = preset[index] || [12 + ((index*17)%76), 82 - ((index*23)%64)];
      return { order, index, hasCoords:false, x:p[0], y:p[1] };
    });
  }
  function mapPoints(rows = []){
    const withCoords = rows.filter(hasCoords);
    if (withCoords.length >= 2) { try { return projectRoutePoints(rows).map((pt, i) => ({...pt, order: pt.order, index:i})); } catch {} }
    return fallbackPoints(rows);
  }
  function renderMap(rows = [], groups = []){
    if (!routeMapBoard) return;
    if (!rows.length) { routeMapBoard.innerHTML = '<div class="empty-state">Choose a date with orders to build a route plan.</div>'; return; }
    const pts = mapPoints(rows);
    const byId = new Map(pts.map(pt => [idOf(pt.order), pt]));
    const lines = groups.map(group => { const p = group.rows.map(o => byId.get(idOf(o))).filter(Boolean); if (p.length < 2) return ''; const path = p.map((pt,i)=>`${i?'L':'M'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' '); return `<path class="route-line ${group.colorClass}" d="${path}" />`; }).join('');
    const markers = pts.map(pt => { const order=pt.order; const group = groups.find(g => g.rows.some(o => idOf(o) === idOf(order))); const cls = group?.colorClass || routeColorClass('', pt.index); const href = searchMapUrl(order.address || ''); return `<a href="${href}" target="_blank" rel="noreferrer"><g class="route-marker ${cls}"><circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="5.4"></circle><text x="${pt.x.toFixed(2)}" y="${(pt.y+1.9).toFixed(2)}">${esc(order.routeLabel)}</text></g></a>`; }).join('');
    const labels = pts.map(pt => `<div class="route-map-label" style="left:${pt.x}%;top:${pt.y}%"><b>${esc(pt.order.routeLabel)}</b><span>${esc(firstReadableTime(pt.order.eventTime || 'Time pending'))}</span></div>`).join('');
    routeMapBoard.innerHTML = `<div class="route-map-canvas route-map-canvas-v117"><svg viewBox="0 0 100 100" role="img" aria-label="Phoenix Hibachi selected-day route map"><rect x="0" y="0" width="100" height="100" rx="8" class="route-map-bg"></rect><path class="route-grid" d="M10 25 H90 M10 50 H90 M10 75 H90 M25 10 V90 M50 10 V90 M75 10 V90"></path>${lines}${markers}</svg>${labels}</div>`;
  }
  function timeGapText(a,b){
    if (!b) return 'last stop';
    const av=orderTimeValue(a), bv=orderTimeValue(b);
    if (!Number.isFinite(av)||!Number.isFinite(bv)||av>=9999999999999||bv>=9999999999999) return 'time pending';
    const min = Math.round((bv-av)/60000);
    if (min < 0) return `${Math.abs(min)} min time conflict`;
    const h=Math.floor(min/60), m=min%60;
    return `${h?`${h} hr `:''}${m?`${m} min`:''}`.trim() + ' apart · verify drive';
  }
  function routeRisk(order,next){ const txt=timeGapText(order,next); const cls=/conflict/i.test(txt)?'high':/pending|verify/i.test(txt)?'warn':'ok'; return `<small class="route-risk ${cls}">${esc(txt)}</small>`; }
  function maybeConflictAfterMove(rows = [], fromIndex, toIndex){
    const ordered=[...rows]; [ordered[fromIndex], ordered[toIndex]]=[ordered[toIndex], ordered[fromIndex]];
    return ordered.some((o,i)=> { const n=ordered[i+1]; if(!n) return false; return orderTimeValue(n) < orderTimeValue(o); });
  }
  function orderGroupFor(orderId){
    const orders = getDashboardOrders?.() || [];
    const target = orders.find(o => idOf(o) === String(orderId));
    if (!target) return { target:null, rows:[] };
    const dk = dateKeyOf(target), gk = groupKey(target);
    const rows = orders.filter(o => dateKeyOf(o) === dk && groupKey(o) === gk).sort(routeSort);
    return { target, rows };
  }
  async function patchNotes(orderId, notes){
    const localPatch = { specialNotes: notes, admin_notes: notes };
    try { saveStoredOrders?.((getStoredOrders?.() || []).map(o => idOf(o) === String(orderId) ? {...o, ...localPatch} : o)); } catch {}
    try { if (Array.isArray(remoteOrdersCache)) remoteOrdersCache = remoteOrdersCache.map(o => idOf(o) === String(orderId) ? {...o, ...localPatch} : o); } catch {}
    try { const client=initSupabaseClient?.(); if (client && supabaseSession) await client.from('bookings').update({admin_notes:notes}).eq('booking_number', orderId); } catch (error) { console.warn('V117 note patch failed:', error); }
  }
  async function moveRoute(orderId, direction){
    const { rows } = orderGroupFor(orderId); const idx = rows.findIndex(o => idOf(o) === String(orderId)); const to = idx + Number(direction||0);
    if (idx < 0 || to < 0 || to >= rows.length) return;
    if (maybeConflictAfterMove(rows, idx, to) && !confirm('This manual route order appears to conflict with party start times. Continue anyway as manager override?')) return;
    const ordered=[...rows]; [ordered[idx], ordered[to]]=[ordered[to], ordered[idx]];
    for (const [i,order] of ordered.entries()) {
      let notes=notesOf(order);
      notes=upsertLine(notes, ROUTE_SEQ_LABEL, String((i+1)*10));
      notes=upsertLine(notes, ROUTE_OVERRIDE_LABEL, 'Manual manager route order');
      notes=upsertLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      await patchNotes(idOf(order), notes);
    }
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    setTimeout(()=>{ try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} },150);
  }
  async function resetRoute(orderId){
    const { rows } = orderGroupFor(orderId);
    for (const order of rows) {
      let notes=notesOf(order); notes=removeLine(notes, ROUTE_SEQ_LABEL); notes=removeLine(notes, ROUTE_OVERRIDE_LABEL); notes=upsertLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      await patchNotes(idOf(order), notes);
    }
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    setTimeout(()=>{ try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} },150);
  }

  try {
    renderRoutePlanner = function(orders = [], role = currentDashboardRole){
      if (!routePlanSummary || !routeMapBoard || !routePlanDateSelect) return;
      if (!['Admin','Manager','Customer Service','Chef'].includes(role)) { routeMapBoard.innerHTML = '<div class="empty-state">Route map is only visible to staff and chef accounts.</div>'; routePlanSummary.innerHTML=''; return; }
      const { folders, selected, folder } = syncRouteDateSelectV117(orders, routePlanDateSelect.value || '');
      const rows = (folder?.rows || []).map((o,i)=>({...o, routeLabel:String(i+1)}));
      const groups = groupsForRows(rows);
      renderMap(rows, groups);
      if (!folders.length) { routePlanSummary.innerHTML = '<p class="small-muted">No orders yet. Future bookings will appear by month, week, and date.</p>'; return; }
      const canEdit = ['Admin','Manager','Customer Service'].includes(role);
      const missing = rows.filter(o => !hasCoords(o)).length;
      const board = renderMonthWeekBoard(folders, selected);
      const legend = groups.map(g => `<span class="route-legend ${g.colorClass}"><i></i>${esc(g.label)} · ${esc(g.rows.map(o=>o.routeLabel).join(' → ') || 'No stops')} <em>${g.manual ? 'Manual override' : 'Time order'}</em></span>`).join('');
      const chains = groups.map(group => {
        const stops = group.rows.map((order,idx)=>{
          const next=group.rows[idx+1]; const req=recommendedChefCountForOrder(order); const selectedCount=requestedChefCount(order); const split=splitSummary(order);
          const buttons = canEdit ? `<div class="route-manual-actions"><button type="button" data-v117-route-move="-1" data-order-id="${esc(idOf(order))}" ${idx===0?'disabled':''}>Move earlier</button><button type="button" data-v117-route-move="1" data-order-id="${esc(idOf(order))}" ${idx===group.rows.length-1?'disabled':''}>Move later</button><button type="button" data-v117-route-reset="${esc(idOf(order))}">Use time order</button></div>` : '';
          const teamWarn = selectedCount < req ? `<div class="route-team-warning-v117">${esc(billable(order))} billable guests requires ${req} chefs. Current setting: ${selectedCount}.</div>` : '';
          return `<article class="route-stop route-stop-v117 ${hasManualRoute(order)?'manual':''}"><div class="route-stop-head"><strong><span class="route-seq-v117">${esc(order.routeLabel)}</span>${esc(firstReadableTime(order.eventTime || 'Time pending'))}</strong>${routeRisk(order,next)}</div><span>${esc(order.name || 'Guest')} · ${esc(order.address || 'No address')}</span><small>${esc(groupLabel(order))} · ${esc(billable(order))} billable guests · ${hasManualRoute(order)?'manual sequence':'party-start-time sequence'}</small><div class="route-team-split-v117">${esc(split)}</div>${teamWarn}${buttons}</article>`;
        }).join('');
        return `<section class="route-chain-v116 route-chain-v117"><header><b>${esc(group.label)}</b><span>${group.manual?'Manual override active':'Default: party start time order'}</span></header><div class="route-stop-list route-stop-list-v116">${stops}</div></section>`;
      }).join('');
      routePlanSummary.innerHTML = `${board}<div class="route-selected-day-v117"><div><b>Selected route date: ${esc(folder?.label || selected)}</b><div class="route-sequence-note-v117">Only this date is analyzed below. Same-day orders are numbered 1-${rows.length || 0}; route colors represent chef chains.</div></div><div>${rows.length} order${rows.length>1?'s':''}</div></div><div class="route-v114-note route-v116-note"><b>Route logic:</b> First choose month/week/date. Phoenix fixes the selected day’s 1-${rows.length || 0} stops, then connects each chef/team in a different color. If a manual assignment conflicts with time order, staff must confirm the override.</div><div class="route-legend-row">${legend}</div>${missing ? `<p class="route-warning">${missing} order(s) on this date do not have saved coordinates. Map positions are fixed planning markers until Geoapify/Google routing is connected.</p>` : ''}${chains}`;
    };
  } catch(error) { console.warn('V117 route planner override failed:', error); }

  document.addEventListener('click', (event)=>{
    const day=event.target.closest?.('[data-v117-route-date]');
    if (day) { const key=day.getAttribute('data-v117-route-date')||''; if(routePlanDateSelect) routePlanDateSelect.value=key; try{renderRoutePlanner(getDashboardOrders?.()||[], currentDashboardRole||'Admin');}catch{} return; }
    const mv=event.target.closest?.('[data-v117-route-move]');
    if (mv) { event.preventDefault(); event.stopPropagation(); mv.disabled=true; moveRoute(mv.getAttribute('data-order-id'), Number(mv.getAttribute('data-v117-route-move'))).finally(()=>mv.disabled=false); return false; }
    const reset=event.target.closest?.('[data-v117-route-reset]');
    if (reset) { event.preventDefault(); event.stopPropagation(); if(confirm('Reset this team to party-start-time order?')) resetRoute(reset.getAttribute('data-v117-route-reset')); return false; }
  }, true);

  // Customer-facing chef count request in booking form.
  function ensureChefCountBookingControl(){
    if (document.getElementById('chefTeamRequestV117')) return;
    const guestStep = document.getElementById('billableGuestCard')?.closest('.booking-step');
    if (!guestStep) return;
    const box = document.createElement('div');
    box.id = 'chefTeamRequestV117';
    box.className = 'chef-team-request-v117';
    box.innerHTML = `<h4>Chef team / 师傅数量</h4><p class="helper-line">More than 25 billable guests normally requires 2 chefs. Extra chef pricing is confirmed by Phoenix before final acceptance.</p><div class="chef-team-grid-v117"><label>Requested chef count<select id="chefCountRequestedInput" name="chefCountRequested"><option value="auto">Auto / Phoenix recommends</option><option value="1">1 chef</option><option value="2">2 chefs</option><option value="3">3 chefs</option><option value="4">4 chefs</option></select></label><div><b class="chef-team-recommend-v117" id="chefTeamRecommendV117">Recommended: 1 chef</b><p class="helper-line" id="chefTeamWarnV117">Final chef team and extra chef fee are confirmed manually.</p></div></div><input type="hidden" id="chefTeamRequestNoteInput" name="chefTeamRequestNote" value="">`;
    guestStep.appendChild(box);
    updateChefCountRecommendation();
  }
  function updateChefCountRecommendation(){
    const recEl=document.getElementById('chefTeamRecommendV117'), warn=document.getElementById('chefTeamWarnV117'), note=document.getElementById('chefTeamRequestNoteInput'), sel=document.getElementById('chefCountRequestedInput');
    if (!recEl || !sel) return;
    const b = (()=>{ try { return Number(actualBillableGuestCount(bookingState)); } catch { return 10; } })();
    const req = b > 75 ? 4 : b > 50 ? 3 : b > 25 ? 2 : 1;
    const chosen = sel.value === 'auto' ? req : Number(sel.value || req);
    recEl.textContent = `Recommended: ${req} chef${req>1?'s':''} for ${b} billable guests`;
    if (warn) { warn.textContent = chosen < req ? `This party should use at least ${req} chefs. Phoenix may require a manager adjustment.` : `Selected/requested: ${chosen} chef${chosen>1?'s':''}. Extra chef fee is manager-confirmed.`; warn.className = chosen < req ? 'helper-line chef-team-warning-input-v117' : 'helper-line'; }
    if (note) note.value = `Customer requested ${sel.value === 'auto' ? 'Auto / Phoenix recommends' : chosen + ' chef(s)'}; recommended ${req} chef(s) for ${b} billable guests.`;
  }
  ['input','change','click'].forEach(type => document.addEventListener(type, (event)=>{ if (event.target?.closest?.('#bookingModal, #chefTeamRequestV117, [data-counter]')) setTimeout(updateChefCountRecommendation, 0); }, true));
  setTimeout(ensureChefCountBookingControl, 600);
  setTimeout(ensureChefCountBookingControl, 1600);

  if (typeof buildOrderFromForm === 'function' && !window.__PHX_V117_BUILD_ORDER_WRAP__) {
    window.__PHX_V117_BUILD_ORDER_WRAP__ = true;
    const previousBuildOrderFromForm = buildOrderFromForm;
    buildOrderFromForm = function(form){
      const order = previousBuildOrderFromForm(form);
      try {
        const fd = new FormData(form);
        const raw = String(fd.get('chefCountRequested') || 'auto');
        const rec = recommendedChefCountForOrder(order);
        const count = raw === 'auto' ? rec : Math.min(4, Math.max(1, Number(raw || rec)));
        order.chefCountRequested = count;
        let notes = String(order.specialNotes || '');
        notes = upsertLine(notes, TEAM_COUNT_LABEL, String(count));
        notes = upsertLine(notes, TEAM_NOTE_LABEL, String(fd.get('chefTeamRequestNote') || `Customer requested ${count} chef(s).`));
        order.specialNotes = notes;
      } catch(error) { console.warn('V117 chef count order patch skipped:', error); }
      return order;
    };
  }

  // Admin/manager chef team controls inside order details panel.
  function allOrders(){ const map=new Map(); const add=o=>{ if(o&&idOf(o)) map.set(idOf(o),o); }; try{(getStoredOrders?.()||[]).forEach(add);}catch{} try{(Array.isArray(remoteOrdersCache)?remoteOrdersCache:[]).forEach(add);}catch{} try{(getDashboardOrders?.()||[]).forEach(add);}catch{} return [...map.values()]; }
  function findOrder(id){ return allOrders().find(o => idOf(o) === String(id)); }
  function chefTeamAdminHtml(order){
    const id=idOf(order); const count=requestedChefCount(order); const ids=chefTeamIds(order); const rec=recommendedChefCountForOrder(order);
    const checks=(Array.isArray(CHEFS)?CHEFS:[]).map(c => `<label><input type="checkbox" data-v117-team-chef="${esc(id)}" value="${esc(c.id)}" ${ids.includes(c.id)?'checked':''}> ${esc(c.name)}</label>`).join('');
    return `<section class="chef-team-admin-v117" data-v117-team-box="${esc(id)}"><h4>Chef team / 多师傅炒台</h4><div class="chef-team-admin-grid-v117"><label>Chef count<select data-v117-team-count="${esc(id)}"><option value="1" ${count===1?'selected':''}>1 chef</option><option value="2" ${count===2?'selected':''}>2 chefs</option><option value="3" ${count===3?'selected':''}>3 chefs</option><option value="4" ${count===4?'selected':''}>4 chefs</option></select></label><div class="chef-checks-v117">${checks}</div><button type="button" data-v117-save-team="${esc(id)}">Save team</button></div><p class="helper-line">Recommended for this order: ${rec} chef${rec>1?'s':''}. If 2+ chefs cook together, headcount payout, travel fee and tips should be split evenly unless manager overrides.</p></section>`;
  }
  function injectTeamControls(){
    document.querySelectorAll('.v102-order-panel').forEach(panel => {
      const id = panel.getAttribute('data-v102-panel'); if (!id || panel.querySelector('[data-v117-team-box]')) return;
      const order = findOrder(id); if (!order) return;
      const boxes = panel.querySelector('.v102-tool-boxes') || panel;
      boxes.insertAdjacentHTML('beforeend', chefTeamAdminHtml(order));
    });
  }
  async function saveTeam(orderId){
    const order=findOrder(orderId); if(!order) return alert('Order not found.');
    const count=Number(document.querySelector(`[data-v117-team-count="${CSS.escape(String(orderId))}"]`)?.value || recommendedChefCountForOrder(order));
    const selected=[...document.querySelectorAll(`[data-v117-team-chef="${CSS.escape(String(orderId))}"]:checked`)].map(el=>el.value);
    const names=selected.map(id=>chefById(id)?.name||id).filter(Boolean);
    let notes=notesOf(order);
    notes=upsertLine(notes, TEAM_COUNT_LABEL, String(Math.min(4,Math.max(1,count))));
    notes=upsertLine(notes, TEAM_IDS_LABEL, selected.join(','));
    notes=upsertLine(notes, TEAM_NAMES_LABEL, names.join(' | '));
    notes=upsertLine(notes, TEAM_NOTE_LABEL, `${count} chef(s) assigned/requested. Split headcount fee, travel fee and tips evenly unless manager overrides.`);
    await patchNotes(orderId, notes);
    alert('Chef team saved. Route plan and customer order details will use the updated team notes.');
    try { renderDashboard?.(currentDashboardRole || 'Admin'); } catch {}
    setTimeout(()=>{ try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); injectTeamControls(); } catch {} }, 250);
  }
  document.addEventListener('click', (event)=>{ const btn=event.target.closest?.('[data-v117-save-team]'); if(!btn) return; event.preventDefault(); btn.disabled=true; saveTeam(btn.getAttribute('data-v117-save-team')).finally(()=>btn.disabled=false); }, true);
  const teamObserver = new MutationObserver(()=>injectTeamControls());
  setTimeout(()=>{ try { teamObserver.observe(document.body,{childList:true,subtree:true}); injectTeamControls(); } catch {} }, 800);

  // Customer lookup/member cards: add chef team note when relevant.
  function injectCustomerTeamNotes(){
    document.querySelectorAll('.lookup-card, .customer-order-card, article').forEach(card => {
      if (card.querySelector('.customer-team-note-v117')) return;
      const text = card.textContent || '';
      const order = allOrders().find(o => idOf(o) && text.includes(idOf(o)));
      if (!order) return;
      const count = requestedChefCount(order), rec = recommendedChefCountForOrder(order);
      if (count <= 1 && rec <= 1) return;
      const names = chefTeamNames(order).filter(n => !/pending|unassigned|needs chef/i.test(n));
      const note = document.createElement('div');
      note.className = 'customer-team-note-v117';
      note.textContent = names.length ? `Chef team: ${names.join(' + ')} · ${count} chef${count>1?'s':''} planned.` : `Chef team: ${count} chef${count>1?'s':''} planned. Phoenix will confirm assigned chefs.`;
      card.appendChild(note);
    });
  }
  const customerObserver = new MutationObserver(()=>injectCustomerTeamNotes());
  setTimeout(()=>{ try { customerObserver.observe(document.body,{childList:true,subtree:true}); injectCustomerTeamNotes(); } catch {} }, 1000);

  setTimeout(()=>{ try { renderRoutePlanner?.(getDashboardOrders?.() || [], currentDashboardRole || 'Admin'); } catch {} }, 1200);
})();

/* =============================================================
   PHX V118 — Month / Week / Day dispatch board
   - Route plan starts at month overview, then week filter, then selected day.
   - The map only analyzes the selected date.
   - Selected day orders are shown as list cards similar to order dashboard.
   - Same-day route stops are numbered 1..N; chef/team colors represent chains.
   - Manual route order remains manager override with conflict warning.
   ============================================================= */
(function initPHXV118MonthWeekDayDispatchBoard(){
  if (window.__PHX_V118_ROUTE_BOARD_READY__) return;
  window.__PHX_V118_ROUTE_BOARD_READY__ = true;

  const STATE_KEY = '__phx_v118_route_state';
  const ROUTE_SEQ_LABEL = 'Phoenix route sequence';
  const ROUTE_OVERRIDE_LABEL = 'Phoenix route override';
  const ROUTE_UPDATED_LABEL = 'Phoenix route updated';
  const ROUTE_ACK_LABEL = 'Phoenix route conflict acknowledged';

  const state = window[STATE_KEY] || (window[STATE_KEY] = { month: '', week: '', date: '', mode: 'month' });

  const esc = (value='') => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const idOf = (order={}) => String(order.id || order.booking_number || order.bookingNumber || order.order_id || '');
  const notesOf = (order={}) => String(order.specialNotes || order.admin_notes || order.notes || '');
  const nowLabel = () => new Date().toLocaleString([], { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  const moneyFmt = (n) => `$${Number(n || 0).toFixed(2)}`;
  const cap = (s='') => String(s || '').trim();

  function readLine(notes, label){
    const re = new RegExp(`${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*:\\s*([^\\n]+)`, 'i');
    return String(notes || '').match(re)?.[1]?.trim() || '';
  }
  function upsertLine(notes, label, value){
    const clean = String(notes || '').trim();
    const line = `${label}: ${value}`;
    const re = new RegExp(`${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*:[^\\n]*`, 'i');
    if (re.test(clean)) return clean.replace(re, line);
    return [clean, line].filter(Boolean).join('\n');
  }
  function removeLine(notes, label){
    const re = new RegExp(`\\n?${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*:[^\\n]*`, 'ig');
    return String(notes || '').replace(re, '').trim();
  }

  function parseDateKey(raw=''){
    raw = String(raw || '').trim();
    if (!raw) return '';
    let m = raw.match(/(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    // Try English display dates such as July 2, 2026.
    const d = new Date(raw.replace(/上午|下午/g, '').replace(/，/g, ','));
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return '';
  }
  function dateKeyOf(order={}){
    return parseDateKey(order.event_date || order.eventDate || order.date || '') || parseDateKey(order.created_at || order.createdAt || '') || 'unscheduled';
  }
  function dateObj(key=''){
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [y,m,d] = key.split('-').map(Number);
    return new Date(y, m-1, d);
  }
  function dateLabel(key=''){
    const d = dateObj(key);
    return d ? d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric', year:'numeric' }) : 'Date pending';
  }
  function compactDateLabel(key=''){
    const d = dateObj(key);
    return d ? d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : 'Date pending';
  }
  function monthKey(key=''){
    return /^\d{4}-\d{2}/.test(key) ? key.slice(0,7) : 'unscheduled';
  }
  function monthLabel(key=''){
    if (key === 'unscheduled') return 'Date pending';
    const d = dateObj(`${key}-01`);
    return d ? d.toLocaleDateString([], { month:'long', year:'numeric' }) : key;
  }
  function mondayStart(d){
    const x = new Date(d); const day = x.getDay() || 7; x.setDate(x.getDate() - day + 1); x.setHours(0,0,0,0); return x;
  }
  function weekKey(key=''){
    const d = dateObj(key); if (!d) return 'unscheduled-week';
    const m = mondayStart(d); return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`;
  }
  function weekLabel(key=''){
    const d = dateObj(key); if (!d) return 'Date pending week';
    const end = new Date(d); end.setDate(end.getDate()+6);
    return `${d.toLocaleDateString([], {month:'short', day:'numeric'})} - ${end.toLocaleDateString([], {month:'short', day:'numeric'})}`;
  }

  function parseTimeMinutes(raw=''){
    raw = String(raw || '').replace(/上午/gi, ' AM').replace(/下午/gi, ' PM');
    const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!m) return 24 * 60 + 999;
    let h = Number(m[1]); const min = Number(m[2] || 0); const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }
  function firstTime(raw=''){
    const txt = String(raw || 'Time pending').trim();
    const m = txt.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|上午|下午)?/i);
    return m ? m[0].replace(/\s+/g,' ') : txt;
  }
  function minutesToGapText(mins){
    if (!Number.isFinite(mins)) return 'Drive pending';
    if (mins < 0) return `${Math.abs(mins)} min time-order conflict`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `${h} hr ${m ? `${m} min ` : ''}apart · verify drive` : `${m} min apart · verify drive`;
  }
  function routeSeq(order={}){
    const n = Number(readLine(notesOf(order), ROUTE_SEQ_LABEL));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function isManual(order={}){
    return routeSeq(order) !== null || /manual/i.test(readLine(notesOf(order), ROUTE_OVERRIDE_LABEL));
  }
  function sortByTime(a,b){
    return parseTimeMinutes(a.event_time || a.eventTime) - parseTimeMinutes(b.event_time || b.eventTime) || idOf(a).localeCompare(idOf(b));
  }
  function routeSort(a,b){
    const as = routeSeq(a), bs = routeSeq(b);
    if (as !== null || bs !== null) return (as ?? 9999) - (bs ?? 9999) || sortByTime(a,b);
    return sortByTime(a,b);
  }
  function chefName(order={}){
    const notes = notesOf(order);
    const team = readLine(notes, 'Phoenix chef team') || readLine(notes, 'Assigned chef team');
    if (team) return team;
    return order.assignedChef || order.assigned_chef || order.chef_name || order.chef || 'Unassigned';
  }
  function chefKey(order={}){
    return chefName(order).toLowerCase().replace(/[^a-z0-9]+/g,'-') || 'unassigned';
  }
  function totalGuests(order={}){
    const m = Number(order.billableGuests || order.billable_guests || order.totalGuests || order.total_guests || order.guests || 0);
    return Number.isFinite(m) ? m : 0;
  }
  function routeColorClass(key='', idx=0){
    let sum = 0; for (const ch of String(key)) sum += ch.charCodeAt(0);
    return `route-color-${(sum + idx) % 6 + 1}`;
  }
  function statusText(order={}){
    return order.status || order.booking_status || 'Pending';
  }
  function safeTotal(order={}){
    if (typeof calculateOrderMoney === 'function') {
      try { return calculateOrderMoney(order)?.guestTotalBeforeDeposit || 0; } catch {}
    }
    return Number(order.total || order.estimated_total || order.final_total || 0);
  }

  function allOrders(){
    try { return (getDashboardOrders?.() || []).filter(Boolean); } catch { return []; }
  }
  function visibleOrders(orders){
    return (orders || []).filter(o => String(o.status || '').toLowerCase() !== 'deleted');
  }
  function buildGroups(orders=[]){
    const rows = visibleOrders(orders).map(o => ({ ...o, _dateKey: dateKeyOf(o), _monthKey: monthKey(dateKeyOf(o)), _weekKey: weekKey(dateKeyOf(o)) }));
    const byMonth = new Map();
    rows.forEach(o => { if (!byMonth.has(o._monthKey)) byMonth.set(o._monthKey, []); byMonth.get(o._monthKey).push(o); });
    return [...byMonth.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([key, rows]) => {
      const byWeek = new Map(); rows.forEach(o => { if (!byWeek.has(o._weekKey)) byWeek.set(o._weekKey, []); byWeek.get(o._weekKey).push(o); });
      const weeks = [...byWeek.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([wk, weekRows]) => {
        const byDay = new Map(); weekRows.forEach(o => { if (!byDay.has(o._dateKey)) byDay.set(o._dateKey, []); byDay.get(o._dateKey).push(o); });
        const days = [...byDay.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([dk, dayRows]) => ({ key: dk, label: compactDateLabel(dk), fullLabel: dateLabel(dk), rows: dayRows.sort(routeSort) }));
        return { key: wk, label: weekLabel(wk), rows: weekRows.sort(routeSort), days };
      });
      return { key, label: monthLabel(key), rows: rows.sort(routeSort), weeks };
    });
  }
  function currentSelection(groups){
    if (!groups.length) return { month:null, week:null, day:null };
    let month = groups.find(m => m.key === state.month) || groups.find(m => m.key !== 'unscheduled') || groups[0];
    state.month = month.key;
    let week = state.week ? month.weeks.find(w => w.key === state.week) : null;
    if (!week && state.mode !== 'month') week = month.weeks[0] || null;
    if (week) state.week = week.key;
    let day = null;
    if (state.date) day = (week ? week.days : month.weeks.flatMap(w => w.days)).find(d => d.key === state.date) || null;
    if (!day && state.mode === 'day') day = (week?.days || month.weeks.flatMap(w => w.days))[0] || null;
    if (day) { state.date = day.key; state.week = day.key === 'unscheduled' ? 'unscheduled-week' : weekKey(day.key); }
    return { month, week, day };
  }
  function stats(rows=[]){
    const assigned = rows.filter(o => !/^unassigned$/i.test(chefName(o))).length;
    const confirmed = rows.filter(o => /confirm|accept/i.test(statusText(o))).length;
    return { assigned, confirmed, total: rows.length };
  }

  function renderMapForDay(day){
    if (!routeMapBoard) return;
    if (!day || !day.rows.length) {
      routeMapBoard.innerHTML = '<div class="route-map-empty-v118"><b>Select a day to build route map</b><span>Choose month → week → date. The map only analyzes the selected day.</span></div>';
      return;
    }
    const rows = day.rows.sort(routeSort).map((o,i) => ({...o, routeLabel: String(i+1)}));
    const byChef = new Map();
    rows.forEach(o => { const key = chefKey(o); if (!byChef.has(key)) byChef.set(key, []); byChef.get(key).push(o); });
    const chefKeys = [...byChef.keys()];
    const laneY = (keyIndex) => chefKeys.length <= 1 ? 52 : 22 + (keyIndex * (58 / Math.max(1, chefKeys.length - 1)));
    const pts = rows.map((order, i) => {
      const ck = chefKey(order); const groupIndex = chefKeys.indexOf(ck);
      const groupRows = byChef.get(ck) || [];
      const groupPos = Math.max(0, groupRows.findIndex(o => idOf(o) === idOf(order)));
      const groupTotal = Math.max(1, groupRows.length - 1);
      const x = groupRows.length === 1 ? (rows.length === 1 ? 50 : 14 + (i * 72 / Math.max(1, rows.length - 1))) : 14 + (groupPos * 72 / groupTotal);
      const y = laneY(groupIndex) + ((i % 2) ? 4 : -4);
      return { order, x, y, colorClass: routeColorClass(ck, groupIndex) };
    });
    const byId = new Map(pts.map(p => [idOf(p.order), p]));
    const lines = [...byChef.entries()].map(([ck, groupRows], idx) => {
      const p = groupRows.map(o => byId.get(idOf(o))).filter(Boolean);
      if (p.length < 2) return '';
      const path = p.map((pt, j) => `${j ? 'L' : 'M'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ');
      return `<path class="route-line ${routeColorClass(ck, idx)}" d="${path}" />`;
    }).join('');
    const markers = pts.map(pt => {
      const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pt.order.address || '')}`;
      return `<a href="${href}" target="_blank" rel="noreferrer"><g class="route-marker ${pt.colorClass}"><circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="5.8"></circle><text x="${pt.x.toFixed(2)}" y="${(pt.y+1.9).toFixed(2)}">${esc(pt.order.routeLabel)}</text></g></a>`;
    }).join('');
    const labels = pts.map(pt => `<div class="route-map-label route-map-label-v118" style="left:${pt.x}%;top:${pt.y}%"><b>${esc(pt.order.routeLabel)}</b><span>${esc(firstTime(pt.order.eventTime || pt.order.event_time))}</span></div>`).join('');
    routeMapBoard.innerHTML = `<div class="route-map-canvas route-map-canvas-v118"><svg viewBox="0 0 100 100" role="img" aria-label="Selected day route map"><rect x="0" y="0" width="100" height="100" rx="8" class="route-map-bg"></rect><path class="route-grid" d="M10 25 H90 M10 50 H90 M10 75 H90 M25 10 V90 M50 10 V90 M75 10 V90"></path>${lines}${markers}</svg>${labels}</div>`;
  }

  function dayOrderCard(order, index, rows){
    const next = rows[index+1];
    const time = firstTime(order.eventTime || order.event_time || 'Time pending');
    const gap = next ? minutesToGapText(parseTimeMinutes(next.eventTime || next.event_time) - parseTimeMinutes(order.eventTime || order.event_time)) : 'Last stop';
    const cls = /conflict/i.test(gap) ? 'bad' : /verify|pending/i.test(gap) ? 'warn' : 'ok';
    const chef = chefName(order);
    return `<article class="route-day-order-v118 ${isManual(order) ? 'manual' : ''}">
      <div class="route-day-order-num-v118">${index+1}</div>
      <div class="route-day-order-main-v118">
        <header><b>${esc(idOf(order) || `Order ${index+1}`)}</b><span>${esc(statusText(order))}</span></header>
        <p><strong>${esc(time)}</strong> · ${esc(order.name || 'Guest')} · ${esc(order.phone || '')}</p>
        <p>${esc(order.address || 'No address')}</p>
        <small>${esc(chef)} · ${esc(totalGuests(order))} guests · ${esc(order.package || order.packageName || 'Package pending')} · ${moneyFmt(safeTotal(order))}</small>
      </div>
      <div class="route-day-order-side-v118">
        <span class="route-gap-badge-v118 ${cls}">${esc(gap)}</span>
        <div class="route-manual-actions route-manual-actions-v118"><button type="button" data-v118-route-move="-1" data-order-id="${esc(idOf(order))}" ${index===0?'disabled':''}>Move earlier</button><button type="button" data-v118-route-move="1" data-order-id="${esc(idOf(order))}" ${index===rows.length-1?'disabled':''}>Move later</button><button type="button" data-v118-route-reset="${esc(idOf(order))}">Use time order</button></div>
      </div>
    </article>`;
  }

  function renderControls(groups, sel){
    const months = `<div class="route-month-tabs-v118">${groups.map(m => `<button type="button" class="route-month-tab-v118 ${m.key===sel.month?.key?'active':''}" data-v118-month="${esc(m.key)}"><b>${esc(m.label)}</b><span>${m.rows.length} orders</span></button>`).join('')}</div>`;
    const weekTabs = sel.month ? `<div class="route-week-tabs-v118"><button type="button" class="route-week-tab-v118 ${state.mode==='month'?'active':''}" data-v118-month-overview="1">All month · ${sel.month.rows.length}</button>${sel.month.weeks.map((w, i) => `<button type="button" class="route-week-tab-v118 ${state.week===w.key && state.mode!=='month'?'active':''}" data-v118-week="${esc(w.key)}"><b>Week ${i+1}</b><span>${esc(w.label)} · ${w.rows.length}</span></button>`).join('')}</div>` : '';
    const week = sel.week || sel.month?.weeks[0];
    const dayTabs = week && state.mode !== 'month' ? `<div class="route-day-tabs-v118">${week.days.map(d => `<button type="button" class="route-day-tab-v118 ${state.date===d.key?'active':''}" data-v118-day="${esc(d.key)}"><b>${esc(d.label)}</b><span>${d.rows.length} order${d.rows.length>1?'s':''}</span></button>`).join('')}</div>` : '';
    return `<section class="route-board-controls-v118"><div class="route-board-heading-v118"><div><b>Dispatch calendar / 派单日历</b><span>Pick month → week → day. Route map only uses the selected day.</span></div><div>${sel.month ? `${sel.month.rows.length} month orders` : 'No orders'}</div></div>${months}${weekTabs}${dayTabs}</section>`;
  }

  function renderMonthOverview(sel){
    if (!sel.month) return '';
    return `<section class="route-month-overview-v118"><header><b>${esc(sel.month.label)} order list</b><span>Select a week to hide other weeks and start daily dispatch.</span></header>${sel.month.weeks.map((w, wi) => {
      const st = stats(w.rows);
      return `<div class="route-week-block-v118"><button type="button" class="route-week-block-head-v118" data-v118-week="${esc(w.key)}"><b>Week ${wi+1}: ${esc(w.label)}</b><span>${st.total} orders · ${st.assigned} assigned · ${st.confirmed} confirmed</span></button><div class="route-week-days-v118">${w.days.map(d => `<button type="button" data-v118-day="${esc(d.key)}"><b>${esc(d.label)}</b><span>${d.rows.length} order${d.rows.length>1?'s':''}</span></button>`).join('')}</div></div>`;
    }).join('')}</section>`;
  }

  function renderWeekOverview(sel){
    const week = sel.week; if (!week) return '';
    return `<section class="route-week-overview-v118"><header><b>${esc(week.label)}</b><span>Click a date below to show that day’s route map and order list.</span></header><div class="route-date-list-v118">${week.days.map(d => {
      const st = stats(d.rows);
      const chefs = [...new Set(d.rows.map(chefName))].filter(Boolean).join(' / ') || 'Unassigned';
      return `<button type="button" class="route-date-card-v118 ${state.date===d.key?'active':''}" data-v118-day="${esc(d.key)}"><b>${esc(d.fullLabel)}</b><span>${st.total} orders · ${st.assigned} assigned · ${st.confirmed} confirmed</span><small>${esc(chefs)}</small></button>`;
    }).join('')}</div></section>`;
  }

  function renderSelectedDay(sel){
    const day = sel.day; if (!day) return '<section class="route-selected-day-v118 empty"><b>No date selected</b><span>Choose a day to route and dispatch.</span></section>';
    const rows = day.rows.sort(routeSort).map((o,i) => ({...o, routeLabel:String(i+1)}));
    const byChef = new Map(); rows.forEach(o => { const k=chefKey(o); if(!byChef.has(k)) byChef.set(k, []); byChef.get(k).push(o); });
    const legend = [...byChef.entries()].map(([k, groupRows], idx) => `<span class="route-legend ${routeColorClass(k, idx)}"><i></i>${esc(chefName(groupRows[0]))}: ${esc(groupRows.map((_,i)=>String(i+1)).join(' → '))}</span>`).join('');
    return `<section class="route-selected-day-v118"><header><div><b>Selected day: ${esc(day.fullLabel)}</b><span>${rows.length} orders. Sequence numbers 1-${rows.length}; route colors represent chef/team chains.</span></div><div>${legend}</div></header><div class="route-day-order-list-v118">${rows.map((o,i)=>dayOrderCard(o,i,rows)).join('')}</div></section>`;
  }

  function updateRouteDateSelect(groups, sel){
    if (!routePlanDateSelect) return;
    const days = groups.flatMap(m => m.weeks.flatMap(w => w.days));
    routePlanDateSelect.innerHTML = days.length ? days.map(d => `<option value="${esc(d.key)}" ${d.key === sel.day?.key ? 'selected' : ''}>${esc(d.fullLabel)} · ${d.rows.length} order${d.rows.length>1?'s':''}</option>`).join('') : '<option value="">No orders</option>';
    if (sel.day?.key) routePlanDateSelect.value = sel.day.key;
  }

  function renderV118(orders = [], role = currentDashboardRole){
    if (!routePlanSummary || !routeMapBoard || !routePlanDateSelect) return;
    if (!['Admin','Manager','Customer Service','Chef'].includes(role)) {
      routeMapBoard.innerHTML = '<div class="empty-state">Route map is only visible to staff and chef accounts.</div>'; routePlanSummary.innerHTML=''; return;
    }
    const groups = buildGroups(orders);
    if (!groups.length) {
      routeMapBoard.innerHTML = '<div class="empty-state">No orders yet. Routes will appear after customers submit booking requests.</div>';
      routePlanDateSelect.innerHTML = '<option value="">No orders</option>';
      routePlanSummary.innerHTML = '<p class="small-muted">No order dashboard routes yet.</p>';
      return;
    }
    const sel = currentSelection(groups);
    updateRouteDateSelect(groups, sel);
    renderMapForDay(sel.day);
    const body = state.mode === 'month' ? renderMonthOverview(sel) : `${renderWeekOverview(sel)}${renderSelectedDay(sel)}`;
    routePlanSummary.innerHTML = `${renderControls(groups, sel)}<div class="route-v118-logic"><b>Route logic:</b> Month shows the full order list. Week hides other weeks. Day locks the route map to that date only. Default sequence is party start time; manager can override, but conflict warnings must be acknowledged.</div>${body}`;
  }

  async function saveNotes(orderId, notes){
    const orders = allOrders();
    const order = orders.find(o => idOf(o) === String(orderId));
    if (order) { order.specialNotes = notes; order.admin_notes = notes; }
    try {
      const sb = initSupabaseClient?.();
      if (sb && typeof supabaseSession !== 'undefined' && supabaseSession) {
        await sb.from('bookings').update({ admin_notes: notes }).eq('booking_number', String(orderId));
      }
    } catch (error) { console.warn('V118 route note save failed:', error); }
  }
  async function applyManualMove(orderId, direction){
    const orders = visibleOrders(allOrders());
    const target = orders.find(o => idOf(o) === String(orderId));
    if (!target) return;
    const dk = dateKeyOf(target); const ck = chefKey(target);
    const rows = orders.filter(o => dateKeyOf(o) === dk && chefKey(o) === ck).sort(routeSort);
    const from = rows.findIndex(o => idOf(o) === String(orderId));
    const to = from + Number(direction || 0);
    if (from < 0 || to < 0 || to >= rows.length) return;
    const nextRows = rows.slice(); const [moved] = nextRows.splice(from,1); nextRows.splice(to,0,moved);
    const timeConflict = nextRows.some((o,i) => i && parseTimeMinutes(o.eventTime || o.event_time) < parseTimeMinutes(nextRows[i-1].eventTime || nextRows[i-1].event_time));
    if (timeConflict && !confirm('This manual route order conflicts with party start time order. Continue anyway as manager override?')) return;
    for (let i=0; i<nextRows.length; i++) {
      const order = nextRows[i];
      let notes = notesOf(order);
      notes = upsertLine(notes, ROUTE_SEQ_LABEL, String(i+1));
      notes = upsertLine(notes, ROUTE_OVERRIDE_LABEL, 'Manual manager route order');
      notes = upsertLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      if (timeConflict) notes = upsertLine(notes, ROUTE_ACK_LABEL, 'Yes');
      await saveNotes(idOf(order), notes);
    }
    setTimeout(() => { try { renderV118(allOrders(), currentDashboardRole || 'Admin'); } catch {} }, 120);
  }
  async function resetManual(orderId){
    const orders = visibleOrders(allOrders()); const target = orders.find(o => idOf(o) === String(orderId)); if(!target) return;
    const dk = dateKeyOf(target); const ck = chefKey(target);
    const rows = orders.filter(o => dateKeyOf(o) === dk && chefKey(o) === ck);
    for (const order of rows) {
      let notes = notesOf(order);
      notes = removeLine(notes, ROUTE_SEQ_LABEL);
      notes = removeLine(notes, ROUTE_OVERRIDE_LABEL);
      notes = upsertLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      await saveNotes(idOf(order), notes);
    }
    setTimeout(() => { try { renderV118(allOrders(), currentDashboardRole || 'Admin'); } catch {} }, 120);
  }

  try { renderRoutePlanner = renderV118; } catch {}

  document.addEventListener('click', (event) => {
    const month = event.target.closest?.('[data-v118-month]');
    if (month) { state.month = month.getAttribute('data-v118-month') || ''; state.week=''; state.date=''; state.mode='month'; renderV118(allOrders(), currentDashboardRole || 'Admin'); return; }
    const overview = event.target.closest?.('[data-v118-month-overview]');
    if (overview) { state.week=''; state.date=''; state.mode='month'; renderV118(allOrders(), currentDashboardRole || 'Admin'); return; }
    const week = event.target.closest?.('[data-v118-week]');
    if (week) { state.week = week.getAttribute('data-v118-week') || ''; state.date=''; state.mode='week'; renderV118(allOrders(), currentDashboardRole || 'Admin'); return; }
    const day = event.target.closest?.('[data-v118-day]');
    if (day) { state.date = day.getAttribute('data-v118-day') || ''; state.week = weekKey(state.date); state.month = monthKey(state.date); state.mode='day'; renderV118(allOrders(), currentDashboardRole || 'Admin'); return; }
    const mv = event.target.closest?.('[data-v118-route-move]');
    if (mv) { event.preventDefault(); event.stopPropagation(); mv.disabled=true; applyManualMove(mv.getAttribute('data-order-id'), Number(mv.getAttribute('data-v118-route-move'))).finally(()=>mv.disabled=false); return false; }
    const reset = event.target.closest?.('[data-v118-route-reset]');
    if (reset) { event.preventDefault(); event.stopPropagation(); if(confirm('Reset this chef/team chain to party-start-time order?')) resetManual(reset.getAttribute('data-v118-route-reset')); return false; }
  }, true);
  routePlanDateSelect?.addEventListener('change', () => {
    const val = routePlanDateSelect.value || '';
    if (val) { state.date = val; state.week = weekKey(val); state.month = monthKey(val); state.mode='day'; }
    renderV118(allOrders(), currentDashboardRole || 'Admin');
  });

  setTimeout(() => { try { renderV118(allOrders(), currentDashboardRole || 'Admin'); } catch (error) { console.warn('V118 initial render failed:', error); } }, 1400);
})();

/* =============================================================
   PHX V119 — Clean month / week / day dispatch board override
   - Replaces the cluttered V117/V118 route board with a clear flow:
     Month order list -> Week filtered list -> Selected day route map + day list.
   - Robust date parsing from event_date, eventDate, created party-start notes, and combined strings.
   - Route map only analyzes the clicked date.
   ============================================================= */
(function initPHXV119CleanDispatchBoard(){
  if (window.__PHX_V119_DISPATCH_BOARD_READY__) return;
  window.__PHX_V119_DISPATCH_BOARD_READY__ = true;

  const state = { month: '', week: '', day: '', mode: 'month' };
  const ROUTE_SEQ_LABEL = 'Phoenix route sequence';
  const ROUTE_OVERRIDE_LABEL = 'Phoenix route override';
  const ROUTE_UPDATED_LABEL = 'Phoenix route updated';
  const ROUTE_ACK_LABEL = 'Phoenix route conflict acknowledged';
  const routeColorClasses = ['route-color-1','route-color-2','route-color-3','route-color-4','route-color-5','route-color-6'];

  const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const idOf = (o={}) => String(o.id || o.booking_number || o.bookingNumber || o.order_id || '').trim();
  const notesOf = (o={}) => String(o.admin_notes || o.specialNotes || o.notes || '').trim();
  const nowLabel = () => new Date().toLocaleString([], {year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
  const phoneDigits = (s='') => String(s || '').replace(/\D/g, '');
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;

  function readLine(notes, label){
    const re = new RegExp(`${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*:\\s*([^\\n]+)`, 'i');
    return String(notes || '').match(re)?.[1]?.trim() || '';
  }
  function upsertLine(notes, label, value){
    const clean = String(notes || '').trim();
    const line = `${label}: ${value}`;
    const re = new RegExp(`${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*:[^\\n]*`, 'i');
    return re.test(clean) ? clean.replace(re, line) : [clean, line].filter(Boolean).join('\n');
  }
  function removeLine(notes, label){
    const re = new RegExp(`\\n?${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*:[^\\n]*`, 'ig');
    return String(notes || '').replace(re, '').trim();
  }

  function extractPartyStartText(o={}){
    const notes = notesOf(o);
    const direct = readLine(notes, 'Party start time') || readLine(notes, 'Latest party start time') || readLine(notes, 'Phoenix latest party start time');
    if (direct) return direct;
    const m = notes.match(/(?:updated your event time to|party start time(?: is)?|latest party start time)\s+([^\n.]+)/i);
    if (m) return m[1];
    return '';
  }
  function parseDateKeyFromText(raw=''){
    const s = String(raw || '').trim();
    if (!s || /pending/i.test(s)) return '';
    let m = s.match(/(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m = s.match(/(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})/);
    if (m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    const cleaned = s.replace(/上午|下午/g, '').replace(/[·•]/g, ' ').replace(/\s+-\s+\d{1,2}[:\d\sAPMapm]+$/, '').replace(/，/g, ',');
    const d = new Date(cleaned);
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return '';
  }
  function dateKeyOf(o={}){
    const candidates = [
      o.event_date, o.eventDate, o.party_date, o.partyDate, o.date, o.event_day,
      extractPartyStartText(o),
      `${o.eventDate || ''} ${o.eventTime || ''}`,
      `${o.event_date || ''} ${o.event_time || ''}`
    ];
    for (const c of candidates) { const key = parseDateKeyFromText(c); if (key) return key; }
    return 'unscheduled';
  }
  function dateObj(key=''){
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [y,m,d] = key.split('-').map(Number); return new Date(y, m-1, d);
  }
  function dateLabel(key=''){
    const d = dateObj(key); return d ? d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric', year:'numeric'}) : 'Date pending';
  }
  function dayShort(key=''){
    const d = dateObj(key); return d ? d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'}) : 'Date pending';
  }
  function monthKey(key='') { return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key.slice(0,7) : 'unscheduled'; }
  function monthLabel(key=''){
    if (key === 'unscheduled') return 'Date pending';
    const d = dateObj(`${key}-01`); return d ? d.toLocaleDateString([], {month:'long', year:'numeric'}) : key;
  }
  function mondayStart(d){ const x = new Date(d); const day = x.getDay() || 7; x.setDate(x.getDate() - day + 1); x.setHours(0,0,0,0); return x; }
  function weekKeyFromDateKey(key=''){
    const d = dateObj(key); if (!d) return 'unscheduled-week';
    const m = mondayStart(d); return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`;
  }
  function weekLabel(key=''){
    const d = dateObj(key); if (!d) return 'Date pending week';
    const end = new Date(d); end.setDate(end.getDate()+6);
    return `${d.toLocaleDateString([], {month:'short', day:'numeric'})} - ${end.toLocaleDateString([], {month:'short', day:'numeric'})}`;
  }
  function extractStartTimeText(o={}){
    const party = extractPartyStartText(o);
    const candidates = [party, o.party_start_time, o.partyStartTime, o.event_time, o.eventTime, o.time, o.eventDate, o.event_date];
    for (const c of candidates) {
      const s = String(c || '').replace(/上午/gi, ' AM').replace(/下午/gi, ' PM');
      const m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i) || s.match(/\b(\d{1,2}):(\d{2})\b/);
      if (m) return m[0].replace(/\s+/g, ' ');
    }
    return 'Time pending';
  }
  function timeMinutes(o={}){
    let s = extractStartTimeText(o).replace(/上午/gi, ' AM').replace(/下午/gi, ' PM');
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!m) return 99999;
    let h = Number(m[1]); const min = Number(m[2] || 0); const ap = String(m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }
  function routeSeq(o={}){
    const n = Number(readLine(notesOf(o), ROUTE_SEQ_LABEL)); return Number.isFinite(n) && n > 0 ? n : null;
  }
  function hasManual(o={}){ return routeSeq(o) !== null || /manual/i.test(readLine(notesOf(o), ROUTE_OVERRIDE_LABEL)); }
  function baseSort(a,b){ return timeMinutes(a) - timeMinutes(b) || idOf(a).localeCompare(idOf(b)); }
  function routeSort(a,b){
    const as = routeSeq(a), bs = routeSeq(b);
    if (as !== null || bs !== null) return (as ?? 9999) - (bs ?? 9999) || baseSort(a,b);
    return baseSort(a,b);
  }
  function chefName(o={}){
    const notes = notesOf(o);
    const team = readLine(notes, 'Phoenix chef team') || readLine(notes, 'Assigned chef team');
    return team || o.assignedChef || o.assigned_chef || o.chef_name || o.chef || 'Unassigned';
  }
  function chefKey(o={}){ return chefName(o).toLowerCase().replace(/[^a-z0-9]+/g,'-') || 'unassigned'; }
  function totalGuests(o={}){ return Number(o.billableGuests || o.billable_guests || o.totalGuests || o.total_guests || o.guests || 0) || 0; }
  function addressOf(o={}){ return o.address || o.event_address || o.full_address || 'No address'; }
  function guestName(o={}){ return o.name || o.customer_name || o.guest_name || 'Guest'; }
  function statusOf(o={}){ return o.status || o.booking_status || 'Pending'; }
  function colorFor(key='', idx=0){ let sum=0; for (const ch of String(key)) sum += ch.charCodeAt(0); return routeColorClasses[(sum + idx) % routeColorClasses.length]; }
  function safeMoney(o={}){ try { return typeof calculateOrderMoney === 'function' ? calculateOrderMoney(o)?.guestTotalBeforeDeposit || 0 : Number(o.total || o.estimated_total || 0) || 0; } catch { return 0; } }
  function getOrders(){ try { return (getDashboardOrders?.() || []).filter(Boolean).filter(o => !/deleted/i.test(String(o.status || ''))); } catch { return []; } }

  function buildTree(orders=[]){
    const rows = orders.map(o => ({...o, _dk: dateKeyOf(o)})).map(o => ({...o, _mk: monthKey(o._dk), _wk: weekKeyFromDateKey(o._dk)}));
    const monthMap = new Map();
    rows.forEach(o => { if (!monthMap.has(o._mk)) monthMap.set(o._mk, []); monthMap.get(o._mk).push(o); });
    return [...monthMap.entries()].sort(([a],[b]) => a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b)).map(([mk, mr]) => {
      const weekMap = new Map(); mr.forEach(o => { if (!weekMap.has(o._wk)) weekMap.set(o._wk, []); weekMap.get(o._wk).push(o); });
      const weeks = [...weekMap.entries()].sort(([a],[b]) => a === 'unscheduled-week' ? 1 : b === 'unscheduled-week' ? -1 : a.localeCompare(b)).map(([wk, wr]) => {
        const dayMap = new Map(); wr.forEach(o => { if (!dayMap.has(o._dk)) dayMap.set(o._dk, []); dayMap.get(o._dk).push(o); });
        const days = [...dayMap.entries()].sort(([a],[b]) => a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b)).map(([dk, dr]) => ({key:dk, label:dayShort(dk), fullLabel:dateLabel(dk), rows:dr.sort(routeSort)}));
        return {key:wk, label:weekLabel(wk), rows:wr.sort(routeSort), days};
      });
      return {key:mk, label:monthLabel(mk), rows:mr.sort(routeSort), weeks};
    });
  }
  function selectFromTree(tree){
    if (!tree.length) return {month:null, week:null, day:null};
    let month = tree.find(m => m.key === state.month) || tree.find(m => m.key !== 'unscheduled') || tree[0];
    state.month = month.key;
    let week = state.week ? month.weeks.find(w => w.key === state.week) : null;
    if (!week && state.mode !== 'month') week = month.weeks[0] || null;
    if (week) state.week = week.key;
    let day = null;
    const allDays = month.weeks.flatMap(w => w.days);
    if (state.day) day = allDays.find(d => d.key === state.day) || null;
    if (!day && state.mode === 'day') day = (week?.days || allDays)[0] || null;
    if (day) { state.day = day.key; state.week = day.key === 'unscheduled' ? 'unscheduled-week' : weekKeyFromDateKey(day.key); }
    return {month, week, day};
  }
  function rowStats(rows=[]){
    const assigned = rows.filter(o => !/^unassigned$/i.test(chefName(o))).length;
    const confirmed = rows.filter(o => /confirm|accept/i.test(statusOf(o))).length;
    return {total:rows.length, assigned, confirmed};
  }

  function orderMiniCard(o, idx, opts={}){
    const n = opts.number || '';
    const id = idOf(o) || `Order ${idx+1}`;
    return `<article class="phx-v119-order-card">
      <header><div>${n ? `<span class="phx-v119-stop-num">${esc(n)}</span>` : ''}<b>${esc(id)}</b></div><span>${esc(statusOf(o))}</span></header>
      <p><b>${esc(extractStartTimeText(o))}</b> · ${esc(guestName(o))} · ${esc(phoneDigits(o.phone || o.customer_phone || '') || o.phone || '')}</p>
      <p>${esc(addressOf(o))}</p>
      <small>${esc(chefName(o))} · ${totalGuests(o)} guests · ${money(safeMoney(o))}</small>
    </article>`;
  }
  function buildMap(day){
    if (!routeMapBoard) return;
    if (!day) {
      routeMapBoard.innerHTML = '<div class="empty-state">Choose a date below. The route map only appears for the selected day.</div>';
      return;
    }
    const rows = day.rows.sort(routeSort).map((o,i) => ({...o, _num:i+1}));
    if (!rows.length) { routeMapBoard.innerHTML = '<div class="empty-state">No orders for this date.</div>'; return; }
    const points = rows.map((o,i) => {
      const count = Math.max(rows.length - 1, 1);
      const x = rows.length === 1 ? 50 : 14 + (72 * (i / count));
      const y = rows.length === 1 ? 50 : 72 - (44 * (i / count)) + ((i % 2) * 10 - 5);
      return {o, x: Math.max(10, Math.min(90, x)), y: Math.max(16, Math.min(82, y))};
    });
    const byChef = new Map(); points.forEach(p => { const k=chefKey(p.o); if(!byChef.has(k)) byChef.set(k, []); byChef.get(k).push(p); });
    const lines = [...byChef.entries()].map(([k, pts], idx) => {
      if (pts.length < 2) return '';
      return `<polyline class="${esc(colorFor(k, idx))}" points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" />`;
    }).join('');
    const markers = points.map((p, idx) => `<g class="${esc(colorFor(chefKey(p.o), idx))}"><circle cx="${p.x}" cy="${p.y}" r="5.7"/><text x="${p.x}" y="${p.y+2}">${p.o._num}</text></g>`).join('');
    const labels = points.map(p => `<div class="route-map-label phx-v119-map-label" style="left:${p.x}%;top:${p.y}%"><b>${p.o._num}</b><span>${esc(extractStartTimeText(p.o))}</span></div>`).join('');
    routeMapBoard.innerHTML = `<div class="route-map-canvas phx-v119-map"><svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" rx="8" class="route-map-bg"></rect><path class="route-grid" d="M10 25 H90 M10 50 H90 M10 75 H90 M25 10 V90 M50 10 V90 M75 10 V90"></path>${lines}${markers}</svg>${labels}</div>`;
  }
  function renderControls(tree, sel){
    const months = tree.map(m => `<button type="button" class="phx-v119-month ${m.key===state.month?'active':''}" data-v119-month="${esc(m.key)}"><b>${esc(m.label)}</b><span>${m.rows.length} orders</span></button>`).join('');
    const weeks = sel.month ? sel.month.weeks.map((w,i) => `<button type="button" class="phx-v119-week ${w.key===state.week?'active':''}" data-v119-week="${esc(w.key)}"><b>Week ${i+1}</b><span>${esc(w.label)} · ${w.rows.length}</span></button>`).join('') : '';
    const days = sel.week ? sel.week.days.map(d => `<button type="button" class="phx-v119-day ${d.key===state.day?'active':''}" data-v119-day="${esc(d.key)}"><b>${esc(d.label)}</b><span>${d.rows.length} orders</span></button>`).join('') : '';
    return `<section class="phx-v119-controls"><header><div><b>Dispatch board / 派单工作台</b><span>Choose a month, then a week, then one date. Only the selected date is routed.</span></div><div class="phx-v119-mode">${esc(state.mode.toUpperCase())}</div></header><div class="phx-v119-row">${months}</div>${weeks ? `<div class="phx-v119-row week-row">${weeks}</div>` : ''}${days ? `<div class="phx-v119-row day-row">${days}</div>` : ''}</section>`;
  }
  function renderMonthList(sel){
    if (!sel.month) return '';
    return `<section class="phx-v119-list"><header><b>${esc(sel.month.label)} — full month order list</b><span>Click a week to hide all other weeks.</span></header>${sel.month.weeks.map((w, wi) => {
      const s = rowStats(w.rows);
      return `<div class="phx-v119-week-block"><button type="button" data-v119-week="${esc(w.key)}"><b>Week ${wi+1}: ${esc(w.label)}</b><span>${s.total} orders · ${s.assigned} assigned · ${s.confirmed} confirmed</span></button><div class="phx-v119-order-grid">${w.rows.map((o,i)=>orderMiniCard(o,i)).join('')}</div></div>`;
    }).join('')}</section>`;
  }
  function renderWeekList(sel){
    if (!sel.week) return '';
    return `<section class="phx-v119-list"><header><b>${esc(sel.week.label)} — week order list</b><span>Only this week is shown. Click one date to build route map.</span></header>${sel.week.days.map(d => `<div class="phx-v119-day-block"><button type="button" data-v119-day="${esc(d.key)}"><b>${esc(d.fullLabel)}</b><span>${d.rows.length} orders</span></button><div class="phx-v119-order-grid">${d.rows.map((o,i)=>orderMiniCard(o,i)).join('')}</div></div>`).join('')}</section>`;
  }
  function renderDayList(sel){
    if (!sel.day) return '<section class="phx-v119-list"><header><b>No date selected</b><span>Choose a date to display day route.</span></header></section>';
    const rows = sel.day.rows.sort(routeSort).map((o,i)=>({...o, _num:i+1}));
    const byChef = new Map(); rows.forEach(o => { const k = chefKey(o); if(!byChef.has(k)) byChef.set(k, []); byChef.get(k).push(o); });
    const legend = [...byChef.entries()].map(([k, rs], idx) => `<span class="route-legend ${esc(colorFor(k,idx))}"><i></i>${esc(chefName(rs[0]))}: ${rs.map(r=>r._num).join(' → ')}</span>`).join('');
    return `<section class="phx-v119-list"><header><div><b>${esc(sel.day.fullLabel)} — selected day route</b><span>${rows.length} stops. Stops are numbered 1-${rows.length}; colors are chef/team chains.</span></div><div class="phx-v119-legend">${legend}</div></header>${[...byChef.entries()].map(([k, rs]) => `<div class="phx-v119-chef-chain"><h4>${esc(chefName(rs[0]))}</h4><div class="phx-v119-order-grid">${rs.map((o,i)=>orderMiniCard(o,i,{number:o._num})).join('')}</div><div class="phx-v119-chain-actions">${rs.map((o,i)=>`<div><b>${o._num}</b> ${esc(extractStartTimeText(o))} <button type="button" data-v119-move="-1" data-order-id="${esc(idOf(o))}" ${i===0?'disabled':''}>Move earlier</button><button type="button" data-v119-move="1" data-order-id="${esc(idOf(o))}" ${i===rs.length-1?'disabled':''}>Move later</button><button type="button" data-v119-reset="${esc(idOf(o))}">Use time order</button></div>`).join('')}</div></div>`).join('')}</section>`;
  }
  function updateSelect(tree, sel){
    if (!routePlanDateSelect) return;
    const days = tree.flatMap(m => m.weeks.flatMap(w => w.days)).filter(d => d.key !== 'unscheduled');
    routePlanDateSelect.innerHTML = days.length ? days.map(d => `<option value="${esc(d.key)}" ${sel.day?.key === d.key ? 'selected':''}>${esc(d.fullLabel)} · ${d.rows.length} order${d.rows.length>1?'s':''}</option>`).join('') : '<option value="">No dated orders</option>';
    if (sel.day?.key && sel.day.key !== 'unscheduled') routePlanDateSelect.value = sel.day.key;
  }
  function renderV119(orders=getOrders(), role=currentDashboardRole){
    if (!routePlanSummary || !routeMapBoard || !routePlanDateSelect) return;
    if (!['Admin','Manager','Customer Service','Chef'].includes(role)) { routeMapBoard.innerHTML = '<div class="empty-state">Route map is only visible to staff and chef accounts.</div>'; routePlanSummary.innerHTML=''; return; }
    const tree = buildTree(orders);
    if (!tree.length) { routeMapBoard.innerHTML='<div class="empty-state">No orders yet.</div>'; routePlanDateSelect.innerHTML='<option>No orders</option>'; routePlanSummary.innerHTML=''; return; }
    const sel = selectFromTree(tree);
    updateSelect(tree, sel);
    buildMap(state.mode === 'day' ? sel.day : null);
    const main = state.mode === 'day' ? renderDayList(sel) : state.mode === 'week' ? renderWeekList(sel) : renderMonthList(sel);
    routePlanSummary.innerHTML = `${renderControls(tree, sel)}<div class="phx-v119-logic"><b>Route logic:</b> Month shows the full month list. Week hides other weeks. Date locks the route map to that day only. Default order follows party start time. Manual changes are allowed, but time conflicts require manager confirmation.</div>${main}`;
  }
  async function saveNotes(orderId, notes){
    const orders = getOrders(); const order = orders.find(o => idOf(o) === String(orderId));
    if (order) { order.admin_notes = notes; order.specialNotes = notes; }
    try {
      const sb = initSupabaseClient?.();
      if (sb && typeof supabaseSession !== 'undefined' && supabaseSession) await sb.from('bookings').update({admin_notes:notes}).eq('booking_number', String(orderId));
    } catch (err) { console.warn('V119 route note save failed:', err); }
  }
  async function moveOrder(orderId, dir){
    const orders = getOrders(); const target = orders.find(o => idOf(o) === String(orderId)); if (!target) return;
    const dk = dateKeyOf(target); const ck = chefKey(target);
    const rows = orders.filter(o => dateKeyOf(o) === dk && chefKey(o) === ck).sort(routeSort);
    const from = rows.findIndex(o => idOf(o) === String(orderId)); const to = from + Number(dir || 0);
    if (from < 0 || to < 0 || to >= rows.length) return;
    const next = rows.slice(); const [moved] = next.splice(from,1); next.splice(to,0,moved);
    const conflict = next.some((o,i) => i && timeMinutes(o) < timeMinutes(next[i-1]));
    if (conflict && !confirm('This manual order conflicts with party start time order. Continue anyway?')) return;
    for (let i=0;i<next.length;i++) {
      let notes = notesOf(next[i]);
      notes = upsertLine(notes, ROUTE_SEQ_LABEL, String(i+1));
      notes = upsertLine(notes, ROUTE_OVERRIDE_LABEL, 'Manual manager route order');
      notes = upsertLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      if (conflict) notes = upsertLine(notes, ROUTE_ACK_LABEL, 'Yes');
      await saveNotes(idOf(next[i]), notes);
    }
    renderV119(getOrders(), currentDashboardRole || 'Admin');
  }
  async function resetChain(orderId){
    const orders = getOrders(); const target = orders.find(o => idOf(o) === String(orderId)); if (!target) return;
    const dk = dateKeyOf(target); const ck = chefKey(target);
    const rows = orders.filter(o => dateKeyOf(o) === dk && chefKey(o) === ck);
    for (const o of rows) {
      let notes = notesOf(o);
      notes = removeLine(notes, ROUTE_SEQ_LABEL);
      notes = removeLine(notes, ROUTE_OVERRIDE_LABEL);
      notes = upsertLine(notes, ROUTE_UPDATED_LABEL, nowLabel());
      await saveNotes(idOf(o), notes);
    }
    renderV119(getOrders(), currentDashboardRole || 'Admin');
  }
  try { window.renderRoutePlanner = renderV119; renderRoutePlanner = renderV119; } catch {}
  document.addEventListener('click', (e) => {
    const month = e.target.closest?.('[data-v119-month]');
    if (month) { state.month = month.getAttribute('data-v119-month') || ''; state.week=''; state.day=''; state.mode='month'; renderV119(); return; }
    const week = e.target.closest?.('[data-v119-week]');
    if (week) { state.week = week.getAttribute('data-v119-week') || ''; state.day=''; state.mode='week'; renderV119(); return; }
    const day = e.target.closest?.('[data-v119-day]');
    if (day) { state.day = day.getAttribute('data-v119-day') || ''; state.week = weekKeyFromDateKey(state.day); state.month = monthKey(state.day); state.mode='day'; renderV119(); return; }
    const mv = e.target.closest?.('[data-v119-move]');
    if (mv) { e.preventDefault(); e.stopPropagation(); moveOrder(mv.getAttribute('data-order-id'), Number(mv.getAttribute('data-v119-move'))); return false; }
    const reset = e.target.closest?.('[data-v119-reset]');
    if (reset) { e.preventDefault(); e.stopPropagation(); if (confirm('Reset this chef/team chain to party-start-time order?')) resetChain(reset.getAttribute('data-v119-reset')); return false; }
  }, true);
  routePlanDateSelect?.addEventListener('change', () => { const v = routePlanDateSelect.value || ''; if (v) { state.day=v; state.week=weekKeyFromDateKey(v); state.month=monthKey(v); state.mode='day'; } renderV119(); });
  setTimeout(() => { try { renderV119(getOrders(), currentDashboardRole || 'Admin'); } catch (err) { console.warn('V119 initial route board failed:', err); } }, 1600);
})();

/* ======================================================================
   V124 dashboard utility controls
   - Remove standalone Build Route Plan action from dashboard header.
   - Keep Light/Dark and Assistant tools available inside every dashboard.
   ====================================================================== */
(function PHXV124DashboardUtilityControls(){
  if (window.__PHX_V124_DASH_UTILS__) return;
  window.__PHX_V124_DASH_UTILS__ = true;

  function syncDashboardThemeButton(){
    const btn = document.getElementById('dashThemeToggleBtn');
    if (!btn) return;
    const isLight = document.body.classList.contains('light-theme');
    btn.textContent = isLight ? 'Dark mode' : 'Light mode';
    btn.setAttribute('aria-label', isLight ? 'Switch dashboard to dark mode' : 'Switch dashboard to light mode');
  }

  function bindDashboardUtilities(){
    const oldRouteBtn = document.getElementById('autoDispatchBtn');
    if (oldRouteBtn) oldRouteBtn.style.display = 'none';

    const themeBtn = document.getElementById('dashThemeToggleBtn');
    if (themeBtn && !themeBtn.dataset.phxV124Bound) {
      themeBtn.dataset.phxV124Bound = '1';
      themeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById('themeToggleBtn')?.click();
        setTimeout(syncDashboardThemeButton, 40);
      });
    }

    const panel = document.getElementById('dashboardAssistantPanel');
    const assistantBtn = document.getElementById('dashAssistantBtn');
    const closeBtn = document.getElementById('dashAssistantCloseBtn');
    const fullBtn = document.getElementById('dashAssistantOpenPublicBtn');
    if (assistantBtn && panel && !assistantBtn.dataset.phxV124Bound) {
      assistantBtn.dataset.phxV124Bound = '1';
      assistantBtn.addEventListener('click', (event) => {
        event.preventDefault();
        panel.hidden = !panel.hidden;
      });
    }
    if (closeBtn && panel && !closeBtn.dataset.phxV124Bound) {
      closeBtn.dataset.phxV124Bound = '1';
      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        panel.hidden = true;
      });
    }
    if (fullBtn && !fullBtn.dataset.phxV124Bound) {
      fullBtn.dataset.phxV124Bound = '1';
      fullBtn.addEventListener('click', (event) => {
        event.preventDefault();
        panel && (panel.hidden = true);
        try {
          if (typeof setAiOpen === 'function') setAiOpen(true);
          else document.getElementById('aiToggle')?.click();
        } catch (_) {
          document.getElementById('aiToggle')?.click();
        }
      });
    }
    syncDashboardThemeButton();
  }

  bindDashboardUtilities();
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-dashboard-tab], [data-account-action], [data-open-login], [data-portal-logout]')) {
      setTimeout(bindDashboardUtilities, 120);
    }
  }, true);
  try {
    new MutationObserver(() => syncDashboardThemeButton()).observe(document.body, { attributes:true, attributeFilter:['class'] });
  } catch (_) {}
})();

/* ======================================================================
   V125 MEMBER DASHBOARD CLEANUP
   Customer/member portal should not show staff KPI cards such as
   New orders / Pending assigned / Support tickets. Keep member view focused
   on bookings, status, chef, payment, and support contact only.
   ====================================================================== */
(function initPHXV125MemberDashboardCleanup(){
  if (window.__PHX_V125_MEMBER_DASHBOARD_CLEANUP__) return;
  window.__PHX_V125_MEMBER_DASHBOARD_CLEANUP__ = true;

  function normalizeRoleV125(role){
    const raw = String(role || window.currentDashboardRole || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (raw.includes('member') || raw.includes('customer')) return 'Member';
    if (raw.includes('chef')) return 'Chef';
    if (raw.includes('manager')) return 'Manager';
    if (raw.includes('customer_service')) return 'Customer Service';
    if (raw.includes('admin')) return 'Admin';
    return String(role || window.currentDashboardRole || 'Member');
  }

  function applyMemberDashboardCleanupV125(role){
    const clean = normalizeRoleV125(role);
    const isMember = clean === 'Member';
    const stats = document.querySelector('.dashboard-stats');
    if (stats) {
      stats.hidden = isMember;
      stats.style.display = isMember ? 'none' : '';
      stats.setAttribute('aria-hidden', isMember ? 'true' : 'false');
    }

    document.body.classList.toggle('member-dashboard-clean-v125', isMember);

    const help = document.getElementById('dashboardHelp');
    if (help && isMember) {
      help.innerHTML = '<span class="role-badge">Member</span> Member portal: view your booking details, latest status, party start time, assigned chef, payment status, invoice, and Phoenix support contact.';
    }

    const title = document.getElementById('dashboardTitle');
    if (title && isMember) title.textContent = 'Member Dashboard';
  }

  const previousApplyRole = window.PHX_APPLY_ROLE_VISIBILITY_V85;
  if (typeof previousApplyRole === 'function' && !window.__PHX_V125_ROLE_VISIBILITY_WRAPPED__) {
    window.__PHX_V125_ROLE_VISIBILITY_WRAPPED__ = true;
    window.PHX_APPLY_ROLE_VISIBILITY_V85 = function(role){
      const out = previousApplyRole.apply(this, arguments);
      setTimeout(() => applyMemberDashboardCleanupV125(role), 0);
      setTimeout(() => applyMemberDashboardCleanupV125(role), 120);
      return out;
    };
  }

  const previousRenderDashboard = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (previousRenderDashboard && !window.__PHX_V125_RENDER_DASHBOARD_WRAPPED__) {
    window.__PHX_V125_RENDER_DASHBOARD_WRAPPED__ = true;
    renderDashboard = function(role){
      const out = previousRenderDashboard.apply(this, arguments);
      const clean = normalizeRoleV125(role || window.currentDashboardRole);
      setTimeout(() => applyMemberDashboardCleanupV125(clean), 0);
      setTimeout(() => applyMemberDashboardCleanupV125(clean), 160);
      setTimeout(() => applyMemberDashboardCleanupV125(clean), 420);
      return out;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => applyMemberDashboardCleanupV125(window.currentDashboardRole), 0);
  });
})();

/* ======================================================================
   V126 CHEF DASHBOARD CLEANUP
   - Chef dashboard light-mode contrast cleanup.
   - Chef sees Orders + Chef Dispatch tabs.
   - Chef stats are role-specific: today tasks, this week orders, own support tickets.
   - Staff can assign support tickets/complaints to a chef from Complaints & Suggestions.
   - Chef sees only tickets assigned to that chef.
   - Chef Orders panel adds day/week/month filters, today's task count, and task notes.
   No Supabase SQL is required for this version; support ticket assignment is local until
   a proper support_tickets table is added.
   ====================================================================== */
(function initPHXV126ChefDashboardCleanup(){
  if (window.__PHX_V126_CHEF_DASHBOARD_CLEANUP__) return;
  window.__PHX_V126_CHEF_DASHBOARD_CLEANUP__ = true;

  const TICKET_ASSIGN_KEY = 'phoenixHibachiTicketChefAssignmentsV126';

  function esc(value){
    try { return (typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))); }
    catch { return String(value ?? ''); }
  }
  function roleClean(role){
    const raw = String(role || (typeof currentDashboardRole !== 'undefined' ? currentDashboardRole : '') || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (raw.includes('customer_service')) return 'Customer Service';
    if (raw.includes('admin')) return 'Admin';
    if (raw.includes('manager')) return 'Manager';
    if (raw.includes('chef')) return 'Chef';
    if (raw.includes('member') || raw.includes('customer')) return 'Member';
    return String(role || (typeof currentDashboardRole !== 'undefined' ? currentDashboardRole : 'Member'));
  }
  function isChef(role){ return roleClean(role) === 'Chef'; }
  function isStaff(role){ return ['Admin','Manager','Customer Service'].includes(roleClean(role)); }
  function norm(value){ return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,''); }
  function idOf(order){ return String(order?.id || order?.booking_number || order?.bookingNumber || order?.booking_id || ''); }
  function allOrders(){
    try { return typeof getDashboardOrders === 'function' ? getDashboardOrders() : []; }
    catch { return []; }
  }
  function allFeedback(){
    try {
      const base = typeof getStoredFeedback === 'function' ? getStoredFeedback() : JSON.parse(localStorage.getItem('phoenixHibachiFeedbackV12') || '[]');
      const social = typeof getSocialCouponRequests === 'function' && typeof socialCouponToFeedback === 'function' ? getSocialCouponRequests().map(socialCouponToFeedback) : [];
      return [...base, ...social];
    } catch { return []; }
  }
  function saveFeedbackList(list){
    try { localStorage.setItem('phoenixHibachiFeedbackV12', JSON.stringify(list || [])); } catch {}
  }
  function loadTicketAssignments(){
    try { return JSON.parse(localStorage.getItem(TICKET_ASSIGN_KEY) || '{}') || {}; } catch { return {}; }
  }
  function saveTicketAssignments(map){
    try { localStorage.setItem(TICKET_ASSIGN_KEY, JSON.stringify(map || {})); } catch {}
  }
  function profileEmail(){
    try { return String((typeof supabaseSession !== 'undefined' && supabaseSession?.user?.email) || (typeof supabaseProfile !== 'undefined' && supabaseProfile?.email) || localStorage.getItem('phoenix_portal_email') || '').trim(); }
    catch { return ''; }
  }
  function chefLocalProfile(){
    const email = profileEmail() || 'local';
    try { return JSON.parse(localStorage.getItem('phoenix_chef_profile_v97_' + email) || '{}') || {}; } catch { return {}; }
  }
  function chefDisplayName(){
    const local = chefLocalProfile();
    try {
      return local.displayName || local.fullName ||
        (typeof supabaseProfile !== 'undefined' && (supabaseProfile?.chef_display_name || supabaseProfile?.full_name || supabaseProfile?.name)) ||
        (typeof supabaseSession !== 'undefined' && (supabaseSession?.user?.user_metadata?.chef_display_name || supabaseSession?.user?.user_metadata?.full_name)) ||
        local.email || profileEmail() || 'Chef account';
    } catch { return local.displayName || local.fullName || profileEmail() || 'Chef account'; }
  }
  function chefCandidateTokens(){
    const local = chefLocalProfile();
    const tokens = [];
    const add = v => { const n = norm(v); if (n && !tokens.includes(n)) tokens.push(n); };
    add(local.displayName); add(local.fullName); add(local.phone); add(local.email); add(profileEmail());
    try {
      add(typeof supabaseProfile !== 'undefined' && supabaseProfile?.chef_id);
      add(typeof supabaseProfile !== 'undefined' && supabaseProfile?.id);
      add(typeof supabaseProfile !== 'undefined' && supabaseProfile?.full_name);
      add(typeof supabaseProfile !== 'undefined' && supabaseProfile?.phone);
      add(typeof supabaseSession !== 'undefined' && supabaseSession?.user?.id);
    } catch {}
    try { (typeof CHEFS !== 'undefined' ? CHEFS : []).forEach(c => { if (tokens.some(t => norm(c.name).includes(t) || t.includes(norm(c.name)) || t === norm(c.id))) { add(c.id); add(c.name); add(c.phone); } }); } catch {}
    return tokens;
  }
  function orderChefTokens(order){
    const vals = [order?.assignedChef, order?.assigned_chef, order?.assignedChefName, order?.chefName, order?.chef, order?.assigned_chef_id, order?.assignedChefId, order?.chef_id, order?.chefId, order?.chefTeam, order?.admin_notes, order?.specialNotes];
    return vals.map(norm).filter(Boolean);
  }
  function isMineOrder(order){
    const tokens = chefCandidateTokens();
    const orderTokens = orderChefTokens(order);
    if (tokens.length && orderTokens.length && orderTokens.some(ot => tokens.some(t => ot.includes(t) || t.includes(ot)))) return true;
    // During early testing, fall back to assigned chef orders if the account is not strictly linked yet.
    if (!tokens.length || tokens.every(t => t.length < 3)) return Boolean(order?.assignedChef && String(order.assignedChef).toLowerCase() !== 'unassigned');
    return false;
  }
  function myOrders(){ return allOrders().filter(isMineOrder); }
  function parseDate(order){
    try { return typeof orderDateV97 === 'function' ? orderDateV97(order) : new Date(`${order.eventDate || order.event_date || ''} ${String(order.eventTime || order.event_time || '12:00 PM').split('-')[0]}`); }
    catch { return new Date(`${order.eventDate || order.event_date || ''} ${String(order.eventTime || order.event_time || '12:00 PM').split('-')[0]}`); }
  }
  function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function weekStart(d){ const x = startOfDay(d); const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day; x.setDate(x.getDate() + diff); return x; }
  function dateKey(d){ const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
  function monthKey(d){ const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`; }
  function weekValue(d){ const start = weekStart(d); const onejan = new Date(start.getFullYear(),0,1); const week = Math.ceil((((start - onejan) / 86400000) + onejan.getDay() + 1) / 7); return `${start.getFullYear()}-W${String(week).padStart(2,'0')}`; }
  function selectedChefOrders(){
    const mode = document.getElementById('chefOrdersModeV126')?.value || 'date';
    const rows = myOrders();
    if (mode === 'month') {
      const mk = document.getElementById('chefOrdersMonthV126')?.value || monthKey(new Date());
      return rows.filter(o => { const dt = parseDate(o); return dt && !isNaN(dt) && monthKey(dt) === mk; });
    }
    if (mode === 'week') {
      const wk = document.getElementById('chefOrdersWeekV126')?.value || weekValue(new Date());
      return rows.filter(o => { const dt = parseDate(o); return dt && !isNaN(dt) && weekValue(dt) === wk; });
    }
    const dk = document.getElementById('chefOrdersDateV126')?.value || dateKey(new Date());
    return rows.filter(o => { const dt = parseDate(o); return dt && !isNaN(dt) && dateKey(dt) === dk; });
  }
  function money(num){ const n = Number(num || 0); return '$' + (Math.round(n * 100) / 100).toLocaleString(); }
  function orderTotal(order){
    try { const m = typeof calculateOrderMoney === 'function' ? calculateOrderMoney(order) : null; return Number(m?.grandTotal || m?.total || order?.estimatedTotal || order?.total || 0); }
    catch { return Number(order?.estimatedTotal || order?.total || 0); }
  }
  function taskNote(order){
    const notes = String(order?.admin_notes || order?.specialNotes || order?.notes || '').split('\n').filter(Boolean);
    const keep = notes.filter(line => /note|task|chef|route|time|payment|allerg|parking|gate|setup|arrival/i.test(line)).slice(0,4);
    return keep.join(' · ') || 'No task note yet.';
  }
  function myTicketList(){
    const assignments = loadTicketAssignments();
    const tokens = chefCandidateTokens();
    return allFeedback().filter(item => {
      const id = String(item.id || item.ticket_id || '');
      const assigned = assignments[id] || item.assignedChef || item.assigned_chef || item.chef || item.chefName || '';
      const a = norm(assigned);
      return a && tokens.some(t => a.includes(t) || t.includes(a));
    });
  }
  function chefOptionsHtml(selected){
    const chefs = (typeof CHEFS !== 'undefined' && Array.isArray(CHEFS) ? CHEFS : []);
    const selectedNorm = norm(selected);
    return `<option value="">Unassigned</option>` + chefs.map(c => `<option value="${esc(c.name)}" ${selectedNorm && (selectedNorm === norm(c.name) || selectedNorm === norm(c.id)) ? 'selected' : ''}>${esc(c.name)} · ${esc(c.base || '')}</option>`).join('');
  }

  function addStaffTicketAssignmentControls(){
    if (!isStaff()) return;
    const list = document.getElementById('feedbackList');
    if (!list || list.dataset.v126TicketControls === '1') return;
    const assignments = loadTicketAssignments();
    list.querySelectorAll('article.feedback-card').forEach(card => {
      const id = card.querySelector('strong')?.textContent?.trim();
      if (!id || card.querySelector('[data-v126-ticket-chef]')) return;
      const wrap = document.createElement('div');
      wrap.className = 'v126-ticket-assign';
      wrap.innerHTML = `<label>Assign to chef / 指派投诉给师傅<select data-v126-ticket-chef="${esc(id)}">${chefOptionsHtml(assignments[id])}</select></label>`;
      card.appendChild(wrap);
    });
    list.dataset.v126TicketControls = '1';
  }

  function updateChefStats(){
    if (!isChef()) return;
    const stats = document.querySelector('.dashboard-stats');
    if (!stats) return;
    const rows = myOrders();
    const today = dateKey(new Date());
    const week = weekValue(new Date());
    const todayOrders = rows.filter(o => { const dt = parseDate(o); return dt && !isNaN(dt) && dateKey(dt) === today; });
    const weekOrders = rows.filter(o => { const dt = parseDate(o); return dt && !isNaN(dt) && weekValue(dt) === week; });
    const tickets = myTicketList();
    stats.hidden = false;
    stats.style.display = '';
    stats.classList.add('chef-stats-v126');
    const boxes = [...stats.children];
    if (boxes[0]) boxes[0].innerHTML = `<strong>${todayOrders.length}</strong><span>Today tasks / 今日任务</span>`;
    if (boxes[1]) boxes[1].innerHTML = `<strong>${weekOrders.length}</strong><span>This week orders / 本周订单</span>`;
    if (boxes[2]) boxes[2].innerHTML = `<strong>${tickets.length}</strong><span>My support tickets / 我的投诉</span>`;
  }

  function renderChefTicketsPanel(){
    if (!isChef()) return;
    const page = document.querySelector('[data-dashboard-page="dispatch"]');
    if (!page) return;
    let panel = document.getElementById('chefSupportTicketsV126');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'chefSupportTicketsV126';
      panel.className = 'chef-support-tickets-v126';
      page.appendChild(panel);
    }
    const tickets = myTicketList();
    panel.innerHTML = `<div class="section-row"><div><h3>My support tickets / 我的客服工单</h3><p class="small-muted">Only tickets assigned to this chef are shown here. Customer Service/Admin assigns complaint tickets from Complaints & Suggestions.</p></div></div>` +
      (tickets.length ? tickets.map(t => `<article class="chef-ticket-card-v126"><strong>${esc(t.id || 'Ticket')}</strong><span class="tag">${esc(t.feedbackType || t.status || 'Support')}</span><p>${esc(t.name || '')} · ${esc(t.phone || t.email || '')}</p><p>${esc(t.message || t.notes || '')}</p></article>`).join('') : '<div class="empty-state">No support tickets assigned to this chef.</div>');
  }

  function renderChefOrdersPanel(){
    if (!isChef()) return;
    const orderPage = document.querySelector('[data-dashboard-page="orders"]');
    const orderList = document.getElementById('orderList');
    if (!orderPage || !orderList) return;
    let panel = document.getElementById('chefOrdersPanelV126');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'chefOrdersPanelV126';
      panel.className = 'chef-orders-panel-v126';
      orderPage.insertBefore(panel, orderList);
    }
    const now = new Date();
    const dVal = document.getElementById('chefOrdersDateV126')?.value || dateKey(now);
    const wVal = document.getElementById('chefOrdersWeekV126')?.value || weekValue(now);
    const mVal = document.getElementById('chefOrdersMonthV126')?.value || monthKey(now);
    const modeVal = document.getElementById('chefOrdersModeV126')?.value || 'date';
    const rows = selectedChefOrders().sort((a,b) => parseDate(a) - parseDate(b));
    const todayCount = myOrders().filter(o => { const dt = parseDate(o); return dt && !isNaN(dt) && dateKey(dt) === dateKey(now); }).length;
    const selectedTotal = rows.reduce((sum,o)=>sum+orderTotal(o),0);
    panel.innerHTML = `<div class="chef-orders-head-v126"><div><p class="eyebrow">Chef Orders</p><h3>My orders / 我的订单</h3><p class="small-muted">Manage your own assigned jobs by day, week, or month. Each task includes customer route details and chef task note.</p></div><div class="chef-orders-controls-v126"><label>View<select id="chefOrdersModeV126"><option value="date" ${modeVal==='date'?'selected':''}>By day</option><option value="week" ${modeVal==='week'?'selected':''}>By week</option><option value="month" ${modeVal==='month'?'selected':''}>By month</option></select></label><label>Date<input type="date" id="chefOrdersDateV126" value="${esc(dVal)}"></label><label>Week<input type="week" id="chefOrdersWeekV126" value="${esc(wVal)}"></label><label>Month<input type="month" id="chefOrdersMonthV126" value="${esc(mVal)}"></label></div></div><div class="chef-orders-stats-v126"><div><span>Today tasks</span><strong>${todayCount}</strong></div><div><span>Selected orders</span><strong>${rows.length}</strong></div><div><span>Selected order volume</span><strong>${money(selectedTotal)}</strong></div></div><div class="chef-orders-list-v126">${rows.length ? rows.map((o,i)=>`<article class="chef-order-card-v126"><header><div><strong>${i+1}. ${esc(idOf(o) || 'Order')}</strong><p>${esc((parseDate(o) && !isNaN(parseDate(o))) ? parseDate(o).toLocaleString() : (o.eventDate || 'Date pending'))}</p></div><span class="tag">${esc(o.status || 'Pending')}</span></header><p><b>Customer:</b> ${esc(o.name || 'Guest')} · ${esc(o.phone || o.email || '')}<br><b>Address:</b> ${esc(o.address || 'No address')}<br><b>Party:</b> ${esc(o.package || o.packageName || '-')} · ${esc(o.adults || o.adultCount || 0)} adults · ${esc(o.kids || o.kidCount || 0)} kids</p><div class="chef-task-note-v126"><b>Task note / 任务备注</b><br>${esc(taskNote(o))}</div><div class="order-actions"><a href="${typeof googleMapUrl === 'function' ? googleMapUrl(o.address || '') : '#'}" target="_blank" rel="noreferrer">Map</a><button type="button" data-copy-order="${esc(idOf(o))}">Copy task note</button><button type="button" data-print-chef="${esc(idOf(o))}">Chef settlement</button></div></article>`).join('') : '<div class="empty-state">No assigned orders found for this filter.</div>'}</div>`;
    ['chefOrdersModeV126','chefOrdersDateV126','chefOrdersWeekV126','chefOrdersMonthV126'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.dataset.v126Bound) { el.dataset.v126Bound = '1'; el.addEventListener('change', renderChefOrdersPanel, true); }
    });
  }

  function applyChefTabsAndPanels(role){
    const clean = roleClean(role);
    const chef = clean === 'Chef';
    document.body.classList.toggle('chef-dashboard-v126', chef);
    const ordersTab = document.querySelector('[data-dashboard-tab="orders"]');
    const dispatchTab = document.querySelector('[data-dashboard-tab="dispatch"]');
    const ordersPage = document.querySelector('[data-dashboard-page="orders"]');
    const dispatchPage = document.querySelector('[data-dashboard-page="dispatch"]');
    if (chef) {
      if (ordersTab) { ordersTab.hidden = false; ordersTab.style.display = ''; ordersTab.disabled = false; ordersTab.textContent = 'Orders / 我的订单'; }
      if (dispatchTab) { dispatchTab.hidden = false; dispatchTab.style.display = ''; dispatchTab.disabled = false; dispatchTab.textContent = 'Chef Dispatch'; }
      if (ordersPage) { ordersPage.hidden = false; ordersPage.style.display = ''; }
      if (dispatchPage) { dispatchPage.hidden = false; dispatchPage.style.display = ''; }
      updateChefStats();
      renderChefOrdersPanel();
      renderChefTicketsPanel();
      const help = document.getElementById('dashboardHelp');
      if (help) help.innerHTML = '<span class="role-badge">Chef</span> Chef portal: manage your assigned orders, task notes, earnings, route details, and support tickets assigned to you.';
    }
    if (isStaff(clean)) addStaffTicketAssignmentControls();
  }

  const prevRoleVisibility = window.PHX_APPLY_ROLE_VISIBILITY_V85;
  if (typeof prevRoleVisibility === 'function' && !window.__PHX_V126_ROLE_WRAP__) {
    window.__PHX_V126_ROLE_WRAP__ = true;
    window.PHX_APPLY_ROLE_VISIBILITY_V85 = function(role){
      const out = prevRoleVisibility.apply(this, arguments);
      setTimeout(() => applyChefTabsAndPanels(role), 0);
      setTimeout(() => applyChefTabsAndPanels(role), 160);
      return out;
    };
  }
  const prevRender = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (prevRender && !window.__PHX_V126_RENDER_WRAP__) {
    window.__PHX_V126_RENDER_WRAP__ = true;
    renderDashboard = function(role){
      const out = prevRender.apply(this, arguments);
      const clean = roleClean(role || (typeof currentDashboardRole !== 'undefined' ? currentDashboardRole : ''));
      setTimeout(() => applyChefTabsAndPanels(clean), 0);
      setTimeout(() => applyChefTabsAndPanels(clean), 180);
      setTimeout(() => applyChefTabsAndPanels(clean), 500);
      return out;
    };
  }

  document.addEventListener('change', function(event){
    const sel = event.target.closest?.('[data-v126-ticket-chef]');
    if (!sel) return;
    const ticketId = sel.getAttribute('data-v126-ticket-chef');
    const chef = sel.value || '';
    const assignments = loadTicketAssignments();
    if (chef) assignments[ticketId] = chef; else delete assignments[ticketId];
    saveTicketAssignments(assignments);
    const feedback = (typeof getStoredFeedback === 'function' ? getStoredFeedback() : JSON.parse(localStorage.getItem('phoenixHibachiFeedbackV12') || '[]')).map(item => String(item.id) === String(ticketId) ? {...item, assignedChef: chef} : item);
    saveFeedbackList(feedback);
    setTimeout(() => { updateChefStats(); renderChefTicketsPanel(); }, 120);
  }, true);

  document.addEventListener('click', function(event){
    if (event.target.closest?.('[data-dashboard-tab], [data-portal-logout], [data-account-action]')) {
      setTimeout(() => applyChefTabsAndPanels(typeof currentDashboardRole !== 'undefined' ? currentDashboardRole : ''), 140);
    }
  }, true);

  setTimeout(() => applyChefTabsAndPanels(typeof currentDashboardRole !== 'undefined' ? currentDashboardRole : ''), 600);
})();

/* ======================================================================
   V127 CUSTOMER SERVICE CONTACT IMPORT + SUPPORT TICKET RESOLVE
   - Customer Service Members/Customers can manually add customer contacts.
   - Bulk import supports CSV/TXT offline and XLSX via SheetJS CDN when online.
   - Manual customers merge with booking/membership customers by email/phone/name.
   - Support tickets can be marked Resolved; resolved tickets disappear from active view.
   - No Supabase SQL required; local until a customers/support_tickets table is added.
   ====================================================================== */
(function initPHXV127CustomerServiceContacts(){
  if (window.__PHX_V127_CUSTOMER_IMPORT__) return;
  window.__PHX_V127_CUSTOMER_IMPORT__ = true;

  const MANUAL_CUSTOMERS_KEY = 'phoenixManualCustomersV127';
  const FEEDBACK_STORAGE_KEY = 'phoenixHibachiFeedbackV12';

  function esc(value){
    try { return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    catch { return String(value ?? ''); }
  }
  function clean(value){ return String(value ?? '').trim(); }
  function norm(value){ return clean(value).toLowerCase().replace(/[^a-z0-9@.]+/g,''); }
  function contactKey(c){ return norm(c.email) || norm(c.phone) || norm(c.name); }
  function moneySafe(n){ try { return typeof money === 'function' ? money(n) : '$' + Number(n || 0).toFixed(2); } catch { return '$0.00'; } }

  function loadManualCustomers(){
    try { return JSON.parse(localStorage.getItem(MANUAL_CUSTOMERS_KEY) || '[]') || []; } catch { return []; }
  }
  function saveManualCustomers(list){
    try { localStorage.setItem(MANUAL_CUSTOMERS_KEY, JSON.stringify(list || [])); } catch {}
  }
  function upsertManualCustomers(items){
    const existing = loadManualCustomers();
    const map = new Map();
    existing.forEach(c => { const k = contactKey(c) || c.id; if (k) map.set(k, c); });
    let added = 0, updated = 0;
    items.forEach(raw => {
      const item = normalizeCustomerRecord(raw);
      const k = contactKey(item);
      if (!k) return;
      const prev = map.get(k);
      if (prev) { map.set(k, {...prev, ...item, id: prev.id || item.id, updatedAt: new Date().toISOString()}); updated++; }
      else { map.set(k, item); added++; }
    });
    const list = [...map.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    saveManualCustomers(list);
    return {added, updated, total:list.length};
  }
  function normalizeCustomerRecord(raw){
    const name = clean(raw.name || raw.fullName || raw.customer || raw.customerName || raw['Customer Name'] || raw['Name'] || raw[0]);
    const phone = clean(raw.phone || raw.mobile || raw.cell || raw.tel || raw['Phone'] || raw['Phone Number'] || raw[1]);
    const email = clean(raw.email || raw.mail || raw['Email'] || raw[2]);
    const address = clean(raw.address || raw.street || raw['Address'] || raw[3]);
    const zip = clean(raw.zip || raw.zipcode || raw['Zip'] || raw['ZIP'] || raw[4]);
    const birthday = clean(raw.birthday || raw.birthdate || raw.dob || raw['Birthday'] || raw[5]);
    const notes = clean(raw.notes || raw.note || raw.memo || raw['Notes'] || raw[6]);
    return {
      id: raw.id || 'MANUAL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7).toUpperCase(),
      name: name || phone || email || 'Customer',
      phone, email, address, zip, birthday, notes,
      source: raw.source || 'Manual / Customer Service',
      orders: Number(raw.orders || 0),
      guests: Number(raw.guests || 0),
      packages: raw.packages || raw.package || 'Manual contact',
      lastDate: raw.lastDate || raw.last_date || '',
      importedAt: raw.importedAt || new Date().toISOString()
    };
  }
  function mergedCustomerRows(orders){
    let base = [];
    try { base = typeof buildCustomerRows === 'function' ? buildCustomerRows(orders || []) : []; } catch { base = []; }
    const map = new Map();
    base.forEach(c => { const k = contactKey(c) || c.name; if (k) map.set(k, {...c, source: c.source || 'Booking / Member'}); });
    loadManualCustomers().forEach(c => {
      const k = contactKey(c) || c.id;
      if (!k) return;
      const prev = map.get(k);
      if (prev) {
        map.set(k, {
          ...prev,
          name: prev.name || c.name,
          phone: prev.phone || c.phone,
          email: prev.email || c.email,
          address: prev.address || c.address,
          zip: prev.zip || c.zip,
          birthday: prev.birthday || c.birthday,
          notes: [prev.notes, c.notes].filter(Boolean).join(' · '),
          source: `${prev.source || 'Booking'} + Manual`,
          memberOffer: prev.memberOffer || c.notes || '',
        });
      } else {
        map.set(k, {...c, manualOnly:true});
      }
    });
    return [...map.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }

  function customerToolbarHtml(){
    return `<section class="customer-import-panel-v127">
      <div class="section-row customer-import-head-v127">
        <div>
          <p class="eyebrow">Customer Service Tool</p>
          <h3>Add / import customer contacts</h3>
          <p class="small-muted">Add one customer or import a list. Duplicate email/phone will update the existing row instead of creating repeats.</p>
        </div>
        <div class="mini-actions">
          <button type="button" data-v127-download-template>Download CSV template</button>
        </div>
      </div>
      <form class="customer-add-form-v127" data-v127-add-customer-form>
        <label>Name<input name="name" placeholder="Customer name"></label>
        <label>Phone<input name="phone" placeholder="347-000-0000"></label>
        <label>Email<input name="email" type="email" placeholder="customer@email.com"></label>
        <label>Address<input name="address" placeholder="Street, city, state"></label>
        <label>ZIP<input name="zip" placeholder="11228"></label>
        <label>Birthday<input name="birthday" placeholder="MM/DD or YYYY-MM-DD"></label>
        <label class="wide"><span>Notes</span><textarea name="notes" rows="2" placeholder="Preference, coupon note, VIP, allergy reminder, etc."></textarea></label>
        <div class="customer-form-actions-v127"><button type="submit">Add customer</button><button type="reset">Clear</button></div>
      </form>
      <div class="customer-import-row-v127">
        <label class="file-import-v127">Upload CSV / Excel
          <input type="file" data-v127-customer-file accept=".csv,.txt,.tsv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv">
        </label>
        <p class="small-muted">CSV works offline. XLSX uses a browser Excel parser when internet is available. Columns: name, phone, email, address, zip, birthday, notes.</p>
      </div>
      <div class="customer-import-result-v127" data-v127-import-result hidden></div>
    </section>`;
  }

  const previousRenderCustomerManagement = typeof renderCustomerManagement === 'function' ? renderCustomerManagement : null;
  window.renderCustomerManagement = renderCustomerManagement = function patchedRenderCustomerManagementV127(orders){
    const rows = mergedCustomerRows(orders || []);
    const table = rows.length ? `<div class="customer-table"><div class="customer-row customer-head"><span>Name</span><span>Phone</span><span>Email</span><span>Address / Birthday</span><span>Orders / Member</span><span>Actions</span></div>${rows.map(c => `<div class="customer-row ${c.manualOnly ? 'manual-customer-v127' : ''}"><span><b>${esc(c.name)}</b><small>${esc(c.packages || c.source || 'Member / no package yet')}</small></span><span>${esc(c.phone || '-')}</span><span>${esc(c.email || '-')}</span><span>${esc(c.address || '-')}<br><small>ZIP: ${esc(c.zip || '-')} · Birthday: ${esc(c.birthday || '-')}</small>${c.notes ? `<br><small>Note: ${esc(c.notes)}</small>` : ''}</span><span>${Number(c.orders || 0)} · ${Number(c.guests || 0)} guests<br><small>${esc(c.lastDate || c.accountStatus || c.memberOffer || c.source || '')}</small></span><span class="mini-actions"><a href="sms:${encodeURIComponent(c.phone || '')}">SMS</a><a href="mailto:${encodeURIComponent(c.email || '')}">Email</a><button type="button" data-copy-customer="${esc(c.phone || c.email || c.name)}">Copy</button>${c.manualOnly ? `<button type="button" data-v127-delete-customer="${esc(c.id)}">Delete</button>` : ''}</span></div>`).join('')}</div>` : '<div class="empty-state">No customers yet. Add a customer manually, import CSV/Excel, or wait for bookings to be submitted.</div>';
    return customerToolbarHtml() + table;
  };

  function parseCsvLine(line){
    const out = []; let cur = ''; let quoted = false;
    for (let i=0; i<line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i+1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if ((ch === ',' || ch === '\t' || ch === ';') && !quoted) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(clean);
  }
  function rowsFromDelimited(text){
    const lines = String(text || '').replace(/^\uFEFF/,'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const first = parseCsvLine(lines[0]);
    const headerLike = first.some(h => /name|phone|email|address|zip|birthday|note/i.test(h));
    const headers = headerLike ? first.map(h => h.toLowerCase().replace(/\s+/g,'')) : ['name','phone','email','address','zip','birthday','notes'];
    const dataLines = headerLike ? lines.slice(1) : lines;
    return dataLines.map(line => {
      const cells = parseCsvLine(line);
      const obj = {};
      headers.forEach((h,i)=>{
        if (/fullname|customername|name/.test(h)) obj.name = cells[i];
        else if (/phone|mobile|cell|tel/.test(h)) obj.phone = cells[i];
        else if (/email|mail/.test(h)) obj.email = cells[i];
        else if (/address|street/.test(h)) obj.address = cells[i];
        else if (/zip|zipcode|postal/.test(h)) obj.zip = cells[i];
        else if (/birthday|birthdate|dob/.test(h)) obj.birthday = cells[i];
        else if (/note|memo|comment/.test(h)) obj.notes = cells[i];
        else obj[h] = cells[i];
      });
      return obj;
    }).filter(r => r.name || r.phone || r.email);
  }
  function loadScript(src){
    return new Promise((resolve,reject)=>{
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script'); s.src = src; s.async = true; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  async function parseCustomerFile(file){
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      if (!window.XLSX) await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, {type:'array'});
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = window.XLSX.utils.sheet_to_json(sheet, {defval:''});
      return json.map(normalizeCustomerRecord).filter(r => r.name || r.phone || r.email);
    }
    const text = await file.text();
    return rowsFromDelimited(text).map(normalizeCustomerRecord);
  }
  function showImportResult(msg, good=true){
    const box = document.querySelector('[data-v127-import-result]');
    if (!box) return;
    box.hidden = false; box.classList.toggle('is-error', !good); box.textContent = msg;
  }
  function refreshCustomersPanel(){
    try {
      const list = document.getElementById('customerList');
      if (list && typeof renderCustomerManagement === 'function') list.innerHTML = renderCustomerManagement(typeof getDashboardOrders === 'function' ? getDashboardOrders() : []);
    } catch { try { renderDashboard(currentDashboardRole); } catch {} }
  }
  function downloadTemplate(){
    const csv = 'name,phone,email,address,zip,birthday,notes\nJane Customer,347-000-0000,jane@email.com,"1078 70th St, Brooklyn, NY",11228,07/15,VIP or coupon note\n';
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'phoenix-customer-import-template.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();}, 500);
  }

  const previousFeedbackCard = typeof feedbackCard === 'function' ? feedbackCard : null;
  window.feedbackCard = feedbackCard = function patchedFeedbackCardV127(item){
    if (String(item?.status || '').toLowerCase().includes('resolved')) return '';
    const html = previousFeedbackCard ? previousFeedbackCard(item) : `<article class="feedback-card"><header><div><strong>${esc(item.id)}</strong><p>${esc(item.feedbackType || 'Feedback')} · ${esc(item.name || '')}</p></div><span class="tag">${esc(item.status || 'New')}</span></header><p>${esc(item.message || '')}</p><div class="order-actions"></div></article>`;
    const assigned = item.assignedChef ? `<span class="tag">Assigned: ${esc(item.assignedChef)}</span>` : '';
    return html.replace('</header>', `${assigned}</header>`).replace('</div></article>', `<button type="button" data-v127-resolve-ticket="${esc(item.id)}">Resolve / 已解决</button></div></article>`);
  };
  const rawGetStoredFeedback = typeof getStoredFeedback === 'function' ? getStoredFeedback : null;
  if (rawGetStoredFeedback && !window.__PHX_V127_FEEDBACK_FILTER__) {
    window.__PHX_V127_FEEDBACK_FILTER__ = true;
    window.getStoredFeedback = getStoredFeedback = function getActiveFeedbackV127(){
      return rawGetStoredFeedback().filter(item => !String(item?.status || '').toLowerCase().includes('resolved'));
    };
  }
  function resolveTicket(ticketId){
    let list = [];
    try { list = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]') || []; } catch {}
    let found = false;
    list = list.map(item => String(item.id) === String(ticketId) ? (found = true, {...item, status:'Resolved', resolvedAt:new Date().toISOString()}) : item);
    if (found) localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(list));
    try { renderDashboard(currentDashboardRole); } catch { document.querySelector(`[data-v127-resolve-ticket="${CSS.escape(ticketId)}"]`)?.closest('article')?.remove(); }
  }

  document.addEventListener('submit', function(event){
    const form = event.target.closest?.('[data-v127-add-customer-form]');
    if (!form) return;
    event.preventDefault();
    const fd = new FormData(form);
    const item = Object.fromEntries(fd.entries());
    if (!clean(item.name) && !clean(item.phone) && !clean(item.email)) { showImportResult('Please enter at least name, phone, or email.', false); return; }
    const result = upsertManualCustomers([item]);
    form.reset();
    refreshCustomersPanel();
    setTimeout(()=>showImportResult(`Customer saved. Added ${result.added}, updated ${result.updated}. Total manual contacts: ${loadManualCustomers().length}.`), 0);
  }, true);

  document.addEventListener('change', async function(event){
    const input = event.target.closest?.('[data-v127-customer-file]');
    if (!input || !input.files?.[0]) return;
    const file = input.files[0];
    showImportResult('Importing customer file…');
    try {
      const rows = await parseCustomerFile(file);
      if (!rows.length) { showImportResult('No valid customer rows found. Check columns: name, phone, email, address, zip, birthday, notes.', false); input.value=''; return; }
      const result = upsertManualCustomers(rows);
      refreshCustomersPanel();
      setTimeout(()=>showImportResult(`Imported ${rows.length} rows. Added ${result.added}, updated ${result.updated}. Total manual contacts: ${loadManualCustomers().length}.`), 0);
    } catch (err) {
      console.error('Customer import failed', err);
      showImportResult('Import failed. For Excel, try saving as CSV, or check that the file has name/phone/email columns.', false);
    } finally { input.value=''; }
  }, true);

  document.addEventListener('click', function(event){
    const dl = event.target.closest?.('[data-v127-download-template]');
    if (dl) { event.preventDefault(); downloadTemplate(); return; }
    const del = event.target.closest?.('[data-v127-delete-customer]');
    if (del) {
      const id = del.getAttribute('data-v127-delete-customer');
      if (!confirm('Delete this manually added customer contact? Booking history will not be deleted.')) return;
      saveManualCustomers(loadManualCustomers().filter(c => String(c.id) !== String(id)));
      refreshCustomersPanel();
      return;
    }
    const res = event.target.closest?.('[data-v127-resolve-ticket]');
    if (res) {
      const id = res.getAttribute('data-v127-resolve-ticket');
      if (!confirm('Mark this support ticket as resolved and hide it from active tickets?')) return;
      resolveTicket(id);
    }
  }, true);

  const prevRender = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (prevRender && !window.__PHX_V127_RENDER_WRAP__) {
    window.__PHX_V127_RENDER_WRAP__ = true;
    renderDashboard = function renderDashboardV127(role){
      const out = prevRender.apply(this, arguments);
      setTimeout(()=>{
        try {
          if (['Admin','Manager','Customer Service'].includes(String(role || currentDashboardRole))) {
            const list = document.getElementById('customerList');
            if (list) list.innerHTML = renderCustomerManagement(typeof getDashboardOrders === 'function' ? getDashboardOrders() : []);
          }
        } catch {}
      }, 80);
      return out;
    };
  }
})();

/* V128 PATCH — Customer Service ticket history stays visible, active count decreases
   - Resolved tickets are kept in Complaints & Suggestions as history.
   - Dashboard support ticket stat counts only unresolved/active tickets.
   - Resolve button marks ticket resolved but does not remove the record.
*/
(function(){
  if (window.__PHX_V128_TICKET_HISTORY__) return;
  window.__PHX_V128_TICKET_HISTORY__ = true;

  const phxEsc = (value) => {
    try { return typeof esc === 'function' ? esc(value) : (typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))); }
    catch { return String(value ?? ''); }
  };
  const ticketStoreKey = (() => {
    try { return typeof FEEDBACK_STORAGE_KEY !== 'undefined' ? FEEDBACK_STORAGE_KEY : 'phoenix_feedback'; }
    catch { return 'phoenix_feedback'; }
  })();
  function allStoredTicketsV128(){
    try { return JSON.parse(localStorage.getItem(ticketStoreKey) || '[]') || []; }
    catch { return []; }
  }
  function saveStoredTicketsV128(list){
    try { localStorage.setItem(ticketStoreKey, JSON.stringify(Array.isArray(list) ? list : [])); } catch {}
  }
  function isResolvedTicketV128(item){
    const status = String(item?.status || '').toLowerCase();
    return status.includes('resolved') || Boolean(item?.resolvedAt || item?.resolved_at);
  }
  function activeTicketsV128(){
    return allStoredTicketsV128().filter(item => !isResolvedTicketV128(item));
  }
  function syncSupportStatV128(){
    const box = document.getElementById('statFeedback');
    if (!box) return;
    box.textContent = String(activeTicketsV128().length);
    const card = box.closest('.stat-card, .dashboard-stat, article, div');
    if (card) card.title = 'Active unresolved support tickets. Resolved records remain in Complaints & Suggestions history.';
  }

  // Restore getStoredFeedback to return ALL records, not only unresolved records.
  // Resolved ticket history must remain visible in Customer Service / Admin records.
  try {
    window.getStoredFeedback = getStoredFeedback = function getStoredFeedbackV128AllRecords(){
      return allStoredTicketsV128();
    };
  } catch {}

  const baseFeedbackCardV128 = typeof feedbackCard === 'function' ? feedbackCard : null;
  window.feedbackCard = feedbackCard = function feedbackCardV128TicketHistory(item){
    const resolved = isResolvedTicketV128(item);
    const id = item?.id || item?.ticket_id || 'Ticket';
    const type = item?.feedbackType || item?.type || 'Support';
    const name = item?.name || item?.customerName || '';
    const contact = item?.phone || item?.email || '';
    const msg = item?.message || item?.notes || item?.note || '';
    let html = '';
    try { html = baseFeedbackCardV128 ? baseFeedbackCardV128(item) : ''; } catch { html = ''; }
    if (!html || !String(html).trim()) {
      html = `<article class="feedback-card"><header><div><strong>${phxEsc(id)}</strong><p>${phxEsc(type)} · ${phxEsc(name)} · ${phxEsc(contact)}</p></div><span class="tag">${resolved ? 'Resolved / 已解决' : phxEsc(item?.status || 'New')}</span></header><p>${phxEsc(msg)}</p><div class="order-actions"></div></article>`;
    }
    // Remove any old V127 resolve button duplication.
    html = String(html).replace(/<button[^>]*data-v127-resolve-ticket="[^"]*"[^>]*>[\s\S]*?<\/button>/g, '');
    html = html.replace(/<button[^>]*data-v128-resolve-ticket="[^"]*"[^>]*>[\s\S]*?<\/button>/g, '');
    html = html.replace(/<span class="tag">\s*Resolved\s*\/\s*已解决\s*<\/span>/g, '');
    if (resolved) {
      const stamp = item?.resolvedAt || item?.resolved_at || '';
      const resolvedBadge = `<span class="tag ticket-resolved-v128">Resolved / 已解决${stamp ? ' · ' + phxEsc(new Date(stamp).toLocaleDateString()) : ''}</span>`;
      html = html.replace('</header>', `${resolvedBadge}</header>`);
      html = html.replace(/<article class="([^"]*)"/, '<article class="$1 ticket-history-resolved-v128"');
      const historyNote = '<p class="ticket-history-note-v128">This ticket is closed and kept for customer service history. It no longer counts as an active support ticket.</p>';
      html = html.replace('</article>', `${historyNote}</article>`);
    } else {
      const actions = `<button type="button" data-v128-resolve-ticket="${phxEsc(id)}">Resolve / 标记已解决</button>`;
      if (html.includes('class="order-actions"')) html = html.replace(/<div class="order-actions">/, `<div class="order-actions">${actions}`);
      else html = html.replace('</article>', `<div class="order-actions">${actions}</div></article>`);
    }
    return html;
  };

  function resolveTicketV128(ticketId){
    let list = allStoredTicketsV128();
    let found = false;
    list = list.map(item => {
      const id = String(item?.id || item?.ticket_id || '');
      if (id === String(ticketId)) {
        found = true;
        return {...item, status:'Resolved', resolvedAt:new Date().toISOString()};
      }
      return item;
    });
    if (found) saveStoredTicketsV128(list);
    try { renderDashboard(currentDashboardRole); } catch {}
    setTimeout(syncSupportStatV128, 80);
  }

  document.addEventListener('click', function(event){
    const btn = event.target.closest?.('[data-v128-resolve-ticket], [data-v127-resolve-ticket]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const id = btn.getAttribute('data-v128-resolve-ticket') || btn.getAttribute('data-v127-resolve-ticket');
    if (!id) return;
    if (!confirm('Mark this support ticket as resolved? The record will stay in history, but the active support ticket count will go down.')) return;
    resolveTicketV128(id);
  }, true);

  const previousRenderV128 = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (previousRenderV128) {
    renderDashboard = function renderDashboardV128TicketHistory(role){
      const out = previousRenderV128.apply(this, arguments);
      setTimeout(() => {
        try {
          // Keep Customer Service / Admin statistic cards visible. Only the active ticket count changes.
          const stats = document.querySelector('.dashboard-stats');
          if (stats && ['Admin','Manager','Customer Service'].includes(String(role || currentDashboardRole))) {
            stats.hidden = false;
            stats.style.display = '';
          }
          syncSupportStatV128();
          const list = document.getElementById('feedbackList');
          if (list && ['Admin','Manager','Customer Service'].includes(String(role || currentDashboardRole))) {
            const tickets = allStoredTicketsV128();
            if (tickets.length) list.innerHTML = tickets.map(feedbackCardV128TicketHistory).join('');
          }
        } catch {}
      }, 120);
      return out;
    };
  }

  setTimeout(syncSupportStatV128, 250);
})();

/* ======================================================================
   V129 PORTAL PROFILE / SCROLL / STABILITY CLEANUP
   Baseline: V128.  This patch intentionally avoids changing order, payment,
   dispatch, customer import, and ticket history logic.  It fixes the member
   profile access/scroll problem and reduces dashboard re-render flicker.
   ====================================================================== */
(function initPHXV129PortalProfileAndStability(){
  if (window.__PHX_V129_PORTAL_PROFILE_STABILITY__) return;
  window.__PHX_V129_PORTAL_PROFILE_STABILITY__ = true;

  function roleText(){
    try { return String(window.currentDashboardRole || currentDashboardRole || '').trim(); }
    catch { return ''; }
  }
  function isPortalOpen(){
    const modal = document.getElementById('dashboardModal');
    return !!(modal && modal.open);
  }
  function ensureDashboardProfileButtonV129(){
    const actions = document.querySelector('#dashboardModal .dashboard-actions');
    if (!actions) return;
    let btn = document.getElementById('dashProfileBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'dashProfileBtn';
      btn.className = 'outline-btn dashboard-profile-btn';
      btn.dataset.accountAction = 'profile';
      btn.textContent = 'Profile';
      const assistant = document.getElementById('dashAssistantBtn');
      actions.insertBefore(btn, assistant || actions.firstChild);
    }
    btn.hidden = false;
    btn.style.display = '';
    btn.dataset.accountAction = 'profile';
    btn.textContent = 'Profile';
  }

  function lockProfileDialogScrollV129(){
    const profileModal = document.getElementById('changePasswordModal');
    if (!profileModal) return;
    const sync = () => {
      const anyOpen = !!document.querySelector('dialog[open]');
      document.body.classList.toggle('phx-v129-modal-lock', anyOpen);
      if (profileModal.open) {
        const card = profileModal.querySelector('.modal-card, form');
        if (card) {
          card.style.overflowY = 'auto';
          card.style.maxHeight = 'calc(100dvh - 32px)';
          card.style.overscrollBehavior = 'contain';
        }
      }
    };
    sync();
    if (!profileModal.dataset.phxV129Observed) {
      profileModal.dataset.phxV129Observed = '1';
      try { new MutationObserver(sync).observe(profileModal, { attributes:true, attributeFilter:['open'] }); } catch {}
      profileModal.addEventListener('close', () => setTimeout(sync, 0));
      profileModal.addEventListener('cancel', () => setTimeout(sync, 0));
    }
  }

  function applyV129PortalPolish(){
    ensureDashboardProfileButtonV129();
    lockProfileDialogScrollV129();
    const dash = document.getElementById('dashboardModal');
    if (dash?.open) document.body.classList.add('portal-dashboard-active-v129');
    else document.body.classList.remove('portal-dashboard-active-v129');
  }

  // Open profile using the existing V96 profile handler.  The old handler listens
  // for data-account-action="profile"; this fallback keeps it working even if a
  // later wrapper stops propagation.
  document.addEventListener('click', function(event){
    const btn = event.target.closest?.('#dashProfileBtn');
    if (!btn) return;
    btn.dataset.accountAction = 'profile';
    setTimeout(() => {
      const modal = document.getElementById('changePasswordModal');
      if (modal && !modal.open) {
        const accountProfile = document.querySelector('[data-account-action="profile"]:not(#dashProfileBtn)');
        if (accountProfile) accountProfile.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true }));
      }
      lockProfileDialogScrollV129();
    }, 30);
  }, false);

  // De-bounce only repeated same-role renders in the same instant.  This reduces
  // the visible dashboard flicker without blocking real updates from buttons.
  const prevRender = typeof renderDashboard === 'function' ? renderDashboard : null;
  if (prevRender && !window.__PHX_V129_RENDER_WRAPPED__) {
    window.__PHX_V129_RENDER_WRAPPED__ = true;
    let lastRole = '';
    let lastAt = 0;
    let running = false;
    renderDashboard = function renderDashboardV129Stable(role){
      const cleanRole = role || (typeof currentDashboardRole !== 'undefined' ? currentDashboardRole : '') || roleText() || 'Admin';
      const now = Date.now();
      if (running && isPortalOpen() && String(cleanRole) === String(lastRole) && now - lastAt < 90) {
        return null;
      }
      running = true;
      document.body.classList.add('dashboard-rendering-v129');
      let result = null;
      try { result = prevRender.apply(this, arguments); }
      finally {
        lastRole = cleanRole;
        lastAt = Date.now();
        setTimeout(() => {
          running = false;
          document.body.classList.remove('dashboard-rendering-v129');
          applyV129PortalPolish();
        }, 80);
        setTimeout(applyV129PortalPolish, 240);
      }
      return result;
    };
  }

  // Keep polish after common portal state changes without repeatedly rebuilding data.
  ['DOMContentLoaded','visibilitychange'].forEach(name => document.addEventListener(name, () => setTimeout(applyV129PortalPolish, 60)));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-dashboard-tab], [data-open-login], [data-portal-logout], [data-account-action], #dashProfileBtn')) {
      setTimeout(applyV129PortalPolish, 90);
      setTimeout(applyV129PortalPolish, 260);
    }
  }, true);
  try { new MutationObserver(() => setTimeout(applyV129PortalPolish, 40)).observe(document.body, { childList:true, subtree:true }); } catch {}
  setTimeout(applyV129PortalPolish, 150);
})();
