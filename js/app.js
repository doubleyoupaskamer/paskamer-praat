// DoubleYou PWA — Hoofd applicatie
window.DY = window.DY || {};

DY.pagina = 'feed';
DY.authKlaar = false;

DY.onAuthReady = function(user) {
  DY.authKlaar = true;
  if (!user) {
    DY.toonPagina('login');
  } else {
    DY.toonPagina(DY.pagina === 'login' ? 'feed' : DY.pagina);
    DY.updateNav();
    DY.updateTopbarAvatar();
  }
};

DY.navigeer = function(pagina) {
  DY.pagina = pagina;
  DY.toonPagina(pagina);
  DY.updateNav();
  window.scrollTo(0, 0);
};

DY.updateNav = function() {
  document.querySelectorAll('.dy-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.pagina === DY.pagina);
  });
};

DY.updateTopbarAvatar = function() {
  const avatar = document.getElementById('dy-topbar-avatar');
  if (!avatar) return;
  if (DY.user) {
    const naam = DY.profile?.displayName || DY.user.displayName || DY.user.email || '?';
    const niveau = DY.getNiveau(DY.profile?.dsp_lifetime || 0);
    avatar.textContent = naam.slice(0,2).toUpperCase();
    avatar.style.display = 'flex';
    avatar.title = niveau.emoji + ' ' + niveau.naam;
  } else {
    avatar.style.display = 'none';
  }
};

DY.toonPagina = function(pagina) {
  const main = document.getElementById('dy-main');
  main.innerHTML = '';
  main.className = 'dy-main dy-fade-in';
  const renders = {
    login:    DY.renderLogin,
    register: DY.renderRegister,
    feed:     DY.renderFeed,
    nieuw:    DY.renderNieuwVerhaal,
    profiel:  DY.renderProfiel,
    dsp:      DY.renderDSP,
    detail:   DY.renderDetail,
    winkel:   DY.renderWinkel
  };
  if (renders[pagina]) renders[pagina]();
};

// ── LOGIN ──────────────────────────────────────────────────────────
DY.renderLogin = function() {
  const main = document.getElementById('dy-main');
  main.innerHTML = `
    <div class="dy-auth-wrap">
      <div class="dy-auth-logo">
        <div class="dy-auth-w">W</div>
        <div class="dy-auth-brand">DoubleYou</div>
        <div class="dy-auth-sub">Paskamer Praat</div>
      </div>
      <div class="dy-auth-card">
        <h2 class="dy-auth-title">Inloggen</h2>
        <div id="dy-auth-err" class="dy-auth-err" style="display:none"></div>
        <div class="dy-field">
          <label class="dy-label">E-mailadres</label>
          <input class="dy-input" id="login-email" type="email" placeholder="jouw@email.nl" autocomplete="email">
        </div>
        <div class="dy-field">
          <label class="dy-label">Wachtwoord</label>
          <input class="dy-input" id="login-pw" type="password" placeholder="••••••••" autocomplete="current-password">
        </div>
        <button class="dy-btn dy-btn-primary" id="btn-login">Inloggen</button>
        <button class="dy-btn dy-btn-ghost" onclick="DY.navigeer('register')">Nog geen account? Aanmelden</button>
        <button class="dy-btn dy-btn-link" id="btn-reset">Wachtwoord vergeten?</button>
      </div>
    </div>`;

  document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    const pw = document.getElementById('login-pw').value;
    const err = document.getElementById('dy-auth-err');
    try {
      err.style.display = 'none';
      await DY.login(email, pw);
      DY.navigeer('feed');
    } catch(e) {
      err.textContent = 'Inloggen mislukt. Controleer je e-mailadres en wachtwoord.';
      err.style.display = 'block';
    }
  };

  document.getElementById('btn-reset').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    if (!email) { alert('Vul eerst je e-mailadres in.'); return; }
    await DY.resetPassword(email);
    alert('Resetmail verzonden. Controleer je inbox.');
  };

  document.getElementById('login-pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });
};

// ── REGISTREREN ────────────────────────────────────────────────────
DY.renderRegister = function() {
  const main = document.getElementById('dy-main');
  main.innerHTML = `
    <div class="dy-auth-wrap">
      <div class="dy-auth-logo">
        <div class="dy-auth-w">W</div>
        <div class="dy-auth-brand">DoubleYou</div>
        <div class="dy-auth-sub">Paskamer Praat</div>
      </div>
      <div class="dy-auth-card">
        <h2 class="dy-auth-title">Account aanmaken</h2>
        <div id="dy-auth-err" class="dy-auth-err" style="display:none"></div>
        <div class="dy-field">
          <label class="dy-label">Naam</label>
          <input class="dy-input" id="reg-naam" type="text" placeholder="Jouw naam" autocomplete="name">
        </div>
        <div class="dy-field">
          <label class="dy-label">E-mailadres</label>
          <input class="dy-input" id="reg-email" type="email" placeholder="jouw@email.nl" autocomplete="email">
        </div>
        <div class="dy-field">
          <label class="dy-label">Wachtwoord</label>
          <input class="dy-input" id="reg-pw" type="password" placeholder="Minimaal 6 tekens" autocomplete="new-password">
        </div>
        <button class="dy-btn dy-btn-primary" id="btn-reg">Account aanmaken</button>
        <button class="dy-btn dy-btn-ghost" onclick="DY.navigeer('login')">Al een account? Inloggen</button>
      </div>
      <p class="dy-auth-note">Je ontvangt direct 10 DSP punten als welkomstbonus.</p>
    </div>`;

  document.getElementById('btn-reg').onclick = async () => {
    const naam = document.getElementById('reg-naam').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pw = document.getElementById('reg-pw').value;
    const err = document.getElementById('dy-auth-err');
    if (!naam || !email || !pw) { err.textContent = 'Vul alle velden in.'; err.style.display = 'block'; return; }
    if (pw.length < 6) { err.textContent = 'Wachtwoord moet minimaal 6 tekens zijn.'; err.style.display = 'block'; return; }
    try {
      err.style.display = 'none';
      await DY.register(email, pw, naam);
      DY.navigeer('feed');
    } catch(e) {
      err.textContent = e.message || 'Aanmelden mislukt.';
      err.style.display = 'block';
    }
  };
};

// ── FEED ───────────────────────────────────────────────────────────
DY.renderFeed = function() {
  const main = document.getElementById('dy-main');
  main.innerHTML = `
    <div class="dy-feed-header">
      <div class="dy-feed-header-inner">
        <div>
          <h1 class="dy-page-title">Paskamer <em>Praat</em></h1>
          <p class="dy-page-sub">Verhalen van mensen voor wie standaard niet standaard is.</p>
        </div>
        <button class="dy-fab" onclick="DY.navigeer('nieuw')" title="Nieuw verhaal">
          <svg viewBox="0 0 24 24"><path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
        </button>
      </div>
    </div>
    <div id="dy-feed-filters" class="dy-filters">
      <button class="dy-filter active" data-filter="recent" onclick="DY.setFilter('recent', this)">Nieuwste</button>
      <button class="dy-filter" data-filter="populair" onclick="DY.setFilter('populair', this)">Populair</button>
      <button class="dy-filter" data-filter="mijn" onclick="DY.setFilter('mijn', this)">Mijn verhalen</button>
    </div>
    <div id="dy-verhalen" class="dy-verhalen-lijst">
      <div class="dy-loader"><div class="dy-spinner"></div></div>
    </div>`;
  DY.laadVerhalen('recent');
};

DY.setFilter = function(filter, btn) {
  document.querySelectorAll('.dy-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  DY.laadVerhalen(filter);
};

DY.laadVerhalen = async function(filter = 'recent') {
  const container = document.getElementById('dy-verhalen');
  container.innerHTML = '<div class="dy-loader"><div class="dy-spinner"></div></div>';
  try {
    let query = DY.db.collection('stories').limit(50);

    // Mijn verhalen: probeer beide veldnamen
    if (filter === 'mijn' && DY.user) {
      // Haal alles op en filter client-side om index problemen te vermijden
      query = DY.db.collection('stories').limit(100);
    }

    const snap = await query.get();
    container.innerHTML = '';

    if (snap.empty) {
      container.innerHTML = '<div class="dy-leeg"><p>Nog geen verhalen. Wees de eerste!</p></div>';
      return;
    }

    let verhalen = [];
    snap.forEach(doc => verhalen.push({ _docId: doc.id, ...doc.data() }));

    // Client-side filter voor mijn verhalen
    if (filter === 'mijn' && DY.user) {
      verhalen = verhalen.filter(v =>
        v.userId === DY.user.uid ||
        v.uid === DY.user.uid ||
        v.authorId === DY.user.uid
      );
      if (verhalen.length === 0) {
        container.innerHTML = '<div class="dy-leeg"><p>Je hebt nog geen verhalen geplaatst.</p></div>';
        return;
      }
    }

    // Sorteren
    if (filter === 'populair') {
      verhalen.sort((a, b) => {
        const la = a.likes && typeof a.likes === 'object' ? Object.keys(a.likes).length : (Number(a.likes) || 0);
        const lb = b.likes && typeof b.likes === 'object' ? Object.keys(b.likes).length : (Number(b.likes) || 0);
        return lb - la;
      });
    } else {
      verhalen.sort((a, b) => {
        const da = a.ts?.toDate ? a.ts.toDate() : new Date(a.createdAt || 0);
        const db2 = b.ts?.toDate ? b.ts.toDate() : new Date(b.createdAt || 0);
        return db2 - da;
      });
    }

    verhalen.forEach(data => container.appendChild(DY.verhaalKaart(data)));
  } catch(e) {
    container.innerHTML = '<div class="dy-leeg"><p>Verhalen konden niet worden geladen.</p></div>';
    console.error('Feed fout:', e);
  }
};

DY.verhaalKaart = function(data) {
  const el = document.createElement('div');
  el.className = 'dy-kaart';

  // Gebruik _docId als betrouwbaar ID (Firestore document ID)
  const docId = data._docId || data.id;
  const ts = data.ts?.toDate ? data.ts.toDate() : new Date(data.createdAt || 0);
  const naam = data.authorName || data.displayName || data.auteur || data.naam || 'Anoniem';
  const initials = naam.slice(0,2).toUpperCase();
  const tekst = data.body || data.tekst || data.inhoud || data.content || '';
  const titel = data.title || '';
  const foto = data.photo || data.foto || null;

  // Likes: object {uid: true} of getal
  const likesObj = (data.likes && typeof data.likes === 'object') ? data.likes : {};
  const likeCount = typeof data.likes === 'number' ? data.likes : Object.keys(likesObj).length;
  const liked = DY.user && (likesObj[DY.user.uid] === true);
  const eigenVerhaal = DY.user && (data.userId === DY.user.uid || data.uid === DY.user.uid);

  // Comments tellen
  const commentCount = typeof data.reacties === 'number' ? data.reacties :
    (data.comments && typeof data.comments === 'object' ? Object.keys(data.comments).length : 0);

  el.innerHTML = `
    <div class="dy-kaart-header">
      <div class="dy-avatar">${initials}</div>
      <div class="dy-kaart-meta">
        <span class="dy-kaart-naam">${naam}</span>
        <span class="dy-kaart-tijd">${DY.tijdGeleden(ts)}</span>
      </div>
      ${eigenVerhaal ? '<span class="dy-eigen-badge">Jouw verhaal</span>' : ''}
    </div>
    ${data.video ? `<video class="dy-kaart-foto dy-kaart-video" src="${data.video}" muted playsinline preload="metadata" style="width:100%;max-height:220px;object-fit:cover;cursor:pointer" onclick="DY.openDetail('${docId}')"></video>` : (foto ? `<img class="dy-kaart-foto" src="${foto}" alt="" loading="lazy">` : '')}
    <div class="dy-kaart-body">
      ${titel ? `<strong class="dy-kaart-titel">${titel}</strong>` : ''}
      <p class="dy-kaart-tekst">${DY.truncate(tekst, 200)}</p>
    </div>
    <div class="dy-kaart-footer">
      <button class="dy-like-btn ${liked ? 'liked' : ''}" onclick="DY.toggleLike('${docId}', this)">
        <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        <span>${likeCount}</span>
      </button>
      <button class="dy-reactie-btn" onclick="DY.openDetail('${docId}')">
        <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>${commentCount}</span>
      </button>
      <button class="dy-lees-btn" onclick="DY.openDetail('${docId}')">Lees meer →</button>
    </div>`;
  return el;
};

// ── NIEUW VERHAAL ──────────────────────────────────────────────────
DY.renderNieuwVerhaal = function() {
  if (!DY.user) { DY.navigeer('login'); return; }
  const main = document.getElementById('dy-main');
  main.innerHTML = `
    <div class="dy-form-wrap">
      <div class="dy-form-header">
        <button class="dy-back-btn" onclick="DY.navigeer('feed')">← Terug</button>
        <h2 class="dy-page-title">Nieuw <em>verhaal</em></h2>
      </div>
      <div class="dy-dsp-tip">
        <span class="dy-dsp-tip-icon">✦</span>
        <span>Verhaal plaatsen levert <strong>+15 DSP</strong>. Bij 120+ woorden nog eens <strong>+5 DSP</strong> extra. Foto of video toevoegen levert <strong>+10 DSP</strong>.</span>
      </div>
      <div class="dy-field">
        <label class="dy-label">Jouw verhaal</label>
        <textarea class="dy-textarea" id="verhaal-tekst" placeholder="Deel jouw ervaring met pasvorm, kledingzoeken of online shoppen..." rows="8"></textarea>
        <div class="dy-woordteller"><span id="woord-count">0</span> woorden</div>
      </div>
      <div class="dy-field">
        <label class="dy-label">Foto of video toevoegen (optioneel, +10 DSP)</label>
        <div class="dy-media-upload" id="media-zone">
          <input type="file" id="verhaal-media" accept="image/*,video/*" style="display:none">
          <div class="dy-media-placeholder" onclick="document.getElementById('verhaal-media').click()">
            <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            <span>Tik om foto of video te selecteren</span>
          </div>
          <div id="media-preview" style="display:none">
            <img id="foto-preview" style="display:none;width:100%;border-radius:4px;max-height:200px;object-fit:cover">
            <video id="video-preview" style="display:none;width:100%;border-radius:4px;max-height:200px" controls playsinline></video>
            <button class="dy-media-remove" onclick="DY.verwijderMedia()">✕ Verwijderen</button>
          </div>
        </div>
        <div id="upload-voortgang" style="display:none" class="dy-upload-voortgang">
          <div class="dy-upload-balk"><div class="dy-upload-fill" id="upload-fill"></div></div>
          <span id="upload-pct">0%</span>
        </div>
      </div>
      <button class="dy-btn dy-btn-primary" id="btn-plaatsen">Verhaal plaatsen</button>
    </div>`;

  const tekstEl = document.getElementById('verhaal-tekst');
  tekstEl.addEventListener('input', () => {
    const w = tekstEl.value.trim().split(/\s+/).filter(w => w).length;
    document.getElementById('woord-count').textContent = w;
  });

  const mediaInput = document.getElementById('verhaal-media');
  mediaInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById('media-preview');
    const fotoPreview = document.getElementById('foto-preview');
    const videoPreview = document.getElementById('video-preview');
    document.querySelector('.dy-media-placeholder').style.display = 'none';
    preview.style.display = 'block';
    if (file.type.startsWith('image/')) {
      fotoPreview.style.display = 'block';
      videoPreview.style.display = 'none';
      const reader = new FileReader();
      reader.onload = ev => fotoPreview.src = ev.target.result;
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      videoPreview.style.display = 'block';
      fotoPreview.style.display = 'none';
      videoPreview.src = URL.createObjectURL(file);
    }
  });

  DY.verwijderMedia = function() {
    mediaInput.value = '';
    document.getElementById('foto-preview').style.display = 'none';
    document.getElementById('video-preview').style.display = 'none';
    document.getElementById('media-preview').style.display = 'none';
    document.querySelector('.dy-media-placeholder').style.display = 'flex';
  };

  document.getElementById('btn-plaatsen').onclick = async () => {
    const tekst = tekstEl.value.trim();
    if (!tekst) { alert('Vul een verhaal in.'); return; }
    const btn = document.getElementById('btn-plaatsen');
    btn.textContent = 'Plaatsen...';
    btn.disabled = true;
    const woorden = tekst.split(/\s+/).filter(w => w).length;
    const heeftMedia = mediaInput.files.length > 0;
    let mediaURL = null;
    let mediaType = null;

    try {
      if (heeftMedia) {
        const file = mediaInput.files[0];
        mediaType = file.type.startsWith('video/') ? 'video' : 'foto';
        btn.textContent = 'Media uploaden...';
        const ext = file.name.split('.').pop();
        const pad = `verhalen/${DY.user.uid}/${Date.now()}.${ext}`;
        const storageRef = firebase.storage().ref(pad);
        const uploadTask = storageRef.put(file);

        mediaURL = await new Promise((resolve, reject) => {
          uploadTask.on('state_changed',
            snap => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              document.getElementById('upload-voortgang').style.display = 'flex';
              document.getElementById('upload-fill').style.width = pct + '%';
              document.getElementById('upload-pct').textContent = pct + '%';
            },
            reject,
            async () => {
              const url = await uploadTask.snapshot.ref.getDownloadURL();
              resolve(url);
            }
          );
        });
        document.getElementById('upload-voortgang').style.display = 'none';
      }

      btn.textContent = 'Opslaan...';
      const displayName = DY.profile?.displayName || DY.user.displayName || DY.user.email.split('@')[0] || 'Anoniem';
      const docRef = await DY.db.collection('stories').add({
        userId: DY.user.uid,
        authorName: displayName,
        title: tekst.split(' ').slice(0,6).join(' ') + (woorden > 6 ? '...' : ''),
        body: tekst,
        photo: mediaType === 'foto' ? mediaURL : null,
        video: mediaType === 'video' ? mediaURL : null,
        mediaType: mediaType || null,
        likes: {},
        comments: {},
        rating: 0,
        category: 'Ervaring',
        createdAt: new Date().toISOString(),
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await DY.geefPunten('verhaal_plaatsen', { verhaal_id: docRef.id });
      if (woorden >= 120) await DY.geefPunten('verhaal_bonus_120', { verhaal_id: docRef.id });
      if (heeftMedia) await DY.geefPunten('foto_verhaal', { verhaal_id: docRef.id });

      DY.navigeer('feed');
      DY.toonPuntenMelding(15, 'Verhaal geplaatst!');
    } catch(e) {
      btn.textContent = 'Verhaal plaatsen';
      btn.disabled = false;
      document.getElementById('upload-voortgang').style.display = 'none';
      alert('Fout: ' + (e.message || e.code || 'onbekend'));
      console.error(e);
    }
  };
};

// ── DETAIL VERHAAL ─────────────────────────────────────────────────
DY.openDetail = function(id) {
  DY.huidigVerhaalId = id;
  DY.navigeer('detail');
};

DY.renderDetail = async function() {
  const id = DY.huidigVerhaalId;
  const main = document.getElementById('dy-main');

  if (!id) {
    main.innerHTML = '<div class="dy-detail-wrap"><button class="dy-back-btn" onclick="DY.navigeer(\'feed\')">← Terug</button><p style="padding:20px">Geen verhaal geselecteerd.</p></div>';
    return;
  }

  main.innerHTML = `
    <div class="dy-detail-wrap">
      <button class="dy-back-btn" onclick="DY.navigeer('feed')">← Terug naar feed</button>
      <div class="dy-loader"><div class="dy-spinner"></div></div>
    </div>`;

  try {
    const docSnap = await DY.db.collection('stories').doc(id).get();
    if (!docSnap.exists) {
      main.innerHTML = '<div class="dy-detail-wrap"><button class="dy-back-btn" onclick="DY.navigeer(\'feed\')">← Terug</button><p style="padding:20px">Verhaal niet gevonden.</p></div>';
      return;
    }

    const data = { _docId: docSnap.id, ...docSnap.data() };
    const naam = data.authorName || data.displayName || data.auteur || 'Anoniem';
    const initials = naam.slice(0,2).toUpperCase();
    const ts = data.ts?.toDate ? data.ts.toDate() : new Date(data.createdAt || 0);
    const tekst = data.body || data.tekst || data.inhoud || data.content || '';
    const foto = data.photo || data.foto || null;
    const likesObj = (data.likes && typeof data.likes === 'object') ? data.likes : {};
    const likeCount = typeof data.likes === 'number' ? data.likes : Object.keys(likesObj).length;
    const liked = DY.user && (likesObj[DY.user.uid] === true);

    main.innerHTML = `
      <div class="dy-detail-wrap">
        <button class="dy-back-btn" onclick="DY.navigeer('feed')">← Terug naar feed</button>
        <article class="dy-artikel">
          <div class="dy-kaart-header">
            <div class="dy-avatar dy-avatar-lg">${initials}</div>
            <div class="dy-kaart-meta">
              <span class="dy-kaart-naam">${naam}</span>
              <span class="dy-kaart-tijd">${DY.tijdGeleden(ts)}</span>
            </div>
          </div>
          ${data.video ? `<video class="dy-artikel-foto" src="${data.video}" controls playsinline style="width:100%;border-radius:4px;max-height:300px"></video>` : (foto ? `<img class="dy-artikel-foto" src="${foto}" alt="">` : '')}
          ${data.title ? `<h2 class="dy-artikel-titel">${data.title}</h2>` : ''}
          <p class="dy-artikel-tekst">${tekst.replace(/\n/g, '<br>')}</p>
          <div class="dy-artikel-acties">
            <button class="dy-like-btn ${liked ? 'liked' : ''}" id="detail-like-btn" onclick="DY.toggleLike('${data._docId}', this)">
              <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              <span>${likeCount}</span>
            </button>
          </div>
        </article>
        <div class="dy-reacties-sectie">
          <h3 class="dy-reacties-titel">Reacties</h3>
          <div id="dy-reacties-lijst" class="dy-reacties-lijst">
            <div class="dy-loader"><div class="dy-spinner"></div></div>
          </div>
          ${DY.user ? `
          <div class="dy-reactie-form">
            <div class="dy-dsp-tip"><span class="dy-dsp-tip-icon">✦</span><span>Reageren levert <strong>+3 DSP</strong></span></div>
            <textarea class="dy-textarea" id="reactie-tekst" placeholder="Schrijf een reactie..." rows="3"></textarea>
            <div class="dy-reactie-media-wrap">
              <input type="file" id="reactie-foto" accept="image/*" style="display:none">
              <button class="dy-btn-media" onclick="document.getElementById('reactie-foto').click()">
                <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                Foto toevoegen
              </button>
              <span id="reactie-foto-naam" style="font-size:12px;color:var(--ink-muted)"></span>
            </div>
            <div id="reactie-upload-voortgang" style="display:none" class="dy-upload-voortgang">
              <div class="dy-upload-balk"><div class="dy-upload-fill" id="reactie-upload-fill"></div></div>
              <span id="reactie-upload-pct">0%</span>
            </div>
            <button class="dy-btn dy-btn-primary" id="btn-reactie">Reactie plaatsen</button>
          </div>` : '<p class="dy-login-prompt">Log in om te reageren.</p>'}
        </div>
      </div>`;

    DY.laadReacties(data._docId);
    if (DY.user) {
      document.getElementById('btn-reactie').onclick = () => DY.plaatsReactie(data._docId);
    }
  } catch(e) {
    console.error('Detail fout:', e);
    main.innerHTML = '<div class="dy-detail-wrap"><button class="dy-back-btn" onclick="DY.navigeer(\'feed\')">← Terug</button><p style="padding:20px">Fout bij laden.</p></div>';
  }
};

DY.laadReacties = async function(verhaalId) {
  const container = document.getElementById('dy-reacties-lijst');
  if (!container) return;
  try {
    // Probeer comments, dan reacties als fallback
    let snap;
    try {
      snap = await DY.db.collection('stories').doc(verhaalId).collection('comments').get();
    } catch(e) {
      snap = await DY.db.collection('stories').doc(verhaalId).collection('reacties').get();
    }

    container.innerHTML = '';
    if (snap.empty) {
      container.innerHTML = '<p class="dy-leeg-tekst">Nog geen reacties.</p>';
      return;
    }

    // Sorteer client-side
    const reacties = [];
    snap.forEach(doc => reacties.push(doc.data()));
    reacties.sort((a, b) => {
      const da = a.ts?.toDate ? a.ts.toDate() : new Date(a.createdAt || 0);
      const db2 = b.ts?.toDate ? b.ts.toDate() : new Date(b.createdAt || 0);
      return da - db2;
    });

    reacties.forEach(r => {
      const naam = r.authorName || r.displayName || r.auteur || 'Anoniem';
      const el = document.createElement('div');
      el.className = 'dy-reactie';
      el.innerHTML = `
        <div class="dy-reactie-avatar">${naam.slice(0,2).toUpperCase()}</div>
        <div class="dy-reactie-content">
          <span class="dy-reactie-naam">${naam}</span>
          <p class="dy-reactie-tekst">${r.body || r.tekst || ''}</p>
          ${r.foto ? `<img src="${r.foto}" alt="" class="dy-reactie-foto">` : ''}
          <span class="dy-reactie-tijd">${DY.tijdGeleden(r.ts?.toDate ? r.ts.toDate() : new Date(r.createdAt || 0))}</span>
        </div>`;
      container.appendChild(el);
    });
  } catch(e) {
    container.innerHTML = '<p class="dy-leeg-tekst">Reacties konden niet worden geladen.</p>';
    console.error('Reacties fout:', e);
  }
};

DY.plaatsReactie = async function(verhaalId) {
  const tekst = document.getElementById('reactie-tekst').value.trim();
  if (!tekst) { alert('Schrijf een reactie.'); return; }
  const btn = document.getElementById('btn-reactie');
  btn.disabled = true;
  btn.textContent = 'Plaatsen...';

  const fotoInput = document.getElementById('reactie-foto');
  const heeftFoto = fotoInput && fotoInput.files.length > 0;
  let fotoURL = null;

  try {
    if (heeftFoto) {
      btn.textContent = 'Foto uploaden...';
      const file = fotoInput.files[0];
      const ext = file.name.split('.').pop();
      const pad = `reacties/${DY.user.uid}/${Date.now()}.${ext}`;
      const storageRef = firebase.storage().ref(pad);
      const uploadTask = storageRef.put(file);

      fotoURL = await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            const vEl = document.getElementById('reactie-upload-voortgang');
            if (vEl) vEl.style.display = 'flex';
            const fEl = document.getElementById('reactie-upload-fill');
            if (fEl) fEl.style.width = pct + '%';
            const pEl = document.getElementById('reactie-upload-pct');
            if (pEl) pEl.textContent = pct + '%';
          },
          reject,
          async () => resolve(await uploadTask.snapshot.ref.getDownloadURL())
        );
      });
      const vEl = document.getElementById('reactie-upload-voortgang');
      if (vEl) vEl.style.display = 'none';
    }

    btn.textContent = 'Opslaan...';
    const displayName = DY.profile?.displayName || DY.user.displayName || 'Anoniem';
    await DY.db.collection('stories').doc(verhaalId).collection('comments').add({
      userId: DY.user.uid,
      authorName: displayName,
      body: tekst,
      foto: fotoURL || null,
      createdAt: new Date().toISOString(),
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    await DY.db.collection('stories').doc(verhaalId).set(
      { reacties: firebase.firestore.FieldValue.increment(1) },
      { merge: true }
    );
    await DY.geefPunten('reactie_plaatsen', { verhaal_id: verhaalId });
    document.getElementById('reactie-tekst').value = '';
    if (fotoInput) fotoInput.value = '';
    const naamEl = document.getElementById('reactie-foto-naam');
    if (naamEl) naamEl.textContent = '';
    btn.textContent = 'Reactie plaatsen';
    btn.disabled = false;
    DY.laadReacties(verhaalId);
  } catch(e) {
    btn.textContent = 'Reactie plaatsen';
    btn.disabled = false;
    const vEl = document.getElementById('reactie-upload-voortgang');
    if (vEl) vEl.style.display = 'none';
    alert('Fout: ' + (e.message || 'onbekend'));
    console.error(e);
  }
};

// ── PROFIEL ────────────────────────────────────────────────────────
DY.renderProfiel = async function() {
  if (!DY.user) { DY.navigeer('login'); return; }
  const main = document.getElementById('dy-main');

  // Herlaad profiel voor actuele data
  try { await DY.loadProfile(DY.user.uid); } catch(e) {}

  const p = DY.profile || {};
  const naam = p.displayName || DY.user.displayName || DY.user.email?.split('@')[0] || 'Gebruiker';
  const niveau = DY.getNiveau(p.dsp_lifetime || 0);
  const seizoentier = DY.getSeizoenTier(p.dsp_seizoen || 0);
  const progress = DY.getNiveauProgress(p.dsp_lifetime || 0);
  const volgendNiveau = DY.NIVEAUS[DY.NIVEAUS.findIndex(n => n.naam === niveau.naam) + 1];
  const puntsTotVolgende = volgendNiveau ? volgendNiveau.min - (p.dsp_lifetime || 0) : 0;

  main.innerHTML = `
    <div class="dy-profiel-wrap">
      <div class="dy-profiel-hero">
        <div class="dy-profiel-avatar-container">
          <div class="dy-profiel-avatar-lg">${naam.slice(0,2).toUpperCase()}</div>
          <div class="dy-profiel-badge">${niveau.emoji}</div>
        </div>
        <h2 class="dy-profiel-naam">${naam}</h2>
        <div class="dy-profiel-niveau">
          <span class="dy-niveau-naam">${niveau.naam}</span>
        </div>
        <p class="dy-profiel-email">${DY.user.email}</p>
      </div>

      <div class="dy-stats-grid">
        <div class="dy-stat">
          <div class="dy-stat-waarde">${p.dsp_lifetime || 0}</div>
          <div class="dy-stat-label">Lifetime DSP</div>
        </div>
        <div class="dy-stat">
          <div class="dy-stat-waarde">${p.dsp_seizoen || 0}</div>
          <div class="dy-stat-label">Dit seizoen</div>
        </div>
        <div class="dy-stat">
          <div class="dy-stat-waarde">${p.streak || 0}</div>
          <div class="dy-stat-label">Streak</div>
        </div>
      </div>

      <div class="dy-niveau-kaart">
        <div class="dy-niveau-kaart-header">
          <span>${niveau.emoji} ${niveau.naam}</span>
          <span class="dy-niveau-pct">${progress}%</span>
        </div>
        <div class="dy-progress-bar">
          <div class="dy-progress-fill" style="width:${progress}%"></div>
        </div>
        <p class="dy-niveau-voordelen">${niveau.voordelen}</p>
        ${volgendNiveau ? `<p class="dy-niveau-next">Nog <strong>${puntsTotVolgende} DSP</strong> tot ${volgendNiveau.emoji} ${volgendNiveau.naam}</p>` : '<p class="dy-niveau-next">Je hebt het hoogste niveau bereikt.</p>'}
      </div>

      <div class="dy-seizoen-kaart">
        <div class="dy-seizoen-label">${DY.seizoenLabel(p.seizoen || DY.huidigSeizoen())}</div>
        <div class="dy-seizoen-tier">${seizoentier.naam}</div>
        <p class="dy-seizoen-voordelen">${seizoentier.voordelen}</p>
        <div class="dy-seizoen-voortgang">
          <span>${p.dsp_seizoen || 0} seizoenspunten</span>
        </div>
      </div>

      <div class="dy-alle-niveaus">
        <h3 class="dy-log-titel">Niveaus</h3>
        ${DY.NIVEAUS.map(n => `
          <div class="dy-niveau-rij ${n.naam === niveau.naam ? 'actief' : ''}">
            <span class="dy-niveau-rij-emoji">${n.naam === niveau.naam ? n.emoji : (DY.NIVEAUS.indexOf(n) < DY.NIVEAUS.findIndex(x => x.naam === niveau.naam) ? '✓' : '○')}</span>
            <div class="dy-niveau-rij-info">
              <strong>${n.naam}</strong>
              <span>${n.voordelen}</span>
            </div>
            <span class="dy-niveau-rij-pts">${n.min === 0 ? '0' : n.min.toLocaleString('nl')}+</span>
          </div>`).join('')}
      </div>

      <div class="dy-log-sectie">
        <h3 class="dy-log-titel">Recente activiteit</h3>
        <div id="dy-log-lijst"><div class="dy-loader"><div class="dy-spinner"></div></div></div>
      </div>

      <button class="dy-btn dy-btn-ghost dy-btn-uitloggen" onclick="DY.logout().then(() => { DY.profile = null; DY.navigeer('login'); })">Uitloggen</button>
    </div>`;

  // DSP log laden — zonder orderBy om index te vermijden
  try {
    const snap = await DY.db.collection('dsp_log').where('uid', '==', DY.user.uid).limit(20).get();
    const logEl = document.getElementById('dy-log-lijst');
    if (snap.empty) { logEl.innerHTML = '<p class="dy-leeg-tekst">Nog geen activiteit.</p>'; return; }
    const items = [];
    snap.forEach(doc => items.push(doc.data()));
    // Sorteer client-side
    items.sort((a, b) => {
      const da = a.ts?.toDate ? a.ts.toDate() : new Date(0);
      const db2 = b.ts?.toDate ? b.ts.toDate() : new Date(0);
      return db2 - da;
    });
    logEl.innerHTML = items.slice(0,10).map(item => `
      <div class="dy-log-item">
        <span class="dy-log-label">${item.label || item.actie || 'Actie'}</span>
        <span class="dy-log-pts">+${item.pts} DSP</span>
      </div>`).join('');
  } catch(e) {
    const logEl = document.getElementById('dy-log-lijst');
    if (logEl) logEl.innerHTML = '<p class="dy-leeg-tekst">Activiteit kon niet worden geladen.</p>';
  }
};

// ── DSP OVERZICHT ──────────────────────────────────────────────────
DY.renderDSP = function() {
  const main = document.getElementById('dy-main');
  const niveauHTML = DY.NIVEAUS.map(n => `
    <div class="dy-dsp-niveau-rij">
      <span class="dy-dsp-niveau-emoji">${n.emoji}</span>
      <div class="dy-dsp-niveau-info">
        <strong>${n.naam}</strong>
        <span>${n.min.toLocaleString('nl')} – ${n.max === Infinity ? '∞' : n.max.toLocaleString('nl')} DSP</span>
      </div>
      <span class="dy-dsp-niveau-voordelen">${n.voordelen}</span>
    </div>`).join('');

  const catHTML = (cat, titel) => {
    const acties = Object.entries(DY.ACTIES).filter(([,v]) => v.cat === cat);
    return `<div class="dy-dsp-cat">
      <h4 class="dy-dsp-cat-titel">${titel}</h4>
      ${acties.map(([,v]) => `
        <div class="dy-dsp-actie-rij">
          <span class="dy-dsp-actie-label">${v.label}</span>
          <div class="dy-dsp-actie-rechts">
            <span class="dy-dsp-pts">+${v.pts}</span>
            ${v.limit ? `<span class="dy-dsp-limit">${v.limit}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
  };

  main.innerHTML = `
    <div class="dy-dsp-wrap">
      <h1 class="dy-page-title">DSP <em>Punten</em></h1>
      <p class="dy-page-sub">DoubleYou Status Punten — jouw betrokkenheid beloond.</p>
      <div class="dy-dsp-uitleg-kaart">
        <div class="dy-dsp-uitleg-item">
          <span class="dy-dsp-uitleg-icon">🏆</span>
          <div><strong>Lifetime niveau</strong><p>Stijgt nooit terug. Eenmaal Ambassador, altijd Ambassador.</p></div>
        </div>
        <div class="dy-dsp-uitleg-item">
          <span class="dy-dsp-uitleg-icon">⭐</span>
          <div><strong>Seizoenspunten</strong><p>Reset elk nieuw seizoen. Bepalen je voordelen dit seizoen.</p></div>
        </div>
      </div>
      <h3 class="dy-dsp-sectie-titel">Lifetime niveaus</h3>
      <div class="dy-dsp-niveaus">${niveauHTML}</div>
      <h3 class="dy-dsp-sectie-titel">Punten verdienen</h3>
      ${catHTML('community', '💬 Community')}
      ${catHTML('aankoop', '🛍️ Aankopen')}
      ${catHTML('meedenken', '💡 Meedenken')}
      ${catHTML('loyaliteit', '🔥 Loyaliteit')}
      <p class="dy-dsp-disclaimer">DSP punten hebben geen geldswaarde. DoubleYou behoudt het recht het systeem aan te passen.</p>
    </div>`;
};

// ── HELPERS ────────────────────────────────────────────────────────
DY.tijdGeleden = function(date) {
  if (!date || isNaN(date)) return '';
  const seconden = Math.floor((new Date() - date) / 1000);
  if (seconden < 60) return 'zojuist';
  if (seconden < 3600) return `${Math.floor(seconden/60)} min geleden`;
  if (seconden < 86400) return `${Math.floor(seconden/3600)} uur geleden`;
  if (seconden < 604800) return `${Math.floor(seconden/86400)} dagen geleden`;
  return date.toLocaleDateString('nl-NL');
};

DY.truncate = function(tekst, max) {
  if (!tekst) return '';
  if (tekst.length <= max) return tekst;
  return tekst.slice(0, max).trim() + '...';
};

DY.toggleLike = async function(verhaalId, btn) {
  if (!DY.user) { DY.navigeer('login'); return; }
  if (!verhaalId) return;
  btn.disabled = true;
  try {
    const ref = DY.db.collection('stories').doc(verhaalId);
    const snap = await ref.get();
    if (!snap.exists) { btn.disabled = false; return; }
    const data = snap.data();
    const uid = DY.user.uid;
    const likesObj = (data.likes && typeof data.likes === 'object') ? data.likes : {};
    const liked = likesObj[uid] === true;

    // Update alleen het likes veld — geen userId check nodig in de rule
    const updateData = {};
    updateData[`likes.${uid}`] = liked ? firebase.firestore.FieldValue.delete() : true;
    await ref.update(updateData);

    const nieuweCount = Math.max(0, Object.keys(likesObj).length + (liked ? -1 : 1));
    btn.classList.toggle('liked', !liked);
    const span = btn.querySelector('span');
    if (span) span.textContent = nieuweCount;

    if (!liked && nieuweCount === 5) await DY.geefPunten('likes_5', { verhaal_id: verhaalId });
    if (!liked && nieuweCount === 20) await DY.geefPunten('likes_20', { verhaal_id: verhaalId });
  } catch(e) {
    console.error('Like fout:', e);
  }
  btn.disabled = false;
};

DY.toonPuntenMelding = function(pts, label) {
  const el = document.createElement('div');
  el.className = 'dy-toast dy-toast-dsp';
  el.innerHTML = `<span class="dy-toast-pts">+${pts} DSP</span><span class="dy-toast-label">${label}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('visible'), 10);
  setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 400); }, 3000);
};

// Service Worker — correct pad voor root deploy
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(e => console.log('SW:', e));
}

// ── WINKEL ─────────────────────────────────────────────────────────
DY.renderWinkel = function() {
  const main = document.getElementById('dy-main');
  const p = DY.profile || {};
  const niveau = DY.getNiveau(p.dsp_lifetime || 0);

  main.innerHTML = `
    <div class="dy-winkel-wrap">
      <div class="dy-feed-header">
        <div class="dy-feed-header-inner">
          <div>
            <h1 class="dy-page-title">De <em>Winkel</em></h1>
            <p class="dy-page-sub">Kleding gemaakt voor jouw maat. Eindelijk.</p>
          </div>
        </div>
      </div>

      ${DY.user ? `
      <div class="dy-winkel-dsp-banner">
        <div class="dy-winkel-dsp-niveau">
          <span class="dy-winkel-dsp-emoji">${niveau.emoji}</span>
          <div>
            <strong>${niveau.naam}</strong>
            <span>${p.dsp_lifetime || 0} lifetime DSP</span>
          </div>
        </div>
        <div class="dy-winkel-dsp-info">
          <p>Elke aankoop levert automatisch DSP punten op.</p>
          <p class="dy-winkel-dsp-detail">Eerste aankoop: <strong>+100 DSP</strong> · Volgende bestellingen: <strong>+75 DSP</strong><br>Boven €100: <strong>+25 DSP</strong> extra · Boven €150: <strong>+50 DSP</strong> extra</p>
        </div>
      </div>` : ''}

      <div class="dy-winkel-acties">
        <a class="dy-winkel-btn-primary" href="https://doubleyoufashion.nl" target="_blank">
          <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-8.9-5h11.45l1.44-8H5.21L4.27 2H1v2h2l3.6 11z"/></svg>
          Naar de webshop
        </a>
        ${DY.user ? `<button class="dy-winkel-btn-secondary" onclick="DY.toonBestellingen()">Mijn bestellingen</button>` : ''}
      </div>

      <div class="dy-winkel-categorien">
        <h3 class="dy-winkel-cat-titel">Collectie</h3>
        <div class="dy-winkel-cat-grid">
          <a class="dy-winkel-cat-kaart" href="https://doubleyoufashion.nl/collections/tall" target="_blank">
            <div class="dy-winkel-cat-icon">📏</div>
            <strong>Tall</strong>
            <span>1.85m en langer</span>
          </a>
          <a class="dy-winkel-cat-kaart" href="https://doubleyoufashion.nl/collections/plus-size" target="_blank">
            <div class="dy-winkel-cat-icon">✨</div>
            <strong>Plus Size</strong>
            <span>XL tot 5XL</span>
          </a>
          <a class="dy-winkel-cat-kaart" href="https://doubleyoufashion.nl/collections/nieuw" target="_blank">
            <div class="dy-winkel-cat-icon">🆕</div>
            <strong>Nieuw</strong>
            <span>Laatste collectie</span>
          </a>
          <a class="dy-winkel-cat-kaart" href="https://doubleyoufashion.nl/collections/sale" target="_blank">
            <div class="dy-winkel-cat-icon">🏷️</div>
            <strong>Sale</strong>
            <span>Voordelig winkelen</span>
          </a>
        </div>
      </div>

      <div id="dy-bestellingen-sectie" style="display:none" class="dy-bestellingen-wrap">
        <h3 class="dy-winkel-cat-titel">Mijn bestellingen</h3>
        <div id="dy-bestellingen-lijst">
          <div class="dy-loader"><div class="dy-spinner"></div></div>
        </div>
      </div>

      <div class="dy-winkel-dsp-uitleg">
        <h3 class="dy-winkel-cat-titel">DSP punten bij aankopen</h3>
        <div class="dy-winkel-dsp-tabel">
          <div class="dy-winkel-dsp-rij"><span>Eerste aankoop</span><span class="dy-winkel-dsp-pts">+100 DSP</span></div>
          <div class="dy-winkel-dsp-rij"><span>Elke volgende bestelling</span><span class="dy-winkel-dsp-pts">+75 DSP</span></div>
          <div class="dy-winkel-dsp-rij"><span>Bestelling boven €100</span><span class="dy-winkel-dsp-pts">+25 DSP</span></div>
          <div class="dy-winkel-dsp-rij"><span>Bestelling boven €150</span><span class="dy-winkel-dsp-pts">+50 DSP</span></div>
          <div class="dy-winkel-dsp-rij"><span>Product review plaatsen</span><span class="dy-winkel-dsp-pts">+20 DSP</span></div>
          <div class="dy-winkel-dsp-rij"><span>Review met foto</span><span class="dy-winkel-dsp-pts">+40 DSP</span></div>
          <div class="dy-winkel-dsp-rij"><span>Wishlist item toegevoegd</span><span class="dy-winkel-dsp-pts">+5 DSP</span></div>
          <div class="dy-winkel-dsp-rij"><span>Wishlist item gekocht</span><span class="dy-winkel-dsp-pts">+20 DSP</span></div>
        </div>
        <p class="dy-dsp-disclaimer">Punten worden automatisch bijgeschreven na betaling via Shopify.</p>
      </div>
    </div>`;
};

DY.toonBestellingen = async function() {
  const sectie = document.getElementById('dy-bestellingen-sectie');
  sectie.style.display = 'block';
  sectie.scrollIntoView({ behavior: 'smooth' });
  const lijst = document.getElementById('dy-bestellingen-lijst');

  try {
    // Haal bestellingen op uit Firebase dsp_log (worden bijgeschreven door webhook)
    const snap = await DY.db.collection('dsp_log')
      .where('uid', '==', DY.user.uid)
      .where('actie', 'in', ['eerste_aankoop', 'aankoop_volgend'])
      .limit(20)
      .get();

    if (snap.empty) {
      lijst.innerHTML = `
        <div class="dy-bestelling-leeg">
          <p>Nog geen bestellingen gevonden.</p>
          <p class="dy-bestelling-leeg-sub">Je DSP punten worden automatisch bijgeschreven zodra je een aankoop doet op doubleyoufashion.nl met dit e-mailadres: <strong>${DY.user.email}</strong></p>
          <a class="dy-winkel-btn-primary" href="https://doubleyoufashion.nl" target="_blank" style="display:inline-flex;margin-top:12px">Naar de webshop</a>
        </div>`;
      return;
    }

    const bestellingen = [];
    snap.forEach(doc => bestellingen.push(doc.data()));
    bestellingen.sort((a, b) => {
      const da = a.ts?.toDate ? a.ts.toDate() : new Date(a.ts || 0);
      const db = b.ts?.toDate ? b.ts.toDate() : new Date(b.ts || 0);
      return db - da;
    });

    lijst.innerHTML = bestellingen.map(b => `
      <div class="dy-bestelling-kaart">
        <div class="dy-bestelling-header">
          <span class="dy-bestelling-nummer">Bestelling #${b.orderNummer || '—'}</span>
          <span class="dy-bestelling-pts">+${b.pts} DSP</span>
        </div>
        <div class="dy-bestelling-meta">
          ${b.orderBedrag ? `<span>€${parseFloat(b.orderBedrag).toFixed(2)}</span>` : ''}
          <span>${DY.tijdGeleden(b.ts?.toDate ? b.ts.toDate() : new Date(b.ts || 0))}</span>
        </div>
      </div>`).join('');
  } catch(e) {
    lijst.innerHTML = '<p class="dy-leeg-tekst">Bestellingen konden niet worden geladen.</p>';
    console.error(e);
  }
};
