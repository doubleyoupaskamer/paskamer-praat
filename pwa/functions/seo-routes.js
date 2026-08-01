/* ═════════════════════════════════════════════════════════════════════
 * Paskamer Praat - SEO Route Metadata Map (v1.0.0)
 * ═════════════════════════════════════════════════════════════════════
 *
 * Per-route SEO metadata voor de Cloudflare Pages middleware. De
 * middleware injecteert deze waarden in `index.html` wanneer een bot
 * (Googlebot, Bingbot, etc.) de pagina opvraagt.
 *
 * ALLEEN publieke routes staan hier. Alle admin/account/leden paden
 * zijn UITGESLOTEN (die krijgen X-Robots-Tag: noindex via _headers).
 * ═════════════════════════════════════════════════════════════════════ */

export const SITE = {
  origin: 'https://paskamerpraat.nl',
  name:   'Paskamerpraat',
  brand:  'DoubleYou',
  locale: 'nl_NL',
  image:  'https://paskamerpraat.nl/paskamerpraat-header.png',
  twitterHandle: '@paskamerpraat'
};

/**
 * Elk item bevat:
 *   title:       <title> content (max ~60 chars aanbevolen)
 *   description: <meta name="description"> (max ~160 chars)
 *   h1:          H1 heading die in de SEO-body-block wordt gerenderd
 *   intro:       plain-text alinea onder H1 (voor bot content)
 *   image:       optionele og:image (fallback: SITE.image)
 *   crumbs:      BreadcrumbList items (excl. home; home wordt vooraan toegevoegd)
 *   ogType:      "website" | "article" | "product"
 */
export const ROUTES = {
  '/': {
    title:       'Paskamerpraat - Tall & Plus Size Fashion Community Nederland',
    description: 'Eerlijke pasvorm reviews, outfit inspiratie en AI stijladvies voor tall (1.85m+) en plus size (XL-5XL) mode in Nederland. Gratis community - deel jouw fitcheck.',
    h1:          'Paskamerpraat - Tailored for Tall & Plus Size',
    intro:       'Paskamerpraat is de gratis Nederlandse community voor tall fashion (lengte 1.85m en langer) en plus size mode (maten XL tot 5XL). Lees eerlijke pasvorm reviews van echte dragers, bekijk outfit inspiratie en gebruik onze AI-stijladvies tools.',
    crumbs:      [],
    ogType:      'website'
  },
  '/feed': {
    title:       'Community Feed - Fitchecks, Outfits & Reviews | Paskamerpraat',
    description: 'Live feed met fitchecks, outfits en pasvorm reviews van de Paskamerpraat community. Ontdek dagelijks nieuwe posts van tall en plus size mensen.',
    h1:          'Community Feed',
    intro:       'De actuele stroom van fitchecks, outfits en pasvorm reviews uit de Paskamerpraat community. Volg wat andere tall en plus size mensen dragen en welke merken echt passen.',
    crumbs:      [{ name: 'Feed', url: '/feed' }],
    ogType:      'website'
  },
  '/uitgelicht': {
    title:       'Uitgelichte Looks & Reviews van de Week | Paskamerpraat',
    description: 'De beste outfits, pasvorm reviews en fitchecks uit de Paskamerpraat community. Wekelijkse selectie van de meest inspirerende posts.',
    h1:          'Uitgelichte Looks van de Week',
    intro:       'De opvallendste outfits, waardevolle pasvorm reviews en meest gewaardeerde fitchecks van de afgelopen week. Geselecteerd door onze redactie en community.',
    crumbs:      [{ name: 'Uitgelicht', url: '/uitgelicht' }],
    ogType:      'website'
  },
  '/looks': {
    title:       'Outfit Lookbook - Inspiratie voor Tall & Plus Size | Paskamerpraat',
    description: 'Duizenden outfit foto\'s van tall en plus size dragers. Bekijk complete looks, ontdek merken en vind kleding die echt past bij jouw lengte en maat.',
    h1:          'Outfit Lookbook',
    intro:       'Blader door outfits en complete looks van de Paskamerpraat community. Filter op lengte, maat, gelegenheid en stijl. Perfect voor tall (1.85m+) en plus size (XL-5XL) inspiratie.',
    crumbs:      [{ name: 'Looks', url: '/looks' }],
    ogType:      'website'
  },
  '/lookbook': {
    title:       'Lookbook - Curated Outfits Tall & Plus Size | Paskamerpraat',
    description: 'Curated lookbook met de mooiste outfits van tall en plus size dragers. Ontdek nieuwe stijlcombinaties en bewaar jouw favoriete looks.',
    h1:          'Lookbook',
    intro:       'Onze curated lookbook toont zorgvuldig geselecteerde outfits van de community. Bewaar looks die jij mooi vindt en shop de items direct bij deelnemende webshops.',
    crumbs:      [{ name: 'Lookbook', url: '/lookbook' }],
    ogType:      'website'
  },
  '/reviews': {
    title:       'Pasvorm Reviews - Kleding die Echt Past | Paskamerpraat',
    description: 'Eerlijke pasvorm reviews voor tall en plus size mensen. Lees ervaringen per merk, product en maat voordat je online kleding koopt.',
    h1:          'Pasvorm Reviews',
    intro:       'Lees eerlijke pasvorm reviews van echte tall en plus size dragers. Filter op merk, maat, lengte en kledingstuk. Voorkom mispakkopen door de ervaringen van de community te gebruiken.',
    crumbs:      [{ name: 'Reviews', url: '/reviews' }],
    ogType:      'website'
  },
  '/webshop-reviews': {
    title:       'Webshop Reviews - Beste Online Winkels Tall & Plus Size',
    description: 'Reviews van webshops voor tall en plus size mode. Lever, retour, service en pasvormbeleid van populaire online winkels vergeleken.',
    h1:          'Webshop Reviews',
    intro:       'Welke webshops zijn echt geschikt voor tall en plus size mode? Lees ervaringen van de community over service, retourbeleid, pasvorm en levertijden.',
    crumbs:      [{ name: 'Webshop Reviews', url: '/webshop-reviews' }],
    ogType:      'website'
  },
  '/pasvorm-reviews': {
    title:       'Pasvorm Reviews per Product - Hoe Valt Deze Maat? | Paskamerpraat',
    description: 'Product-specifieke pasvorm reviews. Zie hoe kleding valt op verschillende lengtes en maten voordat je bestelt.',
    h1:          'Pasvorm Reviews per Product',
    intro:       'Bekijk pasvorm reviews per specifiek product. Ontdek per artikel hoe de maat valt en of dit geschikt is voor jouw lengte en lichaamsbouw.',
    crumbs:      [{ name: 'Pasvorm Reviews', url: '/pasvorm-reviews' }],
    ogType:      'website'
  },
  '/merken': {
    title:       'Merken Overzicht - Tall & Plus Size Kledingmerken | Paskamerpraat',
    description: 'Overzicht van kledingmerken die tall en plus size mode voeren. Lees reviews, bekijk collecties en vind jouw favoriete merk.',
    h1:          'Kledingmerken voor Tall & Plus Size',
    intro:       'Overzicht van Nederlandse en internationale merken die specifiek voor lange mensen (tall) en curvy/plus size lichamen ontwerpen. Klik door voor merk-specifieke reviews en collecties.',
    crumbs:      [{ name: 'Merken', url: '/merken' }],
    ogType:      'website'
  },
  '/merkenportaal': {
    title:       'Merkenportaal - Voor Kledingmerken | Paskamerpraat',
    description: 'Ben jij een kledingmerk voor tall of plus size? Ontdek hoe je met de Paskamerpraat community verbindt en directe pasvorm feedback ontvangt.',
    h1:          'Merkenportaal',
    intro:       'Het Paskamerpraat merkenportaal geeft kledingmerken directe toegang tot pasvorm feedback, community reviews en outfit inspiratie van tall en plus size dragers.',
    crumbs:      [{ name: 'Merkenportaal', url: '/merkenportaal' }],
    ogType:      'website'
  },
  '/winkel': {
    title:       'Winkel - Shop Tall & Plus Size Kleding | Paskamerpraat',
    description: 'Shop kleding die echt past. Bekijk aanbiedingen van tall en plus size webshops geselecteerd door de Paskamerpraat community.',
    h1:          'Winkel',
    intro:       'Geselecteerde kleding en aanbiedingen van webshops die tall en plus size mode voeren. Elk product is aanbevolen op basis van community pasvorm reviews.',
    crumbs:      [{ name: 'Winkel', url: '/winkel' }],
    ogType:      'website'
  },
  '/challenges': {
    title:       'Style Challenges - Community Wedstrijden | Paskamerpraat',
    description: 'Doe mee met stijl challenges van de Paskamerpraat community. Win prijzen en deel jouw fitcheck met tall en plus size mensen.',
    h1:          'Style Challenges',
    intro:       'Wekelijkse en maandelijkse stijl challenges waar community leden meedoen. Deel jouw outfit binnen het thema en maak kans op prijzen van partner-merken.',
    crumbs:      [{ name: 'Challenges', url: '/challenges' }],
    ogType:      'website'
  },
  '/post-van-de-week': {
    title:       'Post van de Week - Beste Community Post | Paskamerpraat',
    description: 'De winnende post van deze week uit de Paskamerpraat community. Elke week een nieuwe outfit, review of fitcheck in de spotlight.',
    h1:          'Post van de Week',
    intro:       'Elke week selecteren we de meest waardevolle post uit de community. Van een uitzonderlijke fitcheck tot een grondige pasvorm review.',
    crumbs:      [{ name: 'Post van de Week', url: '/post-van-de-week' }],
    ogType:      'website'
  },
  '/outfit-vergelijker': {
    title:       'AI Outfit Vergelijker - Kies de Beste Combinatie | Paskamerpraat',
    description: 'AI vergelijkt jouw outfit opties en geeft persoonlijk stijladvies gebaseerd op kleur, silhouet en gelegenheid. Gratis voor community leden.',
    h1:          'AI Outfit Vergelijker',
    intro:       'Upload twee of meer outfits en de AI Outfit Vergelijker helpt je kiezen welke het beste past bij jouw lichaamsbouw, kleurenpallet en de gelegenheid.',
    crumbs:      [{ name: 'AI Outfit Vergelijker', url: '/outfit-vergelijker' }],
    ogType:      'website'
  },
  '/ai-stijladvies': {
    title:       'AI Stijladvies voor Tall & Plus Size | Paskamerpraat',
    description: 'Persoonlijk AI stijladvies afgestemd op tall en plus size lichamen. Ontdek welke silhouetten en kleuren jou het beste staan.',
    h1:          'AI Stijladvies',
    intro:       'Onze AI-stylist geeft persoonlijk advies afgestemd op tall (1.85m+) en plus size lichaamsvormen. Ontvang silhouet-, kleur- en gelegenheids-tips.',
    crumbs:      [{ name: 'AI Stijladvies', url: '/ai-stijladvies' }],
    ogType:      'website'
  },
  '/kleuranalyse': {
    title:       'AI Kleuranalyse - Welke Kleuren Passen bij Jou? | Paskamerpraat',
    description: 'Ontdek jouw seizoenskleuren met de AI kleuranalyse. Persoonlijk kleurenpallet gebaseerd op huid, haar en oogkleur.',
    h1:          'AI Kleuranalyse',
    intro:       'De AI kleuranalyse berekent jouw seizoenstype (lente, zomer, herfst, winter) en toont welke kleuren jouw natuurlijke uitstraling versterken.',
    crumbs:      [{ name: 'Kleuranalyse', url: '/kleuranalyse' }],
    ogType:      'website'
  },
  '/media-generator': {
    title:       'AI Media Generator - Maak Fashion Content | Paskamerpraat',
    description: 'Genereer fashion afbeeldingen en videos met AI. Perfect voor social posts, product showcases en inspiratie.',
    h1:          'AI Media Generator',
    intro:       'Creëer eigen fashion content met behulp van AI beeld- en videogeneratie. Ideaal voor social media, productfoto\'s en outfit inspiratie.',
    crumbs:      [{ name: 'Media Generator', url: '/media-generator' }],
    ogType:      'website'
  },
  '/try-on': {
    title:       'Virtuele Paskamer - AI Try-On | Paskamerpraat',
    description: 'Probeer kleding virtueel aan met AI. Zie hoe items eruitzien op jouw lichaam voordat je bestelt.',
    h1:          'Virtuele Paskamer',
    intro:       'De virtuele paskamer gebruikt AI om kleding op jouw eigen foto te projecteren. Krijg een realistisch beeld voordat je online bestelt.',
    crumbs:      [{ name: 'Virtuele Paskamer', url: '/try-on' }],
    ogType:      'website'
  },
  '/vind-mensen': {
    title:       'Vind Mensen met Jouw Lengte & Maat | Paskamerpraat',
    description: 'Vind community leden met jouw lengte, maat en stijl. Volg dragers die passen bij jouw silhouet voor relevante outfit inspiratie.',
    h1:          'Vind Mensen',
    intro:       'Zoek en filter community leden op lengte, maat en stijlvoorkeur. Volg dragers waarvan de outfits echt relevant zijn voor jouw lichaam.',
    crumbs:      [{ name: 'Vind Mensen', url: '/vind-mensen' }],
    ogType:      'website'
  },
  '/help': {
    title:       'Help & Support | Paskamerpraat',
    description: 'Hulp nodig? Bekijk veelgestelde vragen, uitleg over features en contactopties voor de Paskamerpraat community.',
    h1:          'Help & Support',
    intro:       'Antwoord op de meest gestelde vragen over het gebruik van Paskamerpraat. Van je account beheren tot een fitcheck plaatsen.',
    crumbs:      [{ name: 'Help', url: '/help' }],
    ogType:      'website'
  },
  '/faq': {
    title:       'Veelgestelde Vragen (FAQ) | Paskamerpraat',
    description: 'Alle veelgestelde vragen over Paskamerpraat op één plek. Van pasvorm reviews plaatsen tot AI stijladvies gebruiken.',
    h1:          'Veelgestelde Vragen',
    intro:       'Antwoord op de belangrijkste vragen over Paskamerpraat, pasvorm reviews, community regels, AI features en meer.',
    crumbs:      [{ name: 'FAQ', url: '/faq' }],
    ogType:      'website'
  },
  '/over-ons': {
    title:       'Over Paskamerpraat - Onze Missie voor Tall & Plus Size',
    description: 'Paskamerpraat is opgericht om tall en plus size mensen te helpen kleding te vinden die echt past. Lees ons verhaal en missie.',
    h1:          'Over Paskamerpraat',
    intro:       'Paskamerpraat is een Nederlandse community-first platform dat tall (1.85m+) en plus size (XL-5XL) mensen helpt kleding te vinden die echt past. Ontstaan uit frustratie over ondermaatse pasvorm bij mainstream merken.',
    crumbs:      [{ name: 'Over Ons', url: '/over-ons' }],
    ogType:      'website'
  },
  '/contact': {
    title:       'Contact - Neem Contact op met Paskamerpraat',
    description: 'Vragen, feedback of samenwerking? Neem contact op met het Paskamerpraat team via het contactformulier of e-mail.',
    h1:          'Contact',
    intro:       'Vragen over Paskamerpraat, interesse in samenwerking als merk of feedback op het platform? Wij horen graag van je.',
    crumbs:      [{ name: 'Contact', url: '/contact' }],
    ogType:      'website'
  },
  '/voorwaarden': {
    title:       'Algemene Voorwaarden | Paskamerpraat',
    description: 'De algemene voorwaarden voor gebruik van Paskamerpraat, community regels en gebruikersrechten.',
    h1:          'Algemene Voorwaarden',
    intro:       'De juridische voorwaarden die gelden voor het gebruik van Paskamerpraat, inclusief community regels, aansprakelijkheid en gebruikersrechten.',
    crumbs:      [{ name: 'Voorwaarden', url: '/voorwaarden' }],
    ogType:      'website'
  },
  '/privacy': {
    title:       'Privacybeleid | Paskamerpraat',
    description: 'Zo gaat Paskamerpraat om met jouw persoonsgegevens. Volledig privacybeleid conform AVG/GDPR.',
    h1:          'Privacybeleid',
    intro:       'Ons privacybeleid legt uit welke gegevens Paskamerpraat verzamelt, waarvoor deze gebruikt worden en welke rechten je hebt onder de AVG/GDPR.',
    crumbs:      [{ name: 'Privacy', url: '/privacy' }],
    ogType:      'website'
  },
  '/community-regels': {
    title:       'Community Regels | Paskamerpraat',
    description: 'De regels voor een positieve en veilige Paskamerpraat community. Lees voordat je post of reageert.',
    h1:          'Community Regels',
    intro:       'Om Paskamerpraat een veilige en positieve plek te houden gelden er duidelijke community regels. Deze regels beschermen alle leden en waarborgen constructieve interacties.',
    crumbs:      [{ name: 'Community Regels', url: '/community-regels' }],
    ogType:      'website'
  },
  '/beta': {
    title:       'Beta Programma - Test Nieuwe Features | Paskamerpraat',
    description: 'Doe mee met het Paskamerpraat beta programma. Krijg vroegtijdige toegang tot nieuwe features en help ons het platform te verbeteren.',
    h1:          'Beta Programma',
    intro:       'Meld je aan voor het beta programma en krijg vroegtijdige toegang tot nieuwe features zoals AI stijladvies, virtuele paskamer en community tools.',
    crumbs:      [{ name: 'Beta', url: '/beta' }],
    ogType:      'website'
  },

  /* ─── LONG-TAIL SEO LANDINGSROUTES ─────────────────────────── */

  '/kleding-voor-lange-mannen': {
    title:       'Kleding voor Lange Mannen (1.85m+) - Tall Fashion NL | Paskamerpraat',
    description: 'De beste kleding voor lange mannen vanaf 1.85m. Tall broeken, jassen, overhemden en outfit inspiratie voor lengtes tot 2.10m.',
    h1:          'Kleding voor Lange Mannen',
    intro:       'Speciaal voor lange mannen (1.85m tot 2.10m+) verzamelt Paskamerpraat de beste tall merken, echte pasvorm reviews en outfit inspiratie. Vind broeken met lange pijpen, overhemden met lange mouwen en jassen met de juiste torso-lengte.',
    crumbs:      [{ name: 'Kleding voor Lange Mannen', url: '/kleding-voor-lange-mannen' }],
    ogType:      'website'
  },
  '/kleding-voor-lange-vrouwen': {
    title:       'Kleding voor Lange Vrouwen (1.80m+) - Tall Fashion | Paskamerpraat',
    description: 'Tall fashion voor lange vrouwen vanaf 1.80m. Jurken, broeken en jumpsuits met verlengde lengte, plus pasvorm reviews.',
    h1:          'Kleding voor Lange Vrouwen',
    intro:       'Kleding voor lange vrouwen (1.80m en langer) is schaars, maar Paskamerpraat verzamelt merken die wél verlengde maten voeren. Van jurken en broeken tot jumpsuits en jassen - met echte pasvorm reviews.',
    crumbs:      [{ name: 'Kleding voor Lange Vrouwen', url: '/kleding-voor-lange-vrouwen' }],
    ogType:      'website'
  },
  '/plus-size-mode': {
    title:       'Plus Size Mode (XL-5XL) - Curvy Fashion NL | Paskamerpraat',
    description: 'Plus size mode voor maten XL tot 5XL. De beste merken, pasvorm reviews en outfit inspiratie voor curvy Nederlandse dragers.',
    h1:          'Plus Size Mode',
    intro:       'Plus size mode van maat XL tot 5XL: vind merken die écht plus size ontwerpen en niet alleen "grote maten" toevoegen. Complete outfits, pasvorm reviews en styling tips voor curvy lichamen.',
    crumbs:      [{ name: 'Plus Size Mode', url: '/plus-size-mode' }],
    ogType:      'website'
  },
  '/tall-fashion-nederland': {
    title:       'Tall Fashion Nederland - Merken & Winkels | Paskamerpraat',
    description: 'Alle tall fashion merken en winkels in Nederland op één plek. Voor lengtes 1.80m tot 2.10m+.',
    h1:          'Tall Fashion Nederland',
    intro:       'Compleet overzicht van tall fashion merken en winkels in Nederland. Voor mannen en vrouwen van 1.80m tot 2.10m+. Met community reviews, pasvorm-ervaringen en actuele collecties.',
    crumbs:      [{ name: 'Tall Fashion NL', url: '/tall-fashion-nederland' }],
    ogType:      'website'
  },
  '/outfit-inspiratie': {
    title:       'Outfit Inspiratie voor Elke Gelegenheid | Paskamerpraat',
    description: 'Duizenden outfit ideeën voor werk, casual, feest en meer. Speciaal voor tall en plus size dragers.',
    h1:          'Outfit Inspiratie',
    intro:       'Op zoek naar inspiratie voor een specifieke gelegenheid? Bekijk complete outfits van de community en filter op stijl, seizoen en lichaamsvorm.',
    crumbs:      [{ name: 'Outfit Inspiratie', url: '/outfit-inspiratie' }],
    ogType:      'website'
  },
  '/duurzame-mode': {
    title:       'Duurzame Mode - Ethische Merken Tall & Plus Size | Paskamerpraat',
    description: 'Duurzame en ethische kledingmerken die tall en plus size voeren. Investeer in kleding die lang meegaat.',
    h1:          'Duurzame Mode',
    intro:       'Duurzame en ethische mode is niet altijd beschikbaar in tall en plus size maten. Paskamerpraat verzamelt de merken die het wél goed doen: eerlijke productie, kwaliteitsmaterialen en inclusieve maatvoering.',
    crumbs:      [{ name: 'Duurzame Mode', url: '/duurzame-mode' }],
    ogType:      'website'
  },
  '/capsule-wardrobe': {
    title:       'Capsule Wardrobe voor Tall & Plus Size | Paskamerpraat',
    description: 'Bouw een capsule wardrobe: 30 items, 100+ outfits. Speciaal voor tall en plus size lichamen samengesteld.',
    h1:          'Capsule Wardrobe',
    intro:       'Een capsule wardrobe is een klein, doordacht garderobe waarmee je oneindig kunt combineren. Onze gids toont welke stukken essentieel zijn voor tall en plus size lichamen.',
    crumbs:      [{ name: 'Capsule Wardrobe', url: '/capsule-wardrobe' }],
    ogType:      'website'
  }
};

/**
 * Zoekt de best passende route in ROUTES:
 * 1. Exacte match
 * 2. Match op query ?pagina=X → probeer /X
 * 3. Fallback: home '/'
 */
export function findRoute(pathname, search) {
  var p = (pathname || '/').replace(/\/+$/, '') || '/';
  if (ROUTES[p]) return { path: p, meta: ROUTES[p] };

  // Handle /voorwaarden/index.html → /voorwaarden
  if (p.endsWith('/index.html')) {
    var stripped = p.slice(0, -'/index.html'.length) || '/';
    if (ROUTES[stripped]) return { path: stripped, meta: ROUTES[stripped] };
  }

  // Handle ?pagina=X → /X
  try {
    var sp = new URLSearchParams(search || '');
    var pagina = (sp.get('pagina') || '').toLowerCase();
    if (pagina) {
      var candidate = '/' + pagina;
      if (ROUTES[candidate]) return { path: candidate, meta: ROUTES[candidate] };
    }
  } catch (_) {}

  return { path: '/', meta: ROUTES['/'] };
}
