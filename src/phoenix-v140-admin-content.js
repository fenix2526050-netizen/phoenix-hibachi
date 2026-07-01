/* Phoenix Hibachi V140: Admin pricing, recipes, stories, shop, and hero media controls.
   This layer is intentionally additive and does not replace the stable V139 booking/dashboard core. */
(function initPhoenixV140(){
  if (window.__PHX_V140_ADMIN_CONTENT__) return;
  window.__PHX_V140_ADMIN_CONTENT__ = true;

  const esc = (value='') => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const money = (value) => `$${Number(value || 0).toLocaleString(undefined,{maximumFractionDigits:2})}`;
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const cssEsc = (value) => (window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

  const KEYS = {
    recipes: 'phoenixRecipesV140',
    stories: 'phoenixStoriesV140',
    products: 'phoenixShopProductsV140',
    media: 'phoenixHeroMediaV140'
  };

  const defaultRecipes = [
    {id:'recipe-yum-yum', title:'Yum Yum Sauce for Hibachi Night', category:'Sauce', image:'assets/package-premium.webp', summary:'A creamy, sweet, tangy sauce inspired by backyard hibachi parties.', body:'Mix mayonnaise, ketchup, melted butter, garlic powder, paprika, sugar, and rice vinegar. Rest cold for 30 minutes before serving.', published:true},
    {id:'recipe-teriyaki', title:'Glossy Teriyaki Sauce', category:'Sauce', image:'assets/media-fire-show.webp', summary:'Sweet, savory, glossy teriyaki for chicken, steak, salmon, or fried rice.', body:'Simmer soy sauce, mirin, sugar, garlic, ginger, and a little cornstarch slurry until glossy.', published:true},
    {id:'recipe-steak', title:'Steak Doneness Guide', category:'Technique', image:'assets/package-signature.webp', summary:'Rare, medium rare, medium, and well-done explained in plain English.', body:'Let steak rest before cooking, sear hot, and slice after resting. Guests should tell the chef their doneness preference before the show starts.', published:true}
  ];
  const defaultStories = [
    {id:'story-behind-fire', title:'Behind the Fire', category:'Chef Story', image:'assets/media-knife-rhythm.webp', summary:'The clean two-hour show starts long before the chef arrives.', body:'Knife rhythm, timing, clean prep, packing, and route planning are all part of the private hibachi experience.', published:true},
    {id:'story-prep', title:'Why Prep Work Matters', category:'Operations', image:'assets/visual-hero-live-show.webp', summary:'Every onion volcano depends on quiet prep work.', body:'A smooth party depends on packed sauces, proteins, vegetables, rice, equipment, timing, and rain backup before the chef leaves.', published:true},
    {id:'story-rain', title:'Rain Day Party Planning', category:'Party Tips', image:'assets/occasion-backyard.webp', summary:'A safe covered cooking area keeps the party moving.', body:'Weather changes fast. Customers should prepare a safe covered area or contact Customer Service for route and reschedule review.', published:true}
  ];
  const defaultProducts = [
    {id:'shop-gift-card', title:'Phoenix Hibachi Gift Card', price:100, image:'assets/phoenix-logo-transparent.png', link:'#calendar', status:'Available', summary:'A flexible gift toward a future private hibachi party.', published:true},
    {id:'shop-sauce-kit', title:'Sauce Bottle / Party Kit', price:18, image:'assets/addon-edamame.webp', link:'#shop', status:'Coming soon', summary:'Feature sauces, bottles, or party tools here when your ecommerce link is ready.', published:true},
    {id:'shop-shirt', title:'Phoenix Hibachi Merch', price:25, image:'assets/phoenix-logo-transparent.png', link:'#shop', status:'Coming soon', summary:'T-shirts, hats, aprons, and chef-themed merchandise.', published:true}
  ];
  const defaultMedia = {
    title:'Hibachi Live Show',
    subtitle:'Fire · Food · Performance',
    items:[
      {id:'hero-1', src:'assets/hero-live-show-video.mp4', poster:'assets/hero-live-show-poster.webp', enabled:true},
      {id:'hero-2', src:'', poster:'assets/hero-live-show-poster.webp', enabled:false},
      {id:'hero-3', src:'', poster:'assets/hero-live-show-poster.webp', enabled:false}
    ]
  };

  function getRecipes(){ return read(KEYS.recipes, defaultRecipes); }
  function getStories(){ return read(KEYS.stories, defaultStories); }
  function getProducts(){ return read(KEYS.products, defaultProducts); }
  function getMedia(){
    const saved = read(KEYS.media, defaultMedia);
    return {...defaultMedia, ...saved, items: [0,1,2].map(i => ({...defaultMedia.items[i], ...(saved.items?.[i] || {})}))};
  }

  function cardMarkup(item, type){
    const body = type === 'product'
      ? `<p>${esc(item.summary || '')}</p><div class="shop-price-row"><strong>${money(item.price)}</strong><span>${esc(item.status || 'Available')}</span></div><a class="outline-btn block" href="${esc(item.link || '#shop')}" target="${String(item.link||'').startsWith('http')?'_blank':'_self'}" rel="noreferrer">View Product</a>`
      : `<small>${esc(item.category || '')}</small><h3>${esc(item.title)}</h3><p>${esc(item.summary || '')}</p><details><summary>Read more</summary><p>${esc(item.body || '')}</p></details>`;
    return `<article class="v140-content-card"><img src="${esc(item.image || 'assets/phoenix-logo-transparent.png')}" alt="${esc(item.title || 'Phoenix Hibachi content')}"><div>${type === 'product' ? `<h3>${esc(item.title)}</h3>` : ''}${body}</div></article>`;
  }

  function renderPublicContent(){
    const recipesGrid = document.getElementById('recipesGrid');
    const storiesGrid = document.getElementById('storiesGrid');
    const productsGrid = document.getElementById('shopProductsGrid');
    if (recipesGrid) recipesGrid.innerHTML = getRecipes().filter(x => x.published !== false).map(x => cardMarkup(x, 'post')).join('') || '<div class="empty-state">Recipes coming soon.</div>';
    if (storiesGrid) storiesGrid.innerHTML = getStories().filter(x => x.published !== false).map(x => cardMarkup(x, 'post')).join('') || '<div class="empty-state">Stories coming soon.</div>';
    if (productsGrid) productsGrid.innerHTML = getProducts().filter(x => x.published !== false).map(x => cardMarkup(x, 'product')).join('') || '<div class="empty-state">Shop products coming soon.</div>';
  }

  function pricing(){
    if (typeof window.PHX_GET_PRICING_V140 === 'function') return window.PHX_GET_PRICING_V140();
    return {packages:{Classic:55, Premium:65, Signature:110}, addons:{'Sushi Roll Tray':85,'Premium Sushi Tray':130,'Sushi & Sashimi Combo':160,'Extra Gyoza Tray':45,'Extra Edamame Tray':35,'Noodle / Yakisoba Tray':50}, proteinUpcharge:5, moneyRules:{depositRequired:200, minimumBillableGuests:10, chefAdultRate:15, chefKidRate:7.5, chefMinimumPayout:150, firstPartyCoupon:50, birthdayCoupon:50, socialCoupon:50, couponMinimumParty:600, defaultTravelFee:50, estimatedFoodCostRate:35, salesTaxRate:8.875}};
  }

  function applyPricingToDom(){
    const p = pricing();
    Object.entries(p.packages || {}).forEach(([name, price]) => {
      document.querySelectorAll(`.package-${name.toLowerCase()} .price`).forEach(el => el.innerHTML = `${money(price)} <span>/ person</span>`);
      document.querySelectorAll(`[data-package-card="${cssEsc(name)}"] strong`).forEach(el => el.innerHTML = `${money(price)} <span>/ person</span>`);
    });
    Object.entries(p.addons || {}).forEach(([name, price]) => {
      document.querySelectorAll(`input[name="addons"][value="${cssEsc(name)}"]`).forEach(input => {
        input.dataset.price = String(price);
        const label = input.closest('label');
        const b = label?.querySelector('b:last-child');
        if (b) b.textContent = `+${money(price)}`;
      });
    });
    document.querySelectorAll('.premium-protein span').forEach(span => span.textContent = `Premium +${money(p.proteinUpcharge || 0)} per portion`);
    const help = document.getElementById('proteinHelpText');
    if (help) help.textContent = `Classic for 10 billable guests includes 20 protein portions. Premium proteins add ${money(p.proteinUpcharge || 0)} per selected portion.`;
    const footerPackage = [...document.querySelectorAll('footer h4')].find(h => h.textContent.trim() === 'Packages')?.nextElementSibling;
    if (footerPackage) footerPackage.innerHTML = `Classic — ${money(p.packages.Classic)} / person<br>Premium — ${money(p.packages.Premium)} / person<br>Signature — ${money(p.packages.Signature)} / person`;
  }

  function applyHeroMedia(){
    const media = getMedia();
    const video = document.querySelector('.hero-live-video');
    if (!video) return;
    const items = media.items.filter(x => x.enabled !== false && x.src);
    if (!items.length) return;
    let index = Number(video.dataset.v140Index || 0);
    if (index >= items.length) index = 0;
    const item = items[index];
    const source = video.querySelector('source') || document.createElement('source');
    source.src = item.src;
    source.type = item.src.endsWith('.webm') ? 'video/webm' : 'video/mp4';
    if (!source.parentNode) video.appendChild(source);
    if (item.poster) video.poster = item.poster;
    const note = document.querySelector('.hero-photo-card .card-note');
    if (note) note.innerHTML = `<strong>${esc(media.title || 'Hibachi Live Show')}</strong><span>${esc(media.subtitle || 'Fire · Food · Performance')}</span>`;
    try { video.load(); video.play?.().catch(()=>{}); } catch {}
    let controls = document.querySelector('.hero-media-controls-v140');
    if (!controls && items.length > 1) {
      controls = document.createElement('div');
      controls.className = 'hero-media-controls-v140';
      document.querySelector('.hero-photo-card')?.appendChild(controls);
    }
    if (controls) {
      controls.innerHTML = items.map((_, i) => `<button type="button" class="${i===index?'active':''}" data-v140-hero-index="${i}" aria-label="Hero video ${i+1}"></button>`).join('');
    }
  }

  document.addEventListener('click', event => {
    const hero = event.target.closest?.('[data-v140-hero-index]');
    if (hero) {
      const video = document.querySelector('.hero-live-video');
      if (video) video.dataset.v140Index = hero.dataset.v140HeroIndex;
      applyHeroMedia();
    }
  });

  function getDashboardRole(){
    const title = document.getElementById('dashboardTitle')?.textContent || '';
    if (/Admin/i.test(title)) return 'Admin';
    if (/Manager/i.test(title)) return 'Manager';
    if (/Customer Service/i.test(title)) return 'Customer Service';
    if (/Chef/i.test(title)) return 'Chef';
    if (/Member/i.test(title)) return 'Member';
    return '';
  }

  function ensureAdminTabs(){
    const tabs = document.querySelector('.dashboard-tabs');
    const pages = document.querySelector('.dashboard-pages');
    if (!tabs || !pages) return;
    const role = getDashboardRole();
    const allowed = /Admin|Manager/i.test(role);
    const tabDefs = [
      ['pricing','Pricing / Menu Settings'],
      ['recipes','Recipes Manager'],
      ['stories','Stories Manager'],
      ['shop','Shop Products'],
      ['media','Hero Videos']
    ];
    tabDefs.forEach(([key,label]) => {
      let btn = tabs.querySelector(`[data-v140-admin-tab="${key}"]`);
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.v140AdminTab = key;
        btn.textContent = label;
        tabs.appendChild(btn);
      }
      btn.hidden = !allowed;
      btn.style.display = allowed ? '' : 'none';
    });
    let wrap = document.getElementById('v140AdminPages');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'v140AdminPages';
      wrap.className = 'v140-admin-pages';
      pages.appendChild(wrap);
    }
    if (!wrap.dataset.ready) {
      wrap.dataset.ready = '1';
      wrap.innerHTML = `
        <section class="v140-admin-page" data-v140-page="pricing">${pricingPage()}</section>
        <section class="v140-admin-page" data-v140-page="recipes">${postManagerPage('recipes')}</section>
        <section class="v140-admin-page" data-v140-page="stories">${postManagerPage('stories')}</section>
        <section class="v140-admin-page" data-v140-page="shop">${shopManagerPage()}</section>
        <section class="v140-admin-page" data-v140-page="media">${mediaManagerPage()}</section>`;
      bindAdminForms();
    }
  }

  function showV140Page(key){
    document.querySelectorAll('[data-dashboard-tab]').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('[data-v140-admin-tab]').forEach(x => x.classList.toggle('active', x.dataset.v140AdminTab === key));
    document.querySelectorAll('[data-dashboard-page]').forEach(x => { x.classList.remove('active'); x.hidden = true; });
    document.querySelectorAll('[data-v140-page]').forEach(x => { const show = x.dataset.v140Page === key; x.classList.toggle('active', show); x.hidden = !show; });
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest?.('[data-v140-admin-tab]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    showV140Page(btn.dataset.v140AdminTab);
  }, true);

  document.addEventListener('click', event => {
    const old = event.target.closest?.('[data-dashboard-tab]');
    if (old) {
      document.querySelectorAll('[data-v140-admin-tab]').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('[data-v140-page]').forEach(x => { x.classList.remove('active'); x.hidden = true; });
    }
  }, true);

  function pricingPage(){
    const p = pricing();
    const pkg = p.packages || {}, addons = p.addons || {}, rules = p.moneyRules || {};
    const num = (name, value, label) => `<label>${label}<input type="number" step="0.01" data-price-field="${name}" value="${esc(value)}"></label>`;
    return `<div class="v140-admin-panel"><div class="section-row"><div><h3>Pricing / Menu Settings</h3><p class="small-muted">Change prices once. Homepage, booking calculation, invoice, payment panel, and revenue view will read the same pricing source in this browser. Supabase sync can make it global later.</p></div><button type="button" class="outline-btn" data-v140-reset-pricing>Reset defaults</button></div>
      <div class="v140-settings-grid">
        <article><h4>Package prices</h4>${num('packages.Classic', pkg.Classic, 'Classic')}${num('packages.Premium', pkg.Premium, 'Premium')}${num('packages.Signature', pkg.Signature, 'Signature')}${num('moneyRules.minimumBillableGuests', rules.minimumBillableGuests, 'Minimum billable guests')}</article>
        <article><h4>Add-ons</h4>${Object.entries(addons).map(([k,v]) => num(`addons.${k}`, v, k)).join('')}</article>
        <article><h4>Protein / Deposit / Coupons</h4>${num('proteinUpcharge', p.proteinUpcharge, 'Premium protein upcharge')}${num('moneyRules.depositRequired', rules.depositRequired, 'Deposit required')}${num('moneyRules.firstPartyCoupon', rules.firstPartyCoupon, 'First party coupon')}${num('moneyRules.birthdayCoupon', rules.birthdayCoupon, 'Birthday coupon')}${num('moneyRules.socialCoupon', rules.socialCoupon, 'Social share coupon')}${num('moneyRules.couponMinimumParty', rules.couponMinimumParty, 'Coupon minimum')}</article>
        <article><h4>Chef payout / business rules</h4>${num('moneyRules.chefAdultRate', rules.chefAdultRate, 'Chef adult payout')}${num('moneyRules.chefKidRate', rules.chefKidRate, 'Chef kid payout')}${num('moneyRules.chefMinimumPayout', rules.chefMinimumPayout, 'Chef minimum payout')}${num('moneyRules.defaultTravelFee', rules.defaultTravelFee || 50, 'Default travel fee')}${num('moneyRules.estimatedFoodCostRate', rules.estimatedFoodCostRate || 35, 'Estimated food cost %')}${num('moneyRules.salesTaxRate', rules.salesTaxRate || 8.875, 'Sales tax %')}</article>
      </div><div class="v140-admin-actions"><button type="button" class="gold-btn" data-v140-save-pricing>Save pricing</button><span class="small-muted" id="v140PricingStatus"></span></div></div>`;
  }

  function postManagerPage(kind){
    const title = kind === 'recipes' ? 'Recipes Manager' : 'Stories Manager';
    return `<div class="v140-admin-panel"><div class="section-row"><div><h3>${title}</h3><p class="small-muted">Publish searchable content without editing code. Use image paths like assets/package-classic.webp or a full image URL.</p></div><button type="button" class="outline-btn" data-v140-new-post="${kind}">New</button></div>
      <div class="v140-editor-grid"><form class="v140-post-form" data-v140-post-form="${kind}"><input type="hidden" name="id"><label>Title<input name="title" required></label><label>Category<input name="category"></label><label>Image path / URL<input name="image"></label><label>Summary<textarea name="summary" rows="2"></textarea></label><label>Body<textarea name="body" rows="5"></textarea></label><label class="checkline"><input type="checkbox" name="published" checked> Published</label><button type="submit" class="gold-btn">Save</button></form><div class="v140-list" data-v140-list="${kind}"></div></div></div>`;
  }

  function shopManagerPage(){
    return `<div class="v140-admin-panel"><div class="section-row"><div><h3>Shop Products</h3><p class="small-muted">Show merchandise, gift cards, sauces, party kits, or ecommerce links. Use external Buy Now links for Shopify/TikTok/Amazon until checkout is connected.</p></div><button type="button" class="outline-btn" data-v140-new-product>New</button></div>
      <div class="v140-editor-grid"><form class="v140-product-form"><input type="hidden" name="id"><label>Name<input name="title" required></label><label>Price<input name="price" type="number" step="0.01"></label><label>Image path / URL<input name="image"></label><label>Buy link<input name="link"></label><label>Status<input name="status" placeholder="Available / Coming soon"></label><label>Summary<textarea name="summary" rows="3"></textarea></label><label class="checkline"><input type="checkbox" name="published" checked> Published</label><button type="submit" class="gold-btn">Save product</button></form><div class="v140-list" data-v140-list="products"></div></div></div>`;
  }

  function mediaManagerPage(){
    const m = getMedia();
    return `<div class="v140-admin-panel"><div class="section-row"><div><h3>Hero Videos</h3><p class="small-muted">Set up to three homepage videos. Keep files compressed for mobile. Recommended: MP4/WebM under 5–12MB each.</p></div></div>
      <form class="v140-media-form"><div class="v140-settings-grid"><article><h4>Overlay text</h4><label>Title<input name="title" value="${esc(m.title)}"></label><label>Subtitle<input name="subtitle" value="${esc(m.subtitle)}"></label></article>${m.items.map((item,i)=>`<article><h4>Video ${i+1}</h4><label>Video src<input name="src${i}" value="${esc(item.src)}"></label><label>Poster<input name="poster${i}" value="${esc(item.poster)}"></label><label class="checkline"><input type="checkbox" name="enabled${i}" ${item.enabled!==false?'checked':''}> Enabled</label></article>`).join('')}</div><button class="gold-btn" type="submit">Save hero videos</button><span class="small-muted" id="v140MediaStatus"></span></form></div>`;
  }

  function collectPricingFromForm(){
    const merged = pricing();
    document.querySelectorAll('[data-price-field]').forEach(input => {
      const path = input.dataset.priceField.split('.');
      let obj = merged;
      while (path.length > 1) {
        const k = path.shift();
        obj[k] = obj[k] || {};
        obj = obj[k];
      }
      obj[path[0]] = Number(input.value || 0);
    });
    return merged;
  }

  function bindAdminForms(){
    renderAdminLists();
    const pages = document.getElementById('v140AdminPages');
    if (!pages || pages.dataset.bound) return;
    pages.dataset.bound = '1';
    pages.addEventListener('click', event => {
      const savePricing = event.target.closest('[data-v140-save-pricing]');
      if (savePricing) {
        const next = collectPricingFromForm();
        if (typeof window.PHX_SET_PRICING_V140 === 'function') window.PHX_SET_PRICING_V140(next);
        applyPricingToDom();
        const status = document.getElementById('v140PricingStatus');
        if (status) status.textContent = 'Saved. Booking totals now use updated pricing in this browser.';
      }
      if (event.target.closest('[data-v140-reset-pricing]')) {
        try { localStorage.removeItem('phoenixPricingSettingsV140'); location.reload(); } catch {}
      }
      const edit = event.target.closest('[data-v140-edit]');
      if (edit) editItem(edit.dataset.v140Edit, edit.dataset.v140Kind);
      const del = event.target.closest('[data-v140-delete]');
      if (del) deleteItem(del.dataset.v140Delete, del.dataset.v140Kind);
      const newPost = event.target.closest('[data-v140-new-post]');
      if (newPost) fillPostForm(newPost.dataset.v140NewPost, {});
      if (event.target.closest('[data-v140-new-product]')) fillProductForm({});
    });
    pages.addEventListener('submit', event => {
      const postForm = event.target.closest('[data-v140-post-form]');
      if (postForm) { event.preventDefault(); savePostForm(postForm.dataset.v140PostForm, postForm); }
      const productForm = event.target.closest('.v140-product-form');
      if (productForm) { event.preventDefault(); saveProductForm(productForm); }
      const mediaForm = event.target.closest('.v140-media-form');
      if (mediaForm) { event.preventDefault(); saveMediaForm(mediaForm); }
    });
  }

  function renderAdminLists(){
    const renderPosts = (kind, items) => {
      const target = document.querySelector(`[data-v140-list="${kind}"]`);
      if (!target) return;
      target.innerHTML = items.map(item => `<article class="v140-list-card"><b>${esc(item.title)}</b><small>${esc(item.category || '')} · ${item.published === false ? 'Draft' : 'Published'}</small><p>${esc(item.summary || '')}</p><div><button type="button" data-v140-edit="${esc(item.id)}" data-v140-kind="${kind}">Edit</button><button type="button" data-v140-delete="${esc(item.id)}" data-v140-kind="${kind}">Delete</button></div></article>`).join('') || '<div class="empty-state">No items yet.</div>';
    };
    renderPosts('recipes', getRecipes());
    renderPosts('stories', getStories());
    const productsTarget = document.querySelector('[data-v140-list="products"]');
    if (productsTarget) productsTarget.innerHTML = getProducts().map(item => `<article class="v140-list-card"><b>${esc(item.title)}</b><small>${money(item.price)} · ${esc(item.status || '')} · ${item.published === false ? 'Draft' : 'Published'}</small><p>${esc(item.summary || '')}</p><div><button type="button" data-v140-edit="${esc(item.id)}" data-v140-kind="products">Edit</button><button type="button" data-v140-delete="${esc(item.id)}" data-v140-kind="products">Delete</button></div></article>`).join('') || '<div class="empty-state">No products yet.</div>';
  }

  function getCollection(kind){ return kind === 'recipes' ? getRecipes() : kind === 'stories' ? getStories() : getProducts(); }
  function saveCollection(kind, data){ if (kind === 'recipes') write(KEYS.recipes, data); else if (kind === 'stories') write(KEYS.stories, data); else write(KEYS.products, data); }

  function editItem(id, kind){
    const item = getCollection(kind).find(x => String(x.id) === String(id));
    if (!item) return;
    if (kind === 'products') fillProductForm(item); else fillPostForm(kind, item);
  }
  function deleteItem(id, kind){
    if (!confirm('Delete this item?')) return;
    saveCollection(kind, getCollection(kind).filter(x => String(x.id) !== String(id)));
    renderPublicContent(); renderAdminLists();
  }
  function fillPostForm(kind, item){
    const form = document.querySelector(`[data-v140-post-form="${kind}"]`); if (!form) return;
    ['id','title','category','image','summary','body'].forEach(name => form.elements[name].value = item[name] || '');
    form.elements.published.checked = item.published !== false;
  }
  function savePostForm(kind, form){
    const data = Object.fromEntries(new FormData(form).entries());
    data.id = data.id || uid(kind);
    data.published = !!form.elements.published.checked;
    const list = getCollection(kind).filter(x => String(x.id) !== String(data.id));
    list.unshift(data);
    saveCollection(kind, list);
    fillPostForm(kind, {}); renderPublicContent(); renderAdminLists();
  }
  function fillProductForm(item){
    const form = document.querySelector('.v140-product-form'); if (!form) return;
    ['id','title','price','image','link','status','summary'].forEach(name => form.elements[name].value = item[name] || '');
    form.elements.published.checked = item.published !== false;
  }
  function saveProductForm(form){
    const data = Object.fromEntries(new FormData(form).entries());
    data.id = data.id || uid('product');
    data.price = Number(data.price || 0);
    data.published = !!form.elements.published.checked;
    const list = getProducts().filter(x => String(x.id) !== String(data.id));
    list.unshift(data);
    write(KEYS.products, list);
    fillProductForm({}); renderPublicContent(); renderAdminLists();
  }
  function saveMediaForm(form){
    const media = {title: form.elements.title.value, subtitle: form.elements.subtitle.value, items: [0,1,2].map(i => ({id:`hero-${i+1}`, src: form.elements[`src${i}`].value, poster: form.elements[`poster${i}`].value, enabled: !!form.elements[`enabled${i}`].checked}))};
    write(KEYS.media, media);
    applyHeroMedia();
    const status = document.getElementById('v140MediaStatus'); if (status) status.textContent = 'Saved. Homepage hero media updated.';
  }

  function boot(){
    renderPublicContent();
    applyPricingToDom();
    applyHeroMedia();
    ensureAdminTabs();
  }
  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('phoenix:pricing-updated', applyPricingToDom);
  const mo = new MutationObserver(() => { ensureAdminTabs(); });
  try { mo.observe(document.body, {childList:true, subtree:true}); } catch {}
  setTimeout(boot, 300);
})();
