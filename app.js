/* Lompakko — sovelluslogiikka: näkymät, saldo, maksu ja tapahtumat. */
(function () {
  'use strict';

  var STORAGE_KEY = 'mockwallet_state_v1';
  var Cards = window.WalletCards;

  var state = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { balance: 247.5, tx: [] };
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---------- muotoilu ----------
  function fmtEUR(n) {
    return n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  }
  function dayLabel(ts) {
    var d = new Date(ts);
    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    var sameDay = function (a, b) { return a.toDateString() === b.toDateString(); };
    if (sameDay(d, today)) return 'Tänään';
    if (sameDay(d, yesterday)) return 'Eilen';
    return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long' });
  }

  // ---------- kortit ----------
  function renderCards() {
    var stack = document.getElementById('cardStack');
    stack.innerHTML = Cards.CARDS.map(function (card, i) {
      return '<div class="paycard card-' + i + '" data-card="' + card.id + '">' +
        '<div class="card-top">' +
          '<div class="card-issuer">' + card.issuer + '</div>' +
          '<div class="card-chip"></div>' +
        '</div>' +
        '<div class="card-number">•••• •••• •••• ' + card.last4 + '</div>' +
        '<div class="card-bottom">' +
          '<div class="card-holder">' + card.holder + '</div>' +
          '<div class="card-network">' + card.network + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ---------- saldo ja tapahtumat ----------
  function renderBalance() {
    document.getElementById('balanceText').textContent = fmtEUR(state.balance);
  }

  function txRowHTML(t) {
    return '<div class="tx-row">' +
      '<div class="tx-icon">' + t.icon + '</div>' +
      '<div class="tx-info">' +
        '<div class="tx-name">' + t.name + '</div>' +
        '<div class="tx-meta">' + fmtTime(t.ts) + ' · ' + t.method + '</div>' +
      '</div>' +
      '<div class="tx-amount">-' + fmtEUR(t.amount) + '</div>' +
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
    if (state.tx.length === 0) {
      sub.textContent = 'Ei vielä tapahtumia';
      list.innerHTML = '<div class="empty-state"><div class="emoji">📄</div>' +
        '<p>Tapahtumat näkyvät täällä maksun jälkeen.</p></div>';
      return;
    }
    sub.textContent = state.tx.length + (state.tx.length === 1 ? ' tapahtuma' : ' tapahtumaa');

    var groups = {};
    var order = [];
    state.tx.forEach(function (t) {
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

  function addTransaction(payment, method) {
    state.balance = Math.max(0, state.balance - payment.amount);
    state.tx.unshift({
      name: payment.name, icon: payment.icon, amount: payment.amount,
      ts: Date.now(), method: method
    });
    saveState();
    renderBalance();
    renderRecent();
    renderHistory();
  }

  // ---------- navigointi ----------
  var SCREENS = ['wallet', 'history', 'scan'];
  var TITLES = { wallet: 'Lompakko', history: 'Historia', scan: 'Skannaa' };

  function showScreen(name) {
    SCREENS.forEach(function (s) {
      document.getElementById('screen-' + s).classList.toggle('active', s === name);
    });
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.screen === name);
    });
    document.getElementById('pageTitle').textContent = TITLES[name];
  }

  document.querySelectorAll('.navbtn').forEach(function (btn) {
    btn.addEventListener('click', function () { showScreen(btn.dataset.screen); });
  });

  // ---------- korttipinon avaus ----------
  var cardStack = document.getElementById('cardStack');
  var expanded = false;
  cardStack.addEventListener('click', function (e) {
    if (!e.target.closest('.card-0')) return;
    expanded = !expanded;
    cardStack.classList.toggle('expanded', expanded);
  });

  // ---------- NFC-maksu ----------
  var overlay = document.getElementById('tapOverlay');
  var tapStatus = document.getElementById('tapStatus');
  var tapAmount = document.getElementById('tapAmount');
  var nfcIcon = document.getElementById('nfcIcon');
  var timers = [];

  function startTapFlow() {
    var payment = Cards.randomMerchant();
    overlay.classList.add('show', 'pulsing');
    overlay.classList.remove('success');
    tapStatus.textContent = 'Napauta laitetta maksupäätteeseen';
    tapAmount.textContent = fmtEUR(payment.amount);
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
      addTransaction(payment, 'Napauta ja maksa');
      closeTapFlow();
    }, 3100));
  }

  function closeTapFlow() {
    timers.forEach(clearTimeout);
    timers = [];
    overlay.classList.remove('show', 'pulsing', 'success');
  }

  document.getElementById('payBtn').addEventListener('click', startTapFlow);
  document.getElementById('tapCancel').addEventListener('click', closeTapFlow);

  // ---------- QR-skannauksen mockup ----------
  document.getElementById('fakeScanBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Tunnistetaan…';
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = 'Simuloi QR-tunnistus';
      showScreen('wallet');
      setTimeout(startTapFlow, 250);
    }, 1200);
  });

  // ---------- käynnistys ----------
  renderCards();
  renderBalance();
  renderRecent();
  renderHistory();
})();
