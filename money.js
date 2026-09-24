/* Lompakko — rahalogiikka.
 *
 * Kaikki summat käsitellään kokonaislukuina sentteinä. Liukuluvut eivät sovi
 * rahaan: 0.1 + 0.2 === 0.30000000000000004, ja virhe kertautuu saldoa
 * laskettaessa. Sentit muunnetaan euroiksi vasta näytettäessä.
 */
(function (global) {
  'use strict';

  function fromEuros(euros) {
    return Math.round(Number(euros) * 100);
  }

  function toEuros(cents) {
    return cents / 100;
  }

  /* "12,50" tai "12.50" -> 1250. Palauttaa null, jos syöte ei kelpaa. */
  function parse(input) {
    if (input == null) return null;
    var cleaned = String(input).replace(/\s/g, '').replace(',', '.');
    if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return null;
    var value = parseFloat(cleaned);
    if (isNaN(value)) return null;
    return fromEuros(value);
  }

  /* Pelkkä luku ilman valuuttaa: 1250 -> "12,50" */
  function plain(cents) {
    return toEuros(cents).toLocaleString('fi-FI', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /* Valuutan näyttömuoto on käyttäjän valittavissa asetuksista. */
  function format(cents, style) {
    var value = plain(cents);
    switch (style) {
      case 'prefix': return '€ ' + value;
      case 'code': return value + ' EUR';
      default: return value + ' €';
    }
  }

  function sum(list, pick) {
    return list.reduce(function (total, item) {
      return total + (pick ? pick(item) : item);
    }, 0);
  }

  global.Money = {
    fromEuros: fromEuros,
    toEuros: toEuros,
    parse: parse,
    plain: plain,
    format: format,
    sum: sum
  };
})(window);
