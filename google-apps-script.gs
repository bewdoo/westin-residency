/**
 * The Westin Residences — Lead Capture Endpoint (Google Apps Script)
 * --------------------------------------------------------------------
 * Receives the website's "Request a Private Viewing" form, appends each
 * lead as a row in this Google Sheet, and emails a notification.
 *
 * SETUP (one time):
 *   1. Open a new Google Sheet at https://sheets.new
 *   2. Extensions ▸ Apps Script
 *   3. Delete the sample code, paste THIS file, Save.
 *   4. Deploy ▸ New deployment ▸ type "Web app"
 *        - Execute as:  Me
 *        - Who has access:  Anyone
 *   5. Authorize when prompted (it's your own script).
 *   6. Copy the Web app URL (ends in /exec) and paste it into index.html
 *      as LEAD_ENDPOINT.
 *   To update the code later: Deploy ▸ Manage deployments ▸ edit ▸ Version: New.
 */

var NOTIFY_EMAIL = 'unplugged.realty11@gmail.com';   // leads are emailed here
var SHEET_NAME   = 'Leads';

function doPost(e) {
  try {
    var p  = (e && e.parameter) ? e.parameter : {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        'Timestamp','First Name','Last Name','Phone','Email','Residence Type',
        'gclid','fbclid','utm_source','utm_medium','utm_campaign','utm_term','utm_content',
        'Page URL','Referrer'
      ]);
      sheet.getRange('1:1').setFontWeight('bold');
    }

    sheet.appendRow([
      new Date(),
      p.firstName || '', p.lastName || '', p.phone || '', p.email || '', p.residenceType || '',
      p.gclid || '', p.fbclid || '', p.utm_source || '', p.utm_medium || '', p.utm_campaign || '',
      p.utm_term || '', p.utm_content || '', p.page_url || '', p.referrer || ''
    ]);

    var subject = 'New Westin Residences Lead — ' + (p.firstName || '') + ' ' + (p.lastName || '');
    var body =
      'New enquiry from the website:\n\n' +
      'Name:      ' + (p.firstName || '') + ' ' + (p.lastName || '') + '\n' +
      'Phone:     ' + (p.phone || '') + '\n' +
      'Email:     ' + (p.email || '') + '\n' +
      'Interest:  ' + (p.residenceType || '') + '\n\n' +
      '— Attribution —\n' +
      'gclid:     ' + (p.gclid || '—') + '\n' +
      'fbclid:    ' + (p.fbclid || '—') + '\n' +
      'Source:    ' + (p.utm_source || '—') + ' / ' + (p.utm_medium || '—') + ' / ' + (p.utm_campaign || '—') + '\n' +
      'Page:      ' + (p.page_url || '—') + '\n' +
      'Referrer:  ' + (p.referrer || '—') + '\n';

    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: subject,
      body: body,
      replyTo: p.email || NOTIFY_EMAIL
    });

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('The Westin Residences lead endpoint is live.');
}
