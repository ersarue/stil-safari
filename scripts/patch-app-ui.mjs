import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const appRoot = process.argv[2];
if (!appRoot) {
  throw new Error("Usage: node scripts/patch-app-ui.mjs path/to/generated/Stil");
}

const unknown = "Stil is installed. If it is not listed in Safari, open Safari → Settings → Developer and enable “Allow unsigned extensions”, then open Safari → Settings → Extensions. This preview is not notarized, so Safari resets that switch every time it quits.";
const on = "Stil is on. Manage it in Safari → Settings → Extensions.";
const off = "Stil is installed but turned off. Open Safari → Settings → Extensions and enable Stil.";

async function replace(path, search, replacement) {
  const source = await readFile(path, "utf8");
  if (!source.includes(search)) {
    throw new Error(`Expected text not found in ${path}`);
  }
  await writeFile(path, source.replace(search, replacement));
}

const main = join(appRoot, "Resources/Base.lproj/Main.html");
await replace(main,
  `<p class="state-unknown">You can turn on Stil’s extension in Safari Extensions preferences.</p>`,
  `<p class="state-unknown">${unknown}</p>`);
await replace(main,
  `<p class="state-on">Stil’s extension is currently on. You can turn it off in Safari Extensions preferences.</p>`,
  `<p class="state-on">${on}</p>`);
await replace(main,
  `<p class="state-off">Stil’s extension is currently off. You can turn it on in Safari Extensions preferences.</p>`,
  `<p class="state-off">${off}</p>`);

const script = join(appRoot, "Resources/Script.js");
await replace(script,
  `document.getElementsByClassName('state-on')[0].innerText = "Stil’s extension is currently on. You can turn it off in the Extensions section of Safari Settings.";`,
  `document.getElementsByClassName('state-on')[0].innerText = ${JSON.stringify(on)};`);
await replace(script,
  `document.getElementsByClassName('state-off')[0].innerText = "Stil’s extension is currently off. You can turn it on in the Extensions section of Safari Settings.";`,
  `document.getElementsByClassName('state-off')[0].innerText = ${JSON.stringify(off)};`);
await replace(script,
  `document.getElementsByClassName('state-unknown')[0].innerText = "You can turn on Stil’s extension in the Extensions section of Safari Settings.";`,
  `document.getElementsByClassName('state-unknown')[0].innerText = ${JSON.stringify(unknown)};`);

const controller = join(appRoot, "ViewController.swift");
await replace(controller,
  `        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        }`,
  `        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                if let error = error {
                    let alert = NSAlert()
                    alert.messageText = "Stil could not open Safari Settings"
                    alert.informativeText = "Open Safari → Settings → Developer and enable “Allow unsigned extensions”, then try again. This preview is not notarized, so Safari resets that switch every time it quits. (Safari reported: \\(error.localizedDescription))"
                    alert.alertStyle = .informational
                    alert.addButton(withTitle: "OK")
                    alert.runModal()
                    return
                }
                NSApplication.shared.terminate(nil)
            }
        }`);
