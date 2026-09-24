# Lompakko

Apple Pay -tyylinen **simuloitu** maksulompakko selaimessa. Projekti on tehty
pelkällä vanilla HTML:llä, CSS:llä ja JavaScriptilla — ei build-työkaluja eikä
riippuvuuksia.

> **Huom:** Kaikki kortit, saldot ja tapahtumat ovat keksittyjä. Pankkien nimet
> ovat pelkkää tekstiä, eikä sovellus käytä oikeita logoja tai brändi-ilmettä.
> Mitään oikeaa maksuliikennettä ei tapahdu, eikä sovellus ole yhteydessä
> mihinkään pankkiin tai maksujärjestelmään. Tiedot tallentuvat vain selaimen
> `localStorage`-muistiin.

## Ominaisuudet

- **Lompakko** — korttipino, valitun kortin saldo ja "Napauta ja maksa"
  -painike NFC-animaatiolla
- **Kortit** — useita kortteja: lisäys, poisto ja oletuskortin valinta
  - valittavat korttityypit: Nordea Debit, Nordea Business, S-Pankki Visa,
    OP Debit Mastercard, Danske Bank — jokaisella oma väripaletti
  - keksitty kortinhaltija, satunnaiset viimeiset 4 numeroa, voimassaoloaika
    ja oma saldo per kortti
  - kortin omat asetukset: uudelleennimeäminen, kuukausittainen kulukatto ja
    kortin jäädytys
- **Maksu** — maksutavan valinta maksuhetkellä; jäädytetty kortti, ylittyvä
  kulukatto tai riittämätön kate hylkää maksun ja näyttää virheen
- **Skannaa** — QR-skannauksen mockup (simuloitu kamera)
- **Historia** — tapahtumat päivittäin ryhmiteltynä, suodatettavissa kortin
  mukaan
- **Asetukset** — käyttäjän nimi ja avatar, oletuskortti, yksityisyystila
  (saldot piiloon) ja valuutan näyttömuoto
- **PWA** — asennettavissa kotivalikkoon, toimii offline-tilassa

## Ajaminen paikallisesti

Sovellus on staattinen sivusto. Helpoin tapa on käynnistää kevyt
kehityspalvelin projektin juuressa:

```bash
python3 -m http.server 8000
```

Avaa sitten selaimessa <http://localhost:8000/>.

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
cards.js        korttikatalogi, väripaletit ja korttien luonti
app.js          sovelluslogiikka: tila, näkymät, maksu ja asetukset
manifest.json   PWA-manifesti
sw.js           service worker (offline-välimuisti)
icons/          sovellusikonit (192x192, 512x512)
```

## Demon nollaus

Asetukset → **Palauta demon oletustiedot** nollaa kortit ja tapahtumat.
Vaihtoehtoisesti tyhjennä selaimen `localStorage`-avain `lompakko_state_v2`.
