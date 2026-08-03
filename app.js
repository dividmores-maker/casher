/* =========================================================
   كاشير محل الأحذية — منطق التطبيق
   البيانات متخزنة محليًا (localStorage) دلوقتي.
   لاحقًا: استبدال طبقة DB.* دي بنداءات Firestore بسهولة
   لأن كل القراءة/الكتابة بتمر من هنا بس.
   ========================================================= */

const DB = {
  KEYS: { PRODUCTS: 'pos_products', ORDERS: 'pos_orders', SETTINGS: 'pos_settings', SHIFTS: 'pos_shifts', USERS: 'pos_users', EXPENSES: 'pos_expenses', CUSTOMERS: 'pos_customers' },

  getProducts(){ return JSON.parse(localStorage.getItem(this.KEYS.PRODUCTS) || '[]'); },
  saveProducts(list){ localStorage.setItem(this.KEYS.PRODUCTS, JSON.stringify(list)); },

  getOrders(){ return JSON.parse(localStorage.getItem(this.KEYS.ORDERS) || '[]'); },
  saveOrders(list){ localStorage.setItem(this.KEYS.ORDERS, JSON.stringify(list)); },

  getShifts(){ return JSON.parse(localStorage.getItem(this.KEYS.SHIFTS) || '[]'); },
  saveShifts(list){ localStorage.setItem(this.KEYS.SHIFTS, JSON.stringify(list)); },

  getUsers(){ return JSON.parse(localStorage.getItem(this.KEYS.USERS) || '[]'); },
  saveUsers(list){ localStorage.setItem(this.KEYS.USERS, JSON.stringify(list)); },

  getExpenses(){ return JSON.parse(localStorage.getItem(this.KEYS.EXPENSES) || '[]'); },
  saveExpenses(list){ localStorage.setItem(this.KEYS.EXPENSES, JSON.stringify(list)); },

  getCustomers(){ return JSON.parse(localStorage.getItem(this.KEYS.CUSTOMERS) || '[]'); },
  saveCustomers(list){ localStorage.setItem(this.KEYS.CUSTOMERS, JSON.stringify(list)); },

  getSettings(){
    return JSON.parse(localStorage.getItem(this.KEYS.SETTINGS) || 'null') || {
      storeName: 'محل الأحذية', storeInfo: '', taxRate: 0, pointsPerCurrency: 0
    };
  },
  saveSettings(s){ localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(s)); }
};

function uid(prefix){ return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function paymentMethodLabel(method){
  return method==='cash' ? 'كاش' : method==='credit' ? 'بيع بالأجل' : 'بطاقة';
}
function money(n){ return (Math.round((n||0)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

/* ---------- Customers & loyalty points ----------
   Points rate lives in settings.pointsPerCurrency: "1 point
   per X currency spent". Rate of 0 (or unset) disables points
   entirely, but customers can still be tracked/selected. */
function pointsRate(){
  return Math.max(0, Number(DB.getSettings().pointsPerCurrency) || 0);
}
function pointsForAmount(amount){
  const rate = pointsRate();
  if(rate <= 0) return 0;
  return Math.floor((amount||0) / rate);
}
function findOrCreateCustomer(name, phone){
  name = (name||'').trim();
  phone = (phone||'').trim();
  const customers = DB.getCustomers();
  let existing = null;
  if(phone) existing = customers.find(c=>c.phone && c.phone===phone);
  if(!existing && name) existing = customers.find(c=>c.name.trim().toLowerCase()===name.toLowerCase() && (!phone || !c.phone));
  if(existing){
    if(phone && !existing.phone){ existing.phone = phone; DB.saveCustomers(customers); }
    return existing;
  }
  const created = { id: uid('cust'), name, phone, points:0, purchaseCount:0, purchaseTotal:0, createdAt:new Date().toISOString() };
  customers.push(created);
  DB.saveCustomers(customers);
  return created;
}
function awardPoints(customerId, saleTotal){
  if(!customerId) return 0;
  const customers = DB.getCustomers();
  const customer = customers.find(c=>c.id===customerId);
  if(!customer) return 0;
  const earned = pointsForAmount(saleTotal);
  customer.points = (customer.points||0) + earned;
  customer.purchaseCount = (customer.purchaseCount||0) + 1;
  customer.purchaseTotal = (customer.purchaseTotal||0) + saleTotal;
  DB.saveCustomers(customers);
  return earned;
}
function customerCreditRemaining(customerId){
  return creditOrders()
    .filter(o=>o.customerId===customerId && !creditIsSettled(o))
    .reduce((s,o)=>s+creditRemaining(o), 0);
}

/* ---------- Seed demo data on first run ---------- */
function seedIfEmpty(){
  if (DB.getProducts().length) return;
  const demo = [
    { id: uid('p'), name:'حذاء رياضي كلاسيك', brand:'نايك', group:'men', category:'رياضي', sku:'SP-001', cost:450, price:699,
      variants:[
        {id:uid('v'), size:'40', color:'أبيض', qty:5},
        {id:uid('v'), size:'41', color:'أبيض', qty:3},
        {id:uid('v'), size:'42', color:'أسود', qty:6},
      ]},
    { id: uid('p'), name:'حذاء جلد كلاسيك', brand:'ماركة محلية', group:'men', category:'كلاسيك', sku:'CL-014', cost:380, price:590,
      variants:[
        {id:uid('v'), size:'40', color:'بني', qty:2},
        {id:uid('v'), size:'42', color:'أسود', qty:4},
      ]},
    { id: uid('p'), name:'صندل حريمي صيفي', brand:'—', group:'women', category:'صندل', sku:'WM-220', cost:150, price:270,
      variants:[
        {id:uid('v'), size:'37', color:'بيج', qty:1},
        {id:uid('v'), size:'38', color:'بيج', qty:0},
        {id:uid('v'), size:'39', color:'أحمر', qty:5},
      ]},
    { id: uid('p'), name:'حذاء أطفال رياضي', brand:'—', group:'kids', category:'رياضي', sku:'KD-090', cost:120, price:210,
      variants:[
        {id:uid('v'), size:'28', color:'أزرق', qty:4},
        {id:uid('v'), size:'30', color:'أحمر', qty:3},
      ]},
  ];
  DB.saveProducts(demo);
}
seedIfEmpty();

/* ---------- Seed default users on first run ---------- */
function seedUsersIfEmpty(){
  if (DB.getUsers().length) return;
  DB.saveUsers([
    { id: uid('u'), name:'الأدمن', username:'admin', password:'1234', role:'admin' },
    { id: uid('u'), name:'الكاشير', username:'cashier', password:'1234', role:'cashier' },
  ]);
}
seedUsersIfEmpty();

const GROUPS = [
  { id:'men',   label:'رجالي', icon:'🧑' },
  { id:'women', label:'حريمي', icon:'👩' },
  { id:'kids',  label:'أطفال', icon:'🧒' },
];
function groupInfo(id){ return GROUPS.find(g=>g.id===id); }

const EXPENSE_CATEGORIES = [
  { id:'goods',     label:'بضاعة',  icon:'📦' },
  { id:'salaries',  label:'رواتب',  icon:'👥' },
  { id:'loans',     label:'سلف',    icon:'💰' },
  { id:'suppliers', label:'موردين', icon:'🚚' },
  { id:'other',     label:'أخرى',   icon:'🔖' },
];
function expenseCatInfo(id){ return EXPENSE_CATEGORIES.find(c=>c.id===id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length-1]; }

/* ---------- Global state ---------- */
let state = {
  view: 'sales',
  cart: [],       // {productId, variantId, name, size, color, price, qty}
  salesStep: 'groups',    // 'groups' | 'sizes' | 'products'
  selectedGroup: null,
  selectedSize: null,
  searchTerm: '',
  reportRange: 'today',
  expenseRange: 'today',
  expenseCatFilter: 'all',
  editExpenseCat: null,
  editVariantRows: [], // used while product modal open
  editGroup: null,      // used while product modal open
  editUserRole: null,    // used while user modal open
  selectedCustomer: null,   // customer attached to the current cart, if any
  customerSearchTerm: '',
  customerPickerSearchTerm: ''
};

/* =========================================================
   AUTH (login / logout / roles)
   Session lives in sessionStorage on purpose: it clears itself
   the moment the tab/browser closes, so every new browser
   session asks for login again.
   ========================================================= */
const AUTH = {
  KEY: 'pos_session',
  getSession(){
    try { return JSON.parse(sessionStorage.getItem(this.KEY) || 'null'); }
    catch(e){ return null; }
  },
  setSession(userId){ sessionStorage.setItem(this.KEY, JSON.stringify({ userId })); },
  clearSession(){ sessionStorage.removeItem(this.KEY); },
  currentUser(){
    const session = this.getSession();
    if(!session) return null;
    return DB.getUsers().find(u=>u.id===session.userId) || null;
  },
  isAdmin(){ return this.currentUser()?.role === 'admin'; }
};

function showLoginGate(){
  document.getElementById('loginGate').classList.remove('hidden');
  document.querySelector('.app').classList.add('hidden');
  document.getElementById('shiftGate').classList.add('hidden');
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').classList.add('hidden');
  setTimeout(()=>document.getElementById('loginUsername').focus(), 50);
}

function attemptLogin(){
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  const user = DB.getUsers().find(u=>u.username.toLowerCase()===username && u.password===password);
  if(!user){
    errBox.textContent = 'اسم المستخدم أو كلمة المرور غلط';
    errBox.classList.remove('hidden');
    return;
  }
  AUTH.setSession(user.id);
  document.getElementById('loginGate').classList.add('hidden');
  applyRoleUI();
  checkShiftGate();
}

document.getElementById('loginBtn').addEventListener('click', attemptLogin);
document.getElementById('loginPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });
document.getElementById('loginUsername').addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  if(!confirm('عاوز تسجل خروج؟')) return;
  AUTH.clearSession();
  showLoginGate();
});

/* Reflect the logged-in user in the sidebar, and hide admin-only
   nav items / views from a cashier account. */
function applyRoleUI(){
  const user = AUTH.currentUser();
  if(!user) return;
  document.getElementById('userNameLabel').textContent = user.name;
  document.getElementById('userRoleLabel').textContent = user.role==='admin' ? 'أدمن' : 'كاشير';
  document.getElementById('userAvatar').textContent = user.name.trim().charAt(0) || '؟';

  const isAdmin = user.role === 'admin';
  document.querySelectorAll('[data-admin-only]').forEach(el=>{
    el.style.display = isAdmin ? '' : 'none';
  });

  // Cashiers can't be left on an admin-only view (e.g. after a role change)
  if(!isAdmin){
    const activeAdminOnlyView = document.querySelector('.nav-item.active[data-admin-only]');
    if(activeAdminOnlyView){
      document.querySelector('.nav-item[data-view="sales"]').click();
    }
  }
}

function checkLoginGate(){
  const user = AUTH.currentUser();
  if(!user){
    showLoginGate();
    return false;
  }
  applyRoleUI();
  return true;
}

/* =========================================================
   SHIFTS
   ========================================================= */
function getActiveShift(){
  return DB.getShifts().find(s=>s.status==='open') || null;
}
function shiftOrders(shiftId){
  return DB.getOrders().filter(o=>o.shiftId===shiftId);
}
function shiftExpenses(shiftId){
  return DB.getExpenses().filter(e=>e.shiftId===shiftId);
}
function shiftCreditCollected(shiftId){
  let total = 0;
  DB.getOrders().forEach(o=>{
    (o.payments||[]).forEach(p=>{ if(p.shiftId===shiftId) total += p.amount; });
  });
  return total;
}
function shiftStats(shift){
  const orders = shiftOrders(shift.id);
  const salesTotal = orders.reduce((s,o)=>s+o.total,0);
  const cashTotal = orders.filter(o=>o.method==='cash').reduce((s,o)=>s+o.total,0);
  const cardTotal = orders.filter(o=>o.method==='card').reduce((s,o)=>s+o.total,0);
  const creditTotal = orders.filter(o=>o.method==='credit').reduce((s,o)=>s+o.total,0);
  const expensesTotal = shiftExpenses(shift.id).reduce((s,e)=>s+e.amount,0);
  const creditCollected = shiftCreditCollected(shift.id);
  return { ordersCount: orders.length, salesTotal, cashTotal, cardTotal, creditTotal, expensesTotal, creditCollected };
}
function fmtDT(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('ar-EG') + ' — ' + d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
}
function fmtDuration(startIso, endIso){
  const start = new Date(startIso), end = endIso ? new Date(endIso) : new Date();
  let mins = Math.max(0, Math.round((end-start)/60000));
  const h = Math.floor(mins/60), m = mins%60;
  return (h>0 ? h+' س ' : '') + m+' د';
}

function showGate(which){ // 'start' | 'recover' | null
  const gate = document.getElementById('shiftGate');
  const startCard = document.getElementById('shiftStartCard');
  const recoverCard = document.getElementById('shiftRecoverCard');
  const app = document.querySelector('.app');
  if(!which){
    gate.classList.add('hidden');
    app.classList.remove('hidden');
    return;
  }
  gate.classList.remove('hidden');
  app.classList.add('hidden');
  startCard.classList.toggle('hidden', which!=='start');
  recoverCard.classList.toggle('hidden', which!=='recover');
}

function checkShiftGate(){
  const active = getActiveShift();
  if(active){
    const stats = shiftStats(active);
    document.getElementById('shiftRecoverInfo').innerHTML =
      `لقينا وردية اتفتحت الساعة <strong>${fmtDT(active.openedAt)}</strong> ولسه ما اتقفلتش.<br>
       عدد الفواتير: <strong>${stats.ordersCount}</strong> — المبيعات: <strong>${money(stats.salesTotal)}</strong> ج.م`;
    showGate('recover');
  } else {
    showGate('start');
  }
  refreshShiftBadge();
}

function refreshShiftBadge(){
  const active = getActiveShift();
  const badge = document.getElementById('shiftBadge');
  const text = document.getElementById('shiftBadgeText');
  if(active){
    badge.style.display = 'flex';
    text.textContent = 'وردية مفتوحة من ' + new Date(active.openedAt).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
  } else {
    badge.style.display = 'none';
  }
}

/* ---- Open shift ---- */
document.getElementById('openShiftBtn').addEventListener('click', ()=>{
  document.getElementById('openingCashInput').value = 0;
  openModal('openShiftModal');
});
document.getElementById('confirmOpenShiftBtn').addEventListener('click', ()=>{
  const openingCash = Math.max(0, Number(document.getElementById('openingCashInput').value)||0);
  const shifts = DB.getShifts();
  shifts.push({
    id: uid('sh'),
    openedAt: new Date().toISOString(),
    closedAt: null,
    openingCash,
    closingCash: null,
    status: 'open'
  });
  DB.saveShifts(shifts);
  closeModal('openShiftModal');
  showGate(null);
  refreshShiftBadge();
  state.salesStep='groups'; state.selectedGroup=null; state.selectedSize=null; state.searchTerm='';
  document.getElementById('productSearch').value='';
  renderSales();
  showToast('الوردية اتفتحت، بالتوفيق 💪');
});

/* ---- Resume shift (from recovery gate) ---- */
document.getElementById('resumeShiftBtn').addEventListener('click', ()=>{
  showGate(null);
  refreshShiftBadge();
  renderSales();
  renderCart();
});

/* ---- End shift ---- */
function openEndShiftModal(){
  const active = getActiveShift();
  if(!active){ showToast('مفيش وردية شغالة دلوقتي'); return; }
  const stats = shiftStats(active);
  const expectedCash = active.openingCash + stats.cashTotal + stats.creditCollected - stats.expensesTotal;
  document.getElementById('endShiftSummary').innerHTML = `
    <div class="sum-row"><span>بدأت الساعة</span><span class="mono">${fmtDT(active.openedAt)}</span></div>
    <div class="sum-row"><span>المدة</span><span class="mono">${fmtDuration(active.openedAt)}</span></div>
    <div class="sum-row"><span>عدد الفواتير</span><span class="mono">${stats.ordersCount}</span></div>
    <div class="sum-row"><span>مبيعات كاش</span><span class="mono">${money(stats.cashTotal)}</span></div>
    <div class="sum-row"><span>مبيعات فيزا</span><span class="mono">${money(stats.cardTotal)}</span></div>
    <div class="sum-row"><span>مبيعات بالأجل (لسه ملهاش تحصيل كامل)</span><span class="mono">${money(stats.creditTotal)}</span></div>
    <div class="sum-row"><span>تحصيل نقدي من الآجل</span><span class="mono">${money(stats.creditCollected)}</span></div>
    <div class="sum-row"><span>مصاريف الوردية</span><span class="mono">${money(stats.expensesTotal)}</span></div>
    <div class="sum-row total-row"><span>الكاش المتوقع بالدرج</span><span class="mono">${money(expectedCash)}</span></div>`;
  document.getElementById('closingCashInput').value = expectedCash.toFixed(2);
  updateShiftDiff(expectedCash);
  openModal('endShiftModal');
}

function updateShiftDiff(expectedCash){
  const closing = Number(document.getElementById('closingCashInput').value)||0;
  const diff = closing - expectedCash;
  const diffLine = document.getElementById('shiftDiffLine');
  if(Math.abs(diff) < 0.01){
    diffLine.innerHTML = `<div class="barcode-msg success">✓ الدرج مطابق تمامًا</div>`;
  } else if(diff > 0){
    diffLine.innerHTML = `<div class="barcode-msg success">+${money(diff)} ج.م زيادة في الدرج</div>`;
  } else {
    diffLine.innerHTML = `<div class="barcode-msg error">${money(diff)} ج.م عجز في الدرج</div>`;
  }
}
document.getElementById('closingCashInput').addEventListener('input', ()=>{
  const active = getActiveShift();
  if(!active) return;
  const stats = shiftStats(active);
  updateShiftDiff(active.openingCash + stats.cashTotal + stats.creditCollected - stats.expensesTotal);
});

document.getElementById('confirmEndShiftBtn').addEventListener('click', ()=>{
  const active = getActiveShift();
  if(!active) return;
  const shifts = DB.getShifts();
  const idx = shifts.findIndex(s=>s.id===active.id);
  shifts[idx].status = 'closed';
  shifts[idx].closedAt = new Date().toISOString();
  shifts[idx].closingCash = Number(document.getElementById('closingCashInput').value)||0;
  DB.saveShifts(shifts);
  closeModal('endShiftModal');
  showToast('تم إنهاء الوردية');
  checkShiftGate();
});

document.getElementById('endShiftFromGateBtn').addEventListener('click', openEndShiftModal);
document.getElementById('endShiftSidebarBtn').addEventListener('click', openEndShiftModal);

/* ---- Shift log ---- */
function renderShiftLog(){
  const shifts = [...DB.getShifts()].reverse();
  const list = document.getElementById('shiftLogList');
  if(!shifts.length){
    list.innerHTML = '<div class="empty-note">لسه مفيش ورديات مسجلة.</div>';
  } else {
    list.innerHTML = '';
    shifts.forEach(s=>{
      const stats = shiftStats(s);
      const row = document.createElement('div');
      row.className = 'shift-log-row';
      const statusBadge = s.status==='open'
        ? '<span class="shift-status open">شغالة دلوقتي</span>'
        : '<span class="shift-status closed">اتقفلت</span>';
      row.innerHTML = `
        <div class="shift-log-top">
          <span class="shift-log-date mono">${fmtDT(s.openedAt)}</span>
          ${statusBadge}
        </div>
        <div class="shift-log-grid">
          <div><span>المدة</span><strong>${fmtDuration(s.openedAt, s.closedAt)}</strong></div>
          <div><span>الفواتير</span><strong>${stats.ordersCount}</strong></div>
          <div><span>المبيعات</span><strong>${money(stats.salesTotal)}</strong></div>
          <div><span>المصاريف</span><strong>${money(stats.expensesTotal)}</strong></div>
          <div><span>افتتاحي</span><strong>${money(s.openingCash)}</strong></div>
          ${s.status==='closed' ? `<div><span>ختامي</span><strong>${money(s.closingCash)}</strong></div>` : ''}
        </div>`;
      list.appendChild(row);
    });
  }
  openModal('shiftLogModal');
}
document.getElementById('viewShiftLogBtn').addEventListener('click', renderShiftLog);
document.getElementById('sidebarShiftLogBtn').addEventListener('click', renderShiftLog);

/* ============ Clock ============ */
function tickClock(){
  const now = new Date();
  document.getElementById('clockLabel').textContent =
    now.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
  document.getElementById('dateLabel').textContent =
    now.toLocaleDateString('ar-EG',{year:'numeric',month:'2-digit',day:'2-digit'});
}
tickClock();
setInterval(tickClock, 30000);

/* ============ Navigation ============ */
document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    state.view = view;
    document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
    document.getElementById('view-'+view).classList.remove('hidden');
    if(view==='inventory') renderInventory();
    if(view==='expenses') renderExpenses();
    if(view==='customers') renderCustomersView();
    if(view==='credit') renderCreditView();
    if(view==='reports') renderReports();
    if(view==='settings'){ loadSettingsForm(); renderUsersTable(); }
    if(view==='sales') renderSales();
  });
});

/* ============ Toast ============ */
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ============ Modal helpers ============ */
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach(el=>{
  el.addEventListener('click', ()=>closeModal(el.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(ov=>{
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.classList.add('hidden'); });
});

/* =========================================================
   SALES VIEW
   ========================================================= */
function totalStock(product){
  return product.variants.reduce((s,v)=>s+v.qty,0);
}

/* ---- Sales dispatcher: search overrides the group/size drill-down ---- */
function renderSales(){
  renderSalesBreadcrumb();
  const term = state.searchTerm.trim();
  if(term){ renderSearchResults(term); return; }
  if(state.salesStep==='sizes') renderSizeCards();
  else if(state.salesStep==='products') renderSizeProductCards();
  else renderGroupCards();
}

function renderSalesBreadcrumb(){
  const wrap = document.getElementById('salesBreadcrumb');
  wrap.innerHTML = '';
  const term = state.searchTerm.trim();
  if(term){
    wrap.innerHTML = `<span class="bc-trail">نتائج البحث عن «<strong>${escapeHtml(term)}</strong>»</span>`;
    return;
  }
  if(state.salesStep==='groups') return;

  const back = document.createElement('button');
  back.className = 'bc-back';
  back.textContent = '↩ رجوع';
  const trail = document.createElement('span');
  trail.className = 'bc-trail';

  if(state.salesStep==='sizes'){
    const g = groupInfo(state.selectedGroup);
    trail.innerHTML = `${g.icon} <strong>${g.label}</strong> — اختار المقاس`;
    back.onclick = ()=>{ state.salesStep='groups'; state.selectedGroup=null; renderSales(); };
  } else if(state.salesStep==='products'){
    const g = groupInfo(state.selectedGroup);
    trail.innerHTML = `${g.icon} <strong>${g.label}</strong> — مقاس <strong>${escapeHtml(state.selectedSize)}</strong>`;
    back.onclick = ()=>{ state.salesStep='sizes'; state.selectedSize=null; renderSales(); };
  }
  wrap.appendChild(back);
  wrap.appendChild(trail);
}

/* Level 1: رجالي / حريمي / أطفال */
function renderGroupCards(){
  const grid = document.getElementById('productGrid');
  grid.className = 'product-grid group-grid';
  grid.innerHTML = '';
  const products = DB.getProducts();
  GROUPS.forEach(g=>{
    const count = products.filter(p=>p.group===g.id).length;
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-card-icon">${g.icon}</div>
      <div class="group-card-name">${g.label}</div>
      <div class="group-card-count">${count} صنف</div>`;
    card.onclick = ()=>{ state.selectedGroup=g.id; state.salesStep='sizes'; renderSales(); };
    grid.appendChild(card);
  });
}

/* Level 2: المقاسات المتاحة في القسم ده */
function renderSizeCards(){
  const grid = document.getElementById('productGrid');
  grid.className = 'product-grid size-grid';
  grid.innerHTML = '';
  const products = DB.getProducts().filter(p=>p.group===state.selectedGroup);
  const sizeStock = {};
  products.forEach(p=>p.variants.forEach(v=>{
    sizeStock[v.size] = (sizeStock[v.size]||0) + v.qty;
  }));
  const sizes = Object.keys(sizeStock).sort((a,b)=>{
    const na=parseFloat(a), nb=parseFloat(b);
    return (!isNaN(na)&&!isNaN(nb)) ? na-nb : a.localeCompare(b,'ar');
  });

  if(!sizes.length){
    grid.innerHTML = '<div class="no-results">مفيش مقاسات مسجلة في القسم ده لسه. أضف أصناف من المخزون.</div>';
    return;
  }
  sizes.forEach(size=>{
    const stock = sizeStock[size];
    const card = document.createElement('div');
    card.className = 'size-card';
    card.innerHTML = `
      <div class="size-card-num mono">${escapeHtml(size)}</div>
      <div class="size-card-count ${stock<=3?'low':''}">${stock>0 ? stock+' قطعة' : 'خلص'}</div>`;
    card.onclick = ()=>{ state.selectedSize=size; state.salesStep='products'; renderSales(); };
    grid.appendChild(card);
  });
}

/* Level 3: الأحذية المتاحة بالمقاس ده وألوانها */
function renderSizeProductCards(){
  const grid = document.getElementById('productGrid');
  grid.className = 'product-grid';
  grid.innerHTML = '';
  const products = DB.getProducts().filter(p=>
    p.group===state.selectedGroup && p.variants.some(v=>v.size===state.selectedSize)
  );

  if(!products.length){
    grid.innerHTML = '<div class="no-results">مفيش أحذية بالمقاس ده في القسم ده.</div>';
    return;
  }

  products.forEach(p=>{
    const variants = p.variants.filter(v=>v.size===state.selectedSize);
    const colorsHtml = variants.map(v=>`
      <button class="color-chip ${v.qty<=0?'disabled':''}" data-vid="${v.id}">
        <span>${escapeHtml(v.color)}</span><span class="cc-stock">${v.qty<=0?'خلص':v.qty}</span>
      </button>`).join('');

    const card = document.createElement('div');
    card.className = 'psize-card';
    card.innerHTML = `
      <div class="psize-icon">👟</div>
      <div class="psize-info">
        <div class="psize-name">${escapeHtml(p.name)}</div>
        <div class="psize-price mono">${money(p.price)}</div>
      </div>
      <div class="psize-colors">${colorsHtml}</div>`;
    card.querySelectorAll('.color-chip:not(.disabled)').forEach(btn=>{
      btn.onclick = ()=>{
        const v = variants.find(vv=>vv.id===btn.dataset.vid);
        addToCart(p, v);
      };
    });
    grid.appendChild(card);
  });
}

/* Search overrides the drill-down with a flat, all-groups result list */
function renderSearchResults(term){
  const grid = document.getElementById('productGrid');
  grid.className = 'product-grid';
  grid.innerHTML = '';
  const t = term.toLowerCase();
  const products = DB.getProducts().filter(p=>
    p.name.toLowerCase().includes(t) || (p.sku||'').toLowerCase().includes(t)
  );

  if(!products.length){
    grid.innerHTML = '<div class="no-results">مفيش أصناف مطابقة لبحثك.</div>';
    return;
  }

  products.forEach(p=>{
    const stock = totalStock(p);
    let stockClass = '', stockLabel = stock+' قطعة';
    if(stock===0){ stockClass='out'; stockLabel='خلص'; }
    else if(stock<=3){ stockClass='low'; stockLabel='باقي '+stock; }

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="pc-icon">👟</div>
      <div class="pc-name">${escapeHtml(p.name)}</div>
      <div class="pc-brand">${escapeHtml(p.brand||'')}</div>
      <div class="pc-foot">
        <span class="pc-price mono">${money(p.price)}</span>
        <span class="pc-stock ${stockClass}">${stockLabel}</span>
      </div>`;
    card.onclick = ()=> openPicker(p);
    grid.appendChild(card);
  });
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str==null ? '' : str;
  return d.innerHTML;
}

document.getElementById('productSearch').addEventListener('input', e=>{
  state.searchTerm = e.target.value;
  renderSales();
});

/* ---- Variant picker ---- */
let pickerProduct = null;
function openPicker(product){
  pickerProduct = product;
  document.getElementById('pickerModalTitle').textContent = product.name;
  const wrap = document.getElementById('pickerOptions');
  wrap.innerHTML = '';

  if(!product.variants.length){
    wrap.innerHTML = '<div class="empty-note">مفيش مقاسات مسجلة لهذا الصنف.</div>';
    openModal('pickerModal');
    return;
  }

  product.variants.forEach(v=>{
    const opt = document.createElement('div');
    opt.className = 'picker-option' + (v.qty<=0 ? ' disabled' : '');
    opt.innerHTML = `
      <span class="picker-option-label">مقاس ${escapeHtml(v.size)} — ${escapeHtml(v.color)}</span>
      <span class="picker-option-stock">${v.qty<=0 ? 'غير متوفر' : 'متاح '+v.qty}</span>`;
    if(v.qty>0){
      opt.onclick = ()=>{
        addToCart(product, v);
        closeModal('pickerModal');
      };
    }
    wrap.appendChild(opt);
  });
  openModal('pickerModal');
}

/* ---- Barcode scan ---- */
const barcodeBtn = document.getElementById('barcodeBtn');
const barcodeInput = document.getElementById('barcodeInput');
const barcodeFeedback = document.getElementById('barcodeFeedback');

barcodeBtn.addEventListener('click', ()=>{
  barcodeFeedback.innerHTML = '';
  barcodeInput.value = '';
  openModal('barcodeModal');
  setTimeout(()=>barcodeInput.focus(), 60);
});

barcodeInput.addEventListener('keydown', e=>{
  if(e.key === 'Enter'){
    e.preventDefault();
    handleBarcodeScan(barcodeInput.value);
    barcodeInput.value = '';
  }
});

// Fallback: scanners that don't send a real Enter — treat a burst of
// fast keystrokes followed by a short pause as "end of scan".
let barcodeBurstTimer = null;
barcodeInput.addEventListener('input', ()=>{
  clearTimeout(barcodeBurstTimer);
  barcodeBurstTimer = setTimeout(()=>{
    if(barcodeInput.value.trim().length >= 3){
      handleBarcodeScan(barcodeInput.value);
      barcodeInput.value = '';
    }
  }, 250);
});

function handleBarcodeScan(raw){
  const code = raw.trim();
  if(!code) return;

  const product = DB.getProducts().find(p => (p.sku||'').trim().toLowerCase() === code.toLowerCase());

  if(!product){
    barcodeFeedback.innerHTML = `<div class="barcode-msg error">✕ مفيش صنف بالكود «${escapeHtml(code)}»</div>`;
    return;
  }

  const available = product.variants.filter(v=>v.qty>0);

  if(!available.length){
    barcodeFeedback.innerHTML = `<div class="barcode-msg error">⚠ «${escapeHtml(product.name)}» خلص من المخزون</div>`;
    return;
  }

  if(available.length === 1){
    addToCart(product, available[0]);
    barcodeFeedback.innerHTML = `<div class="barcode-msg success">✓ اتضاف: ${escapeHtml(product.name)} — مقاس ${escapeHtml(available[0].size)} / ${escapeHtml(available[0].color)}</div>`;
    setTimeout(()=>barcodeInput.focus(), 30);
  } else {
    closeModal('barcodeModal');
    openPicker(product);
  }
}

/* ---- Cart ---- */
function addToCart(product, variant){
  const existing = state.cart.find(c=>c.variantId===variant.id);
  const inCartQty = existing ? existing.qty : 0;
  if(inCartQty + 1 > variant.qty){
    showToast('الكمية المتاحة خلصت في المخزون');
    return;
  }
  if(existing){ existing.qty += 1; }
  else{
    state.cart.push({
      productId: product.id, variantId: variant.id,
      name: product.name, size: variant.size, color: variant.color,
      price: product.price, qty: 1, maxQty: variant.qty
    });
  }
  renderCart();
  showToast(product.name + ' اتضاف للفاتورة');
}

function changeCartQty(variantId, delta){
  const item = state.cart.find(c=>c.variantId===variantId);
  if(!item) return;
  const product = DB.getProducts().find(p=>p.id===item.productId);
  const variant = product?.variants.find(v=>v.id===variantId);
  const max = variant ? variant.qty : item.qty;

  const newQty = item.qty + delta;
  if(newQty <= 0){
    state.cart = state.cart.filter(c=>c.variantId!==variantId);
  } else if(newQty > max){
    showToast('الكمية المتاحة في المخزون ' + max + ' بس');
    return;
  } else {
    item.qty = newQty;
  }
  renderCart();
}

function removeCartItem(variantId){
  state.cart = state.cart.filter(c=>c.variantId!==variantId);
  renderCart();
}

document.getElementById('clearCartBtn').addEventListener('click', ()=>{
  state.cart = [];
  renderCart();
});

function cartSubtotal(){
  return state.cart.reduce((s,c)=>s + c.price*c.qty, 0);
}
function cartCount(){
  return state.cart.reduce((s,c)=>s + c.qty, 0);
}

function renderCart(){
  const wrap = document.getElementById('cartItems');
  const emptyMsg = document.getElementById('emptyCartMsg');

  if(!state.cart.length){
    wrap.innerHTML = '';
    wrap.appendChild(emptyMsg);
  } else {
    wrap.innerHTML = '';
    state.cart.forEach(item=>{
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-meta">مقاس ${escapeHtml(item.size)} · ${escapeHtml(item.color)}</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-act="dec">−</button>
          <span class="qty-val mono">${item.qty}</span>
          <button class="qty-btn" data-act="inc">+</button>
        </div>
        <div class="cart-item-price mono">${money(item.price*item.qty)}</div>
        <button class="cart-item-remove" title="حذف">✕</button>`;
      row.querySelector('[data-act="inc"]').onclick = ()=>changeCartQty(item.variantId, 1);
      row.querySelector('[data-act="dec"]').onclick = ()=>changeCartQty(item.variantId, -1);
      row.querySelector('.cart-item-remove').onclick = ()=>removeCartItem(item.variantId);
      wrap.appendChild(row);
    });
  }

  const subtotal = cartSubtotal();
  const discount = Math.max(0, Number(document.getElementById('discountInput').value) || 0);
  const total = Math.max(0, subtotal - discount);

  document.getElementById('sumCount').textContent = cartCount();
  document.getElementById('sumSubtotal').textContent = money(subtotal);
  document.getElementById('sumTotal').textContent = money(total);

  renderTicketCustomerRow(total);

  document.getElementById('checkoutBtn').disabled = state.cart.length===0;
}
document.getElementById('discountInput').addEventListener('input', renderCart);

/* ---- Customer selection on the cart (optional) ---- */
function renderTicketCustomerRow(total){
  const row = document.getElementById('ticketCustomerRow');
  const c = state.selectedCustomer;
  if(!c){
    row.innerHTML = `<button class="ticket-customer-pick" id="pickCustomerBtn">👤 اختيار عميل (اختياري)</button>`;
    document.getElementById('pickCustomerBtn').onclick = openCustomerPickerModal;
    return;
  }
  const willEarn = pointsForAmount(total ?? cartSubtotal());
  const pointsLine = pointsRate() > 0
    ? `🎁 ${c.points||0} نقطة${willEarn>0 ? ' — هيكسب '+willEarn+' كمان من الفاتورة دي' : ''}`
    : `🎁 ${c.points||0} نقطة`;
  row.innerHTML = `
    <div class="ticket-customer-info">
      <span class="ticket-customer-name">👤 ${escapeHtml(c.name)}</span>
      <span class="ticket-customer-points">${pointsLine}</span>
    </div>
    <div class="ticket-customer-actions">
      <button id="changeCustomerBtn">تغيير</button>
      <button id="removeCustomerBtn">✕ إلغاء</button>
    </div>`;
  document.getElementById('changeCustomerBtn').onclick = openCustomerPickerModal;
  document.getElementById('removeCustomerBtn').onclick = ()=>{ state.selectedCustomer = null; renderCart(); };
}

function openCustomerPickerModal(){
  document.getElementById('customerPickerSearch').value = '';
  state.customerPickerSearchTerm = '';
  document.getElementById('quickAddCustomerName').value = '';
  document.getElementById('quickAddCustomerPhone').value = '';
  renderCustomerPickerList();
  openModal('customerPickerModal');
  const hasAnyCustomers = DB.getCustomers().length > 0;
  // First time (no customers at all yet): jump straight to "add a customer"
  // instead of a search box with nothing to search.
  setTimeout(()=>{
    document.getElementById(hasAnyCustomers ? 'customerPickerSearch' : 'quickAddCustomerName').focus();
  }, 50);
}

function renderCustomerPickerList(){
  const term = state.customerPickerSearchTerm.trim().toLowerCase();
  const allCustomers = DB.getCustomers();
  let customers = allCustomers;
  if(term){
    customers = customers.filter(c=>
      c.name.toLowerCase().includes(term) || (c.phone||'').includes(term));
  }
  const list = document.getElementById('customerPickerList');
  const quickAddHead = document.querySelector('#customerPickerModal .quick-add-head');

  if(!allCustomers.length){
    // No customers in the whole system yet — make it obvious this is step 1.
    list.innerHTML = '<div class="empty-note">لسه مفيش عملاء متسجلين خالص. ضيف أول عميل من هنا 👇</div>';
    if(quickAddHead) quickAddHead.textContent = 'ضيف أول عميل عندك:';
    return;
  }
  if(quickAddHead) quickAddHead.textContent = 'مش لاقي العميل؟ ضيفه بسرعة';

  if(!customers.length){
    list.innerHTML = '<div class="empty-note">مفيش عميل بالاسم أو الرقم ده. ضيفه تحت 👇</div>';
    return;
  }
  list.innerHTML = '';
  [...customers].reverse().forEach(c=>{
    const opt = document.createElement('div');
    opt.className = 'picker-option';
    opt.innerHTML = `
      <span class="picker-option-label">${escapeHtml(c.name)}${c.phone ? ' — '+escapeHtml(c.phone) : ''}</span>
      <span class="picker-option-stock">🎁 ${c.points||0} نقطة</span>`;
    opt.onclick = ()=>{
      state.selectedCustomer = c;
      closeModal('customerPickerModal');
      renderCart();
    };
    list.appendChild(opt);
  });
}
document.getElementById('customerPickerSearch').addEventListener('input', e=>{
  state.customerPickerSearchTerm = e.target.value;
  renderCustomerPickerList();
});
document.getElementById('quickAddCustomerBtn').addEventListener('click', ()=>{
  const name = document.getElementById('quickAddCustomerName').value.trim();
  const phone = document.getElementById('quickAddCustomerPhone').value.trim();
  if(!name){ showToast('اكتب اسم العميل الأول'); return; }
  const customer = findOrCreateCustomer(name, phone);
  state.selectedCustomer = customer;
  closeModal('customerPickerModal');
  renderCart();
  showToast('اتضاف العميل واتحدد للفاتورة');
});

/* ---- Checkout ---- */
document.getElementById('checkoutBtn').addEventListener('click', ()=>{
  if(!state.cart.length) return;
  openModal('paymentModal');
});

document.querySelectorAll('.payment-option').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(btn.dataset.method==='credit'){
      closeModal('paymentModal');
      openCreditSaleModal();
      return;
    }
    completeSale(btn.dataset.method);
    closeModal('paymentModal');
  });
});

/* ---- Credit sale (بيع بالأجل): capture customer + optional down payment ---- */
function openCreditSaleModal(){
  const c = state.selectedCustomer;
  document.getElementById('creditCustomerName').value = c ? c.name : '';
  document.getElementById('creditCustomerPhone').value = c ? (c.phone||'') : '';
  document.getElementById('creditDownPayment').value = 0;
  updateCreditSalePreview();
  openModal('creditSaleModal');
  setTimeout(()=>document.getElementById('creditCustomerName').focus(), 50);
}

function updateCreditSalePreview(){
  const subtotal = cartSubtotal();
  const discount = Math.max(0, Number(document.getElementById('discountInput').value) || 0);
  const total = Math.max(0, subtotal - discount);
  const down = Math.max(0, Number(document.getElementById('creditDownPayment').value) || 0);
  const remaining = Math.max(0, total - Math.min(down, total));
  document.getElementById('creditRemainingPreview').innerHTML =
    `الإجمالي <strong>${money(total)}</strong> ج.م — هيتدفع دلوقتي <strong>${money(Math.min(down,total))}</strong> — والمتبقي على العميل <strong>${money(remaining)}</strong> ج.م`;
}
document.getElementById('creditDownPayment').addEventListener('input', updateCreditSalePreview);

document.getElementById('confirmCreditSaleBtn').addEventListener('click', ()=>{
  const customerName = document.getElementById('creditCustomerName').value.trim();
  const customerPhone = document.getElementById('creditCustomerPhone').value.trim();
  if(!customerName){ showToast('اكتب اسم العميل الأول'); return; }
  const subtotal = cartSubtotal();
  const discount = Math.max(0, Number(document.getElementById('discountInput').value) || 0);
  const total = Math.max(0, subtotal - discount);
  const downPayment = Math.min(total, Math.max(0, Number(document.getElementById('creditDownPayment').value) || 0));

  const customer = findOrCreateCustomer(customerName, customerPhone);
  completeSale('credit', { customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, downPayment });
  closeModal('creditSaleModal');
});

function completeSale(method, creditInfo){
  const products = DB.getProducts();
  // decrement stock
  state.cart.forEach(item=>{
    const product = products.find(p=>p.id===item.productId);
    const variant = product?.variants.find(v=>v.id===item.variantId);
    if(variant) variant.qty = Math.max(0, variant.qty - item.qty);
  });
  DB.saveProducts(products);

  const subtotal = cartSubtotal();
  const discount = Math.max(0, Number(document.getElementById('discountInput').value) || 0);
  const total = Math.max(0, subtotal - discount);
  const cost = state.cart.reduce((s,item)=>{
    const product = products.find(p=>p.id===item.productId);
    return s + (product ? product.cost*item.qty : 0);
  },0);

  const cashier = AUTH.currentUser();
  const activeShift = getActiveShift();
  const order = {
    id: uid('ord'),
    number: (DB.getOrders().length + 1),
    date: new Date().toISOString(),
    shiftId: activeShift ? activeShift.id : null,
    items: state.cart.map(c=>({...c})),
    subtotal, discount, total, cost,
    method,
    cashierId: cashier?.id || null,
    cashierName: cashier?.name || ''
  };

  if(method==='credit'){
    order.customerId = creditInfo?.customerId || null;
    order.customerName = creditInfo?.customerName || '';
    order.customerPhone = creditInfo?.customerPhone || '';
    order.payments = [];
    const down = Math.max(0, creditInfo?.downPayment || 0);
    if(down > 0){
      order.payments.push({
        id: uid('pay'), date: new Date().toISOString(), amount: down,
        shiftId: activeShift ? activeShift.id : null,
        byId: cashier?.id || null, byName: cashier?.name || ''
      });
    }
  } else if(state.selectedCustomer){
    order.customerId = state.selectedCustomer.id;
    order.customerName = state.selectedCustomer.name;
    order.customerPhone = state.selectedCustomer.phone || '';
  }

  const orders = DB.getOrders();
  orders.push(order);
  DB.saveOrders(orders);

  order.pointsEarned = order.customerId ? awardPoints(order.customerId, total) : 0;

  showReceipt(order);

  state.cart = [];
  state.selectedCustomer = null;
  document.getElementById('discountInput').value = 0;
  renderCart();
  renderSales();
  refreshShiftBadge();
}

/* ---- Credit helpers ---- */
function creditPaidTotal(order){
  return (order.payments||[]).reduce((s,p)=>s+p.amount, 0);
}
function creditRemaining(order){
  return Math.max(0, Math.round((order.total - creditPaidTotal(order))*100)/100);
}
function creditIsSettled(order){
  return creditRemaining(order) <= 0.01;
}

function showReceipt(order){
  const settings = DB.getSettings();
  const dt = new Date(order.date);
  let html = `
    <div class="receipt-title">${escapeHtml(settings.storeName)}</div>
    <div class="receipt-sub">${escapeHtml(settings.storeInfo||'')}</div>
    <div class="receipt-line"><span>فاتورة رقم</span><span>#${order.number}</span></div>
    <div class="receipt-line"><span>التاريخ</span><span>${dt.toLocaleDateString('ar-EG')} ${dt.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</span></div>
    ${order.cashierName ? `<div class="receipt-line"><span>الكاشير</span><span>${escapeHtml(order.cashierName)}</span></div>` : ''}
    <div class="receipt-hr"></div>`;
  order.items.forEach(it=>{
    html += `<div class="receipt-line"><span>${escapeHtml(it.name)} (${escapeHtml(it.size)}/${escapeHtml(it.color)}) x${it.qty}</span><span>${money(it.price*it.qty)}</span></div>`;
  });
  html += `<div class="receipt-hr"></div>
    <div class="receipt-line"><span>الإجمالي الفرعي</span><span>${money(order.subtotal)}</span></div>
    <div class="receipt-line"><span>الخصم</span><span>${money(order.discount)}</span></div>
    <div class="receipt-line"><strong>الإجمالي</strong><strong>${money(order.total)}</strong></div>
    <div class="receipt-hr"></div>
    <div class="receipt-line"><span>طريقة الدفع</span><span>${paymentMethodLabel(order.method)}</span></div>`;
  if(order.method==='credit'){
    const paid = creditPaidTotal(order);
    const remaining = creditRemaining(order);
    html += `
    <div class="receipt-line"><span>العميل</span><span>${escapeHtml(order.customerName||'—')}</span></div>
    ${order.customerPhone ? `<div class="receipt-line"><span>تليفون العميل</span><span>${escapeHtml(order.customerPhone)}</span></div>` : ''}
    <div class="receipt-line"><span>المدفوع الآن</span><span>${money(paid)}</span></div>
    <div class="receipt-line"><strong>المتبقي على العميل</strong><strong>${money(remaining)}</strong></div>`;
  } else if(order.customerName){
    html += `<div class="receipt-line"><span>العميل</span><span>${escapeHtml(order.customerName)}</span></div>`;
  }
  if(order.customerId && order.pointsEarned>0){
    const c = DB.getCustomers().find(x=>x.id===order.customerId);
    html += `<div class="receipt-line"><span>🎁 نقط اتكسبت</span><span>+${order.pointsEarned} (إجمالي ${c?c.points:order.pointsEarned})</span></div>`;
  }
  html += `<div class="receipt-sub" style="margin-top:10px;">شكرًا لتعاملكم معنا 🙏</div>`;
  document.getElementById('receiptContent').innerHTML = html;
  openModal('receiptModal');
}
document.getElementById('printReceiptBtn').addEventListener('click', ()=>window.print());

/* =========================================================
   CUSTOMERS VIEW (العملاء ونقاط الولاء)
   ========================================================= */
function renderCustomersView(){
  const term = state.customerSearchTerm.trim().toLowerCase();
  let customers = DB.getCustomers();
  if(term){
    customers = customers.filter(c=>
      c.name.toLowerCase().includes(term) || (c.phone||'').includes(term));
  }
  const tbody = document.getElementById('customersTableBody');
  if(!customers.length){
    tbody.innerHTML = '<tr><td colspan="7" class="empty-note">مفيش عملاء مسجلين لسه</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  [...customers].reverse().forEach(c=>{
    const debt = customerCreditRemaining(c.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td class="mono">${escapeHtml(c.phone||'—')}</td>
      <td class="mono">${c.purchaseCount||0}</td>
      <td class="mono">${money(c.purchaseTotal||0)}</td>
      <td class="mono">🎁 ${c.points||0}</td>
      <td class="mono">${debt>0.01 ? money(debt) : '—'}</td>
      <td><button class="icon-btn" title="تعديل">✏️</button> <button class="icon-btn" title="حذف">🗑️</button></td>`;
    tr.querySelectorAll('.icon-btn')[0].onclick = ()=>openCustomerModal(c);
    tr.querySelectorAll('.icon-btn')[1].onclick = ()=>deleteCustomer(c.id);
    tbody.appendChild(tr);
  });
}
document.getElementById('customerSearchInput').addEventListener('input', e=>{
  state.customerSearchTerm = e.target.value;
  renderCustomersView();
});

function openCustomerModal(customer){
  document.getElementById('customerModalTitle').textContent = customer ? 'تعديل عميل' : 'إضافة عميل';
  document.getElementById('editCustomerId').value = customer ? customer.id : '';
  document.getElementById('cName').value = customer?.name || '';
  document.getElementById('cPhone').value = customer?.phone || '';
  openModal('customerModal');
}
document.getElementById('addCustomerBtn').addEventListener('click', ()=>openCustomerModal(null));

document.getElementById('saveCustomerBtn').addEventListener('click', ()=>{
  const name = document.getElementById('cName').value.trim();
  const phone = document.getElementById('cPhone').value.trim();
  if(!name){ showToast('اكتب اسم العميل'); return; }
  const editId = document.getElementById('editCustomerId').value;
  const customers = DB.getCustomers();
  if(editId){
    const idx = customers.findIndex(c=>c.id===editId);
    if(idx>-1) customers[idx] = { ...customers[idx], name, phone };
  } else {
    customers.push({ id: uid('cust'), name, phone, points:0, purchaseCount:0, purchaseTotal:0, createdAt:new Date().toISOString() });
  }
  DB.saveCustomers(customers);
  closeModal('customerModal');
  renderCustomersView();
  showToast('تم حفظ بيانات العميل');
});

function deleteCustomer(id){
  const customers = DB.getCustomers();
  const target = customers.find(c=>c.id===id);
  if(!target) return;
  const debt = customerCreditRemaining(id);
  if(debt > 0.01){ showToast('العميل ده لسه عليه فلوس آجل، مينفعش تمسحه'); return; }
  if(!confirm(`متأكد إنك عاوز تمسح العميل «${target.name}»؟`)) return;
  DB.saveCustomers(customers.filter(c=>c.id!==id));
  if(state.selectedCustomer?.id===id){ state.selectedCustomer = null; renderCart(); }
  renderCustomersView();
  showToast('تم حذف العميل');
}

/* =========================================================
   CREDIT SALES VIEW (البيع الآجل)
   Orders with method==='credit' carry a customer name/phone
   and a `payments` array. Each payment is logged with the
   shift it was collected in, so it counts toward that shift's
   expected cash (see shiftStats below).
   ========================================================= */
state.creditFilter = 'open';

function creditOrders(){
  return DB.getOrders().filter(o=>o.method==='credit');
}

function renderCreditView(){
  const all = creditOrders();
  const outstanding = all.filter(o=>!creditIsSettled(o));
  const outstandingTotal = outstanding.reduce((s,o)=>s+creditRemaining(o), 0);

  document.getElementById('creditOutstandingTotal').textContent = money(outstandingTotal);
  document.getElementById('creditOpenCount').textContent = outstanding.length;

  let list;
  if(state.creditFilter==='open') list = outstanding;
  else if(state.creditFilter==='settled') list = all.filter(o=>creditIsSettled(o));
  else list = all;

  const tbody = document.getElementById('creditTableBody');
  if(!list.length){
    tbody.innerHTML = '<tr><td colspan="8" class="empty-note">مفيش فواتير آجل هنا</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  [...list].reverse().forEach(o=>{
    const dt = new Date(o.date);
    const paid = creditPaidTotal(o);
    const remaining = creditRemaining(o);
    const settled = creditIsSettled(o);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${dt.toLocaleDateString('ar-EG')}</td>
      <td><strong>${escapeHtml(o.customerName||'—')}</strong></td>
      <td class="mono">${escapeHtml(o.customerPhone||'—')}</td>
      <td class="mono">${money(o.total)}</td>
      <td class="mono">${money(paid)}</td>
      <td class="mono">${money(remaining)}</td>
      <td><span class="credit-status ${settled?'settled':'open'}">${settled?'✓ اتسدد':'لسه مديون'}</span></td>
      <td>
        <button class="icon-btn" title="عرض الفاتورة">🧾</button>
        ${settled ? '' : '<button class="icon-btn" title="تسجيل دفعة">💵</button>'}
      </td>`;
    tr.querySelectorAll('.icon-btn')[0].onclick = ()=>showReceipt(o);
    if(!settled) tr.querySelectorAll('.icon-btn')[1].onclick = ()=>openCreditPaymentModal(o.id);
    tbody.appendChild(tr);
  });
}

document.querySelectorAll('#creditFilter .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('#creditFilter .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    state.creditFilter = chip.dataset.cfilter;
    renderCreditView();
  });
});

let creditPaymentOrderId = null;
function openCreditPaymentModal(orderId){
  const order = DB.getOrders().find(o=>o.id===orderId);
  if(!order) return;
  creditPaymentOrderId = orderId;
  const paid = creditPaidTotal(order);
  const remaining = creditRemaining(order);
  document.getElementById('creditPaymentSummary').innerHTML = `
    <div class="sum-row"><span>العميل</span><span class="mono">${escapeHtml(order.customerName||'—')}</span></div>
    <div class="sum-row"><span>إجمالي الفاتورة</span><span class="mono">${money(order.total)}</span></div>
    <div class="sum-row"><span>المدفوع لحد دلوقتي</span><span class="mono">${money(paid)}</span></div>
    <div class="sum-row total-row"><span>المتبقي</span><span class="mono">${money(remaining)}</span></div>`;
  document.getElementById('creditPaymentAmount').value = remaining.toFixed(2);
  document.getElementById('creditPaymentAmount').max = remaining;
  openModal('creditPaymentModal');
}

document.getElementById('confirmCreditPaymentBtn').addEventListener('click', ()=>{
  if(!creditPaymentOrderId) return;
  const orders = DB.getOrders();
  const order = orders.find(o=>o.id===creditPaymentOrderId);
  if(!order) return;
  const remaining = creditRemaining(order);
  let amount = Math.max(0, Number(document.getElementById('creditPaymentAmount').value) || 0);
  if(amount <= 0){ showToast('اكتب مبلغ الدفعة'); return; }
  if(amount > remaining + 0.01){ showToast('المبلغ أكبر من المتبقي على العميل'); return; }
  amount = Math.min(amount, remaining);

  const cashier = AUTH.currentUser();
  const activeShift = getActiveShift();
  order.payments = order.payments || [];
  order.payments.push({
    id: uid('pay'), date: new Date().toISOString(), amount,
    shiftId: activeShift ? activeShift.id : null,
    byId: cashier?.id || null, byName: cashier?.name || ''
  });
  DB.saveOrders(orders);
  closeModal('creditPaymentModal');
  showToast(creditIsSettled(order) ? 'تم سداد الفاتورة بالكامل ✓' : 'تم تسجيل الدفعة');
  renderCreditView();
  refreshShiftBadge();
});

/* =========================================================
   EXPENSES VIEW
   Cash paid out of the drawer during a shift (supplies,
   transport, etc). Counted against the shift's expected cash.
   ========================================================= */
document.getElementById('addExpenseBtn').addEventListener('click', ()=>{
  document.getElementById('eAmount').value = '';
  document.getElementById('eNote').value = '';
  state.editExpenseCat = null;
  document.querySelectorAll('#expenseCatSelect .cat-btn').forEach(b=>b.classList.remove('active'));
  openModal('expenseModal');
});

document.querySelectorAll('#expenseCatSelect .cat-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    state.editExpenseCat = btn.dataset.cat;
    document.querySelectorAll('#expenseCatSelect .cat-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('saveExpenseBtn').addEventListener('click', ()=>{
  const amount = Number(document.getElementById('eAmount').value) || 0;
  const note = document.getElementById('eNote').value.trim();
  if(!state.editExpenseCat){ showToast('اختار نوع المصروف: بضاعة / رواتب / سلف / موردين / أخرى'); return; }
  if(amount <= 0){ showToast('اكتب مبلغ المصروف'); return; }
  if(!note){ showToast('اكتب بيان المصروف'); return; }

  const cashier = AUTH.currentUser();
  const expenses = DB.getExpenses();
  expenses.push({
    id: uid('exp'),
    date: new Date().toISOString(),
    category: state.editExpenseCat,
    amount, note,
    shiftId: getActiveShift() ? getActiveShift().id : null,
    createdBy: cashier?.id || null,
    createdByName: cashier?.name || ''
  });
  DB.saveExpenses(expenses);
  closeModal('expenseModal');
  showToast('تم تسجيل المصروف');
  renderExpenses();
  refreshShiftBadge();
});

document.querySelectorAll('#expenseRange .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('#expenseRange .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    state.expenseRange = chip.dataset.erange;
    renderExpenses();
  });
});

document.querySelectorAll('#expenseCatFilter .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('#expenseCatFilter .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    state.expenseCatFilter = chip.dataset.ecat;
    renderExpenses();
  });
});

function filteredExpenses(){
  let expenses = DB.getExpenses();
  if(state.expenseRange!=='all'){
    const now = new Date();
    const cutDays = state.expenseRange==='today' ? 0 : 30;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - cutDays);
    cutoff.setHours(0,0,0,0);
    expenses = expenses.filter(e => new Date(e.date) >= cutoff);
  }
  if(state.expenseCatFilter!=='all'){
    expenses = expenses.filter(e => (e.category||'other')===state.expenseCatFilter);
  }
  return expenses;
}

function renderExpenses(){
  const expenses = [...filteredExpenses()].reverse();
  const total = expenses.reduce((s,e)=>s+e.amount,0);

  document.getElementById('expTotal').textContent = money(total);
  document.getElementById('expCount').textContent = expenses.length;

  const tbody = document.getElementById('expensesTableBody');
  const isAdmin = AUTH.isAdmin();
  if(!expenses.length){
    tbody.innerHTML = '<tr><td colspan="6" class="empty-note">مفيش مصاريف مسجلة في الفترة دي</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  expenses.forEach(e=>{
    const dt = new Date(e.date);
    const cat = expenseCatInfo(e.category);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${dt.toLocaleDateString('ar-EG')} ${dt.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</td>
      <td><span class="cat-pill ${cat.id}">${cat.icon} ${cat.label}</span></td>
      <td>${escapeHtml(e.note)}</td>
      <td class="mono">${money(e.amount)}</td>
      <td>${escapeHtml(e.createdByName||'—')}</td>
      <td>${isAdmin ? '<button class="icon-btn" title="حذف">🗑️</button>' : ''}</td>`;
    if(isAdmin){
      tr.querySelector('.icon-btn').onclick = ()=>deleteExpense(e.id);
    }
    tbody.appendChild(tr);
  });
}

function deleteExpense(id){
  if(!confirm('متأكد إنك عاوز تمسح المصروف ده؟')) return;
  DB.saveExpenses(DB.getExpenses().filter(e=>e.id!==id));
  renderExpenses();
  refreshShiftBadge();
  showToast('تم حذف المصروف');
}

/* =========================================================
   INVENTORY VIEW
   ========================================================= */
function renderInventory(){
  const products = DB.getProducts();
  const tbody = document.getElementById('inventoryTableBody');
  tbody.innerHTML = '';

  let totalUnits = 0, lowStock = 0, stockValue = 0;

  products.forEach(p=>{
    const stock = totalStock(p);
    totalUnits += stock;
    stockValue += stock * (p.cost||0);
    if(stock>0 && stock<=3) lowStock++;

    const sizeTags = p.variants.map(v=>
      `<span class="size-tag ${v.qty<=2?'low':''}">${escapeHtml(v.size)}${v.color?'·'+escapeHtml(v.color):''}: ${v.qty}</span>`
    ).join('');

    const g = groupInfo(p.group);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(p.name)}</strong><br><span style="color:var(--text-dim);font-size:11.5px;">${escapeHtml(p.sku||'')}</span></td>
      <td>${g ? g.icon+' '+g.label : '—'}</td>
      <td>${escapeHtml(p.brand||'—')}</td>
      <td>${escapeHtml(p.category||'—')}</td>
      <td><div class="size-tags">${sizeTags || '—'}</div></td>
      <td class="mono">${money(p.price)}</td>
      <td class="mono">${stock}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="تعديل">✏️</button>
          <button class="icon-btn" title="حذف">🗑️</button>
        </div>
      </td>`;
    tr.querySelector('[title="تعديل"]').onclick = ()=>openProductModal(p);
    tr.querySelector('[title="حذف"]').onclick = ()=>{
      if(confirm('تأكيد حذف "'+p.name+'"؟')){
        DB.saveProducts(DB.getProducts().filter(x=>x.id!==p.id));
        renderInventory();
      }
    };
    tbody.appendChild(tr);
  });

  document.getElementById('statTotalProducts').textContent = products.length;
  document.getElementById('statTotalUnits').textContent = totalUnits;
  document.getElementById('statLowStock').textContent = lowStock;
  document.getElementById('statStockValue').textContent = money(stockValue);
}

/* ---- Product modal (add / edit) ---- */
document.getElementById('addProductBtn').addEventListener('click', ()=>openProductModal(null));

document.querySelectorAll('#groupSelect .group-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    state.editGroup = btn.dataset.group;
    document.querySelectorAll('#groupSelect .group-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function openProductModal(product){
  document.getElementById('productModalTitle').textContent = product ? 'تعديل الصنف' : 'إضافة صنف جديد';
  document.getElementById('editProductId').value = product ? product.id : '';
  state.editGroup = product?.group || null;
  document.querySelectorAll('#groupSelect .group-btn').forEach(b=>
    b.classList.toggle('active', b.dataset.group===state.editGroup));
  document.getElementById('fName').value = product?.name || '';
  document.getElementById('fBrand').value = product?.brand || '';
  document.getElementById('fCategory').value = product?.category || '';
  document.getElementById('fSku').value = product?.sku || '';
  document.getElementById('fCost').value = product?.cost || '';
  document.getElementById('fPrice').value = product?.price || '';

  state.editVariantRows = product ? product.variants.map(v=>({...v})) : [{id:uid('v'), size:'', color:'', qty:0}];
  renderVariantRows();
  openModal('productModal');
}

function renderVariantRows(){
  const wrap = document.getElementById('variantRows');
  wrap.innerHTML = '';
  state.editVariantRows.forEach((v,idx)=>{
    const row = document.createElement('div');
    row.className = 'variant-row';
    row.innerHTML = `
      <input type="text" placeholder="المقاس (مثال 42)" value="${escapeHtml(v.size)}" data-f="size">
      <input type="text" placeholder="اللون" value="${escapeHtml(v.color)}" data-f="color">
      <input type="number" min="0" class="mono-input" placeholder="الكمية" value="${v.qty}" data-f="qty">
      <button class="variant-remove" title="حذف">✕</button>`;
    row.querySelector('[data-f="size"]').oninput = e=>v.size=e.target.value;
    row.querySelector('[data-f="color"]').oninput = e=>v.color=e.target.value;
    row.querySelector('[data-f="qty"]').oninput = e=>v.qty=Number(e.target.value)||0;
    row.querySelector('.variant-remove').onclick = ()=>{
      state.editVariantRows.splice(idx,1);
      renderVariantRows();
    };
    wrap.appendChild(row);
  });
}

document.getElementById('addVariantRow').addEventListener('click', ()=>{
  state.editVariantRows.push({id:uid('v'), size:'', color:'', qty:0});
  renderVariantRows();
});

document.getElementById('saveProductBtn').addEventListener('click', ()=>{
  const name = document.getElementById('fName').value.trim();
  if(!name){ showToast('اكتب اسم الصنف'); return; }
  if(!state.editGroup){ showToast('اختار القسم: رجالي / حريمي / أطفال'); return; }
  const price = Number(document.getElementById('fPrice').value)||0;
  const cost = Number(document.getElementById('fCost').value)||0;

  const variants = state.editVariantRows
    .filter(v=>v.size.trim()!=='')
    .map(v=>({id:v.id||uid('v'), size:v.size.trim(), color:v.color.trim()||'—', qty:Math.max(0,v.qty||0)}));

  const editId = document.getElementById('editProductId').value;
  const products = DB.getProducts();

  if(editId){
    const idx = products.findIndex(p=>p.id===editId);
    products[idx] = { ...products[idx], name, group:state.editGroup, brand:document.getElementById('fBrand').value.trim(),
      category:document.getElementById('fCategory').value.trim(), sku:document.getElementById('fSku').value.trim(),
      cost, price, variants };
  } else {
    products.push({
      id: uid('p'), name, group:state.editGroup, brand:document.getElementById('fBrand').value.trim(),
      category:document.getElementById('fCategory').value.trim(), sku:document.getElementById('fSku').value.trim(),
      cost, price, variants
    });
  }
  DB.saveProducts(products);
  closeModal('productModal');
  renderInventory();
  showToast('تم حفظ الصنف');
});

/* =========================================================
   REPORTS VIEW
   ========================================================= */
document.querySelectorAll('.report-range .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('.report-range .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    state.reportRange = chip.dataset.range;
    renderReports();
  });
});

function filteredOrders(){
  const orders = DB.getOrders();
  if(state.reportRange==='all') return orders;
  const now = new Date();
  const cutDays = state.reportRange==='today' ? 0 : state.reportRange==='week' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - cutDays);
  cutoff.setHours(0,0,0,0);
  return orders.filter(o=> new Date(o.date) >= cutoff);
}

/* Same date-range logic as filteredOrders(), applied to expenses,
   so "net profit" in the reports view lines up with the same period. */
function expensesForReportRange(){
  const expenses = DB.getExpenses();
  if(state.reportRange==='all') return expenses;
  const now = new Date();
  const cutDays = state.reportRange==='today' ? 0 : state.reportRange==='week' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - cutDays);
  cutoff.setHours(0,0,0,0);
  return expenses.filter(e=> new Date(e.date) >= cutoff);
}

function renderReports(){
  const orders = filteredOrders();
  const revenue = orders.reduce((s,o)=>s+o.total,0);
  const units = orders.reduce((s,o)=>s+o.items.reduce((a,i)=>a+i.qty,0),0);
  const cost = orders.reduce((s,o)=>s+(o.cost||0),0);
  const expensesTotal = expensesForReportRange().reduce((s,e)=>s+e.amount,0);
  const profit = revenue - cost - expensesTotal;

  document.getElementById('repRevenue').textContent = money(revenue);
  document.getElementById('repOrders').textContent = orders.length;
  document.getElementById('repUnits').textContent = units;
  document.getElementById('repExpenses').textContent = money(expensesTotal);
  document.getElementById('repProfit').textContent = money(profit);
  document.getElementById('repProfitCard').classList.toggle('warn', profit < 0);
  document.getElementById('repProfitCard').classList.toggle('good', profit >= 0);

  renderDailyChart(orders);
  renderTopProducts(orders);
  renderOrdersTable(orders);
}

function renderDailyChart(orders){
  const days = {};
  const dayCount = state.reportRange==='today' ? 1 : state.reportRange==='week' ? 7 : state.reportRange==='month' ? 30 : 14;
  for(let i=dayCount-1;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate()-i);
    const key = d.toISOString().slice(0,10);
    days[key] = 0;
  }
  orders.forEach(o=>{
    const key = new Date(o.date).toISOString().slice(0,10);
    if(key in days) days[key]+=o.total;
  });
  const maxVal = Math.max(1, ...Object.values(days));
  const chart = document.getElementById('dailyChart');
  chart.innerHTML = '';
  Object.entries(days).forEach(([key,val])=>{
    const d = new Date(key);
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `
      <span class="bar-val">${val>0?Math.round(val):''}</span>
      <div class="bar" style="height:${Math.max(3,(val/maxVal)*120)}px"></div>
      <span class="bar-label">${d.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'})}</span>`;
    chart.appendChild(col);
  });
}

function renderTopProducts(orders){
  const counts = {};
  orders.forEach(o=>o.items.forEach(it=>{
    counts[it.name] = (counts[it.name]||0) + it.qty;
  }));
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const list = document.getElementById('topProductsList');
  if(!sorted.length){
    list.innerHTML = '<div class="empty-note">مفيش مبيعات في الفترة دي</div>';
    return;
  }
  list.innerHTML = '';
  sorted.forEach(([name,qty],idx)=>{
    const row = document.createElement('div');
    row.className = 'top-row';
    row.innerHTML = `
      <span class="top-rank">${idx+1}</span>
      <span class="top-name">${escapeHtml(name)}</span>
      <span class="top-count">${qty} قطعة</span>`;
    list.appendChild(row);
  });
}

function renderOrdersTable(orders){
  const tbody = document.getElementById('ordersTableBody');
  if(!orders.length){
    tbody.innerHTML = '<tr><td colspan="6" class="empty-note">مفيش فواتير في الفترة دي</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  [...orders].reverse().forEach(o=>{
    const dt = new Date(o.date);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">#${o.number}</td>
      <td>${dt.toLocaleDateString('ar-EG')} ${dt.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</td>
      <td class="mono">${o.items.reduce((a,i)=>a+i.qty,0)}</td>
      <td class="mono">${money(o.total)}</td>
      <td>${paymentMethodLabel(o.method)}</td>
      <td><button class="icon-btn" title="عرض الفاتورة">🧾</button></td>`;
    tr.querySelector('.icon-btn').onclick = ()=>showReceipt(o);
    tbody.appendChild(tr);
  });
}

/* =========================================================
   SETTINGS VIEW
   ========================================================= */
function loadSettingsForm(){
  const s = DB.getSettings();
  document.getElementById('setStoreName').value = s.storeName;
  document.getElementById('setStoreInfo').value = s.storeInfo;
  document.getElementById('setTaxRate').value = s.taxRate;
  document.getElementById('setPointsRate').value = s.pointsPerCurrency || 0;
}

document.getElementById('saveSettingsBtn').addEventListener('click', ()=>{
  const s = {
    storeName: document.getElementById('setStoreName').value.trim() || 'محل الأحذية',
    storeInfo: document.getElementById('setStoreInfo').value.trim(),
    taxRate: Number(document.getElementById('setTaxRate').value)||0,
    pointsPerCurrency: Math.max(0, Number(document.getElementById('setPointsRate').value)||0)
  };
  DB.saveSettings(s);
  document.getElementById('storeNameLabel').textContent = s.storeName;
  showToast('تم حفظ الإعدادات');
});

document.getElementById('resetDataBtn').addEventListener('click', ()=>{
  if(confirm('متأكد؟ هيتم مسح كل الأصناف والفواتير نهائيًا.')){
    localStorage.removeItem(DB.KEYS.PRODUCTS);
    localStorage.removeItem(DB.KEYS.ORDERS);
    seedIfEmpty();
    state.salesStep = 'groups';
    state.selectedGroup = null;
    state.selectedSize = null;
    renderSales();
    renderInventory();
    showToast('تم تصفير البيانات');
  }
});

/* =========================================================
   USERS (settings, admin only)
   ========================================================= */
function renderUsersTable(){
  const users = DB.getUsers();
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';
  users.forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.name)}</strong></td>
      <td class="mono">${escapeHtml(u.username)}</td>
      <td><span class="role-pill ${u.role}">${u.role==='admin'?'👑 أدمن':'🧾 كاشير'}</span></td>
      <td><button class="icon-btn" title="تعديل">✏️</button> <button class="icon-btn" title="حذف">🗑️</button></td>`;
    tr.querySelectorAll('.icon-btn')[0].onclick = ()=>openUserModal(u);
    tr.querySelectorAll('.icon-btn')[1].onclick = ()=>deleteUser(u.id);
    tbody.appendChild(tr);
  });
}

function openUserModal(user){
  document.getElementById('userModalTitle').textContent = user ? 'تعديل مستخدم' : 'إضافة مستخدم';
  document.getElementById('editUserId').value = user ? user.id : '';
  document.getElementById('uName').value = user?.name || '';
  document.getElementById('uUsername').value = user?.username || '';
  document.getElementById('uPassword').value = user?.password || '';
  state.editUserRole = user?.role || 'cashier';
  document.querySelectorAll('#roleSelect .group-btn').forEach(b=>
    b.classList.toggle('active', b.dataset.role===state.editUserRole));
  openModal('userModal');
}
document.getElementById('addUserBtn').addEventListener('click', ()=>openUserModal(null));

document.querySelectorAll('#roleSelect .group-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    state.editUserRole = btn.dataset.role;
    document.querySelectorAll('#roleSelect .group-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('saveUserBtn').addEventListener('click', ()=>{
  const name = document.getElementById('uName').value.trim();
  const username = document.getElementById('uUsername').value.trim();
  const password = document.getElementById('uPassword').value;
  if(!name){ showToast('اكتب اسم المستخدم'); return; }
  if(!username){ showToast('اكتب اسم الدخول (username)'); return; }
  if(!password){ showToast('اكتب كلمة مرور'); return; }
  if(!state.editUserRole){ showToast('اختار الصلاحية: أدمن ولا كاشير'); return; }

  const editId = document.getElementById('editUserId').value;
  const users = DB.getUsers();

  const usernameTaken = users.some(u=>u.username.toLowerCase()===username.toLowerCase() && u.id!==editId);
  if(usernameTaken){ showToast('اسم الدخول ده مستخدم قبل كده'); return; }

  if(editId){
    const idx = users.findIndex(u=>u.id===editId);
    // Don't allow demoting/removing the very last admin account
    if(users[idx].role==='admin' && state.editUserRole!=='admin'){
      const otherAdmins = users.filter(u=>u.role==='admin' && u.id!==editId);
      if(!otherAdmins.length){ showToast('لازم يفضل أدمن واحد على الأقل'); return; }
    }
    users[idx] = { ...users[idx], name, username, password, role: state.editUserRole };
  } else {
    users.push({ id: uid('u'), name, username, password, role: state.editUserRole });
  }
  DB.saveUsers(users);
  closeModal('userModal');
  renderUsersTable();
  showToast('تم حفظ المستخدم');

  // If the currently logged-in user edited themself, refresh the sidebar
  if(editId && AUTH.currentUser()?.id===editId) applyRoleUI();
});

function deleteUser(id){
  const users = DB.getUsers();
  const target = users.find(u=>u.id===id);
  if(!target) return;
  if(target.role==='admin' && users.filter(u=>u.role==='admin').length<=1){
    showToast('لازم يفضل أدمن واحد على الأقل'); return;
  }
  if(AUTH.currentUser()?.id===id){
    showToast('مينفعش تمسح المستخدم اللي داخل بيه دلوقتي'); return;
  }
  if(!confirm(`متأكد إنك عاوز تمسح المستخدم «${target.name}»؟`)) return;
  DB.saveUsers(users.filter(u=>u.id!==id));
  renderUsersTable();
  showToast('تم حذف المستخدم');
}

/* =========================================================
   INIT
   ========================================================= */
(function init(){
  const settings = DB.getSettings();
  document.getElementById('storeNameLabel').textContent = settings.storeName;
  document.getElementById('loginStoreLabel').textContent = settings.storeName;
  renderSales();
  renderCart();
  if(checkLoginGate()) checkShiftGate();
})();
