// ===== helpers =====
const $app = document.getElementById('app'), $nav = document.getElementById('nav'), TZ = 'Asia/Kolkata';
const tok = () => localStorage.getItem('token');
const me = () => JSON.parse(localStorage.getItem('user') || 'null');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
const fmtRange = (d) => `${fmtTime(d)} – ${fmtTime(+new Date(d) + 3600000)}`;
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const fmtHour = (h) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

// one place that talks to the backend: adds the token, throws readable errors
async function api(path, o = {}) {
  const r = await fetch('/api' + path, {
    method: o.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(tok() ? { Authorization: 'Bearer ' + tok() } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && tok()) logout();
  if (!r.ok) throw new Error(d.error?.message || 'Request failed');
  return d;
}
function logout() { localStorage.clear(); location.hash = '#/login'; render(); }
let toastT;
function toast(m, bad) {
  const t = document.getElementById('toast');
  t.textContent = (bad ? '⚠ Error: ' : '') + m; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), 4000);
}
const errBox = (e, act) => `<p class="note err" role="alert">⚠ Error: ${esc(e)} ${act ? `<button class="btn ghost" data-act="${act}">Try again</button>` : ''}</p>`;

// ===== forms: inline validation =====
const need = (l) => (v) => (v ? '' : l + ' is required');
const mail = (v) => (!v ? 'Email is required' : /^\S+@\S+\.\S+$/.test(v) ? '' : 'Please enter a valid email address');
const RULES = {
  'l-email': mail, 'l-pass': need('Password'), 'r-name': need('Name'), 'r-email': mail,
  'r-pass': (v) => (v.length < 6 ? 'Password must be at least 6 characters' : ''),
  'c-date': need('Date'), 'k-code': need('Code'),
};
const field = (id, label, type = 'text', extra = '') =>
  `<div class="f"><label for="${id}">${label}</label><input id="${id}" type="${type}" ${extra} aria-describedby="${id}-e"><p class="fe" id="${id}-e"></p></div>`;
function setErr(i, m) {
  document.getElementById(i.id + '-e').textContent = m ? '⚠ ' + m : '';
  i.setAttribute('aria-invalid', m ? 'true' : 'false');
}
const val = (i) => (i.type === 'password' ? i.value : i.value.trim());
function validate(form) {
  let ok = true;
  form.querySelectorAll('input').forEach((i) => { const r = RULES[i.id]; if (r) { const m = r(val(i)); setErr(i, m); if (m) ok = false; } });
  return ok;
}
$app.addEventListener('focusout', (e) => { const r = RULES[e.target.id]; if (r) setErr(e.target, r(val(e.target))); });

const FORMS = {
  'f-login': async (v) => {
    const d = await api('/auth/login', { method: 'POST', body: { email: v('l-email'), password: v('l-pass') } });
    localStorage.setItem('token', d.token); localStorage.setItem('user', JSON.stringify(d.user));
    location.hash = '#/sessions';
  },
  'f-reg': async (v) => {
    await api('/auth/register', { method: 'POST', body: { name: v('r-name'), email: v('r-email'), password: v('r-pass') } });
    location.hash = '#/login'; toast('Account created. Please sign in.');
  },
  'f-create': async (v) => {
    await api('/sessions', { method: 'POST', body: { date: v('c-date'), hour: +v('c-hour') } });
    loadAdminSessions(); return '✓ Session created';
  },
  'f-checkin': async (v) => {
    const r = await api('/checkin', { method: 'POST', body: { code: v('k-code') } });
    document.getElementById('k-code').value = ''; return `✓ Code verified: ${r.name} marked present`;
  },
};
$app.onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button'), msg = f.querySelector('.fmsg');
  if (!validate(f)) return;
  btn.disabled = true; msg.textContent = ''; msg.style.color = '';
  try {
    const ok = await FORMS[f.id]((id) => { const i = f.querySelector('#' + id); return i.type === 'password' ? i.value : i.value.trim(); });
    if (ok) { msg.style.color = 'var(--ok)'; msg.textContent = ok; }
  } catch (err) { msg.textContent = '⚠ Error: ' + err.message; }
  btn.disabled = false;
};

// ===== page: login / register =====
function pageAuth(reg) {
  $app.innerHTML = `<div class="auth card"><img src="/images/logo.svg" alt="">
  <h1>${reg ? 'Get started' : 'Welcome back'}</h1>
  <p class="muted">${reg ? 'Create an account to book your first slot.' : 'Enter your details to access your account.'}</p>
  <form id="${reg ? 'f-reg' : 'f-login'}" novalidate>
    ${reg ? field('r-name', 'Full name', 'text', 'autocomplete="name"') : ''}
    ${field(reg ? 'r-email' : 'l-email', 'Email address', 'email', 'autocomplete="email"')}
    ${field(reg ? 'r-pass' : 'l-pass', 'Password', 'password', `autocomplete="${reg ? 'new' : 'current'}-password"`)}
    <p class="fmsg" role="status"></p>
    <button class="btn" type="submit">${reg ? 'Create account' : 'Sign in'}</button>
  </form>
  <p class="swap">${reg ? 'Already have an account? <a href="#/login">Sign in</a>' : 'Don\'t have an account? <a href="#/register">Sign up</a>'}</p></div>`;
}

// ===== page: sessions =====
let timer, sessions = [], date = dayKey(Date.now()), loadState = 'loading', err = '', lastHtml = '';
const busy = new Set();
function pageSessions() {
  clearInterval(timer); sessions = []; lastHtml = '';
  const pills = [...Array(7).keys()].map((i) => {
    const k = dayKey(Date.now() + i * 86400000);
    return `<button class="pill" data-act="day" data-day="${k}" aria-pressed="${k === date}">${fmtDay(k + 'T00:00:00+05:30')}</button>`;
  }).join('');
  $app.innerHTML = `<h1>Available sessions</h1>
  <div class="row"><div class="pills" role="group" aria-label="Pick a day">${pills}</div>
  <div><label class="inl" for="dp">Or pick a date</label><input type="date" id="dp" value="${date}"></div></div>
  <p class="muted">Showing sessions for ${fmtDay(date + 'T00:00:00+05:30')}. <span id="stamp"></span></p>
  <div id="list" aria-live="polite"></div>`;
  loadSessions(true);
  timer = setInterval(() => loadSessions(), 5000); // seats refresh by polling
}
async function loadSessions(first) {
  if (busy.size && !first) return;
  if (first) { loadState = 'loading'; drawList(); }
  try { const d = await api('/sessions?date=' + date); if (busy.size) return; sessions = d; loadState = 'ok'; }
  catch (e) { if (loadState !== 'ok') { loadState = 'error'; err = e.message; } }
  drawList();
  const st = document.getElementById('stamp');
  if (st && loadState === 'ok') st.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { timeZone: TZ });
}
function drawList() {
  const el = document.getElementById('list'); if (!el) return;
  const h = loadState === 'loading' ? '<p class="note">Loading sessions…</p>'
    : loadState === 'error' ? errBox(err, 'retry')
      : !sessions.length ? '<p class="note">No sessions on this day.</p>'
        : '<div class="grid">' + sessions.map(card).join('') + '</div>';
  if (h !== lastHtml) { el.innerHTML = h; lastHtml = h; }
}
function card(s) {
  const dis = busy.has(s.id) ? 'disabled' : '', started = new Date(s.startAt) <= new Date();
  const btn = (act, label, cls = '') => `<button class="btn ${cls}" data-act="${act}" data-id="${s.id}" ${dis}>${label}</button>`;
  const act = started ? '<p class="muted">Session started</p>'
    : s.bookingId ? `<p class="ok">✓ Booked. Your code is in My Bookings.</p>${btn('cancel', 'Cancel booking', 'danger')}`
      : s.seatsLeft > 0 ? btn('book', 'Book session')
        : s.waitlisted ? `<p class="warn">Session full. You are on the waitlist.</p>${btn('leave', 'Leave waitlist', 'ghost')}`
          : `<p class="bad">Session full</p>${btn('join', 'Join waitlist', 'ghost')}`;
  return `<article class="card"><h2>${fmtRange(s.startAt)}</h2><p class="${s.seatsLeft > 0 ? 'ok' : 'muted'}">${s.seatsLeft} seats left</p>${act}</article>`;
}
async function doAct(act, id) {
  const s = sessions.find((x) => x.id === id); if (!s || busy.has(id)) return;
  const snap = { ...s }; busy.add(id);
  // optimistic: change the screen first, roll back if the server says no
  if (act === 'book') { s.seatsLeft--; s.bookingId = 'pending'; }
  if (act === 'cancel') { s.seatsLeft++; s.bookingId = null; }
  if (act === 'join') s.waitlisted = true;
  if (act === 'leave') s.waitlisted = false;
  drawList();
  try {
    if (act === 'book') await api(`/sessions/${id}/book`, { method: 'POST' });
    if (act === 'cancel') await api(`/bookings/${snap.bookingId}`, { method: 'DELETE' });
    if (act === 'join') await api(`/sessions/${id}/waitlist`, { method: 'POST' });
    if (act === 'leave') await api(`/sessions/${id}/waitlist`, { method: 'DELETE' });
  } catch (e) { Object.assign(s, snap); toast(e.message, true); }
  busy.delete(id); loadSessions();
}

// ===== page: my bookings =====
async function pageBookings() {
  $app.innerHTML = '<h1>My bookings</h1><div id="bk" aria-live="polite"><p class="note">Loading…</p></div>';
  drawBookings();
}
async function drawBookings() {
  const el = document.getElementById('bk'); if (!el) return;
  try {
    const d = await api('/bookings/me'), live = d.bookings.filter((b) => b.status === 'confirmed');
    if (!live.length && !d.waitlist.length) { el.innerHTML = '<p class="note">No bookings yet. <a href="#/sessions">Browse sessions</a></p>'; return; }
    const when = (t) => `${fmtDay(t)}, ${fmtRange(t)}`;
    el.innerHTML = '<h2>Active bookings</h2>' + (live.length ? live.map((b) =>
      `<article class="card bk"><div><h3>${when(b.startAt)}</h3><p class="${b.checkedIn ? 'ok' : 'muted'}">${b.checkedIn ? '✓ Checked in' : 'Confirmed. Show this code at the desk'}</p></div>
      <div class="code" aria-label="Check-in code ${esc(b.code.split('').join(' '))}">${esc(b.code)}</div>
      <button class="btn danger" data-act="cancelb" data-id="${b.id}" ${new Date(b.startAt) <= new Date() ? 'disabled' : ''}>Cancel booking</button></article>`).join('') : '<p class="note">None.</p>')
      + '<h2>My waitlists</h2>' + (d.waitlist.length ? d.waitlist.map((w) =>
        `<article class="card bk"><div><h3>${when(w.startAt)}</h3><p class="warn">On the waitlist</p></div>
      <button class="btn ghost" data-act="leaveb" data-id="${w.sessionId}">Leave waitlist</button></article>`).join('') : '<p class="note">None.</p>');
  } catch (e) { el.innerHTML = errBox(e.message, 'retryb'); }
}
async function doBooking(b, act, id) {
  b.disabled = true;
  try {
    await api(act === 'cancelb' ? `/bookings/${id}` : `/sessions/${id}/waitlist`, { method: 'DELETE' });
    toast(act === 'cancelb' ? 'Booking cancelled' : 'Left waitlist');
  } catch (e) { toast(e.message, true); }
  drawBookings();
}

// ===== page: admin =====
function pageAdmin() {
  const today = dayKey(Date.now()), hours = [...Array(24).keys()].map((h) => `<option value="${h}">${fmtHour(h)}</option>`).join('');
  $app.innerHTML = `<h1>Admin portal</h1><div class="grid3">
  <section class="card"><h2>Create session</h2><form id="f-create" novalidate>
    ${field('c-date', 'Date', 'date', `value="${today}" min="${today}"`)}
    <div class="f"><label for="c-hour">Start hour</label><select id="c-hour">${hours}</select></div>
    <p class="muted">Capacity: 20 seats. One hour long.</p><p class="fmsg" role="status"></p>
    <button class="btn" type="submit">Create session</button></form></section>
  <section class="card"><h2>Session bookings</h2>
    <div class="f"><label for="ad">Date</label><input type="date" id="ad" value="${today}"></div>
    <div class="f"><label for="as">Session</label><select id="as"></select></div>
    <div id="ab" aria-live="polite"></div></section>
  <section class="card"><h2>Check-in member</h2><form id="f-checkin" novalidate>
    ${field('k-code', 'Enter 6-character code', 'text', 'autocomplete="off" maxlength="6" style="text-transform:uppercase"')}
    <p class="fmsg" role="status"></p><button class="btn" type="submit">Verify and check in</button></form></section></div>`;
  loadAdminSessions();
}
async function loadAdminSessions() {
  const ad = document.getElementById('ad'), as = document.getElementById('as'), ab = document.getElementById('ab'); if (!ad) return;
  ab.innerHTML = '<p class="note">Loading…</p>';
  try {
    const d = await api('/sessions?date=' + ad.value);
    as.innerHTML = d.length ? d.map((s) => `<option value="${s.id}">${fmtRange(s.startAt)}</option>`).join('') : '<option value="">No sessions</option>';
    if (d.length) loadAdminBookings(d[0].id); else ab.innerHTML = '<p class="note">No sessions on this date.</p>';
  } catch (e) { ab.innerHTML = errBox(e.message); }
}
async function loadAdminBookings(id) {
  const ab = document.getElementById('ab'); if (!ab || !id) return;
  ab.innerHTML = '<p class="note">Loading…</p>';
  try {
    const d = await api(`/sessions/${id}/bookings`), live = d.filter((b) => b.status === 'confirmed');
    ab.innerHTML = `<p class="muted">${live.length} confirmed</p>` + (d.length ? '<ul class="list">' + d.map((b) =>
      `<li>${esc(b.name)} <span class="muted">(${esc(b.email)})</span>: ${b.status === 'cancelled' ? 'Cancelled' : b.checkedIn ? 'Present ✓' : 'Confirmed'}</li>`).join('') + '</ul>' : '<p class="note">No bookings yet.</p>');
  } catch (e) { ab.innerHTML = errBox(e.message); }
}

// ===== clicks and changes (one listener each) =====
$app.onclick = (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, id, day } = b.dataset;
  if (act === 'day') { date = day; pageSessions(); }
  else if (act === 'retry') loadSessions(true);
  else if (act === 'retryb') drawBookings();
  else if (act === 'cancelb' || act === 'leaveb') doBooking(b, act, id);
  else doAct(act, id);
};
$app.onchange = (e) => {
  if (e.target.id === 'dp' && e.target.value) { date = e.target.value; pageSessions(); }
  if (e.target.id === 'ad') loadAdminSessions();
  if (e.target.id === 'as') loadAdminBookings(e.target.value);
};

// ===== router with protected routes =====
function drawNav(r) {
  const u = me(), a = (h, t) => `<a href="#/${h}" ${r === h ? 'aria-current="page"' : ''}>${t}</a>`;
  $nav.innerHTML = u ? a('sessions', 'Sessions') + a('bookings', 'My Bookings') + (u.role === 'admin' ? a('admin', 'Admin') : '') + '<button id="out">Log out</button>' : '';
  if (u) document.getElementById('out').onclick = logout;
}
function render() {
  clearInterval(timer);
  const r = (location.hash.slice(2) || 'sessions'), authed = !!tok(), pub = r === 'login' || r === 'register';
  if (!authed && !pub) { location.hash = '#/login'; return; }
  if (authed && pub) { location.hash = '#/sessions'; return; }
  if (r === 'admin' && me()?.role !== 'admin') { location.hash = '#/sessions'; return; }
  drawNav(r);
  ({ login: () => pageAuth(false), register: () => pageAuth(true), sessions: pageSessions, bookings: pageBookings, admin: pageAdmin }[r] || pageSessions)();
  $app.focus();
}
addEventListener('hashchange', render);
render();
