/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Topup "Binnenkort Beschikbaar" Popup (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Gedeelde popup voor zowel B2B merkenwallet als B2C gebruikerswallet.
 * Wordt aangeroepen via PP_TopupComingSoon.show(context).
 *
 * Context: { naam, prijs, valuta, source: 'b2b' | 'b2c' }
 *
 * Inhoud:
 *   - "Binnenkort beschikbaar"
 *   - "Volg ons op Instagram @paskamerpraat"
 *   - "Bezoek doubleyoufashion.nl"
 *
 * Native huisstijl-conform, mobile-first, geen externe dependencies.
 * Bestaande wallet-componenten worden niet aangepast.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_TopupComingSoon) return;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function injectStyles() {
    if (document.getElementById('pp-topup-cs-styles')) return;
    var css =
      '.pp-topup-cs-overlay{position:fixed;inset:0;background:rgba(10,8,6,0.78);' +
        'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
        'z-index:9999;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;box-sizing:border-box;animation:ppTopupCsFade 0.18s ease-out}' +
      '@keyframes ppTopupCsFade{from{opacity:0}to{opacity:1}}' +
      '@keyframes ppTopupCsPop{from{opacity:0;transform:translateY(8px) scale(0.97)}' +
        'to{opacity:1;transform:translateY(0) scale(1)}}' +
      '.pp-topup-cs-dialog{position:relative;background:#1a140e;' +
        'border:1px solid rgba(212,145,10,0.4);border-radius:16px;' +
        'max-width:420px;width:100%;padding:28px 24px 24px;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.5);box-sizing:border-box;' +
        'animation:ppTopupCsPop 0.22s ease-out}' +
      '.pp-topup-cs-close{position:absolute;top:10px;right:10px;width:34px;height:34px;' +
        'background:transparent;border:none;color:rgba(245,233,216,0.6);font-size:24px;' +
        'cursor:pointer;border-radius:8px;display:flex;align-items:center;' +
        'justify-content:center;transition:background 0.15s,color 0.15s;line-height:1}' +
      '.pp-topup-cs-close:hover{background:rgba(255,255,255,0.05);color:#f5e9d8}' +
      '.pp-topup-cs-icon{width:56px;height:56px;border-radius:50%;' +
        'background:linear-gradient(135deg,#d4910a,#a86b00);' +
        'display:flex;align-items:center;justify-content:center;margin:0 auto 14px;' +
        'box-shadow:0 6px 20px rgba(212,145,10,0.3)}' +
      '.pp-topup-cs-icon svg{width:28px;height:28px;color:#0a0806}' +
      // v1.1.0: Source-eyebrow (B2B vs B2C context-isolatie)
      '.pp-topup-cs-eyebrow{display:inline-block;font-size:10.5px;font-weight:700;' +
        'text-transform:uppercase;letter-spacing:0.14em;padding:5px 10px;' +
        'border-radius:999px;margin:0 auto 14px;text-align:center;' +
        'border:1px solid rgba(212,145,10,0.45);background:rgba(212,145,10,0.10);' +
        'color:#d4910a}' +
      '.pp-topup-cs-eyebrow-b2b{border-color:rgba(212,145,10,0.6);' +
        'background:linear-gradient(135deg,rgba(212,145,10,0.18),rgba(168,107,0,0.08));' +
        'color:#f0b340}' +
      '.pp-topup-cs-eyebrow-b2c{border-color:rgba(245,233,216,0.32);' +
        'background:rgba(245,233,216,0.06);color:rgba(245,233,216,0.85)}' +
      '.pp-topup-cs-dialog .pp-topup-cs-eyebrow{display:block;width:max-content}' +
      '.pp-topup-cs-titel{font-size:22px;font-weight:700;color:#f5e9d8;' +
        'text-align:center;margin:0 0 10px;letter-spacing:-0.01em}' +
      '.pp-topup-cs-tekst{font-size:15px;line-height:1.55;color:rgba(245,233,216,0.8);' +
        'text-align:center;margin:0 0 18px}' +
      // Voortgangsbalk
      '.pp-topup-cs-progress-wrap{margin:0 0 18px;text-align:center}' +
      '.pp-topup-cs-progress-meta{display:flex;justify-content:space-between;' +
        'align-items:baseline;margin:0 0 8px;font-size:12px;' +
        'color:rgba(245,233,216,0.65);letter-spacing:0.04em}' +
      '.pp-topup-cs-progress-label{text-transform:uppercase;font-weight:600}' +
      '.pp-topup-cs-progress-num{color:#d4910a;font-weight:700;font-size:14px;' +
        'letter-spacing:0}' +
      '.pp-topup-cs-progress-bar{position:relative;height:8px;width:100%;' +
        'background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden}' +
      '.pp-topup-cs-progress-fill{position:absolute;left:0;top:0;bottom:0;' +
        'background:linear-gradient(90deg,#a86b00,#d4910a 60%,#f0b340);' +
        'border-radius:999px;animation:ppTopupCsFill 0.9s cubic-bezier(0.22,0.61,0.36,1) forwards;' +
        'box-shadow:0 0 12px rgba(212,145,10,0.45)}' +
      '@keyframes ppTopupCsFill{from{width:0}to{width:var(--pp-cs-pct,68%)}}' +
      '.pp-topup-cs-progress-sub{margin:8px 0 0;font-size:12px;' +
        'color:rgba(245,233,216,0.5);letter-spacing:0.02em}' +
      '.pp-topup-cs-pakket{background:rgba(212,145,10,0.06);' +
        'border:1px solid rgba(212,145,10,0.2);border-radius:10px;' +
        'padding:10px 14px;text-align:center;margin:0 0 18px;font-size:13px;' +
        'color:rgba(245,233,216,0.85)}' +
      '.pp-topup-cs-pakket strong{color:#d4910a;font-weight:600}' +
      '.pp-topup-cs-divider{height:1px;background:rgba(255,255,255,0.08);' +
        'margin:18px 0 14px}' +
      '.pp-topup-cs-volgsubtitel{font-size:12px;text-transform:uppercase;' +
        'letter-spacing:0.08em;color:rgba(212,145,10,0.85);text-align:center;' +
        'margin:0 0 12px;font-weight:600}' +
      '.pp-topup-cs-links{display:flex;flex-direction:column;gap:10px}' +
      '.pp-topup-cs-link{display:flex;align-items:center;gap:12px;padding:12px 14px;' +
        'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);' +
        'border-radius:10px;color:#f5e9d8;text-decoration:none;font-size:14px;' +
        'transition:background 0.15s,border-color 0.15s,transform 0.15s}' +
      '.pp-topup-cs-link:hover{background:rgba(212,145,10,0.08);' +
        'border-color:rgba(212,145,10,0.4);transform:translateY(-1px)}' +
      '.pp-topup-cs-link-icon{flex-shrink:0;width:32px;height:32px;border-radius:8px;' +
        'background:rgba(212,145,10,0.15);display:flex;align-items:center;' +
        'justify-content:center;color:#d4910a}' +
      '.pp-topup-cs-link-icon svg{width:18px;height:18px}' +
      '.pp-topup-cs-link-body{flex:1;min-width:0}' +
      '.pp-topup-cs-link-label{font-weight:600;color:#f5e9d8;display:block}' +
      '.pp-topup-cs-link-handle{font-size:12px;color:rgba(245,233,216,0.6);' +
        'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pp-topup-cs-link-pijl{flex-shrink:0;color:rgba(245,233,216,0.4)}' +
      '.pp-topup-cs-sluit-btn{width:100%;margin-top:18px;padding:11px 16px;' +
        'background:transparent;border:1px solid rgba(255,255,255,0.12);' +
        'color:rgba(245,233,216,0.75);font-size:14px;font-weight:500;border-radius:10px;' +
        'cursor:pointer;transition:background 0.15s,border-color 0.15s}' +
      '.pp-topup-cs-sluit-btn:hover{background:rgba(255,255,255,0.04);' +
        'border-color:rgba(255,255,255,0.2);color:#f5e9d8}' +
      '@media (max-width:380px){' +
        '.pp-topup-cs-dialog{padding:24px 18px 20px}' +
        '.pp-topup-cs-titel{font-size:20px}' +
        '.pp-topup-cs-tekst{font-size:14px}' +
        '.pp-topup-cs-link{padding:11px 12px;font-size:13px}' +
      '}';
    var style = document.createElement('style');
    style.id = 'pp-topup-cs-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function close() {
    var ov = document.getElementById('pp-topup-cs-overlay');
    if (ov) {
      try { ov.remove(); } catch (e) {}
      document.body.style.overflow = '';
    }
  }

  function show(ctx) {
    injectStyles();
    close(); // voorkom dubbele overlays

    var c = ctx || {};
    var pakketLabel = '';
    if (c.naam || c.prijs != null) {
      pakketLabel =
        '<div class="pp-topup-cs-pakket" data-testid="topup-cs-pkg">' +
          (c.naam ? '<strong>' + esc(c.naam) + '</strong>' : '') +
          (c.naam && c.prijs != null ? ' · ' : '') +
          (c.prijs != null ? '€ ' + Number(c.prijs).toFixed(c.prijs % 1 === 0 ? 0 : 2) : '') +
        '</div>';
    }

    var progressPct = (c.progressPct != null) ? Math.max(0, Math.min(100, Number(c.progressPct))) : 68;
    var progressBlock =
      '<div class="pp-topup-cs-progress-wrap" data-testid="topup-cs-progress">' +
        '<div class="pp-topup-cs-progress-meta">' +
          '<span class="pp-topup-cs-progress-label">Launch voortgang</span>' +
          '<span class="pp-topup-cs-progress-num" data-testid="topup-cs-progress-pct">' + progressPct + '%</span>' +
        '</div>' +
        '<div class="pp-topup-cs-progress-bar" role="progressbar" ' +
          'aria-valuenow="' + progressPct + '" aria-valuemin="0" aria-valuemax="100" ' +
          'aria-label="Launch voortgang">' +
          '<div class="pp-topup-cs-progress-fill" style="--pp-cs-pct:' + progressPct + '%;width:' + progressPct + '%"></div>' +
        '</div>' +
        '<p class="pp-topup-cs-progress-sub">We zijn ' + progressPct + '% klaar. Launch verwacht binnenkort</p>' +
      '</div>';

    // v1.1.0 (2026-02-23): Source-aware eyebrow voor expliciete context-
    // isolatie tussen B2B merken-wallet en B2C klant-wallet. Voorkomt
    // dat een merk-gebruiker denkt dat hij de consumenten-popup ziet
    // (zelfde basis-component, andere label).
    var sourceLower = String(c.source || '').toLowerCase();
    var eyebrowLabel = '';
    var eyebrowClass = '';
    if (sourceLower === 'b2b') {
      eyebrowLabel = 'Merken Campagne Wallet';
      eyebrowClass = ' pp-topup-cs-eyebrow-b2b';
    } else if (sourceLower === 'b2c') {
      eyebrowLabel = 'Mijn Wallet';
      eyebrowClass = ' pp-topup-cs-eyebrow-b2c';
    }
    var eyebrowBlock = eyebrowLabel
      ? '<div class="pp-topup-cs-eyebrow' + eyebrowClass + '" data-testid="topup-cs-eyebrow-' + sourceLower + '">' +
          esc(eyebrowLabel) +
        '</div>'
      : '';

    var ov = document.createElement('div');
    ov.id = 'pp-topup-cs-overlay';
    ov.className = 'pp-topup-cs-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'pp-topup-cs-titel');
    ov.setAttribute('data-testid', 'topup-comingsoon-overlay');
    ov.setAttribute('data-source', String(c.source || ''));

    ov.innerHTML =
      '<div class="pp-topup-cs-dialog" data-testid="topup-comingsoon-dialog">' +
        '<button class="pp-topup-cs-close" type="button" aria-label="Sluiten" ' +
          'data-testid="topup-cs-close-x">&times;</button>' +
        eyebrowBlock +
        '<div class="pp-topup-cs-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="10"/>' +
            '<polyline points="12 6 12 12 16 14"/>' +
          '</svg>' +
        '</div>' +
        '<h2 class="pp-topup-cs-titel" id="pp-topup-cs-titel">Binnenkort beschikbaar</h2>' +
        '<p class="pp-topup-cs-tekst">' +
          'Opwaarderen is pas mogelijk na de officiële lancering. ' +
          'We zetten op dit moment de laatste puntjes op de i — heel binnenkort ' +
          'kun je hier je wallet opwaarderen.' +
        '</p>' +
        progressBlock +
        pakketLabel +
        '<div class="pp-topup-cs-divider"></div>' +
        '<p class="pp-topup-cs-volgsubtitel">Blijf op de hoogte</p>' +
        '<div class="pp-topup-cs-links">' +
          '<a class="pp-topup-cs-link" href="https://www.instagram.com/paskamerpraat" ' +
            'target="_blank" rel="noopener noreferrer" data-testid="topup-cs-instagram">' +
            '<span class="pp-topup-cs-link-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<rect x="2" y="2" width="20" height="20" rx="5"/>' +
                '<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>' +
                '<line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>' +
              '</svg>' +
            '</span>' +
            '<span class="pp-topup-cs-link-body">' +
              '<span class="pp-topup-cs-link-label">Volg ons op Instagram</span>' +
              '<span class="pp-topup-cs-link-handle">@paskamerpraat</span>' +
            '</span>' +
            '<span class="pp-topup-cs-link-pijl" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>' +
              '</svg>' +
            '</span>' +
          '</a>' +
          '<a class="pp-topup-cs-link" href="https://www.doubleyoufashion.nl" ' +
            'target="_blank" rel="noopener noreferrer" data-testid="topup-cs-website">' +
            '<span class="pp-topup-cs-link-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<circle cx="12" cy="12" r="10"/>' +
                '<line x1="2" y1="12" x2="22" y2="12"/>' +
                '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' +
              '</svg>' +
            '</span>' +
            '<span class="pp-topup-cs-link-body">' +
              '<span class="pp-topup-cs-link-label">Bezoek onze website</span>' +
              '<span class="pp-topup-cs-link-handle">www.doubleyoufashion.nl</span>' +
            '</span>' +
            '<span class="pp-topup-cs-link-pijl" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>' +
              '</svg>' +
            '</span>' +
          '</a>' +
        '</div>' +
        '<button class="pp-topup-cs-sluit-btn" type="button" ' +
          'data-testid="topup-cs-close-btn">Sluiten</button>' +
      '</div>';

    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    // Sluiters
    ov.addEventListener('click', function (e) {
      if (e.target === ov) close();
    });
    var btnX = ov.querySelector('[data-testid="topup-cs-close-x"]');
    var btnS = ov.querySelector('[data-testid="topup-cs-close-btn"]');
    if (btnX) btnX.addEventListener('click', close);
    if (btnS) btnS.addEventListener('click', close);

    // ESC-toets
    var escHandler = function (e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    return true;
  }

  window.PP_TopupComingSoon = {
    show:    show,
    close:   close,
    VERSION: '1.1.0'
  };
})();
