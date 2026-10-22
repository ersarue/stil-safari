# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.3.x   | Yes       |
| < 0.3   | No        |

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** for this repository
(Security → Report a vulnerability). If that is unavailable, contact the
maintainer through the contact method on their GitHub profile. Do not open a
public issue for a security report.

Include:

- Stil version and build number (shown in the toolbar popup).
- macOS and Safari versions.
- Steps to reproduce and the expected impact.
- Any proof of concept, logs or screenshots that do not contain personal data.

Do not include browsing history, cookies, account credentials or other personal
data. A minimal reproduction with invented URLs is preferred.

We aim to acknowledge reports within 7 days and to agree on a disclosure
timeline with you. Please allow time for a fix before publishing details.

## In scope

- Extension sandbox escapes or privilege escalation.
- Injection into pages beyond the intended filtering behavior.
- Settings or pause-list corruption that silently disables protection.
- Unintended data collection or transmission.
- Supply-chain or build-script issues that affect released builds.

## Out of scope

- Ads, trackers or cookie banners that are not blocked. These are filter-list
  gaps; report them as a normal bug with the site URL.
- YouTube changing how ads are delivered, or ads appearing briefly before
  filtering applies.
- Sites detecting that Stil is installed.
- Issues that require an already-compromised Mac, a malicious Safari extension,
  or the user disabling Safari protections.
- Missing hardening that has no demonstrated security impact.

## Safe harbor

We will not pursue legal action for good-faith security research that follows
this policy, avoids privacy violations and data destruction, and gives us a
reasonable opportunity to fix the issue before disclosure.
