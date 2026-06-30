window.PHX_BUILD_VERSION = 'V95_SINGLE_ENTRY_PORTAL_FIX';

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
  parts.push('Final arrival time will be confirmed within 24 hours before the event based on chef routing.');
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
    admin_notes: attachPreferredTimeNote([order.specialNotes || '', proteinNoteForOrder(order)].filter(Boolean).join('\n'), order.eventTime || '', order.customTimeRequest || ''),
    pdf_url: order.pdfUrl || order.pdf_url || null
  };
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
  const payload = orderToBookingRow(order);
  const { data, error } = await client.from('bookings').insert(payload).select('*').single();
  if (error) {
    console.error('Supabase booking insert failed:', error);
    return {ok:false, error:error.message};
  }

  // Commercial workflow hook: email + PDF generation should run in a Supabase Edge Function.
  // The function is intentionally non-blocking so the customer does not lose a confirmed order
  // if email/PDF provider has a temporary outage. See supabase/functions/booking-created.
  try {
    await client.functions.invoke('booking-created', { body: { booking_number: order.id, booking: data || payload } });
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
  const proteinRows = `<div class="invoice-row"><span>Protein selections</span><em>${m.proteinSelectedTotal || 0}/${m.proteinRequiredTotal || 0} portions</em><b>${printSafe(proteinSummary(m.proteinSelections))}</b></div>${premiumProteinRow}`;
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
        <div class="invoice-row"><span>Package charge</span><em>${printSafe(m.packageName)} ${money(m.packagePrice)}/adult · kids half price · 10 adult minimum</em><b>Total: ${money(m.packageSubtotal)}</b></div>
        ${proteinRows}
        ${addonsRows}
        <div class="invoice-row"><span>Travel Fee</span><em></em><b>Total: ${money(m.travelFee)}</b></div>
        <div class="invoice-row"><span>Sales Tax</span><em>${printSafe(m.taxLabel)}</em><b>Total: ${money(m.salesTax)}</b></div>
      </div>
    </div>
    <div class="invoice-selected-items"><b>Proteins</b><span>${printSafe(proteinSummary(m.proteinSelections))}</span><br><b>Adult</b><span>${printSafe(`${m.adults} adult guest(s)`)} </span><br><b>Kids</b><span>${m.kids ? `${m.kids} kid guest(s)` : '0'}</span></div>
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
  if (!validateGuestMinimum()) return;
  if (!validateProteinSelections()) return;
  if (!validateAddonDecision()) return;
  updateBookingReadyState();
  if (sendBookingRequestBtn?.disabled) return;
  const order = buildOrderFromForm(form);
  const saved = await saveBookingToSupabase(order);
  if (!saved.ok) {
    alert('Your booking was NOT submitted. Please call/text Phoenix Hibachi at 347-471-9190 or try again. Error: ' + saved.error);
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
