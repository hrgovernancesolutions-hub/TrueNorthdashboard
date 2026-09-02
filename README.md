# True North Dashboard — HTML Recreation

A fully interactive, client-side recreation of the Power BI report **"True North Dashboard"**
(`TN_Dashboard_Copy.pbix`). No Power BI, server, or database is required to view it — open
`index.html` in a browser, or host the folder on SharePoint.

## What this is

The original PBIX embeds a compiled data model (58,627 rows, 1 table: **Master Data**). This
project extracts that model directly (via `pbixray`), so every number here is computed from the
**real underlying data**, not hard-coded or guessed.

## Project structure

```
dashboard/
├── index.html                     # dashboard shell
├── css/style.css                  # all styling
├── js/app.js                      # data loading, filtering, chart/table rendering
├── data/dashboard_data.js         # extracted, cleaned, dictionary-encoded dataset (~2 MB)
├── assets/vendor/d3.min.js        # D3.js, vendored locally (no external CDN dependency)
├── scripts/
│   ├── update_dashboard.py        # regenerates dashboard_data.js from a fresh export
│   ├── refresh_monthly.bat        # double-click helper (Windows)
│   ├── refresh_monthly.sh         # double-click helper (Mac/Linux)
│   └── incoming/                  # drop the month's export file here
└── README.md
```

## How to view it

**Download and unzip the whole project folder first** — `index.html` needs its sibling `css/`,
`js/`, `data/`, and `assets/` folders next to it to work. Opening a lone, separately-downloaded
`index.html` with none of those alongside it will show an unstyled page with no data.

Once the folder is intact, just double-click `index.html` to open it in a browser — no web
server, build step, or SharePoint app registration required. The dataset is deliberately shipped
as `data/dashboard_data.js` (a `<script>` file that sets a JS variable) rather than
`dashboard_data.json`, specifically so it still loads when the file is opened directly from disk:
browsers block a `file://` page from `fetch()`-ing local JSON files as a security measure, but a
plain `<script src="...">` include has no such restriction. This also means the dashboard works
identically whether it's opened locally or served over http(s) from SharePoint.

For SharePoint hosting: upload the whole `dashboard/` folder to a document library and open
`index.html` from there, or add it to a page via the **File Viewer** / **Embed** web part.

## Power BI → HTML mapping

| Power BI visual | HTML equivalent | Notes |
|---|---|---|
| Card ("Conversations") | KPI tile | Raw row count, same as the original |
| Bubble Chart (Akvelon) — Categories | D3 packed-bubble chart | Top 24 categories + one "Other" bubble for the long tail (156 categories total; showing all would be unreadable) |
| Treemap — Clients | D3 treemap | All 88 clients shown |
| Bar Chart — Contact Type | Custom D3 stacked bar, Year→Month drill | Click a year bar to drill into its months; "← All years" to go back |
| Pivot Table — Mailbox × Quarter | HTML table | Sortable columns, click a row/column header to filter |
| Pivot Table — Category (self cross-tab) | Searchable/sortable HTML table | |
| Pivot Table — Solution (self cross-tab) | Searchable/sortable HTML table | 9,220 distinct values; search to narrow |
| Slicer — Client | Multi-select dropdown with search | |
| Slicer — Date (Created) | Preset buttons + custom range pickers | See "Date filter behavior" below |
| Cross-filtering between visuals | Click any bubble/bar/treemap segment/table row to add a filter chip | Chips stack; "Clear all filters" resets everything |

## Date filter behavior (a deliberate change from the saved PBIX)

The saved Power BI file had a **rolling "last 2 months" report-level filter** stacked on top of
a **2024‑09‑02 → 2026‑07‑31 on-canvas slicer**, which together limited the live report to ~349
of the 58,627 rows. Per your instruction, this HTML dashboard **defaults to full history**
(2018‑04‑17 → 2026‑08‑01) with all filters fully interactive, including a "Last 2 months" preset
if you want to reproduce the original's rolling window on demand.

## Count semantics (a deliberate match to the saved PBIX)

The original report has **no DAX measures** — every number is an implicit **COUNT of matching
rows**. Per your instruction, this dashboard replicates that exactly, including that:
- rows with the same Ticket ID can be counted more than once (there are 35,363 rows with a
  Ticket ID but only 21,150 distinct IDs), and
- the 23,264 rows in the "True North (Escalation)" mailbox have no Ticket ID at all (they read
  as internal escalation log entries rather than formal helpdesk tickets).

If you'd rather see a distinct-ticket count alongside the row count later, that's a small addition
to `app.js` — flagging it here since it was explicitly deferred, not overlooked.

## Known limitations / things not fully replicated

| Power BI feature | Limitation in this build |
|---|---|
| Akvelon Bubble Chart's proprietary packing/styling | D3's pack algorithm is used instead — visually similar, not pixel-identical |
| PBI's "highlight" cross-filtering (dims other visuals without removing them) | This build uses hard filtering (removes non-matching data) instead of soft highlighting — arguably clearer, but a different interaction model |
| `Sheet1.Status` formatting reference found in the pivot table's raw definition | There is no "Status" column anywhere in the data model. This looks like a leftover from an earlier version of the report. Not implemented — flag for the report owner rather than guessed at |
| Unused "ClusterMap" custom visual registered in the PBIX | Not on the report page, so not recreated |
| PBI theme-based coloring | Hardcoded CSS palette matching the original "Classroom" theme's hex values, including the explicit orange override for "Phone" |

## Validation checklist

Every figure below was cross-checked between the extracted Power BI data model and this HTML
dashboard's full-history view:

| Metric | Power BI (extracted) | HTML dashboard | Match? |
|---|---|---|---|
| Total rows | 58,627 | 58,627 | ✅ |
| Quarter: Q1 | 16,166 | 16,166 | ✅ |
| Quarter: Q2 | 16,586 | 16,586 | ✅ |
| Quarter: Q3 | 12,239 | 12,239 | ✅ |
| Quarter: Q4 | 13,636 | 13,636 | ✅ |
| Mailbox: True North (Escalation) | 23,264 | 23,264 | ✅ |
| Mailbox: Customer Success | 21,817 | 21,817 | ✅ |
| Mailbox: True Advocate | 13,546 | 13,546 | ✅ |
| Category: Termination | 7,572 | 7,572 | ✅ |
| Category: Invoice and Bill reconciliation | 4,889 | 4,889 | ✅ |
| Solution: (Blank) | 26,862 | 26,862 | ✅ |
| Solution: "enrollment" | 1,811 | 1,811 | ✅ |

## Cosmetic customization

- **Logo**: replace `assets/logo.svg` with your actual company logo (same filename, or update the
  `<img src="...">` path in `index.html`'s header). The shipped file is a placeholder.
- **Title color**: the "True North Dashboard" title uses the `--navy` CSS variable in
  `css/style.css` -- change that one value to adjust it everywhere.

## Data quality: case/whitespace duplicates are merged automatically

Real exports sometimes have the same value typed differently by different agents over time --
"Phone" vs "phone", "QCR Holdings" vs "QCR holding", extra spaces, etc. Every refresh
(`update_dashboard.py`, and therefore both `refresh_monthly.bat`/`.sh`) now automatically merges
any values that are identical once case and leading/trailing whitespace are ignored, keeping
whichever spelling appears most often in the data as the display label. The refresh summary
prints exactly what got merged, e.g.:

```
=== Case/whitespace duplicates merged this run ===
  [contactType] merged "phone" (628) -> "Phone"
  [client] merged "abcm" (1221) -> "ABCM"
```

**This is deliberately conservative** -- it only merges values that are the *same string* apart
from case/whitespace. It will not merge things like "Acme Truck Line Inc" and "Acme Truck Lines",
or "O'Rourke" and "O'Rourke Bros." -- those differ by more than case, and could plausibly be
different entities (a parent company vs. a subsidiary, a rename, etc.). Merging those requires a
judgment call about your actual clients, so I didn't guess -- if you want a name unified across
variants like that, tell me which ones and I'll add them as an explicit mapping in the script.

## Monthly data refresh (no client-facing upload UI)

The dashboard itself has **no upload button, admin panel, or edit mode** — the client only ever
sees the read-only view. Refreshing the data is something you do on your own machine, entirely
separate from the published dashboard; nothing about the refresh process is visible to whoever
you present it to.

**Easiest way (no command line):**
1. Export the latest data from the source system.
2. Drop that file into `scripts/incoming/`.
3. Double-click `scripts/refresh_monthly.bat` (Windows) or `scripts/refresh_monthly.sh`
   (Mac/Linux). It automatically picks the newest file in `incoming/`, validates it, merges any
   case/whitespace duplicate values (see below), and regenerates `data/dashboard_data.js`.
4. When it finishes, it **automatically opens the folder with the new file selected**, so it's
   one drag away from GitHub Desktop (or github.com's drag-and-drop upload area). Commit and push
   as usual.

**Deploying straight to your GitHub repo, with zero manual copying:** open
`scripts/refresh_monthly.bat` (or `.sh`) in a text editor and set the `GITHUB_REPO_PATH` line
near the top to your local repo's `data/dashboard_data.js` path, e.g.:
```
set "GITHUB_REPO_PATH=C:\Users\You\Documents\GitHub\true-north-dashboard\data\dashboard_data.js"
```
Once that's set, every future refresh writes the file directly into your cloned repo — the only
manual step left each month is committing and pushing in GitHub Desktop.

**Command-line equivalent**, if you'd rather run it directly:
```bash
python scripts/update_dashboard.py --input "Master Data Export.xlsx" --output data/dashboard_data.js
```

The script validates that the required columns are present (Client, Ticket ID, Date (Created),
Category, Contact Type, Solution, Mailbox 2, Quarter) and prints a summary (row count, date
range, nulls per column, and any values it merged) so you can catch a bad export before it goes
live.

```
Source system export (Excel/CSV)
        │
        ▼
scripts/refresh_monthly.bat / .sh  (or update_dashboard.py directly)
        │
        ▼
data/dashboard_data.js   (written directly into your GitHub repo, if configured)
        │
        ▼
Commit + push in GitHub Desktop  →  index.html picks it up automatically
```

If you want this to run unattended, the script itself has no SharePoint or web dependency — it
just needs the export file on disk, so any scheduler (Task Scheduler, a nightly job, a Power
Automate flow that drops the export locally) can call it.

## Presenting to a client / embedding on your website

The dashboard is a set of static files, so "hosting" it just means putting the `dashboard/`
folder somewhere reachable by a URL, then embedding that URL with an `<iframe>`. A few ways to
host it, roughly in order of how public-facing your site is:

- **Your website's own file hosting** — if your CMS lets you upload static assets (a "files" or
  "resources" area), upload the whole folder there. This is the most reliable path for a
  client-facing public site.
- **A static hosting service** (Netlify, Vercel, GitHub Pages, AWS S3 + CloudFront) — drag-and-drop
  the folder, get a URL, done. Good if your website platform doesn't support raw file uploads.
- **SharePoint** — works well for an internal audience, but SharePoint pages generally require
  the viewer to be signed into your tenant, so this is not a good fit if the client is external
  and won't have SharePoint access.

Once it's hosted at some URL (e.g. `https://your-domain.com/true-north-dashboard/index.html`),
the embed code for your website is:

```html
<iframe
  src="https://your-domain.com/true-north-dashboard/index.html"
  style="width: 100%; height: 1100px; border: none;"
  loading="lazy"
  title="True North Dashboard">
</iframe>
```

Most website builders (WordPress, Squarespace, Wix, Webflow) have an "Embed" or "Custom HTML"
block that accepts exactly this snippet — paste it in and set the block's width to 100%.

**Optional — auto-sizing height:** the dashboard already posts its actual content height to its
parent window on every render, so the iframe doesn't need a fixed guessed height or its own
scrollbar. To use it, add this small script once on the page that hosts the iframe (give the
iframe an `id` to match):

```html
<iframe id="tn-dashboard" src="https://your-domain.com/true-north-dashboard/index.html"
        style="width:100%; border:none;" title="True North Dashboard"></iframe>
<script>
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "tn-dashboard-resize") {
      document.getElementById("tn-dashboard").style.height = e.data.height + "px";
    }
  });
</script>
```

This is optional — a fixed height like the first snippet works fine too, since the tables scroll
internally.

I can't host the files myself or hand you a live link directly from here — hosting has to happen
on infrastructure you control (your website, or one of the services above) since that's where the
client will actually be viewing it from.


