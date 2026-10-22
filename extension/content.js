/* global StilSelectors, StilYouTube */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const cookieSelector = StilSelectors.cookies.join(",");
  const adSelector = [...StilSelectors.ads, ...(StilYouTube ? StilSelectors.youtubeAds : [])].join(",");
  const cookies = new Set();
  const ads = new Set();
  const scrollStyles = new Map();
  const scrollClasses = new Map();
  let context;
  let timer;
  let observer;
  let revision = 0;

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "YOUTUBE_STATUS" || !StilYouTube) return false;
    sendResponse({
      version: api.runtime.getManifest().version,
      ...StilYouTube.filterStatus(),
      error: context?.youtubeError,
    });
    return false;
  });

  function unhide(elements, attribute) {
    for (const element of elements) element.removeAttribute(attribute);
    elements.clear();
  }

  function hideMatches(selector, elements, attribute) {
    for (const element of elements) {
      if (!element.isConnected || !element.matches(selector)) {
        element.removeAttribute(attribute);
        elements.delete(element);
      }
    }
    for (const element of document.querySelectorAll(selector)) {
      // Avoid collapsing an entire page if a site's outer container happens to
      // reuse an ad/banner class name.
      if (element.matches("html, body, main, article, nav") || element.querySelector("main, article")) continue;
      // Dormant notices should not cause an unrelated scroll lock to be lifted.
      if (attribute === "data-stil-cookie" && !elements.has(element) &&
          (!element.getClientRects().length || getComputedStyle(element).visibility === "hidden")) continue;
      if (!element.hasAttribute(attribute)) element.setAttribute(attribute, "");
      elements.add(element);
    }
  }

  function restoreScroll() {
    for (const [element, original] of scrollStyles) {
      if (element.style.getPropertyValue("overflow-y") === "auto" &&
          element.style.getPropertyPriority("overflow-y") === "important") {
        element.style.removeProperty("overflow-y");
        if (original.value) element.style.setProperty("overflow-y", original.value, original.priority);
      }
    }
    for (const [element, names] of scrollClasses) {
      for (const name of names) element.classList.add(name);
    }
    scrollStyles.clear();
    scrollClasses.clear();
  }

  function restoreBlockedScroll() {
    const otherDialog = [...document.querySelectorAll("[aria-modal='true'], [role='dialog'], dialog[open]")]
      .some(element => !element.closest("[data-stil-cookie]") &&
        element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
    if (!cookies.size || otherDialog) {
      restoreScroll();
      return;
    }
    for (const element of [document.documentElement, document.body].filter(Boolean)) {
      const removed = scrollClasses.get(element) || new Set();
      for (const name of StilSelectors.scrollClasses) {
        if (element.classList.contains(name)) {
          removed.add(name);
          element.classList.remove(name);
        }
      }
      if (removed.size) scrollClasses.set(element, removed);
      if (["hidden", "clip"].includes(getComputedStyle(element).overflowY)) {
        if (!scrollStyles.has(element)) {
          scrollStyles.set(element, {
            value: element.style.getPropertyValue("overflow-y"),
            priority: element.style.getPropertyPriority("overflow-y"),
          });
        }
        element.style.setProperty("overflow-y", "auto", "important");
      }
    }
  }

  function scan() {
    timer = undefined;
    if (!context || !document.documentElement) return;
    const { settings, hostname } = context;
    const enabled = settings.enabled && !settings.pausedSites.includes(hostname);
    const hideCookies = enabled && settings.hideCookies;
    const hideAds = enabled && settings.blockAds;
    StilYouTube?.setEnabled(hideAds);
    if (hideAds) StilYouTube?.tick();
    if (!hideCookies && !hideAds) {
      observer?.disconnect();
      unhide(cookies, "data-stil-cookie");
      unhide(ads, "data-stil-ad");
      restoreScroll();
      return;
    }
    observer ??= new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["id", "class", "style", "hidden", "open", "aria-modal", "aria-label"],
    });
    if (hideAds) hideMatches(adSelector, ads, "data-stil-ad");
    else unhide(ads, "data-stil-ad");

    if (hideCookies) {
      const backdrops = StilSelectors.backdrops
        .filter(([banner]) => document.querySelector(banner))
        .map(([, backdrop]) => backdrop);
      hideMatches([cookieSelector, ...backdrops].join(","), cookies, "data-stil-cookie");
      restoreBlockedScroll();
    } else {
      unhide(cookies, "data-stil-cookie");
      restoreScroll();
    }
  }

  function schedule() {
    timer ??= setTimeout(scan, 80);
  }

  async function refresh() {
    const current = ++revision;
    try {
      const result = await api.runtime.sendMessage({ type: "CONTENT_CONTEXT" });
      if (!result?.ok || current !== revision) return;
      context = result;
      schedule();
    } catch {
      // Extension contexts are invalidated when Safari updates/reloads Stil.
    }
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) refresh();
  });
  document.addEventListener("DOMContentLoaded", schedule, { once: true });
  window.addEventListener("pageshow", refresh);
  refresh();
})();
