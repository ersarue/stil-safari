/* global Stil */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const $ = id => document.getElementById(id);
  let settings;
  let tab;
  let host = "";
  let busy = false;
  let youtubeStatus;

  async function request(message) {
    const response = await api.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Stil could not connect. Reopen this popup to try again.");
    return response;
  }

  function render() {
    const paused = settings.pausedSites.includes(host);
    const active = settings.enabled && !paused && (settings.blockAds || settings.hideCookies);
    document.body.dataset.active = String(active);
    $("status-label").textContent = active ? "QUIET MODE IS ON" : "TAKING A BREATHER";
    $("status-title").textContent = active ? "A quieter internet." : "A little pause.";
    $("status-description").textContent = !settings.enabled ? "Stil is paused on every website."
      : paused ? "Stil is paused on this website."
      : active ? "Your space to browse, uninterrupted." : "Turn on a feature to quiet things down.";
    for (const key of ["enabled", "blockAds", "hideCookies"]) {
      $(key).setAttribute("aria-checked", String(settings[key]));
      $(key).disabled = busy;
    }
    $("hostname").textContent = host || "Open a website to use site controls";
    $("site-status").textContent = !host ? "—" : active ? "ON" : "PAUSED";
    $("pause-site").disabled = busy || !host;
    $("pause-site").firstChild.textContent = paused ? "Resume on this website " : "Pause on this website ";
    const youtube = Stil.YOUTUBE_HOSTS.includes(host);
    $("youtube-status").hidden = !youtube;
    if (youtube) {
      const version = api.runtime.getManifest().version;
      const ready = youtubeStatus?.version === version && youtubeStatus?.main?.ready &&
        youtubeStatus?.isolated?.ready && youtubeStatus.main.version === version &&
        youtubeStatus.isolated.version === version;
      $("youtube-status").textContent = !settings.enabled || !settings.blockAds || paused
        ? "YouTube filtering paused. Reload to remove existing player filters."
        : ready ? `YouTube filters loaded · ${youtubeStatus.main.release}`
        : "YouTube filters not confirmed. Reload this tab and allow Stil website access.";
    }
  }

  async function readYouTubeStatus() {
    if (!Stil.YOUTUBE_HOSTS.includes(host)) return;
    try { youtubeStatus = await api.tabs.sendMessage(tab.id, { type: "YOUTUBE_STATUS" }, { frameId: 0 }); }
    catch { youtubeStatus = undefined; }
    render();
  }

  async function update(message, networkChange) {
    if (busy) return;
    busy = true;
    $("error").hidden = true;
    render();
    try {
      ({ settings } = await request(message));
      if (networkChange && host) $("reload-notice").hidden = false;
      $("announcement").textContent = "Settings saved.";
    } catch (error) {
      $("error").textContent = error.message;
      $("error").hidden = false;
    } finally {
      busy = false;
      render();
      readYouTubeStatus();
    }
  }

  for (const key of ["enabled", "blockAds", "hideCookies"]) {
    $(key).addEventListener("click", () => update({
      type: "UPDATE_SETTINGS", patch: { [key]: !settings[key] },
    }, key !== "hideCookies"));
  }
  $("pause-site").addEventListener("click", () => update({ type: "TOGGLE_SITE", hostname: host }, true));
  $("reload").addEventListener("click", async () => {
    try {
      await api.tabs.reload(tab.id);
      window.close();
    } catch (error) {
      $("error").textContent = error.message;
      $("error").hidden = false;
    }
  });

  async function initialize() {
    try {
      if (!api?.runtime) throw new Error("Install Stil as an extension to use these controls.");
      $("version").textContent = `v${api.runtime.getManifest().version}`;
      const [result, tabs] = await Promise.all([
        request({ type: "GET_STATE" }),
        api.tabs.query({ active: true, currentWindow: true }),
      ]);
      settings = result.settings;
      tab = tabs[0];
      host = Stil.hostname(tab?.url);
      render();
      await readYouTubeStatus();
    } catch (error) {
      $("status-label").textContent = "SETUP NEEDED";
      $("hostname").textContent = "Safari extension setup";
      $("error").textContent = error.message;
      $("error").hidden = false;
    }
  }
  initialize();
})();
