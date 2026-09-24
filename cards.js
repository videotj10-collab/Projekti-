/* Lompakko — korttien ja kauppiaiden demodata.
 *
 * HUOM: kaikki kortit ja tapahtumat ovat simuloituja. Mitään oikeaa
 * maksuliikennettä ei tapahdu eikä sovellus ole yhteydessä mihinkään pankkiin.
 */
(function (global) {
  'use strict';

  // Demolompakon kortit. Kortin visuaalinen paikka pinossa tulee indeksistä.
  var CARDS = [
    { id: 'card-musta',   issuer: 'Musta kortti',   holder: 'M. Grönqvist', last4: '4471', network: 'PAY' },
    { id: 'card-hopea',   issuer: 'Hopea kortti',   holder: 'M. Grönqvist', last4: '8823', network: 'PAY' },
    { id: 'card-pronssi', issuer: 'Pronssi kortti', holder: 'M. Grönqvist', last4: '1092', network: 'PAY' }
  ];

  // Kauppiaat, joita satunnaiset maksut käyttävät.
  var MERCHANTS = [
    { name: 'Kahvila Aalto',      icon: '☕',  min: 3.2,  max: 8.9 },
    { name: 'R-kioski',           icon: '🛒', min: 2,    max: 14 },
    { name: 'Ravintola Nokka',    icon: '🍽️', min: 14,   max: 38 },
    { name: 'HSL-lippu',          icon: '🚋', min: 2.95, max: 2.95 },
    { name: 'K-Market',           icon: '🛍️', min: 6,    max: 42 },
    { name: 'Parkkiautomaatti',   icon: '🅿️', min: 2,    max: 9 },
    { name: 'Apteekki',           icon: '💊', min: 4,    max: 22 }
  ];

  function randomMerchant() {
    var m = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
    var amount = Math.round((m.min + Math.random() * (m.max - m.min)) * 100) / 100;
    return { name: m.name, icon: m.icon, amount: amount };
  }

  global.WalletCards = {
    CARDS: CARDS,
    MERCHANTS: MERCHANTS,
    randomMerchant: randomMerchant
  };
})(window);
