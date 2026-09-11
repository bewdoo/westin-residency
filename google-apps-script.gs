/**
 * The Westin Residences — Lead Capture Endpoint (Google Apps Script)
 * --------------------------------------------------------------------
 * Receives the website's "Request a Private Viewing" form, appends each
 * lead as a row in this Google Sheet, emails a notification, and relays a
 * server-side **Lead** event to the Meta Conversions API (CAPI).
 *
 * WHY THE CAPI CALL LIVES HERE: the website is static (GitHub Pages), so it
 * has no server of its own and cannot hold a Meta access token — anything in
 * the page source is public. This script is the only server the lead touches,
 * so it is where the token belongs.
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
 *
 * CAPI SETUP (one time) — Project Settings ▸ Script Properties ▸ Add:
 *        META_PIXEL_ID        3520075144822718
 *        META_CAPI_TOKEN      <paste the Conversions API token>
 *        META_TEST_EVENT_CODE <TESTxxxxx — only while testing, then DELETE it>
 *   The token is generated in Events Manager ▸ your dataset ▸ Settings ▸
 *   Conversions API ▸ Generate access token. Never put it in index.html.
 */

var NOTIFY_EMAIL = 'unplugged.realty11@gmail.com';   // leads are emailed here
var SHEET_NAME   = 'Leads';
var META_API_VER = 'v21.0';

// Force a value to be stored as TEXT so Sheets doesn't treat "+91…" / "=" / "-" / "@"
// as a formula (which causes #ERROR!). Also blocks CSV/formula injection.
function safe(v) {
  v = (v == null ? '' : String(v));
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

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

    // Relay to Meta BEFORE writing the row so we can record the outcome, but
    // never let a Meta failure cost us the lead — sendMetaCapiLead never throws.
    var capiStatus = sendMetaCapiLead(p);

    // Append exactly the original 15 columns. The CAPI result is written
    // separately, by header lookup, so it can never land on a column the
    // team added themselves (Notes, Status, …).
    sheet.appendRow([
      new Date(),
      safe(p.firstName), safe(p.lastName), safe(p.phone), safe(p.email), safe(p.residenceType),
      safe(p.gclid), safe(p.fbclid), safe(p.utm_source), safe(p.utm_medium), safe(p.utm_campaign),
      safe(p.utm_term), safe(p.utm_content), safe(p.page_url), safe(p.referrer)
    ]);
    try {
      sheet.getRange(sheet.getLastRow(), capiColumn_(sheet)).setValue(safe(capiStatus));
    } catch (e) { Logger.log('CAPI column write failed: %s', e); }

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
      'Referrer:  ' + (p.referrer || '—') + '\n' +
      'Meta CAPI: ' + capiStatus + '\n';

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

/**
 * Column index of the 'CAPI' header, creating it at the first free column
 * if absent. Looked up by NAME so adding/reordering columns never causes
 * the status to overwrite someone's data.
 */
function capiColumn_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toUpperCase() === 'CAPI') return i + 1;
  }
  var col = lastCol + 1;
  sheet.getRange(1, col).setValue('CAPI').setFontWeight('bold');
  return col;
}

function doGet() {
  return ContentService.createTextOutput('The Westin Residences lead endpoint is live.');
}

// ═══════════════════════════════════════════════════════════════════════
//  META CONVERSIONS API
// ═══════════════════════════════════════════════════════════════════════

/** SHA-256 → lowercase hex. Apps Script returns SIGNED bytes, so re-base negatives. */
function sha256Hex(s) {
  if (!s) return null;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    var h = b.toString(16);
    hex += (h.length === 1 ? '0' + h : h);
  }
  return hex;
}

/** Meta wants email lowercased and trimmed before hashing. */
function normEmail(v) {
  v = String(v || '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : '';
}

/** Meta wants digits only, country code included, no "+" or separators. */
function normPhone(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.slice(0, 2) === '00') d = d.slice(2);            // 00-prefixed international
  if (d.length === 10) d = '91' + d;                     // bare Indian mobile
  else if (d.length === 11 && d.charAt(0) === '0') d = '91' + d.slice(1);
  return d.length >= 11 ? d : '';                        // too short to be dialable
}

/** Names: lowercase, trimmed, letters only (Meta strips punctuation/digits). */
function normName(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-zÀ-ɏ\s'-]/g, '').trim();
}

/**
 * Relay one Lead to Meta. Returns a short status string for the sheet/email.
 * NEVER throws — lead capture must survive any Meta/network failure.
 */
function sendMetaCapiLead(p) {
  try {
    var props     = PropertiesService.getScriptProperties();
    var pixelId   = props.getProperty('META_PIXEL_ID');
    var token     = props.getProperty('META_CAPI_TOKEN');
    var testCode  = props.getProperty('META_TEST_EVENT_CODE');
    if (!pixelId || !token) return 'skipped (no credentials)';

    var em = sha256Hex(normEmail(p.email));
    var ph = sha256Hex(normPhone(p.phone));
    var fn = sha256Hex(normName(p.firstName));
    var ln = sha256Hex(normName(p.lastName));

    var userData = {};
    if (em) userData.em  = [em];
    if (ph) userData.ph  = [ph];
    if (fn) userData.fn  = [fn];
    if (ln) userData.ln  = [ln];
    // fbp/fbc are the browser-cookie identifiers — they are ALREADY opaque ids,
    // so Meta requires them raw (unhashed). They carry most of the match weight
    // on paid traffic, which is why index.html forwards them with the form.
    if (p.fbp) userData.fbp = String(p.fbp);
    if (p.fbc) userData.fbc = String(p.fbc);
    if (p.user_agent) userData.client_user_agent = String(p.user_agent);
    // NOTE: client_ip_address is deliberately absent. Apps Script sees Google's
    // own egress IP, not the visitor's — sending it would actively poison the
    // match rather than help it.

    var eventTime = parseInt(p.event_time, 10);
    if (!eventTime || isNaN(eventTime)) eventTime = Math.floor(Date.now() / 1000);

    var evt = {
      event_name:       'Lead',
      event_time:       eventTime,
      action_source:    'website',
      // Same id the browser Pixel sent, so Meta collapses the two into one Lead.
      event_id:         String(p.event_id || ''),
      event_source_url: String(p.page_url || 'https://indiawestinresidences.com/'),
      user_data:        userData,
      custom_data: {
        content_name: String(p.residenceType || 'Residence Enquiry'),
        currency:     'INR',
        value:        0
      }
    };
    if (!evt.event_id) delete evt.event_id;

    var body = { data: [evt], access_token: token };
    if (testCode) body.test_event_code = testCode;

    var res = UrlFetchApp.fetch(
      'https://graph.facebook.com/' + META_API_VER + '/' + pixelId + '/events',
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      }
    );

    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code === 200) {
      var keys = [];
      if (em) keys.push('em'); if (ph) keys.push('ph');
      if (p.fbc) keys.push('fbc'); if (p.fbp) keys.push('fbp');
      return 'ok [' + keys.join('+') + ']';
    }
    Logger.log('Meta CAPI %s: %s', code, text);
    return 'error ' + code + ' ' + text.slice(0, 180);
  } catch (err) {
    Logger.log('Meta CAPI exception: %s', err);
    return 'exception ' + String(err).slice(0, 180);
  }
}

/**
 * Run this once from the Apps Script editor (Run ▸ testMetaCapi) to send a
 * dummy Lead. With META_TEST_EVENT_CODE set you'll see it land live in
 * Events Manager ▸ your dataset ▸ Test events. Check Executions for the log.
 */
function testMetaCapi() {
  var status = sendMetaCapiLead({
    firstName: 'Test', lastName: 'Lead',
    email: 'test.lead@example.com', phone: '+91 73038 88722',
    residenceType: '4 BHK',
    page_url: 'https://indiawestinresidences.com/',
    event_id: 'test-' + Date.now(),
    event_time: Math.floor(Date.now() / 1000),
    user_agent: 'Mozilla/5.0 (Apps Script CAPI test)'
  });
  Logger.log('testMetaCapi → %s', status);
}
