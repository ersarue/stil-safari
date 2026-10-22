/* global Stil */
importScripts("shared.js");
const api = globalThis.browser ?? globalThis.chrome;
let queue = Promise.resolve();
let initializationError;
const youtubeScripts = ["MAIN", "ISOLATED"].map(world => ({
  id: `stil-youtube-${world.toLowerCase()}`,
  js: [`vendor/youtube/youtube-${world.toLowerCase()}.js`],
  world,
  runAt: "document_start",
  // Cross-origin embeds are injected on demand after checking the parent site.
  allFrames: false,
  persistAcrossSessions: true,
}));

// Keep concurrent popup actions and service-worker startup in order.
function enqueue(task) {
  const pending = queue.then(task);
  queue = pending.catch(() => {});
  return pending;
}

async function readSettings() {
  const { settings } = await api.storage.local.get("settings");
  return Stil.normalize(settings);
}

async function registerYouTube(settings) {
  const active = settings.enabled && settings.blockAds;
  // Use exact positive matches: some Safari versions ignore excludeMatches.
  const matches = active ? Stil.YOUTUBE_HOSTS
    .filter(host => !settings.pausedSites.includes(host))
    .flatMap(host => [`*://${host}/*`, `*://${host}./*`]) : [];
  const registered = await api.scripting.getRegisteredContentScripts({ ids: youtubeScripts.map(script => script.id) });
  if (!matches.length) {
    if (registered.length) await api.scripting.unregisterContentScripts({ ids: registered.map(script => script.id) });
    return;
  }
  for (const script of youtubeScripts) {
    const existing = registered.find(item => item.id === script.id);
    const next = { ...script, matches };
    if (!existing) await api.scripting.registerContentScripts([next]);
    else if (JSON.stringify([...existing.matches].sort()) !== JSON.stringify([...matches].sort())) {
      await api.scripting.updateContentScripts([next]);
    }
  }
}

async function injectYouTube(sender) {
  if (!Number.isInteger(sender.tab?.id)) return;
  for (const script of youtubeScripts) {
    await api.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
      files: script.js,
      world: script.world,
      injectImmediately: true,
    });
  }
}

async function applyRules(settings) {
  const oldRules = await api.declarativeNetRequest.getDynamicRules();
  await api.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map(rule => rule.id),
    addRules: Stil.siteRules(settings),
  });
  const block = settings.enabled && settings.blockAds;
  await api.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: block ? ["ads", "youtube"] : [],
    disableRulesetIds: block ? [] : ["ads", "youtube"],
  });
  await registerYouTube(settings);
  initializationError = undefined;
}

async function saveSettings(previous, next) {
  try {
    await applyRules(next);
    await api.storage.local.set({ settings: next });
  } catch (error) {
    // A rejected rule/storage update must not leave the UI reporting success.
    await applyRules(previous).catch(rollback => console.error("Stil rollback:", rollback));
    throw error;
  }
  return next;
}

async function handle(message, sender) {
  const settings = await readSettings();
  if (message.type === "CONTENT_CONTEXT") {
    // Use the top-level URL so embedded frames inherit the site's pause setting.
    const host = Stil.hostname(sender.tab?.url || sender.url);
    let youtubeError;
    if (settings.enabled && settings.blockAds && !settings.pausedSites.includes(host) &&
        Stil.YOUTUBE_HOSTS.includes(Stil.hostname(sender.url))) {
      try { await injectYouTube(sender); }
      catch (error) { youtubeError = error.message; }
    }
    return { settings, hostname: host, youtubeError };
  }

  // Only extension pages may change settings, never a webpage/content script.
  if (!sender.url?.startsWith(api.runtime.getURL(""))) {
    throw new Error("Open the Stil toolbar popup to change settings.");
  }

  if (message.type === "GET_STATE") {
    if (initializationError) throw new Error(initializationError);
    return { settings };
  }
  if (message.type === "UPDATE_SETTINGS") {
    const next = { ...settings };
    for (const key of ["enabled", "blockAds", "hideCookies"]) {
      if (typeof message.patch?.[key] === "boolean") next[key] = message.patch[key];
    }
    return { settings: await saveSettings(settings, next) };
  }
  if (message.type === "TOGGLE_SITE") {
    const host = Stil.hostname(`https://${message.hostname}/`);
    if (!host || host !== message.hostname) throw new Error("This page cannot be paused.");
    const paused = settings.pausedSites.includes(host);
    if (!paused && settings.pausedSites.length >= 100) {
      throw new Error("The 100-site pause list is full. Resume a site first.");
    }
    const next = Stil.normalize({
      ...settings,
      pausedSites: paused
        ? settings.pausedSites.filter(site => site !== host)
        : [...settings.pausedSites, host],
    });
    return { settings: await saveSettings(settings, next) };
  }
  throw new Error("Unknown Stil action.");
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;
  enqueue(() => handle(message, sender)).then(
    result => sendResponse({ ok: true, ...result }),
    error => sendResponse({ ok: false, error: error.message || "Could not save settings." }),
  );
  return true;
});

function initialize() {
  enqueue(async () => {
    const settings = await readSettings();
    await applyRules(settings);
    await api.storage.local.set({ settings });
  }).catch(error => {
    initializationError = error.message;
    console.error("Stil initialization:", error);
  });
}

// Static rules reset to manifest defaults on extension updates. Reconcile them
// on every worker launch and install/startup event with the saved preferences.
api.runtime.onInstalled.addListener(initialize);
api.runtime.onStartup.addListener(initialize);
initialize();
