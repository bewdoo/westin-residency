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
