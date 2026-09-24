/* Lompakko — tunnistautuminen.
 *
 * Demossa biometriikka on simuloitu: oikeassa sovelluksessa tässä kutsuttaisiin
 * alustan tunnistautumista (Face ID / sormenjälki / WebAuthn), eikä PIN-koodia
 * säilytettäisi laitteella selkotekstinä vaan tunnistautuminen tehtäisiin
 * suojatussa elementissä.
 *
 * Sama komponentti hoitaa kolme asiaa:
 *   1. sovelluksen lukitusnäytön (ei peruutettavissa)
 *   2. uudelleentunnistautumisen arkaluonteisiin toimiin (peruutettavissa)
 *   3. maksun PIN-vahvistuksen, kun lähimaksuraja ylittyy
 */
(function (global) {
  'use strict';

  var PIN_LENGTH = 4;
  var MAX_ATTEMPTS = 3;
  var LOCKOUT_MS = 30000;

  var el = {};
  var config = { getPin: function () { return '1234'; } };
  var pending = null;
  var locked = false;
  var entered = '';
  var attempts = 0;
  var lockoutUntil = 0;
  var lastFocus = null;

  function init(options) {
    config = Object.assign(config, options || {});
    el.overlay = document.getElementById('authScreen');
    el.title = document.getElementById('authTitle');
    el.sub = document.getElementById('authSub');
    el.icon = document.getElementById('authIcon');
    el.bioBtn = document.getElementById('authBioBtn');
    el.pinBtn = document.getElementById('authPinBtn');
    el.cancelBtn = document.getElementById('authCancelBtn');
    el.pinArea = document.getElementById('authPinArea');
    el.error = document.getElementById('authError');

    el.bioBtn.addEventListener('click', runBiometric);
    el.pinBtn.addEventListener('click', showKeypad);
    el.cancelBtn.addEventListener('click', function () { finish(false); });
    el.overlay.addEventListener('keydown', onKeydown);
    buildKeypad();
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && pending && pending.cancellable) {
      finish(false);
      return;
    }
    if (e.key === 'Tab') trapFocus(e);
    if (el.pinArea.hidden) return;
    if (/^[0-9]$/.test(e.key)) pressDigit(e.key);
    if (e.key === 'Backspace') pressDelete();
  }

  /* Fokus ei saa karata lukitun näytön taakse. */
  function trapFocus(e) {
    var focusable = el.overlay.querySelectorAll('button:not([hidden]):not([disabled])');
    var list = Array.prototype.filter.call(focusable, function (node) {
      return node.offsetParent !== null;
    });
    if (list.length === 0) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function buildKeypad() {
    var dots = '<div class="pin-dots" id="authDots" aria-hidden="true">';
    for (var d = 0; d < PIN_LENGTH; d++) dots += '<span class="pin-dot"></span>';
    dots += '</div>';

    var keys = '';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach(function (k) {
      if (k === '') {
        keys += '<span class="pin-key placeholder"></span>';
      } else if (k === '⌫') {
        keys += '<button type="button" class="pin-key" data-key="del" aria-label="Poista numero">⌫</button>';
      } else {
        keys += '<button type="button" class="pin-key" data-key="' + k + '">' + k + '</button>';
      }
    });

    el.pinArea.innerHTML = dots + '<div class="pin-keypad">' + keys + '</div>';
    el.dots = document.getElementById('authDots');

    el.pinArea.addEventListener('click', function (e) {
      var btn = e.target.closest('.pin-key');
      if (!btn) return;
      if (btn.dataset.key === 'del') pressDelete();
      else pressDigit(btn.dataset.key);
    });
  }

  function renderDots() {
    Array.prototype.forEach.call(el.dots.children, function (dot, i) {
      dot.classList.toggle('filled', i < entered.length);
    });
  }

  function pressDigit(digit) {
    if (Date.now() < lockoutUntil) return;
    if (entered.length >= PIN_LENGTH) return;
    entered += digit;
    renderDots();
    if (entered.length === PIN_LENGTH) setTimeout(checkPin, 140);
  }

  function pressDelete() {
    entered = entered.slice(0, -1);
    renderDots();
  }

  function checkPin() {
    if (entered === String(config.getPin())) {
      attempts = 0;
      finish(true, 'pin');
      return;
    }
    attempts += 1;
    entered = '';
    renderDots();
    el.pinArea.classList.add('shake');
    setTimeout(function () { el.pinArea.classList.remove('shake'); }, 400);

    if (attempts >= MAX_ATTEMPTS) {
      lockoutUntil = Date.now() + LOCKOUT_MS;
      attempts = 0;
      showError('Liian monta yritystä. Odota 30 sekuntia.');
      startLockoutCountdown();
    } else {
      showError('Väärä PIN-koodi. Yrityksiä jäljellä: ' + (MAX_ATTEMPTS - attempts) + '.');
    }
  }

  function startLockoutCountdown() {
    var timer = setInterval(function () {
      var left = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        showError('');
        return;
      }
      showError('Liian monta yritystä. Odota ' + left + ' s.');
    }, 1000);
  }

  function showError(message) {
    el.error.textContent = message || '';
    el.error.hidden = !message;
  }

  function runBiometric() {
    if (Date.now() < lockoutUntil) return;
    el.overlay.classList.add('verifying');
    el.bioBtn.disabled = true;
    el.sub.textContent = pending && pending.biometricLabel
      ? pending.biometricLabel + ' · tunnistetaan…'
      : 'Tunnistetaan…';
    setTimeout(function () {
      el.overlay.classList.remove('verifying');
      el.bioBtn.disabled = false;
      finish(true, 'biometric');
    }, 900);
  }

  function showKeypad() {
    el.pinArea.hidden = false;
    el.bioBtn.hidden = true;
    el.pinBtn.hidden = true;
    el.sub.textContent = 'Syötä PIN-koodi';
    entered = '';
    renderDots();
    var firstKey = el.pinArea.querySelector('.pin-key');
    if (firstKey) firstKey.focus();
  }

  /* Avaa tunnistautumisen. Palauttaa lupauksen, joka täyttyy tunnistautumisen
   * tavalla ('biometric' | 'pin') tai hylkäytyy, jos käyttäjä peruuttaa. */
  function open(options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      if (pending) {
        reject(new Error('Tunnistautuminen on jo käynnissä'));
        return;
      }
      lastFocus = document.activeElement;
      pending = {
        resolve: resolve,
        reject: reject,
        cancellable: options.cancellable !== false,
        biometricLabel: options.biometricLabel || 'Face ID'
      };

      el.title.textContent = options.title || 'Tunnistaudu';
      el.sub.textContent = options.sub || 'Vahvista henkilöllisyytesi jatkaaksesi';
      el.icon.textContent = options.icon || '🫆';
      el.bioBtn.textContent = 'Tunnistaudu · ' + pending.biometricLabel;
      el.bioBtn.hidden = false;
      el.bioBtn.disabled = false;
      el.pinBtn.hidden = false;
      el.pinArea.hidden = true;
      el.cancelBtn.hidden = !pending.cancellable;
      showError('');
      entered = '';

      el.overlay.hidden = false;
      requestAnimationFrame(function () {
        el.overlay.classList.add('show');
        el.bioBtn.focus();
      });
    });
  }

  function finish(success, method) {
    if (!pending) return;
    var current = pending;
    pending = null;
    el.overlay.classList.remove('show');
    setTimeout(function () {
      if (!pending) el.overlay.hidden = true;
    }, 250);

    if (success) {
      if (locked) locked = false;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      current.resolve(method || 'biometric');
    } else {
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      current.reject(new Error('peruutettu'));
    }
  }

  /* Sovelluksen lukitus: ei peruutettavissa. */
  function lockApp() {
    if (locked) return Promise.resolve();
    locked = true;
    return open({
      title: 'Lompakko on lukittu',
      sub: 'Tunnistaudu avataksesi lompakon',
      icon: '🔒',
      cancellable: false
    }).then(function (method) {
      locked = false;
      if (config.onUnlock) config.onUnlock(method);
      return method;
    });
  }

  /* Uudelleentunnistautuminen arkaluonteiseen toimeen. */
  function require(reason, sub) {
    return open({
      title: reason,
      sub: sub || 'Vahvista henkilöllisyytesi jatkaaksesi',
      icon: '🫆',
      cancellable: true
    });
  }

  function isLocked() { return locked; }
  function isBusy() { return pending !== null; }

  global.Auth = {
    init: init,
    open: open,
    lockApp: lockApp,
    require: require,
    isLocked: isLocked,
    isBusy: isBusy
  };
})(window);
