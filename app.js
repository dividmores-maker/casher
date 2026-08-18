/* =========================================================
   كاشير محل الأحذية — منطق التطبيق
   البيانات متخزنة محليًا (localStorage) دلوقتي.
   لاحقًا: استبدال طبقة DB.* دي بنداءات Firestore بسهولة
   لأن كل القراءة/الكتابة بتمر من هنا بس.
   ========================================================= */

const DB = {
  KEYS: { PRODUCTS: 'pos_products', ORDERS: 'pos_orders', SETTINGS: 'pos_settings', SHIFTS: 'pos_shifts', USERS: 'pos_users', EXPENSES: 'pos_expenses', CUSTOMERS: 'pos_customers', SUPPLIERS: 'pos_suppliers', PURCHASES: 'pos_purchases', WORKERS: 'pos_workers', WORKER_TXNS: 'pos_worker_txns', WORKER_VACATIONS: 'pos_worker_vacations' },

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

  getSuppliers(){ return JSON.parse(localStorage.getItem(this.KEYS.SUPPLIERS) || '[]'); },
  saveSuppliers(list){ localStorage.setItem(this.KEYS.SUPPLIERS, JSON.stringify(list)); },

  getPurchases(){ return JSON.parse(localStorage.getItem(this.KEYS.PURCHASES) || '[]'); },
  savePurchases(list){ localStorage.setItem(this.KEYS.PURCHASES, JSON.stringify(list)); },

  getWorkers(){ return JSON.parse(localStorage.getItem(this.KEYS.WORKERS) || '[]'); },
  saveWorkers(list){ localStorage.setItem(this.KEYS.WORKERS, JSON.stringify(list)); },
  getWorkerTxns(){ return JSON.parse(localStorage.getItem(this.KEYS.WORKER_TXNS) || '[]'); },
  saveWorkerTxns(list){ localStorage.setItem(this.KEYS.WORKER_TXNS, JSON.stringify(list)); },
  getWorkerVacations(){ return JSON.parse(localStorage.getItem(this.KEYS.WORKER_VACATIONS) || '[]'); },
  saveWorkerVacations(list){ localStorage.setItem(this.KEYS.WORKER_VACATIONS, JSON.stringify(list)); },

  getSettings(){
    const s = JSON.parse(localStorage.getItem(this.KEYS.SETTINGS) || 'null') || {
      storeName: 'محل الأحذية', storeInfo: '', taxRate: 0, pointsPerCurrency: 0,
      lowStockAlertsOn: true, lowStockThreshold: 3, cardFeeRate: 1.5
    };
    // Default invoice-content toggles for stores saved before this feature existed
    s.invoiceFields = Object.assign({
      storeInfo: true, cashier: true, discount: true, paymentMethod: true,
      customerInfo: true, customerPhone: true, points: true, thankYou: true
    }, s.invoiceFields || {});
    // Sequential product barcode counter — next number to hand out. Kept
    // separate from products.sku so it isn't thrown off by old-style
    // long/random codes that may already be saved on existing items.
    s.nextSkuNumber = Number(s.nextSkuNumber) > 0 ? Number(s.nextSkuNumber) : 1;
    // Visa/card fee percentage — configurable, defaults to 1.5% for stores saved before this existed
    if(s.cardFeeRate === undefined || s.cardFeeRate === null || isNaN(Number(s.cardFeeRate))) s.cardFeeRate = 1.5;
    return s;
  },
  saveSettings(s){ localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(s)); }
};

function uid(prefix){ return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function paymentMethodLabel(method){
  return method==='cash' ? 'كاش' : method==='credit' ? 'بيع بالأجل' : method==='transfer' ? 'تحويلات' : 'بطاقة';
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
/* ---- Auto customer code (e.g. C-0001) ----
   Sequential per-customer code, generated once at creation and kept
   forever — used on the customer list, the invoice/receipt, and anywhere
   else the customer needs to be referenced quickly (e.g. by a supplier
   note or an expense related to them). Based on the highest existing
   code number so it stays unique even if a customer was deleted. */
function nextCustomerCode(){
  const customers = DB.getCustomers();
  let max = 0;
  customers.forEach(c=>{
    const m = /^C-(\d+)$/.exec(c.code || '');
    if(m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'C-' + String(max + 1).padStart(4, '0');
}
/* One-time repair: assign a code to any customer created before this
   feature existed. Runs once at startup; a no-op afterwards. */
function ensureCustomerCodes(){
  const customers = DB.getCustomers();
  let changed = false;
  customers.forEach(c=>{
    if(!c.code){ c.code = nextCustomerCode(); changed = true; }
  });
  if(changed) DB.saveCustomers(customers);
}
function customerCodeLabel(c){
  return c?.code ? c.code : '—';
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
    if(!existing.contacts) existing.contacts = [];
    return existing;
  }
  const created = { id: uid('cust'), code: nextCustomerCode(), name, phone, points:0, purchaseCount:0, purchaseTotal:0, contacts:[], createdAt:new Date().toISOString() };
  customers.push(created);
  DB.saveCustomers(customers);
  return created;
}
/* Remember the specific person (name + phone) who received an invoice under a
   company, so the cashier can quickly re-pick them next time. Dedupes by
   phone when given, otherwise by name. */
function addContactToCustomer(customerId, contactName, contactPhone){
  contactName = (contactName||'').trim();
  contactPhone = (contactPhone||'').trim();
  if(!customerId || !contactName) return;
  const customers = DB.getCustomers();
  const customer = customers.find(c=>c.id===customerId);
  if(!customer) return;
  if(!customer.contacts) customer.contacts = [];
  let existing = null;
  if(contactPhone) existing = customer.contacts.find(p=>p.phone && p.phone===contactPhone);
  if(!existing) existing = customer.contacts.find(p=>p.name.trim().toLowerCase()===contactName.toLowerCase());
  if(existing){
    if(contactPhone && !existing.phone) existing.phone = contactPhone;
  } else {
    customer.contacts.push({ name: contactName, phone: contactPhone });
  }
  DB.saveCustomers(customers);
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
/* تسوية النقاط — spend some of a customer's loyalty points as a discount.
   Value of 1 point = pointsRate() currency (same rate used to earn points). */
function pointsToCurrency(points){
  return Math.max(0, points||0) * pointsRate();
}
function redeemPointsFromCustomer(customerId, points){
  if(!customerId || !points) return 0;
  const customers = DB.getCustomers();
  const customer = customers.find(c=>c.id===customerId);
  if(!customer) return 0;
  const redeemed = Math.max(0, Math.min(Math.floor(points), customer.points||0));
  customer.points = Math.max(0, (customer.points||0) - redeemed);
  DB.saveCustomers(customers);
  return redeemed;
}
function resetPointsRedemption(){
  state.pointsRedeemed = 0;
  state.pointsRedeemedCustomerId = null;
}
function customerCreditRemaining(customerId){
  return creditOrders()
    .filter(o=>o.customerId===customerId && !creditIsSettled(o))
    .reduce((s,o)=>s+creditRemaining(o), 0);
}

/* One-time repair: earlier versions saved the order to storage BEFORE
   stamping pointsEarned on it, so historical invoices show "—" for points
   even though the company's total points are correct. Backfill a
   best-effort estimate (using today's points rate) for any order that's
   missing the field, so the per-invoice column isn't stuck empty forever. */
function repairMissingOrderPoints(){
  const rate = pointsRate();
  if(rate <= 0) return;
  const orders = DB.getOrders();
  let changed = false;
  orders.forEach(o=>{
    if(o.customerId && !Object.prototype.hasOwnProperty.call(o, 'pointsEarned')){
      o.pointsEarned = pointsForAmount(o.total);
      changed = true;
    }
  });
  if(changed) DB.saveOrders(orders);
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
repairMissingOrderPoints();

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

/* ---------- Global state ---------- */
let state = {
  view: 'sales',
  cart: [],       // {productId, variantId, name, size, color, price, qty}
  salesStep: 'groups',    // 'groups' | 'products' | 'colors' | 'sizes'
  selectedGroup: null,
  selectedProductId: null,
  selectedColor: null,
  searchTerm: '',
  reportRange: 'today',
  editPurchaseItems: [], // used while purchase modal open
  editSizeGroups: [], // used while product modal open
  editGroup: null,      // used while product modal open
  editUserRole: null,    // used while user modal open
  selectedCustomer: null,   // company attached to the current cart, if any
  selectedContact: null,    // {name, phone} — the specific person receiving this invoice, under selectedCustomer
  customerSearchTerm: '',
  customerPickerSearchTerm: '',
  purchaseFilter: 'open',
  pointsRedeemed: 0,          // points being used as a discount on the current cart (تسوية النقاط)
  pointsRedeemedCustomerId: null   // which customer those points belong to
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
  const transferTotal = orders.filter(o=>o.method==='transfer').reduce((s,o)=>s+o.total,0);
  const creditTotal = orders.filter(o=>o.method==='credit').reduce((s,o)=>s+o.total,0);
  const expensesTotal = shiftExpenses(shift.id).reduce((s,e)=>s+e.amount,0);
  const creditCollected = shiftCreditCollected(shift.id);
  const cardFeeRate = Math.max(0, Number(DB.getSettings().cardFeeRate) || 0) / 100; // نسبة رسوم الفيزا القابلة للتعديل من الإعدادات
  const cardFee = cardTotal * cardFeeRate;
  const cardNet = cardTotal - cardFee;
  return { ordersCount: orders.length, salesTotal, cashTotal, cardTotal, transferTotal, creditTotal, expensesTotal, creditCollected, cardFee, cardNet, cardFeeRate: cardFeeRate*100 };
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
    checkLowStockAndNotify();
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
  state.salesStep='groups'; state.selectedGroup=null; state.selectedProductId=null; state.selectedColor=null; state.searchTerm='';
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
    <div class="sum-row"><span>رأس المال (بدأت بيه الوردية)</span><span class="mono">${money(active.openingCash)}</span></div>
    <div class="sum-row"><span>المدة</span><span class="mono">${fmtDuration(active.openedAt)}</span></div>
    <div class="sum-row"><span>عدد الفواتير</span><span class="mono">${stats.ordersCount}</span></div>
    <div class="sum-row"><span>مبيعات كاش</span><span class="mono">${money(stats.cashTotal)}</span></div>
    <div class="sum-row"><span>مبيعات تحويلات</span><span class="mono">${money(stats.transferTotal)}</span></div>
    <div class="sum-row"><span>إجمالي مبيعات فيزا</span><span class="mono">${money(stats.cardTotal)}</span></div>
    <div class="sum-row"><span>رسوم الفيزا (${stats.cardFeeRate}%)</span><span class="mono">- ${money(stats.cardFee)}</span></div>
    <div class="sum-row"><span>صافي الفيزا بعد الرسوم</span><span class="mono">${money(stats.cardNet)}</span></div>
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

/* ---- Shift receipt (printable, reuses the same .receipt look as invoices) ---- */
function buildShiftReceiptHtml(shift, stats, closingCash){
  const settings = DB.getSettings();
  const inv = settings.invoiceFields;
  const expectedCash = shift.openingCash + stats.cashTotal + stats.creditCollected - stats.expensesTotal;
  const diff = Math.round((closingCash - expectedCash)*100)/100;
  const cashier = AUTH.currentUser();
  let html = `
    <div class="receipt-title">${escapeHtml(settings.storeName)}</div>
    ${inv.storeInfo ? `<div class="receipt-sub">${escapeHtml(settings.storeInfo||'')}</div>` : ''}
    <div class="receipt-sub" style="font-weight:700;">🔴 فاتورة إنهاء وردية</div>
    <div class="receipt-hr"></div>
    <div class="receipt-line"><span>بدأت الساعة</span><span>${fmtDT(shift.openedAt)}</span></div>
    <div class="receipt-line"><span>اتقفلت الساعة</span><span>${fmtDT(shift.closedAt)}</span></div>
    <div class="receipt-line"><span>المدة</span><span>${fmtDuration(shift.openedAt, shift.closedAt)}</span></div>
    ${(inv.cashier && cashier?.name) ? `<div class="receipt-line"><span>الكاشير</span><span>${escapeHtml(cashier.name)}</span></div>` : ''}
    <div class="receipt-hr"></div>
    <div class="receipt-line"><span>رأس المال (بدأت بيه الوردية)</span><span>${money(shift.openingCash)}</span></div>
    <div class="receipt-line"><span>عدد الفواتير</span><span>${stats.ordersCount}</span></div>
    <div class="receipt-line"><span>مبيعات كاش</span><span>${money(stats.cashTotal)}</span></div>
    <div class="receipt-line"><span>مبيعات تحويلات</span><span>${money(stats.transferTotal)}</span></div>
    <div class="receipt-line"><span>إجمالي مبيعات فيزا</span><span>${money(stats.cardTotal)}</span></div>
    <div class="receipt-line"><span>رسوم الفيزا (${stats.cardFeeRate}%)</span><span>- ${money(stats.cardFee)}</span></div>
    <div class="receipt-line"><span>صافي الفيزا بعد الرسوم</span><span>${money(stats.cardNet)}</span></div>
    <div class="receipt-line"><span>مبيعات بالأجل</span><span>${money(stats.creditTotal)}</span></div>
    <div class="receipt-line"><span>تحصيل نقدي من الآجل</span><span>${money(stats.creditCollected)}</span></div>
    <div class="receipt-line"><span>مصاريف الوردية</span><span>${money(stats.expensesTotal)}</span></div>
    <div class="receipt-hr"></div>
    <div class="receipt-line"><strong>الكاش المتوقع بالدرج</strong><strong>${money(expectedCash)}</strong></div>
    <div class="receipt-line"><strong>الكاش الفعلي (بعد العد)</strong><strong>${money(closingCash)}</strong></div>
    <div class="receipt-line"><strong>${diff<0?'عجز الدرج':diff>0?'زيادة الدرج':'الفرق'}</strong><strong>${Math.abs(diff)<0.01?'مطابق ✓':money(Math.abs(diff))}</strong></div>`;
  if(inv.thankYou){
    html += `<div class="receipt-sub" style="margin-top:10px;">إجمالي مبيعات الوردية: ${money(stats.salesTotal)} ج.م</div>`;
  }
  return html;
}
function showShiftReceipt(shift){
  const stats = shiftStats(shift);
  const closingCash = shift.closingCash != null ? shift.closingCash : (shift.openingCash + stats.cashTotal + stats.creditCollected - stats.expensesTotal);
  document.getElementById('receiptContent').innerHTML = buildShiftReceiptHtml(shift, stats, closingCash);
  openModal('receiptModal');
}

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
  showShiftReceipt(shifts[idx]);
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
          <div style="display:flex;align-items:center;gap:8px;">
            ${statusBadge}
            ${s.status==='closed' ? `<button class="icon-btn shift-log-print-btn" title="طباعة فاتورة الوردية">🖨️</button>` : ''}
          </div>
        </div>
        <div class="shift-log-grid">
          <div><span>المدة</span><strong>${fmtDuration(s.openedAt, s.closedAt)}</strong></div>
          <div><span>الفواتير</span><strong>${stats.ordersCount}</strong></div>
          <div><span>المبيعات</span><strong>${money(stats.salesTotal)}</strong></div>
          <div><span>المصاريف</span><strong>${money(stats.expensesTotal)}</strong></div>
          <div><span>افتتاحي</span><strong>${money(s.openingCash)}</strong></div>
          ${s.status==='closed' ? `<div><span>ختامي</span><strong>${money(s.closingCash)}</strong></div>` : ''}
        </div>`;
      if(s.status==='closed'){
        row.querySelector('.shift-log-print-btn').addEventListener('click', (ev)=>{
          ev.stopPropagation();
          showShiftReceipt(s);
        });
      }
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
    const leavingUnfinishedSale = state.view==='sales' && view!=='sales' && (state.cart.length>0 || state.selectedCustomer);
    state.view = view;
    document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
    document.getElementById('view-'+view).classList.remove('hidden');
    if(view==='inventory') renderInventory();

    if(view==='customers') renderCustomersView();
    if(view==='credit') renderCreditView();
    if(view==='purchases') renderPurchasesView();
    if(view==='workers') renderWorkersView();
    if(view==='reports') renderReports();
    if(view==='settings'){ loadSettingsForm(); renderUsersTable(); }
    if(view==='sales') renderSales();
    // Leaving an unfinished invoice behind on the sales page? Wipe it now that
    // view-sales is hidden, so nothing shifts in the visible panel mid-click.
    if(leavingUnfinishedSale){
      resetSaleCart();
      renderCart();
    }
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

/* ---- Sales dispatcher: search overrides the group/product/color/size drill-down ---- */
function renderSales(){
  renderSalesBreadcrumb();
  const term = state.searchTerm.trim();
  if(term){ renderSearchResults(term); return; }
  if(state.salesStep==='products') renderGroupProductCards();
  else if(state.salesStep==='colors') renderProductColorCards();
  else if(state.salesStep==='sizes') renderProductSizeCards();
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
  const g = groupInfo(state.selectedGroup);
  const product = state.selectedProductId ? DB.getProducts().find(p=>p.id===state.selectedProductId) : null;

  if(state.salesStep==='products'){
    trail.innerHTML = `${g.icon} <strong>${g.label}</strong> — اختار الصنف`;
    back.onclick = ()=>{ state.salesStep='groups'; state.selectedGroup=null; renderSales(); };
  } else if(state.salesStep==='colors'){
    trail.innerHTML = `${g.icon} <strong>${g.label}</strong> — <strong>${escapeHtml(product?.name||'')}</strong> — اختار اللون`;
    back.onclick = ()=>{ state.salesStep='products'; state.selectedProductId=null; renderSales(); };
  } else if(state.salesStep==='sizes'){
    trail.innerHTML = `${g.icon} <strong>${g.label}</strong> — <strong>${escapeHtml(product?.name||'')}</strong> — لون <strong>${escapeHtml(state.selectedColor)}</strong> — اختار المقاس`;
    back.onclick = ()=>{ state.salesStep='colors'; state.selectedColor=null; renderSales(); };
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
    card.onclick = ()=>{ state.selectedGroup=g.id; state.salesStep='products'; renderSales(); };
    grid.appendChild(card);
  });
}

/* Level 2: الأصناف المتاحة في القسم ده */
function renderGroupProductCards(){
  const grid = document.getElementById('productGrid');
  grid.className = 'product-grid';
  grid.innerHTML = '';
  const products = DB.getProducts().filter(p=>p.group===state.selectedGroup);

  if(!products.length){
    grid.innerHTML = '<div class="no-results">مفيش أصناف مسجلة في القسم ده لسه. أضف أصناف من المخزون.</div>';
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
    card.onclick = ()=>{ state.selectedProductId=p.id; state.salesStep='colors'; renderSales(); };
    grid.appendChild(card);
  });
}

/* Level 3: الألوان المتاحة للصنف ده */
function renderProductColorCards(){
  const grid = document.getElementById('productGrid');
  grid.className = 'product-grid size-grid';
  grid.innerHTML = '';
  const product = DB.getProducts().find(p=>p.id===state.selectedProductId);
  if(!product){ state.salesStep='groups'; renderSales(); return; }

  const colorStock = {};
  product.variants.forEach(v=>{
    colorStock[v.color] = (colorStock[v.color]||0) + v.qty;
  });
  const colors = Object.keys(colorStock);

  if(!colors.length){
    grid.innerHTML = '<div class="no-results">مفيش ألوان مسجلة للصنف ده لسه.</div>';
    return;
  }
  colors.forEach(color=>{
    const stock = colorStock[color];
    const card = document.createElement('div');
    card.className = 'size-card';
    card.innerHTML = `
      <div class="size-card-num">${escapeHtml(color)}</div>
      <div class="size-card-count ${stock<=3?'low':''}">${stock>0 ? stock+' قطعة' : 'خلص'}</div>`;
    card.onclick = ()=>{ state.selectedColor=color; state.salesStep='sizes'; renderSales(); };
    grid.appendChild(card);
  });
}

/* Level 4: المقاسات المتاحة بالصنف واللون ده */
function renderProductSizeCards(){
  const grid = document.getElementById('productGrid');
  grid.className = 'product-grid size-grid';
  grid.innerHTML = '';
  const product = DB.getProducts().find(p=>p.id===state.selectedProductId);
  if(!product){ state.salesStep='groups'; renderSales(); return; }

  const variants = product.variants.filter(v=>v.color===state.selectedColor);
  if(!variants.length){
    grid.innerHTML = '<div class="no-results">مفيش مقاسات مسجلة باللون ده.</div>';
    return;
  }
  variants.forEach(v=>{
    const card = document.createElement('div');
    card.className = 'size-card' + (v.qty<=0 ? ' disabled' : '');
    card.innerHTML = `
      <div class="size-card-num mono">${escapeHtml(v.size)}</div>
      <div class="size-card-count ${v.qty<=3?'low':''}">${v.qty>0 ? v.qty+' قطعة' : 'خلص'}</div>`;
    if(v.qty>0) card.onclick = ()=>addToCart(product, v);
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

  // Barcode is per-item (product), not per size/color — match the product's
  // own code, then let the user pick the size/color from the picker.
  const products = DB.getProducts();
  const product = products.find(p => (p.sku||'').trim().toLowerCase() === code.toLowerCase());

  if(!product){
    barcodeFeedback.innerHTML = `<div class="barcode-msg error">✕ مفيش صنف بالكود «${escapeHtml(code)}»</div>`;
    return;
  }

  const available = product.variants.filter(v=>v.qty>0);

  if(!available.length){
    barcodeFeedback.innerHTML = `<div class="barcode-msg error">⚠ «${escapeHtml(product.name)}» خلص من المخزون</div>`;
    return;
  }

  // Always let the user pick the size/color after a scan, even if only
  // one variant is currently in stock.
  barcodeFeedback.innerHTML = `<div class="barcode-msg success">✓ لقيت الصنف: ${escapeHtml(product.name)} — دلوقتي اختار المقاس واللون</div>`;
  closeModal('barcodeModal');
  openPicker(product);
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

// Wipes the current invoice (cart, company/متعامل, contact/العميل, points redemption, discount)
// so a fresh sale can start from a totally blank slate.
function resetSaleCart(){
  state.cart = [];
  state.selectedCustomer = null;
  state.selectedContact = null;
  resetPointsRedemption();
  const discountEl = document.getElementById('discountInput');
  if(discountEl) discountEl.value = 0;
}

document.getElementById('clearCartBtn').addEventListener('click', ()=>{
  resetSaleCart();
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

  const pickBtn = document.getElementById('pickCustomerBtn');
  if(pickBtn && state.cart.length===0){
    // no items yet — don't nag about the customer before there's anything to sell
    pickBtn.classList.remove('ticket-customer-pick-required');
  }
}
document.getElementById('discountInput').addEventListener('input', renderCart);

/* ---- Customer selection on the cart (إجباري — لازم متعامل + اسم الشخص المستلم قبل إتمام أي بيع) ---- */
function renderTicketCustomerRow(total){
  const row = document.getElementById('ticketCustomerRow');
  const c = state.selectedCustomer;
  const contact = state.selectedContact;
  if(!c || !contact){
    row.innerHTML = `<button class="ticket-customer-pick ticket-customer-pick-required" id="pickCustomerBtn">🏢 اختيار المتعامل واسم العميل (إجباري)</button>`;
    document.getElementById('pickCustomerBtn').onclick = openCustomerPickerModal;
    return;
  }
  const willEarn = pointsForAmount(total ?? cartSubtotal());
  const redeemedActive = state.pointsRedeemed>0 && state.pointsRedeemedCustomerId===c.id;
  let pointsLine = pointsRate() > 0
    ? `🎁 ${c.points||0} نقطة${willEarn>0 ? ' — هيكسب '+willEarn+' كمان من الفاتورة دي' : ''}`
    : `🎁 ${c.points||0} نقطة`;
  if(redeemedActive){
    pointsLine += ` — مستخدم منها ${state.pointsRedeemed} نقطة (خصم ${money(pointsToCurrency(state.pointsRedeemed))} ج.م)`;
  }
  const showRedeemBtn = pointsRate() > 0 && (c.points||0) > 0;
  row.innerHTML = `
    <div class="ticket-customer-info">
      <span class="ticket-customer-name">🏢 ${escapeHtml(c.name)} (${escapeHtml(customerCodeLabel(c))}) — 👤 ${escapeHtml(contact.name)}${contact.phone ? ' ('+escapeHtml(contact.phone)+')' : ''}</span>
      <span class="ticket-customer-points">${pointsLine}</span>
    </div>
    <div class="ticket-customer-actions">
      ${showRedeemBtn ? `<button id="redeemPointsBtn" class="redeem-points-btn">🎁 تسوية النقاط</button>` : ''}
      <button id="changeCustomerBtn">تغيير</button>
      <button id="removeCustomerBtn">✕ إلغاء</button>
    </div>`;
  document.getElementById('changeCustomerBtn').onclick = openCustomerPickerModal;
  document.getElementById('removeCustomerBtn').onclick = ()=>{
    state.selectedCustomer = null;
    state.selectedContact = null;
    resetPointsRedemption();
    renderCart();
  };
  if(showRedeemBtn){
    document.getElementById('redeemPointsBtn').onclick = openRedeemPointsModal;
  }
}

/* ---- تسوية النقاط modal ---- */
function openRedeemPointsModal(){
  const c = state.selectedCustomer;
  if(!c) return;
  const rate = pointsRate();
  if(rate <= 0){ showToast('نظام نقاط الولاء مقفول من الإعدادات'); return; }
  if(!c.points){ showToast('العميل ده لسه معهوش نقط'); return; }

  const subtotal = cartSubtotal();
  const maxByPoints = c.points;
  const maxByTotal = Math.floor(subtotal / rate);
  const maxRedeemable = Math.max(0, Math.min(maxByPoints, maxByTotal));

  document.getElementById('redeemPointsBalance').textContent =
    `رصيد ${c.name}: 🎁 ${c.points} نقطة (قيمتها ${money(pointsToCurrency(c.points))} ج.م)`;

  const input = document.getElementById('redeemPointsInput');
  input.max = maxRedeemable;
  const prefill = (state.pointsRedeemed>0 && state.pointsRedeemedCustomerId===c.id)
    ? Math.min(state.pointsRedeemed, maxRedeemable)
    : maxRedeemable;
  input.value = prefill;
  updateRedeemPointsPreview();
  openModal('redeemPointsModal');
  setTimeout(()=>input.focus(), 50);
}
function updateRedeemPointsPreview(){
  const rate = pointsRate();
  const input = document.getElementById('redeemPointsInput');
  const maxRedeemable = Math.max(0, Number(input.max) || 0);
  let points = Math.max(0, Math.floor(Number(input.value) || 0));
  if(points > maxRedeemable) points = maxRedeemable;
  input.value = points;
  const discountValue = pointsToCurrency(points);
  document.getElementById('redeemPointsPreview').textContent = points > 0
    ? `هيتخصم ${money(discountValue)} ج.م من الفاتورة مقابل ${points} نقطة`
    : 'اكتب عدد النقط اللي عايز تستخدمها، أو سيبها 0 لإلغاء الخصم';
}
document.getElementById('redeemPointsInput').addEventListener('input', updateRedeemPointsPreview);
document.getElementById('confirmRedeemPointsBtn').addEventListener('click', ()=>{
  const c = state.selectedCustomer;
  if(!c) return;
  const rate = pointsRate();
  const input = document.getElementById('redeemPointsInput');
  const subtotal = cartSubtotal();
  const maxByPoints = c.points||0;
  const maxByTotal = rate>0 ? Math.floor(subtotal / rate) : 0;
  let points = Math.max(0, Math.floor(Number(input.value) || 0));
  points = Math.min(points, maxByPoints, maxByTotal);

  state.pointsRedeemed = points;
  state.pointsRedeemedCustomerId = points > 0 ? c.id : null;
  document.getElementById('discountInput').value = points > 0 ? pointsToCurrency(points) : 0;

  closeModal('redeemPointsModal');
  renderCart();
  showToast(points > 0
    ? `اتخصم ${money(pointsToCurrency(points))} ج.م مقابل ${points} نقطة`
    : 'الخصم بالنقط اتلغى');
});

function openCustomerPickerModal(){
  document.getElementById('customerPickerSearch').value = '';
  state.customerPickerSearchTerm = '';
  document.getElementById('quickAddCustomerName').value = '';
  document.getElementById('quickAddCustomerPhone').value = '';
  showCustomerPickerStep('company');
  renderCustomerPickerList();
  openModal('customerPickerModal');
  const hasAnyCustomers = DB.getCustomers().length > 0;
  // First time (no companies at all yet): jump straight to "add a company"
  // instead of a search box with nothing to search.
  setTimeout(()=>{
    document.getElementById(hasAnyCustomers ? 'customerPickerSearch' : 'quickAddCustomerName').focus();
  }, 50);
}

function showCustomerPickerStep(step){
  const title = document.getElementById('customerPickerTitle');
  const stepCompany = document.getElementById('customerPickerStepCompany');
  const stepContact = document.getElementById('customerPickerStepContact');
  if(step==='contact'){
    title.textContent = '👤 بيانات العميل المستلم';
    stepCompany.classList.add('hidden');
    stepContact.classList.remove('hidden');
  } else {
    title.textContent = '🏢 اختيار المتعامل';
    stepContact.classList.add('hidden');
    stepCompany.classList.remove('hidden');
  }
}

function renderCustomerPickerList(){
  const term = state.customerPickerSearchTerm.trim().toLowerCase();
  const allCustomers = DB.getCustomers();
  let customers = allCustomers;
  if(term){
    customers = customers.filter(c=>
      c.name.toLowerCase().includes(term) || (c.phone||'').includes(term) || (c.code||'').toLowerCase().includes(term));
  }
  const list = document.getElementById('customerPickerList');
  const quickAddHead = document.querySelector('#customerPickerModal .quick-add-head');

  if(!allCustomers.length){
    // No companies in the whole system yet — make it obvious this is step 1.
    list.innerHTML = '<div class="empty-note">لسه مفيش متعاملين متسجلين خالص. ضيف أول متعامل من هنا 👇</div>';
    if(quickAddHead) quickAddHead.textContent = 'ضيف أول متعامل عندك:';
    return;
  }
  if(quickAddHead) quickAddHead.textContent = 'مش لاقي المتعامل؟ ضيفه بسرعة';

  if(!customers.length){
    list.innerHTML = '<div class="empty-note">مفيش متعامل بالاسم أو الرقم ده. ضيفه تحت 👇</div>';
    return;
  }
  list.innerHTML = '';
  [...customers].reverse().forEach(c=>{
    const opt = document.createElement('div');
    opt.className = 'picker-option';
    opt.innerHTML = `
      <span class="picker-option-label">🏷️ ${escapeHtml(customerCodeLabel(c))} — ${escapeHtml(c.name)}${c.phone ? ' — '+escapeHtml(c.phone) : ''}</span>
      <span class="picker-option-stock">🎁 ${c.points||0} نقطة</span>`;
    opt.onclick = ()=> goToContactStep(c);
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
  if(!name){ showToast('اكتب اسم المتعامل الأول'); return; }
  const customer = findOrCreateCustomer(name, phone);
  goToContactStep(customer);
});

/* ---- Step 2: the specific person (اسم العميل + التليفون) receiving this invoice ---- */
function goToContactStep(customer){
  if(state.pointsRedeemedCustomerId && state.pointsRedeemedCustomerId!==customer.id){
    resetPointsRedemption();
    document.getElementById('discountInput').value = 0;
  }
  state.selectedCustomer = customer;
  state.selectedContact = null;
  document.getElementById('customerPickerCompanyBadge').innerHTML =
    `المتعامل المختار: <strong>🏢 ${escapeHtml(customer.name)}</strong>`;
  document.getElementById('contactNameInput').value = '';
  document.getElementById('contactPhoneInput').value = '';

  const chipsWrap = document.getElementById('customerPickerContactChips');
  const contacts = customer.contacts || [];
  if(!contacts.length){
    chipsWrap.innerHTML = '';
  } else {
    chipsWrap.innerHTML = '<div class="empty-note" style="padding:0 0 6px;">أشخاص سبق تسجيلهم لنفس المتعامل:</div>';
    [...contacts].reverse().forEach(p=>{
      const opt = document.createElement('div');
      opt.className = 'picker-option';
      opt.innerHTML = `<span class="picker-option-label">👤 ${escapeHtml(p.name)}${p.phone ? ' — '+escapeHtml(p.phone) : ''}</span>`;
      opt.onclick = ()=> confirmContact(p.name, p.phone);
      chipsWrap.appendChild(opt);
    });
  }

  showCustomerPickerStep('contact');
  setTimeout(()=>document.getElementById('contactNameInput').focus(), 50);
}

function confirmContact(name, phone){
  name = (name||'').trim();
  phone = (phone||'').trim();
  if(!name){ showToast('اكتب اسم العميل المستلم'); return; }
  state.selectedContact = { name, phone };
  addContactToCustomer(state.selectedCustomer.id, name, phone);
  closeModal('customerPickerModal');
  renderCart();
  showToast('اتحدد العميل للفاتورة');
}

document.getElementById('customerPickerBackBtn').addEventListener('click', ()=>{
  showCustomerPickerStep('company');
});
document.getElementById('confirmContactBtn').addEventListener('click', ()=>{
  confirmContact(
    document.getElementById('contactNameInput').value,
    document.getElementById('contactPhoneInput').value
  );
});

/* ---- Checkout ---- */
document.getElementById('checkoutBtn').addEventListener('click', ()=>{
  if(!state.cart.length) return;
  if(!state.selectedCustomer || !state.selectedContact){
    showToast('لازم تختار المتعامل واسم العميل الأول قبل إتمام البيع');
    openCustomerPickerModal();
    return;
  }
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
  if(!customerName){ showToast('اكتب اسم المتعامل الأول'); return; }
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
  checkLowStockAndNotify();

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

  // The specific person (name + phone) who actually received this invoice,
  // under the company above — captured mandatorily before checkout.
  if(state.selectedContact){
    order.contactName = state.selectedContact.name;
    order.contactPhone = state.selectedContact.phone || '';
    if(order.customerId) addContactToCustomer(order.customerId, order.contactName, order.contactPhone);
  }

  const orders = DB.getOrders();
  if(order.customerId && state.pointsRedeemed>0 && state.pointsRedeemedCustomerId===order.customerId){
    order.pointsRedeemed = redeemPointsFromCustomer(order.customerId, state.pointsRedeemed);
  }
  order.pointsEarned = order.customerId ? awardPoints(order.customerId, total) : 0;
  orders.push(order);
  DB.saveOrders(orders);

  showReceipt(order);

  resetSaleCart();
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
  const inv = settings.invoiceFields;
  const dt = new Date(order.date);
  let html = `
    <div class="receipt-title">${escapeHtml(settings.storeName)}</div>
    ${inv.storeInfo ? `<div class="receipt-sub">${escapeHtml(settings.storeInfo||'')}</div>` : ''}
    <div class="receipt-line"><span>فاتورة رقم</span><span>#${order.number}</span></div>
    <div class="receipt-line"><span>التاريخ</span><span>${dt.toLocaleDateString('ar-EG')} ${dt.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</span></div>
    ${(inv.cashier && order.cashierName) ? `<div class="receipt-line"><span>الكاشير</span><span>${escapeHtml(order.cashierName)}</span></div>` : ''}
    <div class="receipt-hr"></div>`;
  if(order.edited){
    html += `<div class="receipt-edit-note">⚠️ الفاتورة دي اتعدلت / فيها أصناف مرتجعة</div>`;
  }
  order.items.forEach(it=>{
    const returned = it.returnedQty || 0;
    const remaining = it.qty - returned;
    const itemLabel = `${escapeHtml(it.name)} (${escapeHtml(it.size)}/${escapeHtml(it.color)})`;
    if(remaining <= 0){
      html += `<div class="receipt-line returned-line"><span>${itemLabel} — مرتجع بالكامل</span><span>${money(0)}</span></div>`;
    } else if(returned > 0){
      html += `<div class="receipt-line"><span>${itemLabel} x${remaining} (من أصل ${it.qty} — ${returned} مرتجع)</span><span>${money(it.price*remaining)}</span></div>`;
    } else {
      html += `<div class="receipt-line"><span>${itemLabel} x${it.qty}</span><span>${money(it.price*it.qty)}</span></div>`;
    }
  });
  html += `<div class="receipt-hr"></div>
    <div class="receipt-line"><span>الإجمالي الفرعي</span><span>${money(order.subtotal)}</span></div>
    ${inv.discount ? `<div class="receipt-line"><span>الخصم</span><span>${money(order.discount)}</span></div>` : ''}
    <div class="receipt-line"><strong>الإجمالي</strong><strong>${money(order.total)}</strong></div>
    <div class="receipt-hr"></div>
    ${inv.paymentMethod ? `<div class="receipt-line"><span>طريقة الدفع</span><span>${paymentMethodLabel(order.method)}</span></div>` : ''}`;
  const orderCustomer = order.customerId ? DB.getCustomers().find(x=>x.id===order.customerId) : null;
  if(inv.customerInfo && order.method==='credit'){
    const paid = creditPaidTotal(order);
    const remaining = creditRemaining(order);
    html += `
    <div class="receipt-line"><span>المتعامل</span><span>${escapeHtml(order.customerName||'—')}</span></div>
    ${orderCustomer ? `<div class="receipt-line"><span>كود المتعامل</span><span>${escapeHtml(customerCodeLabel(orderCustomer))}</span></div>` : ''}
    ${(inv.customerPhone && order.customerPhone) ? `<div class="receipt-line"><span>تليفون المتعامل</span><span>${escapeHtml(order.customerPhone)}</span></div>` : ''}
    ${order.contactName ? `<div class="receipt-line"><span>الاسم</span><span>${escapeHtml(order.contactName)}</span></div>` : ''}
    ${(inv.customerPhone && order.contactPhone) ? `<div class="receipt-line"><span>تليفون العميل</span><span>${escapeHtml(order.contactPhone)}</span></div>` : ''}
    <div class="receipt-line"><span>المدفوع الآن</span><span>${money(paid)}</span></div>
    <div class="receipt-line"><strong>المتبقي على العميل</strong><strong>${money(remaining)}</strong></div>`;
  } else if(order.method==='credit'){
    // Even with customerInfo hidden, the remaining-balance owed must stay visible — it's not cosmetic, it's what the customer still owes.
    const remaining = creditRemaining(order);
    html += `<div class="receipt-line"><strong>المتبقي على العميل</strong><strong>${money(remaining)}</strong></div>`;
  } else if(inv.customerInfo && order.customerName){
    html += `<div class="receipt-line"><span>المتعامل</span><span>${escapeHtml(order.customerName)}</span></div>`;
    if(orderCustomer) html += `<div class="receipt-line"><span>كود المتعامل</span><span>${escapeHtml(customerCodeLabel(orderCustomer))}</span></div>`;
    if(inv.customerPhone && order.customerPhone) html += `<div class="receipt-line"><span>تليفون المتعامل</span><span>${escapeHtml(order.customerPhone)}</span></div>`;
    if(order.contactName) html += `<div class="receipt-line"><span>الاسم</span><span>${escapeHtml(order.contactName)}</span></div>`;
  }
  if(inv.points && order.customerId && order.pointsRedeemed>0){
    html += `<div class="receipt-line"><span>🎁 نقط اتخصمت</span><span>-${order.pointsRedeemed}</span></div>`;
  }
  if(inv.points && order.customerId && order.pointsEarned>0){
    const c = DB.getCustomers().find(x=>x.id===order.customerId);
    html += `<div class="receipt-line"><span>🎁 نقط اتكسبت</span><span>+${order.pointsEarned} (إجمالي ${c?c.points:order.pointsEarned})</span></div>`;
  }
  if(inv.thankYou){
    const msg = (settings.thankYouMessage || '').trim() || 'شكرًا لتعاملكم معنا 🙏';
    html += `<div class="receipt-sub" style="margin-top:10px;">${escapeHtml(msg)}</div>`;
  }
  document.getElementById('receiptContent').innerHTML = html;
  openModal('receiptModal');
}
document.getElementById('printReceiptBtn').addEventListener('click', ()=>window.print());

/* =========================================================
   CUSTOMERS VIEW (المتعاملين ونقاط الولاء)
   ========================================================= */
function renderCustomersView(){
  const term = state.customerSearchTerm.trim().toLowerCase();
  let customers = DB.getCustomers();
  if(term){
    customers = customers.filter(c=>
      c.name.toLowerCase().includes(term) || (c.phone||'').includes(term) || (c.code||'').toLowerCase().includes(term));
  }
  const tbody = document.getElementById('customersTableBody');
  if(!customers.length){
    tbody.innerHTML = '<tr><td colspan="8" class="empty-note">مفيش متعاملين مسجلين لسه</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  [...customers].reverse().forEach(c=>{
    const debt = customerCreditRemaining(c.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${escapeHtml(customerCodeLabel(c))}</td>
      <td><button class="customer-name-link" title="عرض بيانات المتعامل ونقاطه">${escapeHtml(c.name)}</button></td>
      <td class="mono">${escapeHtml(c.phone||'—')}</td>
      <td class="mono">${c.purchaseCount||0}</td>
      <td class="mono">${money(c.purchaseTotal||0)}</td>
      <td class="mono">🎁 ${c.points||0}</td>
      <td class="mono">${debt>0.01 ? money(debt) : '—'}</td>
      <td><button class="icon-btn" title="تعديل">✏️</button> <button class="icon-btn" title="حذف">🗑️</button></td>`;
    tr.querySelector('.customer-name-link').onclick = ()=>openCustomerDetailModal(c.id);
    tr.querySelectorAll('.icon-btn')[0].onclick = ()=>openCustomerModal(c);
    tr.querySelectorAll('.icon-btn')[1].onclick = ()=>deleteCustomer(c.id);
    tbody.appendChild(tr);
  });
}

/* ---- Company detail page: النقاط + الأشخاص المسجلين تحتها + سجل فواتيرها (رقم الفاتورة/الاسم/النقاط) ---- */
function openCustomerDetailModal(customerId){
  const c = DB.getCustomers().find(x=>x.id===customerId);
  if(!c) return;

  document.getElementById('customerDetailName').textContent = `🏢 ${c.name} — ${customerCodeLabel(c)}`;
  document.getElementById('customerDetailContact').innerHTML = `
    <span>🏷️ كود المتعامل: <strong class="mono">${escapeHtml(customerCodeLabel(c))}</strong></span>
    <span>📱 تليفون المتعامل: <strong>${escapeHtml(c.phone||'مفيش رقم مسجل')}</strong></span>
    <span>🗓️ متعامل معانا منذ: <strong>${new Date(c.createdAt).toLocaleDateString('ar-EG')}</strong></span>`;

  const debt = customerCreditRemaining(c.id);
  document.getElementById('customerDetailStats').innerHTML = `
    <div class="stat-card accent">
      <div class="stat-label">🎁 النقاط الحالية</div>
      <div class="stat-value mono">${c.points||0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">عدد المشتريات</div>
      <div class="stat-value mono">${c.purchaseCount||0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">إجمالي المشتريات</div>
      <div class="stat-value mono">${money(c.purchaseTotal||0)}</div>
    </div>
    <div class="stat-card ${debt>0.01?'warn':''}">
      <div class="stat-label">متبقي آجل</div>
      <div class="stat-value mono">${debt>0.01 ? money(debt) : '—'}</div>
    </div>`;

  const contacts = c.contacts || [];
  const contactsWrap = document.getElementById('customerDetailContactsList');
  if(!contacts.length){
    contactsWrap.innerHTML = '<div class="empty-note">لسه مفيش أشخاص متسجلين تحت المتعامل ده</div>';
  } else {
    contactsWrap.innerHTML = '';
    [...contacts].reverse().forEach(p=>{
      const chip = document.createElement('div');
      chip.className = 'contact-chip';
      chip.innerHTML = `<span>👤 ${escapeHtml(p.name)}</span>${p.phone ? `<span class="mono">${escapeHtml(p.phone)}</span>` : ''}`;
      contactsWrap.appendChild(chip);
    });
  }

  const orders = DB.getOrders().filter(o=>o.customerId===c.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const tbody = document.getElementById('customerDetailOrders');
  if(!orders.length){
    tbody.innerHTML = '<tr><td colspan="6" class="empty-note">مفيش فواتير مسجلة للمتعامل ده لسه</td></tr>';
  } else {
    tbody.innerHTML = '';
    orders.forEach(o=>{
      const dt = new Date(o.date);
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.title = 'دوس عشان تفتح الفاتورة';
      tr.innerHTML = `
        <td class="mono">#${o.number}</td>
        <td class="mono">${dt.toLocaleDateString('ar-EG')}</td>
        <td><strong>👤 ${escapeHtml(o.contactName || '—')}</strong></td>
        <td class="mono">${money(o.total)}</td>
        <td>${paymentMethodLabel(o.method)}</td>
        <td class="mono"><strong class="order-points">${o.pointsEarned ? '🎁 +'+o.pointsEarned : '—'}</strong></td>`;
      tr.onclick = ()=>{ closeModal('customerDetailModal'); showReceipt(o); };
      tbody.appendChild(tr);
    });
  }

  document.getElementById('customerDetailEditBtn').onclick = ()=>{
    closeModal('customerDetailModal');
    openCustomerModal(c);
  };

  openModal('customerDetailModal');
}
document.getElementById('customerSearchInput').addEventListener('input', e=>{
  state.customerSearchTerm = e.target.value;
  renderCustomersView();
});

function openCustomerModal(customer){
  document.getElementById('customerModalTitle').textContent = customer ? 'تعديل متعامل' : 'إضافة متعامل';
  document.getElementById('editCustomerId').value = customer ? customer.id : '';
  document.getElementById('cName').value = customer?.name || '';
  document.getElementById('cPhone').value = customer?.phone || '';
  openModal('customerModal');
}
document.getElementById('addCustomerBtn').addEventListener('click', ()=>openCustomerModal(null));

document.getElementById('saveCustomerBtn').addEventListener('click', ()=>{
  const name = document.getElementById('cName').value.trim();
  const phone = document.getElementById('cPhone').value.trim();
  if(!name){ showToast('اكتب اسم المتعامل'); return; }
  const editId = document.getElementById('editCustomerId').value;
  const customers = DB.getCustomers();
  if(editId){
    const idx = customers.findIndex(c=>c.id===editId);
    if(idx>-1) customers[idx] = { ...customers[idx], name, phone };
  } else {
    customers.push({ id: uid('cust'), code: nextCustomerCode(), name, phone, points:0, purchaseCount:0, purchaseTotal:0, contacts:[], createdAt:new Date().toISOString() });
  }
  DB.saveCustomers(customers);
  closeModal('customerModal');
  renderCustomersView();
  showToast('تم حفظ بيانات المتعامل');
});

function deleteCustomer(id){
  const customers = DB.getCustomers();
  const target = customers.find(c=>c.id===id);
  if(!target) return;
  const debt = customerCreditRemaining(id);
  if(debt > 0.01){ showToast('المتعامل ده لسه عليه فلوس آجل، مينفعش تمسحه'); return; }
  if(!confirm(`متأكد إنك عاوز تمسح المتعامل «${target.name}»؟`)) return;
  DB.saveCustomers(customers.filter(c=>c.id!==id));
  if(state.selectedCustomer?.id===id){ state.selectedCustomer = null; state.selectedContact = null; renderCart(); }
  renderCustomersView();
  showToast('تم حذف المتعامل');
}

/* ---- Search: total loyalty points for a specific person (by name), across
   every invoice and every company they've ever received a sale under ---- */
function openContactSearchModal(){
  document.getElementById('contactSearchInput').value = '';
  renderContactSearchResults();
  openModal('contactSearchModal');
  setTimeout(()=>document.getElementById('contactSearchInput').focus(), 50);
}

function renderContactSearchResults(){
  const term = document.getElementById('contactSearchInput').value.trim().toLowerCase();
  const summary = document.getElementById('contactSearchSummary');
  const tbody = document.getElementById('contactSearchTable');

  if(!term){
    summary.classList.add('hidden');
    summary.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="6" class="empty-note">اكتب اسم العميل فوق عشان تشوف كل فواتيره ونقاطه</td></tr>';
    return;
  }

  const customers = DB.getCustomers();
  const matches = DB.getOrders()
    .filter(o => o.contactName && o.contactName.toLowerCase().includes(term))
    .sort((a,b)=> new Date(b.date) - new Date(a.date));

  if(!matches.length){
    summary.classList.add('hidden');
    summary.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="6" class="empty-note">مفيش فواتير باسم عميل شبه ده</td></tr>';
    return;
  }

  const totalPoints = matches.reduce((s,o)=>s + (o.pointsEarned||0), 0);
  const totalAmount = matches.reduce((s,o)=>s + (o.total||0), 0);
  summary.classList.remove('hidden');
  summary.innerHTML = `🎁 إجمالي النقاط: <strong>${totalPoints}</strong> نقطة — على <strong>${matches.length}</strong> فاتورة — بإجمالي مشتريات <strong>${money(totalAmount)}</strong> ج.م`;

  tbody.innerHTML = '';
  matches.forEach(o=>{
    const company = customers.find(c=>c.id===o.customerId);
    const dt = new Date(o.date);
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.title = 'دوس عشان تفتح الفاتورة';
    tr.innerHTML = `
      <td class="mono">#${o.number}</td>
      <td>${escapeHtml(company ? company.name : '—')}</td>
      <td class="mono">${dt.toLocaleDateString('ar-EG')}</td>
      <td class="mono">${money(o.total)}</td>
      <td>${paymentMethodLabel(o.method)}</td>
      <td class="mono"><strong class="order-points">${o.pointsEarned ? '🎁 +'+o.pointsEarned : '—'}</strong></td>`;
    tr.onclick = (ev)=>openInvoiceActionsPopover(ev, o);
    tbody.appendChild(tr);
  });
}

document.getElementById('searchContactPointsBtn').addEventListener('click', openContactSearchModal);
document.getElementById('contactSearchInput').addEventListener('input', renderContactSearchResults);

/* ---- Small popup above the clicked invoice row: print / edit / delete ---- */
let invoiceActionsOrderId = null;
function openInvoiceActionsPopover(ev, order){
  ev.stopPropagation();
  invoiceActionsOrderId = order.id;
  const pop = document.getElementById('invoiceActionsPopover');
  const rowRect = ev.currentTarget.getBoundingClientRect();
  pop.classList.remove('hidden');
  // measure after unhide, then position above the row (or below if no room)
  const popRect = pop.getBoundingClientRect();
  let top = rowRect.top - popRect.height - 8;
  if(top < 8) top = rowRect.bottom + 8;
  let left = rowRect.left + (rowRect.width/2) - (popRect.width/2);
  left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}
function closeInvoiceActionsPopover(){
  document.getElementById('invoiceActionsPopover').classList.add('hidden');
  invoiceActionsOrderId = null;
}
document.addEventListener('click', (ev)=>{
  const pop = document.getElementById('invoiceActionsPopover');
  if(!pop.classList.contains('hidden') && !pop.contains(ev.target)){
    closeInvoiceActionsPopover();
  }
});
document.getElementById('invoiceActionPrint').addEventListener('click', (ev)=>{
  ev.stopPropagation();
  if(!invoiceActionsOrderId) return;
  const order = DB.getOrders().find(o=>o.id===invoiceActionsOrderId);
  closeInvoiceActionsPopover();
  if(!order) return;
  closeModal('contactSearchModal');
  showReceipt(order);
  setTimeout(()=>window.print(), 200);
});
document.getElementById('invoiceActionEdit').addEventListener('click', (ev)=>{
  ev.stopPropagation();
  if(!invoiceActionsOrderId) return;
  const order = DB.getOrders().find(o=>o.id===invoiceActionsOrderId);
  closeInvoiceActionsPopover();
  if(!order) return;
  closeModal('contactSearchModal');
  openOrderEditModal(order);
});
document.getElementById('invoiceActionDelete').addEventListener('click', (ev)=>{
  ev.stopPropagation();
  if(!invoiceActionsOrderId) return;
  const orderId = invoiceActionsOrderId;
  const order = DB.getOrders().find(o=>o.id===orderId);
  closeInvoiceActionsPopover();
  if(!order) return;
  if(!confirm(`متأكد إنك عاوز تمسح الفاتورة رقم #${order.number} نهائيًا؟`)) return;
  const orders = DB.getOrders().filter(o=>o.id!==orderId);
  DB.saveOrders(orders);
  showToast('اتمسحت الفاتورة');
  renderContactSearchResults();
});

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
    const orderCustomer = o.customerId ? DB.getCustomers().find(x=>x.id===o.customerId) : null;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${dt.toLocaleDateString('ar-EG')}</td>
      <td><strong>${escapeHtml(o.customerName||'—')}</strong>${orderCustomer ? ` <span class="mono" style="opacity:.65;">(${escapeHtml(customerCodeLabel(orderCustomer))})</span>` : ''}</td>
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
   PURCHASES VIEW (المشتروات — الموردين والتجار)
   Tracks money owed to suppliers/merchants for goods bought.
   Doesn't touch inventory — pure money tracking, like the
   reverse of البيع الآجل. Every payment made toward a purchase
   (the down payment at creation, or a later installment) is
   also logged as a 'suppliers' expense so it automatically
   shows up in المصاريف and في التقارير (reduces profit, counts
   against the shift's expected cash) without duplicating logic.
   ========================================================= */
function purchasePaidTotal(purchase){
  return (purchase.payments||[]).reduce((s,p)=>s+p.amount, 0);
}
function purchaseRemaining(purchase){
  return Math.max(0, Math.round((purchase.amount - purchasePaidTotal(purchase))*100)/100);
}
function purchaseIsSettled(purchase){
  return purchaseRemaining(purchase) <= 0.01;
}
function supplierDebtRemaining(supplierId){
  return DB.getPurchases()
    .filter(p=>p.supplierId===supplierId && !purchaseIsSettled(p))
    .reduce((s,p)=>s+purchaseRemaining(p), 0);
}
/* Builds a short human-readable summary of a purchase's line items,
   e.g. "حذاء رياضي×3، صندل حريمي×2" — used so expense-report entries
   show what was actually bought, not just the supplier name. */
function purchaseItemsSummary(items){
  if(!items || !items.length) return '';
  const parts = items.map(it=>`${it.type}${it.qty?'×'+it.qty:''}`);
  const summary = parts.join('، ');
  return summary.length > 90 ? summary.slice(0,87)+'…' : summary;
}

/* Logs a payment toward a purchase as a supplier expense, so it counts
   in shift cash and shows in المصاريف/التقارير automatically. */
function logSupplierExpense(amount, supplierName, note){
  if(amount <= 0) return;
  const cashier = AUTH.currentUser();
  const expenses = DB.getExpenses();
  expenses.push({
    id: uid('exp'),
    date: new Date().toISOString(),
    category: 'suppliers',
    amount,
    note: `${supplierName}${note ? ' — '+note : ''}`,
    shiftId: getActiveShift() ? getActiveShift().id : null,
    createdBy: cashier?.id || null,
    createdByName: cashier?.name || ''
  });
  DB.saveExpenses(expenses);
}

/* Logs money paid out to a worker (an advance given now, or the net
   settled at تسوية المرتب) as a 'workers' expense, so it counts in
   shift cash and في التقارير automatically — same mechanism as
   logSupplierExpense() above. */
function logWorkerExpense(amount, workerName, label, note){
  if(amount <= 0) return;
  const cashier = AUTH.currentUser();
  const expenses = DB.getExpenses();
  expenses.push({
    id: uid('exp'),
    date: new Date().toISOString(),
    category: 'workers',
    amount,
    note: `${label} — ${workerName}${note ? ' — '+note : ''}`,
    shiftId: getActiveShift() ? getActiveShift().id : null,
    createdBy: cashier?.id || null,
    createdByName: cashier?.name || ''
  });
  DB.saveExpenses(expenses);
}

function purchases(){ return DB.getPurchases(); }

function renderPurchasesView(){
  const all = purchases();
  const outstanding = all.filter(p=>!purchaseIsSettled(p));
  const outstandingTotal = outstanding.reduce((s,p)=>s+purchaseRemaining(p), 0);

  document.getElementById('purchaseOutstandingTotal').textContent = money(outstandingTotal);
  document.getElementById('purchaseOpenCount').textContent = outstanding.length;

  let list;
  if(state.purchaseFilter==='open') list = outstanding;
  else if(state.purchaseFilter==='settled') list = all.filter(p=>purchaseIsSettled(p));
  else list = all;

  const tbody = document.getElementById('purchasesTableBody');
  if(!list.length){
    tbody.innerHTML = '<tr><td colspan="9" class="empty-note">مفيش عمليات شراء هنا</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  [...list].reverse().forEach(p=>{
    const dt = new Date(p.date);
    const paid = purchasePaidTotal(p);
    const remaining = purchaseRemaining(p);
    const settled = purchaseIsSettled(p);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${dt.toLocaleDateString('ar-EG')}</td>
      <td><strong>${escapeHtml(p.supplierName||'—')}</strong></td>
      <td class="mono">${escapeHtml(p.supplierPhone||'—')}</td>
      <td>${escapeHtml(p.note||'—')}</td>
      <td class="mono">${money(p.amount)}</td>
      <td class="mono">${money(paid)}</td>
      <td class="mono">${money(remaining)}</td>
      <td><span class="credit-status ${settled?'settled':'open'}">${settled?'✓ اتسدد':'مستحق'}</span></td>
      <td>
        <button class="icon-btn" title="عرض التفاصيل">👁️</button>
        ${settled ? '' : '<button class="icon-btn" title="تسجيل دفعة">💵</button>'}
      </td>`;
    tr.querySelectorAll('.icon-btn')[0].onclick = ()=>openPurchaseDetailModal(p.id);
    if(!settled) tr.querySelectorAll('.icon-btn')[1].onclick = ()=>openPurchasePaymentModal(p.id);
    tbody.appendChild(tr);
  });
}

document.querySelectorAll('#purchaseFilter .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('#purchaseFilter .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    state.purchaseFilter = chip.dataset.pfilter;
    renderPurchasesView();
  });
});

/* ---- Suppliers management ---- */
function renderSuppliersTable(){
  const suppliers = DB.getSuppliers();
  const tbody = document.getElementById('suppliersTableBody');
  if(!suppliers.length){
    tbody.innerHTML = '<tr><td colspan="4" class="empty-note">مفيش موردين مسجلين لسه</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  [...suppliers].reverse().forEach(s=>{
    const debt = supplierDebtRemaining(s.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td class="mono">${escapeHtml(s.phone||'—')}</td>
      <td class="mono">${debt>0.01 ? money(debt) : '—'}</td>
      <td><button class="icon-btn" title="تعديل">✏️</button> <button class="icon-btn" title="حذف">🗑️</button></td>`;
    tr.querySelectorAll('.icon-btn')[0].onclick = ()=>openSupplierModal(s);
    tr.querySelectorAll('.icon-btn')[1].onclick = ()=>deleteSupplier(s.id);
    tbody.appendChild(tr);
  });
}
document.getElementById('manageSuppliersBtn').addEventListener('click', ()=>{
  renderSuppliersTable();
  openModal('suppliersModal');
});

function openSupplierModal(supplier){
  document.getElementById('supplierModalTitle').textContent = supplier ? 'تعديل مورد' : 'إضافة مورد';
  document.getElementById('editSupplierId').value = supplier ? supplier.id : '';
  document.getElementById('supName').value = supplier?.name || '';
  document.getElementById('supPhone').value = supplier?.phone || '';
  document.getElementById('supNotes').value = supplier?.notes || '';
  openModal('supplierModal');
}
document.getElementById('addSupplierBtn').addEventListener('click', ()=>openSupplierModal(null));

document.getElementById('saveSupplierBtn').addEventListener('click', ()=>{
  const name = document.getElementById('supName').value.trim();
  const phone = document.getElementById('supPhone').value.trim();
  const notes = document.getElementById('supNotes').value.trim();
  if(!name){ showToast('اكتب اسم المورد'); return; }
  const editId = document.getElementById('editSupplierId').value;
  const suppliers = DB.getSuppliers();
  if(editId){
    const idx = suppliers.findIndex(s=>s.id===editId);
    if(idx>-1) suppliers[idx] = { ...suppliers[idx], name, phone, notes };
    // keep denormalized name/phone on existing purchases in sync
    const list = DB.getPurchases();
    list.forEach(p=>{ if(p.supplierId===editId){ p.supplierName = name; p.supplierPhone = phone; } });
    DB.savePurchases(list);
  } else {
    suppliers.push({ id: uid('sup'), name, phone, notes, createdAt:new Date().toISOString() });
  }
  DB.saveSuppliers(suppliers);
  closeModal('supplierModal');
  renderSuppliersTable();
  populatePurchaseSupplierSelect();
  showToast('تم حفظ بيانات المورد');
});

function deleteSupplier(id){
  const suppliers = DB.getSuppliers();
  const target = suppliers.find(s=>s.id===id);
  if(!target) return;
  const debt = supplierDebtRemaining(id);
  if(debt > 0.01){ showToast('المورد ده لسه عليه مستحقات، مينفعش تمسحه'); return; }
  if(!confirm(`متأكد إنك عاوز تمسح المورد «${target.name}»؟`)) return;
  DB.saveSuppliers(suppliers.filter(s=>s.id!==id));
  renderSuppliersTable();
  showToast('تم حذف المورد');
}

/* ---- Supplier ledger (سجل الموردين) — pick a supplier and see every
   invoice bought from them: what was bought, how much, how much paid,
   how much still owed, plus totals across all their invoices. */
document.getElementById('supplierLedgerBtn').addEventListener('click', ()=>{
  populateSupplierLedgerSelect();
  openModal('supplierLedgerModal');
});

function populateSupplierLedgerSelect(){
  const select = document.getElementById('supplierLedgerSelect');
  const suppliers = DB.getSuppliers();
  const content = document.getElementById('supplierLedgerContent');
  const empty = document.getElementById('supplierLedgerEmpty');
  if(!suppliers.length){
    select.innerHTML = '';
    content.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  content.classList.remove('hidden');
  empty.classList.add('hidden');
  const prev = select.value;
  select.innerHTML = suppliers.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  select.value = suppliers.some(s=>s.id===prev) ? prev : suppliers[0].id;
  renderSupplierLedger(select.value);
}

document.getElementById('supplierLedgerSelect').addEventListener('change', e=>{
  renderSupplierLedger(e.target.value);
});

function renderSupplierLedger(supplierId){
  const purchases = DB.getPurchases().filter(p=>p.supplierId===supplierId);
  const tbody = document.getElementById('supplierLedgerTableBody');

  let totalAmount = 0, totalPaid = 0, totalRemaining = 0;
  if(!purchases.length){
    tbody.innerHTML = '<tr><td colspan="7" class="empty-note">مفيش فواتير مسجلة لهذا المورد</td></tr>';
  } else {
    tbody.innerHTML = '';
    [...purchases].reverse().forEach(p=>{
      const paid = purchasePaidTotal(p);
      const remaining = purchaseRemaining(p);
      const settled = purchaseIsSettled(p);
      totalAmount += p.amount;
      totalPaid += paid;
      totalRemaining += remaining;
      const itemsSummary = purchaseItemsSummary(p.items) || p.note || '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${new Date(p.date).toLocaleDateString('ar-EG')}</td>
        <td>${escapeHtml(itemsSummary)}</td>
        <td class="mono">${money(p.amount)}</td>
        <td class="mono">${money(paid)}</td>
        <td class="mono">${money(remaining)}</td>
        <td><span class="credit-status ${settled?'settled':'open'}">${settled?'✓ اتسدد':'مستحق'}</span></td>
        <td><button class="icon-btn" title="عرض التفاصيل">👁️</button></td>`;
      tr.querySelector('.icon-btn').onclick = ()=>openPurchaseDetailModal(p.id);
      tbody.appendChild(tr);
    });
  }

  document.getElementById('supplierLedgerCount').textContent = purchases.length;
  document.getElementById('supplierLedgerTotal').textContent = money(totalAmount);
  document.getElementById('supplierLedgerPaid').textContent = money(totalPaid);
  document.getElementById('supplierLedgerRemaining').textContent = money(totalRemaining);
}

/* ---- New purchase ---- */
function populatePurchaseSupplierSelect(){
  const select = document.getElementById('purchaseSupplierSelect');
  const suppliers = DB.getSuppliers();
  if(!suppliers.length){
    select.innerHTML = '<option value="">لا يوجد موردين — ضيف مورد الأول</option>';
    return;
  }
  select.innerHTML = suppliers.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

function updatePurchasePreview(){
  const amount = Math.max(0, Number(document.getElementById('purchaseAmount').value) || 0);
  const down = Math.max(0, Number(document.getElementById('purchaseDownPayment').value) || 0);
  const remaining = Math.max(0, amount - down);
  document.getElementById('purchaseRemainingPreview').innerHTML =
    `المتبقي المستحق للمورد: <strong>${money(remaining)}</strong> ج.م`;
}
document.getElementById('purchaseAmount').addEventListener('input', updatePurchasePreview);
document.getElementById('purchaseDownPayment').addEventListener('input', updatePurchasePreview);

document.getElementById('addPurchaseBtn').addEventListener('click', ()=>{
  if(!DB.getSuppliers().length){ showToast('ضيف مورد الأول من زرار «الموردين»'); return; }
  populatePurchaseSupplierSelect();
  document.getElementById('purchaseNote').value = '';
  document.getElementById('purchaseAmount').value = '';
  document.getElementById('purchaseDownPayment').value = 0;
  state.editPurchaseItems = [];
  renderPurchaseItemRows();
  updatePurchasePreview();
  openModal('purchaseModal');
});

/* ---- Purchase invoice line items (النوع / اللون / الكمية / السعر) ---- */
function renderPurchaseItemRows(){
  const wrap = document.getElementById('purchaseItemRows');
  wrap.innerHTML = '';
  state.editPurchaseItems.forEach((it,idx)=>{
    const row = document.createElement('div');
    row.className = 'purchase-item-row';
    row.innerHTML = `
      <div class="purchase-item-row-main">
        <input type="text" placeholder="النوع (مثال حذاء رياضي)" value="${escapeHtml(it.type)}" data-f="type">
        <button type="button" class="btn-ghost-sm" title="إضافة مقاس تاني لنفس النوع">+ إضافة مقاس</button>
        <button class="variant-remove" title="حذف">✕</button>
      </div>
      <div class="purchase-item-row-fields">
        <input type="text" class="mono-input" placeholder="المقاس" value="${escapeHtml(it.size)}" data-f="size">
        <input type="text" placeholder="اللون" value="${escapeHtml(it.color)}" data-f="color">
        <input type="number" min="0" class="mono-input" placeholder="الكمية" value="${it.qty}" data-f="qty">
        <input type="number" min="0" step="0.01" class="mono-input" placeholder="السعر" value="${it.price}" data-f="price">
      </div>`;
    row.querySelector('[data-f="type"]').oninput = e=>{ it.type=e.target.value; };
    row.querySelector('[data-f="size"]').oninput = e=>{ it.size=e.target.value; };
    row.querySelector('[data-f="color"]').oninput = e=>{ it.color=e.target.value; };
    row.querySelector('[data-f="qty"]').oninput = e=>{ it.qty=Number(e.target.value)||0; updatePurchaseItemsTotal(); };
    row.querySelector('[data-f="price"]').oninput = e=>{ it.price=Number(e.target.value)||0; updatePurchaseItemsTotal(); };
    row.querySelector('.btn-ghost-sm').onclick = ()=>{
      state.editPurchaseItems.splice(idx+1, 0, {id:uid('pit'), type:it.type, size:'', color:it.color, qty:1, price:it.price});
      renderPurchaseItemRows();
    };
    row.querySelector('.variant-remove').onclick = ()=>{
      state.editPurchaseItems.splice(idx,1);
      renderPurchaseItemRows();
    };
    wrap.appendChild(row);
  });
  updatePurchaseItemsTotal();
}

function updatePurchaseItemsTotal(){
  const total = state.editPurchaseItems.reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.price)||0), 0);
  const preview = document.getElementById('purchaseItemsTotalPreview');
  if(!state.editPurchaseItems.length){
    preview.innerHTML = '';
    return;
  }
  preview.innerHTML = `إجمالي تفاصيل الفاتورة: <strong>${money(total)}</strong> ج.م
    <button type="button" class="btn-ghost-sm" id="usePurchaseItemsTotalBtn" style="margin-inline-start:8px;">استخدمه كإجمالي الفاتورة</button>`;
  const btn = document.getElementById('usePurchaseItemsTotalBtn');
  if(btn) btn.onclick = ()=>{
    document.getElementById('purchaseAmount').value = total.toFixed(2);
    updatePurchasePreview();
  };
}

document.getElementById('addPurchaseItemRow').addEventListener('click', ()=>{
  state.editPurchaseItems.push({id:uid('pit'), type:'', size:'', color:'', qty:1, price:0});
  renderPurchaseItemRows();
});

document.getElementById('confirmPurchaseBtn').addEventListener('click', ()=>{
  const supplierId = document.getElementById('purchaseSupplierSelect').value;
  const supplier = DB.getSuppliers().find(s=>s.id===supplierId);
  if(!supplier){ showToast('اختار مورد'); return; }
  const amount = Math.max(0, Number(document.getElementById('purchaseAmount').value) || 0);
  if(amount <= 0){ showToast('اكتب إجمالي قيمة الشراء'); return; }
  const note = document.getElementById('purchaseNote').value.trim();
  const down = Math.min(amount, Math.max(0, Number(document.getElementById('purchaseDownPayment').value) || 0));

  const items = state.editPurchaseItems
    .filter(it=>it.type.trim()!=='')
    .map(it=>({id:it.id||uid('pit'), type:it.type.trim(), size:it.size.trim()||'—', color:it.color.trim()||'—', qty:Math.max(0,it.qty||0), price:Math.max(0,it.price||0)}));

  const cashier = AUTH.currentUser();
  const activeShift = getActiveShift();
  const purchase = {
    id: uid('pur'),
    date: new Date().toISOString(),
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierPhone: supplier.phone || '',
    amount, note, items,
    payments: [],
    createdBy: cashier?.id || null,
    createdByName: cashier?.name || ''
  };
  if(down > 0){
    purchase.payments.push({
      id: uid('pay'), date: new Date().toISOString(), amount: down,
      shiftId: activeShift ? activeShift.id : null,
      byId: cashier?.id || null, byName: cashier?.name || ''
    });
    const itemsSummary = purchaseItemsSummary(items);
    logSupplierExpense(down, supplier.name, [note, itemsSummary].filter(Boolean).join(' — ') || 'دفعة شراء');
  }
  const list = DB.getPurchases();
  list.push(purchase);
  DB.savePurchases(list);
  closeModal('purchaseModal');
  showToast('تم تسجيل عملية الشراء');
  renderPurchasesView();
  refreshShiftBadge();
});

/* ---- Payments toward an existing purchase ---- */
let purchasePaymentId = null;
function openPurchasePaymentModal(purchaseId){
  const purchase = DB.getPurchases().find(p=>p.id===purchaseId);
  if(!purchase) return;
  purchasePaymentId = purchaseId;
  const paid = purchasePaidTotal(purchase);
  const remaining = purchaseRemaining(purchase);
  document.getElementById('purchasePaymentSummary').innerHTML = `
    <div class="sum-row"><span>المورد</span><span class="mono">${escapeHtml(purchase.supplierName||'—')}</span></div>
    <div class="sum-row"><span>إجمالي عملية الشراء</span><span class="mono">${money(purchase.amount)}</span></div>
    <div class="sum-row"><span>المدفوع لحد دلوقتي</span><span class="mono">${money(paid)}</span></div>
    <div class="sum-row total-row"><span>المتبقي</span><span class="mono">${money(remaining)}</span></div>`;
  document.getElementById('purchasePaymentAmount').value = remaining.toFixed(2);
  document.getElementById('purchasePaymentAmount').max = remaining;
  openModal('purchasePaymentModal');
}

document.getElementById('confirmPurchasePaymentBtn').addEventListener('click', ()=>{
  if(!purchasePaymentId) return;
  const list = DB.getPurchases();
  const purchase = list.find(p=>p.id===purchasePaymentId);
  if(!purchase) return;
  const remaining = purchaseRemaining(purchase);
  let amount = Math.max(0, Number(document.getElementById('purchasePaymentAmount').value) || 0);
  if(amount <= 0){ showToast('اكتب مبلغ الدفعة'); return; }
  if(amount > remaining + 0.01){ showToast('المبلغ أكبر من المتبقي للمورد'); return; }
  amount = Math.min(amount, remaining);

  const cashier = AUTH.currentUser();
  const activeShift = getActiveShift();
  purchase.payments = purchase.payments || [];
  purchase.payments.push({
    id: uid('pay'), date: new Date().toISOString(), amount,
    shiftId: activeShift ? activeShift.id : null,
    byId: cashier?.id || null, byName: cashier?.name || ''
  });
  DB.savePurchases(list);
  const itemsSummary = purchaseItemsSummary(purchase.items);
  logSupplierExpense(amount, purchase.supplierName, [purchase.note, itemsSummary].filter(Boolean).join(' — ') || 'دفعة تقسيط');
  closeModal('purchasePaymentModal');
  showToast(purchaseIsSettled(purchase) ? 'تم سداد المستحق للمورد بالكامل ✓' : 'تم تسجيل الدفعة');
  renderPurchasesView();
  refreshShiftBadge();
});

/* ---- Purchase detail (payment history) ---- */
function openPurchaseDetailModal(purchaseId){
  const purchase = DB.getPurchases().find(p=>p.id===purchaseId);
  if(!purchase) return;
  document.getElementById('purchaseDetailTitle').textContent = `🚚 ${purchase.supplierName}`;
  const paid = purchasePaidTotal(purchase);
  const remaining = purchaseRemaining(purchase);
  document.getElementById('purchaseDetailSummary').innerHTML = `
    <div class="sum-row"><span>التاريخ</span><span class="mono">${new Date(purchase.date).toLocaleDateString('ar-EG')}</span></div>
    <div class="sum-row"><span>البيان</span><span>${escapeHtml(purchase.note||'—')}</span></div>
    <div class="sum-row"><span>إجمالي عملية الشراء</span><span class="mono">${money(purchase.amount)}</span></div>
    <div class="sum-row"><span>المدفوع</span><span class="mono">${money(paid)}</span></div>
    <div class="sum-row total-row"><span>المتبقي</span><span class="mono">${money(remaining)}</span></div>`;

  const wrap = document.getElementById('purchaseDetailItems');
  const itemsEmpty = document.getElementById('purchaseDetailItemsEmpty');
  const items = purchase.items || [];
  if(!items.length){
    wrap.innerHTML = '';
    itemsEmpty.classList.remove('hidden');
    itemsEmpty.textContent = 'مفيش تفاصيل فاتورة مسجلة لعملية الشراء دي';
  } else {
    itemsEmpty.classList.add('hidden');
    wrap.innerHTML = '';
    items.forEach(it=>{
      const row = document.createElement('div');
      row.className = 'contact-chip';
      row.innerHTML = `<span>${escapeHtml(it.type)}${it.size && it.size!=='—' ? ' — مقاس '+escapeHtml(it.size) : ''}${it.color && it.color!=='—' ? ' · '+escapeHtml(it.color) : ''} × ${it.qty}</span><span class="mono">${money(it.qty*it.price)} ج.م</span>`;
      wrap.appendChild(row);
    });
  }

  const paymentsWrap = document.getElementById('purchaseDetailPayments');
  const payments = purchase.payments || [];
  if(!payments.length){
    paymentsWrap.innerHTML = '<div class="empty-note">لسه مفيش دفعات مسجلة</div>';
  } else {
    paymentsWrap.innerHTML = '';
    [...payments].reverse().forEach(pay=>{
      const row = document.createElement('div');
      row.className = 'contact-chip';
      row.innerHTML = `<span>💵 ${money(pay.amount)} ج.م</span><span class="mono">${new Date(pay.date).toLocaleDateString('ar-EG')}</span>`;
      paymentsWrap.appendChild(row);
    });
  }
  openModal('purchaseDetailModal');
}

/* =========================================================
   WORKERS VIEW (العمال — البيانات، المرتبات، السلف، المنح،
   المكافآت، والإجازات)
   Each worker carries a base monthly salary. Advances (سلف) are
   deducted from what's owed to them; grants (منح) and bonuses
   (مكافآت) are added. الصافي المستحق = مرتب + منح + مكافآت - سلف,
   a running ledger similar to purchases/credit. Vacations track
   days used against the worker's yearly allowance.
   ========================================================= */
function workerTxnsFor(workerId, type){
  return DB.getWorkerTxns().filter(t=>t.workerId===workerId && (!type || t.type===type));
}
/* Running balance since the last settlement — settled txns don't count
   toward what's currently owed, but stay in the log for history. */
function workerAdvancesTotal(workerId){ return workerTxnsFor(workerId,'advance').filter(t=>!t.isSettled).reduce((s,t)=>s+t.amount,0); }
function workerGrantsTotal(workerId){ return workerTxnsFor(workerId,'grant').filter(t=>!t.isSettled).reduce((s,t)=>s+t.amount,0); }
function workerBonusesTotal(workerId){ return workerTxnsFor(workerId,'bonus').filter(t=>!t.isSettled).reduce((s,t)=>s+t.amount,0); }
function workerNetDue(worker){
  const advances = workerAdvancesTotal(worker.id);
  const grants = workerGrantsTotal(worker.id);
  const bonuses = workerBonusesTotal(worker.id);
  return Math.round((worker.salary + grants + bonuses - advances)*100)/100;
}
function workerVacationsFor(workerId){
  return DB.getWorkerVacations().filter(v=>v.workerId===workerId);
}
function workerVacationDaysUsed(workerId){
  return workerVacationsFor(workerId).reduce((s,v)=>s+v.days,0);
}
function workerVacationDaysRemaining(worker){
  return Math.max(0, (worker.vacationDaysPerYear||0) - workerVacationDaysUsed(worker.id));
}
function workerTxnTypeLabel(type){
  if(type==='advance') return '💰 سلفة';
  if(type==='grant') return '🎁 منحة';
  if(type==='bonus') return '🏅 مكافأة';
  return type;
}

function renderWorkersView(){
  const workers = DB.getWorkers();
  document.getElementById('workerCountStat').textContent = workers.length;
  document.getElementById('workerSalariesStat').textContent = money(workers.reduce((s,w)=>s+w.salary,0));
  document.getElementById('workerAdvancesStat').textContent = money(workers.reduce((s,w)=>s+workerAdvancesTotal(w.id),0));
  document.getElementById('workerNetStat').textContent = money(workers.reduce((s,w)=>s+workerNetDue(w),0));

  const tbody = document.getElementById('workersTableBody');
  if(!workers.length){
    tbody.innerHTML = '<tr><td colspan="9" class="empty-note">مفيش عمال مسجلين لسه</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  [...workers].reverse().forEach(w=>{
    const advances = workerAdvancesTotal(w.id);
    const grantsBonuses = workerGrantsTotal(w.id) + workerBonusesTotal(w.id);
    const net = workerNetDue(w);
    const remaining = workerVacationDaysRemaining(w);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(w.name)}</strong></td>
      <td>${escapeHtml(w.jobTitle||'—')}</td>
      <td class="mono">${escapeHtml(w.phone||'—')}</td>
      <td class="mono">${money(w.salary)}</td>
      <td class="mono">${advances>0.01 ? money(advances) : '—'}</td>
      <td class="mono">${grantsBonuses>0.01 ? money(grantsBonuses) : '—'}</td>
      <td class="mono">${money(net)}</td>
      <td class="mono">${remaining} / ${w.vacationDaysPerYear||0} يوم</td>
      <td>
        <button class="icon-btn" title="عرض التفاصيل">👁️</button>
        <button class="icon-btn" title="تعديل">✏️</button>
        <button class="icon-btn" title="حذف">🗑️</button>
      </td>`;
    const [viewBtn, editBtn, delBtn] = tr.querySelectorAll('.icon-btn');
    viewBtn.onclick = ()=>openWorkerDetailModal(w.id);
    editBtn.onclick = ()=>openWorkerModal(w);
    delBtn.onclick = ()=>deleteWorker(w.id);
    tbody.appendChild(tr);
  });
}

/* ---- Add / edit worker ---- */
function openWorkerModal(worker){
  document.getElementById('workerModalTitle').textContent = worker ? 'تعديل بيانات العامل' : 'إضافة عامل';
  document.getElementById('editWorkerId').value = worker ? worker.id : '';
  document.getElementById('workerName').value = worker?.name || '';
  document.getElementById('workerJobTitle').value = worker?.jobTitle || '';
  document.getElementById('workerPhone').value = worker?.phone || '';
  document.getElementById('workerSalary').value = worker?.salary ?? '';
  document.getElementById('workerVacationDays').value = worker?.vacationDaysPerYear ?? 21;
  document.getElementById('workerJoinDate').value = worker?.joinDate || '';
  document.getElementById('workerNotes').value = worker?.notes || '';
  openModal('workerModal');
}
document.getElementById('addWorkerBtn').addEventListener('click', ()=>openWorkerModal(null));

document.getElementById('saveWorkerBtn').addEventListener('click', ()=>{
  const name = document.getElementById('workerName').value.trim();
  if(!name){ showToast('اكتب اسم العامل'); return; }
  const jobTitle = document.getElementById('workerJobTitle').value.trim();
  const phone = document.getElementById('workerPhone').value.trim();
  const salary = Math.max(0, Number(document.getElementById('workerSalary').value) || 0);
  const vacationDaysPerYear = Math.max(0, Number(document.getElementById('workerVacationDays').value) || 0);
  const joinDate = document.getElementById('workerJoinDate').value;
  const notes = document.getElementById('workerNotes').value.trim();
  const editId = document.getElementById('editWorkerId').value;

  const workers = DB.getWorkers();
  if(editId){
    const idx = workers.findIndex(w=>w.id===editId);
    if(idx>-1) workers[idx] = { ...workers[idx], name, jobTitle, phone, salary, vacationDaysPerYear, joinDate, notes };
  } else {
    workers.push({ id: uid('wrk'), name, jobTitle, phone, salary, vacationDaysPerYear, joinDate, notes, createdAt: new Date().toISOString() });
  }
  DB.saveWorkers(workers);
  closeModal('workerModal');
  renderWorkersView();
  showToast('تم حفظ بيانات العامل');
});

function deleteWorker(id){
  const workers = DB.getWorkers();
  const target = workers.find(w=>w.id===id);
  if(!target) return;
  if(!confirm(`متأكد إنك عاوز تمسح العامل «${target.name}»؟ هيتمسح معاه سجل السلف والمنح والإجازات بتاعته.`)) return;
  DB.saveWorkers(workers.filter(w=>w.id!==id));
  DB.saveWorkerTxns(DB.getWorkerTxns().filter(t=>t.workerId!==id));
  DB.saveWorkerVacations(DB.getWorkerVacations().filter(v=>v.workerId!==id));
  renderWorkersView();
  showToast('تم حذف العامل');
}

/* ---- Worker detail (salary ledger + vacations) ---- */
let workerDetailId = null;
function openWorkerDetailModal(workerId){
  const worker = DB.getWorkers().find(w=>w.id===workerId);
  if(!worker) return;
  workerDetailId = workerId;
  renderWorkerDetail();
  openModal('workerDetailModal');
}

function renderWorkerDetail(){
  const worker = DB.getWorkers().find(w=>w.id===workerDetailId);
  if(!worker) return;
  document.getElementById('workerDetailName').textContent = `👷 ${worker.name}`;
  document.getElementById('workerDetailContact').innerHTML = `
    <span>الوظيفة: <strong>${escapeHtml(worker.jobTitle||'—')}</strong></span>
    <span>التليفون: <strong class="mono">${escapeHtml(worker.phone||'—')}</strong></span>
    ${worker.joinDate ? `<span>تاريخ التعيين: <strong class="mono">${new Date(worker.joinDate).toLocaleDateString('ar-EG')}</strong></span>` : ''}
    ${worker.notes ? `<span>ملاحظات: <strong>${escapeHtml(worker.notes)}</strong></span>` : ''}`;

  const advances = workerAdvancesTotal(worker.id);
  const grants = workerGrantsTotal(worker.id);
  const bonuses = workerBonusesTotal(worker.id);
  const net = workerNetDue(worker);
  document.getElementById('workerDetailStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">المرتب الأساسي</div><div class="stat-value mono">${money(worker.salary)}</div></div>
    <div class="stat-card warn"><div class="stat-label">إجمالي السلف</div><div class="stat-value mono">${money(advances)}</div></div>
    <div class="stat-card good"><div class="stat-label">إجمالي المنح</div><div class="stat-value mono">${money(grants)}</div></div>
    <div class="stat-card good"><div class="stat-label">إجمالي المكافآت</div><div class="stat-value mono">${money(bonuses)}</div></div>
    <div class="stat-card accent"><div class="stat-label">الصافي المستحق</div><div class="stat-value mono">${money(net)}</div></div>`;

  const txns = workerTxnsFor(worker.id);
  const txnsWrap = document.getElementById('workerDetailTxns');
  if(!txns.length){
    txnsWrap.innerHTML = '<div class="empty-note">لسه مفيش سلف أو منح أو مكافآت مسجلة</div>';
  } else {
    txnsWrap.innerHTML = '';
    [...txns].reverse().forEach(t=>{
      const row = document.createElement('div');
      row.className = 'contact-chip';
      row.innerHTML = `
        <span>${workerTxnTypeLabel(t.type)} — ${money(t.amount)} ج.م${t.note ? ' — '+escapeHtml(t.note) : ''}${t.isSettled ? ' <span class="credit-status settled">اتسوّت</span>' : ''}</span>
        <span class="mono">${new Date(t.date).toLocaleDateString('ar-EG')}</span>
        <button class="icon-btn" title="حذف">🗑️</button>`;
      row.querySelector('.icon-btn').onclick = ()=>deleteWorkerTxn(t.id);
      txnsWrap.appendChild(row);
    });
  }

  const used = workerVacationDaysUsed(worker.id);
  const remaining = workerVacationDaysRemaining(worker);
  document.getElementById('workerVacationSummary').innerHTML =
    `رصيد الإجازة السنوي: <strong>${worker.vacationDaysPerYear||0}</strong> يوم — المستخدم: <strong>${used}</strong> يوم — المتبقي: <strong>${remaining}</strong> يوم`;

  const vacations = workerVacationsFor(worker.id);
  const vacWrap = document.getElementById('workerDetailVacations');
  if(!vacations.length){
    vacWrap.innerHTML = '<div class="empty-note">لسه مفيش إجازات مسجلة</div>';
  } else {
    vacWrap.innerHTML = '';
    [...vacations].reverse().forEach(v=>{
      const row = document.createElement('div');
      row.className = 'contact-chip';
      row.innerHTML = `
        <span>🌴 ${v.days} يوم${v.note ? ' — '+escapeHtml(v.note) : ''}</span>
        <span class="mono">${v.startDate ? new Date(v.startDate).toLocaleDateString('ar-EG') : new Date(v.date).toLocaleDateString('ar-EG')}</span>
        <button class="icon-btn" title="حذف">🗑️</button>`;
      row.querySelector('.icon-btn').onclick = ()=>deleteWorkerVacation(v.id);
      vacWrap.appendChild(row);
    });
  }
}

document.getElementById('workerDetailEditBtn').addEventListener('click', ()=>{
  const worker = DB.getWorkers().find(w=>w.id===workerDetailId);
  if(!worker) return;
  closeModal('workerDetailModal');
  openWorkerModal(worker);
});

/* ---- Advance / grant / bonus (shared modal) ---- */
let workerTxnType = null;
function openWorkerTxnModal(type){
  workerTxnType = type;
  const titles = { advance: '💰 سلفة جديدة', grant: '🎁 منحة جديدة', bonus: '🏅 مكافأة جديدة' };
  document.getElementById('workerTxnTitle').textContent = titles[type];
  document.getElementById('workerTxnAmount').value = '';
  document.getElementById('workerTxnNote').value = '';
  openModal('workerTxnModal');
}
document.getElementById('workerAddAdvanceBtn').addEventListener('click', ()=>openWorkerTxnModal('advance'));
document.getElementById('workerAddGrantBtn').addEventListener('click', ()=>openWorkerTxnModal('grant'));
document.getElementById('workerAddBonusBtn').addEventListener('click', ()=>openWorkerTxnModal('bonus'));

document.getElementById('confirmWorkerTxnBtn').addEventListener('click', ()=>{
  if(!workerDetailId || !workerTxnType) return;
  const amount = Math.max(0, Number(document.getElementById('workerTxnAmount').value) || 0);
  if(amount <= 0){ showToast('اكتب المبلغ'); return; }
  const note = document.getElementById('workerTxnNote').value.trim();
  const cashier = AUTH.currentUser();
  const worker = DB.getWorkers().find(w=>w.id===workerDetailId);
  const txns = DB.getWorkerTxns();
  txns.push({
    id: uid('wtx'), workerId: workerDetailId, type: workerTxnType, amount, note,
    date: new Date().toISOString(), createdBy: cashier?.id || null, createdByName: cashier?.name || ''
  });
  DB.saveWorkerTxns(txns);
  // Only السلفة is cash leaving the drawer right now — منح/مكافآت are
  // just accrued and only actually paid out at تسوية المرتب.
  if(workerTxnType==='advance' && worker){
    logWorkerExpense(amount, worker.name, '💰 سلفة', note);
  }
  closeModal('workerTxnModal');
  showToast('تم الحفظ');
  renderWorkerDetail();
  renderWorkersView();
});

function deleteWorkerTxn(id){
  if(!confirm('متأكد إنك عاوز تمسح العملية دي؟')) return;
  DB.saveWorkerTxns(DB.getWorkerTxns().filter(t=>t.id!==id));
  renderWorkerDetail();
  renderWorkersView();
}

/* ---- Vacations ---- */
document.getElementById('workerAddVacationBtn').addEventListener('click', ()=>{
  const worker = DB.getWorkers().find(w=>w.id===workerDetailId);
  if(!worker) return;
  const remaining = workerVacationDaysRemaining(worker);
  document.getElementById('workerVacationModalRemaining').innerHTML =
    `المتبقي من رصيد الإجازة السنوي: <strong>${remaining}</strong> يوم`;
  document.getElementById('workerVacationDaysInput').value = 1;
  document.getElementById('workerVacationDaysInput').max = remaining || undefined;
  document.getElementById('workerVacationStartDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('workerVacationNote').value = '';
  openModal('workerVacationModal');
});

document.getElementById('confirmWorkerVacationBtn').addEventListener('click', ()=>{
  if(!workerDetailId) return;
  const worker = DB.getWorkers().find(w=>w.id===workerDetailId);
  if(!worker) return;
  const days = Math.max(1, Math.round(Number(document.getElementById('workerVacationDaysInput').value) || 0));
  if(days <= 0){ showToast('اكتب عدد أيام الإجازة'); return; }
  const remaining = workerVacationDaysRemaining(worker);
  if(days > remaining){ showToast(`العامل مستخدم رصيد إجازته، المتبقي بس ${remaining} يوم`); return; }
  const startDate = document.getElementById('workerVacationStartDate').value;
  const note = document.getElementById('workerVacationNote').value.trim();
  const vacations = DB.getWorkerVacations();
  vacations.push({ id: uid('vac'), workerId: workerDetailId, days, startDate, note, date: new Date().toISOString() });
  DB.saveWorkerVacations(vacations);
  closeModal('workerVacationModal');
  showToast('تم تسجيل الإجازة');
  renderWorkerDetail();
  renderWorkersView();
});

function deleteWorkerVacation(id){
  if(!confirm('متأكد إنك عاوز تمسح الإجازة دي؟')) return;
  DB.saveWorkerVacations(DB.getWorkerVacations().filter(v=>v.id!==id));
  renderWorkerDetail();
  renderWorkersView();
}

/* ---- Salary settlement (تسوية المرتب) ----
   Shows what's owed since the last settlement (base salary + this
   period's grants/bonuses - advances), then on confirm marks those
   txns as settled so the running balance goes back to zero. Vacation
   days are never touched here — they keep accruing/deducting as usual. */
function openSalarySettlementModal(){
  const worker = DB.getWorkers().find(w=>w.id===workerDetailId);
  if(!worker) return;
  const advances = workerAdvancesTotal(worker.id);
  const grants = workerGrantsTotal(worker.id);
  const bonuses = workerBonusesTotal(worker.id);
  const net = workerNetDue(worker);
  document.getElementById('salarySettlementTitle').textContent = `🧮 تسوية مرتب ${worker.name}`;
  document.getElementById('salarySettlementSummary').innerHTML = `
    <div class="sum-row"><span>المرتب الأساسي</span><span class="mono">${money(worker.salary)}</span></div>
    <div class="sum-row"><span>منح الفترة</span><span class="mono">${money(grants)}</span></div>
    <div class="sum-row"><span>مكافآت الفترة</span><span class="mono">${money(bonuses)}</span></div>
    <div class="sum-row"><span>سلف الفترة (بتتخصم)</span><span class="mono">- ${money(advances)}</span></div>
    <div class="sum-row total-row"><span>الصافي المستحق دلوقتي</span><span class="mono">${money(net)}</span></div>`;
  document.getElementById('salarySettlementLastDate').textContent = worker.lastSettledAt
    ? `آخر تسوية كانت يوم ${new Date(worker.lastSettledAt).toLocaleDateString('ar-EG')}`
    : 'لسه ما اتعملتش أي تسوية للعامل ده';
  openModal('salarySettlementModal');
}
document.getElementById('workerSettlementBtn').addEventListener('click', openSalarySettlementModal);

document.getElementById('confirmSalarySettlementBtn').addEventListener('click', ()=>{
  if(!workerDetailId) return;
  const workers = DB.getWorkers();
  const worker = workers.find(w=>w.id===workerDetailId);
  if(!worker) return;
  // Net actually paid out now = salary + هذه الفترة's grants/bonuses -
  // advances. The advances were already logged as an expense when
  // given, so subtracting them here (instead of double counting) means
  // "سلفة وقتها + هذا الصافي وقت التسوية" always sums to salary+grants+bonuses.
  const net = workerNetDue(worker);
  const now = new Date().toISOString();
  // Mark every currently-unsettled advance/grant/bonus as settled — the
  // log stays for history, but they stop counting toward what's owed.
  const txns = DB.getWorkerTxns();
  txns.forEach(t=>{ if(t.workerId===worker.id && !t.isSettled){ t.isSettled = true; t.settledAt = now; } });
  DB.saveWorkerTxns(txns);
  worker.lastSettledAt = now;
  DB.saveWorkers(workers);
  if(net > 0){
    logWorkerExpense(net, worker.name, '🧮 تسوية مرتب');
  }
  closeModal('salarySettlementModal');
  showToast('تمت تسوية المرتب ✓');
  renderWorkerDetail();
  renderWorkersView();
});

/* ---- Monthly log (سجل بكل شهر) ----
   Groups this worker's advances/grants/bonuses/vacations by calendar
   month (from their own dates), independent of settlement status —
   so past settled months stay visible here even after "تسوية المرتب"
   clears the running balance. */
function monthKeyOf(iso){ return iso ? iso.slice(0,7) : ''; } // 'YYYY-MM'
function monthLabelOf(key){
  const [y,m] = key.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('ar-EG', { year:'numeric', month:'long' });
}
function workerMonthKeys(workerId){
  const keys = new Set();
  workerTxnsFor(workerId).forEach(t=>keys.add(monthKeyOf(t.date)));
  workerVacationsFor(workerId).forEach(v=>keys.add(monthKeyOf(v.startDate || v.date)));
  return [...keys].filter(Boolean).sort().reverse();
}
function workerMonthData(workerId, monthKey){
  const txns = workerTxnsFor(workerId).filter(t=>monthKeyOf(t.date)===monthKey);
  const vacations = workerVacationsFor(workerId).filter(v=>monthKeyOf(v.startDate||v.date)===monthKey);
  const advances = txns.filter(t=>t.type==='advance').reduce((s,t)=>s+t.amount,0);
  const grants = txns.filter(t=>t.type==='grant').reduce((s,t)=>s+t.amount,0);
  const bonuses = txns.filter(t=>t.type==='bonus').reduce((s,t)=>s+t.amount,0);
  const vacationDays = vacations.reduce((s,v)=>s+v.days,0);
  return { txns, vacations, advances, grants, bonuses, vacationDays };
}

let workerMonthlyLogWorkerId = null;
function openWorkerMonthlyLogModal(){
  const worker = DB.getWorkers().find(w=>w.id===workerDetailId);
  if(!worker) return;
  workerMonthlyLogWorkerId = worker.id;
  document.getElementById('workerMonthlyLogTitle').textContent = `📜 سجل شهور ${worker.name}`;
  const months = workerMonthKeys(worker.id);
  const list = document.getElementById('workerMonthlyLogList');
  if(!months.length){
    list.innerHTML = '<div class="empty-note">لسه مفيش سلف أو منح أو مكافآت أو إجازات مسجلة للعامل ده</div>';
  } else {
    list.innerHTML = '';
    months.forEach(key=>{
      const d = workerMonthData(worker.id, key);
      const net = worker.salary + d.grants + d.bonuses - d.advances;
      const row = document.createElement('div');
      row.className = 'contact-chip clickable-row';
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <span><strong>${monthLabelOf(key)}</strong> — الصافي: ${money(net)} ج.م${d.vacationDays ? ` — 🌴 ${d.vacationDays} يوم إجازة` : ''}</span>
        <span class="mono">${d.txns.length} عملية</span>`;
      row.onclick = ()=>openWorkerMonthDetailModal(key);
      list.appendChild(row);
    });
  }
  closeModal('workerDetailModal');
  openModal('workerMonthlyLogModal');
}
document.getElementById('workerMonthlyLogBtn').addEventListener('click', openWorkerMonthlyLogModal);

function openWorkerMonthDetailModal(monthKey){
  const worker = DB.getWorkers().find(w=>w.id===workerMonthlyLogWorkerId);
  if(!worker) return;
  const d = workerMonthData(worker.id, monthKey);
  const net = worker.salary + d.grants + d.bonuses - d.advances;
  document.getElementById('workerMonthDetailTitle').textContent = `📅 ${worker.name} — ${monthLabelOf(monthKey)}`;
  document.getElementById('workerMonthDetailStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">المرتب الأساسي</div><div class="stat-value mono">${money(worker.salary)}</div></div>
    <div class="stat-card warn"><div class="stat-label">سلف الشهر</div><div class="stat-value mono">${money(d.advances)}</div></div>
    <div class="stat-card good"><div class="stat-label">منح الشهر</div><div class="stat-value mono">${money(d.grants)}</div></div>
    <div class="stat-card good"><div class="stat-label">مكافآت الشهر</div><div class="stat-value mono">${money(d.bonuses)}</div></div>
    <div class="stat-card accent"><div class="stat-label">الصافي عن الشهر ده</div><div class="stat-value mono">${money(net)}</div></div>`;

  const txnsWrap = document.getElementById('workerMonthDetailTxns');
  if(!d.txns.length){
    txnsWrap.innerHTML = '<div class="empty-note">مفيش سلف أو منح أو مكافآت في الشهر ده</div>';
  } else {
    txnsWrap.innerHTML = '';
    [...d.txns].reverse().forEach(t=>{
      const row = document.createElement('div');
      row.className = 'contact-chip';
      row.innerHTML = `
        <span>${workerTxnTypeLabel(t.type)} — ${money(t.amount)} ج.م${t.note ? ' — '+escapeHtml(t.note) : ''}</span>
        <span class="mono">${new Date(t.date).toLocaleDateString('ar-EG')}</span>`;
      txnsWrap.appendChild(row);
    });
  }

  const vacWrap = document.getElementById('workerMonthDetailVacations');
  if(!d.vacations.length){
    vacWrap.innerHTML = '<div class="empty-note">مفيش إجازات في الشهر ده</div>';
  } else {
    vacWrap.innerHTML = '';
    [...d.vacations].reverse().forEach(v=>{
      const row = document.createElement('div');
      row.className = 'contact-chip';
      row.innerHTML = `
        <span>🌴 ${v.days} يوم${v.note ? ' — '+escapeHtml(v.note) : ''}</span>
        <span class="mono">${v.startDate ? new Date(v.startDate).toLocaleDateString('ar-EG') : new Date(v.date).toLocaleDateString('ar-EG')}</span>`;
      vacWrap.appendChild(row);
    });
  }
  closeModal('workerMonthlyLogModal');
  openModal('workerMonthDetailModal');
}
document.getElementById('workerMonthDetailBackBtn').addEventListener('click', ()=>{
  closeModal('workerMonthDetailModal');
  openWorkerMonthlyLogModal();
});

/* =========================================================
   EXPENSES (المصاريف)
   No manual entry page anymore — expenses are computed
   automatically from two sources only:
   1) Supplier/purchase payments  → logSupplierExpense()
   2) Worker advances + salary settlements → logWorkerExpense()
   Both push into the same DB.EXPENSES ledger (with shiftId of
   whichever shift was open at the time), so shift cash
   reconciliation and reports keep working unchanged.
   ========================================================= */

/* =========================================================
   INVENTORY VIEW
   ========================================================= */
/* =========================================================
   LOW STOCK ALERTS
   Fires when any variant's quantity drops to/below the
   threshold set in الإعدادات. Shows an in-app toast + badge
   on "المخزون" always, and a real desktop notification if the
   browser permission was granted from الإعدادات. A variant is
   only re-announced once it rises back above the threshold and
   drops again, so opening the app doesn't spam the same items.
   ========================================================= */
function lowStockVariantList(threshold){
  const list = [];
  DB.getProducts().forEach(p=>p.variants.forEach(v=>{
    if(v.qty>0 && v.qty<=threshold) list.push({product:p, variant:v});
  }));
  return list;
}
function getNotifiedLowVariantIds(){ return JSON.parse(localStorage.getItem('pos_notified_low_variants')||'[]'); }
function saveNotifiedLowVariantIds(ids){ localStorage.setItem('pos_notified_low_variants', JSON.stringify(ids)); }

let lowStockCurrentItems = [];

function renderLowStockBadge(count){
  const badge = document.getElementById('lowStockBadge');
  if(!badge) return;
  if(count>0){ badge.textContent = count; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

function renderLowStockBar(lowItems){
  const bar = document.getElementById('lowStockBar');
  if(!lowItems.length){ bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  document.getElementById('lowStockBarText').textContent = lowItems.length===1
    ? 'صنف واحد قرب يخلص من المخزون'
    : `${lowItems.length} أصناف قربت تخلص من المخزون`;
}
document.getElementById('lowStockBar').addEventListener('click', ()=>openLowStockModal());
document.getElementById('lowStockBadge').addEventListener('click', e=>{
  e.stopPropagation();
  openLowStockModal();
});

function openLowStockModal(){
  const tbody = document.getElementById('lowStockTableBody');
  if(!lowStockCurrentItems.length){
    tbody.innerHTML = '<tr><td colspan="6" class="empty-note">الحمدلله مفيش أصناف قربت تخلص دلوقتي</td></tr>';
  } else {
    tbody.innerHTML = '';
    [...lowStockCurrentItems].sort((a,b)=>a.variant.qty-b.variant.qty).forEach(({product,variant})=>{
      const g = groupInfo(product.group);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(product.name)}</strong></td>
        <td>${g ? g.icon+' '+escapeHtml(g.label) : '—'}</td>
        <td class="mono">${escapeHtml(variant.size)}</td>
        <td>${escapeHtml(variant.color && variant.color!=='—' ? variant.color : '—')}</td>
        <td class="mono"><span class="size-card-count low">${variant.qty}</span></td>
        <td><button class="icon-btn" title="افتح في المخزون">📦</button></td>`;
      tr.querySelector('.icon-btn').onclick = ()=>{
        closeModal('lowStockModal');
        document.querySelector('.nav-item[data-view="inventory"]').click();
      };
      tbody.appendChild(tr);
    });
  }
  openModal('lowStockModal');
}

function sendDesktopNotification(title, body){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  try{ new Notification(title, { body }); } catch(e){ /* ignore */ }
}

function checkLowStockAndNotify(){
  const s = DB.getSettings();
  const alertsOn = s.lowStockAlertsOn !== false;
  const threshold = Math.max(1, Number(s.lowStockThreshold) || 3);
  const lowItems = alertsOn ? lowStockVariantList(threshold) : [];
  lowStockCurrentItems = lowItems;
  renderLowStockBadge(lowItems.length);
  renderLowStockBar(lowItems);
  if(!alertsOn) return;

  const stillLowIds = lowItems.map(x=>x.variant.id);
  const previouslyNotified = getNotifiedLowVariantIds();
  const newlyLow = lowItems.filter(x=>!previouslyNotified.includes(x.variant.id));
  saveNotifiedLowVariantIds(stillLowIds);
  if(!newlyLow.length) return;

  const describe = x => `${x.product.name}${x.variant.size?' — مقاس '+x.variant.size:''}${x.variant.color && x.variant.color!=='—' ? ' — '+x.variant.color : ''} (باقي ${x.variant.qty})`;
  const msg = newlyLow.length===1
    ? `⚠️ ${describe(newlyLow[0])} قرب يخلص`
    : `⚠️ ${newlyLow.length} أصناف قربت تخلص: ${newlyLow.slice(0,3).map(describe).join('، ')}${newlyLow.length>3 ? '...' : ''}`;
  showToast(msg);
  sendDesktopNotification('⚠️ تنبيه نقص مخزون', msg);
}

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
          <button class="icon-btn" title="طباعة باركود">🖨️</button>
          <button class="icon-btn" title="حذف">🗑️</button>
        </div>
      </td>`;
    tr.querySelector('[title="تعديل"]').onclick = ()=>openProductModal(p);
    tr.querySelector('[title="طباعة باركود"]').onclick = ()=>{
      if(!p.sku){ showToast('الصنف ده لسه ملوش كود/باركود — افتح تعديل الصنف ودوس توليد'); return; }
      printBarcodeLabels(p.name, p.price, p.sku);
    };
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

/* ---- Restock by barcode scan (المخزون) ---- */
const restockScanBtn = document.getElementById('restockScanBtn');
const restockInput = document.getElementById('restockInput');
const restockFeedback = document.getElementById('restockFeedback');
const restockResult = document.getElementById('restockResult');

restockScanBtn.addEventListener('click', ()=>{
  restockFeedback.innerHTML = '';
  restockResult.classList.add('hidden');
  restockInput.value = '';
  openModal('restockModal');
  setTimeout(()=>restockInput.focus(), 60);
});

restockInput.addEventListener('keydown', e=>{
  if(e.key === 'Enter'){
    e.preventDefault();
    handleRestockScan(restockInput.value);
    restockInput.value = '';
  }
});

let restockBurstTimer = null;
restockInput.addEventListener('input', ()=>{
  clearTimeout(restockBurstTimer);
  restockBurstTimer = setTimeout(()=>{
    if(restockInput.value.trim().length >= 3){
      handleRestockScan(restockInput.value);
      restockInput.value = '';
    }
  }, 250);
});

function handleRestockScan(raw){
  const code = raw.trim();
  if(!code) return;

  const products = DB.getProducts();

  // Barcode is per-item (product), not per size/color — match the product's
  // own code, then show all its size/color rows to restock from.
  const product = products.find(p => (p.sku||'').trim().toLowerCase() === code.toLowerCase());

  if(!product){
    restockResult.classList.add('hidden');
    restockFeedback.innerHTML = `<div class="barcode-msg error">✕ مفيش صنف بالكود «${escapeHtml(code)}»</div>`;
    return;
  }

  restockFeedback.innerHTML = '';
  renderRestockResult(product.id);
}

function renderRestockResult(productId, highlightVariantId){
  const product = DB.getProducts().find(p=>p.id===productId);
  if(!product){ restockResult.classList.add('hidden'); return; }

  restockResult.classList.remove('hidden');
  document.getElementById('restockProductHead').innerHTML = `
    <span class="rp-name">${escapeHtml(product.name)}</span>
    <span class="rp-sku">${escapeHtml(product.sku||'')}</span>`;

  const wrap = document.getElementById('restockVariantRows');
  wrap.innerHTML = '';

  if(!product.variants.length){
    wrap.innerHTML = `<div class="barcode-msg error">الصنف ده لسه ملوش مقاسات مضافة — عدّله من زرار التعديل</div>`;
    return;
  }

  product.variants.forEach(v=>{
    const row = document.createElement('div');
    row.className = 'restock-variant-row' + (highlightVariantId && v.id===highlightVariantId ? ' matched-scan' : '');
    row.innerHTML = `
      <span class="restock-variant-label">${escapeHtml(v.size)}${v.color && v.color!=='—' ? ' · '+escapeHtml(v.color) : ''}</span>
      <span class="restock-variant-qty">الحالي: ${v.qty}</span>
      <input type="number" min="1" value="1" data-vid="${v.id}">
      <button class="restock-add-btn" data-vid="${v.id}">+ إضافة</button>`;
    row.querySelector('.restock-add-btn').onclick = ()=>{
      const addQty = Math.max(1, Number(row.querySelector('input').value)||1);
      const products = DB.getProducts();
      const pIdx = products.findIndex(pp=>pp.id===product.id);
      if(pIdx===-1) return;
      const variant = products[pIdx].variants.find(vv=>vv.id===v.id);
      if(!variant) return;
      variant.qty = (variant.qty||0) + addQty;
      DB.saveProducts(products);
      checkLowStockAndNotify();
      showToast(`✓ اتزودت ${addQty} في ${product.name} — ${v.size}`);
      renderInventory();
      renderRestockResult(product.id);
      setTimeout(()=>restockInput.focus(), 30);
    };
    wrap.appendChild(row);
    if(highlightVariantId && v.id===highlightVariantId){
      setTimeout(()=>{ row.scrollIntoView({block:'nearest'}); row.querySelector('input').focus(); row.querySelector('input').select(); }, 30);
    }
  });
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
  document.getElementById('fSku').value = product ? (product.sku || '') : generateUniqueBarcodeCode();
  renderSkuBarcodePreview(document.getElementById('fSku').value);
  document.getElementById('fCost').value = product?.cost || '';
  document.getElementById('fPrice').value = product?.price || '';

  state.editSizeGroups = product ? groupVariantsBySizeForEdit(product.variants) : [{id:uid('sg'), size:'', colors:[{id:uid('v'), color:'', qty:0}]}];
  renderVariantRows();
  openModal('productModal');
}

/* ---- SKU / barcode generate + print (product modal) ----
   Sequential, starting at 1 — driven by a persistent counter in settings
   (not by scanning products.sku), so old-style long/random codes already
   saved on existing items never throw the sequence off. Advances the
   counter as soon as a number is handed out, so it's never reused. */
function generateUniqueBarcodeCode(){
  const settings = DB.getSettings();
  let n = Math.max(1, Number(settings.nextSkuNumber) || 1);
  const existing = new Set(DB.getProducts().map(p=>(p.sku||'').trim()));
  while(existing.has(String(n))) n++;
  settings.nextSkuNumber = n + 1;
  DB.saveSettings(settings);
  return String(n);
}

function renderSkuBarcodePreview(value){
  const holder = document.getElementById('fSkuBarcodePreview');
  const code = (value||'').trim();
  holder.innerHTML = '';
  if(!code || typeof JsBarcode === 'undefined') return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  holder.appendChild(svg);
  try{
    JsBarcode(svg, code, { format:'CODE128', displayValue:true, width:2, height:56, fontSize:13, margin:6 });
  }catch(err){
    holder.innerHTML = '';
  }
}

const fSkuInput = document.getElementById('fSku');
fSkuInput.addEventListener('input', ()=>{
  fSkuInput.value = normalizeBarcodeCode(fSkuInput.value);
  renderSkuBarcodePreview(fSkuInput.value);
});

document.getElementById('generateSkuBtn').addEventListener('click', ()=>{
  fSkuInput.value = generateUniqueBarcodeCode();
  renderSkuBarcodePreview(fSkuInput.value);
});

document.getElementById('printSkuBtn').addEventListener('click', ()=>{
  const code = fSkuInput.value.trim();
  if(!code){ showToast('محتاج تكتب كود أو تدوس توليد الأول'); return; }
  const name = document.getElementById('fName').value.trim() || 'صنف';
  const price = Number(document.getElementById('fPrice').value)||0;
  printBarcodeLabels(name, price, code);
});

function printBarcodeLabels(name, price, code){
  if(typeof JsBarcode === 'undefined'){
    showToast('مكتبة الباركود لسه بتتحمّل أو مقفولة على النت عندك — استنى شوية وجرّب تاني');
    return;
  }
  const copiesRaw = prompt('كام ملصق عايز تطبع؟', '1');
  if(copiesRaw===null) return;
  const copies = Math.max(1, Math.min(200, Number(copiesRaw)||1));
  const label = buildBarcodeLabelHtml(name, price, code);
  if(!label){ showToast('الكود ده مش صالح لطباعة باركود'); return; }
  openBarcodePrintWindow(label.repeat(copies));
}

/* Converts Arabic-Indic / Extended Arabic-Indic digits (٠١٢٣.. and ۰۱۲۳..)
   to plain ASCII digits, and strips anything CODE128 can't encode.
   Barcode fields are free-text inputs, so someone typing on an Arabic
   keyboard can end up with Arabic-Indic digits that look identical to
   normal numbers on screen but aren't valid CODE128 characters. */
function normalizeBarcodeCode(raw){
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const extArabicIndic = '۰۱۲۳۴۵۶۷۸۹';
  let out = String(raw||'').trim();
  out = out.replace(/[٠-٩]/g, ch => String(arabicIndic.indexOf(ch)));
  out = out.replace(/[۰-۹]/g, ch => String(extArabicIndic.indexOf(ch)));
  return out;
}

function buildBarcodeLabelHtml(name, price, code){
  const cleanCode = normalizeBarcodeCode(code);
  if(!cleanCode) return null;
  const tmp = document.createElementNS('http://www.w3.org/2000/svg','svg');
  tmp.style.position = 'absolute';
  tmp.style.opacity = '0';
  tmp.style.pointerEvents = 'none';
  document.body.appendChild(tmp);
  let ok = true;
  try{
    JsBarcode(tmp, cleanCode, { format:'CODE128', displayValue:true, width:2, height:50, fontSize:12, margin:4 });
  }catch(err){
    ok = false;
    console.error('باركود غير صالح:', code, err);
  }
  const svgHtml = ok ? tmp.outerHTML : '';
  document.body.removeChild(tmp);
  if(!ok) return null;
  return `
    <div class="label">
      <div class="label-name">${escapeHtml(name)}</div>
      ${svgHtml}
      <div class="label-price">${money(price)} ج.م</div>
    </div>`;
}

function openBarcodePrintWindow(labelsHtml){
  const win = window.open('', '_blank');
  if(!win){ showToast('المتصفح منع فتح نافذة الطباعة'); return; }

  win.document.write(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>طباعة باركود</title>
    <style>
      * { box-sizing:border-box; }
      body{ font-family:'Cairo',Arial,sans-serif; margin:0; padding:10px; background:#fff; }
      .labels{ display:flex; flex-wrap:wrap; gap:8px; }
      .label{
        width:200px; padding:10px; border:1px dashed #999; border-radius:6px;
        display:flex; flex-direction:column; align-items:center; text-align:center;
        page-break-inside:avoid;
      }
      .label-name{ font-size:13px; font-weight:700; color:#111; margin-bottom:4px; }
      .label-price{ font-size:14px; font-weight:800; color:#111; margin-top:2px; }
      svg{ max-width:100%; }
      @media print { .label{ border:none; } }
    </style>
    </head><body>
    <div class="labels">${labelsHtml}</div>
    <script>window.onload = () => { window.print(); };<\/script>
    </body></html>`);
  win.document.close();
}

function groupVariantsBySizeForEdit(variants){
  const groups = [];
  const bySize = new Map();
  (variants||[]).forEach(v=>{
    let g = bySize.get(v.size);
    if(!g){
      g = {id:uid('sg'), size:v.size, colors:[]};
      bySize.set(v.size, g);
      groups.push(g);
    }
    g.colors.push({id:v.id||uid('v'), color:v.color==='—'?'':v.color, qty:v.qty});
  });
  return groups;
}

function renderVariantRows(){
  const wrap = document.getElementById('variantRows');
  wrap.innerHTML = '';
  state.editSizeGroups.forEach((g,gIdx)=>{
    const group = document.createElement('div');
    group.className = 'size-group';

    const head = document.createElement('div');
    head.className = 'size-group-head';
    head.innerHTML = `
      <input type="text" placeholder="المقاس (مثال 42)" value="${escapeHtml(g.size)}" data-f="size">
      <button class="variant-remove" title="حذف المقاس ده وكل ألوانه">✕</button>`;
    head.querySelector('[data-f="size"]').oninput = e=>g.size=e.target.value;
    head.querySelector('.variant-remove').onclick = ()=>{
      state.editSizeGroups.splice(gIdx,1);
      renderVariantRows();
    };
    group.appendChild(head);

    const colorRows = document.createElement('div');
    colorRows.className = 'color-rows';
    g.colors.forEach((c,cIdx)=>{
      const row = document.createElement('div');
      row.className = 'color-row';
      row.innerHTML = `
        <div class="color-row-main">
          <input type="text" placeholder="اللون (مثال أحمر)" value="${escapeHtml(c.color)}" data-f="color">
          <input type="number" min="0" class="mono-input" placeholder="الكمية" value="${c.qty}" data-f="qty">
          <button class="variant-remove" title="حذف اللون ده">✕</button>
        </div>`;
      row.querySelector('[data-f="color"]').oninput = e=>c.color=e.target.value;
      row.querySelector('[data-f="qty"]').oninput = e=>c.qty=Number(e.target.value)||0;
      row.querySelector('.variant-remove').onclick = ()=>{
        g.colors.splice(cIdx,1);
        renderVariantRows();
      };
      colorRows.appendChild(row);
    });
    group.appendChild(colorRows);

    const addColorBtn = document.createElement('button');
    addColorBtn.type = 'button';
    addColorBtn.className = 'btn-ghost-sm add-color-btn';
    addColorBtn.textContent = '+ إضافة لون لنفس المقاس';
    addColorBtn.onclick = ()=>{
      g.colors.push({id:uid('v'), color:'', qty:0});
      renderVariantRows();
    };
    group.appendChild(addColorBtn);

    wrap.appendChild(group);
  });
}

document.getElementById('addVariantRow').addEventListener('click', ()=>{
  state.editSizeGroups.push({id:uid('sg'), size:'', colors:[{id:uid('v'), color:'', qty:0}]});
  renderVariantRows();
});

document.getElementById('saveProductBtn').addEventListener('click', ()=>{
  const name = document.getElementById('fName').value.trim();
  if(!name){ showToast('اكتب اسم الصنف'); return; }
  if(!state.editGroup){ showToast('اختار القسم: رجالي / حريمي / أطفال'); return; }
  const price = Number(document.getElementById('fPrice').value)||0;
  const cost = Number(document.getElementById('fCost').value)||0;

  const variants = [];
  state.editSizeGroups.forEach(g=>{
    const size = g.size.trim();
    if(!size) return;
    g.colors.forEach(c=>{
      variants.push({
        id:c.id||uid('v'), size, color:c.color.trim()||'—', qty:Math.max(0,c.qty||0)
      });
    });
  });

  const editId = document.getElementById('editProductId').value;
  const products = DB.getProducts();

  if(editId){
    const idx = products.findIndex(p=>p.id===editId);
    products[idx] = { ...products[idx], name, group:state.editGroup, brand:document.getElementById('fBrand').value.trim(),
      category:document.getElementById('fCategory').value.trim(), sku:normalizeBarcodeCode(document.getElementById('fSku').value),
      cost, price, variants };
  } else {
    products.push({
      id: uid('p'), name, group:state.editGroup, brand:document.getElementById('fBrand').value.trim(),
      category:document.getElementById('fCategory').value.trim(), sku:normalizeBarcodeCode(document.getElementById('fSku').value),
      cost, price, variants
    });
  }
  DB.saveProducts(products);
  checkLowStockAndNotify();
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
  renderExpensesTable();
}

const EXPENSE_CATEGORY_LABELS = {
  suppliers: '🚚 موردين', workers: '👷 عمال', rent: '🏠 إيجار', bills: '💡 فواتير',
  maintenance: '🔧 صيانة', marketing: '📣 تسويق', other: '📦 أخرى'
};

function renderExpensesTable(){
  const tbody = document.getElementById('expensesTableBody');
  const expenses = [...expensesForReportRange()].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!expenses.length){
    tbody.innerHTML = '<tr><td colspan="4" class="empty-note">مفيش مصروفات في الفترة دي</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  expenses.forEach(e=>{
    const tr = document.createElement('tr');
    const catLabel = EXPENSE_CATEGORY_LABELS[e.category] || e.category || '—';
    tr.innerHTML = `
      <td class="mono">${new Date(e.date).toLocaleDateString('ar-EG')}</td>
      <td>${escapeHtml(catLabel)}</td>
      <td>${escapeHtml(e.note||'—')}</td>
      <td class="mono">${money(e.amount)}</td>`;
    tbody.appendChild(tr);
  });
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
      <td>
        <button class="icon-btn" title="عرض الفاتورة">🧾</button>
        <button class="icon-btn" title="تعديل / استرجاع">✏️</button>
      </td>`;
    const [viewBtn, editBtn] = tr.querySelectorAll('.icon-btn');
    viewBtn.onclick = ()=>showReceipt(o);
    editBtn.onclick = ()=>openOrderEditModal(o);
    tbody.appendChild(tr);
  });
}

/* =========================================================
   EDIT / RETURN INVOICE (from Reports > سجل الفواتير)
   بترجع أصناف من فاتورة اتباعت، تحدّث المخزون تلقائيًا، وتعيد
   حساب إجمالي الفاتورة وحساب المتعامل (لو فيه متعامل مرتبط).
   ========================================================= */
const orderEditState = { orderId: null, rows: [] };

function openOrderEditModal(order){
  orderEditState.orderId = order.id;
  orderEditState.rows = order.items.map(it=>({
    productId: it.productId, variantId: it.variantId,
    name: it.name, size: it.size, color: it.color,
    price: it.price, qty: it.qty, returnedQty: it.returnedQty || 0
  }));
  document.getElementById('orderEditTitle').textContent = `✏️ تعديل الفاتورة #${order.number}`;
  renderOrderEditRows();
  openModal('orderEditModal');
}

function renderOrderEditRows(){
  const tbody = document.getElementById('orderEditItemsBody');
  tbody.innerHTML = '';
  orderEditState.rows.forEach((row, idx)=>{
    const remaining = row.qty - row.returnedQty;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.name)} (${escapeHtml(row.size)}/${escapeHtml(row.color)})</td>
      <td class="mono">${money(row.price)}</td>
      <td class="mono">${row.qty}</td>
      <td><input type="number" class="order-edit-return-input" data-idx="${idx}" min="0" max="${row.qty}" step="1" value="${row.returnedQty}"></td>
      <td class="mono order-edit-remaining" data-idx="${idx}">${remaining}</td>
      <td><button class="btn-ghost-sm" data-idx="${idx}" data-action="return-all">استرجاع الكل</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.order-edit-return-input').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const idx = Number(inp.dataset.idx);
      const row = orderEditState.rows[idx];
      let val = Math.round(Number(inp.value) || 0);
      val = Math.max(0, Math.min(val, row.qty));
      inp.value = val;
      row.returnedQty = val;
      const cell = tbody.querySelector(`.order-edit-remaining[data-idx="${idx}"]`);
      if(cell) cell.textContent = row.qty - row.returnedQty;
      renderOrderEditSummary();
    });
  });
  tbody.querySelectorAll('[data-action="return-all"]').forEach(btn=>{
    btn.onclick = ()=>{
      const idx = Number(btn.dataset.idx);
      orderEditState.rows[idx].returnedQty = orderEditState.rows[idx].qty;
      renderOrderEditRows();
    };
  });
  renderOrderEditSummary();
}

function computeOrderEditTotals(){
  const products = DB.getProducts();
  let subtotal = 0, cost = 0;
  orderEditState.rows.forEach(row=>{
    const remaining = row.qty - row.returnedQty;
    subtotal += row.price * remaining;
    const product = products.find(p=>p.id===row.productId);
    cost += (product ? product.cost : 0) * remaining;
  });
  return { subtotal, cost };
}

function renderOrderEditSummary(){
  const orders = DB.getOrders();
  const order = orders.find(o=>o.id===orderEditState.orderId);
  if(!order) return;
  const { subtotal } = computeOrderEditTotals();
  const discount = Math.min(order.discount || 0, subtotal);
  const newTotal = Math.max(0, subtotal - discount);
  const returnedAmount = Math.max(0, order.total - newTotal);
  document.getElementById('orderEditSummary').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">إجمالي الفاتورة الأصلي</div>
      <div class="stat-value mono">${money(order.total)}</div>
    </div>
    <div class="stat-card warn">
      <div class="stat-label">قيمة المرتجع</div>
      <div class="stat-value mono">${money(returnedAmount)}</div>
    </div>
    <div class="stat-card good">
      <div class="stat-label">الإجمالي بعد الاسترجاع</div>
      <div class="stat-value mono">${money(newTotal)}</div>
    </div>`;
}

document.getElementById('saveOrderEditBtn').addEventListener('click', ()=>{
  const orders = DB.getOrders();
  const order = orders.find(o=>o.id===orderEditState.orderId);
  if(!order) return;

  const products = DB.getProducts();
  const oldTotal = order.total;

  orderEditState.rows.forEach((row, idx)=>{
    const origItem = order.items[idx];
    const oldReturned = origItem.returnedQty || 0;
    const delta = row.returnedQty - oldReturned; // موجب = بيترجع دلوقتي، سالب = إلغاء استرجاع سابق
    if(delta !== 0){
      const product = products.find(p=>p.id===row.productId);
      const variant = product?.variants.find(v=>v.id===row.variantId);
      if(variant) variant.qty = Math.max(0, variant.qty + delta);
    }
    origItem.returnedQty = row.returnedQty;
  });
  DB.saveProducts(products);

  const { subtotal, cost } = computeOrderEditTotals();
  order.discount = Math.min(order.discount || 0, subtotal);
  order.subtotal = subtotal;
  order.cost = cost;
  order.total = Math.max(0, subtotal - order.discount);
  order.edited = true;
  order.lastEditedAt = new Date().toISOString();

  if(order.customerId){
    const customers = DB.getCustomers();
    const customer = customers.find(c=>c.id===order.customerId);
    if(customer){
      const diff = oldTotal - order.total; // القيمة اللي اترجعت من حساب المتعامل
      if(diff !== 0) customer.purchaseTotal = Math.max(0, (customer.purchaseTotal || 0) - diff);
      DB.saveCustomers(customers);
    }
  }

  DB.saveOrders(orders);
  checkLowStockAndNotify();
  closeModal('orderEditModal');
  showToast('اتحفظت تعديلات الفاتورة، والمخزون اتحدث تلقائيًا');
  renderReports();
});

/* =========================================================
   SETTINGS VIEW
   ========================================================= */
function loadSettingsForm(){
  const s = DB.getSettings();
  document.getElementById('setStoreName').value = s.storeName;
  document.getElementById('setStoreInfo').value = s.storeInfo;
  document.getElementById('setTaxRate').value = s.taxRate;
  document.getElementById('setPointsRate').value = s.pointsPerCurrency || 0;
  document.getElementById('setCardFeeRate').value = s.cardFeeRate;
  document.getElementById('setLowStockOn').checked = s.lowStockAlertsOn !== false;
  document.getElementById('setLowStockThreshold').value = s.lowStockThreshold || 3;
  document.getElementById('invShowStoreInfo').checked = s.invoiceFields.storeInfo !== false;
  document.getElementById('invShowCashier').checked = s.invoiceFields.cashier !== false;
  document.getElementById('invShowDiscount').checked = s.invoiceFields.discount !== false;
  document.getElementById('invShowPaymentMethod').checked = s.invoiceFields.paymentMethod !== false;
  document.getElementById('invShowCustomerInfo').checked = s.invoiceFields.customerInfo !== false;
  document.getElementById('invShowCustomerPhone').checked = s.invoiceFields.customerPhone !== false;
  document.getElementById('invShowPoints').checked = s.invoiceFields.points !== false;
  document.getElementById('invShowThankYou').checked = s.invoiceFields.thankYou !== false;
  document.getElementById('setThankYouMessage').value = s.thankYouMessage || '';
  updateDesktopNotifsStatus();
}

function updateDesktopNotifsStatus(){
  const el = document.getElementById('desktopNotifsStatus');
  if(!('Notification' in window)){
    el.textContent = 'المتصفح ده مش بيدعم تنبيهات سطح المكتب — التنبيهات جوه البرنامج هتفضل شغالة.';
  } else if(Notification.permission==='granted'){
    el.textContent = '✓ تنبيهات سطح المكتب مفعّلة.';
  } else if(Notification.permission==='denied'){
    el.textContent = 'التنبيهات متمنوعة من إعدادات المتصفح — فعّلها من هناك لو عايز.';
  } else {
    el.textContent = 'دوس الزرار فوق عشان توصلك تنبيهات حتى لو الصفحة مش فاتحة قدامك.';
  }
}
document.getElementById('enableDesktopNotifsBtn').addEventListener('click', ()=>{
  if(!('Notification' in window)){ showToast('المتصفح ده مش بيدعم تنبيهات سطح المكتب'); return; }
  Notification.requestPermission().then(()=>updateDesktopNotifsStatus());
});

document.getElementById('saveSettingsBtn').addEventListener('click', ()=>{
  const s = {
    storeName: document.getElementById('setStoreName').value.trim() || 'محل الأحذية',
    storeInfo: document.getElementById('setStoreInfo').value.trim(),
    taxRate: Number(document.getElementById('setTaxRate').value)||0,
    pointsPerCurrency: Math.max(0, Number(document.getElementById('setPointsRate').value)||0),
    cardFeeRate: Math.max(0, Number(document.getElementById('setCardFeeRate').value)||0),
    lowStockAlertsOn: document.getElementById('setLowStockOn').checked,
    lowStockThreshold: Math.max(1, Number(document.getElementById('setLowStockThreshold').value)||3),
    nextSkuNumber: DB.getSettings().nextSkuNumber,
    thankYouMessage: document.getElementById('setThankYouMessage').value.trim(),
    invoiceFields: {
      storeInfo: document.getElementById('invShowStoreInfo').checked,
      cashier: document.getElementById('invShowCashier').checked,
      discount: document.getElementById('invShowDiscount').checked,
      paymentMethod: document.getElementById('invShowPaymentMethod').checked,
      customerInfo: document.getElementById('invShowCustomerInfo').checked,
      customerPhone: document.getElementById('invShowCustomerPhone').checked,
      points: document.getElementById('invShowPoints').checked,
      thankYou: document.getElementById('invShowThankYou').checked
    }
  };
  DB.saveSettings(s);
  document.getElementById('storeNameLabel').textContent = s.storeName;
  showToast('تم حفظ الإعدادات');
  checkLowStockAndNotify();
});

document.getElementById('resetDataBtn').addEventListener('click', ()=>{
  if(confirm('متأكد؟ هيتم مسح كل الأصناف والفواتير نهائيًا.')){
    localStorage.removeItem(DB.KEYS.PRODUCTS);
    localStorage.removeItem(DB.KEYS.ORDERS);
    seedIfEmpty();
    state.salesStep = 'groups';
    state.selectedGroup = null;
    state.selectedProductId = null;
    state.selectedColor = null;
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
  ensureCustomerCodes();
  renderSales();
  renderCart();
  if(checkLoginGate()) checkShiftGate();
})();
