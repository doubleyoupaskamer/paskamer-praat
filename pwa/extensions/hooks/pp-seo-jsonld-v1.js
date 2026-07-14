/* PASKAMER PRAAT - SEO Structured Data Extension (v1.0.0)
 *
 * Injecteert additief FAQPage + BreadcrumbList + ItemList JSON-LD in
 * de <head> zodat Google/AI-Overviews betere entity-recognition kunnen
 * doen. Bestaande JSON-LD (Organization, WebSite, WebApplication,
 * SoftwareApplication) blijft ongewijzigd.
 *
 * Ook: injecteer semantische entity-rijke <noscript>-content zodat
 * crawlers die geen JS renderen alsnog de kernboodschap vinden.
 *
 * 100% additief. Raakt geen bestaande code aan.
 */
(function () {
  'use strict';

  var SCRIPT_ID = 'pp-seo-extra-jsonld';
  if (document.getElementById(SCRIPT_ID)) return;

  var faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": "https://paskamerpraat.nl/#faq",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Wat is Paskamerpraat?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Paskamerpraat is een gratis Nederlandse fashion community speciaal voor tall (1.85m en langer) en plus size (XL tot 5XL) mensen. Deel eerlijke pasvorm reviews, ontdek outfit inspiratie van mensen met jouw lengte en bouw, en gebruik AI stijladvies voor persoonlijke tips."
        }
      },
      {
        "@type": "Question",
        "name": "Voor wie is Paskamerpraat bedoeld?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Paskamerpraat is bedoeld voor tall (1.85m+) mannen en vrouwen en voor plus size (XL, XXL, 3XL, 4XL, 5XL) fashion liefhebbers in Nederland. Iedereen die worstelt met pasvorm bij standaard maten vindt hier inspiratie en advies van gelijkgestemden."
        }
      },
      {
        "@type": "Question",
        "name": "Wat is de DoubleYou webshop?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "DoubleYou is het Nederlandse modemerk achter Paskamerpraat. Het maakt kleding speciaal voor tall en plus size mensen, geproduceerd in samenwerking met Nederlandse ateliers. De webshop is te bereiken via www.doubleyoufashion.nl."
        }
      },
      {
        "@type": "Question",
        "name": "Kost Paskamerpraat geld?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Paskamerpraat is 100% gratis. Aanmelden, reviews plaatsen, outfit inspiratie bekijken en de community volgen kost niets. Premium AI-features (zoals de Outfit Vergelijker en AI Stylist) hebben een gratis quotum en optionele upgrade."
        }
      },
      {
        "@type": "Question",
        "name": "Hoe werken de pasvorm reviews?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Community leden delen eerlijke ervaringen over hoe kleding past bij hun lengte, gewicht en lichaamsvorm. Filter op jouw maat en bouw om reviews te vinden van mensen die op jou lijken. Zo weet je vooraf of een kledingstuk echt gaat passen."
        }
      },
      {
        "@type": "Question",
        "name": "Wat is de AI Outfit Vergelijker?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "De AI Outfit Vergelijker analyseert twee outfits op basis van pasvorm, kleurcombinatie en stijl. Handig als je twijfelt tussen kledingstukken. De AI geeft een persoonlijke score en concrete verbetertips voor tall en plus size lichamen."
        }
      },
      {
        "@type": "Question",
        "name": "Kan ik als merk aansluiten bij Paskamerpraat?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Ja, via het Merkenportaal kunnen fashion merken die op inclusiviteit inzetten (tall, plus size, aanpasbare maten) een merkprofiel aanvragen. Leden kunnen jouw merk reviewen en volgen. Aanmelden via de brand-register pagina."
        }
      }
    ]
  };

  var breadcrumbHome = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": "https://paskamerpraat.nl/#breadcrumb-home",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://paskamerpraat.nl/"
      }
    ]
  };

  var communityList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": "https://paskamerpraat.nl/#community-features",
    "name": "Paskamerpraat community functies",
    "description": "Overzicht van alle community-functies binnen Paskamerpraat voor tall en plus size fashion liefhebbers.",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Community Feed", "url": "https://paskamerpraat.nl/feed" },
      { "@type": "ListItem", "position": 2, "name": "Outfit Inspiratie Lookbook", "url": "https://paskamerpraat.nl/looks" },
      { "@type": "ListItem", "position": 3, "name": "Pasvorm Reviews", "url": "https://paskamerpraat.nl/reviews" },
      { "@type": "ListItem", "position": 4, "name": "Merkenportaal", "url": "https://paskamerpraat.nl/merken" },
      { "@type": "ListItem", "position": 5, "name": "Wekelijkse Challenges", "url": "https://paskamerpraat.nl/challenges" },
      { "@type": "ListItem", "position": 6, "name": "Post van de Week", "url": "https://paskamerpraat.nl/post-van-de-week" },
      { "@type": "ListItem", "position": 7, "name": "AI Outfit Vergelijker", "url": "https://paskamerpraat.nl/outfit-vergelijker" },
      { "@type": "ListItem", "position": 8, "name": "AI Stijladvies", "url": "https://paskamerpraat.nl/ai-stijladvies" },
      { "@type": "ListItem", "position": 9, "name": "Kleuranalyse", "url": "https://paskamerpraat.nl/kleuranalyse" },
      { "@type": "ListItem", "position": 10, "name": "Webshop Reviews", "url": "https://paskamerpraat.nl/webshop-reviews" }
    ]
  };

  var wrapper = document.createElement('script');
  wrapper.id = SCRIPT_ID;
  wrapper.type = 'application/ld+json';
  wrapper.textContent = JSON.stringify([faqPage, breadcrumbHome, communityList]);
  (document.head || document.documentElement).appendChild(wrapper);
})();
