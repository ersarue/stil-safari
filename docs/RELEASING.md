# Releasing Stil

Stil is distributed as a **Developer ID-signed, notarized macOS app** in a DMG on
GitHub Releases. That is what lets people download it, drag it to Applications,
and open it without Terminal, Xcode or Safari developer settings.

Unsigned builds are deliberately not published as official releases. macOS
Gateway and Safari both treat them as untrusted, so they would require a
right-click bypass and **Allow Unsigned Extensions**.

## One-time prerequisites

You need:

1. An active **Apple Developer Program** membership.
2. A **Developer ID Application** certificate with its private key.
3. The Apple **Team ID** shown in the developer portal.
4. An **app-specific password** for the Apple ID used for notarization.
5. Repository admin access to add GitHub Actions secrets.

### Create and export the certificate

1. In Xcode, open **Settings → Accounts** and select your Apple ID.
2. Select your team, click **Manage Certificates**, and add a
   **Developer ID Application** certificate.
3. Open **Keychain Access → My Certificates**, find the certificate, and export
   it as a `.p12` file with a strong password.
4. Base64-encode it for the GitHub secret:

   ```sh
   base64 -i DeveloperID.p12 | pbcopy
   ```

### Create an app-specific password

Sign in at <https://appleid.apple.com>, open **Sign-In and Security →
App-Specific Passwords**, and create one for notarization. Do not use your
normal Apple ID password.

## GitHub secrets

Add these under **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret | Value |
| --- | --- |
| `DEVELOPER_ID_APPLICATION_P12` | Base64-encoded `.p12` certificate |
| `DEVELOPER_ID_APPLICATION_P12_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

The workflow creates a temporary keychain, so no keychain password needs to be
stored.

## Cut a release

1. Confirm the version is the same in `package.json` and
   `extension/manifest.json`. The popup reads the manifest version at runtime.
2. Update `CHANGELOG.md`.
3. Commit the version bump.
4. Tag and push:

   ```sh
   git tag v0.3.0
   git push origin v0.3.0
   ```

The **Release** workflow then:

- runs the test suite;
- checks that the tag matches the package and manifest versions;
- imports the Developer ID certificate;
- generates the Safari Xcode project;
- archives a universal `arm64` + `x86_64` Release build;
- signs the app, extension and DMG with a secure timestamp and hardened runtime;
- submits the DMG to Apple's notary service and staples the ticket;
- computes a SHA-256 checksum;
- publishes the DMG and checksum on GitHub Releases.

If any signing secret is missing or the notarization is rejected, the workflow
fails and **no release is published**. This is intentional.

## Verify a release

Download the DMG and run:

```sh
shasum -a 256 ~/Downloads/Stil-0.3.0.dmg
spctl --assess --type open --context context:primary-signature -v ~/Downloads/Stil-0.3.0.dmg
xcrun stapler validate ~/Downloads/Stil-0.3.0.dmg
```

Then mount it, copy `Stil.app` to Applications, and check:

```sh
codesign --verify --deep --strict --verbose=2 /Applications/Stil.app
spctl --assess --type execute --verbose=4 /Applications/Stil.app
```

A notarized build should be accepted without any Gatekeeper prompt. In Safari,
enable the extension in **Settings → Extensions**; no **Allow Unsigned
Extensions** toggle should be needed.

## Bundle identifier

The release workflow uses `io.github.ersarue.Stil`. Keep it stable after the
first public release: changing the app or extension identifier creates a
different app identity and users may lose their settings or update path.

If you fork the project, change `BUNDLE_ID` in
`.github/workflows/release.yml` and the default in
`scripts/create-safari-project.sh` to an identifier you control.

## Licensing

Stil is GPL-3.0-or-later and includes third-party GPL filter code. Every release
must keep:

- `LICENSE`
- `THIRD_PARTY.md`
- `extension/vendor/youtube/LICENSE.txt`
- `extension/vendor/youtube/provenance.json`
- `extension/vendor/youtube/upstream/`

The GitHub release links to the tagged source, which is the corresponding source
for the binary. Do not remove these notices or publish a binary without the
matching source tag.

## Troubleshooting

- **No identity found after import:** confirm the `.p12` contains both the
  certificate and private key, and that the password is correct.
- **`codesign` cannot access the key:** the
  `security set-key-partition-list` step must run after `security import`.
- **Notarization rejected:** inspect the log with
  `xcrun notarytool log <submission-id> --apple-id ... --password ... --team-id ...`.
  Common causes are missing hardened runtime, a missing secure timestamp, or an
  unsigned nested extension.
- **Gatekeeper still warns:** the DMG may not have been stapled, or the user
  downloaded a cached copy. Re-download after the release workflow completes.
- **The extension is not listed in Safari:** make sure the containing app was
  opened at least once and the extension is enabled for the current Safari
  profile.
