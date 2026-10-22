(() => {
  const DEFAULTS = Object.freeze({
    enabled: true,
    blockAds: true,
    hideCookies: true,
    pausedSites: [],
  });
  const YOUTUBE_HOSTS = Object.freeze([
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
    "tv.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com",
  ]);

  function hostname(url) {
    try {
      const parsed = new URL(url);
      return /^https?:$/.test(parsed.protocol)
        ? parsed.hostname.toLowerCase().replace(/\.$/, "")
        : "";
    } catch {
      return "";
    }
  }

  function normalize(value = {}) {
    const input = value && typeof value === "object" ? value : {};
    const result = {};
    for (const key of ["enabled", "blockAds", "hideCookies"]) {
      result[key] = typeof input[key] === "boolean" ? input[key] : DEFAULTS[key];
    }
    result.pausedSites = [...new Set(
      (Array.isArray(input.pausedSites) ? input.pausedSites : [])
        .filter(site => typeof site === "string" && hostname(`https://${site}/`) === site)
    )].slice(0, 100).sort();
    return result;
  }

  function siteRules(settings) {
    return settings.pausedSites.map((site, index) => ({
      id: 1000 + index,
      priority: 100,
      action: { type: "allowAllRequests" },
      condition: {
        // Match this exact hostname, with optional port/trailing dot. Allowing the
        // top-level frame also exempts its cross-origin descendant frames.
        regexFilter: `^https?://${site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?(:[0-9]+)?/`,
        isUrlFilterCaseSensitive: false,
        resourceTypes: ["main_frame"],
      },
    }));
  }

  globalThis.Stil = Object.freeze({ DEFAULTS, YOUTUBE_HOSTS, hostname, normalize, siteRules });
})();
