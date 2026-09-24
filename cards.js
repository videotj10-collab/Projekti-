/* Lompakko — korttikatalogi, väripaletit ja korttien luonti.
 *
 * HUOM: Kaikki kortit ovat simuloituja demokortteja. Pankkien nimet ovat
 * pelkkää tekstiä — sovellus ei käytä oikeita logoja, tunnuksia tai
 * brändi-ilmettä eikä ole millään tavalla yhteydessä oikeisiin pankkeihin.
 * Kortinhaltijat, numerot ja saldot ovat keksittyjä.
 */
(function (global) {
  'use strict';

  /* Väripaletit. Jokainen kortti saa oman sävynsä, jotta kortit erottuvat
   * toisistaan yhdellä silmäyksellä. ink = tekstin väri kortin päällä. */
  var PALETTES = [
    { id: 'meri',           name: 'Meri',           from: '#1b4f9c', to: '#07182f', ink: '#ffffff' },
    { id: 'yo',             name: 'Yö',             from: '#3a3a3c', to: '#0a0a0a', ink: '#ffffff' },
    { id: 'metsa',          name: 'Metsä',          from: '#1f8a52', to: '#07301d', ink: '#ffffff' },
    { id: 'auringonlasku',  name: 'Auringonlasku',  from: '#f2761b', to: '#6b2504', ink: '#ffffff' },
    { id: 'turkoosi',       name: 'Turkoosi',       from: '#12a0a3', to: '#04312f', ink: '#ffffff' },
    { id: 'viini',          name: 'Viini',          from: '#8e2145', to: '#2b0a16', ink: '#ffffff' },
    { id: 'laventeli',      name: 'Laventeli',      from: '#7a68e0', to: '#211a4f', ink: '#ffffff' },
    { id: 'hopea',          name: 'Hopea',          from: '#e8e8ed', to: '#b0b0b8', ink: '#0a0a0a' }
  ];

  /* Valittavissa olevat "pankit". Nimet ovat vain tekstiä. */
  var BANKS = [
    { id: 'nordea-debit',    name: 'Nordea Debit',          network: 'DEBIT',      palette: 'meri',          types: ['Debit', 'Credit', 'Prepaid'] },
    { id: 'nordea-business', name: 'Nordea Business',       network: 'BUSINESS',   palette: 'yo',            types: ['Business', 'Credit', 'Debit'] },
    { id: 'spankki-visa',    name: 'S-Pankki Visa',         network: 'VISA',       palette: 'metsa',         types: ['Debit', 'Credit', 'Prepaid'] },
    { id: 'op-debit-mc',     name: 'OP Debit Mastercard',   network: 'MASTERCARD', palette: 'auringonlasku', types: ['Debit', 'Credit'] },
    { id: 'danske',          name: 'Danske Bank',           network: 'DEBIT',      palette: 'turkoosi',      types: ['Debit', 'Credit', 'Business'] }
  ];

  /* Keksittyjä kortinhaltijoita. */
  var HOLDERS = [
    'M. Grönqvist', 'A. Laaksonen', 'T. Virtanen', 'S. Rautio',
    'K. Nieminen', 'J. Salo', 'E. Koskinen', 'P. Hakala'
  ];

  /* Kauppiaat, joita simuloidut maksut käyttävät. */
  var MERCHANTS = [
    { name: 'Kahvila Aalto',    icon: '☕',  min: 3.2,  max: 8.9 },
    { name: 'R-kioski',         icon: '🛒', min: 2,    max: 14 },
    { name: 'Ravintola Nokka',  icon: '🍽️', min: 14,   max: 38 },
    { name: 'HSL-lippu',        icon: '🚋', min: 2.95, max: 2.95 },
    { name: 'K-Market',         icon: '🛍️', min: 6,    max: 42 },
    { name: 'Parkkiautomaatti', icon: '🅿️', min: 2,    max: 9 },
    { name: 'Apteekki',         icon: '💊', min: 4,    max: 22 },
    { name: 'Kirjakauppa Sana', icon: '📚', min: 8,    max: 45 },
    { name: 'Verkkokauppa',     icon: '📦', min: 12,   max: 120 }
  ];

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function getBank(bankId) {
    for (var i = 0; i < BANKS.length; i++) {
      if (BANKS[i].id === bankId) return BANKS[i];
    }
    return BANKS[0];
  }

  function getPalette(paletteId) {
    for (var i = 0; i < PALETTES.length; i++) {
      if (PALETTES[i].id === paletteId) return PALETTES[i];
    }
    return PALETTES[0];
  }

  function randomLast4() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  /* Voimassaoloaika 2–5 vuotta eteenpäin, muodossa KK/VV. */
  function randomExpiry() {
    var now = new Date();
    var month = 1 + Math.floor(Math.random() * 12);
    var year = now.getFullYear() + 2 + Math.floor(Math.random() * 4);
    return (month < 10 ? '0' : '') + month + '/' + String(year).slice(2);
  }

  function randomBalance(min, max) {
    return Math.round((min + Math.random() * (max - min)) * 100) / 100;
  }

  var idCounter = 0;
  function newId() {
    idCounter += 1;
    return 'k' + Date.now().toString(36) + idCounter.toString(36);
  }

  /* Luo uuden kortin. Puuttuvat tiedot arvotaan. */
  function createCard(opts) {
    opts = opts || {};
    var bank = getBank(opts.bankId);
    return {
      id: newId(),
      bankId: bank.id,
      type: opts.type || bank.types[0],
      label: (opts.label || '').trim() || bank.name,
      paletteId: opts.paletteId || bank.palette,
      holder: opts.holder || pick(HOLDERS),
      last4: randomLast4(),
      expiry: randomExpiry(),
      balance: typeof opts.balance === 'number' ? opts.balance : randomBalance(40, 2400),
      frozen: false,
      limit: null
    };
  }

  /* Lompakon aloituskortit. */
  function defaultCards() {
    var holder = HOLDERS[0];
    return [
      createCard({ bankId: 'nordea-debit',    type: 'Debit',    label: 'Käyttötili',   holder: holder, balance: 247.5 }),
      createCard({ bankId: 'spankki-visa',    type: 'Credit',   label: 'Ostokset',     holder: holder, balance: 1180.4 }),
      createCard({ bankId: 'nordea-business', type: 'Business', label: 'Yrityskortti', holder: holder, balance: 3620 })
    ];
  }

  function randomMerchant() {
    var m = pick(MERCHANTS);
    return {
      name: m.name,
      icon: m.icon,
      amount: Math.round((m.min + Math.random() * (m.max - m.min)) * 100) / 100
    };
  }

  global.WalletCards = {
    PALETTES: PALETTES,
    BANKS: BANKS,
    HOLDERS: HOLDERS,
    MERCHANTS: MERCHANTS,
    getBank: getBank,
    getPalette: getPalette,
    createCard: createCard,
    defaultCards: defaultCards,
    randomMerchant: randomMerchant
  };
})(window);
