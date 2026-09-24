/* Lompakko — maksun tilakone.
 *
 * Oikeassa lähimaksussa on paljon muitakin polkuja kuin onnistuminen:
 *
 *   valinta -> odottaa lukijaa -> (lukuvirhe | aikakatkaisu)
 *           -> laitteen tunnistus -> (päätteen PIN, jos raja ylittyy)
 *           -> valtuutus pankilta -> hyväksytty | hylätty syykoodilla
 *
 * Summat ovat sentteinä. Pankin vastaus on simuloitu, mutta syykoodit ja
 * rajat noudattavat sitä, mitä kortilla oikeasti tapahtuu.
 */
(function (global) {
  'use strict';

  /* Lähimaksun rajat Suomessa: yksittäinen maksu ja kumulatiivinen summa,
   * jonka jälkeen pääte pyytää PIN-koodin. */
  var CONTACTLESS_LIMIT_CENTS = 5000;
  var CUMULATIVE_LIMIT_CENTS = 15000;

  var READER_TIMEOUT_MS = 20000;
  var READ_ERROR_CHANCE = 0.15;
  var DECLINE_CHANCE = 0.12;

  /* Pankin hylkäyssyyt. code = ISO 8583 -vastauskoodi, jonka myös kuittiin
   * merkitään; retry kertoo, kannattaako samaa maksua yrittää uudelleen. */
  var DECLINE_REASONS = [
    { code: '05', title: 'Pankki hylkäsi maksun', note: 'Ota yhteyttä pankkiisi. Kortti on kunnossa, mutta tätä maksua ei hyväksytty.', retry: false },
    { code: '51', title: 'Katetta ei riitä', note: 'Tilillä ei ole tarpeeksi katetta tähän maksuun.', retry: false },
    { code: '57', title: 'Maksua ei sallita', note: 'Tätä korttia ei voi käyttää tähän maksuun.', retry: false },
    { code: '91', title: 'Pankkiin ei saada yhteyttä', note: 'Yhteyskatko pankkiin. Yritä hetken kuluttua uudelleen.', retry: true },
    { code: '65', title: 'Vahvista PIN-koodilla', note: 'Pankki pyytää vahvistamaan maksun PIN-koodilla.', retry: true, requirePin: true }
  ];

  var deps = null;
  var el = {};
  var session = null;
  var timers = [];
  var countdownTimer = null;

  function init(options) {
    deps = options;
    el.overlay = document.getElementById('tapOverlay');
    el.status = document.getElementById('tapStatus');
    el.amount = document.getElementById('tapAmount');
    el.note = document.getElementById('tapNote');
    el.code = document.getElementById('tapCode');
    el.icon = document.getElementById('nfcIcon');
    el.primary = document.getElementById('tapPrimary');
    el.secondary = document.getElementById('tapSecondary');

    el.primary.addEventListener('click', function () {
      if (session && session.primaryAction) session.primaryAction();
    });
    el.secondary.addEventListener('click', close);
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }

  /* ---------- näkymän päivitys ---------- */

  function render(view) {
    el.overlay.classList.toggle('pulsing', !!view.pulsing);
    el.overlay.classList.toggle('success', view.tone === 'success');
    el.overlay.classList.toggle('error', view.tone === 'error');
    el.overlay.classList.toggle('waiting', view.tone === 'waiting');

    el.icon.textContent = view.icon || '📶';
    el.status.textContent = view.status || '';
    el.amount.textContent = view.amount || '';

    el.note.textContent = view.note || '';
    el.note.hidden = !view.note;

    el.code.textContent = view.code ? 'Vastauskoodi ' + view.code : '';
    el.code.hidden = !view.code;

    if (view.primary) {
      el.primary.hidden = false;
      el.primary.textContent = view.primary;
      session.primaryAction = view.onPrimary;
    } else {
      el.primary.hidden = true;
      session.primaryAction = null;
    }

    el.secondary.hidden = !view.secondary;
    el.secondary.textContent = view.secondary || 'Peruuta';
  }

  /* ---------- tilat ---------- */

  function begin(card, payment) {
    clearTimers();
    session = {
      card: card,
      payment: payment,
      attempts: 0,
      pinVerified: false,
      primaryAction: null
    };
    el.overlay.hidden = false;
    requestAnimationFrame(function () { el.overlay.classList.add('show'); });
    waitForReader();
  }

  /* 1. Odotetaan, että puhelin viedään lukijalle. */
  function waitForReader() {
    session.attempts += 1;
    var deadline = Date.now() + READER_TIMEOUT_MS;

    render({
      icon: '📶',
      pulsing: true,
      tone: 'waiting',
      status: 'Vie puhelin lukijalle',
      amount: deps.fmtMoney(session.payment.amountCents),
      note: deps.cardTitle(session.card) + ' · ' + session.payment.name,
      primary: 'Simuloi lukijaan vienti',
      onPrimary: onTap,
      secondary: 'Peruuta'
    });

    countdownTimer = setInterval(function () {
      var left = Math.ceil((deadline - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        timedOut();
        return;
      }
      el.note.textContent = deps.cardTitle(session.card) + ' · aikaa ' + left + ' s';
    }, 1000);
  }

  function timedOut() {
    clearTimers();
    render({
      icon: '⏱',
      tone: 'error',
      status: 'Aikakatkaisu',
      amount: deps.fmtMoney(session.payment.amountCents),
      note: 'Maksupäätteeseen ei saatu yhteyttä ajoissa.',
      primary: 'Yritä uudelleen',
      onPrimary: waitForReader,
      secondary: 'Sulje'
    });
  }

  /* 2. Kortin luku voi epäonnistua — tämä on arkipäivää oikeassa käytössä. */
  function onTap() {
    clearTimers();
    if (Math.random() < READ_ERROR_CHANCE && session.attempts < 3) {
      render({
        icon: '📡',
        tone: 'error',
        status: 'Korttia ei luettu',
        amount: deps.fmtMoney(session.payment.amountCents),
        note: 'Pidä puhelinta lähempänä lukijaa ja yritä uudelleen.',
        primary: 'Yritä uudelleen',
        onPrimary: waitForReader,
        secondary: 'Peruuta'
      });
      return;
    }
    checkBlockers();
  }

  /* 3. Paikalliset estot: jäädytys, kulukatto, kate. */
  function checkBlockers() {
    var blocked = deps.blocker(session.card, session.payment.amountCents);
    if (blocked) {
      render({
        icon: '✕',
        tone: 'error',
        status: 'Maksu hylättiin',
        amount: deps.fmtMoney(session.payment.amountCents),
        note: blocked,
        secondary: 'Sulje'
      });
      deps.onDeclined(session.card, session.payment, { local: true, note: blocked });
      return;
    }
    deviceAuth();
  }

  /* 4. Laitteen tunnistus ennen valtuutusta. */
  function deviceAuth() {
    if (!deps.requireAuthForPayment()) {
      terminalPin();
      return;
    }
    render({
      icon: '🫆',
      tone: 'waiting',
      status: 'Vahvista maksu',
      amount: deps.fmtMoney(session.payment.amountCents),
      note: 'Tunnistaudu jatkaaksesi'
    });
    deps.authenticate(session.payment.name, deps.fmtMoney(session.payment.amountCents))
      .then(terminalPin)
      .catch(function () { cancelled('Tunnistautuminen peruutettiin.'); });
  }

  /* 5. Lähimaksuraja: iso summa tai kertynyt kumulatiivinen summa pyytää
   *    päätteen PIN-koodin. Onnistunut PIN nollaa kertymän. */
  function terminalPin(force) {
    var amountCents = session.payment.amountCents;
    var cumulative = deps.contactlessSpent();
    var needsPin = force === true ||
      amountCents > CONTACTLESS_LIMIT_CENTS ||
      cumulative + amountCents > CUMULATIVE_LIMIT_CENTS;

    if (!needsPin || session.pinVerified) {
      authorize();
      return;
    }

    var reason = amountCents > CONTACTLESS_LIMIT_CENTS
      ? 'Summa ylittää lähimaksurajan ' + deps.fmtMoney(CONTACTLESS_LIMIT_CENTS) + '.'
      : 'Lähimaksujen kertymä ylittää ' + deps.fmtMoney(CUMULATIVE_LIMIT_CENTS) + '.';

    render({
      icon: '🔢',
      tone: 'waiting',
      status: 'Maksupääte pyytää PIN-koodia',
      amount: deps.fmtMoney(amountCents),
      note: reason
    });

    deps.requestPin(reason).then(function () {
      session.pinVerified = true;
      authorize();
    }).catch(function () {
      cancelled('PIN-koodia ei syötetty.');
    });
  }

  /* 6. Valtuutus pankilta. */
  function authorize() {
    render({
      icon: '🏦',
      tone: 'waiting',
      status: 'Valtuutetaan…',
      amount: deps.fmtMoney(session.payment.amountCents),
      note: 'Odotetaan pankin vastausta'
    });

    later(function () {
      if (Math.random() < DECLINE_CHANCE) {
        var reason = DECLINE_REASONS[Math.floor(Math.random() * DECLINE_REASONS.length)];
        if (reason.requirePin && !session.pinVerified) {
          terminalPin(true);
          return;
        }
        declined(reason);
        return;
      }
      approved();
    }, 1200);
  }

  function declined(reason) {
    render({
      icon: '✕',
      tone: 'error',
      status: reason.title,
      amount: deps.fmtMoney(session.payment.amountCents),
      note: reason.note,
      code: reason.code,
      primary: reason.retry ? 'Yritä uudelleen' : null,
      onPrimary: reason.retry ? waitForReader : null,
      secondary: 'Sulje'
    });
    deps.onDeclined(session.card, session.payment, { code: reason.code, note: reason.title });
  }

  function approved() {
    var method = session.pinVerified ? 'Siru ja PIN' : 'Lähimaksu';
    deps.onApproved(session.card, session.payment, {
      method: method,
      pinUsed: session.pinVerified
    });

    render({
      icon: '✓',
      tone: 'success',
      status: 'Maksu hyväksytty',
      amount: deps.fmtMoney(session.payment.amountCents),
      note: method + ' · ' + deps.cardTitle(session.card),
      secondary: 'Valmis'
    });
    later(close, 2200);
  }

  function cancelled(note) {
    render({
      icon: '✕',
      tone: 'error',
      status: 'Maksu keskeytyi',
      amount: deps.fmtMoney(session.payment.amountCents),
      note: note,
      primary: 'Yritä uudelleen',
      onPrimary: waitForReader,
      secondary: 'Sulje'
    });
  }

  function close() {
    clearTimers();
    el.overlay.classList.remove('show', 'pulsing', 'success', 'error', 'waiting');
    setTimeout(function () { el.overlay.hidden = true; }, 250);
    session = null;
  }

  global.Payment = {
    init: init,
    begin: begin,
    close: close,
    CONTACTLESS_LIMIT_CENTS: CONTACTLESS_LIMIT_CENTS,
    CUMULATIVE_LIMIT_CENTS: CUMULATIVE_LIMIT_CENTS
  };
})(window);
