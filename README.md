# Lompakko

Apple Pay -tyylinen **simuloitu** maksulompakko selaimessa. Vanilla HTML, CSS ja
JavaScript — ei build-työkaluja eikä riippuvuuksia.

> **Huom:** Kaikki kortit, saldot ja tapahtumat ovat keksittyjä. Pankkien nimet
> ovat pelkkää tekstiä, eikä sovellus käytä oikeita logoja tai brändi-ilmettä.
> Mitään oikeaa maksuliikennettä ei tapahdu, eikä sovellus ole yhteydessä
> mihinkään pankkiin tai maksujärjestelmään. Tiedot tallentuvat vain selaimen
> `localStorage`-muistiin.

## Ominaisuudet

**Lompakko ja kortit**

- korttipino, jossa näkyy enintään kolme korttia ja loput merkintänä
- useita kortteja: lisäys, poisto, arkistointi ja oletuskortin valinta
- korttityypit Nordea Debit, Nordea Business, S-Pankki Visa, OP Debit
  Mastercard ja Danske Bank, jokaisella oma väripaletti
- keksitty kortinhaltija, satunnaiset viimeiset 4 numeroa, voimassaoloaika ja
  oma saldo per kortti
- kortin omat asetukset: uudelleennimeäminen, kuukausittainen kulukatto,
  jäädytys ja korttitietojen paljastus tunnistautumisen takana
- haku kortin nimellä, pankilla, tyypillä tai numerolla

**Tunnistautuminen**

- sovellus avautuu lukittuna ja lukkiutuu taustalle siirtyessä
- simuloitu biometrinen tunnistus ja PIN-varatapa (demon PIN on `1234`),
  yritysrajoitus ja 30 sekunnin odotus kolmen väärän koodin jälkeen
- uudelleentunnistautuminen kortin lisäykseen ja poistoon, jäädytyksen
  vapautukseen, kulukaton nostamiseen, riitautukseen ja korttitietoihin

**Maksaminen**

- maksutavan valinta maksuhetkellä, estot näkyvissä jo listassa
- maksun tilakone: odottaa lukijaa → lukuvirhe tai aikakatkaisu → laitteen
  tunnistus → päätteen PIN, jos raja ylittyy → valtuutus → hyväksytty tai
  hylätty syykoodilla
- lähimaksuraja 50 € ja kumulatiivinen 150 €, jonka jälkeen pääte pyytää
  PIN-koodin; onnistunut PIN nollaa kertymän
- pankin hylkäykset syykoodeilla 05, 51, 57, 91 ja 65 selityksineen
- jäädytetty kortti, ylittyvä kulukatto ja riittämätön kate estävät maksun

**Raha ja tapahtumat**

- kaikki summat kokonaislukuina sentteinä, ei liukulukuja
- katevaraus kirjautuu tilille viiveellä; juomaraha voi nostaa summaa ja
  ennakkovaraus korvautuu todellisella summalla
- lompakko näyttää käytettävissä olevan summan, avoimet varaukset ja kirjatun
  saldon erikseen
- kuitti: kauppias, tila, kortti, maksutapa, aika, paikkakunta, toimialakoodi,
  viite, valtuutusnumero ja hylkäyksen vastauskoodi
- riitautus ("En tunnista tätä maksua"), kortin jäädytys suoraan kuitista ja
  tuen yhteystiedot
- historia päivittäin ryhmiteltynä ja suodatettavissa kortin mukaan

**Asetukset ja saavutettavuus**

- käyttäjän nimi ja avatar, oletuskortti, yksityisyystila, valuutan näyttömuoto
- turvallisuusosio: sovelluslukko, maksujen vahvistus ja välitön lukitus
- tekstikoot rem-yksiköissä: toimii 200 %:n tekstikoolla ilman leikkautumista
- navigaatio on tablist, ikonit piilotettu ruudunlukijalta, alapaneeli vangitsee
  fokuksen ja sulkeutuu Esc-näppäimellä
- kontrastit vähintään 4.5:1, kosketusalueet vähintään 44 px

**PWA**

- asennettavissa kotivalikkoon, musta teema, standalone-tila
- service worker tallentaa sovelluskuoren offline-käyttöä varten

## Ajaminen paikallisesti

Sovellus on staattinen sivusto. Käynnistä kevyt palvelin projektin juuressa:

```bash
python3 -m http.server 8000
```

Avaa selaimessa <http://localhost:8000/>.

Muita vaihtoehtoja:

```bash
npx serve .          # Node.js
php -S localhost:8000
```

Sovelluksen voi avata myös suoraan tiedostosta (`index.html` selaimeen), mutta
service worker ja offline-tila vaativat `http://`- tai `https://`-yhteyden.

## Tiedostorakenne

```
index.html      rakenne ja näkymät
style.css       tyylit
money.js        rahalogiikka: sentit, muotoilu ja jäsennys
auth.js         tunnistautuminen: lukitusnäyttö, biometria ja PIN
cards.js        korttikatalogi, väripaletit, kauppiaat ja korttien luonti
payment.js      maksun tilakone, rajat ja pankin vastaukset
app.js          näkymät, tila, kortit, kuitit ja asetukset
manifest.json   PWA-manifesti
sw.js           service worker (offline-välimuisti)
icons/          sovellusikonit (192x192, 512x512)
```

## Mitä demo ei ole

Demo mallintaa käyttöliittymän ja sen tilat, ei maksujärjestelmää. Oikeassa
sovelluksessa ainakin nämä olisivat toisin:

- saldo ja tapahtumat tulisivat palvelimelta, eivät selaimen muistista
- tunnistautuminen tehtäisiin laitteen suojatussa elementissä (Face ID,
  sormenjälki, WebAuthn) — demossa PIN on tilassa selkotekstinä
- korttinumeroa ei tallenneta demossakaan: mukana on vain maksutunnus ja neljä
  viimeistä numeroa, mutta oikea tokenisointi tehtäisiin palvelinpäässä
- kuvakaappausta ei selaimessa voi estää; natiivisovelluksessa korttinäkymä
  merkittäisiin järjestelmän lipulla (esim. Android `FLAG_SECURE`)
- pankin vastaukset, hylkäyssyyt ja varausten kirjautuminen ovat simuloituja

## Demon nollaus

Asetukset → **Palauta demon oletustiedot** nollaa kortit ja tapahtumat.
Vaihtoehtoisesti tyhjennä selaimen `localStorage`-avain `lompakko_state_v3`.
