// YouTube video ads share delivery infrastructure with normal videos. Handle
// its player explicitly instead of blocking googlevideo.com and breaking video.
globalThis.StilYouTube = (() => {
  const host = location.hostname.toLowerCase().replace(/\.$/, "");
  const supported = ["youtube.com", "youtube-nocookie.com"]
    .some(domain => host === domain || host.endsWith(`.${domain}`));
  if (!supported) return null;

  const skipSelector = [
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button-slot button",
  ].join(",");
  const sessions = new Map();
  let interval;
  let enabled = false;
  let mainFilter;

  document.addEventListener("stil-youtube-status", event => {
    try {
      const value = JSON.parse(event.detail);
      if (typeof value.release === "string" && typeof value.ready === "boolean") mainFilter = value;
    } catch { /* Page events are untrusted diagnostic data, never settings. */ }
  });

  function filterStatus() {
    document.dispatchEvent(new Event("stil-youtube-status-request"));
    const isolated = globalThis.__stilYoutubeIsolated;
    return {
      main: mainFilter ? { ready: mainFilter.ready, version: mainFilter.version, release: mainFilter.release } : null,
      isolated: isolated ? { ready: isolated.ready, version: isolated.version, release: isolated.release } : null,
    };
  }

  function restore(session) {
    // Only undo the mute we applied; leave volume and playback speed alone.
    if (session.mutedByStil && session.video.muted) {
      session.video.muted = session.wasMuted;
    }
    session.mutedByStil = false;
  }

  function clear(player) {
    const session = sessions.get(player);
    if (session) restore(session);
    sessions.delete(player);
  }

  function canClick(button) {
    return !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      !button.closest("[hidden], [aria-hidden='true']") && button.getClientRects().length > 0 &&
      getComputedStyle(button).visibility === "visible";
  }

  function tick() {
    if (!enabled) return;
    for (const [player] of sessions) {
      if (!player.isConnected || !player.classList.contains("ad-showing")) clear(player);
    }

    for (const player of document.querySelectorAll(".html5-video-player.ad-showing")) {
      const now = performance.now();
      let session = sessions.get(player);
      if (!session) {
        session = { video: null, lastClick: -Infinity, invalidated: false };
        sessions.set(player, session);
      }

      // Actual Skip buttons are the first choice, including buttons that appear
      // after a countdown. Never click advertiser links or arbitrary controls.
      const skip = [...player.querySelectorAll(skipSelector)].find(canClick);
      if (skip) {
        if (now - session.lastClick > 750) {
          session.lastClick = now;
          restore(session);
          session.invalidated = true;
          skip.click();
        }
        // Clicking may synchronously switch back to the content video. Never
        // seek using the ad state captured before the click.
        if (!player.classList.contains("ad-showing")) clear(player);
        continue;
      }

      const video = player.querySelector("video.html5-main-video, video");
      if (!video || session.invalidated) continue;
      if (session.video && (session.video !== video ||
          session.source !== video.currentSrc || session.duration !== video.duration)) {
        // YouTube can retain ad-showing briefly while loading the real video.
        // A source/duration/element transition ends our media intervention until
        // the player starts a fresh ad session. Skip buttons remain usable.
        restore(session);
        session.invalidated = true;
        continue;
      }
      if (!Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < 1) continue;

      if (!session.video) {
        Object.assign(session, {
          video, source: video.currentSrc, duration: video.duration,
          wasMuted: video.muted, mutedByStil: !video.muted,
          readyAt: now, sought: false,
        });
        video.muted = true;
      }

      // Only seek a stable, explicitly ad-marked, finite media stream. Leave
      // live streams, unloaded media and unseekable ads to their Skip control.
      if (!session.sought && now - session.readyAt >= 250 && !video.seeking &&
          video.seekable.length && video.seekable.end(video.seekable.length - 1) >= video.duration - .1) {
        session.sought = true;
        try { video.currentTime = video.duration; }
        catch { /* Some ad streams reject seeking; keep watching for Skip. */ }
      }
    }
  }

  function setEnabled(value) {
    if (enabled === value) return;
    enabled = value;
    if (value) {
      interval = setInterval(tick, 250);
      tick();
    } else {
      clearInterval(interval);
      for (const [player] of sessions) clear(player);
    }
  }

  // YouTube navigates without reloading the page and replaces its video node.
  // Settings come from the regular content script, including top-frame pauses.
  document.addEventListener("yt-navigate-start", () => {
    for (const [player] of sessions) {
      restore(sessions.get(player));
      sessions.get(player).invalidated = true;
    }
  });
  document.addEventListener("loadedmetadata", tick, true);
  document.addEventListener("durationchange", tick, true);
  window.addEventListener("pagehide", () => setEnabled(false));

  return Object.freeze({ setEnabled, tick, filterStatus });
})();
