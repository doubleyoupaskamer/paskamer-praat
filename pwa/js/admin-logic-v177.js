'use strict';

// ── Firebase ──────────────────────────────────────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyD28TOHwxX8gMWKbdaLZDtTVZh3V9BHcA8",
  authDomain:        "doubleyou-journal.firebaseapp.com",
  projectId:         "doubleyou-journal",
  storageBucket:     "doubleyou-journal.firebasestorage.app",
  messagingSenderId: "271740812679",
  appId:             "1:271740812679:web:ae49188253c573892f6722"
});
const auth = firebase.auth();
const db   = firebase.firestore();

// ── Constanten ────────────────────────────────────────────────
const OWNER  = 'ahtVa6qvFheIy3yDVpDXCz2INwq1'; // mozenlow2023@gmail.com
const OWNER2 = 'vpEOxNajQ1Mu3iPiGZnkPg1asGc2'; // williamdevriesis@gmail.com
let   _admins = [OWNER];
let   _currentTab = 'dash';
let   _unsubs = [];

// ── Live events buffer ────────────────────────────────────────
let _evs = [];

// ── Auth ──────────────────────────────────────────────────────
document.getElementById('ap').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

function doLogin() {
  const e = document.getElementById('ae').value.trim();
  const p = document.getElementById('ap').value;
  document.getElementById('aerr').textContent = '';
  auth.signInWithEmailAndPassword(e, p)
    .catch(err => { document.getElementById('aerr').textContent = 'Fout: ' + err.message; });
}
function doLogout() { auth.signOut(); }

async function loadAdminUids() {
  try {
    const snap = await db.collection('admin_access').get();
    _admins = [OWNER, OWNER2, ...snap.docs.map(d => d.id)];
  } catch(e) { _admins = [OWNER, OWNER2]; }
}

auth.onAuthStateChanged(async user => {
  if (!user) {
    show('auth'); hide('shell'); return;
  }
  await loadAdminUids();
  if (!_admins.includes(user.uid)) {
    document.getElementById('aerr').textContent = 'Geen toegang. Vraag de eigenaar om jou toe te voegen als admin.';
    auth.signOut(); return;
  }
  hide('auth'); show('shell');
  // Toon email + zoek admin label in admin_access
  document.getElementById('nav-email').textContent = user.email;
  if (user.uid !== OWNER && user.uid !== OWNER2) {
    db.collection('admin_access').doc(user.uid).get()
      .then(function(d) {
        if (d.exists && d.data().label) {
          document.getElementById('nav-email').textContent = d.data().label + ' · ' + user.email;
        }
      }).catch(function(){});
  } else {
    document.getElementById('nav-email').textContent = 'Eigenaar (William) · ' + user.email;
  }
  logAction('login', {});
  // Toon eigen UID in systeem tab
  var myUidEl = document.getElementById('my-uid');
  if (myUidEl) myUidEl.textContent = user.uid;
  bootDashboard(); setTimeout(_initMelBadge, 2000);
});

// ── Tab navigatie ─────────────────────────────────────────────
const TAB_TITLES = {
  kai:'Outfit AI - Vergelijk & Opgeslagen',
  dash:'Dashboard',live:'Live feed',users:'Gebruikers',online:'Online nu',polls:'Poll resultaten',
  analytics:'Analytics',dsp:'DSP & Streaks',content:'Content',
  berichten:'Berichten',meldingen:'Meldingen',mod:'Moderatie',errors:'Errors',sys:'Systeem',
  mailinglist:'Mailing List'
};

// ── Mobile nav toggle ────────────────────────────────────────
function toggleNav() {
  var nav = document.getElementById('nav');
  var body = document.body;
  if (nav.classList.contains('open')) {
    nav.classList.remove('open');
    body.classList.remove('nav-open');
  } else {
    nav.classList.add('open');
    body.classList.add('nav-open');
  }
}

function go(el) {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
  const tab = el.getAttribute('data-tab');
  _currentTab = tab;
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  document.getElementById('t-' + tab).classList.add('on');
  document.getElementById('tb-t').textContent = TAB_TITLES[tab] || tab;
  tabLoad(tab);
  // Sluit mobile nav na tab selectie
  var nav = document.getElementById('nav');
  if (nav && nav.classList.contains('open')) toggleNav();
}

function tabLoad(t) {
  if (t === 'kai')       loadKai();
  if (t === 'dash')      loadDash();
  if (t === 'users')     loadUsers();
  if (t === 'online')    loadOnline();
  if (t === 'polls')     loadPolls();
  if (t === 'analytics') loadAnalytics();
  if (t === 'dsp')       loadDSP();
  if (t === 'content')   loadContent();
  if (t === 'berichten') loadBerichten();
  if (t === 'meldingen') loadMeldingen();
  if (t === 'mod')       loadMod();
  if (t === 'errors')    loadErrors();
  if (t === 'sys')       loadSys();
  if (t === 'mailinglist') mlLaad();
}

function reload() {
  var btn = document.querySelector('[onclick="reload()"]');
  if (btn) { btn.textContent = '↻ Laden…'; btn.disabled = true; }
  tabLoad(_currentTab);
  setTimeout(function() {
    if (btn) { btn.textContent = '↻ Vernieuwen'; btn.disabled = false; }
  }, 1500);
}

// ── Helpers ────────────────────────────────────────────────────
const show = id => { const el = document.getElementById(id); if(el) el.style.display = el.tagName === 'DIV' ? 'flex' : 'block'; };
const hide = id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; };
const set  = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
const fmt  = n => n == null ? '-' : Number(n).toLocaleString('nl-NL');
const esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function ts(t) {
  if (!t) return '-';
  const d = t?.toDate ? t.toDate() : new Date(typeof t === 'number' ? t : t);
  if (isNaN(d)) return '-';
  const diff = (Date.now() - d) / 1000;
  if (diff < 60)   return Math.round(diff) + 's';
  if (diff < 3600) return Math.round(diff/60) + 'm';
  if (diff < 86400)return Math.round(diff/3600) + 'u';
  return d.toLocaleDateString('nl-NL', {day:'2-digit',month:'2-digit'});
}

function uav(naam, size = 28) {
  const ini = esc((naam||'?').slice(0,2).toUpperCase());
  return `<div class="uav" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.4)}px">${ini}</div>`;
}

const EV_ICON = {
  like:'❤️',reactie:'💬',volgen:'👥',verhaal_plaatsen:'📝',look_plaatsen:'📸',
  dm_versturen:'✉️',overlay_open:'👁️',app_open:'📱',login:'🔐',logout:'🚪',
  dsp_verdienen:'⭐',js_error:'❌',promise_rejection:'⚠️',navigeer:'🗺️',
  stem_kleur:'🎨',wishlist_toevoegen:'💛',gast_sessie:'👤',streak:'🔥'
};
const evIco = t => EV_ICON[t] || '●';

function bars(data, id, cls='') {
  const el = document.getElementById(id);
  if (!el) return;
  if (!data.length) { el.innerHTML = '<div class="empty">Geen data.</div>'; return; }
  const max = data[0][1] || 1;
  el.innerHTML = data.map(([k,v]) =>
    `<div class="bar-row">
      <div class="bar-lbl" title="${esc(k)}">${esc(k)}</div>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${(v/max*100).toFixed(1)}%"></div></div>
      <div class="bar-val">${fmt(v)}</div>
    </div>`).join('');
}

async function logAction(actie, meta) {
  const u = auth.currentUser; if (!u) return;
  return db.collection('admin_log').add({
    admin: u.uid, adminEmail: u.email,
    actie, meta,
    ts: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(()=>{});
}

// ── Boot: realtime listeners ───────────────────────────────────
function bootDashboard() {
  stopAll();

  // ── Proactieve user cache warmer - vóór alle renders ──────────
  // Laadt top 200 users in _userCache zodat uid→naam altijd beschikbaar is
  window._userCache = window._userCache || {};
  (function _warmUserCache() {
    try {
      db.collection('users').orderBy('dsp_lifetime', 'desc').limit(200).get()
        .then(function(snap) {
          snap.docs.forEach(function(d) {
            var data = d.data();
            if (data.displayName || data.naam) {
              window._userCache[d.id] = {
                naam:    data.displayName || data.naam,
                niveau:  data.niveau  || '',
                avatar:  data.avatar  || null
              };
            }
          });
          // Cache warm - geen console.log in productie
        }).catch(function(e) {
          // Fallback: probeer zonder orderBy
          db.collection('users').limit(200).get()
            .then(function(snap2) {
              snap2.docs.forEach(function(d) {
                var data = d.data();
                if ((data.displayName || data.naam) && !window._userCache[d.id]) {
                  window._userCache[d.id] = { naam: data.displayName || data.naam, niveau: data.niveau||'', avatar: data.avatar||null };
                }
              });
            }).catch(function(){});
        });
    } catch(e) {}
  })();

  // Globale runtime error vanger - voorkomt stille crashes
  window.onerror = function(msg, src, line, col, err) {
    console.error('[Admin Crash]', msg, 'regel:', line, err);
    var bar = document.getElementById('admin-err-bar');
    if (bar) { bar.style.display='block'; bar.textContent = '⚠ JS fout: ' + msg + ' (regel '+line+')'; setTimeout(()=>bar.style.display='none', 8000); }
    return false;
  };
  window.onunhandledrejection = function(e) {
    console.error('[Admin Promise Crash]', e.reason);
  };

  // 1. Activity logs → live feed (gesorteerd op timestamp desc)
  const u1 = db.collection('activity_logs')
    .orderBy('timestamp', 'desc')
    .limit(100)
    .onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type === 'added') {
          const d = ch.doc.data();
          const key = (d.timestamp||0)+'_'+(d.type||'')+'_'+(d.userId||'');
          if (!_evs.find(e=>((e.timestamp||0)+'_'+(e.type||'')+'_'+(e.userId||''))===key)) {
            _evs.unshift(d);
          }
          if (_evs.length > 300) _evs.pop();
        }
      });
      _evs.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
      set('live-n', _evs.length);
      renderFeed(); renderDashFeed();
    }, err => { console.warn('[Admin] activity_logs fout:', err.code); });

  // 2. Online users → realtime
  // Centrale presence state - plain objects, gedeeld door alle tabs
  window._presenceDocs = [];
  const u2 = db.collection('realtime_status')
    .onSnapshot(function(snap) {
      var STALE = 300000; // 5 minuten
      var now = Date.now();
      window._presenceDocs = snap.docs
        .map(function(d) { return Object.assign({_id: d.id}, d.data()); })
        .filter(function(u) {
          if (!u.online) return false;
          var ls = u.lastSeenMs || (u.lastSeen && u.lastSeen.toDate ? u.lastSeen.toDate().getTime() : 0);
          return (now - ls) < STALE;
        });

      var tot  = window._presenceDocs.length;
      var auth = window._presenceDocs.filter(function(u){ return !u.isAnonymous; }).length;
      var anon = window._presenceDocs.filter(function(u){ return  u.isAnonymous; }).length;
      var pwa  = window._presenceDocs.filter(function(u){ return  u.pwa; }).length;

      set('d-online', tot); set('online-n', tot);
      set('pres-tot', tot); set('pres-auth', auth);
      set('pres-anon', anon); set('pres-pwa', pwa);
      // Unieke landen
      var countries = new Set(_presenceDocs.map(function(u){return u.country||u.lang||'';}).filter(Boolean));
      var countEl = document.getElementById('d-countries');
      if (countEl) countEl.textContent = countries.size || '-';
      var cnt = document.getElementById('on-cnt');
      if (cnt) cnt.textContent = tot;

      // Direct renderen als Online tab open is
      if (_currentTab === 'online') renderOnline(window._presenceDocs);
    }, function(err) { console.warn('[Admin] presence fout:', err.code); });

  // 3. Error badge
  const u3 = db.collection('activity_logs')
    .where('category','==','systeem').limit(20)
    .onSnapshot(snap => {
      const hour = Date.now() - 3600000;
      const recent = snap.docs.filter(d=>(d.data().timestamp||0)>=hour);
      const b = document.getElementById('err-n');
      if (b) { b.style.display=recent.length>0?'inline':'none'; if(recent.length>0) b.textContent=recent.length; }
    }, ()=>{});

  const u4 = db.collection('berichten').limit(20)
    .onSnapshot(snap => {
      set('d-msgs', fmt(snap.size));
      if (_currentTab === 'berichten') loadBerichten();
    }, ()=>{});
  _unsubs = [u1, u2, u3, u4];

  // Live timestamp tick - update tijden in feed elke 30s zonder nieuwe Firestore read
  setInterval(function() {
    if (_evs.length > 0) { renderFeed(); renderDashFeed(); }
  }, 30000);
  loadDash();
}

function stopAll() { _unsubs.forEach(u => u && u()); _unsubs = []; }

// ── Live feed render ───────────────────────────────────────────
function renderFeed() {
  const cat  = document.getElementById('ev-cat')?.value  || '';
  const type = document.getElementById('ev-type')?.value || '';
  const list = _evs.filter(e =>
    (!cat  || e.category === cat) &&
    (!type || e.type     === type)
  ).slice(0, 100);

  set('ev-cnt', list.length + ' events');
  const now = Date.now();
  const html = list.map(e => {
    // Timestamp: gebruik e.timestamp (Number) - altijd actueel
    const evTs = e.timestamp || now;
    const t = new Date(evTs);
    const tsStr = t.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

    // Naam: prioriteit: cache → event.displayName → metadata.displayName → async Firestore → 'Gast'
    let naam = 'Gast';
    if (e.userId) {
      const _cRaw = (window._userCache && window._userCache[e.userId]);
      const cached = _cRaw ? (typeof _cRaw === 'object' ? (_cRaw.naam || _cRaw.displayName) : _cRaw) : null;
      if (cached && cached !== '…') {
        naam = cached;
      } else if (e.displayName) {
        naam = e.displayName;
        // Sla ook op in cache voor toekomstige renders
        if (!window._userCache) window._userCache = {};
        if (!window._userCache[e.userId]) window._userCache[e.userId] = { naam: e.displayName };
      } else if (e.metadata && e.metadata.displayName) {
        naam = e.metadata.displayName;
      } else {
        naam = 'Gast';
        if (!window._userCache) window._userCache = {};
        if (!window._userCache['_loading_'+e.userId]) {
          window._userCache['_loading_'+e.userId] = true;
          db.collection('users').doc(e.userId).get()
            .then(function(d){
              if(d.exists){
                var _d=d.data();
                var n = _d.displayName || _d.naam || 'Gebruiker';
                window._userCache[e.userId] = { naam: n, niveau: _d.niveau||'', avatar: _d.avatar||null };
                delete window._userCache['_loading_'+e.userId];
                if (_currentTab === 'live' || _currentTab === 'dash') renderFeed();
              }
            }).catch(function(){ delete window._userCache['_loading_'+e.userId]; });
        }
      }
    }
    const metaStr = esc(naam) + ' · ' + esc(e.route||'-') + ' · ' + esc(e.category||'');
    var clickable = e.userId ? ' style="cursor:pointer" onclick="goToUser(\'' + e.userId + '\')"' : '';
    return '<div class="ev"' + clickable + '>' +
      '<div class="ev-ic">' + evIco(e.type) + '</div>' +
      '<div class="ev-body">' +
        '<div class="ev-type">' + esc(e.type) + '</div>' +
        '<div class="ev-meta">' + metaStr + '</div>' +
      '</div>' +
      '<div class="ev-time">' + tsStr + '</div>' +
    '</div>';
  }).join('') || '<div class="empty">Geen events.</div>';

  ['dash-feed','live-feed'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function renderDashFeed() { /* delegeert naar renderFeed - no-op */ }

// ── Dashboard KPIs ─────────────────────────────────────────────
let _allUsers = [];

async function loadDash() {
  try {
    const [uSnap, stSnap, lkSnap, rvSnap, dspSnap, stmSnap] = await Promise.allSettled([
      db.collection('users').limit(200).get(),
      db.collection('stories').get(),
      db.collection('looks').get(),
      db.collection('reviews').get(),
      db.collection('dsp_log').orderBy('ts','desc').limit(500).get(),
      db.collection('kleur_stemmen').get()
    ]);
  
    const s = r => r.status==='fulfilled' ? r.value : null;
  
    const us = s(uSnap), sts = s(stSnap), lks = s(lkSnap),
          rvs = s(rvSnap), dsp = s(dspSnap), stms = s(stmSnap);
  
    if (us) { set('d-users', fmt(us.size)); _allUsers = us.docs.map(d=>({...d.data(),uid:d.id})); }
    if (sts) set('d-stories', fmt(sts.size));
    if (lks) set('d-looks',   fmt(lks.size));
    if (rvs) set('d-reviews', fmt(rvs.size));
    if (stms) set('d-stems',  fmt(stms.size));
  
    // Berichten count
    db.collection('berichten').get().then(s => set('d-msgs', fmt(s.size))).catch(()=>{});
  
    if (dsp) {
      const tot = dsp.docs.reduce((a,d)=>a+(d.data().pts||0),0);
      set('d-dsp', fmt(tot));
  
      // DSP bars
      const byActie = {};
      dsp.docs.forEach(d => {
        const a = d.data().actie || 'onbekend';
        byActie[a] = (byActie[a]||0) + (d.data().pts||0);
      });
      bars(Object.entries(byActie).sort((a,b)=>b[1]-a[1]).slice(0,8), 'dash-dspbars');
    }
  
    // Top users
    if (us) {
      const top = _allUsers.sort((a,b)=>(b.dsp_lifetime||0)-(a.dsp_lifetime||0)).slice(0,8);
      document.getElementById('dash-topusers').innerHTML = top.map((u,i) => `
        <tr>
          <td>${i+1}</td>
          <td><div class="urow">${uav(u.displayName||u.naam)}
            <div><div class="uname">${esc(u.displayName||u.naam||'-')}</div>
            <div class="uuid">${u.uid.slice(0,12)}…</div></div>
          </div></td>
          <td><span class="badge b-gold">${esc(u.niveau||'-')}</span></td>
          <td style="color:var(--gold);font-weight:600">${fmt(u.dsp_lifetime)}</td>
        </tr>`).join('');
    }
  } catch(err) {
    console.error('[Admin] loadDash crash:', err.message || err);
    const _el = document.getElementById('dash-feed');
    if (_el) _el.innerHTML = '<tr><td colspan="10" style="padding:16px;color:var(--red);font-size:12px">⚠ Fout bij laden: ' + (err.message||'onbekend') + '</td></tr>';
  }
}

// ── Users ─────────────────────────────────────────────────────
async function loadUsers() {
  try {
    if (!_allUsers.length) {
      const snap = await db.collection('users').limit(200).get().catch(()=>null);
      if (snap) _allUsers = snap.docs.map(d=>({...d.data(),uid:d.id}));
        _allUsers.forEach(function(u){ if(u.uid&&(u.displayName||u.naam)) window._userCache[u.uid]={ naam: u.displayName||u.naam, niveau: u.niveau||'', avatar: u.avatar||null }; });
    }
    renderUsers();
    set('u-cnt', _allUsers.length + ' gebruikers');
  } catch(err) {
    console.error('[Admin] loadUsers crash:', err.message || err);
    const _el = document.getElementById('u-tbody');
    if (_el) _el.innerHTML = '<tr><td colspan="10" style="padding:16px;color:var(--red);font-size:12px">⚠ Fout bij laden: ' + (err.message||'onbekend') + '</td></tr>';
  }
}

function filterUsers() { renderUsers(); }

function renderUsers() {
  const q   = (document.getElementById('u-q')?.value||'').toLowerCase();
  const niv = document.getElementById('u-niv')?.value||'';
  const srt = document.getElementById('u-sort')?.value||'dsp';

  let list = _allUsers.filter(u => {
    const naam = (u.displayName||u.naam||'').toLowerCase();
    return (!q || naam.includes(q) || u.uid.includes(q)) && (!niv || u.niveau===niv);
  });

  if (srt==='naam')   list.sort((a,b)=>(a.displayName||a.naam||'').localeCompare(b.displayName||b.naam||''));
  if (srt==='streak') list.sort((a,b)=>(b.streak_huidig||0)-(a.streak_huidig||0));
  if (srt==='dsp')    list.sort((a,b)=>(b.dsp_lifetime||0)-(a.dsp_lifetime||0));

  set('u-cnt', list.length + ' gebruikers');
  document.getElementById('u-tbody').innerHTML = list.map(u => `
    <tr>
      <td><div class="urow">${uav(u.displayName||u.naam||'?')}
        <div><div class="uname">${esc(u.displayName||u.naam||'Onbekend')}</div>
        <div class="uuid">${u.uid}</div></div>
      </div></td>
      <td><span class="badge b-gold">${esc(u.niveau||'-')}</span></td>
      <td style="color:var(--gold)">${fmt(u.dsp_lifetime)}</td>
      <td>🔥 ${u.streak_huidig||0}</td>
      <td class="muted">${u.lengte?u.lengte+'cm':''} ${u.maat?'· '+u.maat:''}</td>
      <td><span class="${u.online?'dot-on':'dot-off'}"></span> ${u.online?'Online':'-'}</td>
      <td><button class="btn btn-sm" onclick="openUser('${u.uid}')">Detail</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">Geen gebruikers.</td></tr>';
}

async function openUser(uid) {
  const u = _allUsers.find(function(x){return x.uid===uid;});
  if (!u) return;

  const panel = document.getElementById('u-detail');
  panel.style.display = 'block';
  setTimeout(function(){ panel.scrollIntoView({behavior:'smooth',block:'start'}); }, 50);

  // Reset tabs naar profiel
  document.querySelectorAll('.ud-tab').forEach(function(t){t.classList.remove('on');});
  const firstTab = document.querySelector('.ud-tab[data-t="profiel"]');
  if (firstTab) firstTab.classList.add('on');
  document.querySelectorAll('.ud-pane').forEach(function(p){p.style.display='none';});
  const profielPane = document.getElementById('ud-pane-profiel');
  if (profielPane) profielPane.style.display = 'grid';

  // Header
  const naam = u.displayName || u.naam || '-';
  const ini  = naam.slice(0,2).toUpperCase();
  const avEl = document.getElementById('ud-avatar');
  if (avEl) avEl.textContent = ini;
  set('ud-name', naam);
  set('ud-sub',  u.email || u.uid);

  const niv = u.niveau || '';
  const nivEl = document.getElementById('ud-niveau-badge');
  if (nivEl) { nivEl.textContent = niv; nivEl.style.display = niv ? 'inline-flex' : 'none'; }

  // Live presence
  const pres = (window._presenceDocs || []).find(function(p){return p.uid === uid;});
  const onlineEl = document.getElementById('ud-online-badge');
  const pwaEl    = document.getElementById('ud-pwa-badge');
  if (pres) {
    if (onlineEl) { onlineEl.textContent = '● Online'; onlineEl.className = 'badge b-green'; }
    set('ud-live-route', pres.route || '-');
    var sm = pres.sessionMs || 0;
    set('ud-live-sess', sm < 60000 ? Math.round(sm/1000)+'s' : Math.round(sm/60000)+'m');
    if (pwaEl) pwaEl.style.display = pres.pwa ? 'inline-flex' : 'none';
  } else {
    if (onlineEl) { onlineEl.textContent = 'Offline'; onlineEl.className = 'badge b-gray'; }
    set('ud-live-route', '-'); set('ud-live-sess', '-');
    if (pwaEl) pwaEl.style.display = 'none';
  }

  // KPIs
  set('ud-dsp',    fmt(u.dsp_lifetime));
  set('ud-streak', '🔥 ' + (u.streak_huidig||0));

  // ── Profiel stats + Fit Identity volledig ─────────────────────
  function udStatRow(label, val, highlight) {
    var kleur = highlight ? 'color:var(--gold);font-weight:600' : '';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">' +
      '<span style="color:var(--text3);flex-shrink:0;margin-right:8px">'+label+'</span>' +
      '<span style="text-align:right;'+kleur+'">'+val+'</span></div>';
  }
  function udChip(val) {
    if (!val || val === '-') return '<span style="color:var(--text3);font-size:11px">-</span>';
    return '<span style="display:inline-block;background:var(--bg4);border:1px solid var(--border);border-radius:20px;padding:2px 10px;font-size:11px;color:var(--text)">'+esc(val)+'</span>';
  }
  function udSection(title) {
    return '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;padding:10px 0 4px">' + title + '</div>';
  }

  var bodyCompleet = u.bodyProfileCompleet;
  var volledigheid = 0;
  var velden = ['lengte','gewicht','borst','taille','schoen','maat','bouw','schoudertype','torso','armlengte','beenbouw','fitvoorkeur'];
  velden.forEach(function(f){ if (u[f]) volledigheid++; });
  var pct = Math.round(volledigheid / velden.length * 100);
  var pctKleur = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--red)';

  var psEl = document.getElementById('ud-profile-stats');
  if (psEl) psEl.innerHTML =
    // ── Account ──────────────────────────────────────────────
    udSection('Account') +
    udStatRow('UID', '<span class="mono" style="font-size:10px">'+uid+'</span>') +
    udStatRow('Push notificaties', u.pushSubscribed ? '✓ Aan' : '- Uit') +
    udStatRow('Mod status', u.modStatus ? '<span class="badge b-red">'+esc(u.modStatus)+'</span>' : '<span class="badge b-green">OK</span>') +
    udStatRow('DSP seizoen', fmt(u.dsp_seizoen)) +
    udStatRow('Streak max', (u.streak_langste||0)+' dagen') +
    udStatRow('Laatste dag', u.streak_laatste_dag||'-') +

    // ── Fit Identity volledigheid ─────────────────────────────
    udSection('Fit Identity') +
    '<div style="margin:6px 0 8px">' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">' +
        '<span style="color:var(--text3)">Profiel compleetheid</span>' +
        '<span style="color:'+pctKleur+';font-weight:600">'+pct+'% ('+volledigheid+'/'+velden.length+')</span>' +
      '</div>' +
      '<div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">' +
        '<div style="width:'+pct+'%;height:100%;background:'+pctKleur+';border-radius:3px;transition:width .3s"></div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:10px;color:var(--text3);margin-bottom:6px">Privacy: ' +
      (u.fitPrivacy === 'privé'
        ? '<span class="badge b-amber">🔒 Privé</span>'
        : '<span class="badge b-green">🌐 Openbaar</span>') +
    '</div>' +

    // ── Maten ─────────────────────────────────────────────────
    udSection('Maten') +
    udStatRow('Lengte', u.lengte ? '<strong>'+u.lengte+' cm</strong>' : '-', !!u.lengte) +
    udStatRow('Gewicht', u.gewicht ? u.gewicht+' kg' : '-') +
    udStatRow('Borstomtrek', u.borst ? u.borst+' cm' : '-') +
    udStatRow('Taille', u.taille ? u.taille+' cm' : '-') +
    udStatRow('Confectiemaat', u.maat ? '<strong>'+esc(u.maat)+'</strong>' : '-', !!u.maat) +
    udStatRow('Schoenmaat', u.schoen ? 'EU '+u.schoen : '-') +

    // ── Lichaamsbouw ──────────────────────────────────────────
    udSection('Lichaamsbouw') +
    '<div style="display:flex;flex-direction:column;gap:5px;padding:4px 0">' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)">' +
        '<span style="color:var(--text3)">Bouw</span>'+udChip(u.bouw)+'</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)">' +
        '<span style="color:var(--text3)">Schouders</span>'+udChip(u.schoudertype)+'</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)">' +
        '<span style="color:var(--text3)">Torso</span>'+udChip(u.torso)+'</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)">' +
        '<span style="color:var(--text3)">Armen</span>'+udChip(u.armlengte)+'</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">' +
        '<span style="color:var(--text3)">Benen</span>'+udChip(u.beenbouw)+'</div>' +
    '</div>' +

    // ── Voorkeur ──────────────────────────────────────────────
    udSection('Fit voorkeur') +
    '<div style="padding:4px 0">' + udChip(u.fitvoorkeur) + '</div>';

  // Laad events en de rest
  var udTl = document.getElementById('ud-tl');
  if (udTl) udTl.innerHTML = '<tr><td colspan="5" class="loading">Laden…</td></tr>';

  var results = await Promise.allSettled([
    db.collection('activity_logs').where('userId','==',uid).limit(80).get(),
    db.collection('realtime_status').doc(uid).get()
  ]);

  var evSnap  = results[0].status==='fulfilled' ? results[0].value : null;
  var presSnap = results[1].status==='fulfilled' ? results[1].value : null;

  var evs = evSnap && !evSnap.empty ? evSnap.docs.map(function(d){return d.data();}) : [];
  evs.sort(function(a,b){return (b.timestamp||0)-(a.timestamp||0);});

  var since24 = Date.now() - 86400000;
  var evs24   = evs.filter(function(e){return (e.timestamp||0)>=since24;});
  var likes24 = evs24.filter(function(e){return e.type==='like';}).length;
  var posts24 = evs24.filter(function(e){return e.type==='verhaal_plaatsen'||e.type==='look_plaatsen';}).length;
  var sessIds = {};
  evs.forEach(function(e){if(e.sessionId)sessIds[e.sessionId]=1;});

  set('ud-events',   fmt(evs24.length));
  set('ud-likes',    fmt(likes24));
  set('ud-posts',    fmt(posts24));
  set('ud-sessions', fmt(Object.keys(sessIds).length));

  // Engagement bars
  var engData = [
    ['Likes', likes24],
    ['Posts', posts24],
    ['Overlays', evs24.filter(function(e){return e.type==='overlay_open';}).length],
    ['DMs', evs24.filter(function(e){return e.type==='dm_versturen';}).length],
    ['Reacties', evs24.filter(function(e){return e.type==='reactie';}).length],
    ['DSP', evs24.filter(function(e){return e.type==='dsp_verdienen';}).length],
  ];
  engData.sort(function(a,b){return b[1]-a[1];});
  bars(engData, 'ud-engagement-bars');

  // Activiteitslog tabel
  var tlCount = document.getElementById('ud-tl-count');
  if (tlCount) tlCount.textContent = evs.length + ' events';
  if (udTl) {
    if (!evs.length) {
      udTl.innerHTML = '<tr><td colspan="5" class="empty">Geen activiteit gevonden.</td></tr>';
    } else {
      udTl.innerHTML = evs.slice(0,50).map(function(e){
        var dInfo = e.deviceInfo || {};
        var dIco  = dInfo.type==='mobile' ? '📲' : '🖥️';
        var meta  = e.metadata ? JSON.stringify(e.metadata).slice(0,50) : '-';
        return '<tr>' +
          '<td class="mono" style="font-size:10px;white-space:nowrap">'+new Date(e.timestamp||0).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</td>' +
          '<td>'+evIco(e.type)+' '+esc(e.type)+'</td>' +
          '<td><span class="badge b-blue">'+esc(e.route||'-')+'</span></td>' +
          '<td>'+dIco+' '+esc(dInfo.browser||'-')+'</td>' +
          '<td class="muted truncate" style="max-width:140px">'+esc(meta)+'</td>' +
          '</tr>';
      }).join('');
    }
  }

  // Device tab
  var presData = presSnap && presSnap.exists ? presSnap.data() : null;
  var devSrc   = presData || (evs.length ? { device:evs[0].deviceInfo&&evs[0].deviceInfo.type, browser:evs[0].deviceInfo&&evs[0].deviceInfo.browser, os:evs[0].deviceInfo&&evs[0].deviceInfo.os, pwa:false, screen:'-' } : null);
  var dcEl = document.getElementById('ud-device-current');
  if (dcEl && devSrc) {
    dcEl.innerHTML = [
      ['Type',     devSrc.device||'-'],
      ['Browser',  devSrc.browser||'-'],
      ['OS',       devSrc.os||'-'],
      ['PWA',      devSrc.pwa ? '✓ Ja' : 'Nee'],
      ['Scherm',   devSrc.screen||'-'],
      ['Stad',     devSrc.city || (devSrc.country ? '(onbekend in '+devSrc.country+')' : 'Nog niet geladen')],
      ['Regio',    devSrc.region||'-'],
      ['Land',     devSrc.country_name||devSrc.country||'-'],
      ['Tijdzone', devSrc.timezone||'-'],
      ['Provider', devSrc.org||'-'],
      ['Taal',     devSrc.lang||'-'],
      ['Ping',     devSrc.lastSeenMs ? ts({toDate:function(){return new Date(devSrc.lastSeenMs);}}) : '-'],
    ].map(function(row){
      return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">' +
        '<span style="color:var(--text3)">'+row[0]+'</span><span>'+esc(String(row[1]))+'</span></div>';
    }).join('');
  }
  var dhEl = document.getElementById('ud-device-hist');
  if (dhEl) {
    var devHist = {};
    evs.forEach(function(e){
      var dInfo = e.deviceInfo || {};
      var k = (dInfo.type||'?')+'|'+(dInfo.browser||'?');
      devHist[k] = (devHist[k]||0)+1;
    });
    dhEl.innerHTML = Object.entries(devHist).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(entry){
      var parts = entry[0].split('|');
      var ico   = parts[0]==='mobile' ? '📲' : '🖥️';
      return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">' +
        '<span>'+ico+' '+esc(parts[1])+'</span><span class="badge b-gray">'+entry[1]+'×</span></div>';
    }).join('') || '<div class="muted" style="font-size:12px">Geen device data.</div>';
  }

  // Gedrag tab
  var routeC = {};
  evs.forEach(function(e){if(e.route)routeC[e.route]=(routeC[e.route]||0)+1;});
  bars(Object.entries(routeC).sort(function(a,b){return b[1]-a[1];}).slice(0,6), 'ud-routes-bars', 'blue');

  var hourC = new Array(24).fill(0);
  evs.forEach(function(e){if(e.timestamp)hourC[new Date(e.timestamp).getHours()]++;});
  var maxH = Math.max.apply(null, hourC.concat([1]));
  var hbEl = document.getElementById('ud-hour-bars');
  if (hbEl) hbEl.innerHTML = hourC.map(function(c,h){
    return '<div title="'+h+'u: '+c+'" style="flex:1;background:rgba(198,125,6,'+(c>0?0.3+c/maxH*0.7:0.08)+');height:'+(c/maxH*100).toFixed(0)+'%;border-radius:2px 2px 0 0;min-height:'+(c>0?'2px':'0')+'"></div>';
  }).join('');

  // Modereer-knop
  var modBtn = document.getElementById('ud-mod-btn');
  var refBtn = document.getElementById('ud-refresh-btn');
  if (modBtn) modBtn.dataset.uid = uid;
  if (refBtn) refBtn.dataset.uid = uid;
}


// Navigeer naar een gebruiker vanuit elke tab
function goToUser(uid, targetTab) {
  // Zorg dat _allUsers geladen is
  if (!uid) return;
  if (!_allUsers.length) {
    db.collection('users').limit(200).get().then(function(snap) {
      window._allUsers = snap.docs.map(function(d){return Object.assign({uid:d.id},d.data());});
      goToUser(uid, targetTab);
    }).catch(function(){});
    return;
  }
  // Navigeer naar gebruikers tab
  var navItem = document.querySelector('[data-tab="users"]');
  if (navItem) go(navItem);
  // Open het detail panel na korte delay
  setTimeout(function(){ openUser(uid); }, 100);
}

function closeUserDetail() {
  document.getElementById('u-detail').style.display = 'none';
}

function udTab(el) {
  const t = el.getAttribute('data-t');
  document.querySelectorAll('.ud-tab').forEach(x=>x.classList.remove('on'));
  el.classList.add('on');
  document.querySelectorAll('.ud-pane').forEach(p=>p.style.display='none');
  document.getElementById('ud-pane-'+t).style.display = 'block';
}

function quickMod() {
  const uid = document.getElementById('ud-mod-btn').dataset.uid;
  if (!uid) return;
  document.getElementById('mod-uid').value = uid;
  go(document.querySelector('[data-tab="mod"]'));
}

async function refreshUserDetail() {
  const uid = document.getElementById('ud-refresh-btn').dataset.uid;
  if (uid) openUser(uid);
}


// ── Online ────────────────────────────────────────────────────
// loadOnline: laadt Online tab
async function loadOnline() {
  // Zorg dat _allUsers geladen is voor naam resolving
  if (!window._userCache || Object.keys(window._userCache).length < 2) {
    try {
      var usSnap = await db.collection('users').limit(100).get();
      window._userCache = window._userCache || {};
      usSnap.docs.forEach(function(d) {
        var data = d.data();
        if (data.displayName || data.naam) {
          window._userCache[d.id] = { naam: data.displayName || data.naam, niveau: data.niveau||'', avatar: data.avatar||null };
        }
      });
    } catch(e) { /* stil */ }
  }
  var docs = window._presenceDocs || [];
  // Enrich docs met namen vanuit cache
  docs.forEach(function(u) {
    if (!u.displayName && !u.isAnonymous && u.uid && window._userCache[u.uid]) {
      u.displayName = window._userCache[u.uid];
    }
  });
  renderOnline(docs);
}

// Directe Firestore read - negeert de cached _presenceDocs state
async function refreshOnlineNu() {
  var btn = event && event.target;
  if (btn) btn.textContent = '↻ Laden…';
  try {
    var snap = await db.collection('realtime_status').limit(100).get();
    var now = Date.now();
    var alle = snap.docs.map(function(d){ return Object.assign({_id:d.id}, d.data()); });
    // Toon ALLES met online=true, stale threshold verruimd naar 3 minuten voor debug
    // Online: actief binnen 3 minuten
    var actief = alle.filter(function(u){
      if (!u.online) return false;
      var ls = u.lastSeenMs || (u.lastSeen && u.lastSeen.toDate ? u.lastSeen.toDate().getTime() : 0);
      return (now - ls) < 180000;
    });
    // Offline: recent offline (< 15 min) - ook meenemen voor offline blok
    var recentOffline = alle.filter(function(u){
      if (u.online) return false;
      var ls = u.lastSeenMs || (u.lastSeen && u.lastSeen.toDate ? u.lastSeen.toDate().getTime() : 0);
      return ls && (now - ls) < 900000; // 15 minuten
    });
    // Combineer voor renderOnline
    var alleDocs = actief.concat(recentOffline);
    // Verrijk met namen vanuit cache EN users collection
    var uidsMissing = actief.filter(function(u){ return !u.isAnonymous && u.uid && !u.displayName && !(window._userCache && window._userCache[u.uid]); }).map(function(u){ return u.uid; });
    if (uidsMissing.length > 0) {
      // Laad namen voor ontbrekende uids
      try {
        var usSnap = await db.collection('users').limit(100).get();
        usSnap.docs.forEach(function(d){
          var n = d.data().displayName || d.data().naam;
          if (n) { window._userCache = window._userCache||{}; var _od=null; try{ _od=d.data(); }catch(e){} window._userCache[d.id] = { naam: n, niveau: (_od&&_od.niveau)||'', avatar: (_od&&_od.avatar)||null }; }
        });
      } catch(e) {}
    }
    actief.forEach(function(u){
      if (!u.isAnonymous && u.uid && !u.displayName) {
        var cached = window._userCache && window._userCache[u.uid];
        if (cached) u.displayName = typeof cached==='object' ? cached.naam : cached;
      }
    });
    // Toon geo status in diagnose output
    var geoCount = actief.filter(function(u){ return u.city || u.country; }).length;
    console.log('[Admin] Geo data aanwezig bij ' + geoCount + ' van ' + actief.length + ' sessies');
    // Update centrale state
    window._presenceDocs = actief;
    // Update KPI's
    set('pres-tot',  actief.length);
    set('pres-auth', actief.filter(function(u){return !u.isAnonymous;}).length);
    set('pres-anon', actief.filter(function(u){return  u.isAnonymous;}).length);
    set('pres-pwa',  actief.filter(function(u){return  u.pwa;}).length);
    set('d-online',  actief.length);
    set('online-n',  actief.length);
    var cnt = document.getElementById('on-cnt');
    if (cnt) cnt.textContent = actief.length;
    window._presenceDocs = alleDocs;
    renderOnline(alleDocs);

    // Debug: toon ook alle docs (ook offline/stale)
    var luEl = document.getElementById('pres-last-update');
    if (luEl) luEl.textContent = 'gelezen: ' + alle.length + ' docs, actief: ' + actief.length;
  } catch(e) {
    console.error('[Admin] refreshOnlineNu fout:', e.code, e.message);
    alert('Fout bij lezen: ' + e.code + ' - zijn de Firestore rules gedeployed?');
  }
  if (btn) btn.textContent = '↻ Nu vernieuwen';
}

let _presFilter = '';
function filterPresence() {
  _presFilter = (document.getElementById('pres-filter') || {}).value || '';
  renderOnline(window._presenceDocs || []);
}

async function cleanStale() {
  try {
  if (!confirm('Stale sessies (>90s) offline markeren?')) return;
  var cutoff = Date.now() - 90000;
  var snap = await db.collection('realtime_status').where('online','==',true).get().catch(function(){return null;});
  if (!snap) return;
  var batch = db.batch(); var n = 0;
  snap.docs.forEach(function(d) {
    if ((d.data().lastSeenMs||0) < cutoff) { batch.update(d.ref,{online:false}); n++; }
  });
  if (n > 0) await batch.commit();
  await logAction('clean_stale',{count:n});
  alert('✓ '+n+' stale sessies opgeruimd.');
  } catch(_e) {
    console.warn('[Admin] cleanStale:', _e.message||_e.code||_e);
  }
}

function renderOnline(allDocs) {
  var now = Date.now();
  var OFFLINE_WINDOW = 15 * 60 * 1000; // 15 minuten

  // Split: online vs recent offline
  var online  = (allDocs||[]).filter(function(u) { return u.online; });
  var offline = (allDocs||[]).filter(function(u) {
    if (u.online) return false;
    var ls = u.lastSeenMs || 0;
    return ls && (now - ls) < OFFLINE_WINDOW;
  }).sort(function(a,b) { return (b.lastSeenMs||0) - (a.lastSeenMs||0); });

  // Filteer online op geselecteerde categorie
  var docs = online.filter(function(u) {
    if (!_presFilter) return true;
    if (_presFilter === 'auth')    return !u.isAnonymous;
    if (_presFilter === 'anon')    return  u.isAnonymous;
    if (_presFilter === 'mobile')  return  u.device === 'mobile';
    if (_presFilter === 'desktop') return  u.device === 'desktop';
    if (_presFilter === 'pwa')     return  u.pwa;
    return true;
  });

  // ── KPI updates ──────────────────────────────────────────────────
  set('pres-offline-cnt', offline.length);
  set('pres-mobile',  online.filter(function(u){ return u.device === 'mobile'; }).length);
  set('pres-desktop', online.filter(function(u){ return u.device === 'desktop'; }).length);

  // Gemiddelde sessieduur
  var sessies = online.filter(function(u){ return u.sessionMs > 0; });
  if (sessies.length) {
    var avg = sessies.reduce(function(s,u){ return s + (u.sessionMs||0); }, 0) / sessies.length;
    set('pres-avg-sess', avg < 60000 ? Math.round(avg/1000)+'s' : avg < 3600000 ? Math.round(avg/60000)+'m' : Math.round(avg/3600000)+'u');
  }

  // ── ONLINE tabel ─────────────────────────────────────────────────
  var tbody = document.getElementById('on-tbody');
  if (tbody) {
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty" style="padding:24px">' +
        '<div style="margin-bottom:8px;font-size:15px">Geen actieve sessies zichtbaar</div>' +
        '<div style="font-size:11px;color:var(--text3)">Klik ↻ Vernieuwen · Of open <a href="/" target="_blank" style="color:var(--gold)">de app</a></div>' +
        '</td></tr>';
    } else {
      tbody.innerHTML = docs.map(function(u) {
        var _cacheEntry = !u.isAnonymous && window._userCache && u.uid ? window._userCache[u.uid] : null;
        var cachedNaam  = _cacheEntry ? (typeof _cacheEntry === 'object' ? _cacheEntry.naam : _cacheEntry) : null;
        var naam = u.displayName || cachedNaam;
        if (typeof naam === 'object' && naam !== null) naam = naam.naam || naam.displayName || '…';
        if (!naam || naam === '…') {
          if (u.isAnonymous || !u.uid) {
            naam = '👤 Gast';
          } else {
            naam = '…';
            if (!window._userCache) window._userCache = {};
            if (!window._userCache['_req_'+u.uid]) {
              window._userCache['_req_'+u.uid] = true;
              db.collection('users').doc(u.uid).get().then(function(d) {
                if (d.exists) {
                  var n = d.data().displayName || d.data().naam;
                  if (n) { window._userCache[u.uid] = { naam: n }; if (_currentTab === 'online') renderOnline(allDocs); }
                }
              }).catch(function(){});
            }
          }
        }
        var sessMs  = u.sessionMs || (now - (u.connectedAt || now));
        var sessStr = sessMs < 60000 ? Math.round(sessMs/1000)+'s' : sessMs < 3600000 ? Math.round(sessMs/60000)+'m' : Math.round(sessMs/3600000)+'u';
        var lastMs  = u.lastSeenMs || 0;
        var lsStr   = lastMs ? ts({toDate: function(){ return new Date(lastMs); }}) : ts(u.lastSeen);
        var icon    = u.pwa ? '📱' : u.device === 'mobile' ? '📲' : '🖥️';
        var ab      = '<span class="badge '+(u.isAnonymous?'b-gray':'b-green')+'" style="font-size:9px">'+(u.isAnonymous?'Gast':'Auth')+'</span>';
        var pb      = u.pwa ? '<span class="badge b-amber" style="font-size:9px">PWA</span>' : '';
        var loc     = [u.city, u.region, u.country].filter(Boolean).join(', ') || '-';
        var browser = (u.browser||'-').split('/')[0];
        var acts    = u.activityCount || 0;
        var onClickAttr = (!u.isAnonymous && u.uid) ? ' data-uid="' + u.uid + '" style="cursor:pointer" onclick="goToUser(this.dataset.uid)"' : '';
        var stale   = lastMs && (now - lastMs) > 45000;
        var pingBadge = stale ? '<span class="badge b-red" style="font-size:9px">Stale</span>' : '<span class="badge b-green" style="font-size:9px">Live</span>';
        return '<tr'+onClickAttr+'>' +
          '<td><div class="urow">'+ab+'<span style="font-size:12px">'+esc(naam)+'</span>'+pb+'</div></td>' +
          '<td>'+pingBadge+'</td>' +
          '<td><span class="badge b-blue">'+esc(u.route||'-')+'</span></td>' +
          '<td class="muted" style="font-size:11px">'+esc(loc)+'</td>' +
          '<td>'+icon+' '+esc(u.device||'-')+'</td>' +
          '<td class="muted" style="font-size:11px">'+esc(browser)+'</td>' +
          '<td class="muted">'+sessStr+'</td>' +
          '<td class="muted" style="font-size:11px">'+acts+'</td>' +
          '<td class="muted">'+lsStr+'</td>' +
          '</tr>';
      }).join('');
    }
  }

  // ── OFFLINE tabel ────────────────────────────────────────────────
  var offTbody = document.getElementById('off-tbody');
  var offCnt   = document.getElementById('off-cnt');
  if (offCnt) offCnt.textContent = offline.length;

  if (offTbody) {
    if (!offline.length) {
      offTbody.innerHTML = '<tr><td colspan="6" class="empty">Geen recent offline gebruikers</td></tr>';
    } else {
      offTbody.innerHTML = offline.map(function(u) {
        var _ce = !u.isAnonymous && window._userCache && u.uid ? window._userCache[u.uid] : null;
        var naam = u.displayName || (_ce ? (typeof _ce === 'object' ? _ce.naam : _ce) : null) || (u.isAnonymous ? '👤 Gast' : 'Onbekend');
        var sessMs  = u.sessionMs || 0;
        var sessStr = !sessMs ? '-' : sessMs < 60000 ? Math.round(sessMs/1000)+'s' : sessMs < 3600000 ? Math.round(sessMs/60000)+'m' : Math.round(sessMs/3600000)+'u';
        var lastMs  = u.lastSeenMs || 0;
        var agoMs   = now - lastMs;
        var agoStr  = agoMs < 60000 ? Math.round(agoMs/1000)+'s geleden' : agoMs < 3600000 ? Math.round(agoMs/60000)+'m geleden' : Math.round(agoMs/3600000)+'u geleden';
        var icon    = u.pwa ? '📱' : u.device === 'mobile' ? '📲' : '🖥️';
        var loc     = [u.city, u.country].filter(Boolean).join(', ') || '-';
        var onClickAttr = (!u.isAnonymous && u.uid) ? ' data-uid="' + u.uid + '" style="cursor:pointer" onclick="goToUser(this.dataset.uid)"' : '';
        return '<tr'+onClickAttr+'>' +
          '<td><span style="font-size:12px;opacity:0.7">'+esc(naam)+'</span></td>' +
          '<td><span class="badge b-gray">'+esc(u.route||'-')+'</span></td>' +
          '<td class="muted" style="font-size:11px">'+esc(loc)+'</td>' +
          '<td>'+icon+' '+esc(u.device||'-')+'</td>' +
          '<td class="muted">'+sessStr+'</td>' +
          '<td class="muted" style="color:var(--red)">'+agoStr+'</td>' +
          '</tr>';
      }).join('');
    }
  }

  // Timestamp
  var luEl = document.getElementById('pres-last-update');
  if (luEl) luEl.textContent = 'bijgewerkt ' + new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  // ── Side bars: device, route, landen, browser ────────────────────
  var devC = {}, rtC = {}, ctryC = {}, brC = {};
  (allDocs||[]).filter(function(u){ return u.online; }).forEach(function(u) {
    var d = u.device||'?';        devC[d]  = (devC[d]||0)+1;
    var r = u.route||'home';      rtC[r]   = (rtC[r]||0)+1;
    var c = u.country||'?';       ctryC[c] = (ctryC[c]||0)+1;
    var b = (u.browser||'?').split('/')[0]; brC[b] = (brC[b]||0)+1;
  });
  bars(Object.entries(devC).sort(function(a,b){return b[1]-a[1];}), 'pres-device-bars');
  bars(Object.entries(rtC).sort(function(a,b){return b[1]-a[1];}).slice(0,8), 'pres-route-bars', 'blue');
  bars(Object.entries(ctryC).sort(function(a,b){return b[1]-a[1];}).slice(0,8), 'pres-country-bars', 'green');
  bars(Object.entries(brC).sort(function(a,b){return b[1]-a[1];}), 'pres-browser-bars', 'amber');
}

// Export presence naar CSV
function exportPresence() {
  var docs = window._presenceDocs || [];
  var now = Date.now();
  var rows = [['Naam','Status','UID','Route','Land','Stad','Device','Browser','PWA','Sessieduur(s)','Activiteit','Laatste ping','Verbonden om']];
  docs.forEach(function(u) {
    var _ce = !u.isAnonymous && window._userCache && u.uid ? window._userCache[u.uid] : null;
    var naam = u.displayName || (_ce ? (typeof _ce === 'object' ? _ce.naam : _ce) : null) || (u.isAnonymous ? 'Gast' : '?');
    var sessS = Math.round((u.sessionMs||0)/1000);
    var lastMs = u.lastSeenMs || 0;
    var connStr = u.connectedAt ? new Date(u.connectedAt).toLocaleString('nl-NL') : '-';
    var pingStr = lastMs ? new Date(lastMs).toLocaleString('nl-NL') : '-';
    rows.push([naam, u.online?'Online':'Offline', u.uid||'anoniem', u.route||'', u.country||'', u.city||'', u.device||'', (u.browser||'').split('/')[0], u.pwa?'ja':'nee', sessS, u.activityCount||0, pingStr, connStr]);
  });
  var csv = rows.map(function(r){ return r.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'presence-export-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}


// ── Analytics ─────────────────────────────────────────────────
async function loadAnalytics() {
  // Veilige wrapper: toon altijd iets, ook bij crash
  try {
    await _doLoadAnalytics();
  } catch(err) {
    console.error('[Admin] loadAnalytics crash:', err.message || err, err.stack);
    set('an-updated', '⚠ Fout: ' + (err.message||String(err)));
    const el = document.getElementById('an-bars');
    if (el) el.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">⚠ Analytics fout: ' + esc(err.message||String(err)) + '<br><small>Zie browser console voor details.</small></div>';
  }
}

// ── Naam helper functies (module scope) ──────────────────────
function uNaam(uid, fb) {
  if (!uid) return fb || 'Gast';
  const c = window._userCache && window._userCache[uid];
  if (c) return (typeof c === 'object') ? (c.naam || c.displayName || fb || 'Gast') : c;
  return fb || 'Gast'; // NOOIT uid tonen - altijd Gast als fallback
}
// Trigger async profile lookup zodat bij re-render de naam er wél is
function uNaamAsync(uid, fb, onResolved) {
  if (!uid) return fb || 'Gast';
  const c = window._userCache && window._userCache[uid];
  if (c) return (typeof c === 'object') ? (c.naam || c.displayName || fb || 'Gast') : c;
  // Async ophalen uit Firestore, re-render na load
  if (window._userCache && !window._userCache['_pend_'+uid]) {
    window._userCache = window._userCache || {};
    window._userCache['_pend_'+uid] = true;
    if (window.db) {
      db.collection('users').doc(uid).get()
        .then(function(d) {
          if (d.exists) {
            var data = d.data();
            window._userCache[uid] = { naam: data.displayName || data.naam || 'Gebruiker', niveau: data.niveau||'', avatar: data.avatar||null };
          } else {
            window._userCache[uid] = { naam: fb || 'Gebruiker', niveau: '', avatar: null };
          }
          delete window._userCache['_pend_'+uid];
          if (typeof onResolved === 'function') onResolved(window._userCache[uid].naam);
        }).catch(function(){
          delete window._userCache['_pend_'+uid];
        });
    }
  }
  return fb || 'Gast';
}
function uNiveau(uid) {
  const c = window._userCache && window._userCache[uid];
  return (c && c.niveau) || '';
}

async function _doLoadAnalytics() {
  const periodEl  = document.getElementById('an-period');
  const segmentEl = document.getElementById('an-segment');
  const period  = parseInt((periodEl && periodEl.value) || '86400000');
  const segment = (segmentEl && segmentEl.value) || '';
  const since   = Date.now() - period;

  set('an-updated', 'Laden…');

  // 1. Zorg dat _userCache gevuld is
  window._userCache = window._userCache || {};
  const cacheKeys = Object.keys(window._userCache).filter(k => !k.startsWith('_'));
  if (cacheKeys.length < 2) {
    try {
      const usSnap = await db.collection('users').limit(150).get();
      usSnap.docs.forEach(function(d) {
        const data = d.data();
        if (data.displayName || data.naam) {
          window._userCache[d.id] = { naam: data.displayName || data.naam, niveau: data.niveau || '', avatar: data.avatar || null };
        }
      });
    } catch(e) { console.warn('[Analytics] users cache fout:', e.code); }
  }

  // Naam helpers: gedelegeerd naar module-scope functies
  // (function declarations niet toegestaan in strict mode blocks)

  // 2. Parallel data laden
  const results = await Promise.allSettled([
    db.collection('activity_logs').limit(800).get(),       // 0
    db.collection('wishlist').limit(50).get(),              // 1
    db.collection('kleur_stemmen').get(),                   // 2
    db.collection('stories').limit(30).get(),               // 3
    db.collection('looks').limit(20).get(),                 // 4
    db.collection('dsp_log').limit(200).get(),              // 5
    db.collection('users').limit(300).get()                 // 6 body/maat
  ]);

  const pr = function(i) { return results[i].status === 'fulfilled' ? results[i].value : null; };

  const evSnap      = pr(0);
  const wlSnap      = pr(1);
  const klSnap      = pr(2);
  const storiesSnap = pr(3);
  const looksSnap   = pr(4);
  const dspSnap     = pr(5);
  const usersSnap   = pr(6);

  const allEvRaw = evSnap ? evSnap.docs.map(function(d){return d.data();}) : [];

  // 3. Filter op periode + segment
  const since24h = since;
  let evs = allEvRaw.filter(function(e){return (e.timestamp||0) >= since24h;});
  if (segment === 'auth')    evs = evs.filter(function(e){return e.userId && !e.isAnonymous;});
  if (segment === 'anon')    evs = evs.filter(function(e){return !e.userId || e.isAnonymous;});
  if (segment === 'mobile')  evs = evs.filter(function(e){return e.deviceInfo && e.deviceInfo.type === 'mobile';});
  if (segment === 'desktop') evs = evs.filter(function(e){return e.deviceInfo && e.deviceInfo.type === 'desktop';});

  // 4. KPIs
  const likes    = evs.filter(function(e){return e.type==='like';}).length;
  const posts    = evs.filter(function(e){return e.type==='verhaal_plaatsen'||e.type==='look_plaatsen';}).length;
  const overlays = evs.filter(function(e){return e.type==='overlay_open';}).length;
  const dms      = evs.filter(function(e){return e.type==='dm_versturen';}).length;

  const sessionSet = {};
  evs.forEach(function(e){if(e.sessionId) sessionSet[e.sessionId]=1;});
  const sessions = Object.keys(sessionSet).length;

  // Sessieduur
  const sessDurs = {};
  evs.forEach(function(e){
    if(!e.sessionId) return;
    if(!sessDurs[e.sessionId]) sessDurs[e.sessionId]={mn:e.timestamp||0,mx:e.timestamp||0};
    const ts = e.timestamp||0;
    if(ts < sessDurs[e.sessionId].mn) sessDurs[e.sessionId].mn = ts;
    if(ts > sessDurs[e.sessionId].mx) sessDurs[e.sessionId].mx = ts;
  });
  const durs = Object.values(sessDurs).map(function(s){return s.mx-s.mn;}).filter(function(d){return d>0;});
  const avgDur = durs.length ? Math.round(durs.reduce(function(a,b){return a+b;},0)/durs.length/1000) : 0;
  const durStr = avgDur < 60 ? avgDur+'s' : Math.round(avgDur/60)+'m '+Math.round(avgDur%60)+'s';

  // Terugkerende users
  const userSess = {};
  evs.forEach(function(e){
    if(!e.userId) return;
    if(!userSess[e.userId]) userSess[e.userId] = {};
    if(e.sessionId) userSess[e.userId][e.sessionId] = 1;
  });
  const returning = Object.values(userSess).filter(function(s){return Object.keys(s).length>1;}).length;

  set('an-ev',  fmt(evs.length));
  set('an-ses', fmt(sessions));
  set('an-ov',  fmt(overlays));
  set('an-dm',  fmt(dms));
  set('an-lk',  fmt(likes));
  set('an-po',  fmt(posts));
  set('an-dur', durStr);
  set('an-ret', fmt(returning));
  set('an-updated', 'Bijgewerkt: ' + new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));

  // 5. Activiteit per uur histogram
  const hourC = new Array(24).fill(0);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  evs.forEach(function(e){
    const t = e.timestamp||0;
    if(t >= todayStart.getTime()) hourC[new Date(t).getHours()]++;
  });
  const maxH = Math.max.apply(null, hourC.concat([1]));
  const nowH = new Date().getHours();
  const hb = document.getElementById('an-hour-bars');
  const hl = document.getElementById('an-hour-labels');
  if (hb) {
    hb.innerHTML = hourC.map(function(c,h){
      return '<div title="'+h+'u: '+c+' events" style="flex:1;background:'+(h===nowH?'var(--gold)':'rgba(198,125,6,0.35)')+';height:'+(c/maxH*100).toFixed(0)+'%;border-radius:2px 2px 0 0;min-height:'+(c>0?'2px':'0')+'"></div>';
    }).join('');
  }
  if (hl) hl.innerHTML = '<span>0u</span><span>6u</span><span>12u</span><span>18u</span><span>23u</span>';

  // 6. Events per type
  const byT = {};
  evs.forEach(function(e){byT[e.type]=(byT[e.type]||0)+1;});
  bars(Object.entries(byT).sort(function(a,b){return b[1]-a[1];}).slice(0,8), 'an-bars');

  // 7. Routes
  const byR = {};
  evs.forEach(function(e){if(e.route)byR[e.route]=(byR[e.route]||0)+1;});
  bars(Object.entries(byR).sort(function(a,b){return b[1]-a[1];}).slice(0,6), 'an-routes', 'blue');

  // Landen verdeling vanuit presence docs
  var byCountry = {};
  (window._presenceDocs||[]).forEach(function(u){ var c=u.city&&u.country?u.city+' ('+u.country+')':u.country||u.lang||'?'; byCountry[c]=(byCountry[c]||0)+1; });
  bars(Object.entries(byCountry).sort(function(a,b){return b[1]-a[1];}), 'an-country-bars', 'green');

  // 8. Kleur stemmen
  if (klSnap) {
    const byK = {};
    klSnap.docs.forEach(function(d){const k=d.data().kleur||'?';byK[k]=(byK[k]||0)+1;});
    bars(Object.entries(byK).sort(function(a,b){return b[1]-a[1];}), 'kleur-bars', 'green');
  }

  // 9. Top gebruikers
  const byU = {};
  evs.forEach(function(e){
    const key = e.userId || ('anon_'+(e.sessionId||''));
    if(!byU[key]) byU[key]={uid:e.userId,ev:0,lk:0,po:0,dsp:0,device:(e.deviceInfo&&e.deviceInfo.type)||'-',anon:!e.userId};
    byU[key].ev++;
    if(e.type==='like') byU[key].lk++;
    if(e.type==='verhaal_plaatsen'||e.type==='look_plaatsen') byU[key].po++;
    if(e.type==='dsp_verdienen') byU[key].dsp++;
  });
  const topU = Object.entries(byU).sort(function(a,b){return b[1].ev-a[1].ev;}).slice(0,10);
  const anTop = document.getElementById('an-top');
  if (anTop) {
    anTop.innerHTML = topU.map(function(entry){
      const key = entry[0], st = entry[1];
      const naam   = st.anon ? '👤 Gast' : uNaam(st.uid);
      const niveau = st.uid ? uNiveau(st.uid) : '';
      const dIco   = st.device==='mobile' ? '📲' : '🖥️';
      var clickAttr = (!st.anon && st.uid) ? ' style="cursor:pointer" onclick="goToUser(\''+st.uid+'\')"' : '';
      return '<tr'+clickAttr+'>' +
        '<td><div class="urow">' + uav(naam, 24) + '<div><div class="uname">'+esc(naam)+'</div>' +
        (niveau ? '<span class="badge b-gold" style="font-size:9px">'+esc(niveau)+'</span>' : '') +
        '</div></div></td>' +
        '<td style="font-weight:600">'+st.ev+'</td>' +
        '<td>'+st.lk+'</td><td>'+st.po+'</td>' +
        '<td style="color:var(--gold)">'+st.dsp+'</td>' +
        '<td class="muted">'+dIco+' '+esc(st.device)+'</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">Geen data.</td></tr>';
  }

  // 10. Trending content
  const trending = [];
  if (storiesSnap) storiesSnap.docs.forEach(function(d){
    const data = d.data();
    const lks = typeof data.likes==='object' ? Object.keys(data.likes||{}).length : (data.likes||0);
    trending.push({type:'Story', auteur:data.authorName||uNaam(data.userId,'-'), likes:lks, reacties:data.reactieCount||0});
  });
  if (looksSnap) looksSnap.docs.forEach(function(d){
    const data = d.data();
    const lks = typeof data.likes==='object' ? Object.keys(data.likes||{}).length : (data.likes||0);
    trending.push({type:'Look', auteur:uNaam(data.userId,'-'), likes:lks, reacties:data.reactieCount||0});
  });
  trending.sort(function(a,b){return (b.likes+b.reacties*2)-(a.likes+a.reacties*2);});
  const anTr = document.getElementById('an-trending');
  if (anTr) {
    const topScore = trending.length ? (trending[0].likes+trending[0].reacties*2) : 1;
    anTr.innerHTML = trending.slice(0,8).map(function(t){
      const score = t.likes + t.reacties*2;
      const bar   = Math.min(100, Math.round(score/topScore*100));
      return '<tr>' +
        '<td><span class="badge '+(t.type==='Story'?'b-blue':'b-gold')+'">'+t.type+'</span></td>' +
        '<td class="uname">'+esc(t.auteur)+'</td>' +
        '<td>❤️ '+t.likes+'</td><td>💬 '+t.reacties+'</td>' +
        '<td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">' +
        '<div style="width:'+bar+'%;height:100%;background:var(--gold);border-radius:3px"></div></div>' +
        '<span style="font-size:11px;color:var(--text2);width:28px;text-align:right">'+score+'</span></div></td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">Geen content.</td></tr>';
  }

  // 11. DSP verdeling
  if (dspSnap) {
    const byA = {};
    dspSnap.docs.forEach(function(d){const a=d.data().actie||'?';byA[a]=(byA[a]||0)+(d.data().pts||0);});
    bars(Object.entries(byA).sort(function(a,b){return b[1]-a[1];}).slice(0,6), 'an-dsp-bars');
  }

  // 12. Slimme inzichten
  const insights = [];
  const peakH = hourC.indexOf(Math.max.apply(null,hourC));
  if (Math.max.apply(null,hourC) > 0) insights.push({ico:'⏰',title:'Piekuur',text:peakH+'u met '+hourC[peakH]+' events'});
  const engRatio = evs.length > 0 ? Math.round((likes+overlays)/evs.length*100) : 0;
  insights.push({ico:'📊',title:'Engagement ratio',text:engRatio+'% van events is actief engagement'});
  if (topU.length > 0) {
    const topData = topU[0][1];
    insights.push({ico:'🏆',title:'Meest actief',text:esc(topData.anon?'Een gast':uNaam(topData.uid))+' met '+topData.ev+' events'});
  }
  if (evs.length > 0) {
    const anonPct = Math.round(evs.filter(function(e){return !e.userId;}).length/evs.length*100);
    insights.push({ico:'👤',title:'Anonieme bezoekers',text:anonPct+'% van alle events is van gasten'});
  }
  const topAction = Object.entries(byT).sort(function(a,b){return b[1]-a[1];})[0];
  if (topAction) insights.push({ico:'🔥',title:'Populairste actie',text:'"'+topAction[0]+'" ('+topAction[1]+' keer)'});
  const retPct = Object.keys(userSess).length > 0 ? Math.round(returning/Object.keys(userSess).length*100) : 0;
  insights.push({ico:'🔄',title:'Retentie',text:retPct+'% van ingelogde users keert terug'});

  const anIns = document.getElementById('an-insights');
  if (anIns) {
    anIns.innerHTML = insights.map(function(i){
      return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:18px;flex-shrink:0">'+i.ico+'</span>' +
        '<div><div style="font-size:12px;font-weight:600">'+i.title+'</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:2px">'+i.text+'</div></div></div>';
    }).join('') || '<div class="empty">Onvoldoende data.</div>';
  }

  // 13. Wishlist
  if (wlSnap) {
    const anWl = document.getElementById('an-wl');
    if (anWl) anWl.innerHTML = wlSnap.docs.map(function(d){
      const w = d.data();
      return '<tr><td>'+esc(uNaam(w.uid,'Onbekend'))+'</td><td>'+esc(w.product||'-')+'</td><td class="muted">'+ts(w.ts)+'</td></tr>';
    }).join('') || '<tr><td colspan="3" class="empty">Geen wishlist activiteit.</td></tr>';
  }

  // 14. Geografische verdeling - aggregeert uit ALLE bronnen
  var geoC = {}, geoR = {}, geoCity = {};
  var geoTotal = 0;

  // Bron A: realtime presence docs (meest actueel)
  (window._presenceDocs||[]).forEach(function(u){
    var cn = u.country_name || u.country || '';
    var re = u.region || '';
    var ci = u.city   || '';
    if (cn) { geoC[cn] = (geoC[cn]||0) + 1; geoTotal++; }
    if (re) geoR[re] = (geoR[re]||0) + 1;
    if (ci) geoCity[ci] = (geoCity[ci]||0) + 1;
  });

  // Bron B: activity_logs met geo veld (alle events uit huidig period)
  // allEvRaw bevat alle events inclusief geo
  allEvRaw.forEach(function(e){
    var g = e.geo || {};
    var cn = g.country_name || g.country || '';
    var re = g.region || '';
    var ci = g.city || '';
    if (cn && !geoC[cn]) { geoC[cn] = 1; geoTotal++; } // tel één keer per sessie
    else if (cn) { /* al geteld via presence */ }
    if (re && !geoR[re]) geoR[re] = 1;
    if (ci && !geoCity[ci]) geoCity[ci] = 1;
  });

  // Unieke sessie-geo: groepeer per sessionId zodat 1 sessie = 1 geo datapunt
  var sessGeo = {};
  allEvRaw.forEach(function(e){
    var sid = e.sessionId;
    if (!sid) return;
    var g = e.geo || {};
    if (!sessGeo[sid] && (g.city || g.country)) sessGeo[sid] = g;
  });
  // Reset en hertelling op basis van unieke sessies
  var geoC2 = {}, geoR2 = {}, geoCity2 = {};
  Object.values(sessGeo).forEach(function(g){
    var cn = g.country_name || g.country || '';
    var re = g.region || '';
    var ci = g.city || '';
    if (cn) geoC2[cn] = (geoC2[cn]||0) + 1;
    if (re) geoR2[re] = (geoR2[re]||0) + 1;
    if (ci) geoCity2[ci] = (geoCity2[ci]||0) + 1;
  });
  // Merge presence + sessie-geo (presence wint bij overlap)
  Object.entries(geoC2).forEach(function(e){ if (!geoC[e[0]]) geoC[e[0]] = e[1]; });
  Object.entries(geoR2).forEach(function(e){ if (!geoR[e[0]]) geoR[e[0]] = e[1]; });
  Object.entries(geoCity2).forEach(function(e){ if (!geoCity[e[0]]) geoCity[e[0]] = e[1]; });

  var geoEntries = Object.entries(geoC).sort(function(a,b){return b[1]-a[1];});
  var regEntries = Object.entries(geoR).sort(function(a,b){return b[1]-a[1];});
  var citEntries = Object.entries(geoCity).sort(function(a,b){return b[1]-a[1];});

  if (geoEntries.length > 0) {
    bars(geoEntries.slice(0,8), 'an-geo-country', 'green');
  } else {
    var elC = document.getElementById('an-geo-country');
    if(elC) elC.innerHTML='<div style="padding:10px;font-size:11px;color:var(--text3)">Geen data - geo actief voor nieuwe sessies (ipapi.co)</div>';
  }
  if (regEntries.length > 0) {
    bars(regEntries.slice(0,8), 'an-geo-region');
  } else {
    var elR = document.getElementById('an-geo-region');
    if(elR) elR.innerHTML='<div style="padding:10px;font-size:11px;color:var(--text3)">Wacht op sessie-data</div>';
  }
  if (citEntries.length > 0) {
    bars(citEntries.slice(0,10), 'an-geo-city');
  } else {
    var elCity = document.getElementById('an-geo-city');
    if(elCity) elCity.innerHTML='<div style="padding:10px;font-size:11px;color:var(--text3)">Wacht op sessie-data</div>';
  }

  // 15. Body & maat analytics - volledige pipeline
  (function() {
    // Combineer users uit snap + user cache (admin heeft users geladen)
    var userDocs = [];
    if (usersSnap) {
      usersSnap.docs.forEach(function(d){ userDocs.push(d.data()); });
    }
    // Aanvullen vanuit _userCache (heeft ook body data als compleet profiel)
    // (cache bevat alleen naam/niveau - body data zit uitsluitend in usersSnap)

    var byLengte = {}, byBouw = {}, byMaat = {}, byFit = {}, bySchoen = {};
    var metLengte = 0, metBouw = 0, metMaat = 0;

    var lengteCats = [
      { label:'150–160cm', min:150, max:160 },
      { label:'160–170cm', min:160, max:170 },
      { label:'170–180cm', min:170, max:180 },
      { label:'180–190cm', min:180, max:190 },
      { label:'190–200cm', min:190, max:200 },
      { label:'200+ cm',   min:200, max:999 }
    ];
    var maatOrder = ['XS','S','M','L','XL','XXL','2XL','3XL','4XL','5XL'];

    userDocs.forEach(function(u){
      // Lengte
      var l = parseInt(u.lengte);
      if (!isNaN(l) && l > 100 && l < 250) {
        metLengte++;
        var cat = lengteCats.find(function(c){ return l >= c.min && l < c.max; });
        if (!cat) cat = lengteCats[lengteCats.length-1];
        byLengte[cat.label] = (byLengte[cat.label]||0) + 1;
      }
      // Bouw
      if (u.bouw) { byBouw[u.bouw] = (byBouw[u.bouw]||0)+1; metBouw++; }
      // Maat - normaliseer naar uppercase
      if (u.maat) {
        var m = String(u.maat).toUpperCase().trim();
        byMaat[m] = (byMaat[m]||0)+1;
        metMaat++;
      }
      // Fit voorkeur
      if (u.fitvoorkeur) byFit[u.fitvoorkeur] = (byFit[u.fitvoorkeur]||0)+1;
      // Schoenmaat (groepeer per 2)
      var s = parseInt(u.schoen);
      if (!isNaN(s) && s > 30 && s < 60) {
        var sg = (Math.floor(s/2)*2) + '–' + (Math.floor(s/2)*2+1);
        bySchoen[sg] = (bySchoen[sg]||0)+1;
      }
    });

    // Render lengte
    var lengteSorted = lengteCats
      .filter(function(c){ return byLengte[c.label] > 0; })
      .map(function(c){ return [c.label, byLengte[c.label]]; });
    var elL = document.getElementById('an-body-lengte');
    if (elL) {
      if (lengteSorted.length > 0) bars(lengteSorted, 'an-body-lengte', 'green');
      else elL.innerHTML='<div style="padding:10px;font-size:11px;color:var(--text3)">Gebruikers hebben nog geen lengte ingevuld (Body profile → Maten)</div>';
    }

    // Render bouw
    var bouwSorted = Object.entries(byBouw).sort(function(a,b){return b[1]-a[1];});
    var elB = document.getElementById('an-body-bouw');
    if (elB) {
      if (bouwSorted.length > 0) bars(bouwSorted, 'an-body-bouw');
      else elB.innerHTML='<div style="padding:10px;font-size:11px;color:var(--text3)">Geen lichaamsbouw ingevuld</div>';
    }

    // Render maat - sorteer op confectiemaat volgorde, daarna op frequentie
    var maatSorted = Object.entries(byMaat).sort(function(a,b){
      var ai = maatOrder.indexOf(a[0]), bi = maatOrder.indexOf(b[0]);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return b[1] - a[1];
    }).slice(0,10);
    var elM = document.getElementById('an-body-maat');
    if (elM) {
      if (maatSorted.length > 0) bars(maatSorted, 'an-body-maat');
      else elM.innerHTML='<div style="padding:10px;font-size:11px;color:var(--text3)">Geen confectiematen ingevuld</div>';
    }

    // Render fit voorkeur
    var fitSorted = Object.entries(byFit).sort(function(a,b){return b[1]-a[1];});
    var elF = document.getElementById('an-body-fit');
    if (elF) {
      if (fitSorted.length > 0) bars(fitSorted, 'an-body-fit', 'green');
      else elF.innerHTML='<div style="padding:10px;font-size:11px;color:var(--text3)">Geen fit voorkeuren ingevuld</div>';
    }

    // KPI update
    var elKpi = document.getElementById('an-body-kpi');
    if (elKpi) {
      var pctLengte = userDocs.length ? Math.round(metLengte/userDocs.length*100) : 0;
      var pctBouw   = userDocs.length ? Math.round(metBouw/userDocs.length*100) : 0;
      elKpi.innerHTML =
        '<div class="card" style="flex:1"><div class="card-label">Users met lengte</div><div class="card-val">'+metLengte+'</div><div class="card-sub">'+pctLengte+'% van '+userDocs.length+'</div></div>' +
        '<div class="card" style="flex:1"><div class="card-label">Users met bouw</div><div class="card-val">'+metBouw+'</div><div class="card-sub">'+pctBouw+'% van '+userDocs.length+'</div></div>' +
        '<div class="card" style="flex:1"><div class="card-label">Users met maat</div><div class="card-val">'+metMaat+'</div><div class="card-sub">'+Math.round(metMaat/Math.max(userDocs.length,1)*100)+'% van '+userDocs.length+'</div></div>';
    }
  })();
}


async function loadDSP() {
  try {
    const [dspSnap, usersSnap] = await Promise.allSettled([
      db.collection('dsp_log').orderBy('ts','desc').limit(100).get().catch(()=>db.collection('dsp_log').limit(100).get()),
      db.collection('users').orderBy('dsp_lifetime','desc').limit(30).get()
    ]);
  
    const dsp   = dspSnap.status==='fulfilled'   ? dspSnap.value   : null;
    const users = usersSnap.status==='fulfilled' ? usersSnap.value : null;
  
    if (dsp) {
      set('dsp-today', fmt(dsp.size));
      const tot = dsp.docs.reduce((s,d)=>s+(d.data().pts||0),0);
      set('dsp-tot', fmt(tot));
  
      document.getElementById('dsp-log').innerHTML = dsp.docs.map(d => {
        const e = d.data();
        const recv = e.ontvangerUid || e.uid || '';
      const ce = recv && window._userCache ? window._userCache[recv] : null;
      let rNaam = ce ? (typeof ce==='object' ? (ce.naam||ce.displayName) : ce) : null;
      if (!rNaam && recv) {
        rNaam = uNaamAsync(recv, recv.slice(0,10)+'…', function() {
          // Herrender DSP tab na naam ophalen
          if (_currentTab === 'dsp') loadDSP();
        });
      }
      if (!rNaam) rNaam = '-';
      const dspClick = recv ? ' style="cursor:pointer" onclick="goToUser(\'' + recv.replace(/'/g,'') + '\')"' : '';
      return '<tr' + dspClick + '>' +
        '<td class="muted">' + ts(e.ts) + '</td>' +
        '<td class="uname">' + esc(rNaam) + '</td>' +
        '<td><span class="badge b-gold">' + esc(e.actie||'-') + '</span></td>' +
        '<td style="color:var(--green);font-weight:600">+' + (e.pts||0) + '</td>' +
        '</tr>';
    }).join('');;
    }
  
    if (users) {
      const us = users.docs.map(d=>({...d.data(),uid:d.id}));
      const strk = us.filter(u=>(u.streak_huidig||0)>=3).length;
      set('dsp-str', fmt(strk));
  
      document.getElementById('dsp-top').innerHTML = us.map((u,i) => `
        <tr>
          <td><strong>${i+1}</strong></td>
          <td class="uname">${esc(u.displayName||u.naam||'-')}</td>
          <td><span class="badge b-gold">${esc(u.niveau||'-')}</span></td>
          <td style="color:var(--gold);font-weight:600">${fmt(u.dsp_lifetime)}</td>
          <td>🔥 ${u.streak_huidig||0}</td>
        </tr>`).join('');
  
      // Streaks tabel
      const withStreak = us.filter(u=>(u.streak_huidig||0)>0).sort((a,b)=>(b.streak_huidig||0)-(a.streak_huidig||0));
      document.getElementById('dsp-streaks').innerHTML = withStreak.map(u => {
        const s = u.streak_huidig||0;
        const mil = s>=30?'🏆 30 dagen':s>=7?'⭐ 7 dagen':s>=3?'🔥 3 dagen':'-';
        return `<tr>
          <td class="uname">${esc(u.displayName||u.naam||'Gast')}</td>
          <td style="color:var(--amber);font-weight:600">🔥 ${s}</td>
          <td>${u.streak_langste||0}</td>
          <td class="muted">${u.streak_laatste_dag||'-'}</td>
          <td>${mil}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="empty">Geen actieve streaks.</td></tr>';
    }
  } catch(err) {
    console.error('[Admin] loadDSP crash:', err.message || err);
    const _el = document.getElementById('dsp-log');
    if (_el) _el.innerHTML = '<tr><td colspan="10" style="padding:16px;color:var(--red);font-size:12px">⚠ Fout bij laden: ' + (err.message||'onbekend') + '</td></tr>';
  }
}

// ── Content ────────────────────────────────────────────────────
async function loadContent() {
  try {
    const col = document.getElementById('ct-filter')?.value || 'stories';
    const [stSnap, lkSnap, rvSnap] = await Promise.allSettled([
      db.collection('stories').get(),
      db.collection('looks').get(),
      db.collection('reviews').get()
    ]);
    if (stSnap.status==='fulfilled') set('ct-st', fmt(stSnap.value.size));
    if (lkSnap.status==='fulfilled') set('ct-lk', fmt(lkSnap.value.size));
    if (rvSnap.status==='fulfilled') set('ct-rv', fmt(rvSnap.value.size));
  
    const snap = await db.collection(col).orderBy('ts','desc').limit(50).get().catch(()=>db.collection(col).limit(50).get().catch(err=>{console.warn('[Admin]',err.code);return null;}));
    if (!snap) return;
    document.getElementById('ct-tbody').innerHTML = snap.docs.map(d => {
      const e = d.data();
      const likes = typeof e.likes === 'object' ? Object.keys(e.likes||{}).length : (e.likes||0);
      const auteur = esc(e.authorName||e.displayName||'-');
      const inhoud = esc((e.title||e.body||e.tekst||'-').slice(0,60));
      return `<tr>
        <td>${auteur}</td>
        <td class="truncate">${inhoud}</td>
        <td>${likes}</td>
        <td>${e.reactieCount||e.commentCount||0}</td>
        <td class="muted">${ts(e.ts)}</td>
        <td><button class="btn btn-sm btn-red" onclick="doHideDoc('${col}','${d.id}')">Verbergen</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Geen content.</td></tr>';
  } catch(err) {
    console.error('[Admin] loadContent crash:', err.message || err);
    const _el = document.getElementById('ct-tbody');
    if (_el) _el.innerHTML = '<tr><td colspan="10" style="padding:16px;color:var(--red);font-size:12px">⚠ Fout bij laden: ' + (err.message||'onbekend') + '</td></tr>';
  }
}

async function doHideDoc(col, id) {
  try {
  if (!confirm('Content verbergen?')) return;
  await db.collection(col).doc(id).update({verborgen:true}).catch(e=>alert(e.message));
  await logAction('hide_content',{collection:col,docId:id});
  loadContent();
  } catch(_e) {
    console.warn('[Admin] doHideDoc:', _e.message||_e.code||_e);
  }
}

// ── Berichten ─────────────────────────────────────────────────
// ── Berichten globals ─────────────────────────────────────────
var _dmGesprekken = [];        // Alle geladen gesprekken (plain objects)
var _dmActiefId   = null;      // Huidig geopend gesprek id
var _dmUnsub      = null;      // Realtime listener cleanup voor chat
var _dmZoek       = '';
var _dmFilterVal  = '';

// ── Naam helper voor berichten (haal uit namen map of cache) ───
function dmNaam(gespData, uid) {
  if (!uid) return 'Gast';
  var uit_namen = gespData.namen && gespData.namen[uid];
  if (uit_namen) return uit_namen;
  return uNaam(uid, 'Gast');
}

// ── Avatar initialen div ────────────────────────────────────────
function dmAv(naam, size) {
  size = size || 32;
  var ini = (naam||'?').slice(0,2).toUpperCase();
  return '<div class="uav" style="width:'+size+'px;height:'+size+'px;font-size:'+Math.round(size*.38)+'px;flex-shrink:0">'+esc(ini)+'</div>';
}

// ── Laad en render gesprekkenlijst ─────────────────────────────
async function loadBerichten() {
  var listEl = document.getElementById('dm-list');
  if (listEl) listEl.innerHTML = '<div class="loading" style="padding:16px">Laden…</div>';

  try {
    // 1. Haal gesprekken op (realtime listener)
    if (_dmUnsub) { _dmUnsub(); _dmUnsub = null; }

    var unsubGesp = db.collection('berichten')
      .orderBy('laatste_ts', 'desc')
      .limit(60)
      .onSnapshot(function(snap) {
        var today = new Date().toDateString();
        var actief = 0, totUnread = 0;

        // Pre-load alle deelnemers in cache
        var allUids = new Set();
        snap.docs.forEach(function(d) {
          (d.data().deelnemers||[]).forEach(function(uid){ if(uid) allUids.add(uid); });
        });
        allUids.forEach(function(uid) {
          if (!window._userCache[uid] && !window._userCache['_pend_'+uid]) {
            window._userCache['_pend_'+uid] = true;
            db.collection('users').doc(uid).get()
              .then(function(d2){
                var _d = d2.exists ? d2.data() : {};
                window._userCache[uid] = { naam: _d.displayName||_d.naam||'Gebruiker', niveau: _d.niveau||'', avatar: _d.avatar||null };
                delete window._userCache['_pend_'+uid];
                // Re-render lijst als huidig geopend gesprek betrokken uid heeft
                if (_dmActiefId) dmRenderLijst();
              }).catch(function(){ delete window._userCache['_pend_'+uid]; });
          }
        });

        _dmGesprekken = snap.docs.map(function(d) {
          var g = Object.assign({ _id: d.id }, d.data());
          var lts = g.laatste_ts;
          var ltsDate = lts && lts.toDate ? lts.toDate() : null;
          if (ltsDate && ltsDate.toDateString() === today) actief++;
          var ongelezen = Object.values(g.ongelezen||{}).reduce(function(s,v){ return s+(v||0); }, 0);
          totUnread += ongelezen;
          return g;
        });

        set('dm-g', fmt(_dmGesprekken.length));
        set('dm-a', fmt(actief));
        // Sample bericht count
        set('dm-m', '-');
        dmRenderLijst();
      }, function(err) {
        console.warn('[DM] onSnapshot fout:', err.code);
        if (listEl) listEl.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">⚠ Fout: '+esc(err.message||err.code)+'</div>';
      });

    _unsubs.push(unsubGesp);

  } catch(err) {
    console.error('[Admin] loadBerichten crash:', err.message || err);
    if (listEl) listEl.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">⚠ Fout: '+esc(err.message||'onbekend')+'</div>';
  }
}

// ── Render gesprekkenlijst (filter + zoek) ─────────────────────
function dmRenderLijst() {
  var zoek = (_dmZoek||'').toLowerCase();
  var filter = _dmFilterVal;
  var today = new Date().toDateString();

  var lijst = _dmGesprekken.filter(function(g) {
    // Filter
    if (filter === 'unread') {
      var ongelezen = Object.values(g.ongelezen||{}).reduce(function(s,v){ return s+(v||0); }, 0);
      if (ongelezen === 0) return false;
    }
    if (filter === 'today') {
      var lts = g.laatste_ts;
      var ltsDate = lts && lts.toDate ? lts.toDate() : null;
      if (!ltsDate || ltsDate.toDateString() !== today) return false;
    }
    // Zoek op namen of bericht
    if (zoek) {
      var namen = Object.values(g.namen||{}).join(' ').toLowerCase();
      var bericht = (g.laatste_bericht||'').toLowerCase();
      if (!namen.includes(zoek) && !bericht.includes(zoek)) return false;
    }
    return true;
  });

  var cntEl = document.getElementById('dm-list-cnt');
  if (cntEl) cntEl.textContent = lijst.length + ' gesprekken';

  var listEl = document.getElementById('dm-list');
  if (!listEl) return;

  if (!lijst.length) {
    listEl.innerHTML = '<div class="empty" style="padding:20px;text-align:center;color:var(--text3)">Geen gesprekken gevonden.</div>';
    return;
  }

  // Gebruik event delegation - één listener op container
  listEl.innerHTML = '';
  var fragment = document.createDocumentFragment();

  lijst.map(function(g) {
    var namen = Object.values(g.namen||{}).filter(Boolean);
    if (!namen.length && g.deelnemers) {
      namen = (g.deelnemers||[]).map(function(uid){ return uNaam(uid,'Gast'); });
    }
    var namenStr = namen.join(', ') || '-';
    var ongelezen = Object.values(g.ongelezen||{}).reduce(function(s,v){ return s+(v||0); }, 0);
    var actief = g._id === _dmActiefId;
    var initials = namen.slice(0,2).map(function(n){ return dmAv(n, 28); }).join('');
    var tsStr = '';
    if (g.laatste_ts && g.laatste_ts.toDate) {
      var d = g.laatste_ts.toDate();
      var now = new Date();
      if (d.toDateString() === now.toDateString()) {
        tsStr = d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
      } else {
        tsStr = d.toLocaleDateString('nl-NL',{day:'2-digit',month:'2-digit'});
      }
    }

    var el = document.createElement('div');
    el.className = 'dm-row' + (actief ? ' dm-row-actief' : '');
    el.setAttribute('data-gesprek-id', g._id);
    el.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s' + (actief ? ';background:var(--bg3)' : '');
    el.addEventListener('click', function(){ dmOpenGesprek(g._id); });
    el.innerHTML =
      '<div style="display:flex;gap:4px;flex-shrink:0">'+initials+'</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(namenStr)+'</div>' +
        '<div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">'+esc(g.laatste_bericht||'-')+'</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">' +
        (ongelezen > 0 ? '<span class="badge b-amber" style="font-size:10px">'+ongelezen+'</span>' : '') +
        '<span style="font-size:10px;color:var(--text3)">'+tsStr+'</span>' +
      '</div>';
    return el.outerHTML;
  }).forEach(function(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    if (tmp.firstChild) fragment.appendChild(tmp.firstChild);
  });
  listEl.onclick = function(e){
    var row = e.target.closest('[data-gesprek-id]');
    if (row) dmOpenGesprek(row.getAttribute('data-gesprek-id'));
  };
  listEl.appendChild(fragment);
}

// ── Filter/zoek handlers ───────────────────────────────────────
function dmFilter() {
  _dmZoek = (document.getElementById('dm-zoek')||{}).value || '';
  _dmFilterVal = (document.getElementById('dm-filter')||{}).value || '';
  dmRenderLijst();
}

// ── Open gesprek: render chat detail + start realtime listener ─
function dmOpenGesprek(gesprekId) {
  // Stop vorige chat listener
  if (_dmUnsub && _dmUnsub._chatUnsub) {
    _dmUnsub._chatUnsub();
    _dmUnsub._chatUnsub = null;
  }
  _dmActiefId = gesprekId;
  dmRenderLijst(); // Highlight actief gesprek

  var gesprek = _dmGesprekken.find(function(g){ return g._id === gesprekId; });
  if (!gesprek) return;

  // Render header
  var headerEl = document.getElementById('dm-chat-header');
  var msgsEl   = document.getElementById('dm-chat-msgs');
  var liveBar  = document.getElementById('dm-live-bar');
  if (headerEl) headerEl.style.display = 'flex';
  if (liveBar)  liveBar.style.display  = 'block';

  // Deelnemers namen
  var namen = Object.values(gesprek.namen||{}).filter(Boolean);
  if (!namen.length && gesprek.deelnemers) {
    namen = (gesprek.deelnemers||[]).map(function(uid){ return uNaam(uid,'Gast'); });
  }
  var deelnemerUids = gesprek.deelnemers || [];

  var nameEl = document.getElementById('dm-ch-namen');
  var metaEl = document.getElementById('dm-ch-meta');
  var avEl   = document.getElementById('dm-ch-avatars');
  if (nameEl) nameEl.textContent = namen.join(' ↔ ') || '-';
  if (metaEl) metaEl.textContent = deelnemerUids.length + ' deelnemers · gesprek ' + gesprekId.slice(0,12) + '…';
  if (avEl)   avEl.innerHTML = namen.slice(0,3).map(function(n){ return dmAv(n, 34); }).join('');

  // Profiel knoppen per deelnemer
  ['a','b'].forEach(function(ab, i) {
    var btn = document.getElementById('dm-ch-profiel-'+ab);
    if (!btn) return;
    var uid = deelnemerUids[i];
    if (uid) {
      var n = uNaam(uid, namen[i]||'Gast');
      btn.textContent = '👤 ' + n;
      btn.style.display = 'inline-flex';
      btn.onclick = function(){ goToUser(uid); };
    } else {
      btn.style.display = 'none';
    }
  });
  var flagBtn = document.getElementById('dm-ch-flag');
  if (flagBtn) flagBtn.style.display = 'inline-flex';

  if (msgsEl) msgsEl.innerHTML = '<div class="loading" style="padding:20px;text-align:center">Berichten laden…</div>';

  // Realtime listener op messages subcollectie
  var chatUnsub = db.collection('berichten').doc(gesprekId)
    .collection('messages')
    .orderBy('ts', 'asc')
    .limit(100)
    .onSnapshot(function(snap) {
      dmRenderChat(snap, gesprek);
    }, function(err) {
      if (msgsEl) msgsEl.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px">⚠ Fout: '+esc(err.message||err.code)+'</div>';
    });

  // Bewaar cleanup op _dmUnsub object
  if (!_dmUnsub) _dmUnsub = function(){};
  _dmUnsub._chatUnsub = chatUnsub;
}

// ── Render berichten in chat view ──────────────────────────────
function dmRenderChat(snap, gesprek) {
  var msgsEl = document.getElementById('dm-chat-msgs');
  if (!msgsEl) return;

  if (!snap || snap.empty) {
    msgsEl.innerHTML = '<div class="empty" style="text-align:center;padding:30px;color:var(--text3)">Nog geen berichten in dit gesprek.</div>';
    return;
  }

  var deelnemerUids = gesprek.deelnemers || [];
  var prevDate = null;

  msgsEl.innerHTML = snap.docs.map(function(d) {
    var msg = d.data();
    var senderUid = msg.userId || msg.senderId || '';
    var senderNaam = dmNaam(gesprek, senderUid);
    var isDeelA = deelnemerUids[0] === senderUid;
    var kleur = isDeelA ? 'var(--gold)' : 'var(--green, #2a9d5c)';

    // Timestamp
    var tsVal = msg.ts && msg.ts.toDate ? msg.ts.toDate() : (msg.createdAt ? new Date(msg.createdAt) : null);
    var tsStr = tsVal ? tsVal.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}) : '-';
    var dateStr = tsVal ? tsVal.toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'}) : null;

    // Datumscheider
    var dateSep = '';
    if (dateStr && dateStr !== prevDate) {
      prevDate = dateStr;
      dateSep = '<div style="text-align:center;font-size:10px;color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:6px">'+esc(dateStr)+'</div>';
    }

    // Media
    var mediaHtml = '';
    if (msg.afbeelding || msg.foto || msg.image) {
      var imgUrl = msg.afbeelding || msg.foto || msg.image;
      mediaHtml = '<img src="'+esc(imgUrl)+'" alt="afbeelding" loading="lazy" style="max-width:200px;border-radius:8px;margin-top:6px;display:block;cursor:pointer" onclick="window.open(this.src,&quot;_blank&quot;)">';
    }

    // Gelezen status
    var gelezenStr = msg.gelezen ? '<span style="font-size:9px;color:var(--text3);margin-left:4px">✓✓</span>' : '<span style="font-size:9px;color:var(--text3);margin-left:4px">✓</span>';

    return dateSep +
      '<div style="display:flex;flex-direction:column;gap:1px">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          dmAv(senderNaam, 22) +
          '<span style="font-size:11px;font-weight:600;color:'+kleur+'">'+esc(senderNaam)+'</span>' +
          '<span style="font-size:10px;color:var(--text3)">'+tsStr+'</span>' +
          gelezenStr +
        '</div>' +
        '<div style="margin-left:28px;font-size:12px;line-height:1.5;color:var(--text)">'+esc(msg.tekst||'')+'</div>' +
        (mediaHtml ? '<div style="margin-left:28px">'+mediaHtml+'</div>' : '') +
      '</div>';
  }).join('');

  // Scroll naar onderkant
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

// ── Vlag gesprek voor moderatie ───────────────────────────────
function dmFlagGesprek() {
  if (!_dmActiefId) return;
  if (!confirm('Gesprek markeren voor moderatie?')) return;
  db.collection('admin_log').add({
    actie: 'flag_gesprek',
    adminEmail: auth.currentUser ? auth.currentUser.email : '-',
    meta: { gesprekId: _dmActiefId },
    ts: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function(){ alert('Gesprek gemarkeerd.'); })
    .catch(function(e){ alert('Fout: '+e.message); });
}

// ── Moderatie ─────────────────────────────────────────────────
async function loadMod() {
  try {
    const snap = await db.collection('admin_log').orderBy('ts','desc').limit(50).get().catch(()=>null);
    if (!snap) return;
  
    const logs = snap.docs.map(d=>({...d.data(),id:d.id})).filter(e=>e.actie!=='login');
    set('mod-n', fmt(logs.length));
    const warns   = logs.filter(e=>e.actie==='moderation_warn').length;
    const hidings = logs.filter(e=>e.actie==='hide_content').length;
    set('mod-w', fmt(warns));
    set('mod-h', fmt(hidings));
  
    document.getElementById('mod-log').innerHTML = logs.slice(0,30).map(e => `
      <tr>
        <td class="muted">${ts(e.ts)}</td>
        <td class="mono">${esc(e.adminEmail||'-')}</td>
        <td><span class="badge b-red">${esc(e.actie||'-')}</span></td>
        <td class="mono">${(function(){ var tuid=e.meta?.uid||''; return tuid ? esc(uNaam(tuid, tuid.slice(0,12))) : esc((e.meta?.docId||'').slice(0,16)||'-'); })()}</td>
        <td class="muted truncate">${esc(e.meta?.reason||e.meta?.bericht||'-')}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty">Geen acties.</td></tr>';
  } catch(err) {
    console.error('[Admin] loadMod crash:', err.message || err);
    const _el = document.getElementById('mod-log');
    if (_el) _el.innerHTML = '<tr><td colspan="10" style="padding:16px;color:var(--red);font-size:12px">⚠ Fout bij laden: ' + (err.message||'onbekend') + '</td></tr>';
  }
}

async function doMod() {
  try {
  const uid    = document.getElementById('mod-uid').value.trim();
  const action = document.getElementById('mod-act').value;
  const reason = document.getElementById('mod-reas').value.trim();
  if (!uid || !reason) { alert('UID en reden verplicht.'); return; }
  await db.collection('users').doc(uid).update({
    modStatus: action, modReason: reason,
    modBy: auth.currentUser?.uid,
    modAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => { alert('Fout: ' + e.message); return; });
  await logAction('moderation_' + action, { uid, reason });
  alert('✓ Actie uitgevoerd: ' + action);
  loadMod();
  } catch(_e) {
    console.warn('[Admin] doMod:', _e.message||_e.code||_e);
  }
}

async function doHide() {
  try {
  const col = document.getElementById('hide-col').value;
  const id  = document.getElementById('hide-id').value.trim();
  if (!id) { alert('Document ID verplicht.'); return; }
  await db.collection(col).doc(id).update({verborgen:true}).catch(e=>{alert(e.message);return;});
  await logAction('hide_content',{collection:col,docId:id});
  alert('✓ Verborgen.');
  } catch(_e) {
    console.warn('[Admin] doHide:', _e.message||_e.code||_e);
  }
}

// ── Errors ────────────────────────────────────────────────────
async function clearErrors() {
  if (!confirm('Alle errors uit de afgelopen 24u wissen?')) return;
  try {
    var since = Date.now() - 86400000;
    var snap = await db.collection('activity_logs')
      .where('category','==','systeem').limit(150).get();
    var toDelete = snap.docs.filter(function(d){ return (d.data().timestamp||0) >= since; });
    if (!toDelete.length) { alert('Geen errors om te wissen.'); return; }
    var batch = db.batch();
    toDelete.forEach(function(d){ batch.delete(d.ref); });
    await batch.commit();
    await logAction('clear_errors', {count: toDelete.length});
    alert('✓ ' + toDelete.length + ' errors gewist.');
    loadErrors();
  } catch(e) {
    alert('Fout: ' + e.message);
  }
}

async function loadErrors() {
  try {
    const since24 = Date.now() - 86400000;
    const since7d  = Date.now() - 7 * 86400000;
    const snap = await db.collection('activity_logs')
      .where('category','==','systeem').limit(300)
      .get().catch(function(err) { console.warn('[Admin] errors snap:', err.code); return null; });

    if (!snap) { set('er-n','-'); return; }

    const all = snap.docs.map(function(d) { return d.data(); })
      .filter(function(e) { return (e.timestamp||0) >= since7d; })
      .sort(function(a,b) { return (b.timestamp||0)-(a.timestamp||0); });

    const recent = all.filter(function(e) { return (e.timestamp||0) >= since24; });

    set('er-n',  fmt(recent.length));
    set('er-js', fmt(recent.filter(function(e){ return e.type==='js_error'; }).length));
    set('er-pr', fmt(recent.filter(function(e){ return e.type==='promise_rejection'; }).length));

    // Dedupliceer: groepeer op message+type
    var grouped = {};
    all.forEach(function(e) {
      var msg = (e.metadata && (e.metadata.message || e.metadata.reason)) || '-';
      var key = (e.type||'') + '|' + msg.slice(0,80);
      if (!grouped[key]) {
        grouped[key] = { first: e, count: 0, lastTs: 0, uids: new Set() };
      }
      grouped[key].count++;
      grouped[key].lastTs = Math.max(grouped[key].lastTs, e.timestamp||0);
      if (e.userId) grouped[key].uids.add(e.userId);
    });

    // Severity bepalen
    function severity(e, count) {
      if (count >= 20) return { label:'Kritiek', cls:'b-red' };
      if (count >= 5)  return { label:'Hoog',    cls:'b-amber' };
      if (e.type === 'promise_rejection') return { label:'Waarschuwing', cls:'b-amber' };
      if (e.type === 'js_error')          return { label:'Fout',         cls:'b-red' };
      return { label:'Info', cls:'b-blue' };
    }

    // Sorteer grouped op lastTs
    var rows = Object.values(grouped).sort(function(a,b){ return b.lastTs - a.lastTs; });

    document.getElementById('er-tbody').innerHTML = rows.map(function(g) {
      var e   = g.first;
      var msg = (e.metadata && (e.metadata.message || e.metadata.reason)) || '-';
      var sev = severity(e, g.count);
      var isRecent = g.lastTs >= since24;
      var typeLabel = (e.type||'-').replace('_',' ');

      return '<tr>' +
        '<td class="mono muted" style="white-space:nowrap;font-size:10px">' + new Date(g.lastTs).toLocaleString('nl-NL') + '</td>' +
        '<td><span class="badge ' + sev.cls + '" style="font-size:9px">' + sev.label + '</span></td>' +
        '<td><span class="badge b-red" style="font-size:9px">' + esc(typeLabel) + '</span>' +
          (g.count > 1 ? ' <span style="font-size:9px;color:var(--text3)">×' + g.count + '</span>' : '') + '</td>' +
        '<td class="muted truncate" style="max-width:220px;font-size:11px">' + esc(msg.slice(0,120)) + '</td>' +
        '<td><span class="badge b-blue" style="font-size:9px">' + esc(e.route||'-') + '</span></td>' +
        '<td class="mono" style="font-size:10px">' + uNaam(e.userId,'Gast') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6" class="empty">Geen errors in de afgelopen 7 dagen.</td></tr>';

  } catch(err) {
    console.error('[Admin] loadErrors crash:', err.message || err);
    const _el = document.getElementById('er-tbody');
    if (_el) _el.innerHTML = '<tr><td colspan="6" style="padding:16px;color:var(--red);font-size:12px">⚠ Fout bij laden: ' + (err.message||'onbekend') + '</td></tr>';
  }
}



// ── Admin beheer ──────────────────────────────────────────────

async function loadAdminList() {
  try {
  const snap = await db.collection('admin_access').get().catch(()=>null);
  const all = [
    { uid: OWNER,  label: 'William (mozenlow · eigenaar)', permanent: true },
    { uid: OWNER2, label: 'William (williamdevriesis · eigenaar)', permanent: true },
    ...(snap ? snap.docs.map(d=>({uid:d.id,...d.data()})) : [])
  ];
  document.getElementById('adm-list').innerHTML = all.map(a => `
    <div class="flex" style="padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="badge b-gold">Admin</span>
      <span style="font-size:12px;font-weight:500">${esc(a.label||'-')}</span>
      <span class="mono" style="font-size:11px;color:var(--text3)">${a.uid}</span>
      ${a.permanent ? '' : `<button class="btn btn-sm btn-red" style="margin-left:auto" onclick="removeAdmin('${a.uid}')">Verwijderen</button>`}
    </div>`).join('') || '<div class="empty">Geen extra admins.</div>';
  } catch(_e) { console.warn('[Admin] loadAdminList:', _e.message||_e.code||_e); }
}

async function addAdmin() {
  try {
  const uid   = document.getElementById('adm-uid').value.trim();
  const label = document.getElementById('adm-lbl').value.trim();
  if (!uid) { alert('UID verplicht.'); return; }
  if (uid===OWNER) { alert('Eigenaar heeft altijd toegang.'); return; }
  await db.collection('admin_access').doc(uid).set({
    label: label||'Admin',
    addedBy: auth.currentUser?.uid,
    addedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await logAction('add_admin',{uid,label});
  await loadAdminUids();
  loadAdminList();
  document.getElementById('adm-uid').value = '';
  document.getElementById('adm-lbl').value = '';
  alert('✓ Admin toegevoegd.');
  } catch(_e) {
    console.warn('[Admin] addAdmin:', _e.message||_e.code||_e);
  }
}

async function removeAdmin(uid) {
  try {
  if (uid===OWNER) { alert('Eigenaar kan niet verwijderd worden.'); return; }
  if (!confirm('Admin verwijderen: '+uid+'?')) return;
  await db.collection('admin_access').doc(uid).delete();
  await logAction('remove_admin',{uid});
  await loadAdminUids();
  loadAdminList();
  } catch(_e) {
    console.warn('[Admin] removeAdmin:', _e.message||_e.code||_e);
  }
}

// ── Systeem tools ─────────────────────────────────────────────
async function sysFlush() {
  try {
  if (!confirm('Logs ouder dan 30 dagen verwijderen?')) return;
  const cutoff = Date.now() - 30*86400000;
  const snap = await db.collection('activity_logs').limit(200).get();
  const toDelete = snap.docs.filter(d=>(d.data().timestamp||0)<=cutoff);
  const batch = db.batch();
  toDelete.forEach(d => batch.delete(d.ref));
  await batch.commit();
  await logAction('flush_logs',{count:toDelete.length});
  alert('✓ ' + toDelete.length + ' logs verwijderd.');
  } catch(_e) {
    console.warn('[Admin] sysFlush:', _e.message||_e.code||_e);
  }
}

async function sysExport() {
  try {
  const snap = await db.collection('users').get();
  const data = snap.docs.map(d=>({uid:d.id,...d.data()}));
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a = Object.assign(document.createElement('a'),{
    href: URL.createObjectURL(blob),
    download: 'dy-users-' + Date.now() + '.json'
  });
  a.click();
  await logAction('export_users',{count:data.length});
  } catch(_e) {
    console.warn('[Admin] sysExport:', _e.message||_e.code||_e);
  }
}

async function sysBroadcast() {
  try {
  const msg = prompt('Broadcast naar alle gebruikers:');
  if (!msg) return;
  const snap = await db.collection('users').get();
  const batch = db.batch();
  snap.docs.forEach(d => {
    batch.set(db.collection('meldingen').doc(), {
      userId:d.id, type:'admin_broadcast',
      bericht:msg, gelezen:false,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
  await logAction('broadcast',{bericht:msg,count:snap.size});
  alert('✓ Broadcast verstuurd naar '+snap.size+' gebruikers.');
  } catch(_e) {
    console.warn('[Admin] sysBroadcast:', _e.message||_e.code||_e);
  }
}
// ── Systeem tab ─────────────────────────────────────────────────
function loadSys() {
  // Laad adminlijst
  loadAdminList();
  // Vul sys-log met recente admin acties
  loadSysLog();
}

async function loadSysLog() {
  var logEl = document.getElementById('sys-log');
  if (!logEl) return;
  try {
    var snap = await db.collection('admin_log')
      .orderBy('ts', 'desc').limit(50).get();
    if (snap.empty) {
      logEl.innerHTML = '<tr><td colspan="5" class="empty">Geen admin acties gelogd.</td></tr>';
      return;
    }
    logEl.innerHTML = snap.docs.map(function(d) {
      var data = d.data();
      var t = data.ts && data.ts.toDate ? data.ts.toDate() : new Date(data.ts||0);
      var meta = data.meta ? JSON.stringify(data.meta).slice(0,60) : '-';
      return '<tr>' +
        '<td class="mono muted" style="font-size:10px;white-space:nowrap">' + t.toLocaleString('nl-NL') + '</td>' +
        '<td><span class="badge b-blue" style="font-size:9px">' + esc(data.actie||'-') + '</span></td>' +
        '<td style="font-size:11px">' + esc(data.adminEmail||uNaam(data.admin,'Admin')) + '</td>' +
        '<td class="muted" style="font-size:10px;max-width:160px;overflow:hidden;text-overflow:ellipsis">' + esc(meta) + '</td>' +
        '</tr>';
    }).join('');
  } catch(e) {
    if (logEl) logEl.innerHTML = '<tr><td colspan="5" style="color:var(--red);font-size:11px">⚠ ' + esc(e.message||e.code||'Fout') + '</td></tr>';
  }
}

async function sysPresenceDiag() {
  var btn = event && event.target;
  if (btn) { btn.textContent = 'Analyseren…'; btn.disabled = true; }
  try {
    var snap = await db.collection('realtime_status').get();
    var now = Date.now();
    var total = snap.size;
    var online = snap.docs.filter(function(d){ return d.data().online === true; }).length;
    var stale  = snap.docs.filter(function(d){ return d.data().online === true && (now - (d.data().lastSeenMs||0)) > 60000; }).length;
    var geo    = snap.docs.filter(function(d){ return !!(d.data().city || d.data().country); }).length;
    (function(){
      var msg1 = 'Presence diagnostiek\n\n';
      msg1 += 'Totaal docs: ' + total + '\n';
      msg1 += 'Online: ' + online + '\n';
      msg1 += 'Stale (>60s): ' + stale + '\n';
      msg1 += 'Met geo: ' + geo + '\n';
      msg1 += '\nGeo coverage: ' + (total ? Math.round(geo/total*100) : 0) + '%';
      alert(msg1);
    })()
  } catch(e) {
    alert('Fout: ' + (e.message||e.code||'onbekend'));
  } finally {
    if (btn) { btn.textContent = '🔍 Presence diagnose'; btn.disabled = false; }
  }
}

async function sysGeoDiag() {
  var btn = event && event.target;
  if (btn) { btn.textContent = 'Analyseren…'; btn.disabled = true; }
  try {
    var actSnap = await db.collection('activity_logs').limit(200).get();
    var withGeo = actSnap.docs.filter(function(d){ var g=d.data().geo; return g && (g.city||g.country); }).length;
    var presSnap = await db.collection('realtime_status').get();
    var presGeo  = presSnap.docs.filter(function(d){ return !!(d.data().city||d.data().country); }).length;
    (function(){
      var msg2 = 'Geo diagnostiek\n\n';
      msg2 += 'Activity logs (200 recent):\n';
      msg2 += '  Met geo: ' + withGeo + '/' + actSnap.size + ' (' + Math.round(withGeo/Math.max(actSnap.size,1)*100) + '%)\n\n';
      msg2 += 'Presence docs:\n';
      msg2 += '  Met geo: ' + presGeo + '/' + presSnap.size + ' (' + Math.round(presGeo/Math.max(presSnap.size,1)*100) + '%)';
      alert(msg2);
    })()
  } catch(e) {
    alert('Fout: ' + (e.message||e.code||'onbekend'));
  } finally {
    if (btn) { btn.textContent = '🌍 Geo diagnose'; btn.disabled = false; }
  }
}


// ══════════════════════════════════════════════════════════════
// POLL FUNCTIES
// ══════════════════════════════════════════════════════════════
var _pollDocs = [];
var _pollFilter = '';
var _pollTypeFilter = '';

async function loadPolls() {
  try {
    var snap = await db.collection('kleur_stemmen').orderBy('ts', 'desc').limit(500).get();
    _pollDocs = snap.docs.map(function(d){ return Object.assign({_id:d.id}, d.data()); });
    renderPolls();
    set('poll-n', _pollDocs.length);
    set('poll-updated', 'bijgewerkt ' + new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}));
  } catch(e) {
    console.error('[Polls] Laad fout:', e);
  }
}

function filterPolls() {
  _pollFilter     = (document.getElementById('poll-filter')      || {}).value || '';
  _pollTypeFilter = (document.getElementById('poll-type-filter') || {}).value || '';
  renderPolls();
}

function renderPolls() {
  var docs = _pollDocs.filter(function(d) {
    if (_pollFilter && d.kleur !== _pollFilter) return false;
    if (_pollTypeFilter === 'auth' &&  d.isAnonymous) return false;
    if (_pollTypeFilter === 'anon' && !d.isAnonymous) return false;
    return true;
  });

  var totaal = _pollDocs.length;
  var auth   = _pollDocs.filter(function(d){ return !d.isAnonymous; }).length;
  var anon   = _pollDocs.filter(function(d){ return  d.isAnonymous; }).length;

  set('poll-total', totaal);
  set('poll-auth',  auth);
  set('poll-anon',  anon);
  set('poll-cnt',   docs.length);

  // Keuze-totalen
  var opties = ['Tracksuit','Jeans','Jurk','Polo','Blazer','Anders'];
  var emoji  = {'Tracksuit':'🏃','Jeans':'👖','Jurk':'👗','Polo':'👕','Blazer':'🧥','Anders':'✨'};
  var tel = {};
  _pollDocs.forEach(function(d){ var k=d.kleur||'?'; tel[k]=(tel[k]||0)+1; });
  var maxTel = Math.max.apply(null, Object.values(tel).concat([1]));
  var winner = Object.entries(tel).sort(function(a,b){return b[1]-a[1];})[0];
  if (winner) set('poll-winner', emoji[winner[0]]||'' + ' ' + winner[0] + ' (' + winner[1] + ')');

  // Keuze bar chart
  var resEl = document.getElementById('poll-results');
  if (resEl) {
    resEl.innerHTML = opties.map(function(opt) {
      var n   = tel[opt] || 0;
      var pct = totaal > 0 ? Math.round(n/totaal*100) : 0;
      var w   = maxTel > 0 ? Math.round(n/maxTel*100) : 0;
      var isWinner = winner && winner[0] === opt;
      return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0">' +
        '<div style="width:24px;text-align:center;font-size:1rem">' + (emoji[opt]||'') + '</div>' +
        '<div style="width:80px;font-size:12px;font-weight:'+(isWinner?'700':'400')+';color:'+(isWinner?'var(--gold)':'var(--text)')+'">'+opt+'</div>' +
        '<div style="flex:1;background:var(--bg3);border-radius:4px;height:8px;overflow:hidden">' +
          '<div style="height:100%;background:'+(isWinner?'var(--gold)':'var(--blue)')+';width:'+w+'%;border-radius:4px;transition:width .3s"></div>' +
        '</div>' +
        '<div style="width:40px;text-align:right;font-size:11px;color:var(--text2)">'+pct+'%</div>' +
        '<div style="width:24px;text-align:right;font-size:11px;color:var(--text3)">'+n+'</div>' +
      '</div>';
    }).join('');
  }

  // Side bars
  var bouwC = {}, devC = {};
  _pollDocs.forEach(function(d){
    if (d.bouw)   bouwC[d.bouw]   = (bouwC[d.bouw]||0)+1;
    if (d.device) devC[d.device]  = (devC[d.device]||0)+1;
  });
  bars(Object.entries(tel).sort(function(a,b){return b[1]-a[1];}),   'poll-keuze-bars',  'gold');
  bars(Object.entries(bouwC).sort(function(a,b){return b[1]-a[1];}), 'poll-bouw-bars',   'blue');
  bars(Object.entries(devC).sort(function(a,b){return b[1]-a[1];}),  'poll-device-bars', 'green');

  // Stemmen tabel
  var tbody = document.getElementById('poll-tbody');
  if (!tbody) return;
  if (!docs.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Geen stemmen gevonden</td></tr>';
    return;
  }
  tbody.innerHTML = docs.map(function(d) {
    var naam = d.displayName || (d.isAnonymous ? '👤 Gast' : (d.uid ? d.uid.slice(0,8)+'…' : '?'));
    var geo  = d.geo ? (d.geo.city||'') + ' ' + (d.geo.country||'') : '-';
    var tsStr = d.ts && d.ts.toDate ? d.ts.toDate().toLocaleString('nl-NL') : '-';
    var ab   = '<span class="badge '+(d.isAnonymous?'b-gray':'b-green')+'" style="font-size:9px">'+(d.isAnonymous?'Gast':'Auth')+'</span>';
    var onClickAttr = (!d.isAnonymous && d.uid) ? ' style="cursor:pointer" data-uid="'+d.uid+'" onclick="goToUser(this.dataset.uid)"' : '';
    return '<tr'+onClickAttr+'>' +
      '<td><div class="urow">'+ab+'<span style="font-size:12px">'+esc(naam)+'</span></div></td>' +
      '<td><span class="badge b-gold" style="font-size:11px">'+esc(d.kleur||'-')+'</span></td>' +
      '<td class="muted">'+esc(d.bouw||'-')+'</td>' +
      '<td class="muted">'+esc(d.lengte||'-')+'</td>' +
      '<td class="muted">'+esc(d.leeftijd||'-')+'</td>' +
      '<td class="muted">'+esc(d.device||'-')+'</td>' +
      '<td class="muted">'+esc(geo.trim()||'-')+'</td>' +
      '<td class="muted" style="font-size:11px">'+tsStr+'</td>' +
    '</tr>';
  }).join('');
}

function exportPolls() {
  var rows = [['Naam','Auth','Keuze','Bouw','Lengte','Leeftijd','Device','Land','Stad','Tijdstip','UID']];
  _pollDocs.forEach(function(d) {
    var naam  = d.displayName || (d.isAnonymous ? 'Gast' : (d.uid || '?'));
    var tsStr = d.ts && d.ts.toDate ? d.ts.toDate().toLocaleString('nl-NL') : '';
    var land  = d.geo ? (d.geo.country||'') : '';
    var stad  = d.geo ? (d.geo.city||'') : '';
    rows.push([naam, d.isAnonymous?'Gast':'Ingelogd', d.kleur||'', d.bouw||'', d.lengte||'', d.leeftijd||'', d.device||'', land, stad, tsStr, d.uid||d.guestId||'']);
  });
  var csv = rows.map(function(r){ return r.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'poll-stemmen-' + new Date().toISOString().slice(0,10) + '.csv'; a.click();
}

async function loadMeldingen() {
  var lijst = document.getElementById('mel-lijst');
  console.log('[Mel v3.2] start, user:', auth.currentUser ? auth.currentUser.email : 'GEEN AUTH');

  if (!auth.currentUser) {
    if (lijst) lijst.innerHTML = '<div style="padding:20px;color:#f59e0b">Wacht op auth...</div>';
    setTimeout(loadMeldingen, 800);
    return;
  }

  if (lijst) lijst.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">Laden...</div>';
  if (window._melUnsub) { try{window._melUnsub();}catch(e){} window._melUnsub=null; }

  var sf = (document.getElementById('mel-filter-status')||{}).value||'alle';
  var ef = (document.getElementById('mel-filter-ernst') ||{}).value||'';

  console.log('[Mel v3.2] .get() aanroepen...');

  db.collection('meldingen').get()
    .then(function(snap) {
      console.log('[Mel v3.2] succes: '+snap.size+' docs');
      _renderMeldingen(snap, sf, ef);
      window._melUnsub = db.collection('meldingen').onSnapshot(function(s2){
        console.log('[Mel v3.2] realtime update: '+s2.size+' docs');
        _renderMeldingen(s2, sf, ef);
      }, function(e){ console.warn('[Mel v3.2] onSnapshot fout:',e.code); });
    })
    .catch(function(err) {
      console.error('[Mel v3.2] FOUT:', err.code, err.message);
      if (lijst) lijst.innerHTML =
        '<div style="padding:20px;color:#fca5a5;line-height:1.8;font-size:0.84rem">' +
        '<strong>Fout:</strong> <code>'+esc(err.code||'onbekend')+'</code><br>'+esc(err.message)+
        '<br><br><small>Controleer Firestore rules:<br><code>match /meldingen/{id} { allow read: if isAdmin(); }</code></small></div>';
    });
}


function _renderMeldingen(snap, statusFilter, ernstFilter) {
  // Haal tab op en forceer zichtbaarheid EERST
  var tab = document.getElementById('t-meldingen');
  if (tab) {
    tab.style.cssText = 'display:flex !important;flex-direction:column;gap:14px;min-width:0;max-width:100%';
  }

  // Haal mel-lijst op - als null, maak het zelf aan in de tab
  var lijst = document.getElementById('mel-lijst');
  if (!lijst && tab) {
    lijst = document.createElement('div');
    lijst.id = 'mel-lijst';
    lijst.style.cssText = 'width:100%;min-height:100px';
    tab.appendChild(lijst);
    console.warn('[Mel] mel-lijst niet gevonden, dynamisch aangemaakt');
  }
  if (!snap) return;

  statusFilter = statusFilter || (document.getElementById('mel-filter-status')||{}).value || 'alle';
  ernstFilter  = ernstFilter  || (document.getElementById('mel-filter-ernst') ||{}).value || '';

  const alle = snap.docs.map(d => {
    const r = Object.assign({}, d.data(), {_id: d.id});
    if (!r.status) r.status = 'open';
    return r;
  });

  const nOpen = alle.filter(m => m.status === 'open').length;
  const nHoog = alle.filter(m => m.status === 'open' && (m.ernst||'').indexOf('Hoog') >= 0).length;
  const nDone = alle.filter(m => m.status === 'afgehandeld').length;
  const uniek = new Set(alle.map(m => m.reporterUid)).size;

  set('mel-stat-open', fmt(nOpen));
  set('mel-stat-hoog', fmt(nHoog));
  set('mel-stat-done', fmt(nDone));
  set('mel-stat-users',fmt(uniek));

  const badge = document.getElementById('mel-n');
  if (badge) { badge.textContent=nOpen||''; badge.style.display=nOpen>0?'inline-flex':'none'; }

  let gefilterd = alle;
  if (statusFilter === 'open') gefilterd = alle.filter(m => m.status === 'open');
  else if (statusFilter === 'afgehandeld') gefilterd = alle.filter(m => m.status === 'afgehandeld');
  if (ernstFilter) gefilterd = gefilterd.filter(m => (m.ernst||'') === ernstFilter);

  gefilterd.sort((a,b) => {
    const ea = (a.ernst||'').indexOf('Hoog')>=0?0:(a.ernst||'').indexOf('Gemiddeld')>=0?1:2;
    const eb = (b.ernst||'').indexOf('Hoog')>=0?0:(b.ernst||'').indexOf('Gemiddeld')>=0?1:2;
    if (ea !== eb) return ea - eb;
    return new Date(b.ts||0) - new Date(a.ts||0);
  });

  if (!lijst) return;

  if (!gefilterd.length) {
    lijst.innerHTML = '<div style="padding:48px 20px;text-align:center;color:rgba(255,255,255,0.3);line-height:1.8;font-size:0.85rem">' +
      (alle.length === 0
        ? 'Geen meldingen in de database.<br><small>Stuur een testmelding via de app.</small>'
        : 'Geen meldingen met filter <strong>' + esc(statusFilter) + '</strong>.' +
          '<br><small>Totaal: ' + alle.length + ' docs</small>') +
      '</div>';
    return;
  }

  lijst.innerHTML = gefilterd.map(m => {
    const ernst  = m.ernst || '';
    const isHoog = ernst.indexOf('Hoog') >= 0;
    const isMid  = ernst.indexOf('Gemiddeld') >= 0;
    const ec = isHoog ? '#ef4444' : isMid ? '#f59e0b' : '#6ee7b7';
    const isOpen = m.status === 'open';
    let tsStr = '\u2014';
    try {
      const d = new Date(m.ts);
      if (!isNaN(d)) tsStr = d.toLocaleDateString('nl-NL',{day:'2-digit',month:'short'}) + ' ' +
                             d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
    } catch(e) {}
    const redenen = (m.redenen||[]).map(r => '<span class="mel-reden">'+esc(r)+'</span>').join('');
    return '<div class="mel-kaart" data-id="'+esc(m._id)+'">' +
      '<div class="mel-kaart-head">' +
        '<div class="mel-kaart-meta">' +
          '<span style="color:'+ec+';font-size:0.75rem">&#9632;</span>' +
          '<span class="mel-ts">'+tsStr+'</span>' +
          '<span class="mel-status mel-status--'+(isOpen?'open':'done')+'">'+(isOpen?'Open':'Afgehandeld')+'</span>' +
          (ernst ? '<span class="mel-ernst-label" style="color:'+ec+'">'+esc(ernst.split(' ')[0])+'</span>' : '') +
        '</div>' +
        '<div class="mel-kaart-acties">' +
          (isOpen
            ? '<button class="btn btn-sm btn-gold mel-btn-afhandel">&#10003; Afhandelen</button>'
            : '<button class="btn btn-sm mel-btn-heropen">&#8629; Heropenen</button>') +
          '<button class="btn btn-sm mel-btn-verberg" data-contentid="'+esc(m.contentId||'')+'">&oslash; Verberg</button>' +
        '</div>' +
      '</div>' +
      '<div class="mel-kaart-body">' +
        '<div class="mel-grid-2">' +
          '<div class="mel-veld"><span class="mel-label">Auteur</span><span class="mel-val">'+esc(m.contentNaam||'\u2014')+'</span></div>' +
          '<div class="mel-veld"><span class="mel-label">Ernst</span><span class="mel-val" style="color:'+ec+'">'+esc(ernst||'\u2014')+'</span></div>' +
          '<div class="mel-veld"><span class="mel-label">Content ID</span><span class="mel-val mono">'+esc((m.contentId||'\u2014').slice(0,18))+'</span></div>' +
          '<div class="mel-veld"><span class="mel-label">Melder</span><span class="mel-val">'+esc(uNaam(m.reporterUid, (m.reporterUid||'\u2014').slice(0,12)))+'</span></div>' +
        '</div>' +
        (redenen ? '<div class="mel-redenen">'+redenen+'</div>' : '') +
        (m.toelichting ? '<div class="mel-toelichting">&#8220;'+esc(m.toelichting)+'&#8221;</div>' : '') +
        (m.adminNote ? '<div class="mel-admin-note">&#128221; '+esc(m.adminNote)+'</div>' : '') +
        '<div class="mel-note-wrap" id="note-'+m._id+'" style="display:none">' +
          '<textarea class="inp mel-note-txt" id="note-txt-'+m._id+'" name="note" placeholder="Adminnotitie toevoegen..." rows="2"></textarea>' +
          '<div class="mel-note-btns">' +
            '<button class="btn btn-sm btn-gold mel-btn-note-save">Opslaan</button>' +
            '<button class="btn btn-sm mel-btn-note-cancel">Annuleer</button>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-sm mel-btn-note-toggle" style="margin-top:6px;opacity:0.5;font-size:0.72rem">+ Notitie</button>' +
      '</div>' +
    '</div>';
  }).join('');

  lijst.onclick = null;
  lijst.onclick = e => {
    const kaart = e.target.closest('.mel-kaart');
    if (!kaart) return;
    const id = kaart.getAttribute('data-id');
    if (e.target.classList.contains('mel-btn-afhandel'))     melAfhandelen(id);
    else if (e.target.classList.contains('mel-btn-heropen')) melHeropenen(id);
    else if (e.target.classList.contains('mel-btn-verberg')) melVerbergen(id, e.target.getAttribute('data-contentid')||'');
    else if (e.target.classList.contains('mel-btn-note-save')) {
      const ta = kaart.querySelector('.mel-note-txt');
      melSlaNotitieOp(id, ta?ta.value.trim():'');
    } else if (e.target.classList.contains('mel-btn-note-cancel')) {
      const w = document.getElementById('note-'+id); if(w) w.style.display='none';
    } else if (e.target.classList.contains('mel-btn-note-toggle')) {
      const w = document.getElementById('note-'+id);
      if(w) w.style.display = w.style.display==='none'?'block':'none';
    }
  };
}



function melAfhandelen(id) {
  db.collection('meldingen').doc(id).update({status:'afgehandeld',afgehandeldOp:new Date().toISOString(),afgehandeldDoor:auth.currentUser?auth.currentUser.email:'-'})
    .then(function(){ melToast('✓ Afgehandeld'); })
    .catch(function(e){ melToast('Fout: '+e.message, true); });
}

function melHeropenen(id) {
  db.collection('meldingen').doc(id).update({status:'open'})
    .then(function(){ melToast('↩ Heropend'); })
    .catch(function(e){ melToast('Fout: '+e.message, true); });
}

function melVerbergen(id, contentId) {
  if (!confirm('Content verbergen: '+(contentId||'onbekend')+'?')) return;
  var batch = db.batch();
  batch.update(db.collection('meldingen').doc(id), {status:'afgehandeld',actie:'verborgen',afgehandeldOp:new Date().toISOString()});
  if (contentId) {
    ['verhalen','lookbook','stories'].forEach(function(col) {
      try { batch.update(db.collection(col).doc(contentId), {verborgen:true,verborgenOp:new Date().toISOString()}); } catch(e){}
    });
  }
  batch.set(db.collection('admin_log').doc(), {actie:'hide_content',adminEmail:auth.currentUser?auth.currentUser.email:'-',meta:{docId:contentId,meldingId:id},ts:firebase.firestore.FieldValue.serverTimestamp()});
  batch.commit().then(function(){ loadMeldingen(); melToast('Content verborgen'); }).catch(function(e){ melToast('Fout: '+e.message, true); });
}

function melSlaNotitieOp(id, txt) {
  txt = txt || '';
  if (!txt.trim()) return;
  db.collection('meldingen').doc(id).update({adminNote:txt,notitieOp:new Date().toISOString()})
    .then(function(){ loadMeldingen(); melToast('Notitie opgeslagen'); })
    .catch(function(e){ melToast('Fout: '+e.message, true); });
}

function melToast(msg, isErr) {
  var t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:8px;font-size:0.85rem;font-weight:600;color:#fff;background:'+(isErr?'#c0392b':'#c67d06')+';box-shadow:0 4px 16px rgba(0,0,0,0.3)';
  document.body.appendChild(t);
  setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},3000);
}

// Badge realtime teller bij login
function _initMelBadge() {
  if (typeof db==='undefined') { setTimeout(_initMelBadge, 800); return; }
  if (!auth.currentUser) { setTimeout(_initMelBadge, 800); return; }
  db.collection('meldingen').onSnapshot(function(snap) {
      var openCount = snap.docs.filter(function(d){ var s=d.data().status; return !s||s==='open'; }).length;
    var badge=document.getElementById('mel-n');
    if (!badge) return;
    badge.textContent=openCount||'';
    badge.style.display=openCount>0?'inline-flex':'none';
  }, function(){});
}
// ══════════════════════════════════════════════════════════════════
// KAI MONITORING - Vergelijk & Opgeslagen outfits (Realtime)
// ══════════════════════════════════════════════════════════════════

let _kaiEvs = [];          // in-memory buffer
let _kaiUnsub = null;      // Firestore unsubscribe handle

function kaiTs(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  const nu = new Date();
  const isVandaag = d.toDateString() === nu.toDateString();
  if (isVandaag) return d.toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  return d.toLocaleDateString('nl-NL', {day:'2-digit', month:'2-digit'}) + ' ' +
         d.toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'});
}

function kaiShortUid(uid) {
  if (!uid) return '-';
  return uid.substring(0, 8) + '…';
}

function kaiUpdateKPIs() {
  const nu = new Date();
  const vandaagStart = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();

  const vergAll      = _kaiEvs.filter(e => e.eventType === 'compare');
  const savedAll     = _kaiEvs.filter(e => e.eventType === 'saved');
  const pollAll      = _kaiEvs.filter(e => e.eventType === 'verg_poll');
  const vergVandaag  = vergAll.filter(e => (e.ts||0) >= vandaagStart);
  const savedVandaag = savedAll.filter(e => (e.ts||0) >= vandaagStart);
  const pollVandaag  = pollAll.filter(e => (e.ts||0) >= vandaagStart);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setEl('kai-verg-vandaag',  vergVandaag.length.toLocaleString('nl-NL'));
  setEl('kai-verg-totaal',   vergAll.length.toLocaleString('nl-NL'));
  setEl('kai-saved-vandaag', savedVandaag.length.toLocaleString('nl-NL'));
  setEl('kai-saved-totaal',  savedAll.length.toLocaleString('nl-NL'));

  // Poll stats
  const pollA = pollAll.filter(e => (e.payload||{}).keuze === 'A').length;
  const pollB = pollAll.filter(e => (e.payload||{}).keuze === 'B').length;
  const pollTot = pollAll.length;
  const pctA = pollTot ? Math.round(pollA/pollTot*100) : 0;
  const pctB = pollTot ? Math.round(pollB/pollTot*100) : 0;

  setEl('kai-poll-totaal',  pollTot.toLocaleString('nl-NL'));
  setEl('kai-poll-a',       pollA.toLocaleString('nl-NL'));
  setEl('kai-poll-b',       pollB.toLocaleString('nl-NL'));
  setEl('kai-poll-a-pct',   pctA + '%');
  setEl('kai-poll-b-pct',   pctB + '%');
  setEl('kai-poll-vandaag', pollVandaag.length.toLocaleString('nl-NL'));

  // Badge in nav
  const badge = document.getElementById('kai-n');
  if (badge) {
    const n = vergVandaag.length + savedVandaag.length + pollVandaag.length;
    badge.textContent = n;
    badge.style.display = n > 0 ? '' : 'none';
  }
}

function kaiRenderFeed() {
  const feed   = document.getElementById('kai-feed');
  const cnt    = document.getElementById('kai-cnt');
  const typeFlt   = document.getElementById('kai-filter-type')?.value || '';
  const periodeFltr = document.getElementById('kai-filter-periode')?.value || 'all';
  if (!feed) return;

  const nu = new Date();
  const vandaagStart = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  const weekStart  = vandaagStart - 6 * 86400000;
  const maandStart = new Date(nu.getFullYear(), nu.getMonth(), 1).getTime();

  let evs = [..._kaiEvs];

  if (typeFlt)       evs = evs.filter(e => e.eventType === typeFlt);
  if (periodeFltr === 'today')  evs = evs.filter(e => (e.ts||0) >= vandaagStart);
  if (periodeFltr === 'week')   evs = evs.filter(e => (e.ts||0) >= weekStart);
  if (periodeFltr === 'month')  evs = evs.filter(e => (e.ts||0) >= maandStart);

  if (cnt) cnt.textContent = evs.length + ' events';
  if (!evs.length) { feed.innerHTML = '<div class="loading">Geen events gevonden.</div>'; return; }

  const ICOON = { compare: '⚖️', saved: '💾', analysis: '🔍', interaction: '👆', outfit_feedback: '💬', verg_poll: '🗳️' };

  feed.innerHTML = evs.slice(0, 100).map(e => {
    const p = e.payload || {};
    let detail = '';
    if (e.eventType === 'compare') {
      detail = (p.stijlA||'?') + ' vs ' + (p.stijlB||'?') +
               ' · ' + (p.scoreA||0) + '/' + (p.scoreB||0) +
               (p.winnaar ? ' · 🏆 ' + p.winnaar : '') +
               (e.userName ? ' · 👤 ' + e.userName : '');
    } else if (e.eventType === 'saved' || e.eventType === 'verg_opgeslagen') {
      detail = (p.stijl||p.desiredStyle||'?') + ' · ' + (p.seizoen||p.occasion||'?') +
               ' · ♾ ' + Math.round(((p.harmonie||p.scoreA||0)+(p.contrast||p.scoreB||0)+(p.balans||0))/3) +
               (e.userName ? ' · 👤 ' + e.userName : '');
    } else if (e.eventType === 'verg_poll') {
      const keuzeLabel = p.keuze === 'A' ? '✅ Outfit A' : '✅ Outfit B';
      detail = keuzeLabel + ' · ' + (p.stijlA||'?') + ' vs ' + (p.stijlB||'?') +
               ' · ' + (p.scoreA||0) + '/' + (p.scoreB||0);
    } else if (e.eventType === 'analysis') {
      detail = (p.stijl||'?') + ' · ' + (p.seizoen||'?');
    } else {
      detail = JSON.stringify(p).substring(0, 60);
    }
    return `<div class="feed-row">
      <span class="feed-ico">${ICOON[e.eventType]||'·'}</span>
      <div class="feed-main">
        <span class="feed-type">${e.eventType}</span>
        <span class="feed-uid">${e.userName ? '<strong>' + e.userName + '</strong>' : kaiShortUid(e.userId)}</span>
        <span class="feed-detail">${detail}</span>
      </div>
      <span class="feed-time">${kaiTs(e.ts)}</span>
    </div>`;
  }).join('');

  // Vergelijk tabel
  kaiRenderVergTabel();
  kaiRenderSavedTabel();
}

function kaiRenderVergTabel() {
  const tbody = document.getElementById('kai-verg-tbody');
  if (!tbody) return;
  const verg = _kaiEvs.filter(e => e.eventType === 'compare').slice(0, 20);
  if (!verg.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Geen vergelijkingen.</td></tr>'; return; }
  tbody.innerHTML = verg.map(e => {
    const p = e.payload || {};
    return `<tr>
      <td>${e.userName || '<code style="font-size:10px">' + kaiShortUid(e.userId) + '</code>'}</td>
      <td>${p.stijlA||'-'}</td>
      <td>${p.stijlB||'-'}</td>
      <td><span style="color:var(--gold)">${p.scoreA||0}</span></td>
      <td><span style="color:var(--blue)">${p.scoreB||0}</span></td>
      <td>${p.winnaar ? '🏆 ' + p.winnaar : '-'}</td>
      <td style="color:var(--text3);white-space:nowrap">${kaiTs(e.ts)}</td>
    </tr>`;
  }).join('');
}

function kaiRenderSavedTabel() {
  const tbody = document.getElementById('kai-saved-tbody');
  if (!tbody) return;
  const saved = _kaiEvs.filter(e => e.eventType === 'saved').slice(0, 20);
  if (!saved.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading">Geen opgeslagen outfits.</td></tr>'; return; }
  tbody.innerHTML = saved.map(e => {
    const p = e.payload || {};
    const gem = Math.round(((p.harmonie||0)+(p.contrast||0)+(p.balans||0))/3);
    return `<tr>
      <td>${e.userName || '<code style="font-size:10px">' + kaiShortUid(e.userId) + '</code>'}</td>
      <td>${p.stijl||'-'}</td>
      <td>${p.seizoen||'-'}</td>
      <td><span style="color:${gem>=75?'var(--green)':gem>=55?'var(--gold)':'var(--red)'}">${gem}</span></td>
      <td style="color:var(--text3);white-space:nowrap">${kaiTs(e.ts)}</td>
    </tr>`;
  }).join('');
}

function kaiClearFeed() {
  _kaiEvs = [];
  kaiUpdateKPIs();
  kaiRenderFeed();
}

function loadKai() {
  // Voorkom dubbele listener
  if (_kaiUnsub) return;

  const feed = document.getElementById('kai-feed');
  if (feed) feed.innerHTML = '<div class="loading">Laden…</div>';

  // Realtime Firestore listener op kai_events
  // Gebruik dezelfde aanpak als activity_logs listener
  _kaiUnsub = db.collection('kai_events')
    .orderBy('ts', 'desc')
    .limit(500)
    .onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        // Dedupliceer op userId + ts + eventType
        const key = (d.ts||0) + '_' + (d.userId||'') + '_' + (d.eventType||'');
        if (!_kaiEvs.find(e => (e.ts||0)+'_'+(e.userId||'')+'_'+(e.eventType||'') === key)) {
          _kaiEvs.unshift(d);
        }
      });
      // Sorteer op ts desc
      _kaiEvs.sort((a, b) => (b.ts||0) - (a.ts||0));
      kaiUpdateKPIs();
      kaiRenderFeed();
    }, err => {
      const feed = document.getElementById('kai-feed');
      if (feed) feed.innerHTML = '<div class="loading">Fout: ' + err.message + '</div>';
    });
}



// ══════════════════════════════════════════════════════════════════
// POST VAN DE WEEK - Admin logic v177
// ══════════════════════════════════════════════════════════════════

async function loadPvdw() {
  if (!db) return;
  const tbody = document.getElementById('pvdw-winners-tbody');
  if (!tbody) return;

  try {
    // Haal weekly_rankings op, gesorteerd op weekId DESC
    var snap = await db.collection('weekly_rankings')
      .orderBy('weekId', 'desc').limit(52).get()
      .catch(async function() {
        return await db.collection('weekly_rankings').limit(52).get();
      });

    // Stats cards
    var wekenMet = 0;
    var huidigWinnaar = '-';

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">Geen weekrankings gevonden. Worker nog niet uitgevoerd.</td></tr>';
    } else {
      // Sorteer client-side op weekId DESC
      var rows = snap.docs.map(function(d) { return Object.assign({ _id: d.id }, d.data()); });
      rows.sort(function(a, b) { return (b.weekId || '').localeCompare(a.weekId || ''); });

      wekenMet = rows.filter(function(r) { return r.status === 'selected'; }).length;
      var nieuwste = rows.find(function(r) { return r.status === 'selected'; });
      if (nieuwste) huidigWinnaar = (nieuwste.authorName || nieuwste.postId || '?') + ' (' + nieuwste.weekId + ')';

      tbody.innerHTML = rows.map(function(r) {
        var statusKleur = r.status === 'selected' ? '#c67d06' : r.status === 'geen_winnaar' ? '#888' : r.status === 'pending' ? '#4a9eff' : '#e55';
        var selectedAt = r.selectedAt ? new Date(r.selectedAt).toLocaleString('nl-NL') : '-';
        var eligibleCount = (r.eligiblePosts && Array.isArray(r.eligiblePosts)) ? r.eligiblePosts.length : '-';
        return '<tr>' +
          '<td class="mono">' + (r.weekId || '-') + '</td>' +
          '<td class="mono" style="font-size:10px">' + (r.postId || '-') + '</td>' +
          '<td>' + (r.authorName || '-') + '</td>' +
          '<td>' + (r.likesCount !== undefined ? r.likesCount : '-') + '</td>' +
          '<td><span style="color:' + statusKleur + ';font-weight:700">' + (r.status || '-') + '</span></td>' +
          '<td style="font-size:11px">' + selectedAt + '</td>' +
          '<td>' + eligibleCount + '</td>' +
          '</tr>';
      }).join('');
    }

    set('pvdw-weken-count', wekenMet);
    set('pvdw-huidige-winnaar', huidigWinnaar);

    // Laad ook audit log en eligible
    await loadPvdwAuditLog();
    await loadPvdwEligible();

  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">Fout: ' + e.message + '</td></tr>';
  }
}

async function loadPvdwAuditLog() {
  if (!db) return;
  var tbody = document.getElementById('pvdw-audit-tbody');
  if (!tbody) return;

  try {
    var snap = await db.collection('worker_audit_log')
      .orderBy('runAt', 'desc').limit(20).get()
      .catch(async function() {
        return await db.collection('worker_audit_log').limit(20).get();
      });

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">Geen audit logs. Worker nog niet uitgevoerd.</td></tr>';
      set('pvdw-laatste-run', 'Nooit');
      set('pvdw-run-status', '-');
      return;
    }

    var rows = snap.docs.map(function(d) { return Object.assign({ _id: d.id }, d.data()); });
    rows.sort(function(a, b) { return (b.runAt || '').localeCompare(a.runAt || ''); });

    var laatste = rows[0];
    set('pvdw-laatste-run', laatste.runAt ? new Date(laatste.runAt).toLocaleString('nl-NL') : '-');
    var statusKleur = laatste.status === 'ok' ? '#4db34d' : laatste.status === 'skipped' ? '#888' : '#e55';
    set('pvdw-run-status', '<span style="color:' + statusKleur + '">' + (laatste.status || '-') + '</span>');

    tbody.innerHTML = rows.map(function(r) {
      var statusKleur2 = r.status === 'ok' ? '#4db34d' : r.status === 'skipped' ? '#888' : '#e55';
      return '<tr>' +
        '<td class="mono">' + (r.weekId || '-') + '</td>' +
        '<td style="font-size:11px">' + (r.runAt ? new Date(r.runAt).toLocaleString('nl-NL') : '-') + '</td>' +
        '<td>' + (r.duurMs !== undefined ? r.duurMs + ' ms' : '-') + '</td>' +
        '<td><span style="color:' + statusKleur2 + ';font-weight:700">' + (r.status || '-') + '</span></td>' +
        '<td style="font-size:11px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.bericht || '-') + '</td>' +
        '</tr>';
    }).join('');

  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty">Fout: ' + e.message + '</td></tr>';
  }
}

async function loadPvdwEligible() {
  if (!db) return;
  var tbody = document.getElementById('pvdw-eligible-tbody');
  if (!tbody) return;

  try {
    // Bereken huidige weekStart (maandag 00:00)
    var nu = new Date();
    var dag = nu.getDay(); // 0=zo
    var dagNaMa = (dag === 0) ? 6 : dag - 1;
    var maandag = new Date(nu);
    maandag.setHours(0, 0, 0, 0);
    maandag.setDate(nu.getDate() - dagNaMa);
    var weekStartMs = maandag.getTime();

    // Haal stories op van deze week
    var snap = await db.collection('stories')
      .where('tsMs', '>=', weekStartMs)
      .orderBy('tsMs', 'desc')
      .limit(100)
      .get()
      .catch(async function() {
        return await db.collection('stories').where('tsMs', '>=', weekStartMs).limit(100).get().catch(function() { return { empty: true, docs: [] }; });
      });

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Geen posts deze week.</td></tr>';
      return;
    }

    var posts = snap.docs.map(function(d) {
      var data = d.data();
      var likesObj = (data.likes && typeof data.likes === 'object') ? data.likes : {};
      var likesCount = typeof data.likes === 'number' ? data.likes : Object.keys(likesObj).length;
      return { _id: d.id, likesCount: likesCount, authorName: data.authorName || data.displayName || '?', createdAt: data.createdAt || null };
    });

    // Filter: >= 25 likes
    var eligible = posts.filter(function(p) { return p.likesCount >= 25; });
    eligible.sort(function(a, b) { return b.likesCount - a.likesCount; });

    if (eligible.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Geen posts met 25+ likes deze week.</td></tr>';
      return;
    }

    tbody.innerHTML = eligible.map(function(p, i) {
      var ts = p.createdAt ? new Date(p.createdAt).toLocaleDateString('nl-NL') : '-';
      return '<tr' + (i === 0 ? ' style="background:rgba(198,125,6,0.08)"' : '') + '>' +
        '<td class="mono" style="font-size:10px">' + p._id + (i === 0 ? ' 👑' : '') + '</td>' +
        '<td>' + p.authorName + '</td>' +
        '<td><strong>' + p.likesCount + '</strong></td>' +
        '<td style="font-size:11px">' + ts + '</td>' +
        '</tr>';
    }).join('');

  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">Fout: ' + e.message + '</td></tr>';
  }
}

function pvdwHandmatigRun() {
  if (!confirm('Worker handmatig uitvoeren? Dit verwerkt de vorige week opnieuw (idempotent - bestaande winnaar wordt niet overschreven).')) return;
  alert('Handmatige trigger: stuur een POST naar je Cloudflare Worker /run endpoint met Authorization: Bearer <WORKER_SECRET>.\n\nDe worker verwerkt de vorige week automatisch en is idempotent.');
}

// Auto-load als tab actief wordt
(function() {
  var origGo = window.go;
  window.go = function(el) {
    origGo && origGo(el);
    if (el && el.getAttribute('data-tab') === 'pvdw') {
      setTimeout(loadPvdw, 100);
    }
  };
})();


// ══════════════════════════════════════════════════════════════════
// VERGELIJKINGEN - Admin panel v177-p1
// ══════════════════════════════════════════════════════════════════
async function loadVergelijkingen() {
  if (!db) return;
  var tbody = document.getElementById('verg-tbody');
  if (!tbody) return;

  try {
    var snap = await db.collection('vergelijkingen')
      .orderBy('ts', 'desc').limit(50).get()
      .catch(async function() {
        return await db.collection('vergelijkingen').limit(50).get();
      });

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">Nog geen vergelijkingen opgeslagen.</td></tr>';
      return;
    }

    var rows = snap.docs.map(function(d) { return Object.assign({ _id: d.id }, d.data()); });
    tbody.innerHTML = rows.map(function(r) {
      var datum = r.createdAt ? new Date(r.createdAt).toLocaleString('nl-NL') : (r.ts ? new Date(r.ts).toLocaleString('nl-NL') : '-');
      var scores = 'A:' + (r.scoreA||'?') + ' / B:' + (r.scoreB||'?');
      var focus = Array.isArray(r.focusAreas) ? r.focusAreas.join(', ') : '-';
      return '<tr>' +
        '<td style="font-size:11px">' + datum + '</td>' +
        '<td>' + (r.authorName || r.userId || '-') + '</td>' +
        '<td>' + (r.occasion || '-') + '</td>' +
        '<td>' + (r.desiredStyle || '-') + '</td>' +
        '<td>' + scores + '</td>' +
        '<td style="font-size:11px">' + focus + '</td>' +
        '<td class="mono" style="font-size:9px">' + (r.sessionId || '-').slice(0,16) + '</td>' +
        '</tr>';
    }).join('');

    // Stats
    var total = rows.length;
    var metContext = rows.filter(function(r) { return r.occasion; }).length;
    set && set('verg-count', total);
    set && set('verg-met-context', metContext);
  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">Fout: ' + e.message + '</td></tr>';
  }
}

// Auto-load vergelijkingen tab
(function() {
  var origGo2 = window.go;
  window.go = function(el) {
    origGo2 && origGo2(el);
    if (el && el.getAttribute && el.getAttribute('data-tab') === 'vergelijkingen') {
      setTimeout(loadVergelijkingen, 100);
    }
  };
})();

// ══════════════════════════════════════════════════════════════════
// ADMIN SYNC UITBREIDING v177-p2: Verbeteracties, chat logs, KPIs
// ══════════════════════════════════════════════════════════════════

// Patch kaiUpdateKPIs om nieuwe KPIs te vullen
var _origKaiUpdateKPIs = window.kaiUpdateKPIs;
window.kaiUpdateKPIs = function() {
  if (typeof _origKaiUpdateKPIs === 'function') _origKaiUpdateKPIs();

  // Bereken nieuwe KPIs uit _kaiEvs
  if (typeof _kaiEvs === 'undefined') return;

  var vandaagStart = new Date(); vandaagStart.setHours(0,0,0,0);
  var vsMs = vandaagStart.getTime();

  var analyses  = _kaiEvs.filter(function(e) { return e.eventType === 'analysis'; });
  var verbeter  = _kaiEvs.filter(function(e) { return e.eventType === 'verbeter_actie'; });
  var chat      = _kaiEvs.filter(function(e) { return e.eventType === 'chat_vraag'; });
  var uploads   = _kaiEvs.filter(function(e) { return e.eventType === 'upload_start'; });

  var setEl = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('kai-analyse-vandaag', analyses.filter(function(e){return(e.ts||0)>=vsMs;}).length);
  setEl('kai-verbeter-totaal', verbeter.length);
  setEl('kai-chat-totaal',     chat.length);
  setEl('kai-upload-vandaag',  uploads.filter(function(e){return(e.ts||0)>=vsMs;}).length);
};

// Laad verbeteracties
async function kaiLaadVerbeteracties() {
  var tbody = document.getElementById('kai-verbeter-tbody');
  if (!tbody || !db) return;
  try {
    var snap = await db.collection('kai_events')
      .where('eventType', '==', 'verbeter_actie')
      .orderBy('ts', 'desc').limit(50).get()
      .catch(async function() {
        return await db.collection('kai_events')
          .where('eventType', '==', 'verbeter_actie').limit(50).get();
      });
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Nog geen verbeteracties.</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(function(d) {
      var r = d.data(); var p = r.payload || {};
      var ts = r.ts ? new Date(r.ts).toLocaleString('nl-NL') : '-';
      return '<tr><td style="font-size:11px">' + (r.userName || r.userId || '-').slice(0,20) + '</td>' +
        '<td><strong>' + (p.deel || '-') + '</strong></td>' +
        '<td>' + (p.stijl || '-') + '</td>' +
        '<td style="font-size:11px">' + ts + '</td></tr>';
    }).join('');
    // Update KPI
    var el = document.getElementById('kai-verbeter-totaal');
    if (el) el.textContent = snap.size;
  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">Fout: ' + e.message + '</td></tr>';
  }
}

// Laad chat logs
async function kaiLaadChatLogs() {
  var tbody = document.getElementById('kai-chat-tbody');
  if (!tbody || !db) return;
  try {
    var snap = await db.collection('kai_events')
      .where('eventType', '==', 'chat_vraag')
      .orderBy('ts', 'desc').limit(50).get()
      .catch(async function() {
        return await db.collection('kai_events')
          .where('eventType', '==', 'chat_vraag').limit(50).get();
      });
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Nog geen chat vragen.</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(function(d) {
      var r = d.data(); var p = r.payload || {};
      var ts = r.ts ? new Date(r.ts).toLocaleString('nl-NL') : '-';
      return '<tr><td style="font-size:11px">' + (r.userName || r.userId || '-').slice(0,20) + '</td>' +
        '<td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.vraag || '-') + '</td>' +
        '<td style="font-size:10px;color:#888">' + (p.sessieId || '-').slice(0,12) + '</td>' +
        '<td style="font-size:11px">' + ts + '</td></tr>';
    }).join('');
    var el = document.getElementById('kai-chat-totaal');
    if (el) el.textContent = snap.size;
  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">Fout: ' + e.message + '</td></tr>';
  }
}

// Auto-laad nieuwe secties als KAI tab actief wordt
(function() {
  var origGo3 = window.go;
  window.go = function(el) {
    origGo3 && origGo3(el);
    if (el && el.getAttribute && el.getAttribute('data-tab') === 'kai') {
      setTimeout(function() {
        kaiLaadVerbeteracties();
        kaiLaadChatLogs();
      }, 300);
    }
  };
})();

// Patch kaiRenderFeed om nieuwe event types visueel te ondersteunen
var _origKaiRenderFeed = window.kaiRenderFeed;
window.kaiRenderFeed = function() {
  if (typeof _origKaiRenderFeed === 'function') return _origKaiRenderFeed();
};

// Event type labels en iconen voor de feed
window._kaiEventLabels = {
  analysis:       { icoon: '🔍', label: 'Analyse',         kleur: '#4a9eff' },
  compare:        { icoon: '⚖️',  label: 'Vergelijking',    kleur: '#c67d06' },
  compare_start:  { icoon: '▶',  label: 'Verg. gestart',   kleur: '#c67d06' },
  verg_poll:      { icoon: '🗳',  label: 'Poll stem',       kleur: '#8b5cf6' },
  saved:          { icoon: '💾', label: 'Opgeslagen',      kleur: '#2d7a4e' },
  verg_opgeslagen:{ icoon: '💾', label: 'Verg. opgeslagen',kleur: '#2d7a4e' },
  upload_start:   { icoon: '📸', label: 'Upload',          kleur: '#64748b' },
  verg_upload:    { icoon: '📸', label: 'Verg. upload',    kleur: '#64748b' },
  verbeter_actie: { icoon: '🔧', label: 'Verbetering',     kleur: '#f59e0b' },
  chat_vraag:     { icoon: '💬', label: 'Chat vraag',      kleur: '#06b6d4' },
  interaction:    { icoon: '👆', label: 'Interactie',      kleur: '#94a3b8' },
  outfit_feedback:{ icoon: '📝', label: 'Feedback',        kleur: '#94a3b8' }
};

// ══════════════════════════════════════════════════════════════════
// GEBRUIKERSNAMEN CACHE - realtime lookup uit Firestore users doc
// ══════════════════════════════════════════════════════════════════

var _userNaamCache = {}; // uid → naam
var _userNaamPending = {}; // uid → true (voorkomt dubbele fetches)

// Haal naam op uit cache of Firestore
function getUserNaam(uid) {
  if (!uid) return '-';
  if (_userNaamCache[uid]) return _userNaamCache[uid];
  // Niet gecached: haal op (async, render opnieuw na ophalen)
  if (!_userNaamPending[uid] && db) {
    _userNaamPending[uid] = true;
    db.collection('users').doc(uid).get().then(function(doc) {
      var naam = '-';
      if (doc.exists) {
        var d = doc.data();
        naam = d.naam || d.displayName || d.name || d.authorName ||
               d.gebruikersnaam || (d.email ? d.email.split('@')[0] : '') || uid.substring(0, 8);
      }
      _userNaamCache[uid] = naam;
      delete _userNaamPending[uid];
      // Herrender feed en tabellen met nieuwe naam
      kaiRenderFeed();
    }).catch(function() {
      _userNaamCache[uid] = uid.substring(0, 8) + '…';
      delete _userNaamPending[uid];
    });
  }
  return uid.substring(0, 8) + '…'; // tijdelijk terwijl laden
}

// Overschrijf kaiShortUid met getUserNaam
window._origKaiShortUid = window.kaiShortUid;
window.kaiShortUid = function(uid) {
  return getUserNaam(uid);
};

// Pre-laad namen van alle bekende gebruikers in de feed
function prelaadUserNamen() {
  var uids = {};
  _kaiEvs.forEach(function(e) { if (e.userId) uids[e.userId] = true; });
  Object.keys(uids).forEach(function(uid) {
    if (!_userNaamCache[uid] && !_userNaamPending[uid] && db) {
      _userNaamPending[uid] = true;
      db.collection('users').doc(uid).get().then(function(doc) {
        var naam = uid.substring(0, 8) + '…';
        if (doc.exists) {
          var d = doc.data();
          naam = d.naam || d.displayName || d.name || d.authorName ||
                 d.gebruikersnaam || (d.email ? d.email.split('@')[0] : '') || naam;
        }
        _userNaamCache[uid] = naam;
        delete _userNaamPending[uid];
      }).catch(function() {
        delete _userNaamPending[uid];
      });
    }
  });
  // Na 1.5s herrender als namen geladen zijn
  setTimeout(function() { kaiRenderFeed(); }, 1500);
}

// Hook op kaiRenderFeed - prelaad namen na elke render
var _origKaiRF2 = window.kaiRenderFeed;
window.kaiRenderFeed = function() {
  if (typeof _origKaiRF2 === 'function') _origKaiRF2();
  prelaadUserNamen();
};


// ══════════════════════════════════════════════════════════════════
// MAILING LIST MODULE
// ══════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  var _mlDocs       = [];   // alle geladen docs (gefilterd)
  var _mlAlles      = [];   // ruwe data van Firestore
  var _mlPagina     = 0;
  var _mlPerPagina  = 50;
  var _mlGeselecteerd = {};  // uid → email map
  var _mlBezig      = false;

  // ── Laden ──────────────────────────────────────────────────────
  window.mlLaad = async function(force) {
    if (_mlBezig && !force) return;
    _mlBezig = true;
    var tbody = document.getElementById('ml-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading">Laden…</td></tr>';

    try {
      // Primaire bron: users collectie (altijd toegankelijk voor admins)
      var usersSnap = await db.collection('users').limit(2000).get();

      // Secundaire bron: mailing_list opt-outs (optioneel - faalt stil als rules ontbreken)
      var optOutMap = {};
      try {
        var mlSnap = await db.collection('mailing_list').limit(2000).get();
        mlSnap.docs.forEach(function(d) {
          if (d.data().optOut) optOutMap[d.id] = true;
        });
      } catch(e) { /* mailing_list nog niet toegankelijk - opt-outs worden genegeerd */ }

      _mlAlles = usersSnap.docs
        .filter(function(d) { return !!d.data().email; })
        .map(function(d) {
          var data = d.data();
          return {
            _id:          d.id,
            uid:          d.id,
            email:        data.email,
            aangemaaktOp: data.aangemeld || null,
            optOut:       optOutMap[d.id] || false,
            displayName:  data.displayName || data.naam || ''
          };
        })
        .sort(function(a, b) {
          var ta = a.aangemaaktOp && a.aangemaaktOp.toDate ? a.aangemaaktOp.toDate().getTime() : 0;
          var tb = b.aangemaaktOp && b.aangemaaktOp.toDate ? b.aangemaaktOp.toDate().getTime() : 0;
          return tb - ta;
        });

      // KPI badge in nav
      var navBadge = document.getElementById('ml-n');
      if (navBadge) {
        navBadge.textContent = _mlAlles.length;
        navBadge.style.display = _mlAlles.length > 0 ? '' : 'none';
      }

      mlFilter();
      mlLaadLog();
    } catch(e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:var(--red);padding:12px;text-align:center">Fout bij laden: ' + e.message + '</td></tr>';
    } finally {
      _mlBezig = false;
    }
  };

  // ── Filter ─────────────────────────────────────────────────────
  window.mlFilter = function() {
    var q      = (document.getElementById('ml-q') || {}).value || '';
    var status = (document.getElementById('ml-status-filter') || {}).value || '';
    var period = parseInt((document.getElementById('ml-period-filter') || {}).value || '0', 10);
    var nu     = Date.now();

    _mlDocs = _mlAlles.filter(function(d) {
      if (q) {
        var ql = q.toLowerCase();
        if (!((d.email || '').toLowerCase().includes(ql) || (d.uid || '').toLowerCase().includes(ql))) return false;
      }
      if (status === 'actief'  && d.optOut) return false;
      if (status === 'optout'  && !d.optOut) return false;
      if (period) {
        var ts = d.aangemaaktOp && d.aangemaaktOp.toDate ? d.aangemaaktOp.toDate().getTime() : (d.aangemaaktOp || 0);
        if (nu - ts > period * 86400000) return false;
      }
      return true;
    });

    _mlPagina = 0;
    mlRender();
  };

  // ── Render ─────────────────────────────────────────────────────
  function mlRender() {
    var tbody = document.getElementById('ml-tbody');
    if (!tbody) return;

    // KPI's bijwerken
    var totaal = _mlAlles.length;
    var optouts = _mlAlles.filter(function(d) { return d.optOut; }).length;
    var nu = Date.now();
    var maand = _mlAlles.filter(function(d) {
      var ts = d.aangemaaktOp && d.aangemaaktOp.toDate ? d.aangemaaktOp.toDate().getTime() : (d.aangemaaktOp || 0);
      return nu - ts < 30 * 86400000;
    }).length;
    var el = function(id) { return document.getElementById(id); };
    if (el('ml-kpi-totaal')) el('ml-kpi-totaal').textContent = totaal - optouts;
    if (el('ml-kpi-maand'))  el('ml-kpi-maand').textContent  = maand;
    if (el('ml-kpi-optout')) el('ml-kpi-optout').textContent  = optouts;
    if (el('ml-cnt'))        el('ml-cnt').textContent = _mlDocs.length + ' resultaten';

    // Paginering
    var start = _mlPagina * _mlPerPagina;
    var pageDocs = _mlDocs.slice(start, start + _mlPerPagina);
    var totaalPaginas = Math.max(1, Math.ceil(_mlDocs.length / _mlPerPagina));

    if (el('ml-pager-info')) el('ml-pager-info').textContent = 'Pagina ' + (_mlPagina + 1) + ' van ' + totaalPaginas;
    if (el('ml-prev')) el('ml-prev').disabled = _mlPagina === 0;
    if (el('ml-next')) el('ml-next').disabled = _mlPagina >= totaalPaginas - 1;

    if (pageDocs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text3);font-size:11px">Geen abonnees gevonden.</td></tr>';
      return;
    }

    tbody.innerHTML = pageDocs.map(function(d) {
      var datum = '-';
      try {
        var ts = d.aangemaaktOp && d.aangemaaktOp.toDate ? d.aangemaaktOp.toDate() : (d.aangemaaktOp ? new Date(d.aangemaaktOp) : null);
        if (ts) datum = ts.toLocaleDateString('nl-NL', { day:'2-digit', month:'2-digit', year:'numeric' });
      } catch(e) {}
      var statusLabel = d.optOut
        ? '<span class="badge b-red" style="font-size:9px">Opt-out</span>'
        : '<span class="badge b-green" style="font-size:9px">Actief</span>';
      var isChecked = _mlGeselecteerd[d.uid] ? 'checked' : '';
      return '<tr style="' + (d.optOut ? 'opacity:.45' : '') + '">' +
        '<td><input type="checkbox" aria-label="Selecteer ' + _esc(d.email || d.uid) + '" data-uid="' + _esc(d.uid) + '" data-email="' + _esc(d.email) + '" ' + isChecked + ' onchange="mlToggle(this)"></td>' +
        '<td style="font-size:11px">' + _esc(d.email || '-') + '</td>' +
        '<td style="font-size:11px">' + _esc(d.displayName || d.naam || '-') + '</td>' +
        '<td style="font-size:10px;color:var(--text3)">' + datum + '</td>' +
        '<td>' + statusLabel + '</td>' +
        '<td>' + (!d.optOut
          ? '<button class="btn btn-sm btn-red" onclick="mlOptOut(\'' + _esc(d.uid) + '\')" title="Uitschrijven">✕</button>'
          : '<button class="btn btn-sm" onclick="mlOptIn(\'' + _esc(d.uid) + '\')" title="Herinschrijven">+</button>') +
        '</td></tr>';
    }).join('');

    mlUpdateBulkBalk();
  }

  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── Paginering ─────────────────────────────────────────────────
  window.mlPagina = function(richting) {
    var max = Math.max(0, Math.ceil(_mlDocs.length / _mlPerPagina) - 1);
    _mlPagina = Math.max(0, Math.min(max, _mlPagina + richting));
    mlRender();
  };

  // ── Selectie ───────────────────────────────────────────────────
  window.mlToggle = function(cb) {
    var uid   = cb.dataset.uid;
    var email = cb.dataset.email;
    if (cb.checked) { _mlGeselecteerd[uid] = email; }
    else            { delete _mlGeselecteerd[uid]; }
    mlUpdateBulkBalk();
  };

  window.mlToggleAll = function(aan) {
    _mlGeselecteerd = {};
    if (aan) {
      _mlDocs.forEach(function(d) {
        if (!d.optOut && d.email) _mlGeselecteerd[d.uid] = d.email;
      });
    }
    // Update checkboxes in DOM
    document.querySelectorAll('#ml-tbody input[type=checkbox]').forEach(function(cb) {
      cb.checked = !!_mlGeselecteerd[cb.dataset.uid];
    });
    mlUpdateBulkBalk();
  };

  function mlUpdateBulkBalk() {
    var n    = Object.keys(_mlGeselecteerd).length;
    var cntEl = document.getElementById('ml-sel-cnt');
    var btn   = document.getElementById('ml-bulk-btn');
    var allCb = document.getElementById('ml-sel-all');
    if (cntEl) { cntEl.textContent = n + ' geselecteerd'; cntEl.style.display = n > 0 ? '' : 'none'; }
    if (btn)   { btn.style.display = n > 0 ? '' : 'none'; }
    if (allCb && _mlDocs.length > 0) {
      var actief = _mlDocs.filter(function(d) { return !d.optOut && d.email; }).length;
      allCb.indeterminate = n > 0 && n < actief;
      allCb.checked = n > 0 && n >= actief;
    }
  }

  // ── Opt-out / opt-in ──────────────────────────────────────────
  window.mlOptOut = async function(uid) {
    if (!confirm('Uitschrijven van mailing list?')) return;
    try {
      await db.collection('mailing_list').doc(uid).set({ uid: uid, optOut: true, optOutAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      var d = _mlAlles.find(function(x) { return x.uid === uid; });
      if (d) d.optOut = true;
      delete _mlGeselecteerd[uid];
      mlFilter();
    } catch(e) { alert('Fout: ' + e.message); }
  };

  window.mlOptIn = async function(uid) {
    try {
      await db.collection('mailing_list').doc(uid).set({ uid: uid, optOut: false, optOutAt: null }, { merge: true });
      var d = _mlAlles.find(function(x) { return x.uid === uid; });
      if (d) d.optOut = false;
      mlFilter();
    } catch(e) { alert('Fout: ' + e.message); }
  };

  // ── Sync bestaande gebruikers ──────────────────────────────────
  window.mlSyncBestaand = async function() {
    if (!confirm('Synchroniseer alle bestaande users naar de mailing list? Bestaande entries worden niet overschreven.')) return;
    var btn = document.querySelector('[onclick="mlSyncBestaand()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Bezig…'; }
    try {
      var snap = await db.collection('users').limit(2000).get();
      var batch = db.batch();
      var count = 0;
      snap.docs.forEach(function(d) {
        var data = d.data();
        if (!data.email) return;
        var ref = db.collection('mailing_list').doc(d.id);
        // merge:true → overschrijft nooit bestaande optOut
        batch.set(ref, {
          uid:          d.id,
          email:        data.email,
          aangemaaktOp: data.aangemeld || firebase.firestore.FieldValue.serverTimestamp(),
          optOut:       false
        }, { merge: true });
        count++;
        if (count % 490 === 0) { batch.commit(); batch = db.batch(); }
      });
      await batch.commit();
      alert(count + ' gebruikers gesynchroniseerd.');
      mlLaad(true);
    } catch(e) {
      alert('Sync mislukt: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⟳ Sync bestaande users'; }
    }
  };

  // ── Bulk mail modal ────────────────────────────────────────────
  window.mlOpenBulkMail = function() {
    var n = Object.keys(_mlGeselecteerd).length;
    if (n === 0) { alert('Selecteer eerst gebruikers.'); return; }
    var infoEl = document.getElementById('ml-modal-cnt-info');
    if (infoEl) infoEl.textContent = n + ' ontvanger' + (n === 1 ? '' : 's') + ' geselecteerd';
    var statusEl = document.getElementById('ml-send-status');
    if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
    var sendBtn = document.getElementById('ml-send-btn');
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '✉ Verzenden'; }
    var modal = document.getElementById('ml-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.mlSluitModal = function() {
    var modal = document.getElementById('ml-modal');
    if (modal) modal.style.display = 'none';
  };

  // ── Bulk mail verzenden ────────────────────────────────────────
  window.mlVerzend = async function() {
    var onderwerp = (document.getElementById('ml-mail-onderwerp') || {}).value || '';
    var bericht   = (document.getElementById('ml-mail-bericht')  || {}).value || '';
    if (!onderwerp.trim()) { alert('Voer een onderwerp in.'); return; }
    if (!bericht.trim())   { alert('Voer een bericht in.'); return; }

    var ontvangers = Object.entries(_mlGeselecteerd).map(function(e) { return { uid: e[0], email: e[1] }; });
    if (ontvangers.length === 0) { alert('Geen ontvangers geselecteerd.'); return; }

    var sendBtn  = document.getElementById('ml-send-btn');
    var statusEl = document.getElementById('ml-send-status');
    if (sendBtn)  { sendBtn.disabled = true; sendBtn.textContent = 'Bezig…'; }
    if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = ''; }

    var batchSize    = 10;
    var batches      = [];
    for (var i = 0; i < ontvangers.length; i += batchSize) {
      batches.push(ontvangers.slice(i, i + batchSize));
    }

    var verzonden  = 0;
    var mislukt    = 0;
    var misluktLijst = [];

    function log(msg) {
      if (statusEl) statusEl.textContent += msg + '\n';
    }

    log('Start verzending naar ' + ontvangers.length + ' ontvangers in ' + batches.length + ' batch(es)…');

    for (var b = 0; b < batches.length; b++) {
      var batch = batches[b];
      log('Batch ' + (b+1) + '/' + batches.length + ' (' + batch.length + ' mails)…');
      var resultaten = await Promise.all(batch.map(async function(ontvanger) {
        try {
          // Stuur via Cloudflare Worker endpoint
          // Worker moet /mail endpoint hebben dat { to, subject, text } accepteert
          var resp = await fetch('https://black-grass-c05c.doubleyou-journal.workers.dev/mail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to:      ontvanger.email,
              subject: onderwerp,
              text:    bericht + '\n\n---\nJe ontvangt deze mail omdat je lid bent van DoubleYou. Uitschrijven: https://paskamerpraat.nl/uitschrijven?uid=' + ontvanger.uid
            })
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return { ok: true, email: ontvanger.email };
        } catch(e) {
          return { ok: false, email: ontvanger.email, fout: e.message };
        }
      }));

      resultaten.forEach(function(r) {
        if (r.ok) { verzonden++; }
        else { mislukt++; misluktLijst.push(r.email); }
      });

      // Rate limiting: wacht 500ms tussen batches
      if (b < batches.length - 1) await new Promise(function(res) { setTimeout(res, 500); });
    }

    log('Klaar: ' + verzonden + ' verzonden, ' + mislukt + ' mislukt.');
    if (misluktLijst.length) log('Mislukt: ' + misluktLijst.join(', '));

    // Campagne opslaan in Firestore
    try {
      await db.collection('mail_campagnes').add({
        onderwerp:   onderwerp,
        verzonden:   verzonden,
        mislukt:     mislukt,
        ontvangers:  ontvangers.length,
        ts:          firebase.firestore.FieldValue.serverTimestamp(),
        beheerder:   (firebase.auth().currentUser || {}).email || 'onbekend'
      });
      // KPI bijwerken
      mlLaadKpiCampagnes();
    } catch(e) {}

    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '✉ Opnieuw verzenden'; }
    mlLaadLog();
  };

  // ── Verzendlog ─────────────────────────────────────────────────
  window.mlLaadLog = async function() {
    var tbody = document.getElementById('ml-log-tbody');
    if (!tbody) return;
    try {
      var snap = await db.collection('mail_campagnes')
        .orderBy('ts', 'desc')
        .limit(20)
        .get();
      if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--text3);font-size:11px">Geen campagnes verzonden.</td></tr>';
        // KPI
        var kpiEl = document.getElementById('ml-kpi-campagnes');
        if (kpiEl) kpiEl.textContent = '0';
        return;
      }
      tbody.innerHTML = snap.docs.map(function(d) {
        var data = d.data();
        var datum = '-';
        try {
          var ts = data.ts && data.ts.toDate ? data.ts.toDate() : new Date(data.ts);
          datum = ts.toLocaleDateString('nl-NL') + ' ' + ts.toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' });
        } catch(e) {}
        var ok   = data.mislukt === 0;
        var statusBadge = ok
          ? '<span class="badge b-green" style="font-size:9px">OK</span>'
          : '<span class="badge b-amber" style="font-size:9px">' + data.mislukt + ' mislukt</span>';
        return '<tr>' +
          '<td style="font-size:10px;color:var(--text3)">' + datum + '</td>' +
          '<td style="font-size:11px">' + _esc(data.onderwerp || '-') + '</td>' +
          '<td style="font-size:11px">' + (data.verzonden || 0) + ' / ' + (data.ontvangers || 0) + '</td>' +
          '<td>' + statusBadge + '</td></tr>';
      }).join('');
      var kpiEl = document.getElementById('ml-kpi-campagnes');
      if (kpiEl) kpiEl.textContent = snap.docs.length;
    } catch(e) {
      var tbody2 = document.getElementById('ml-log-tbody');
      if (tbody2) tbody2.innerHTML = '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--text3);font-size:11px">Geen campagnes of geen toegang.</td></tr>';
      var kpiEl2 = document.getElementById('ml-kpi-campagnes');
      if (kpiEl2) kpiEl2.textContent = '0';
    }
  };

  window.mlLaadKpiCampagnes = async function() {
    try {
      var snap = await db.collection('mail_campagnes').get();
      var kpiEl = document.getElementById('ml-kpi-campagnes');
      if (kpiEl) kpiEl.textContent = snap.size;
    } catch(e) {}
  };

})();

// ── Einde Mailing List Module ──────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// CHALLENGES ADMIN TAB
// ═══════════════════════════════════════════════════════════════════

// Hook into tabLoad
var _origTabLoad = typeof tabLoad === 'function' ? tabLoad : null;
if (typeof tabLoad === 'function') {
  var _origTabLoadRef = tabLoad;
  tabLoad = function(t) {
    _origTabLoadRef(t);
    if (t === 'challenges') {
      setTimeout(chLaadLijst, 100);
    }
  };
}

// Voeg TAB_TITLES toe
if (typeof TAB_TITLES !== 'undefined') {
  TAB_TITLES['challenges'] = 'Outfit Challenges';
}

var _chLog = [];

function chLogActie(tekst) {
  var ts = new Date().toLocaleTimeString('nl-NL');
  _chLog.unshift('[' + ts + '] ' + tekst);
  if (_chLog.length > 50) _chLog = _chLog.slice(0, 50);
  var el = document.getElementById('ch-log');
  if (el) el.textContent = _chLog.join('\n');
}

async function chLaadLijst() {
  var el = document.getElementById('ch-admin-lijst');
  if (!el) return;
  el.innerHTML = '<div style="opacity:0.4;font-size:13px;">Laden…</div>';
  try {
    var db = firebase.firestore();
    var snap = await db.collection('challenges').orderBy('startdatum', 'desc').limit(20).get();
    if (snap.empty) {
      el.innerHTML = '<div style="opacity:0.4;font-size:13px;">Geen challenges gevonden.</div>';
      return;
    }
    el.innerHTML = snap.docs.map(function(doc) {
      var d = doc.data();
      var actief = d.actief !== false;
      return '<div class="ch-lijst-item">' +
        '<div class="ch-lijst-meta">' +
          '<div class="ch-lijst-titel">' + (d.icon || '🎯') + ' ' + (d.titel || '-') +
            '<span class="ch-badge' + (actief ? '' : ' inactief') + '">' + (actief ? 'Actief' : 'Inactief') + '</span>' +
          '</div>' +
          '<div class="ch-lijst-sub">Bonus: ' + (d.bonus || 0) + ' DSP · Einde: ' + (d.einddatum ? new Date(d.einddatum).toLocaleDateString('nl-NL') : '-') + '</div>' +
        '</div>' +
        '<div class="ch-lijst-acties">' +
          '<button class="ch-admin-btn grijs" style="font-size:11px;padding:6px 10px" onclick="chBewerk(\'' + doc.id + '\')">✏️</button>' +
          (actief
            ? '<button class="ch-admin-btn rood" style="font-size:11px;padding:6px 10px" onclick="chArchiveer(\'' + doc.id + '\')">Archief</button>'
            : '<button class="ch-admin-btn" style="font-size:11px;padding:6px 10px" onclick="chActiveer(\'' + doc.id + '\')">Activeer</button>') +
          '<button class="ch-admin-btn rood" style="font-size:11px;padding:6px 10px" onclick="chBeeindigen(\'' + doc.id + '\')">Stop</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="opacity:0.4;font-size:13px;">Kon lijst niet laden: ' + e.message + '</div>';
  }
}

function chNieuw() {
  document.getElementById('ch-edit-id').value = '';
  document.getElementById('ch-titel').value = '';
  document.getElementById('ch-omschrijving').value = '';
  document.getElementById('ch-icon').value = '';
  document.getElementById('ch-bonus').value = '';
  document.getElementById('ch-startdatum').value = '';
  document.getElementById('ch-einddatum').value = '';
  document.getElementById('ch-type').value = 'look';
  document.getElementById('ch-form-titel').textContent = 'Nieuwe challenge';
  document.getElementById('ch-form-status').textContent = '';
}

async function chBewerk(id) {
  try {
    var db = firebase.firestore();
    var doc = await db.collection('challenges').doc(id).get();
    if (!doc.exists) return;
    var d = doc.data();
    document.getElementById('ch-edit-id').value = id;
    document.getElementById('ch-titel').value = d.titel || '';
    document.getElementById('ch-omschrijving').value = d.omschrijving || '';
    document.getElementById('ch-icon').value = d.icon || '';
    document.getElementById('ch-bonus').value = d.bonus || '';
    document.getElementById('ch-startdatum').value = d.startdatum ? d.startdatum.slice(0, 16) : '';
    document.getElementById('ch-einddatum').value = d.einddatum ? d.einddatum.slice(0, 16) : '';
    document.getElementById('ch-type').value = d.type || 'look';
    document.getElementById('ch-form-titel').textContent = 'Challenge bewerken';
    document.getElementById('ch-form-status').textContent = 'ID: ' + id;
  } catch(e) {
    alert('Kon challenge niet laden: ' + e.message);
  }
}

async function chOpslaan() {
  var statusEl = document.getElementById('ch-form-status');
  var id = document.getElementById('ch-edit-id').value.trim();
  var titel = document.getElementById('ch-titel').value.trim();
  if (!titel) { statusEl.textContent = '⚠ Titel verplicht'; return; }

  var startEl = document.getElementById('ch-startdatum').value;
  var eindEl = document.getElementById('ch-einddatum').value;

  var data = {
    titel: titel,
    omschrijving: document.getElementById('ch-omschrijving').value.trim(),
    icon: document.getElementById('ch-icon').value.trim() || '🎯',
    bonus: parseInt(document.getElementById('ch-bonus').value) || 25,
    type: document.getElementById('ch-type').value || 'look',
    actie: document.getElementById('ch-type').value === 'verhaal' ? 'verhaal_plaatsen' : 'look_plaatsen',
    actief: true,
    startdatum: startEl ? new Date(startEl).toISOString() : new Date().toISOString(),
    einddatum: eindEl ? new Date(eindEl).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString(),
    deadline: eindEl ? new Date(eindEl).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString(),
    gewijzigdOp: firebase.firestore.FieldValue.serverTimestamp()
  };

  statusEl.textContent = 'Opslaan…';
  try {
    var db = firebase.firestore();
    if (id) {
      await db.collection('challenges').doc(id).update(data);
      chLogActie('Challenge bijgewerkt: ' + titel + ' (ID: ' + id + ')');
      statusEl.textContent = '✓ Opgeslagen';
    } else {
      data.aangemaaktOp = firebase.firestore.FieldValue.serverTimestamp();
      var ref = await db.collection('challenges').add(data);
      chLogActie('Nieuwe challenge aangemaakt: ' + titel + ' (ID: ' + ref.id + ')');
      statusEl.textContent = '✓ Aangemaakt (ID: ' + ref.id + ')';
    }
    chLaadLijst();
  } catch(e) {
    statusEl.textContent = '✗ Fout: ' + e.message;
    chLogActie('FOUT bij opslaan: ' + e.message);
  }
}

async function chArchiveer(id) {
  if (!confirm('Challenge archiveren (inactief zetten)?')) return;
  try {
    await firebase.firestore().collection('challenges').doc(id).update({
      actief: false,
      gearchiveerdOp: firebase.firestore.FieldValue.serverTimestamp()
    });
    chLogActie('Challenge gearchiveerd: ' + id);
    chLaadLijst();
  } catch(e) {
    alert('Fout: ' + e.message);
  }
}

async function chActiveer(id) {
  try {
    await firebase.firestore().collection('challenges').doc(id).update({ actief: true });
    chLogActie('Challenge geactiveerd: ' + id);
    chLaadLijst();
  } catch(e) {
    alert('Fout: ' + e.message);
  }
}

async function chBeeindigen(id) {
  if (!confirm('Challenge stoppen en winnaar bepalen?')) return;
  try {
    var db = firebase.firestore();
    var snap = await db.collection('looks')
      .where('challengeId', '==', id)
      .orderBy('stems', 'desc').limit(1).get();

    var challDoc = await db.collection('challenges').doc(id).get();
    var challTitel = challDoc.exists ? (challDoc.data().titel || 'Challenge') : 'Challenge';

    await db.collection('challenges').doc(id).update({
      actief: false,
      geeindigdOp: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (!snap.empty) {
      var winnaarDoc = snap.docs[0];
      var winnaarData = winnaarDoc.data();
      await db.collection('challenge_winnaars').add({
        challengeId: id,
        challengeTitel: challTitel,
        winnaarUid: winnaarData.userId || '',
        winnaarNaam: winnaarData.authorName || 'Anoniem',
        lookId: winnaarDoc.id,
        score: winnaarData.stems || 0,
        ts: firebase.firestore.FieldValue.serverTimestamp()
      });
      chLogActie('Challenge beëindigd. Winnaar: ' + (winnaarData.authorName || 'Anoniem') + ' met ' + (winnaarData.stems || 0) + ' stemmen');
    } else {
      chLogActie('Challenge beëindigd zonder inzendingen: ' + id);
    }
    chLaadLijst();
  } catch(e) {
    alert('Fout: ' + e.message);
    chLogActie('FOUT bij beëindigen: ' + e.message);
  }
}

