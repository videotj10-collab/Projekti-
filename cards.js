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
    { id: 'metsa',          name: 'Metsä',          from: '#1d844e', to: '#07301d', ink: '#ffffff' },
    { id: 'auringonlasku',  name: 'Auringonlasku',  from: '#b75914', to: '#6b2504', ink: '#ffffff' },
    { id: 'turkoosi',       name: 'Turkoosi',       from: '#0e7f82', to: '#04312f', ink: '#ffffff' },
    { id: 'viini',          name: 'Viini',          from: '#8e2145', to: '#2b0a16', ink: '#ffffff' },
    { id: 'laventeli',      name: 'Laventeli',      from: '#7563d7', to: '#211a4f', ink: '#ffffff' },
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

  /* Kauppiaat. mcc = toimialakoodi (kuten oikeassa korttitapahtumassa),
   * adjust kertoo, miten varaus voi muuttua kirjautuessaan:
   *   tip     = juomaraha voi nostaa summaa jälkikäteen
   *   preauth = ennakkovaraus, joka korvautuu todellisella summalla
   */
  var MERCHANTS = [
    { name: 'Kahvila Aalto',     icon: '☕',  min: 3.2,  max: 8.9,  mcc: '5814', category: 'Kahvilat',      city: 'Helsinki', adjust: { type: 'tip', maxPct: 10 } },
    { name: 'R-kioski',          icon: '🛒', min: 2,    max: 14,   mcc: '5499', category: 'Päivittäistavara', city: 'Helsinki' },
    { name: 'Ravintola Nokka',   icon: '🍽️', min: 14,   max: 38,   mcc: '5812', category: 'Ravintolat',    city: 'Helsinki', adjust: { type: 'tip', maxPct: 15 } },
    { name: 'HSL-lippu',         icon: '🚋', min: 2.95, max: 2.95, mcc: '4111', category: 'Joukkoliikenne', city: 'Helsinki' },
    { name: 'K-Market',          icon: '🛍️', min: 6,    max: 42,   mcc: '5411', category: 'Päivittäistavara', city: 'Espoo' },
    { name: 'Parkkiautomaatti',  icon: '🅿️', min: 2,    max: 9,    mcc: '7523', category: 'Pysäköinti',    city: 'Helsinki' },
    { name: 'Apteekki',          icon: '💊', min: 4,    max: 22,   mcc: '5912', category: 'Terveys',       city: 'Vantaa' },
    { name: 'Kirjakauppa Sana',  icon: '📚', min: 8,    max: 45,   mcc: '5942', category: 'Kirjat',        city: 'Turku' },
    { name: 'Verkkokauppa Nyt',  icon: '📦', min: 12,   max: 120,  mcc: '5999', category: 'Verkkokauppa',  city: 'Verkossa' },
    { name: 'Huoltoasema Tähti', icon: '⛽', min: 30,   max: 95,   mcc: '5541', category: 'Polttoaine',    city: 'Tampere', adjust: { type: 'preauth', holdEuros: 75 } },
    { name: 'Hotelli Ranta',     icon: '🏨', min: 89,   max: 240,  mcc: '7011', category: 'Majoitus',      city: 'Rovaniemi', adjust: { type: 'preauth', holdEuros: 150 } }
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

  /* Saldo sentteinä. */
  function randomBalanceCents(minEuros, maxEuros) {
    return Math.round((minEuros + Math.random() * (maxEuros - minEuros))) * 100;
  }

  var idCounter = 0;
  function newId(prefix) {
    idCounter += 1;
    return (prefix || 'k') + Date.now().toString(36) + idCounter.toString(36);
  }

  /* Oikeassa lompakossa laitteelle ei koskaan tallenneta korttinumeroa vaan
   * maksutunnus (token), jonka voi mitätöidä korttia sulkematta. Demossa
   * säilytetään vain tunnus ja neljä viimeistä numeroa. */
  function newToken() {
    var hex = '';
    for (var i = 0; i < 8; i++) hex += Math.floor(Math.random() * 16).toString(16);
    return 'tok_' + hex;
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
      token: newToken(),
      expiry: randomExpiry(),
      balanceCents: typeof opts.balanceCents === 'number'
        ? opts.balanceCents
        : randomBalanceCents(40, 2400),
      frozen: false,
      archived: false,
      limitCents: null
    };
  }

  /* Lompakon aloituskortit. */
  function defaultCards() {
    var holder = HOLDERS[0];
    return [
      createCard({ bankId: 'nordea-debit',    type: 'Debit',    label: 'Käyttötili',   holder: holder, balanceCents: 24750 }),
      createCard({ bankId: 'spankki-visa',    type: 'Credit',   label: 'Ostokset',     holder: holder, balanceCents: 118040 }),
      createCard({ bankId: 'nordea-business', type: 'Business', label: 'Yrityskortti', holder: holder, balanceCents: 362000 })
    ];
  }

  /* Arpoo maksupyynnön: kauppias ja summa sentteinä. */
  function randomMerchant() {
    var m = pick(MERCHANTS);
    return {
      name: m.name,
      icon: m.icon,
      mcc: m.mcc,
      category: m.category,
      city: m.city,
      adjust: m.adjust || null,
      amountCents: Math.round((m.min + Math.random() * (m.max - m.min)) * 100)
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
    newId: newId,
    newToken: newToken,
    defaultCards: defaultCards,
    randomMerchant: randomMerchant
  };
})(window);
