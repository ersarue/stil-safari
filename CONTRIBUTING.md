# Contributing to Stil

Thanks for helping make browsing quieter. Stil is intentionally small: plain
JavaScript, CSS, generated JSON rules and no runtime dependencies.

By contributing, you agree that your contribution is licensed under
**GPL-3.0-or-later** (see [LICENSE](LICENSE)). Please report security issues
privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## Set up

Requirements: macOS, Node.js 20+, Safari 18.6+ for manual testing, and the full
Xcode app for native builds.

```sh
git clone https://github.com/YOUR-ACCOUNT/stil.git
cd stil
npm ci
npx playwright install chromium
npm test
```

`npm test` builds the rules and icons, then runs the Playwright suite against
the real unpacked extension in Chromium. It does not replace testing in Safari;
use the [Safari smoke check](README.md#safari-smoke-check) for changes that
affect real pages.

To build the native app:

```sh
npm run safari
# with your own bundle identifiers:
BUNDLE_ID=com.example.stil npm run safari
```

Select your development team for both targets in Xcode. The generated project
links `extension/`, so rebuild after changing extension files.

## What to change

- **Network filters:** add a dedicated ad or measurement hostname to
  `filters/ad-domains.txt`, then run `npm run build`. Rules apply to third-party
  subresources only. Never block top-level navigation, shared asset/CDN hosts,
  payment providers or consent libraries.
- **Cookie banners:** add targeted selectors in `extension/selectors.js`.
  Prefer vendor-specific IDs/classes. Avoid broad selectors such as `.modal`,
  text matching "cookie", or general privacy-policy links.
- **YouTube:** the pinned upstream integration lives in `extension/vendor/youtube/`.
  See [Updating the YouTube filters](#updating-the-youtube-filters).
- **Popup and settings:** keep keyboard access, visible focus, light/dark
  support and the existing settings validation in `extension/shared.js`.

## Guidelines

- Keep the extension dependency-free at runtime: no remote scripts, no
  analytics, no network calls other than filtering.
- Never click consent buttons, set consent cookies or make a consent decision
  for the user.
- Preserve exact-host pause semantics. A paused site includes its cross-origin
  frames; other subdomains stay independent.
- Keep cosmetic hiding reversible and do not leave page scrolling locked.
- Test both enabled and paused states, and after a browser restart.
- Run `npm test` and the Safari smoke check before opening a pull request.
- Keep commits focused. Describe user-visible changes and update the README or
  CHANGELOG when behavior changes.

## Adding a filter

1. Add the hostname to `filters/ad-domains.txt`.
2. Run `npm run build` and inspect `extension/rules/ads.json`.
3. Add or extend a test in `tests/extension.spec.mjs` that proves the request is
   blocked and that first-party navigation still works.
4. Run `npm test`.
5. Verify on a real site in Safari that page functionality is intact.

## Updating the YouTube filters

1. Download the desired upstream Safari release and record its SHA-256.
2. Update the release tag and checksum in `scripts/update-youtube.mjs`.
3. Run `npm run update:youtube`; review the diff and upstream changes.
4. Keep version markers in sync (`extension/manifest.json`, popup status and
   README).
5. Run `npm test`, the native build and the YouTube smoke check in Safari.

Do not add a runtime updater that downloads executable filter code. Filter
bundles ship inside the extension.

## Pull requests

Describe the problem, the approach and how you tested it. Include the Safari and
macOS versions used. Screenshots or short recordings are welcome for UI changes.
Maintainers may ask for narrower selectors or additional tests before merging.
