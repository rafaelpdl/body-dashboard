# Deployment

The dashboard is served straight from this repository by GitHub Pages —
no build step, no workflow. Every file it needs sits at the repository root.

**URL:** https://rafaelpdl.github.io/body-dashboard/

## One-time setup (manual, ~15 seconds)

GitHub Pages cannot be switched on through the API by an automated agent, so
this step has to be done once by hand:

1. Open **https://github.com/rafaelpdl/body-dashboard/settings/pages**
2. Under **Build and deployment → Source**, choose **Deploy from a branch**
3. Branch: **`main`**, folder: **`/ (root)`**
4. **Save**

The first deployment takes a minute or two. After that, every push to `main`
republishes automatically.

## Why it works from the repository root

- `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` and
  `icons/` are all at the top level.
- Every asset reference is **relative**, so they resolve correctly under the
  `/body-dashboard/` sub-path rather than the domain root.
- `.nojekyll` stops GitHub from running the files through Jekyll.

## After deploying

1. Open the URL in the browser you use on the iPhone.
2. Import your private history once — **Data & backup → Import JSON**
   (that file lives in Files/iCloud Drive and must never be committed here).
3. Build the Shortcut with [SHORTCUT_SETUP.md](SHORTCUT_SETUP.md), pasting this
   exact URL into its final steps.
4. Add the **Shortcut** — not the web page — to the Home Screen.

## Updating the dashboard

Push to `main`. Pages republishes, and `sw.js` is network-first, so a reload in the
browser picks up the new code. Locally stored measurements are never touched by
a deployment.
