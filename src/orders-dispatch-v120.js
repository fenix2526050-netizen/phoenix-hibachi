/* Phoenix Hibachi V122 — Week wheel + weekday date labels + admin revenue analytics.
   Built from the stable V121 dispatch board. It only takes over Admin/Manager Orders view. */
(function PHXV120OrdersDispatch(){
  if (window.__PHX_V120_ORDERS_DISPATCH__) return;
  window.__PHX_V120_ORDERS_DISPATCH__ = true;

  const STORE_PREFIX = 'phx_v120_dispatch_';
  const STAFF_ROLES = new Set(['admin','manager','customer service']);
  function normalizedRole(raw){
    const r = String(raw || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (r.includes('admin')) return 'admin';
    if (r.includes('manager')) return 'manager';
    if (r.includes('customer service') || r.includes('客服')) return 'customer service';
    if (r.includes('chef') || r.includes('师傅')) return 'chef';
    if (r.includes('member') || r.includes('customer') || r.includes('顾客')) return 'member';
    return r;
  }
  const SLOT_LABELS = ['11:00 AM - 1:00 PM','2:00 PM - 4:00 PM','4:00 PM - 6:00 PM','7:00 PM - 9:00 PM'];
  const CHEF_COLORS = ['#ffc342','#4ade80','#60a5fa','#fb7185','#c084fc','#f97316'];
  const state = { monthKey: '', weekKey: '', dateKey: '', availabilityDateKey: '', weekdayFilter: '' };
  let renderTimer = null;
  let observerLock = false;
  let lastRenderedSig = '';

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
  function money(n){ const num = Number(n || 0); return `$${num.toFixed(2).replace(/\.00$/, '')}`; }
  function pad(n){ return String(n).padStart(2,'0'); }
  function ymd(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function monthKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
  function monthTitle(key){
    const [y,m] = String(key||'').split('-').map(Number);
    if(!y || !m) return 'Month pending';
    return new Date(y, m-1, 1).toLocaleDateString('en-US',{year:'numeric', month:'long'});
  }
  function dayTitle(key){
    const d = parseDate(key);
    if(!d) return 'Date pending';
    return d.toLocaleDateString('en-US',{month:'short', day:'numeric', weekday:'short'});
  }
  function parseDate(input){
    if(!input) return null;
    if(input instanceof Date && !isNaN(input)) return input;
    const raw = String(input).trim();
    let m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if(m) return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
    const d = new Date(raw.replace(/上午|下午/g,''));
    if(!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return null;
  }
  function orderDateKey(order){
    if(window.normalizeDateKey) {
      try { const k = window.normalizeDateKey(order); if(k) return k; } catch {}
    }
    return ymd(parseDate(order?.eventDate || order?.date || order?.event_date) || new Date());
  }
  function parseTimeMinutes(value){
    const raw = String(value || '').trim();
    const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if(!match) return 99999;
    let h = Number(match[1]);
    const min = Number(match[2] || 0);
    const ap = (match[3] || '').toUpperCase();
    if(ap === 'PM' && h < 12) h += 12;
    if(ap === 'AM' && h === 12) h = 0;
    return h*60 + min;
  }
  function timeText(order){
    const txt = String(order?.eventTime || order?.event_time || 'Time pending');
    return txt.replace(/\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)?/i,'').trim();
  }
  function arrayFromStorage(key){
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }
  function dedupeOrders(rows){
    const seen = new Set();
    const out = [];
    (rows || []).forEach((order, index) => {
      if (!order || typeof order !== 'object') return;
      const id = String(order.id || order.booking_number || order.bookingNumber || order.ref || '').trim();
      const fallback = [order.name || '', order.phone || '', order.email || '', order.address || order.event_address || '', orderDateKey(order), timeText(order)].join('|').toLowerCase();
      const key = id || fallback || `row-${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (!order.id && id) order.id = id;
      out.push(order);
    });
    return out;
  }
  function getOrders(){
    const rows = [];
    try {
      if(typeof window.getDashboardOrders === 'function') rows.push(...((window.getDashboardOrders() || []).slice()));
    } catch {}
    try { if(Array.isArray(window.dashboardOrders)) rows.push(...window.dashboardOrders); } catch {}
    try { if(Array.isArray(window.currentDashboardOrders)) rows.push(...window.currentDashboardOrders); } catch {}
    [
      'phoenixHibachiOrdersV12',
      'phoenixBookings',
      'phoenix_orders',
      'phoenix_orders_cache',
      'phoenix_dashboard_orders',
      'bookings'
    ].forEach(key => rows.push(...arrayFromStorage(key)));
    return dedupeOrders(rows);
  }
  function roleAllowed(){
    const role = normalizedRole(window.currentDashboardRole || localStorage.getItem('phoenix_portal_role') || localStorage.getItem('phoenix_dashboard_role') || 'Admin');
    return STAFF_ROLES.has(role);
  }
  function selectedMonthOrders(orders){ return orders.filter(o => orderDateKey(o).startsWith(state.monthKey)); }
  function weekStartMonday(date){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (d.getDay()+6)%7;
    d.setDate(d.getDate()-day);
    return d;
  }
  function weekKeyForDate(d){ return ymd(weekStartMonday(d)); }
  function weeksForMonth(key){
    const [y,m] = key.split('-').map(Number);
    if(!y || !m) return [];
    const first = new Date(y, m-1, 1);
    const last = new Date(y, m, 0);
    let start = weekStartMonday(first);
    const weeks=[];
    for(let i=0;i<7;i++){
      const end = new Date(start); end.setDate(start.getDate()+6);
      if(end >= first && start <= last){
        weeks.push({key: ymd(start), start: new Date(start), end, label:`${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`});
      }
      start.setDate(start.getDate()+7);
    }
    return weeks;
  }
  function inWeek(key, week){
    const d = parseDate(key), s = parseDate(week);
    if(!d || !s) return false;
    const e = new Date(s); e.setDate(s.getDate()+6);
    return d >= s && d <= e;
  }
  function sequenceKey(dateKey){ return `${STORE_PREFIX}sequence_${dateKey}`; }
  function canonicalSlot(slot){
    const raw = String(slot || '').toLowerCase();
    if(raw.includes('11')) return '11:00 AM - 1:00 PM';
    if(raw.match(/2(:00)?/) || raw.includes('2:00 pm')) return '2:00 PM - 4:00 PM';
    if(raw.match(/4(:00)?/) || raw.includes('4:00 pm')) return '4:00 PM - 6:00 PM';
    if(raw.match(/6(:00)?/) || raw.match(/7(:00)?/) || raw.match(/8(:00)?/) || raw.includes('dinner')) return '7:00 PM - 9:00 PM';
    return String(slot || '').trim();
  }
  function legacySlotLabels(slot){
    const c = canonicalSlot(slot);
    if(c === '11:00 AM - 1:00 PM') return ['11:00 AM - 1:00 PM','11:00 AM'];
    if(c === '2:00 PM - 4:00 PM') return ['2:00 PM - 4:00 PM','2:00 PM'];
    if(c === '4:00 PM - 6:00 PM') return ['4:00 PM - 6:00 PM','4:00 PM'];
    if(c === '7:00 PM - 9:00 PM') return ['7:00 PM - 9:00 PM','7:00 PM','6:00 PM','8:00 PM'];
    return [c];
  }
  function slotKey(dateKey, slot){ return `${STORE_PREFIX}slot_${dateKey}_${canonicalSlot(slot)}`; }
  function getSlotStatus(dateKey, slot){
    const labels = legacySlotLabels(slot);
    for(const label of labels){
      const value = localStorage.getItem(`${STORE_PREFIX}slot_${dateKey}_${label}`);
      if(value) return value;
    }
    return 'Available';
  }
  function getSeq(dateKey, orders){
    let saved=[];
    try { saved = JSON.parse(localStorage.getItem(sequenceKey(dateKey)) || '[]'); } catch {}
    const ids = new Set(orders.map(o=>String(o.id)));
    const ordered = saved.filter(id => ids.has(String(id)));
    const missing = orders.filter(o => !ordered.includes(String(o.id))).sort((a,b)=>parseTimeMinutes(timeText(a))-parseTimeMinutes(timeText(b))).map(o=>String(o.id));
    return ordered.concat(missing);
  }
  function setSeq(dateKey, ids){ localStorage.setItem(sequenceKey(dateKey), JSON.stringify(ids.map(String))); }
  function sortBySeq(dateKey, orders){
    const seq = getSeq(dateKey, orders);
    const pos = new Map(seq.map((id,i)=>[String(id),i]));
    return orders.slice().sort((a,b)=>(pos.get(String(a.id))??9999)-(pos.get(String(b.id))??9999));
  }
  function hasTimeConflict(orders){
    let prev = -1;
    for(const o of orders){
      const t = parseTimeMinutes(timeText(o));
      if(t < prev) return true;
      prev = t;
    }
    return false;
  }
  function chefName(order){
    return String(order.assignedChef || order.assigned_chef || order.chef || 'Unassigned');
  }
  function orderGuests(order){
    try { if(typeof window.orderMoney === 'function') return window.orderMoney(order).totalGuests; } catch {}
    return Number(order.adults || order.guests || 0) + Number(order.kids || 0);
  }
  function orderTotal(order){
    try { if(typeof window.orderMoney === 'function') return window.orderMoney(order).guestTotalBeforeDeposit; } catch {}
    return Number(order.total || order.estimatedTotal || 0);
  }
  function noteValue(notes, label){
    const prefix = String(label || '').toLowerCase() + ':';
    const line = String(notes || '').split(/\n/).find(row => row.trim().toLowerCase().startsWith(prefix));
    return line ? line.split(':').slice(1).join(':').trim() : '';
  }
  function notesOf(order){ return String(order?.admin_notes || order?.specialNotes || order?.notes || ''); }
  function dateInputValue(order){
    const d = parseDate(order?.event_date || order?.eventDate || order?.date || '');
    return d ? ymd(d) : '';
  }
  function timeOptionValue(order){ return String(order?.eventTime || order?.event_time || timeText(order) || '').trim(); }
  function chefList(){
    try { if (Array.isArray(CHEFS)) return CHEFS; } catch {}
    try { if (Array.isArray(window.CHEFS)) return window.CHEFS; } catch {}
    return [];
  }
  function selectedChefId(order){
    const notes = notesOf(order);
    return noteValue(notes, 'Assigned chef id') || noteValue(notes, 'Phoenix chef id') || order?.assignedChefId || order?.assigned_chef_id || '';
  }
  function chefSelectOptions(order){
    const selected = String(selectedChefId(order) || '');
    const opts = ['<option value="">Pending / unassigned</option>'];
    chefList().forEach(c => {
      const id = String(c.id || c.name || '');
      const label = `${c.name || 'Chef'}${c.base || c.zone ? ' · ' + (c.base || c.zone) : ''}`;
      opts.push(`<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(label)}</option>`);
    });
    return opts.join('');
  }
  function timeOptions(order){
    const current = timeOptionValue(order);
    const presets = ['11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM'];
    const all = current && !presets.includes(current) ? [current, ...presets] : presets;
    return all.map(t => `<option value="${esc(t)}" ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('');
  }
  function actionToolsHtml(order){
    const id = esc(order.id || order.booking_number || '');
    const status = String(order.status || '').toLowerCase();
    const confirmed = /confirm|accept|complete/.test(status);
    return `<div class="v102-order-tools phx-v120-order-actions" data-v120-tools="${id}">
      <button type="button" class="gold-btn-mini" data-v120-action="confirm" data-v120-order-id="${id}" ${confirmed ? 'disabled' : ''}>${confirmed ? 'Confirmed' : 'Confirm order'}</button>
      <button type="button" data-v120-action="details" data-v120-order-id="${id}">Order details</button>
      <button type="button" data-v120-action="time" data-v120-order-id="${id}">Modify time</button>
      <button type="button" data-v120-action="chef" data-v120-order-id="${id}">Assign chef</button>
      <button type="button" data-v120-action="print" data-v120-order-id="${id}">Print</button>
      <button type="button" class="v107-payment-button" data-v120-action="payment" data-v120-order-id="${id}">Payment / price</button>
    </div>`;
  }
  function orderToolsPanel(order){
    const id = esc(order.id || order.booking_number || '');
    const notes = notesOf(order);
    const m = (() => { try { return typeof calculateOrderMoney === 'function' ? calculateOrderMoney(order) : {}; } catch { return {}; } })();
    const travel = Number(order.travelFee || order.travel_fee || m.travelFee || 0);
    const received = Number(order.depositPaid || order.deposit_amount || noteValue(notes, 'Payment received') || 0);
    const discount = Number(noteValue(notes, 'Manager discount') || 0);
    const finalTotal = noteValue(notes, 'Final total override');
    const paymentStatus = noteValue(notes, 'Payment status note') || order.paymentStatus || order.payment_status || 'unpaid';
    const paymentMethod = noteValue(notes, 'Payment method') || '';
    const reason = noteValue(notes, 'Adjustment reason') || '';
    const customerNote = noteValue(notes, 'Customer payment note') || '';
    const waived = /yes|true|1|waived/i.test(noteValue(notes, 'Travel fee waived'));
    return `<div class="v102-order-panel" data-v120-panel="${id}" hidden>
      <div class="v102-detail-grid">
        <p><b>Customer</b><br>${esc(order.name || 'Guest')}<br>${esc(order.phone || 'No phone')}<br>${esc(order.email || 'No email')}</p>
        <p><b>Event</b><br>${esc(order.eventDate || order.event_date || '')} · ${esc(order.eventTime || order.event_time || '')}<br>${esc(order.address || order.event_address || 'No address')}</p>
        <p><b>Package / money</b><br>${esc(order.package || order.packageName || 'Classic')} · ${esc(order.totalGuests || order.total_guests || order.guests || '')} guests<br>Total ${money(orderTotal(order))} · Travel ${money(travel)}</p>
        <p><b>Chef visible to customer</b><br>${esc(chefName(order))}<br><small>${esc(noteValue(notes, 'Customer visible note') || noteValue(notes, 'Phoenix customer note') || 'No customer-facing note yet.')}</small></p>
      </div>
      <div class="v102-tool-boxes">
        <section><h4>Modify event date / time</h4><div class="v102-row"><label>Date<input type="date" data-v120-date-input="${id}" value="${esc(dateInputValue(order))}"></label><label>Party start time<select data-v120-time-input="${id}">${timeOptions(order)}</select></label><button type="button" data-v120-save-time="${id}">Save time</button></div></section>
        <section><h4>Assign chef</h4><div class="v102-row"><label>Chef<select data-v120-chef-input="${id}">${chefSelectOptions(order)}</select></label><button type="button" data-v120-save-chef="${id}">Save chef</button></div></section>
      </div>
    </div>
    <section class="v107-payment-panel" data-v120-payment-panel="${id}" hidden>
      <header><div><h4>Payment / price adjustment</h4><p>Waive travel fee, discount a missed item, accept cash/Zelle, or manually override the final total.</p></div><span class="v107-balance-badge">Balance due ${money(m.guestTotalAfterDeposit || orderTotal(order))}</span></header>
      <div class="v107-payment-grid">
        <label>Payment status<select data-v120-payment-status="${id}">${['unpaid','transfer pending','deposit received','paid in full','cash deposit received','zelle deposit received','balance due','refunded / adjusted'].map(s => `<option value="${esc(s)}" ${String(paymentStatus).toLowerCase() === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label>Payment method<select data-v120-payment-method="${id}">${['','Zelle','Cash','Venmo','Cash App','Credit card','Check','Other transfer'].map(s => `<option value="${esc(s)}" ${paymentMethod === s ? 'selected' : ''}>${s ? esc(s) : 'Not selected'}</option>`).join('')}</select></label>
        <label>Deposit / payment received<input type="number" min="0" step="0.01" data-v120-payment-received="${id}" value="${esc(Number(received || 0).toFixed(2))}"></label>
        <label>Manager discount / credit<input type="number" min="0" step="0.01" data-v120-discount="${id}" value="${esc(Number(discount || 0).toFixed(2))}"></label>
        <label>Final total override<input type="number" min="0" step="0.01" placeholder="Leave blank for calculated total" data-v120-final-total="${id}" value="${esc(finalTotal)}"></label>
        <label>Travel fee<input type="number" min="0" step="0.01" data-v120-travel-fee="${id}" value="${esc(Number(travel || 0).toFixed(2))}"></label>
      </div>
      <label class="v107-check"><input type="checkbox" data-v120-waive-travel="${id}" ${waived ? 'checked' : ''}> Waive travel fee / 免车费</label>
      <label>Reason / internal note<textarea rows="2" data-v120-reason="${id}" placeholder="Example: chef forgot sushi roll tray, manager approved credit.">${esc(reason)}</textarea></label>
      <label>Customer visible payment note<textarea rows="2" data-v120-customer-note="${id}" placeholder="Example: Deposit received by Zelle. Balance due at event.">${esc(customerNote)}</textarea></label>
      <div class="v107-payment-summary"><b>Current estimate:</b> ${money(m.guestTotalBeforeDeposit || orderTotal(order))} · <b>Received:</b> ${money(m.depositPaid || received || 0)} · <b>Balance:</b> ${money(m.guestTotalAfterDeposit || Math.max(0, orderTotal(order) - received))}</div>
      <div class="v107-payment-actions"><button type="button" class="gold-btn-mini" data-v120-save-payment="${id}">Save payment / price</button><button type="button" data-v120-mark-deposit="${id}">Quick mark $200 deposit received</button><button type="button" data-print-guest="${id}">Print updated invoice</button></div>
    </section>`;
  }
  function orderHtml(order){
    const id = esc(order.id || order.booking_number || '');
    const status = esc(order.status || 'Pending');
    return `<article class="order-card phx-v120-managed-order-card" data-v102-order-card="${id}" data-v120-order-card="${id}">
      <header><strong>${id}</strong><span class="tag">${status}</span></header>
      <p>${esc(order.eventDate || order.event_date || '')} · ${esc(order.eventTime || order.event_time || '')}<br>${esc(order.name || 'Guest')} · ${esc(order.phone || '')}<br>${esc(order.address || order.event_address || 'No address')}</p>
      ${actionToolsHtml(order)}
      ${orderToolsPanel(order)}
      <button type="button" class="danger-btn" data-delete-order="${id}" onclick="return window.PHX_DELETE_ORDER_V78 ? window.PHX_DELETE_ORDER_V78(event,this) : true">Delete order</button>
    </article>`;
  }

  function monthOptions(orders){
    const orderKeys = Array.from(new Set(orders.map(orderDateKey).filter(Boolean).map(k => k.slice(0,7)))).sort();
    const now = new Date();
    let year = Number((state.monthKey || orderKeys[0] || monthKey(now)).slice(0,4)) || now.getFullYear();
    const keys = Array.from({length:12}, (_,i)=>`${year}-${pad(i+1)}`);
    orderKeys.forEach(k => { if(!keys.includes(k)) keys.push(k); });
    keys.sort();
    const preferred = orderKeys[0] || monthKey(now);
    if(!state.monthKey || !keys.includes(state.monthKey)) state.monthKey = preferred;
    return keys;
  }
  function renderCalendar(orders){
    const [y,m] = state.monthKey.split('-').map(Number);
    const first = new Date(y, m-1, 1), last = new Date(y, m, 0);
    const startOffset = first.getDay();
    const countByDate = new Map();
    orders.forEach(o => countByDate.set(orderDateKey(o), (countByDate.get(orderDateKey(o))||0)+1));
    const selectedWeekStart = state.weekKey ? parseDate(state.weekKey) : null;
    const selectedWeekEnd = selectedWeekStart ? (()=>{ const e=new Date(selectedWeekStart); e.setDate(e.getDate()+6); return e; })() : null;
    const cells=[];
    for(let i=0;i<startOffset;i++) cells.push('<div class="phx-v120-cal-cell empty"></div>');
    for(let day=1; day<=last.getDate(); day++){
      const key = `${state.monthKey}-${pad(day)}`;
      const d = parseDate(key);
      const count = countByDate.get(key)||0;
      const slotValues = SLOT_LABELS.map(s => getSlotStatus(key, s));
      const blockedCount = slotValues.filter(v => v === 'Full' || v === 'Closed').length;
      const isFullyBlocked = blockedCount >= SLOT_LABELS.length;
      const isPartiallyBlocked = blockedCount > 0 && !isFullyBlocked;
      const availabilityNote = isFullyBlocked
        ? '<em class="phx-v120-day-note full">Full</em>'
        : (isPartiallyBlocked ? `<em class="phx-v120-day-note partial">${blockedCount} slot${blockedCount>1?'s':''} full</em>` : '');
      const inSelectedWeek = selectedWeekStart && selectedWeekEnd && d >= selectedWeekStart && d <= selectedWeekEnd;
      const weekdayActive = state.weekdayFilter !== '' && Number(state.weekdayFilter) === d.getDay();
      cells.push(`<button type="button" class="phx-v120-cal-cell ${count?'has-orders':''} ${isFullyBlocked?'has-blocked':''} ${isPartiallyBlocked?'has-limited':''} ${state.dateKey===key?'active route-active':''} ${state.availabilityDateKey===key?'availability-active':''} ${inSelectedWeek?'in-selected-week':''} ${weekdayActive?'weekday-active':''}" data-v120-date="${esc(key)}"><b>${day}</b>${count?`<span>${count} order${count>1?'s':''}</span>`:''}${count?'<i></i>':''}${availabilityNote}</button>`);
    }
    return `<div class="phx-v120-calendar"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>${cells.join('')}</div>`;
  }
  function ensureWeekKey(orders){
    if(state.weekKey) return state.weekKey;
    const monthOrders = selectedMonthOrders(orders);
    const firstOrder = monthOrders.slice().sort((a,b)=>orderDateKey(a).localeCompare(orderDateKey(b)) || parseTimeMinutes(timeText(a))-parseTimeMinutes(timeText(b)))[0];
    const base = firstOrder ? parseDate(orderDateKey(firstOrder)) : parseDate(`${state.monthKey}-01`);
    state.weekKey = weekKeyForDate(base || new Date());
    return state.weekKey;
  }
  function weekLabelParts(week, index, rows){
    const range = `${week.start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${week.end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
    return { name: `Week ${index+1}`, range, count: rows.filter(o => inWeek(orderDateKey(o), week.key)).length };
  }
  function renderWeekdayTabs(orders){
    const weeks = weeksForMonth(state.monthKey);
    if(!weeks.length) return '';
    const monthRows = selectedMonthOrders(orders);
    const wk = ensureWeekKey(orders);
    const selectedWeek = weeks.find(w => w.key === wk) || weeks[0];
    if(selectedWeek && state.weekKey !== selectedWeek.key) state.weekKey = selectedWeek.key;
    const weekRows = orders.filter(o => inWeek(orderDateKey(o), state.weekKey));
    const selectedIndex = Math.max(0, weeks.findIndex(w => w.key === state.weekKey));
    const selectedParts = selectedWeek ? weekLabelParts(selectedWeek, selectedIndex, orders) : {name:'Week', range:'', count:0};
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayButtons = [];
    for(let i=0;i<7;i++){
      const d = new Date(selectedWeek.start); d.setDate(selectedWeek.start.getDate()+i);
      const key = ymd(d);
      const dayValue = d.getDay();
      const c = orders.filter(o => orderDateKey(o) === key).length;
      const shortDate = d.toLocaleDateString('en-US',{month:'numeric', day:'numeric'});
      const active = state.dateKey === key || (!state.dateKey && String(state.weekdayFilter) === String(dayValue));
      dayButtons.push(`<button type="button" class="${active?'active':''} ${c?'has-orders':''}" data-v121-weekday="${dayValue}" data-v121-weekday-date="${esc(key)}"><b>${esc(dayNames[dayValue])}</b><span>${esc(shortDate)} · ${c} order${c!==1?'s':''}</span></button>`);
    }
    return `<div class="phx-v121-weekday-wrap phx-v122-week-wheel-wrap">
      <div class="phx-v122-week-wheel-card">
        <label><span>Selected week</span><select data-v121-week-wheel>${weeks.map((w,i)=>{
          const parts = weekLabelParts(w, i, orders);
          return `<option value="${esc(w.key)}" ${w.key===state.weekKey?'selected':''}>${esc(parts.name)} · ${esc(parts.range)} · ${parts.count} order${parts.count!==1?'s':''}</option>`;
        }).join('')}</select></label>
        <small>${esc(selectedParts.name)} · ${esc(selectedParts.range)} · ${selectedParts.count} order${selectedParts.count!==1?'s':''}</small>
      </div>
      <div class="phx-v121-weekday-tabs phx-v122-day-tabs">${dayButtons.join('')}</div>
    </div>`;
  }
  function filteredOrders(orders){
    let rows = selectedMonthOrders(orders);
    if(state.dateKey) {
      rows = rows.filter(o => orderDateKey(o) === state.dateKey);
    } else if(state.weekKey) {
      rows = rows.filter(o => inWeek(orderDateKey(o), state.weekKey));
      if(state.weekdayFilter !== '') rows = rows.filter(o => parseDate(orderDateKey(o))?.getDay() === Number(state.weekdayFilter));
    }
    return rows.sort((a,b)=> orderDateKey(a).localeCompare(orderDateKey(b)) || parseTimeMinutes(timeText(a))-parseTimeMinutes(timeText(b)));
  }
  function renderSlots(){
    const slotDateKey = state.availabilityDateKey || state.dateKey;
    if(!slotDateKey) return `<div class="phx-v120-slot-box empty"><strong>Availability</strong><p>Click a calendar date to manage Full or Closed booking windows.</p></div>`;
    return `<div class="phx-v120-slot-box"><strong>${esc(dayTitle(slotDateKey))} availability</strong><div class="phx-v120-slots">${SLOT_LABELS.map(slot=>{
      const v = getSlotStatus(slotDateKey, slot);
      return `<button type="button" class="${v.toLowerCase()}" data-v120-slot="${esc(slot)}"><b>${esc(slot)}</b><span>${esc(v)}</span></button>`;
    }).join('')}</div><small>Full/Closed syncs to the public booking calendar in this browser. Supabase sync can make it global for all visitors.</small></div>`;
  }
  function moneyMetrics(order){
    try { if(typeof window.calculateOrderMoney === 'function') return window.calculateOrderMoney(order); } catch {}
    try { if(typeof calculateOrderMoney === 'function') return calculateOrderMoney(order); } catch {}
    return { guestTotalBeforeDeposit: orderTotal(order), chefGuestPayout: 0, travelFee: Number(order.travelFee || order.travel_fee || 0), foodSubtotal: 0, totalGuests: orderGuests(order) };
  }
  function revenueAnalyticsHtml(rows){
    const totals = rows.reduce((acc,o)=>{
      const m = moneyMetrics(o);
      const revenue = Number(m.guestTotalBeforeDeposit || orderTotal(o) || 0);
      const chef = Number(m.chefGuestPayout || 0);
      const travel = Number(m.travelFee || o.travelFee || o.travel_fee || 0);
      const foodBase = Number(m.foodSubtotal || Math.max(0, revenue - travel));
      const foodCost = foodBase * 0.35;
      acc.revenue += revenue; acc.chef += chef; acc.travel += travel; acc.food += foodCost; acc.guests += Number(m.totalGuests || orderGuests(o) || 0);
      return acc;
    }, {revenue:0, chef:0, travel:0, food:0, guests:0});
    const profit = Math.max(0, totals.revenue - totals.chef - totals.travel - totals.food);
    const denom = Math.max(1, totals.revenue);
    const pChef = Math.round(totals.chef / denom * 100);
    const pTravel = Math.round(totals.travel / denom * 100);
    const pFood = Math.round(totals.food / denom * 100);
    const pProfit = Math.max(0, 100 - pChef - pTravel - pFood);
    const scope = state.dateKey ? dayTitle(state.dateKey) : state.weekKey ? 'Selected week' : monthTitle(state.monthKey);
    const gradient = `conic-gradient(#ffc342 0 ${pProfit}%, #4ade80 ${pProfit}% ${pProfit+pFood}%, #60a5fa ${pProfit+pFood}% ${pProfit+pFood+pTravel}%, #fb7185 ${pProfit+pFood+pTravel}% 100%)`;
    return `<section class="phx-v121-analytics"><header><div><p class="eyebrow">Admin revenue view</p><h4>${esc(scope)} performance</h4><span>${rows.length} orders · ${totals.guests} guests · estimated numbers</span></div><div class="phx-v121-pie" style="background:${gradient}"><b>${pProfit}%</b><span>est. left</span></div></header><div class="phx-v121-metrics"><div><small>Total revenue</small><b>${money(totals.revenue)}</b></div><div><small>Chef guest payout</small><b>${money(totals.chef)}</b></div><div><small>Travel fee</small><b>${money(totals.travel)}</b></div><div><small>Est. food cost 35%</small><b>${money(totals.food)}</b></div><div><small>Est. remaining</small><b>${money(profit)}</b></div></div></section>`;
  }
  function monthStatsHtml(monthRows){
    const guests = monthRows.reduce((sum,o)=>sum + Number(orderGuests(o)||0), 0);
    return `<div class="phx-v121-month-stats"><div><span>Selected month</span><b>${esc(monthTitle(state.monthKey))}</b></div><div><span>Total orders</span><b>${monthRows.length}</b></div><div><span>Total guests</span><b>${guests}</b></div></div>`;
  }
  function routeMap(dayOrders){
    if(!state.dateKey) return '';
    const sorted = sortBySeq(state.dateKey, dayOrders);
    const byChef = new Map();
    sorted.forEach((o,idx)=>{
      o.__v120Index = idx+1;
      const chef = chefName(o);
      if(!byChef.has(chef)) byChef.set(chef, []);
      byChef.get(chef).push(o);
    });
    const points = sorted.map((o,idx)=>{
      const lat = Number(o.latitude || o.lat || o.event_latitude), lng = Number(o.longitude || o.lng || o.event_longitude);
      let x,y;
      if(isFinite(lat) && isFinite(lng)){
        x = 12 + ((lng + 74.5) % 1.2) / 1.2 * 76;
        y = 12 + (1 - ((lat - 40.3) % 1.0) / 1.0) * 76;
      } else {
        const n = Math.max(1, sorted.length-1);
        x = 14 + (idx / n) * 72;
        y = 68 - (idx % 4) * 13;
      }
      return {order:o, x, y};
    });
    const pointById = new Map(points.map(p=>[String(p.order.id),p]));
    let lines='';
    let legends='';
    Array.from(byChef.entries()).forEach(([chef, rows], groupIndex)=>{
      const color = CHEF_COLORS[groupIndex % CHEF_COLORS.length];
      const pts = rows.map(o => pointById.get(String(o.id))).filter(Boolean);
      if(pts.length > 1){
        lines += `<polyline points="${pts.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"></polyline>`;
      }
      legends += `<span><i style="background:${color}"></i>${esc(chef)} · ${rows.map(o=>o.__v120Index).join(' → ')}</span>`;
    });
    const markers = points.map((p,idx)=>{
      const chefIndex = Array.from(byChef.keys()).indexOf(chefName(p.order));
      const color = CHEF_COLORS[Math.max(0,chefIndex) % CHEF_COLORS.length];
      return `<g><circle cx="${p.x}" cy="${p.y}" r="7.5" fill="${color}" stroke="#0b0703" stroke-width="2"></circle><text x="${p.x}" y="${p.y+3.5}" text-anchor="middle" font-size="8" font-weight="900" fill="#0b0703">${idx+1}</text></g>`;
    }).join('');
    const list = sorted.map((o,idx)=>{
      return `<article class="phx-v120-route-stop"><div class="phx-v120-stop-num">${idx+1}</div><div><strong>${esc(timeText(o))} · ${esc(o.id)}</strong><p>${esc(o.name || '')} · ${esc(o.address || 'No address')}</p><small>${esc(chefName(o))} · ${orderGuests(o)} guests · ${money(orderTotal(o))}</small></div><div class="phx-v120-stop-actions"><button type="button" data-v120-move="up" data-v120-id="${esc(o.id)}" ${idx===0?'disabled':''}>Move earlier</button><button type="button" data-v120-move="down" data-v120-id="${esc(o.id)}" ${idx===sorted.length-1?'disabled':''}>Move later</button><button type="button" data-v120-reset-time>Use time order</button></div></article>`;
    }).join('');
    return `<section class="phx-v120-day-route"><header><div><h4>${esc(dayTitle(state.dateKey))} route map</h4><p>${sorted.length} stop${sorted.length!==1?'s':''}. Numbered by selected-day route order.</p></div><div class="phx-v120-route-legend">${legends}</div><button type="button" class="outline-btn phx-v121-build-route" data-v121-build-route>Build Route Plan</button></header><div class="phx-v120-map"><svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" rx="9" fill="rgba(0,0,0,.35)"></rect><path d="M10 25 H90 M10 50 H90 M10 75 H90 M25 10 V90 M50 10 V90 M75 10 V90" stroke="rgba(255,255,255,.06)" stroke-width=".6"></path>${lines}${markers}</svg></div><div class="phx-v120-route-stops">${list}</div></section>`;
  }
  function buildBoard(){
    const page = document.querySelector('[data-dashboard-page="orders"]');
    if(!page || !roleAllowed()) return null;
    let board = document.getElementById('phxV120OrdersBoard');
    if(!board){
      board = document.createElement('section');
      board.id = 'phxV120OrdersBoard';
      board.className = 'phx-v120-orders-board';
      const route = document.getElementById('routePlannerPanel');
      page.insertBefore(board, route || document.getElementById('orderList'));
    }
    const calendarBtn = document.getElementById('calendarSummaryBtn'); if(calendarBtn) calendarBtn.style.display='none';
    const calendarPanel = document.getElementById('calendarSummaryPanel'); if(calendarPanel) { calendarPanel.hidden=true; calendarPanel.style.display='none'; }
    const route = document.getElementById('routePlannerPanel'); if(route) { route.hidden=true; route.style.display='none'; }
    const guide = document.getElementById('routePlannerGuideV70'); if(guide) { guide.hidden=true; guide.style.display='none'; }
    const oldList = document.getElementById('orderList'); if(oldList) oldList.classList.add('phx-v120-original-hidden');
    const autoBtn = document.getElementById('autoDispatchBtn'); if(autoBtn) autoBtn.style.display = 'none';
    const h = document.getElementById('primaryDashboardHeading'); if(h) h.textContent = 'Orders Dispatch Calendar';
    return board;
  }
  function renderBoard(reason=''){
    if(observerLock) return;
    const modal = document.getElementById('dashboardModal');
    const active = document.querySelector('[data-dashboard-page="orders"].active');
    if(!modal?.open || !active || !roleAllowed()) return;
    const orders = getOrders();
    const months = monthOptions(orders);
    const sig = JSON.stringify({orders:orders.map(o=>[o.id,orderDateKey(o),o.eventTime,o.status,o.assignedChef,o.admin_notes]).slice(0,200), state});
    const board = buildBoard();
    if(!board) return;
    // Prevent redraw loops: MutationObserver can fire when this board updates itself.
    // Only re-render when the actual order/date/week/month signature changed, unless board is empty.
    if(sig === lastRenderedSig && board.innerHTML.trim() && !['force','month','week','week-wheel','weekday','date','slot','move','time-order','order-update'].includes(reason)){
      return;
    }
    const rows = filteredOrders(orders);
    const dateRows = state.dateKey ? orders.filter(o => orderDateKey(o) === state.dateKey) : [];
    const monthRows = selectedMonthOrders(orders);
    observerLock = true;
    board.innerHTML = `
      <div class="phx-v120-head">
        <div><p class="eyebrow">Phoenix Admin Blessing</p><h3 class="phx-feng-sheng-title">风生水起</h3><p class="small-muted">Golden dispatch board for a growing Phoenix Hibachi business. Choose a month, week, and weekday to review orders and routes.</p></div>
        <label>Month wheel<select data-v120-month>${months.map(k=>`<option value="${esc(k)}" ${k===state.monthKey?'selected':''}>${esc(monthTitle(k))}</option>`).join('')}</select></label>
      </div>
      ${monthStatsHtml(monthRows)}
      <div class="phx-v120-layout phx-v121-calendar-layout">
        <div class="phx-v120-main">
          ${renderCalendar(monthRows)}
          ${renderWeekdayTabs(orders)}
        </div>
        ${renderSlots()}
      </div>
      ${state.dateKey && dateRows.length ? routeMap(dateRows) : '<div class="phx-v120-info"><b>Route map appears when you click a Monday–Sunday day card with orders.</b><span>Click the calendar grid only to manage that date&rsquo;s booking availability.</span></div>'}
      ${revenueAnalyticsHtml(rows)}
      <section class="phx-v120-order-results"><header><h4>${state.dateKey ? `${dayTitle(state.dateKey)} orders` : state.weekKey ? (state.weekdayFilter==='' ? 'Selected week orders' : 'Selected weekday orders') : `${monthTitle(state.monthKey)} orders`}</h4><span>${rows.length} order${rows.length!==1?'s':''}</span></header><div class="calendar-order-list phx-v120-order-list">${rows.length ? rows.map(orderHtml).join('') : '<div class="empty-state">No orders found for this selection.</div>'}</div></section>
    `;
    observerLock = false;
    lastRenderedSig = sig;
  }
  function scheduleRender(reason=''){
    clearTimeout(renderTimer);
    renderTimer = setTimeout(()=>renderBoard(reason), 80);
  }

  function nowLabel(){ return new Date().toLocaleString('en-US', {year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}); }
  function uiDateFromInput(value){
    const d = parseDate(value);
    return d ? d.toLocaleDateString('en-US',{year:'numeric', month:'long', day:'numeric'}) : String(value || '');
  }
  function idOf(order){ return String(order?.id || order?.booking_number || order?.bookingNumber || ''); }
  function findOrderById(orderId){ return getOrders().find(o => idOf(o) === String(orderId)); }
  function localOrders(){ try { return JSON.parse(localStorage.getItem('phoenixHibachiOrdersV12') || '[]'); } catch { return []; } }
  function saveLocalOrders(rows){ try { localStorage.setItem('phoenixHibachiOrdersV12', JSON.stringify(rows || [])); } catch {} }
  function patchLocalOrder(orderId, patch){
    const rows = localOrders();
    if(!rows.length) return;
    let changed = false;
    const next = rows.map(o => {
      if(idOf(o) === String(orderId)){ changed = true; return {...o, ...patch}; }
      return o;
    });
    if(changed) saveLocalOrders(next);
  }
  function readNoteLine(notes, label){
    const prefix = String(label || '').toLowerCase() + ':';
    const row = String(notes || '').split(/\n/).find(line => line.trim().toLowerCase().startsWith(prefix));
    return row ? row.split(':').slice(1).join(':').trim() : '';
  }
  function upsertNoteLine(notes, label, value){
    const lines = String(notes || '').split(/\n/).filter(Boolean);
    const prefix = String(label || '').toLowerCase() + ':';
    let found = false;
    const next = lines.map(line => {
      if(line.trim().toLowerCase().startsWith(prefix)){ found = true; return `${label}: ${value}`; }
      return line;
    });
    if(!found) next.push(`${label}: ${value}`);
    return next.join('\n');
  }
  async function updateOrderV120(orderId, dbPatch = {}, localPatch = {}){
    patchLocalOrder(orderId, localPatch);
    let remoteOk = false;
    try {
      const client = window.initSupabaseClient ? window.initSupabaseClient() : (typeof initSupabaseClient === 'function' ? initSupabaseClient() : null);
      const session = window.supabaseSession || (typeof supabaseSession !== 'undefined' ? supabaseSession : null);
      if(client && session && Object.keys(dbPatch).length){
        const { error } = await client.from('bookings').update(dbPatch).eq('booking_number', orderId);
        if(error) console.warn('V120 order update failed:', error.message || error);
        else remoteOk = true;
      }
      if(remoteOk && typeof loadDashboardDataFromSupabase === 'function') await loadDashboardDataFromSupabase();
    } catch(error){ console.warn('V120 update threw:', error); }
    try { if(typeof renderDashboard === 'function') renderDashboard(window.currentDashboardRole || (typeof currentDashboardRole !== 'undefined' ? currentDashboardRole : 'Admin')); } catch {}
    setTimeout(()=>scheduleRender('order-update'), 180);
    return remoteOk;
  }
  function toggleV120Panel(orderId, panelName){
    const card = document.querySelector(`[data-v120-order-card="${CSS.escape(String(orderId))}"]`);
    if(!card) return;
    const detail = card.querySelector(`[data-v120-panel="${CSS.escape(String(orderId))}"]`);
    const pay = card.querySelector(`[data-v120-payment-panel="${CSS.escape(String(orderId))}"]`);
    if(panelName === 'details' || panelName === 'time' || panelName === 'chef'){
      if(detail) detail.hidden = !detail.hidden;
      if(pay) pay.hidden = true;
      if(!detail?.hidden){
        if(panelName === 'time') detail.querySelector('[data-v120-date-input]')?.focus?.();
        if(panelName === 'chef') detail.querySelector('[data-v120-chef-input]')?.focus?.();
      }
    }
    if(panelName === 'payment'){
      if(pay) pay.hidden = !pay.hidden;
      if(detail) detail.hidden = true;
    }
    (detail && !detail.hidden ? detail : pay && !pay.hidden ? pay : card).scrollIntoView({behavior:'smooth', block:'nearest'});
  }
  async function confirmOrderV120(orderId){
    const order = findOrderById(orderId);
    if(!order) return alert('Order not found.');
    let notes = notesOf(order);
    notes = upsertNoteLine(notes, 'Confirmed at', nowLabel());
    notes = upsertNoteLine(notes, 'Customer visible note', 'Your booking request has been confirmed by Phoenix Hibachi.');
    const ok = await updateOrderV120(orderId, {status:'Confirmed', admin_notes:notes}, {status:'Confirmed', specialNotes:notes, admin_notes:notes});
    alert(ok ? 'Order confirmed.' : 'Order updated locally. Supabase did not confirm yet; check Admin permission/RLS.');
  }
  async function saveTimeV120(orderId){
    const card = document.querySelector(`[data-v120-order-card="${CSS.escape(String(orderId))}"]`);
    const dateValue = card?.querySelector(`[data-v120-date-input="${CSS.escape(String(orderId))}"]`)?.value || '';
    const timeValue = card?.querySelector(`[data-v120-time-input="${CSS.escape(String(orderId))}"]`)?.value || '';
    const order = findOrderById(orderId);
    if(!order) return alert('Order not found.');
    if(!dateValue || !timeValue) return alert('Choose a valid date and party start time.');
    let notes = notesOf(order);
    notes = upsertNoteLine(notes, 'Modified at', nowLabel());
    notes = upsertNoteLine(notes, 'Party start time', `${uiDateFromInput(dateValue)} · ${timeValue}`);
    notes = upsertNoteLine(notes, 'Customer visible note', `Phoenix Hibachi updated your party start time to ${uiDateFromInput(dateValue)} · ${timeValue}.`);
    const dbTime = (typeof parseEventTimeForDb === 'function') ? parseEventTimeForDb(timeValue) : timeValue;
    const status = String(order.status || '').toLowerCase().includes('confirm') ? 'Confirmed - exact time updated' : 'Time updated';
    const ok = await updateOrderV120(orderId, {event_date:dateValue, event_time:dbTime, status, admin_notes:notes}, {eventDate:uiDateFromInput(dateValue), event_date:dateValue, eventTime:timeValue, event_time:timeValue, status, specialNotes:notes, admin_notes:notes});
    alert(ok ? 'Party start time saved.' : 'Updated locally. Supabase did not confirm yet.');
  }
  async function saveChefV120(orderId){
    const card = document.querySelector(`[data-v120-order-card="${CSS.escape(String(orderId))}"]`);
    const chefId = card?.querySelector(`[data-v120-chef-input="${CSS.escape(String(orderId))}"]`)?.value || '';
    const chef = chefList().find(c => String(c.id || c.name || '') === String(chefId));
    const order = findOrderById(orderId);
    if(!order) return alert('Order not found.');
    let notes = notesOf(order);
    notes = upsertNoteLine(notes, 'Assigned chef id', chef?.id || chefId || '');
    notes = upsertNoteLine(notes, 'Assigned chef name', chef?.name || chefId || '');
    notes = upsertNoteLine(notes, 'Assigned chef phone', chef?.phone || '');
    notes = upsertNoteLine(notes, 'Customer visible note', chef ? `Your assigned chef is ${chef.name}.` : 'Chef assignment is pending manager confirmation.');
    const status = chef ? (String(order.status || '').toLowerCase().includes('confirm') ? 'Confirmed - chef assigned' : 'Chef assigned') : 'Pending chef assignment';
    const ok = await updateOrderV120(orderId, {status, admin_notes:notes}, {status, assignedChef:chef?.name || 'Unassigned', assignedChefId:chef?.id || chefId || '', specialNotes:notes, admin_notes:notes});
    alert(ok ? 'Chef assignment saved.' : 'Saved locally. Supabase did not confirm yet.');
  }
  function paymentNumber(card, selector, fallback=0){ return Number(card?.querySelector(selector)?.value || fallback || 0); }
  async function savePaymentV120(orderId, quick=false){
    const card = document.querySelector(`[data-v120-order-card="${CSS.escape(String(orderId))}"]`);
    const order = findOrderById(orderId);
    if(!order) return alert('Order not found.');
    if(quick){
      const inp = card?.querySelector(`[data-v120-payment-received="${CSS.escape(String(orderId))}"]`);
      if(inp) inp.value = '200.00';
      const status = card?.querySelector(`[data-v120-payment-status="${CSS.escape(String(orderId))}"]`);
      if(status) status.value = 'deposit received';
    }
    const status = card?.querySelector(`[data-v120-payment-status="${CSS.escape(String(orderId))}"]`)?.value || 'unpaid';
    const method = card?.querySelector(`[data-v120-payment-method="${CSS.escape(String(orderId))}"]`)?.value || '';
    const received = paymentNumber(card, `[data-v120-payment-received="${CSS.escape(String(orderId))}"]`);
    const discount = paymentNumber(card, `[data-v120-discount="${CSS.escape(String(orderId))}"]`);
    const finalTotal = card?.querySelector(`[data-v120-final-total="${CSS.escape(String(orderId))}"]`)?.value || '';
    const travel = paymentNumber(card, `[data-v120-travel-fee="${CSS.escape(String(orderId))}"]`, order.travelFee || order.travel_fee || 0);
    const waived = !!card?.querySelector(`[data-v120-waive-travel="${CSS.escape(String(orderId))}"]`)?.checked;
    const reason = card?.querySelector(`[data-v120-reason="${CSS.escape(String(orderId))}"]`)?.value || '';
    const customerNote = card?.querySelector(`[data-v120-customer-note="${CSS.escape(String(orderId))}"]`)?.value || '';
    let notes = notesOf(order);
    notes = upsertNoteLine(notes, 'Payment status note', status);
    notes = upsertNoteLine(notes, 'Payment method', method);
    notes = upsertNoteLine(notes, 'Payment received', received.toFixed(2));
    notes = upsertNoteLine(notes, 'Manager discount', discount.toFixed(2));
    notes = upsertNoteLine(notes, 'Final total override', finalTotal);
    notes = upsertNoteLine(notes, 'Travel fee waived', waived ? 'yes' : 'no');
    notes = upsertNoteLine(notes, 'Adjustment reason', reason);
    notes = upsertNoteLine(notes, 'Customer payment note', customerNote);
    const ok = await updateOrderV120(orderId, {payment_status:status, deposit_amount:received, travel_fee: waived ? 0 : travel, admin_notes:notes}, {paymentStatus:status, payment_status:status, depositPaid:received, deposit_amount:received, travelFee:waived ? 0 : travel, travel_fee:waived ? 0 : travel, specialNotes:notes, admin_notes:notes});
    alert(ok ? 'Payment / price saved.' : 'Saved locally. Supabase did not confirm yet.');
  }
  function printOrderV120(orderId){
    const order = findOrderById(orderId);
    if(!order) return alert('Order not found.');
    try {
      if(typeof openPrintModalForOrder === 'function') return openPrintModalForOrder(order, 'guest');
      if(typeof window.openPrintModalForOrder === 'function') return window.openPrintModalForOrder(order, 'guest');
    } catch(error){ console.warn(error); }
    window.print();
  }

  document.addEventListener('click', function(e){
    const actionBtn = e.target.closest('[data-v120-action], [data-v120-save-time], [data-v120-save-chef], [data-v120-save-payment], [data-v120-mark-deposit]');
    if(actionBtn){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      const orderId = actionBtn.dataset.v120OrderId || actionBtn.dataset.v120SaveTime || actionBtn.dataset.v120SaveChef || actionBtn.dataset.v120SavePayment || actionBtn.dataset.v120MarkDeposit;
      const action = actionBtn.dataset.v120Action;
      if(action === 'details') toggleV120Panel(orderId, 'details');
      else if(action === 'time') toggleV120Panel(orderId, 'time');
      else if(action === 'chef') toggleV120Panel(orderId, 'chef');
      else if(action === 'payment') toggleV120Panel(orderId, 'payment');
      else if(action === 'print') printOrderV120(orderId);
      else if(action === 'confirm') { actionBtn.disabled = true; confirmOrderV120(orderId).finally(()=>actionBtn.disabled=false); }
      else if(actionBtn.dataset.v120SaveTime) { actionBtn.disabled = true; saveTimeV120(orderId).finally(()=>actionBtn.disabled=false); }
      else if(actionBtn.dataset.v120SaveChef) { actionBtn.disabled = true; saveChefV120(orderId).finally(()=>actionBtn.disabled=false); }
      else if(actionBtn.dataset.v120SavePayment) { actionBtn.disabled = true; savePaymentV120(orderId, false).finally(()=>actionBtn.disabled=false); }
      else if(actionBtn.dataset.v120MarkDeposit) savePaymentV120(orderId, true);
      return false;
    }
    const dateBtn = e.target.closest('[data-v120-date]');
    if(dateBtn){ const key = dateBtn.dataset.v120Date || ''; state.availabilityDateKey = key; state.dateKey = ''; state.weekKey = weekKeyForDate(parseDate(key)); state.weekdayFilter=''; scheduleRender('availability-date'); return; }
    const weekBtn = e.target.closest('[data-v120-week]');
    if(weekBtn){ state.weekKey = weekBtn.dataset.v120Week || ''; state.dateKey = ''; state.weekdayFilter=''; scheduleRender('week'); return; }
    const weekdayBtn = e.target.closest('[data-v121-weekday]');
    if(weekdayBtn){
      ensureWeekKey(getOrders());
      const v = weekdayBtn.dataset.v121Weekday;
      const dayKey = weekdayBtn.dataset.v121WeekdayDate || '';
      state.weekdayFilter = v === 'week' ? '' : String(v);
      state.dateKey = dayKey;
      state.availabilityDateKey = dayKey;
      scheduleRender('weekday-route'); return;
    }
    if(e.target.closest('[data-v121-build-route]')){ scheduleRender('build-route'); return; }
    const slotBtn = e.target.closest('[data-v120-slot]');
    if(slotBtn && (state.availabilityDateKey || state.dateKey)){
      const selectedSlotDate = state.availabilityDateKey || state.dateKey;
      const key = slotKey(selectedSlotDate, slotBtn.dataset.v120Slot);
      const current = getSlotStatus(selectedSlotDate, slotBtn.dataset.v120Slot);
      const next = current === 'Available' ? 'Full' : current === 'Full' ? 'Closed' : 'Available';
      localStorage.setItem(key, next);
      try { window.PHX_REFRESH_PUBLIC_BOOKING_CALENDARS && window.PHX_REFRESH_PUBLIC_BOOKING_CALENDARS(); } catch {}
      scheduleRender('slot'); return;
    }
    const move = e.target.closest('[data-v120-move]');
    if(move && state.dateKey){
      const dateOrders = getOrders().filter(o => orderDateKey(o) === state.dateKey);
      const current = sortBySeq(state.dateKey, dateOrders).map(o=>String(o.id));
      const id = String(move.dataset.v120Id || '');
      const idx = current.indexOf(id);
      if(idx < 0) return;
      const dir = move.dataset.v120Move === 'up' ? -1 : 1;
      const ni = idx + dir;
      if(ni < 0 || ni >= current.length) return;
      const next = current.slice();
      [next[idx], next[ni]] = [next[ni], next[idx]];
      const nextOrders = next.map(id => dateOrders.find(o=>String(o.id)===id)).filter(Boolean);
      if(hasTimeConflict(nextOrders)){
        const ok = confirm('This manual route order may conflict with party start times. Continue anyway?\n这个手动路线可能和派对开始时间冲突，是否仍然继续？');
        if(!ok) return;
      }
      setSeq(state.dateKey, next);
      scheduleRender('move'); return;
    }
    if(e.target.closest('[data-v120-reset-time]') && state.dateKey){
      localStorage.removeItem(sequenceKey(state.dateKey)); scheduleRender('time-order'); return;
    }
    if(e.target.closest('[data-portal-logout]') || e.target.closest('[data-account-action="logout"]')){
      setTimeout(forceLogoutClean, 150);
    }
  }, true);

  document.addEventListener('change', function(e){
    const monthSel = e.target.closest('[data-v120-month]');
    if(monthSel){ state.monthKey = monthSel.value; state.weekKey=''; state.dateKey=''; state.weekdayFilter=''; scheduleRender('month'); return; }
    const weekWheel = e.target.closest('[data-v121-week-wheel]');
    if(weekWheel){ state.weekKey = weekWheel.value; state.dateKey=''; state.weekdayFilter=''; scheduleRender('week-wheel'); return; }
  }, true);

  function forceLogoutClean(){
    try { window.supabaseClient?.auth?.signOut?.(); } catch {}
    try { window.supabase?.auth?.signOut?.(); } catch {}
    try {
      Object.keys(localStorage).forEach(k=>{
        if(/phoenix_portal|portal_session|portal_role|portal_email|supabase\.auth|sb-.*auth-token/i.test(k)) localStorage.removeItem(k);
      });
      Object.keys(sessionStorage).forEach(k=>{
        if(/phoenix_portal|portal_session|portal_role|portal_email|supabase\.auth|sb-.*auth-token/i.test(k)) sessionStorage.removeItem(k);
      });
    } catch {}
    const account = document.getElementById('portalAccount'); if(account) account.hidden = true;
    document.querySelectorAll('.login-entry,.mobile-login-entry').forEach(el => { el.hidden=false; el.style.display=''; });
    document.body.classList.remove('portal-mode');
  }

  // 30-minute inactivity logout for authenticated portal roles.
  let idleTimer = null;
  function resetIdle(){
    clearTimeout(idleTimer);
    const dashboardOpen = document.getElementById('dashboardModal')?.open;
    const role = window.currentDashboardRole || localStorage.getItem('phoenix_portal_role');
    if(dashboardOpen && role){
      idleTimer = setTimeout(()=>{
        alert('For security, you were logged out after 30 minutes of inactivity.\n为了安全，系统已因 30 分钟未操作自动退出。');
        forceLogoutClean();
        try { document.getElementById('dashboardModal')?.close(); } catch {}
      }, 30*60*1000);
    }
  }
  ['click','keydown','mousemove','scroll','touchstart'].forEach(ev => document.addEventListener(ev, resetIdle, {passive:true}));

  // Clean modal scrolling without touching content logic.
  function updateModalOpenClass(){
    const anyOpen = !!document.querySelector('dialog[open]');
    document.body.classList.toggle('phx-v120-modal-open', anyOpen);
  }
  const modalObserver = new MutationObserver(updateModalOpenClass);
  modalObserver.observe(document.body, {subtree:true, attributes:true, attributeFilter:['open']});
  updateModalOpenClass();

  // Keep board alive after old dashboard re-renders.
  const rootObserver = new MutationObserver((mutations)=>{
    // Do not react to our own board repaint; that created a redraw loop and made Week buttons appear frozen.
    const ownBoard = document.getElementById('phxV120OrdersBoard');
    if(ownBoard && mutations.every(m => ownBoard.contains(m.target))) return;
    const modal = document.getElementById('dashboardModal');
    const active = document.querySelector('[data-dashboard-page="orders"].active');
    if(modal?.open && active && roleAllowed() && !document.getElementById('phxV120OrdersBoard')) scheduleRender('mutation');
  });
  rootObserver.observe(document.body, {childList:true, subtree:true});

  // Also run after dashboard tabs / renders.
  document.addEventListener('DOMContentLoaded', ()=>scheduleRender('dom'));
  window.addEventListener('load', ()=>scheduleRender('load'));
  setInterval(()=>{
    const modal = document.getElementById('dashboardModal');
    const active = document.querySelector('[data-dashboard-page="orders"].active');
    if(modal?.open && active && roleAllowed() && !document.getElementById('phxV120OrdersBoard')) scheduleRender('interval');
  }, 1000);
})();

/* =============================================================
   PHX V123 — Admin availability sync to public booking calendar
   - When Admin marks a selected date/slot Full or Closed in Orders,
     the public homepage booking calendar and booking slot list update too.
   - Uses the existing local V120 dispatch slot storage for now.
   - Production Supabase sync can later replace these localStorage reads.
   ============================================================= */
(function PHXV123AvailabilitySync(){
  if (window.__PHX_V123_AVAILABILITY_SYNC__) return;
  window.__PHX_V123_AVAILABILITY_SYNC__ = true;

  const STORE_PREFIX_V123 = 'phx_v120_dispatch_';
  const SLOT_LABELS_V123 = ['11:00 AM - 1:00 PM','2:00 PM - 4:00 PM','4:00 PM - 6:00 PM','7:00 PM - 9:00 PM'];

  function padV123(n){ return String(n).padStart(2, '0'); }
  function parseDateV123(value){
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = String(value || '').trim();
    let m = raw.match(/^(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(raw.replace(/上午|下午/g, ''));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function keyFromDateV123(value){
    const d = parseDateV123(value);
    if (!d) return '';
    return `${d.getFullYear()}-${padV123(d.getMonth()+1)}-${padV123(d.getDate())}`;
  }
  function canonicalSlotV123(slot){
    const raw = String(slot || '').toLowerCase();
    if(raw.includes('11')) return '11:00 AM - 1:00 PM';
    if(raw.match(/\b2(:00)?\b/) || raw.includes('2:00 pm')) return '2:00 PM - 4:00 PM';
    if(raw.match(/\b4(:00)?\b/) || raw.includes('4:00 pm')) return '4:00 PM - 6:00 PM';
    if(raw.match(/\b6(:00)?\b/) || raw.match(/\b7(:00)?\b/) || raw.match(/\b8(:00)?\b/) || raw.includes('dinner')) return '7:00 PM - 9:00 PM';
    return String(slot || '').trim();
  }
  function legacySlotLabelsV123(slot){
    const c = canonicalSlotV123(slot);
    if(c === '11:00 AM - 1:00 PM') return ['11:00 AM - 1:00 PM','11:00 AM'];
    if(c === '2:00 PM - 4:00 PM') return ['2:00 PM - 4:00 PM','2:00 PM'];
    if(c === '4:00 PM - 6:00 PM') return ['4:00 PM - 6:00 PM','4:00 PM'];
    if(c === '7:00 PM - 9:00 PM') return ['7:00 PM - 9:00 PM','7:00 PM','6:00 PM','8:00 PM'];
    return [c];
  }
  function slotKeyV123(dateKey, slot){ return `${STORE_PREFIX_V123}slot_${dateKey}_${canonicalSlotV123(slot)}`; }
  function slotStatusV123(dateKey, slot){
    for(const label of legacySlotLabelsV123(slot)){
      const value = localStorage.getItem(`${STORE_PREFIX_V123}slot_${dateKey}_${label}`);
      if(value) return value;
    }
    return 'Available';
  }
  function daySlotStateV123(dateKey){
    const statuses = SLOT_LABELS_V123.map(slot => slotStatusV123(dateKey, slot));
    const blocked = statuses.filter(v => v === 'Full' || v === 'Closed').length;
    return {
      statuses,
      blocked,
      anyBlocked: blocked > 0,
      allBlocked: blocked >= SLOT_LABELS_V123.length,
    };
  }

  window.PHX_GET_BOOKING_SLOT_STATE = function(dateKey){
    return daySlotStateV123(dateKey);
  };

  const oldGetStatus = (typeof getStatus === 'function') ? getStatus : window.getStatus;
  const oldGetSlotsForStatus = (typeof getSlotsForStatus === 'function') ? getSlotsForStatus : window.getSlotsForStatus;

  function syncedGetStatus(date){
    const base = oldGetStatus ? oldGetStatus(date) : 'open';
    if (['past','paused','off'].includes(String(base || '').toLowerCase())) return base;
    const key = keyFromDateV123(date);
    if (!key) return base;
    const slotState = daySlotStateV123(key);
    if (slotState.allBlocked) return 'full';
    if (slotState.anyBlocked) return 'limited';
    return base;
  }

  function syncedSlotsForSelectedDate(status){
    let key = '';
    try { key = selectedDateState ? keyFromDateV123(selectedDateState) : ''; } catch {}
    if (!key) return oldGetSlotsForStatus ? oldGetSlotsForStatus(status) : [];
    const slotState = daySlotStateV123(key);
    if (!slotState.anyBlocked) return oldGetSlotsForStatus ? oldGetSlotsForStatus(status) : [];
    return SLOT_LABELS_V123.map(slot => {
      const value = slotStatusV123(key, slot);
      if (value === 'Full') {
        return { time: slot, note: 'Marked full by Phoenix Hibachi', booked: 'Not accepting this time', status: 'Full', disabled: true };
      }
      if (value === 'Closed') {
        return { time: slot, note: 'Closed by Phoenix Hibachi', booked: 'Not accepting this time', status: 'Closed', disabled: true };
      }
      return { time: slot, note: 'Available booking window', booked: 'Available', status: 'Open' };
    });
  }

  try { window.getStatus = syncedGetStatus; getStatus = syncedGetStatus; } catch { window.getStatus = syncedGetStatus; }
  try { window.getSlotsForStatus = syncedSlotsForSelectedDate; getSlotsForStatus = syncedSlotsForSelectedDate; } catch { window.getSlotsForStatus = syncedSlotsForSelectedDate; }

  window.PHX_REFRESH_PUBLIC_BOOKING_CALENDARS = function(){
    try { selectedStatusState = syncedGetStatus(selectedDateState); } catch {}
    try { renderMainCalendar(); } catch {}
    try { renderMiniCalendar(); } catch {}
    try { renderSlots(); } catch {}
    try { updateSummary(); } catch {}
    try { updateBookingReadyState(); } catch {}
  };

  document.addEventListener('click', function(event){
    const slotBtn = event.target.closest?.('[data-v120-slot]');
    if (!slotBtn) return;
    setTimeout(() => {
      try { window.PHX_REFRESH_PUBLIC_BOOKING_CALENDARS(); } catch {}
      try { window.dispatchEvent(new CustomEvent('phoenix:availability-sync', { detail: { source: 'dispatch-board' } })); } catch {}
    }, 120);
  }, true);

  setTimeout(() => {
    try { window.PHX_REFRESH_PUBLIC_BOOKING_CALENDARS(); } catch {}
  }, 600);
})();
