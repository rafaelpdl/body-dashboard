# Deployment

The dashboard is published from this repository with GitHub Pages.

**URL:** https://rafaelpdl.github.io/body-dashboard/

## How it is wired

- The site is the repository root: `index.html`, `app.js`, `styles.css`, `sw.js`,
  `manifest.webmanifest`, `.nojekyll` and `icons/`. All asset references are relative,
  so everything resolves correctly under the `/body-dashboard/` sub-path.
- `.nojekyll` stops GitHub from running the files through Jekyll.
- `.github/workflows/pages.yml` publishes the root on every push to `main`.
  It uses `actions/configure-pages` with `enablement: true`, so it turns Pages on
  by itself the first time it runs.

## If Pages is not serving yet

Open **Settings → Pages** in the repository and, under *Build and deployment*, choose
either:

- **GitHub Actions** — matches the workflow above (recommended), or
- **Deploy from a branch** → branch `main`, folder `/ (root)` — equally valid; the
  workflow then simply becomes redundant.

Then wait for the deployment to finish and reload the URL.

## After deploying

1. Open the URL in Safari on the iPhone.
2. Import your private history once — **Data & backup → Import JSON**
   (that file lives in Files/iCloud Drive and must never be committed here).
3. Build the Shortcut with [SHORTCUT_SETUP.md](SHORTCUT_SETUP.md), pasting this exact
   URL into its final steps.
4. Add the **Shortcut** — not the web page — to the Home Screen.

## Updating the dashboard

Push to `main`. The workflow redeploys, and `sw.js` is network-first, so a reload in
Safari picks up new code. Locally stored measurements are untouched by deployments.
