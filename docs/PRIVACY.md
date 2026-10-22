# Stil privacy policy

**Effective date:** 22 October 2026

Stil is a Safari Web Extension for macOS that blocks common advertising and
measurement hosts and hides supported cookie notices. This policy describes the
current version of the app.

## Summary

Stil has no accounts, no analytics, no advertising and no Stil servers. It does
not send your browsing activity, page content or settings to the developer or to
third parties.

## What Stil stores

Stil stores the following **on your Mac**, in Safari's extension storage:

- whether ad blocking, cookie-banner hiding and the global power switch are on;
- the hostnames you have paused, up to 100.

These settings are used only to apply your choices. They are not transmitted,
sold or shared. You can remove a paused hostname by revisiting the site and
choosing Resume. Deleting the app removes its local container data under normal
macOS behavior.

## What Stil accesses

To do its job, Stil reads the address (hostname) of pages you open and inspects
page content for known cookie notices and ad containers. This processing happens
locally in Safari. Page content, URLs and browsing history are not sent to the
developer.

Safari controls website access. You can limit Stil to specific websites or turn
it off at any time in **Safari → Settings → Extensions**. Stil works only in
Safari and only while the extension is enabled.

## Network activity

Stil does not operate a server and does not download filter lists or executable
code at runtime. Network filtering is performed by Safari using rules bundled
inside the extension. The extension may cause Safari to block requests to
advertising or measurement hosts; it does not proxy, inspect or report those
requests to the developer.

## Third parties

Stil includes third-party filter code licensed under GPL-3.0-or-later. That code
runs locally as part of the extension. It does not create an account or send
data to its authors. See [THIRD_PARTY.md](../THIRD_PARTY.md) for attribution.

Stil does not sell data, share data for advertising, or use third-party
analytics or crash-reporting SDKs.

## Children

Stil is a general-purpose browsing tool and is not directed at children. It does
not knowingly collect personal information from anyone.

## Changes

If this policy changes, the new version will be published at this URL and the
effective date will be updated. Material changes will also be noted in the
app's release notes.

## Contact

Questions about this policy: open an issue at
<https://github.com/ersarue/stil-safari/issues>.
