/* Lompakko — sovelluslogiikka: tila, näkymät, korttien hallinta ja maksu.
 * Kaikki data on simuloitua ja tallennetaan vain selaimen localStorageen. */
(function () {
  'use strict';

  var Cards = window.WalletCards;
  var STORAGE_KEY = 'lompakko_state_v3';
  var LEGACY_KEY = 'lompakko_state_v2';
  var SETTLE_DELAY_MS = 20000; // varaus kirjautuu demossa 20 s kuluttua

  /* ================= TILA ================= */

  var state = loadState();

  function defaultState() {
    var cards = Cards.defaultCards();
    return {
      version: 3,
      user: { name: 'Mika Grönqvist', avatar: '🦊' },
      settings: {
        hideBalance: false,
        currency: 'suffix',
        lockEnabled: true,
        requireAuthForPayment: true
      },
      /* Demossa PIN on tilassa selkotekstinä. Oikeassa sovelluksessa
       * tunnistautuminen tehtäisiin laitteen suojatussa elementissä. */
      security: { pin: '1234' },
      contactless: { spentCents: 0 },
      cards: cards,
      defaultCardId: cards[0].id,
      activeCardId: cards[0].id,
      tx: []
    };
  }

  function loadState() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.cards) || saved.cards.length === 0) return base;
      saved = migrate(saved);
      saved.user = saved.user || base.user;
      saved.settings = Object.assign({}, base.settings, saved.settings || {});
      saved.security = Object.assign({}, base.security, saved.security || {});
      saved.contactless = Object.assign({}, base.contactless, saved.contactless || {});
      saved.tx = Array.isArray(saved.tx) ? saved.tx : [];
      if (!findCard(saved.cards, saved.defaultCardId)) saved.defaultCardId = saved.cards[0].id;
      if (!findCard(saved.cards, saved.activeCardId)) saved.activeCardId = saved.defaultCardId;
      return saved;
    } catch (e) {
      return base;
    }
  }

  /* Vanha tila käytti euroja liukulukuina. Muunnetaan sentteihin ja
   * täydennetään uudet kentät. */
  function migrate(saved) {
    if (saved.version >= 3) return saved;

    saved.cards.forEach(function (card) {
      if (typeof card.balanceCents !== 'number') {
        card.balanceCents = Money.fromEuros(card.balance || 0);
      }
      if (typeof card.limitCents !== 'number') {
        card.limitCents = card.limit ? Money.fromEuros(card.limit) : null;
      }
      if (!card.token) card.token = Cards.newToken();
      if (typeof card.archived !== 'boolean') card.archived = false;
      delete card.balance;
      delete card.limit;
    });

    (saved.tx || []).forEach(function (t) {
      if (typeof t.amountCents !== 'number') t.amountCents = Money.fromEuros(t.amount || 0);
      if (typeof t.originalAmountCents !== 'number') t.originalAmountCents = t.amountCents;
      if (!t.status) t.status = 'settled';
      if (!t.reference) t.reference = reference(t.ts);
      if (!t.merchant) t.merchant = { name: t.name, icon: t.icon, category: 'Muu', city: '' };
      delete t.amount;
    });

    saved.version = 3;
    return saved;
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

  /* ================= KIRJANPITO ================= */

  /* Kortilla olevat vahvistamattomat katevaraukset. */
  function pendingTx(cardId) {
    return state.tx.filter(function (t) {
      return t.cardId === cardId && t.status === 'pending';
    });
  }

  function pendingCents(cardId) {
    return Money.sum(pendingTx(cardId), function (t) { return t.amountCents; });
  }

  /* Käytettävissä = kirjattu saldo - avoimet varaukset. Tämä on se luku,
   * jonka pankki kertoo käyttäjälle, ei pelkkä tilin saldo. */
  function availableCents(card) {
    return card.balanceCents - pendingCents(card.id);
  }

  function reference(ts) {
    return 'RF' + String(ts || Date.now()).slice(-10);
  }

  function authCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
  function activeCard() { return cardById(state.activeCardId) || state.cards[0]; }

  /* ================= APUFUNKTIOT ================= */

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Kaikki summat kulkevat sentteinä ja muotoillaan vasta näytettäessä. */
  function fmtMoney(cents) {
    return Money.format(cents, state.settings.currency);
  }

  /* Saldot piilotetaan yksityisyystilassa. */
  function fmtBalance(cents) {
    return state.settings.hideBalance ? '••••••' : fmtMoney(cents);
  }

  /* Kortin tämän kuukauden kulutus kulukaton seurantaa varten.
   * Hylätyt tapahtumat eivät kuluta kattoa. */
  function spentThisMonthCents(cardId) {
    var now = new Date();
    return Money.sum(state.tx, function (t) {
      if (t.cardId !== cardId) return 0;
      if (t.status === 'declined') return 0;
      var d = new Date(t.ts);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return 0;
      return t.amountCents;
    });
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

  /* ================= TUNNISTAUTUMINEN ================= */

  Auth.init({
    getPin: function () { return state.security.pin; },
    onUnlock: function () { renderAll(); }
  });

  /* Arkaluonteiset toimet vaativat uudelleentunnistautumisen. Peruutus ei ole
   * virhe, joten se niellään hiljaisesti. */
  function withAuth(reason, sub, action) {
    Auth.require(reason, sub).then(function () {
      action();
    }).catch(function () {
      toast('Toiminto peruutettiin');
    });
  }

  function lockNow() {
    if (Auth.isBusy()) return;
    Auth.lockApp();
  }

  /* Sovellus lukkiutuu, kun se siirtyy taustalle. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && state.settings.lockEnabled) {
      closeSheet();
      lockNow();
    }
  });

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
    if (card.frozen) classes += ' is-frozen';
    var flag = card.frozen ? '<div class="card-flag">Jäädytetty</div>' : '';
    return '<div class="paycard ' + classes + '" data-card="' + card.id + '" ' +
      'style="background:' + gradient(card) + ';color:' + pal.ink + ';' + (style || '') + '">' +
      flag +
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
    var label = card.frozen ? 'Jäädytetty · ' : 'Käytettävissä · ';
    document.querySelector('.balance-label').textContent = label + cardTitle(card);
    document.getElementById('balanceText').textContent = fmtBalance(availableCents(card));

    /* Avoimet katevaraukset kerrotaan erikseen: kirjattu saldo on eri luku
     * kuin käytettävissä oleva. */
    var holds = pendingTx(card.id);
    var note = document.getElementById('balanceNote');
    if (holds.length === 0) {
      note.hidden = true;
    } else {
      note.hidden = false;
      note.textContent = holds.length + (holds.length === 1 ? ' varaus · ' : ' varausta · ') +
        'kirjattu saldo ' + fmtBalance(card.balanceCents);
    }

    var payBtn = document.getElementById('payBtn');
    payBtn.textContent = card.frozen ? 'Kortti on jäädytetty' : 'Napauta maksaaksesi';
  }

  /* ================= KÄYTTÄJÄ ================= */

  var AVATARS = ['🦊', '🐻', '🐧', '🌊', '🎧', '⚡', '🌙', '🍃'];

  function renderUser() {
    document.getElementById('avatar').textContent = state.user.avatar;
  }

  /* ================= TAPAHTUMAT ================= */

  var TX_STATUS = {
    pending:  { label: 'Vahvistamatta', cls: 'pending' },
    settled:  { label: '', cls: '' },
    declined: { label: 'Hylätty', cls: 'declined' },
    disputed: { label: 'Riitautettu', cls: 'disputed' }
  };

  function txRowHTML(t) {
    var card = cardById(t.cardId);
    var cardName = card ? cardTitle(card) : 'Poistettu kortti';
    var status = TX_STATUS[t.status] || TX_STATUS.settled;
    var tag = status.label
      ? ' <span class="tx-tag ' + status.cls + '">' + status.label + '</span>'
      : '';
    return '<button class="tx-row" data-tx="' + t.id + '">' +
      '<span class="tx-icon">' + t.merchant.icon + '</span>' +
      '<span class="tx-info">' +
        '<span class="tx-name">' + esc(t.merchant.name) + tag + '</span>' +
        '<span class="tx-meta">' + fmtTime(t.ts) + ' · ' + esc(cardName) + ' · ' + esc(t.method) + '</span>' +
      '</span>' +
      '<span class="tx-amount' + (t.status === 'declined' ? ' struck' : '') + '">-' +
        fmtMoney(t.amountCents) + '</span>' +
    '</button>';
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

  /* Historian suodatus: 'kaikki' tai kortin id. */
  var historyFilter = 'kaikki';
  var filterRow = document.getElementById('historyFilter');

  function filteredTx() {
    if (historyFilter === 'kaikki') return state.tx;
    return state.tx.filter(function (t) { return t.cardId === historyFilter; });
  }

  function renderHistoryFilter() {
    var chips = [{ id: 'kaikki', title: 'Kaikki kortit', color: null }].concat(
      state.cards.map(function (c) {
        return { id: c.id, title: cardTitle(c), color: Cards.getPalette(c.paletteId).from };
      })
    );
    filterRow.innerHTML = chips.map(function (c) {
      var dot = c.color ? '<span class="dot" style="background:' + c.color + '"></span>' : '';
      return '<button class="chip' + (c.id === historyFilter ? ' active' : '') + '" data-filter="' + c.id + '">' +
        dot + esc(c.title) + '</button>';
    }).join('');
  }

  filterRow.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    historyFilter = chip.dataset.filter;
    renderHistoryFilter();
    renderHistory();
  });

  function renderHistory() {
    var sub = document.getElementById('historySub');
    var list = document.getElementById('historyList');
    var rows = filteredTx();

    if (rows.length === 0) {
      sub.textContent = historyFilter === 'kaikki'
        ? 'Ei vielä tapahtumia'
        : 'Ei tapahtumia tällä kortilla';
      list.innerHTML = '<div class="empty-state"><div class="emoji">📄</div>' +
        '<p>Tapahtumat näkyvät täällä maksun jälkeen.</p></div>';
      return;
    }

    var total = Money.sum(rows, function (t) {
      return t.status === 'declined' ? 0 : t.amountCents;
    });
    sub.textContent = rows.length + (rows.length === 1 ? ' tapahtuma' : ' tapahtumaa') +
      ' · yhteensä ' + fmtMoney(total);

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

  /* Maksusta syntyy ensin katevaraus. Se kirjautuu tilille vasta myöhemmin,
   * ja summa voi vielä muuttua (juomaraha, ennakkovaraus). */
  function addTransaction(card, payment, method, extra) {
    var now = Date.now();
    var tx = Object.assign({
      id: Cards.newId('t'),
      cardId: card.id,
      merchant: {
        name: payment.name, icon: payment.icon, mcc: payment.mcc,
        category: payment.category, city: payment.city
      },
      adjust: payment.adjust || null,
      amountCents: payment.amountCents,
      originalAmountCents: payment.amountCents,
      ts: now,
      method: method,
      status: 'pending',
      reference: reference(now),
      authCode: authCode(),
      settledTs: null
    }, extra || {});

    state.tx.unshift(tx);
    if (tx.status === 'pending') scheduleSettlement(tx);
    saveState();
    renderAll();
    return tx;
  }

  /* ================= VARAUSTEN KIRJAUTUMINEN ================= */

  var settleTimers = {};

  function scheduleSettlement(tx) {
    if (settleTimers[tx.id]) return;
    var wait = Math.max(0, tx.ts + SETTLE_DELAY_MS - Date.now());
    settleTimers[tx.id] = setTimeout(function () {
      delete settleTimers[tx.id];
      settleTx(tx.id);
    }, wait);
  }

  /* Kirjaa varauksen tilille. Ravintolassa summa voi nousta juomarahalla ja
   * ennakkovaraus korvautuu todellisella summalla. */
  function settleTx(txId) {
    var tx = null;
    for (var i = 0; i < state.tx.length; i++) {
      if (state.tx[i].id === txId) { tx = state.tx[i]; break; }
    }
    if (!tx || tx.status !== 'pending') return;

    var card = cardById(tx.cardId);
    if (!card) return;

    if (tx.adjust && tx.adjust.type === 'tip') {
      var pct = Math.random() * (tx.adjust.maxPct / 100);
      tx.amountCents = Math.round(tx.originalAmountCents * (1 + pct));
    } else if (tx.adjust && tx.adjust.type === 'preauth') {
      tx.amountCents = Math.round(tx.originalAmountCents * (0.45 + Math.random() * 0.5));
    }

    tx.status = 'settled';
    tx.settledTs = Date.now();
    card.balanceCents = Math.max(0, card.balanceCents - tx.amountCents);
    saveState();
    renderAll();

    if (tx.amountCents !== tx.originalAmountCents) {
      toast(tx.merchant.name + ': lopullinen summa ' + fmtMoney(tx.amountCents));
    }
  }

  function restoreSettlements() {
    state.tx.forEach(function (tx) {
      if (tx.status === 'pending') scheduleSettlement(tx);
    });
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
      if (card.frozen) badges += ' <span class="badge frozen">Jäädytetty</span>';
      if (card.limitCents) badges += ' <span class="badge">Kulukatto ' + Money.plain(card.limitCents) + ' €</span>';
      return '<button class="card-row" data-card="' + card.id + '">' +
        '<span class="card-swatch" style="background:' + gradient(card) + '"></span>' +
        '<span class="card-row-info">' +
          '<span class="card-row-title">' + esc(cardTitle(card)) + badges + '</span>' +
          '<span class="card-row-meta">' + esc(bank.name) + ' · ' + esc(card.type) +
            ' · •••• ' + esc(card.last4) + '</span>' +
        '</span>' +
        '<span class="card-row-amount">' + fmtBalance(availableCents(card)) + '</span>' +
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
    var used = spentThisMonthCents(card.id);

    var html =
      cardFaceHTML(card, 'preview-card', 'position:relative;top:0;transform:none;margin-bottom:18px;') +
      '<div class="field">' +
        '<label for="cName">Nimi</label>' +
        '<input type="text" id="cName" maxlength="24" value="' + esc(card.label) + '">' +
      '</div>' +
      '<div class="field">' +
        '<label for="cLimit">Kulukatto kuukaudessa (€)</label>' +
        '<input type="number" id="cLimit" min="0" step="10" placeholder="Ei rajaa" value="' +
          (card.limitCents ? Money.toEuros(card.limitCents) : '') + '">' +
        '<div class="field-hint">Käytetty tässä kuussa: ' + Money.plain(used) + ' €' +
          (card.limitCents ? ' / ' + Money.plain(card.limitCents) + ' €' : '') + '</div>' +
      '</div>' +
      '<div class="settings-group" style="margin-bottom:16px">' +
        '<div class="settings-row">' +
          '<span class="settings-label">Jäädytä kortti' +
            '<span class="settings-sub">Estää kaikki maksut tällä kortilla</span>' +
          '</span>' +
          '<button class="toggle' + (card.frozen ? ' on' : '') + '" id="cFreeze" role="switch"></button>' +
        '</div>' +
      '</div>' +
      '<button class="solid-btn" id="cSave">Tallenna muutokset</button>' +
      '<div style="height:10px"></div>' +
      '<button class="ghost-btn" id="setDefaultBtn"' + (isDefault ? ' disabled' : '') + '>' +
        (isDefault ? 'Tämä on oletuskortti' : 'Aseta oletuskortiksi') +
      '</button>' +
      '<div style="height:10px"></div>' +
      '<button class="danger-btn" id="deleteCardBtn">Poista kortti</button>';

    openSheet(cardTitle(card), html, function (body) {
      var freezeBtn = body.querySelector('#cFreeze');
      var frozen = card.frozen;

      freezeBtn.addEventListener('click', function () {
        frozen = !frozen;
        freezeBtn.classList.toggle('on', frozen);
      });

      body.querySelector('#cSave').addEventListener('click', function () {
        var parsed = Money.parse(body.querySelector('#cLimit').value);
        var newLimit = !parsed || parsed <= 0 ? null : parsed;
        var newName = body.querySelector('#cName').value.trim();

        /* Jäädytyksen vapautus ja kulukaton nostaminen heikentävät suojaa,
         * joten ne vaativat tunnistautumisen. Kiristäminen ei vaadi. */
        var unfreezing = card.frozen && !frozen;
        var loosening = newLimit === null
          ? card.limitCents !== null
          : (card.limitCents !== null && newLimit > card.limitCents);

        var apply = function () {
          card.label = newName;
          card.limitCents = newLimit;
          card.frozen = frozen;
          saveState();
          renderAll();
          closeSheet();
          toast(cardTitle(card) + (card.frozen ? ' jäädytetty' : ' tallennettu'), 'ok');
        };

        if (unfreezing || loosening) {
          withAuth(
            unfreezing ? 'Vapauta kortti' : 'Nosta kulukattoa',
            'Suojauksen heikentäminen vaatii tunnistautumisen',
            apply
          );
        } else {
          apply();
        }
      });

      if (!isDefault) {
        body.querySelector('#setDefaultBtn').addEventListener('click', function () {
          state.defaultCardId = card.id;
          saveState();
          renderAll();
          closeSheet();
          toast(cardTitle(card) + ' on nyt oletuskortti', 'ok');
        });
      }

      body.querySelector('#deleteCardBtn').addEventListener('click', function () {
        withAuth('Poista kortti', 'Kortin poistaminen vaatii tunnistautumisen', function () {
          removeCard(card.id);
        });
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
    if (historyFilter === cardId) historyFilter = 'kaikki';
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

  document.getElementById('addCardBtn').addEventListener('click', function () {
    withAuth('Lisää kortti', 'Kortin lisääminen lompakkoon vaatii tunnistautumisen', openAddCard);
  });

  /* ================= NAVIGOINTI ================= */

  var SCREENS = ['wallet', 'cards', 'history', 'scan', 'settings'];
  var TITLES = {
    wallet: 'Lompakko', cards: 'Kortit', history: 'Historia',
    scan: 'Skannaa', settings: 'Asetukset'
  };

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

  document.getElementById('avatar').addEventListener('click', function () {
    showScreen('settings');
  });

  /* ================= MAKSU (NFC) ================= */

  /* ================= MAKSU ================= */

  /* Lompakon omat estot ennen kuin maksua edes yritetään päätteellä.
   * Palauttaa virheilmoituksen tai null, jos maksu on sallittu. */
  function paymentBlocker(card, sumCents) {
    if (card.frozen) {
      return 'Kortti ' + cardTitle(card) + ' on jäädytetty. Vapauta se kortin asetuksista.';
    }
    if (card.limitCents && spentThisMonthCents(card.id) + sumCents > card.limitCents) {
      return 'Kulukatto ' + Money.plain(card.limitCents) + ' € ylittyisi tällä maksulla.';
    }
    if (sumCents > availableCents(card)) {
      return 'Kortilla ei ole riittävästi katetta. Avoimet varaukset pienentävät käytettävissä olevaa summaa.';
    }
    return null;
  }

  /* Lähimaksujen kertymä: PIN-koodi nollaa sen, kuten oikeallakin kortilla. */
  function contactlessSpent() {
    return state.contactless ? state.contactless.spentCents : 0;
  }

  Payment.init({
    fmtMoney: fmtMoney,
    cardTitle: cardTitle,
    blocker: paymentBlocker,

    requireAuthForPayment: function () {
      return state.settings.requireAuthForPayment;
    },

    authenticate: function (merchantName, amountText) {
      return Auth.require('Vahvista maksu', merchantName + ' · ' + amountText);
    },

    requestPin: function (reason) {
      return Auth.open({
        title: 'Syötä PIN-koodi',
        sub: reason,
        icon: '🔢',
        pinOnly: true,
        cancellable: true,
        cancelLabel: 'Keskeytä maksu'
      });
    },

    contactlessSpent: contactlessSpent,

    onApproved: function (card, payment, meta) {
      addTransaction(card, payment, meta.method, { pinUsed: meta.pinUsed });
      state.contactless = {
        spentCents: meta.pinUsed ? 0 : contactlessSpent() + payment.amountCents
      };
      saveState();
      renderAll();
    },

    /* Hylätty maksu jää historiaan: käyttäjän pitää nähdä, mitä tapahtui. */
    onDeclined: function (card, payment, info) {
      addTransaction(card, payment, info.local ? 'Estetty lompakossa' : 'Lähimaksu', {
        status: 'declined',
        declineCode: info.code || null,
        declineNote: info.note
      });
    }
  });

  /* --- maksutavan valinta maksuhetkellä --- */
  function openPaymentPicker() {
    var payment = Cards.randomMerchant();
    var ordered = state.cards.filter(function (c) { return !c.archived; }).sort(function (a, b) {
      return (b.id === state.defaultCardId) - (a.id === state.defaultCardId);
    });

    var rows = ordered.map(function (card) {
      var bank = Cards.getBank(card.bankId);
      var blocked = paymentBlocker(card, payment.amountCents);
      var note = blocked
        ? '<span class="badge frozen">' + (card.frozen ? 'Jäädytetty' : 'Estetty') + '</span>'
        : (card.id === state.defaultCardId ? '<span class="badge default">Oletus</span>' : '');
      return '<button class="method-row' + (blocked ? ' blocked' : '') + '" data-card="' + card.id + '">' +
        '<span class="card-swatch" style="background:' + gradient(card) + '"></span>' +
        '<span class="card-row-info">' +
          '<span class="card-row-title">' + esc(cardTitle(card)) + ' ' + note + '</span>' +
          '<span class="card-row-meta">' + esc(bank.name) + ' · •••• ' + esc(card.last4) + '</span>' +
        '</span>' +
        '<span class="card-row-amount">' + fmtBalance(availableCents(card)) + '</span>' +
      '</button>';
    }).join('');

    var pinNote = payment.amountCents > Payment.CONTACTLESS_LIMIT_CENTS
      ? '<p class="field-hint">Summa ylittää lähimaksurajan, joten maksupääte pyytää PIN-koodin.</p>'
      : '';

    var html =
      '<div class="tx-row static" style="border-radius:14px;margin-bottom:16px">' +
        '<span class="tx-icon">' + payment.icon + '</span>' +
        '<span class="tx-info">' +
          '<span class="tx-name">' + esc(payment.name) + '</span>' +
          '<span class="tx-meta">Maksupyyntö · ' + esc(payment.category) + '</span>' +
        '</span>' +
        '<span class="tx-amount">' + fmtMoney(payment.amountCents) + '</span>' +
      '</div>' +
      pinNote +
      '<div class="section-label" style="margin-top:0">Valitse maksutapa</div>' +
      rows;

    openSheet('Maksu', html, function (body) {
      body.addEventListener('click', function (e) {
        var row = e.target.closest('.method-row');
        if (!row) return;
        var card = cardById(row.dataset.card);
        closeSheet();
        startPayment(card, payment);
      });
    });
  }

  function startPayment(card, payment) {
    Payment.begin(card || activeCard(), payment || Cards.randomMerchant());
  }

  document.getElementById('payBtn').addEventListener('click', openPaymentPicker);

  /* ================= QR-SKANNAUS (MOCKUP) ================= */

  document.getElementById('fakeScanBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Tunnistetaan…';
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = 'Simuloi QR-tunnistus';
      showScreen('wallet');
      setTimeout(openPaymentPicker, 250);
    }, 1200);
  });

  /* ================= ASETUKSET ================= */

  var nameInput = document.getElementById('setName');
  var avatarRow = document.getElementById('setAvatar');
  var defaultSelect = document.getElementById('setDefaultCard');
  var hideToggle = document.getElementById('setHideBalance');
  var currencyRow = document.getElementById('setCurrency');

  function setToggle(node, on) {
    node.classList.toggle('on', on);
    node.setAttribute('aria-checked', String(on));
  }

  function renderSettings() {
    if (document.activeElement !== nameInput) nameInput.value = state.user.name;

    avatarRow.innerHTML = AVATARS.map(function (a) {
      return '<button class="avatar-btn' + (a === state.user.avatar ? ' selected' : '') +
        '" data-avatar="' + a + '">' + a + '</button>';
    }).join('');

    defaultSelect.innerHTML = state.cards.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === state.defaultCardId ? ' selected' : '') + '>' +
        esc(cardTitle(c)) + ' · •••• ' + esc(c.last4) + '</option>';
    }).join('');

    setToggle(hideToggle, state.settings.hideBalance);
    setToggle(lockToggle, state.settings.lockEnabled);
    setToggle(payAuthToggle, state.settings.requireAuthForPayment);

    currencyRow.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.currency === state.settings.currency);
    });
  }

  nameInput.addEventListener('input', function () {
    state.user.name = nameInput.value;
    saveState();
  });

  avatarRow.addEventListener('click', function (e) {
    var btn = e.target.closest('.avatar-btn');
    if (!btn) return;
    state.user.avatar = btn.dataset.avatar;
    saveState();
    renderUser();
    renderSettings();
  });

  defaultSelect.addEventListener('change', function () {
    state.defaultCardId = defaultSelect.value;
    saveState();
    renderAll();
    toast('Oletuskortti vaihdettu', 'ok');
  });

  hideToggle.addEventListener('click', function () {
    state.settings.hideBalance = !state.settings.hideBalance;
    saveState();
    renderAll();
  });

  currencyRow.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    state.settings.currency = btn.dataset.currency;
    saveState();
    renderAll();
  });

  var lockToggle = document.getElementById('setLock');
  var payAuthToggle = document.getElementById('setPayAuth');

  lockToggle.addEventListener('click', function () {
    state.settings.lockEnabled = !state.settings.lockEnabled;
    saveState();
    renderSettings();
    toast(state.settings.lockEnabled ? 'Sovelluslukko käytössä' : 'Sovelluslukko pois käytöstä');
  });

  payAuthToggle.addEventListener('click', function () {
    state.settings.requireAuthForPayment = !state.settings.requireAuthForPayment;
    saveState();
    renderSettings();
  });

  document.getElementById('lockNowBtn').addEventListener('click', lockNow);

  document.getElementById('resetBtn').addEventListener('click', function () {
    if (!window.confirm('Palautetaanko demon oletustiedot? Kortit ja tapahtumat nollataan.')) return;
    state = defaultState();
    saveState();
    renderAll();
    toast('Demon oletustiedot palautettu', 'ok');
  });

  /* ================= KÄYNNISTYS ================= */

  function renderAll() {
    renderUser();
    renderStack();
    renderBalance();
    renderRecent();
    renderHistoryFilter();
    renderHistory();
    renderCardList();
    renderSettings();
  }

  renderAll();
  restoreSettlements();

  if (state.settings.lockEnabled) lockNow();

  /* ================= PWA ================= */

  /* Service worker vaatii http(s)-yhteyden, joten se ohitetaan, jos sivu
   * avataan suoraan tiedostojärjestelmästä (file://). */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Service workerin rekisteröinti epäonnistui:', err);
      });
    });
  }
})();
