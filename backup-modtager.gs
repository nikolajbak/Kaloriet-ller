/**
 * Modtager til Kaloriedagbogens automatiske sikkerhedskopi.
 *
 * Gemmer hver kopi som en JSON-fil i en mappe på dit eget Google Drive.
 * Koden kører på din konto — dine data passerer ikke nogen tredjepart.
 *
 * SÅDAN TAGES DEN I BRUG
 *  1. Gå til script.google.com og vælg Nyt projekt
 *  2. Slet det, der står, og indsæt hele denne fil
 *  3. Tryk Implementer  ->  Ny implementering
 *  4. Vælg typen Webapp
 *  5. Kør som:        Mig
 *     Hvem har adgang: Alle
 *  6. Godkend adgangen til Drive, når Google spørger
 *  7. Kopiér webapp-adressen, der ender på /exec
 *  8. Sæt den ind i appen under Indstillinger -> Adresse til automatisk kopi
 *
 * Adressen er din nøgle. Del den ikke — enhver med den kan lægge filer
 * i mappen. Skal den skiftes, laves blot en ny implementering.
 */

var MAPPE  = 'Kaloriedagbog';   // mappen oprettes automatisk i roden af dit Drive
var BEHOLD = 30;                // antal kopier der beholdes; ældre ryger i papirkurven

function doPost(e) {
  try {
    var indhold = e && e.postData ? e.postData.contents : '';
    if (!indhold) return svar('tom');

    // Kontrollér at det ligner en kopi fra appen, så mappen ikke fyldes med vrøvl
    var data = JSON.parse(indhold);
    if (!data || data.type !== 'kaloriedagbog') return svar('ukendt format');

    var mappe = hentMappe(MAPPE);
    var stempel = Utilities.formatDate(new Date(), 'Europe/Copenhagen', 'yyyy-MM-dd-HHmm');
    var dage = data.dage ? Object.keys(data.dage).length : 0;
    mappe.createFile('kaloriedagbog-' + stempel + '-' + dage + 'dage.json',
                     indhold, MimeType.PLAIN_TEXT);
    ryd(mappe);
    return svar('ok');
  } catch (fejl) {
    return svar('fejl: ' + fejl);
  }
}

// Åbnes adressen i en browser, kan man se at modtageren lever
function doGet() {
  var mappe = hentMappe(MAPPE);
  var n = 0, it = mappe.getFiles();
  while (it.hasNext()) { it.next(); n++; }
  return svar('Modtageren er klar. Der ligger ' + n + ' kopier i mappen ' + MAPPE + '.');
}

function hentMappe(navn) {
  var it = DriveApp.getFoldersByName(navn);
  return it.hasNext() ? it.next() : DriveApp.createFolder(navn);
}

function ryd(mappe) {
  var filer = [], it = mappe.getFiles();
  while (it.hasNext()) filer.push(it.next());
  filer.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  filer.slice(BEHOLD).forEach(function (f) { f.setTrashed(true); });
}

function svar(tekst) {
  return ContentService.createTextOutput(tekst)
    .setMimeType(ContentService.MimeType.TEXT);
}
