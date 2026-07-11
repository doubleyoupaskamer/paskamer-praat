/* PASKAMER PRAAT. DoubleYou Webshop Reviews (v1.0.0)
 * Aparte pagina voor webshop bestelervaringen. EIGEN Firestore collection
 * 'webshop_reviews' zodat er geen gedeelde data is met tall/plus pasvorm
 * reviews of merkenportaal reviews.
 * Toegang: ?pagina=webshop_reviews of #webshop-reviews
 * 100% additief. Geen legacy code gewijzigd.
 */
(function () {
  'use strict';
  var COLL = 'webshop_reviews';
  var CATS = [
    { id:'bestelling', label:'Bestelling' },
    { id:'verzending', label:'Verzending' },
    { id:'klantenservice', label:'Klantenservice' },
    { id:'levering', label:'Levering' },
    { id:'retourproces', label:'Retourproces' },
    { id:'gebruikservaring', label:'Gebruikservaring' }
  ];
  function auth(){ try{return firebase.auth();}catch(_){return null;} }
  function db(){ try{return firebase.firestore();}catch(_){return null;} }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmt(ts){try{var d=ts&&ts.toDate?ts.toDate():ts?new Date(ts):null;return d&&!isNaN(d)?d.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}):'';}catch(_){return '';}}
  function stars(n,sz){sz=sz||14;var o='';for(var i=1;i<=5;i++){o+='<svg viewBox="0 0 24 24" width="'+sz+'" height="'+sz+'" fill="'+(i<=n?'#f0b340':'rgba(253,245,227,0.2)')+'"><path d="M12 2l3.09 6.26 6.91 1-5 4.87 1.18 6.87L12 17.77 5.82 21l1.18-6.87-5-4.87 6.91-1z"/></svg>';}return o;}
  function catLabel(id){for(var i=0;i<CATS.length;i++)if(CATS[i].id===id)return CATS[i].label;return id||'';}
  function isGuest(){try{var u=auth()&&auth().currentUser;return !u||u.isAnonymous===true;}catch(_){return true;}}
  function requireLogin(){
    if(window.PP_AiGuard&&typeof PP_AiGuard.check==='function'){try{PP_AiGuard.check();}catch(_){}}
    else if(window.DY&&DY.auth&&typeof DY.auth.open==='function'){try{DY.auth.open();}catch(_){}}
  }

  function render(host){
    host.innerHTML =
      '<div class="pp-wsr-wrap" data-testid="pp-webshop-reviews-page">'+
        '<header class="pp-wsr-header">'+
          '<div class="pp-wsr-label">DOUBLEYOU</div>'+
          '<h1 class="pp-wsr-titel">Webshop <em>Reviews</em></h1>'+
          '<p class="pp-wsr-desc">Ervaringen met de DoubleYou webshop: bestellen, verzending, klantenservice, levering en retour.</p>'+
          '<button type="button" class="pp-wsr-nieuw" data-role="open" data-testid="pp-wsr-open-btn">+ Plaats webshop review</button>'+
        '</header>'+
        '<section id="pp-wsr-stats" data-testid="pp-wsr-stats"></section>'+
        '<section class="pp-wsr-lijst" id="pp-wsr-lijst" data-testid="pp-wsr-lijst"><div class="pp-wsr-loading">Reviews laden...</div></section>'+
      '</div>';
    host.addEventListener('click',function(e){
      if(e.target&&e.target.getAttribute&&e.target.getAttribute('data-role')==='open'){
        if(isGuest()){requireLogin();return;}
        openSubmit();
      }
    });
    loadReviews();
  }

  function renderStats(docs){
    var el=document.getElementById('pp-wsr-stats');if(!el)return;
    if(!docs.length){el.innerHTML='';return;}
    var sum=0,n=0;docs.forEach(function(d){var r=(d.data()||{}).rating||0;if(r>0){sum+=r;n++;}});
    var g=n?sum/n:0;
    el.innerHTML='<div class="pp-wsr-avg"><span class="pp-wsr-avg-num" data-testid="pp-wsr-avg-num">'+g.toFixed(1)+'</span><span>'+stars(Math.round(g),16)+'</span><span class="pp-wsr-avg-count">op basis van <strong>'+docs.length+'</strong> '+(docs.length===1?'review':'reviews')+'</span></div>';
  }

  async function loadReviews(){
    var lijst=document.getElementById('pp-wsr-lijst');if(!lijst)return;
    var d=db();if(!d){lijst.innerHTML='<div class="pp-wsr-empty">Kon reviews niet laden.</div>';return;}
    try{
      var snap=await d.collection(COLL).orderBy('ts','desc').limit(100).get();
      var docs=snap.docs||[];
      renderStats(docs);
      if(!docs.length){lijst.innerHTML='<div class="pp-wsr-empty" data-testid="pp-wsr-empty">Nog geen webshop reviews. Wees de eerste!</div>';return;}
      lijst.innerHTML=docs.map(function(dc){
        var r=dc.data()||{};
        return '<article class="pp-wsr-kaart" data-testid="pp-wsr-review-card">'+
          '<div class="pp-wsr-k-top"><div class="pp-wsr-k-auteur" data-pp-live-name data-pp-uid="'+esc(r.userId||'')+'">'+esc(r.authorName||'Anoniem')+'</div><div class="pp-wsr-k-datum">'+esc(fmt(r.ts))+'</div></div>'+
          '<div class="pp-wsr-k-stars">'+stars(r.rating||0,15)+'</div>'+
          (r.categorie?'<div class="pp-wsr-k-cat">'+esc(catLabel(r.categorie))+'</div>':'')+
          '<p class="pp-wsr-k-tekst">'+esc(r.tekst||'')+'</p>'+
        '</article>';
      }).join('');
    }catch(e){lijst.innerHTML='<div class="pp-wsr-empty">Kon reviews niet laden.</div>';}
  }

  function openSubmit(){
    if(document.getElementById('pp-wsr-modal'))return;
    var m=document.createElement('div');
    m.id='pp-wsr-modal';m.className='pp-wsr-modal';m.setAttribute('role','dialog');m.setAttribute('data-testid','pp-wsr-submit-modal');
    m.innerHTML='<div class="pp-wsr-modal-inner">'+
      '<button type="button" class="pp-wsr-close" data-role="close" aria-label="Sluiten" data-testid="pp-wsr-close">&times;</button>'+
      '<h2>Plaats webshop review</h2>'+
      '<p class="pp-wsr-modal-sub">Deel je ervaring met de DoubleYou webshop.</p>'+
      '<label class="pp-wsr-lbl">Beoordeling</label>'+
      '<div class="pp-wsr-star-picker" id="pp-wsr-star-picker" data-testid="pp-wsr-star-picker">'+
        [1,2,3,4,5].map(function(i){return '<button type="button" data-star="'+i+'" data-testid="pp-wsr-star-'+i+'" aria-label="'+i+' sterren">'+stars(i,20)+'</button>';}).join('')+
      '</div>'+
      '<label class="pp-wsr-lbl" for="pp-wsr-cat">Categorie</label>'+
      '<select id="pp-wsr-cat" data-testid="pp-wsr-cat">'+CATS.map(function(c){return '<option value="'+c.id+'">'+c.label+'</option>';}).join('')+'</select>'+
      '<label class="pp-wsr-lbl" for="pp-wsr-tekst">Je ervaring</label>'+
      '<textarea id="pp-wsr-tekst" rows="4" placeholder="Wat ging goed of kon beter? (min 10 tekens)" data-testid="pp-wsr-tekst"></textarea>'+
      '<div class="pp-wsr-error" id="pp-wsr-err" data-testid="pp-wsr-err"></div>'+
      '<div class="pp-wsr-modal-acts">'+
        '<button type="button" class="pp-wsr-btn pp-wsr-btn-ghost" data-role="close" data-testid="pp-wsr-cancel">Annuleer</button>'+
        '<button type="button" class="pp-wsr-btn pp-wsr-btn-primair" data-role="submit" data-testid="pp-wsr-submit">Plaatsen</button>'+
      '</div>'+
    '</div>';
    document.body.appendChild(m);
    var rating=0;
    m.querySelector('#pp-wsr-star-picker').addEventListener('click',function(e){
      var t=e.target.closest('[data-star]');if(!t)return;
      rating=parseInt(t.getAttribute('data-star'),10)||0;
      Array.from(this.querySelectorAll('[data-star]')).forEach(function(b){b.classList.toggle('active',parseInt(b.getAttribute('data-star'),10)<=rating);});
    });
    m.addEventListener('click',function(e){
      var r=e.target&&e.target.getAttribute&&e.target.getAttribute('data-role');
      if(r==='close'||e.target===m){closeSubmit();}
      else if(r==='submit'){doSubmit(rating);}
    });
  }
  function closeSubmit(){var m=document.getElementById('pp-wsr-modal');if(m&&m.parentNode)m.parentNode.removeChild(m);}

  async function doSubmit(rating){
    var err=document.getElementById('pp-wsr-err');err.textContent='';
    if(isGuest()){requireLogin();return;}
    var tekst=(document.getElementById('pp-wsr-tekst').value||'').trim();
    var cat=document.getElementById('pp-wsr-cat').value;
    if(!rating){err.textContent='Kies een beoordeling (1-5 sterren).';return;}
    if(tekst.length<10){err.textContent='Vul minimaal 10 tekens in.';return;}
    var d=db();var u=auth().currentUser;
    if(!d||!u){err.textContent='Niet ingelogd.';return;}
    var data={
      userId:u.uid,
      authorName:u.displayName||(u.email?u.email.split('@')[0]:'Gebruiker'),
      reviewType:'webshop',
      rating:rating,categorie:cat,tekst:tekst,
      ts:firebase.firestore.FieldValue.serverTimestamp()
    };
    try{
      var btn=document.querySelector('[data-role="submit"]');if(btn){btn.disabled=true;btn.textContent='Plaatsen...';}
      await d.collection(COLL).add(data);
      closeSubmit();loadReviews();
    }catch(e){err.textContent='Opslaan mislukt.';}
  }

  function isOnRoute(){
    try{
      var qs=new URLSearchParams(location.search||'');
      var page=(qs.get('pagina')||'').toLowerCase();
      if(page==='webshop_reviews'||page==='webshop-reviews')return true;
      var p=(location.pathname||'').toLowerCase();
      var h=(location.hash||'').toLowerCase();
      return /webshop[_-]reviews/.test(p)||/webshop[_-]reviews/.test(h);
    }catch(_){return false;}
  }
  function mount(){
    if(!isOnRoute()||document.getElementById('pp-wsr-root'))return;
    var main=document.getElementById('main')||document.querySelector('main')||document.getElementById('dy-main')||document.querySelector('#app')||document.body;
    if(!main)return;
    var root=document.createElement('div');root.id='pp-wsr-root';root.setAttribute('data-testid','pp-webshop-reviews-root');
    main.appendChild(root);render(root);
  }
  function unmount(){var el=document.getElementById('pp-wsr-root');if(el&&el.parentNode)el.parentNode.removeChild(el);}
  function onRoute(){if(isOnRoute())mount();else unmount();}

  window.addEventListener('popstate',onRoute);
  window.addEventListener('hashchange',onRoute);
  window.addEventListener('load',onRoute);
  if(document.readyState==='complete'||document.readyState==='interactive'){setTimeout(onRoute,100);}

  window.PP_WebshopReviews={
    VERSION:'1.0.0',COLLECTION:COLL,
    open:function(){location.hash='#webshop-reviews';onRoute();},
    mount:mount,unmount:unmount
  };
})();
