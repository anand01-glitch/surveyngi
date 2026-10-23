# JCET Student Survey

Student Expectations & College Experience Survey for **Jawaharlal College of Engineering and Technology**:
a public survey site plus a password-protected admin dashboard with live analytics. Branded with the Nehru Group of Institutions logo and colours.

No `npm install` needed. It only needs [Node.js](https://nodejs.org) 18 or newer.

## Run it

```bash
node server.js
```

| Page | URL |
|---|---|
| Survey (share this link with students) | http://localhost:3000/ |
| Admin analytics | http://localhost:3000/admin |

Other devices on the same Wi-Fi/LAN can open it using this computer's IP address, e.g. `http://192.168.1.20:3000`.

## Admin password

The default password is `jcet@admin2026`. **Change it before sharing the site:**

```powershell
# Windows PowerShell
$env:ADMIN_PASSWORD = "your-strong-password"; node server.js
```
```bash
# macOS / Linux
ADMIN_PASSWORD="your-strong-password" node server.js
```

Other settings (all optional environment variables): `PORT` (default 3000), `SESSION_SECRET` (keeps admins signed in across restarts), `DATA_FILE` (where responses are stored).

## What's in the admin dashboard

- **Overview**: total responses, responses-over-time trend, key findings (top factor, learning style, career goal, etc.)
- **Sections A to G**: a chart for every question. Multi-select questions show the % of respondents choosing each option; rating questions show average plus the 1-5 spread
- **Heatmap**: average importance of each decision factor by planned programme
- **Student voices**: the open-ended answers (Q29/Q30) with search and a most-mentioned-words chart
- **Filters**: period, class/year, planned programme, study location. Every chart updates
- **All responses**: student name + email, search (by name, email or any answer), view a full response, delete one, and **Export CSV** for Excel
- **Report** button (top bar): opens a print-ready, multi-page insights report of exactly what you are viewing (same filters) and offers it as a PDF. See below
- **Share survey** section: the survey link, a QR code, and a printable poster. See below
- Every chart has a **Table** toggle; light/dark theme toggle

To preview the dashboard with fake data, click **Load demo data** on the empty dashboard (or run `node scripts/seed.js`). Demo rows are tagged and removed with **Remove demo data**. Real responses are never touched.

## One-click insights report

Click **Report** in the dashboard's top bar. A new tab opens with a formatted report and your browser's print dialog; choose **Save as PDF** (or print it). The report respects the dashboard filters, so you can produce one for, say, "Engineering, last 30 days".

It contains: a cover with key numbers, auto-written **key findings**, **priorities at a glance** (what decides the choice, facilities to invest in, support to strengthen), then every section's charts, the programme heatmap, and the written comments. It is 8 A4 pages with full data.

- Student **names and emails are never included**; comments show only class and programme.
- Untick **Include student comments** in the report toolbar to leave the comments out.
- Under 30 responses it adds a "small sample" warning.

## Share the survey: link, QR code and poster

Open **Share survey** in the dashboard.

1. **Pick the address.** `localhost` only works on this computer. The dropdown lists this computer's **Wi-Fi/network address** (for example `http://192.168.1.20:3000/`), which works for phones on the same network while the server is running, or choose **Custom address** and paste your public web address once the survey is online.
2. **Copy the link**, or send it by **WhatsApp**, **Email**, or the phone's share sheet.
3. **QR code**: download as **PNG** or **SVG**, or click **Print poster** for an A4 poster (logo, headline, big QR code, steps) to print or save as PDF.

The QR code is generated in the browser and was checked with an independent decoder at all error-correction levels. Print it at least 3 cm wide.

## How the survey works

- 30 questions in 7 sections (A to G), exactly as on the paper form.
- Q1-Q28 are required, Q29-Q30 (open-ended) are optional.
- "Select maximum N" questions enforce the limit: **Q15, Q17, Q20, Q21, Q23, Q27 = 5**, **Q26 = 3**. Once the limit is reached the remaining options lock until one is unticked. The server re-checks this.
- Answers are saved on the student's device as a draft, so a refresh doesn't lose progress.
- **Your details** (full name + email) come first and are required. Both are validated in the browser and again on the server, then shown to the admin team in the responses table, detail view and CSV export. To make either optional, set `required: false` in the `details` list in `public/questions.js`. IP addresses and phone numbers are never stored.

## Files

```
server.js            HTTP server, API, validation, admin auth, CSV export
public/questions.js  The 30 questions (single source of truth for form, server and charts)
public/index.html    Survey page          public/js/survey.js   form logic
public/admin/        Admin dashboard      public/js/admin.js    analytics + charts
public/css/          base.css (theme tokens), site.css, admin.css, report.css, poster.css
public/js/analytics.js  shared aggregation + chart markup (dashboard and report)
public/admin/report.html, poster.html   printable report and QR poster
public/vendor/qrcode.js  QR encoder (qrcode-generator 1.4.4, MIT, unmodified)
data/responses.json  Created automatically; contains all submissions (back this up)
```

To change a question or option, edit `public/questions.js`. Existing responses keep their stored text, so avoid renaming options after collecting data.

## Logo and theme

The Nehru Group logo lives at `public/assets/logo.jpg` and is used in the header, hero, footer, admin login and admin sidebar. To swap it, replace that file (keep it square-ish; the header crops the emblem out of it using CSS in `public/css/base.css`, `.logo-mark`).

Brand colours (from the logo) are tokens at the top of `public/css/base.css`: sky blue `#00AEEF`, orange `#F7941D`, indigo `#2E3192`. Light is the default theme; the moon/sun button switches to dark.

## Deploying

Any host that can run Node (a VPS, Render, Railway, etc.) works. Keep `data/` on persistent storage, set `ADMIN_PASSWORD` and `SESSION_SECRET`, and serve over HTTPS.
