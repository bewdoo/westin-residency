# Setup — Lead Capture, Pixel, GCLID & Analytics

Everything is already wired into `index.html`. You only need to (1) stand up the
Google Sheet endpoint and (2) paste in your real tracking IDs. ~15 minutes.

---

## 1. Lead form → Google Sheet + email  (required)

The form posts to a **Google Apps Script Web App** that writes each lead to a
Google Sheet and emails **unplugged.realty11@gmail.com**.

1. Create a sheet: go to <https://sheets.new>
2. **Extensions ▸ Apps Script**.
3. Delete the sample, paste the contents of **`google-apps-script.gs`**, then **Save**.
4. **Deploy ▸ New deployment ▸** select type **Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Click **Deploy**, then **Authorize access** (approve your own script — Google
   may show an "unverified" warning; choose *Advanced ▸ Go to project*).
6. Copy the **Web app URL** (ends in `/exec`).
7. In `index.html`, find:
   ```js
   const LEAD_ENDPOINT = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL';
   ```
   and paste your URL between the quotes.

✅ Test: open the live site, submit the form, confirm a row appears in the sheet
and an email arrives. (Leads also store gclid/fbclid/utm for attribution.)

> Changing the script later? **Deploy ▸ Manage deployments ▸ edit (✏️) ▸ Version: New**,
> otherwise the old version keeps running.

---

## 2. Meta (Facebook) Pixel  (required)

1. In **Meta Events Manager** copy your **Pixel ID** (a long number).
2. In `index.html`, **find & replace** every `META_PIXEL_ID` with it (appears 2×).
3. The page fires **PageView** on load and **Lead** on a successful form submit.

---

## 2b. Meta Conversions API (CAPI)  (required for ad optimisation)

The Pixel alone loses conversions to iOS/ITP, ad-blockers and cookie expiry.
CAPI sends the same **Lead** a second time from a server, so Meta still counts
it. Both copies carry the **same `event_id`**, so Meta keeps one Lead, not two.

**Where the server is.** This site is static (GitHub Pages), so it has no server
and *cannot* hold a Meta access token — anything in the page source is public
and stealable. The Apps Script from step 1 already receives every lead, so it is
the server. `google-apps-script.gs` does the relay; nothing secret is in `index.html`.

### Setup

1. **Events Manager ▸ your dataset ▸ Settings ▸ Conversions API ▸
   Generate access token.** Copy it.
2. In the Apps Script editor: **⚙ Project Settings ▸ Script Properties ▸
   Add script property** — add these:

   | Property | Value |
   |---|---|
   | `META_PIXEL_ID` | `3520075144822718` |
   | `META_CAPI_TOKEN` | the token from step 1 |
   | `META_TEST_EVENT_CODE` | `TEST…` from Events Manager ▸ **Test events** — *delete once verified* |

   > Paste the token **only** here. Never into `index.html`, never into git.

3. **Deploy ▸ Manage deployments ▸ edit (✏️) ▸ Version: New** — otherwise the
   old code keeps running and no events are sent.

### Verify

- In the Apps Script editor choose **`testMetaCapi`** and press **Run**. With
  `META_TEST_EVENT_CODE` set, the Lead appears live in **Events Manager ▸
  Test events**. The `Executions` log shows the returned status.
- Then submit the real form once. In **Test events** you should see the Lead
  listed as received from **both** Browser and Server, marked *Deduplicated*.
- Delete `META_TEST_EVENT_CODE` when done, and redeploy.
- Day-to-day: the **CAPI** column in the Leads sheet records the outcome per
  lead (`ok [ph+fbp+fbc]`, or the error). The notification email shows it too.
- After ~a day of traffic, **Events Manager ▸ Lead ▸ Event Match Quality**
  should show coverage from the server, not just the browser.

### What gets sent (and what does not)

Hashed with SHA-256 before leaving the script: **phone**, **first name**,
**last name** (if present). Sent raw because they are already opaque IDs:
**`_fbp`** / **`_fbc`** cookies and the browser user-agent — `index.html`
forwards these with the form because only the browser can read them.

- **Email is not sent — the forms no longer collect one.** Email is the single
  strongest match key; adding the field back would lift match quality most.
  Weighed against the 3-field form's conversion rate, that's a CRO call.
- **IP address is deliberately not sent.** Apps Script sees Google's egress IP,
  not the visitor's, so sending it would corrupt the match rather than help.
- A Meta outage never costs you a lead: the relay is wrapped so the row and the
  email are written regardless.

---

## 2c. Lead-status feedback — MQL / SQL  (optional, high value)

Meta optimises for whatever you report. Reporting only form fills teaches it
to find more form fills, qualified or not. Type a qualification into the sheet
and it is sent to Meta as its own conversion, so campaigns can chase leads the
team actually qualified.

### Setup (once)

1. In the Apps Script editor run **`installStatusTrigger`**. It creates the edit
   trigger and adds two columns: **Status** (you edit) and **Status Sent**
   (written by the script — leave it alone). Authorise when prompted; this adds
   a trigger scope the earlier run did not need.
2. Optional sanity check: run **`testStatusColumns`** and read Executions. Every
   column should resolve to a number, none `MISSING`. It contacts Meta not at all.
3. In **Events Manager ▸ Custom conversions ▸ Create**, make one per event —
   `MQL` and `SQL` — then point campaign optimisation at those instead of Lead.

### Using it

Type `MQL` or `SQL` into the Status column. Case doesn't matter. Anything else
(`Junk`, `Lost`, blank) is ignored. The Status Sent column records what went,
e.g. `MQL ok [ph+fbp] · SQL ok [ph+fbp]`.

Add your own stages by editing `STATUS_EVENTS` at the top of the script:

```javascript
var STATUS_EVENTS = {
  'MQL': 'MQL',
  'SQL': 'SQL',
  'SITE VISIT': 'SiteVisit',   // add freely
  'BOOKED':     'Purchase'
};
```

### How it behaves

- **Sends once.** Re-editing a row, or flipping MQL → SQL → MQL, never resends;
  each event fires a single time per row.
- **Safe to retry.** The `event_id` is stable per row and event, so even a
  duplicate delivery is deduplicated by Meta rather than double-counted.
- **Not deduplicated against the Lead** — a qualification is a *different*
  conversion, deliberately counted separately.
- **`action_source: system_generated`**, because it did not happen in a browser.
- **Matching** uses phone, name and the `_fbp`/`_fbc` cookies stored at lead
  time. This is why those columns exist — without them a qualification sent days
  later would match on phone alone.
- **Never blocks you.** A Meta failure is recorded in Status Sent; your edit
  still saves.

---

## 3. Google Ads + GCLID  (required)

1. In **Google Ads ▸ Goals ▸ Conversions**, create/open a conversion action
   (e.g. "Website Lead"). Use **"Use Google tag" / gtag.js**.
2. Note two values:
   - **Conversion ID** — looks like `AW-1234567890`
   - **Conversion label** — looks like `AbC-D_efGh`
3. In `index.html`, **find & replace**:
   - `AW_CONVERSION_ID`    → your `AW-…` ID (appears in `<head>` and in the script)
   - `AW_CONVERSION_LABEL` → your label
4. GCLID is captured automatically from the ad-click URL (`?gclid=…`), stored for
   90 days, attached to every lead row, and a **conversion** fires on submit.

> For offline/CRM conversion imports, the **gclid column in the sheet** is what
> Google Ads needs — upload it back with the deal value to close the loop.

---

## 4. Google Analytics 4  (optional — you can skip/delete)

The same gtag.js already includes a GA4 slot.
- Keep it: **find & replace** `GA4_MEASUREMENT_ID` with your `G-XXXXXXXXXX`.
  It logs page views + a `generate_lead` event on submit.
- Don't want GA4: delete the line in `<head>`:
  ```js
  gtag('config', 'GA4_MEASUREMENT_ID');   // GA4 — OPTIONAL ...
  ```

---

## Placeholder checklist (search the file for each)

| Token | Where | Replace with |
|---|---|---|
| `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL` | script | Apps Script `/exec` URL |
| `META_PIXEL_ID` (×2) | head | Meta Pixel ID |
| `AW_CONVERSION_ID` (×2) | head + script | `AW-…` Google Ads ID |
| `AW_CONVERSION_LABEL` | script | Google Ads conversion label |
| `GA4_MEASUREMENT_ID` | head | `G-…` (or delete) |
| `META_PIXEL_ID` / `META_CAPI_TOKEN` | Apps Script **Script Properties** (not the HTML) | CAPI credentials |

Once all placeholders are replaced, commit and push — GitHub Pages redeploys
automatically. No build step.

---

### Notes / FAQ
- **Do I deploy first or add IDs first?** Either order works — it's a static site,
  so you can push these updates anytime. Just make sure the **form endpoint + IDs
  are in before you start driving paid traffic**, or those early leads/conversions
  won't be captured.
- **Privacy:** consider adding a short consent line / privacy-policy link near the
  form before running EU/UK traffic. India (DPDP) — link a privacy policy.
- **Spam:** a hidden honeypot field silently drops bots. If spam grows, add
  Cloudflare Turnstile or Google reCAPTCHA.
