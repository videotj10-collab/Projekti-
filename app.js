/* Lompakko — sovelluslogiikka: tila, näkymät, korttien hallinta ja maksu.
 * Kaikki data on simuloitua ja tallennetaan vain selaimen localStorageen. */
(function () {
  'use strict';

  var Cards = window.WalletCards;
  var STORAGE_KEY = 'lompakko_state_v2';

  /* ================= TILA ================= */

  var state = loadState();

  function defaultState() {
    var cards = Cards.defaultCards();
    return {
      user: { name: 'Mika Grönqvist', avatar: '🦊' },
      cards: cards,
      defaultCardId: cards[0].id,
      activeCardId: cards[0].id,
      tx: []
    };
  }

  function loadState() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.cards) || saved.cards.length === 0) return base;
      saved.user = saved.user || base.user;
      saved.tx = Array.isArray(saved.tx) ? saved.tx : [];
      if (!findCard(saved.cards, saved.defaultCardId)) saved.defaultCardId = saved.cards[0].id;
      if (!findCard(saved.cards, saved.activeCardId)) saved.activeCardId = saved.defaultCardId;
      return saved;
    } catch (e) {
      return base;
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function findCard(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function cardById(id) { return findCard(state.cards, id); }
  function activeCard() { return cardById(state.activeCardId) || state.cards[0]; }

  /* ================= APUFUNKTIOT ================= */

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function amount(n) {
    return Number(n).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtMoney(n) {
    return amount(n) + ' €';
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  }

  function dayLabel(ts) {
    var d = new Date(ts);
    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    var same = function (a, b) { return a.toDateString() === b.toDateString(); };
    if (same(d, today)) return 'Tänään';
    if (same(d, yesterday)) return 'Eilen';
    return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long' });
  }

  function cardTitle(card) {
    return card.label || Cards.getBank(card.bankId).name;
  }

  function gradient(card) {
    var p = Cards.getPalette(card.paletteId);
    return 'linear-gradient(135deg, ' + p.from + ' 0%, ' + p.to + ' 100%)';
  }

  /* ================= ILMOITUKSET ================= */

  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  function toast(message, kind) {
    toastEl.textContent = message;
    toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.className = 'toast';
    }, 2600);
  }

  /* ================= ALAPANEELI (SHEET) ================= */

  var sheet = document.getElementById('sheet');
  var sheetBackdrop = document.getElementById('sheetBackdrop');
  var sheetTitle = document.getElementById('sheetTitle');
  var sheetBody = document.getElementById('sheetBody');

  function openSheet(title, html, onMount) {
    sheetTitle.textContent = title;
    sheetBody.innerHTML = html;
    sheet.classList.add('show');
    sheetBackdrop.classList.add('show');
    if (onMount) onMount(sheetBody);
  }

  function closeSheet() {
    sheet.classList.remove('show');
    sheetBackdrop.classList.remove('show');
  }

  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  sheetBackdrop.addEventListener('click', closeSheet);

  /* ================= KORTTIPINO ================= */

  var CARD_HEIGHT = 190;
  var CARD_GAP = 16;
  var stackEl = document.getElementById('cardStack');
  var stackExpanded = false;

  function cardFaceHTML(card, classes, style) {
    var bank = Cards.getBank(card.bankId);
    var pal = Cards.getPalette(card.paletteId);
    var chipInk = pal.ink === '#0a0a0a' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.32)';
    return '<div class="paycard ' + classes + '" data-card="' + card.id + '" ' +
      'style="background:' + gradient(card) + ';color:' + pal.ink + ';' + (style || '') + '">' +
      '<div class="card-top">' +
        '<div>' +
          '<div class="card-issuer">' + esc(cardTitle(card)) + '</div>' +
          '<div class="card-type">' + esc(bank.name) + ' · ' + esc(card.type) + '</div>' +
        '</div>' +
        '<div class="card-chip" style="background:linear-gradient(135deg,' + chipInk + ',rgba(255,255,255,0.06))"></div>' +
      '</div>' +
      '<div class="card-number">•••• •••• •••• ' + esc(card.last4) + '</div>' +
      '<div class="card-bottom">' +
        '<div>' +
          '<div class="card-holder">' + esc(card.holder) + '</div>' +
          '<div class="card-expiry">Voimassa ' + esc(card.expiry) + '</div>' +
        '</div>' +
        '<div class="card-network">' + esc(bank.network) + '</div>' +
      '</div>' +
    '</div>';
  }

  /* Aktiivinen kortti ensin, muut sen takana. */
  function orderedCards() {
    var active = activeCard();
    return [active].concat(state.cards.filter(function (c) { return c.id !== active.id; }));
  }

  function renderStack() {
    var cards = orderedCards();
    stackEl.innerHTML = cards.map(function (card, i) {
      var classes = i === 0 ? 'top-card' : '';
      var style;
      if (stackExpanded) {
        style = 'top:' + (i * (CARD_HEIGHT + CARD_GAP)) + 'px;transform:scale(1);z-index:' + (100 - i) + ';';
      } else {
        style = 'top:' + (i * 14) + 'px;transform:scale(' + (1 - i * 0.05) + ');z-index:' + (100 - i) + ';';
        if (i > 2) classes += ' hidden-card';
      }
      return cardFaceHTML(card, classes, style);
    }).join('');
    stackEl.style.height = stackExpanded
      ? (cards.length * (CARD_HEIGHT + CARD_GAP)) + 'px'
      : (CARD_HEIGHT + 24) + 'px';
  }

  stackEl.addEventListener('click', function (e) {
    var el = e.target.closest('.paycard');
    if (!el) return;
    var id = el.dataset.card;
    if (id === state.activeCardId && !stackExpanded) {
      stackExpanded = true;
    } else {
      state.activeCardId = id;
      stackExpanded = false;
      saveState();
      renderBalance();
    }
    renderStack();
  });

  /* ================= SALDO ================= */

  function renderBalance() {
    var card = activeCard();
    document.querySelector('.balance-label').textContent = 'Käytettävissä · ' + cardTitle(card);
    document.getElementById('balanceText').textContent = fmtMoney(card.balance);
  }

  /* ================= TAPAHTUMAT ================= */

  function txRowHTML(t) {
    var card = cardById(t.cardId);
    var cardName = card ? cardTitle(card) : 'Poistettu kortti';
    return '<div class="tx-row">' +
      '<div class="tx-icon">' + t.icon + '</div>' +
      '<div class="tx-info">' +
        '<div class="tx-name">' + esc(t.name) + '</div>' +
        '<div class="tx-meta">' + fmtTime(t.ts) + ' · ' + esc(cardName) + ' · ' + esc(t.method) + '</div>' +
      '</div>' +
      '<div class="tx-amount">-' + fmtMoney(t.amount) + '</div>' +
    '</div>';
  }

  function renderRecent() {
    var el = document.getElementById('recentTx');
    var recent = state.tx.slice(0, 3);
    if (recent.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="emoji">🪪</div>' +
        '<p>Ei vielä tapahtumia. Kokeile napauttaa maksaaksesi.</p></div>';
      return;
    }
    el.innerHTML = '<div class="tx-list">' + recent.map(txRowHTML).join('') + '</div>';
  }

  function renderHistory() {
    var sub = document.getElementById('historySub');
    var list = document.getElementById('historyList');
    var rows = state.tx;

    if (rows.length === 0) {
      sub.textContent = 'Ei vielä tapahtumia';
      list.innerHTML = '<div class="empty-state"><div class="emoji">📄</div>' +
        '<p>Tapahtumat näkyvät täällä maksun jälkeen.</p></div>';
      return;
    }
    sub.textContent = rows.length + (rows.length === 1 ? ' tapahtuma' : ' tapahtumaa');

    var groups = {};
    var order = [];
    rows.forEach(function (t) {
      var label = dayLabel(t.ts);
      if (!groups[label]) { groups[label] = []; order.push(label); }
      groups[label].push(t);
    });

    list.innerHTML = order.map(function (label) {
      return '<div class="day-group">' +
        '<div class="day-label">' + label + '</div>' +
        '<div class="tx-list">' + groups[label].map(txRowHTML).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  function addTransaction(card, payment, method) {
    card.balance = Math.max(0, Math.round((card.balance - payment.amount) * 100) / 100);
    state.tx.unshift({
      id: 't' + Date.now().toString(36),
      cardId: card.id,
      name: payment.name,
      icon: payment.icon,
      amount: payment.amount,
      ts: Date.now(),
      method: method
    });
    saveState();
    renderAll();
  }

  /* ================= KORTTIEN HALLINTA ================= */

  function renderCardList() {
    var list = document.getElementById('cardList');
    document.getElementById('cardsSub').textContent =
      state.cards.length + (state.cards.length === 1 ? ' kortti' : ' korttia') + ' lompakossa';

    list.innerHTML = state.cards.map(function (card) {
      var bank = Cards.getBank(card.bankId);
      var badges = '';
      if (card.id === state.defaultCardId) badges += ' <span class="badge default">Oletus</span>';
      return '<button class="card-row" data-card="' + card.id + '">' +
        '<span class="card-swatch" style="background:' + gradient(card) + '"></span>' +
        '<span class="card-row-info">' +
          '<span class="card-row-title">' + esc(cardTitle(card)) + badges + '</span>' +
          '<span class="card-row-meta">' + esc(bank.name) + ' · ' + esc(card.type) +
            ' · •••• ' + esc(card.last4) + '</span>' +
        '</span>' +
        '<span class="card-row-amount">' + fmtMoney(card.balance) + '</span>' +
      '</button>';
    }).join('');
  }

  document.getElementById('cardList').addEventListener('click', function (e) {
    var row = e.target.closest('.card-row');
    if (row) openCardSettings(row.dataset.card);
  });

  /* --- kortin omat asetukset --- */
  function openCardSettings(cardId) {
    var card = cardById(cardId);
    if (!card) return;
    var isDefault = card.id === state.defaultCardId;

    var html =
      cardFaceHTML(card, 'preview-card', 'position:relative;top:0;transform:none;margin-bottom:18px;') +
      '<button class="ghost-btn" id="setDefaultBtn"' + (isDefault ? ' disabled' : '') + '>' +
        (isDefault ? 'Tämä on oletuskortti' : 'Aseta oletuskortiksi') +
      '</button>' +
      '<div style="height:10px"></div>' +
      '<button class="danger-btn" id="deleteCardBtn">Poista kortti</button>';

    openSheet(cardTitle(card), html, function (body) {
      var setDefault = body.querySelector('#setDefaultBtn');
      if (!isDefault) {
        setDefault.addEventListener('click', function () {
          state.defaultCardId = card.id;
          saveState();
          renderAll();
          closeSheet();
          toast(cardTitle(card) + ' on nyt oletuskortti', 'ok');
        });
      }
      body.querySelector('#deleteCardBtn').addEventListener('click', function () {
        removeCard(card.id);
      });
    });
  }

  function removeCard(cardId) {
    if (state.cards.length === 1) {
      toast('Lompakossa on oltava vähintään yksi kortti', 'error');
      return;
    }
    var card = cardById(cardId);
    state.cards = state.cards.filter(function (c) { return c.id !== cardId; });
    if (state.defaultCardId === cardId) state.defaultCardId = state.cards[0].id;
    if (state.activeCardId === cardId) state.activeCardId = state.defaultCardId;
    saveState();
    renderAll();
    closeSheet();
    toast(cardTitle(card) + ' poistettu', 'ok');
  }

  /* --- uuden kortin lisäys --- */
  function openAddCard() {
    var bankOptions = Cards.BANKS.map(function (b) {
      return '<option value="' + b.id + '">' + esc(b.name) + '</option>';
    }).join('');

    var swatches = Cards.PALETTES.map(function (p) {
      return '<button type="button" class="swatch-btn" data-palette="' + p.id + '" title="' + esc(p.name) + '" ' +
        'style="background:linear-gradient(135deg,' + p.from + ',' + p.to + ')"></button>';
    }).join('');

    var html =
      '<form id="addCardForm">' +
        '<div class="field">' +
          '<label for="fBank">Pankki</label>' +
          '<select id="fBank">' + bankOptions + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="fType">Kortin tyyppi</label>' +
          '<select id="fType"></select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="fLabel">Nimi</label>' +
          '<input type="text" id="fLabel" maxlength="24" placeholder="esim. Käyttötili">' +
          '<div class="field-hint">Jätä tyhjäksi, niin käytetään pankin nimeä.</div>' +
        '</div>' +
        '<div class="field">' +
          '<label>Väri</label>' +
          '<div class="swatch-row" id="fPalette">' + swatches + '</div>' +
        '</div>' +
        '<button type="submit" class="solid-btn">Lisää kortti</button>' +
        '<div class="field-hint" style="text-align:center;margin-top:12px">' +
          'Kortinhaltija, numero, voimassaolo ja saldo arvotaan simuloidusti.' +
        '</div>' +
      '</form>';

    openSheet('Lisää kortti', html, function (body) {
      var bankSel = body.querySelector('#fBank');
      var typeSel = body.querySelector('#fType');
      var paletteRow = body.querySelector('#fPalette');
      var chosenPalette = null;

      function selectPalette(id) {
        chosenPalette = id;
        paletteRow.querySelectorAll('.swatch-btn').forEach(function (b) {
          b.classList.toggle('selected', b.dataset.palette === id);
        });
      }

      function syncBank() {
        var bank = Cards.getBank(bankSel.value);
        typeSel.innerHTML = bank.types.map(function (t) {
          return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
        }).join('');
        selectPalette(bank.palette);
      }

      bankSel.addEventListener('change', syncBank);
      paletteRow.addEventListener('click', function (e) {
        var btn = e.target.closest('.swatch-btn');
        if (btn) selectPalette(btn.dataset.palette);
      });
      syncBank();

      body.querySelector('#addCardForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var card = Cards.createCard({
          bankId: bankSel.value,
          type: typeSel.value,
          label: body.querySelector('#fLabel').value,
          paletteId: chosenPalette
        });
        state.cards.push(card);
        state.activeCardId = card.id;
        saveState();
        renderAll();
        closeSheet();
        toast(cardTitle(card) + ' lisätty lompakkoon', 'ok');
      });
    });
  }

  document.getElementById('addCardBtn').addEventListener('click', openAddCard);

  /* ================= NAVIGOINTI ================= */

  var SCREENS = ['wallet', 'cards', 'history', 'scan'];
  var TITLES = { wallet: 'Lompakko', cards: 'Kortit', history: 'Historia', scan: 'Skannaa' };

  function showScreen(name) {
    SCREENS.forEach(function (s) {
      var el = document.getElementById('screen-' + s);
      if (el) el.classList.toggle('active', s === name);
    });
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.screen === name);
    });
    document.getElementById('pageTitle').textContent = TITLES[name] || 'Lompakko';
  }

  document.querySelectorAll('.navbtn').forEach(function (btn) {
    btn.addEventListener('click', function () { showScreen(btn.dataset.screen); });
  });

  /* ================= MAKSU (NFC) ================= */

  var overlay = document.getElementById('tapOverlay');
  var tapStatus = document.getElementById('tapStatus');
  var tapAmount = document.getElementById('tapAmount');
  var nfcIcon = document.getElementById('nfcIcon');
  var timers = [];

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function startPayment(cardId) {
    var card = cardById(cardId) || activeCard();
    var payment = Cards.randomMerchant();

    clearTimers();
    overlay.classList.add('show', 'pulsing');
    overlay.classList.remove('success');
    tapStatus.textContent = 'Napauta laitetta maksupäätteeseen · ' + cardTitle(card);
    tapAmount.textContent = fmtMoney(payment.amount);
    nfcIcon.textContent = '📶';

    timers.push(setTimeout(function () {
      tapStatus.textContent = 'Yhdistetään…';
    }, 1100));

    timers.push(setTimeout(function () {
      overlay.classList.remove('pulsing');
      overlay.classList.add('success');
      nfcIcon.textContent = '✓';
      tapStatus.textContent = 'Maksu onnistui';
    }, 2000));

    timers.push(setTimeout(function () {
      addTransaction(card, payment, 'Napauta ja maksa');
      closePayment();
    }, 3100));
  }

  function closePayment() {
    clearTimers();
    overlay.classList.remove('show', 'pulsing', 'success');
  }

  document.getElementById('payBtn').addEventListener('click', function () {
    startPayment(state.activeCardId);
  });
  document.getElementById('tapCancel').addEventListener('click', closePayment);

  /* ================= QR-SKANNAUS (MOCKUP) ================= */

  document.getElementById('fakeScanBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Tunnistetaan…';
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = 'Simuloi QR-tunnistus';
      showScreen('wallet');
      setTimeout(function () { startPayment(state.activeCardId); }, 250);
    }, 1200);
  });

  /* ================= KÄYNNISTYS ================= */

  function renderAll() {
    renderStack();
    renderBalance();
    renderRecent();
    renderHistory();
    renderCardList();
  }

  renderAll();
})();
