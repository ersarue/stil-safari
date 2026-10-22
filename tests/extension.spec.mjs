import { test as base, expect, chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const extensionPath = join(root, "extension");
let server;
let port;
let youtubeFixture;

// Real, silent PCM media exercises browser seeking/ended events rather than
// mocking HTMLVideoElement properties in a different JavaScript world.
function wav(seconds) {
  const sampleRate = 8000;
  const bytes = seconds * sampleRate * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(bytes, 40);
  return buffer;
}
const media = { ad: wav(12), content: wav(120) };

function mediaResponse(path, range) {
  const bytes = path.endsWith("/ad.wav") ? media.ad : media.content;
  const match = /^bytes=(\d+)-(\d*)$/.exec(range || "");
  const start = match ? Number(match[1]) : 0;
  const end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
  return {
    status: match ? 206 : 200,
    headers: {
      "content-type": "audio/wav",
      "accept-ranges": "bytes",
      "content-length": String(end - start + 1),
      ...(match ? { "content-range": `bytes ${start}-${end}/${bytes.length}` } : {}),
    },
    body: bytes.subarray(start, end + 1),
  };
}

base.beforeAll(async () => {
  const fixture = await readFile(new URL("fixture.html", import.meta.url), "utf8");
  youtubeFixture = await readFile(new URL("youtube-fixture.html", import.meta.url), "utf8");
  server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (request.url.startsWith("/stil-test/media/")) {
      const result = mediaResponse(request.url, request.headers.range);
      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } else if (request.url === "/youtube-fixture") {
      response.setHeader("Content-Type", "text/html");
      response.end(youtubeFixture);
    } else if (request.url === "/ad.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end("window.adLoaded = (window.adLoaded || 0) + 1;");
    } else if (request.url === "/fixture.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(`window.consentClicks = 0;
        document.addEventListener('click', event => {
          if (['accept-cookies', 'reject-cookies'].includes(event.target.id)) window.consentClicks++;
        });`);
    } else if (request.url === "/fixture.css") {
      response.setHeader("Content-Type", "text/css");
      response.end(`body { font-family: sans-serif; } main { min-height: 200vh; }
        #onetrust-banner-sdk { position: fixed; bottom: 0; padding: 20px; background: white; z-index: 2; }
        .onetrust-pc-dark-filter { position: fixed; inset: 0; background: #0005; z-index: 1; }
        [hidden] { display: none; }`);
    } else if (request.url === "/frame") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<div class="cookie-banner">Embedded cookie notice</div>
        <script src="http://pagead2.googlesyndication.com:${port}/ad.js"></script>`);
    } else {
      response.setHeader("Content-Type", "text/html");
      if (request.url === "/strict-csp") {
        response.setHeader("Content-Security-Policy", `default-src 'self'; style-src 'self'; script-src 'self' http://pagead2.googlesyndication.com:${port}; frame-src http://embed.stil.test:${port}`);
      }
      response.end(fixture.replaceAll("PORT", String(port)));
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

base.afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function launch(profile) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-proxy-server",
      "--autoplay-policy=no-user-gesture-required",
      "--host-resolver-rules=MAP *.stil.test 127.0.0.1, MAP *.googlesyndication.com 127.0.0.1, MAP notgooglesyndication.com 127.0.0.1",
    ],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).hostname;
  // No live YouTube traffic: preserve the real hostname/extension isolation
  // while serving controlled player markup and seekable media locally.
  await context.route(/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\//, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/stil-test/media/")) {
      await route.fulfill(mediaResponse(path, route.request().headers().range));
    } else if (["/youtubei/v1/player", "/stil-unrelated-api"].includes(path)) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        videoDetails: { videoId: "stil-content", title: "Ordinary content" },
        streamingData: { formats: [{ url: "https://r1.googlevideo.com/videoplayback?content=1" }] },
        playabilityStatus: { status: "OK" },
        adPlacements: [{ adPlacementRenderer: { test: true } }],
        adSlots: [{ adSlotRenderer: { test: true } }],
      }) });
    } else if (path === "/youtubei/v1/reel/reel_watch_sequence") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ entries: [
        { id: "content", command: { reelWatchEndpoint: { videoId: "normal" } } },
        { id: "advertisement", command: { reelWatchEndpoint: { adClientParams: { isAd: true } } } },
      ] }) });
    } else {
      await route.fulfill({ contentType: "text/html", body: youtubeFixture });
    }
  });
  const control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await expect(control.locator("#enabled")).toBeEnabled();
  return { context, control, extensionId };
}

const test = base.extend({
  stil: async ({}, use, testInfo) => {
    const profile = testInfo.outputPath("profile");
    await mkdir(profile, { recursive: true });
    const session = await launch(profile);
    session.send = message => session.control.evaluate(async input => {
      const result = await chrome.runtime.sendMessage(input);
      if (!result.ok) throw new Error(result.error);
      return result;
    }, message);
    session.open = async (host = "news.stil.test", path = "/") => {
      const page = await session.context.newPage();
      await page.goto(`http://${host}:${port}${path}`);
      return page;
    };
    session.openYoutube = async () => {
      const page = await session.context.newPage();
      await page.goto("https://www.youtube.com/watch?v=stil-test");
      await page.evaluate(() => window.ready);
      return page;
    };
    session.restart = async () => {
      await session.context.close();
      Object.assign(session, await launch(profile));
    };
    try { await use(session); }
    finally {
      await session.context.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
});

async function canFetchAd(page, host = "pagead2.googlesyndication.com") {
  return page.evaluate(async url => {
    try { return (await fetch(url, { cache: "no-store" })).ok; }
    catch { return false; }
  }, `http://${host}:${port}/ad.js`);
}

test("blocks real third-party requests, but allows first-party navigation and lookalike domains", async ({ stil }) => {
  const page = await stil.open();
  expect(await canFetchAd(page)).toBe(false);
  expect(await page.evaluate(() => window.adLoaded)).toBeUndefined();
  expect(await canFetchAd(page, "notgooglesyndication.com")).toBe(true);

  const firstParty = await stil.open("pagead2.googlesyndication.com");
  expect(await canFetchAd(firstParty)).toBe(true);
  expect(await firstParty.evaluate(() => window.adLoaded)).toBe(1);
});

test("hides dynamic notices without consent clicks, restores scroll, preserves articles and other dialogs", async ({ stil }) => {
  const page = await stil.open();
  await expect(page.locator("#onetrust-banner-sdk")).toBeHidden();
  await expect(page.locator(".onetrust-pc-dark-filter")).toBeHidden();
  await expect(page.locator(".advertisement-container")).toBeHidden();
  await expect(page.locator("body")).toHaveCSS("overflow-y", "auto");
  await expect(page.locator("#cookie-article")).toBeVisible();
  await expect(page.getByRole("link", { name: "cookie policy" })).toBeVisible();
  expect(await page.evaluate(() => window.consentClicks)).toBe(0);

  await page.evaluate(() => {
    const banner = document.createElement("div");
    banner.id = "CybotCookiebotDialog";
    banner.textContent = "Dynamically inserted cookie notice";
    document.body.append(banner);
  });
  await expect(page.locator("#CybotCookiebotDialog")).toBeHidden();

  await page.evaluate(() => { document.getElementById("login-dialog").hidden = false; });
  await expect(page.locator("#login-dialog")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
  expect(await page.evaluate(() => window.consentClicks)).toBe(0);
});

test("cookie control reverses hiding and scroll edits without disabling network protection", async ({ stil }) => {
  const page = await stil.open();
  await expect(page.locator("#onetrust-banner-sdk")).toBeHidden();
  await stil.send({ type: "UPDATE_SETTINGS", patch: { hideCookies: false } });
  await expect(page.locator("#onetrust-banner-sdk")).toBeVisible();
  await expect(page.locator(".onetrust-pc-dark-filter")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
  await expect(page.locator(".advertisement-container")).toBeHidden();
  expect(await canFetchAd(page)).toBe(false);
  await stil.send({ type: "UPDATE_SETTINGS", patch: { hideCookies: true } });
  await expect(page.locator("#onetrust-banner-sdk")).toBeHidden();
});

test("pausing exempts the exact top-level host and cross-origin frames, and resumes cleanly", async ({ stil }) => {
  const page = await stil.open();
  await expect(page.frameLocator("iframe").locator(".cookie-banner")).toBeHidden();
  const embedded = page.frames().find(frame => frame.url().includes("embed.stil.test"));
  expect(await canFetchAd(embedded)).toBe(false);

  await stil.send({ type: "TOGGLE_SITE", hostname: "news.stil.test" });
  await expect(page.locator("#onetrust-banner-sdk")).toBeVisible();
  await page.reload();
  expect(await canFetchAd(page)).toBe(true);
  expect(await page.evaluate(() => window.adLoaded)).toBe(1);
  await expect(page.frameLocator("iframe").locator(".cookie-banner")).toBeVisible();
  expect(await page.frames().find(frame => frame.url().includes("embed.stil.test")).evaluate(() => window.adLoaded)).toBe(1);

  const childSite = await stil.open("sub.news.stil.test");
  expect(await canFetchAd(childSite)).toBe(false);
  await expect(childSite.locator("#onetrust-banner-sdk")).toBeHidden();
  await stil.send({ type: "TOGGLE_SITE", hostname: "news.stil.test" });
  await page.reload();
  expect(await canFetchAd(page)).toBe(false);
});

test("global pause and site exceptions survive a full browser restart", async ({ stil }) => {
  await stil.send({ type: "TOGGLE_SITE", hostname: "news.stil.test" });
  await stil.send({ type: "UPDATE_SETTINGS", patch: { enabled: false } });
  await stil.restart();
  const { settings } = await stil.send({ type: "GET_STATE" });
  expect(settings.enabled).toBe(false);
  expect(settings.pausedSites).toEqual(["news.stil.test"]);
  const page = await stil.open("other.stil.test");
  expect(await canFetchAd(page)).toBe(true);
  await expect(page.locator("#onetrust-banner-sdk")).toBeVisible();

  await stil.send({ type: "UPDATE_SETTINGS", patch: { enabled: true } });
  await page.reload();
  expect(await canFetchAd(page)).toBe(false);
  const paused = await stil.open();
  expect(await canFetchAd(paused)).toBe(true);
});

test("popup controls work with keyboard input and show reload guidance", async ({ stil }, testInfo) => {
  const site = await stil.open();
  const popup = await stil.context.newPage();
  await site.bringToFront();
  await popup.goto(`chrome-extension://${stil.extensionId}/popup/popup.html`);
  await expect(popup.locator("#hostname")).toHaveText("news.stil.test");
  await expect(popup.getByRole("switch", { name: "Enable Stil", exact: true })).toBeEnabled();
  await popup.screenshot({ path: testInfo.outputPath("popup-light.png"), fullPage: true });

  const adsSwitch = popup.getByRole("switch", { name: "Block ads", exact: true });
  await adsSwitch.focus();
  await popup.keyboard.press("Space");
  await expect(adsSwitch).toHaveAttribute("aria-checked", "false");
  await expect(popup.locator("#reload-notice")).toBeVisible();
  expect(await canFetchAd(site)).toBe(true);
  await expect(site.locator(".advertisement-container")).toBeVisible();
  await popup.getByRole("button", { name: "Pause on this website" }).click();
  await expect(popup.locator("#site-status")).toHaveText("PAUSED");
  await expect(popup.getByRole("button", { name: "Resume on this website" })).toBeVisible();
  await popup.emulateMedia({ colorScheme: "dark" });
  await popup.screenshot({ path: testInfo.outputPath("popup-dark.png"), fullPage: true });
});

test("content styling works with a strict site CSP and dormant notices do not unlock the page", async ({ stil }) => {
  const page = await stil.open("news.stil.test", "/strict-csp");
  await expect(page.locator("#onetrust-banner-sdk")).toBeHidden();
  await page.evaluate(() => {
    document.getElementById("onetrust-banner-sdk").remove();
    document.querySelector(".onetrust-pc-dark-filter").remove();
    const dormant = document.createElement("div");
    dormant.id = "cookie-banner";
    dormant.hidden = true;
    dormant.textContent = "Dormant cookie notice";
    document.body.append(dormant);
    document.body.style.setProperty("overflow-y", "hidden");
  });
  // Wait until the observer has processed removal before checking scroll state.
  await expect(page.locator("[data-stil-cookie]")).toHaveCount(0);
  await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
  await page.evaluate(() => { document.getElementById("cookie-banner").hidden = false; });
  await expect(page.locator("#cookie-banner")).toHaveAttribute("data-stil-cookie", "");
  await expect(page.locator("body")).toHaveCSS("overflow-y", "auto");
});

test("YouTube advances seekable video ads, restores audio, and leaves normal playback alone", async ({ stil }) => {
  const page = await stil.openYoutube();
  await expect(page.locator("ytd-ad-slot-renderer")).toBeHidden();
  await expect(page.locator("#masthead-ad")).toBeHidden();
  await expect(page.locator("#description")).toBeVisible();
  await expect(page.locator("video")).toHaveJSProperty("currentTime", 7);
  await expect(page.locator("video")).toHaveJSProperty("muted", false);
  await page.evaluate(() => window.startAd());
  await expect.poll(() => page.evaluate(() => window.playerState.endedAds)).toBe(1);
  await expect(page.locator("video")).toHaveJSProperty("currentTime", 7);
  await expect(page.locator("video")).toHaveJSProperty("muted", false);
  await expect(page.locator("video")).toHaveJSProperty("playbackRate", 1.5);
  expect(await page.evaluate(() => window.playerState.advertiserClicks)).toBe(0);
});

test("YouTube uses visible Skip controls and handles a later mid-roll ad", async ({ stil }) => {
  const page = await stil.openYoutube();
  await page.evaluate(() => window.startAd({ skippable: true }));
  await expect.poll(() => page.evaluate(() => window.playerState.skips)).toBe(1);
  await expect(page.locator("video")).toHaveJSProperty("currentTime", 7);
  await expect(page.locator("video")).toHaveJSProperty("muted", false);
  // The same player is reused for a later mid-roll, without a page reload.
  await page.evaluate(() => window.startAd({ skippable: true }));
  await expect.poll(() => page.evaluate(() => window.playerState.skips)).toBe(2);
  await expect(page.locator("video")).toHaveJSProperty("currentTime", 7);
  expect(await page.evaluate(() => window.playerState.advertiserClicks)).toBe(0);
});

test("YouTube waits for an enabled Skip button on unloaded or unseekable media", async ({ stil }) => {
  const page = await stil.openYoutube();
  await page.evaluate(() => {
    const video = document.querySelector("video");
    video.removeAttribute("src");
    video.load();
    document.getElementById("movie_player").classList.add("ad-showing");
    const skip = document.querySelector(".ytp-skip-ad-button");
    skip.hidden = false;
    skip.disabled = true;
  });
  // Allow multiple polling ticks to confirm the disabled control isn't clicked.
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.playerState.skips)).toBe(0);
  await expect(page.locator("video")).toHaveJSProperty("currentTime", 0);
  await page.locator(".ytp-skip-ad-button").evaluate(button => { button.disabled = false; });
  await expect.poll(() => page.evaluate(() => window.playerState.skips)).toBe(1);
});

test("YouTube restores mute on pause and respects the ad switch, global switch, and site exception", async ({ stil }) => {
  const page = await stil.openYoutube();
  await page.evaluate(() => window.startAd({ play: false }));
  await expect(page.locator("video")).toHaveJSProperty("muted", true);
  await stil.send({ type: "UPDATE_SETTINGS", patch: { blockAds: false } });
  await expect(page.locator("video")).toHaveJSProperty("muted", false);
  await expect(page.locator("ytd-ad-slot-renderer")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator("video")).toHaveJSProperty("currentTime", 0);

  await stil.send({ type: "UPDATE_SETTINGS", patch: { enabled: false, blockAds: true } });
  await page.evaluate(() => window.startAd({ skippable: true, play: false }));
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.playerState.skips)).toBe(0);
  await stil.send({ type: "TOGGLE_SITE", hostname: "www.youtube.com" });
  await stil.send({ type: "UPDATE_SETTINGS", patch: { enabled: true } });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.playerState.skips)).toBe(0);
  await stil.send({ type: "TOGGLE_SITE", hostname: "www.youtube.com" });
  await expect.poll(() => page.evaluate(() => window.playerState.skips)).toBe(1);
});

test("YouTube does not seek the content video when ad markers linger during a source transition", async ({ stil }) => {
  const page = await stil.openYoutube();
  await page.evaluate(() => window.startAd({ play: false }));
  await expect(page.locator("video")).toHaveJSProperty("muted", true);
  await page.evaluate(async () => {
    await window.loadVideo("content");
    document.querySelector("video").currentTime = 7;
  });
  await expect(page.locator("video")).toHaveJSProperty("muted", false);
  await page.waitForTimeout(800);
  await expect(page.locator("video")).toHaveJSProperty("currentTime", 7);
  await expect(page.locator("video")).toHaveJSProperty("playbackRate", 1.5);
});

test("YouTube handling is host-scoped and embedded players inherit their parent site's pause", async ({ stil }) => {
  const parent = await stil.open("news.stil.test", "/youtube-fixture");
  await parent.evaluate(() => window.ready);
  await parent.evaluate(() => window.startAd({ skippable: true, play: false }));
  await expect(parent.locator("ytd-ad-slot-renderer")).toBeVisible();
  await stil.send({ type: "TOGGLE_SITE", hostname: "news.stil.test" });
  await parent.evaluate(() => {
    const iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube-nocookie.com/embed/stil-test";
    document.body.append(iframe);
  });
  await expect(parent.frameLocator("iframe").locator("video")).toBeVisible();
  const frame = parent.frames().find(frame => frame.url().includes("youtube-nocookie.com"));
  await frame.evaluate(() => window.ready);
  await frame.evaluate(() => window.startAd({ skippable: true, play: false }));
  await parent.waitForTimeout(600);
  expect(await parent.evaluate(() => window.playerState.skips)).toBe(0);
  expect(await frame.evaluate(() => window.playerState.skips)).toBe(0);
  await stil.send({ type: "TOGGLE_SITE", hostname: "news.stil.test" });
  await expect.poll(() => frame.evaluate(() => window.playerState.skips)).toBe(1);
  expect(await parent.evaluate(() => window.playerState.skips)).toBe(0);
});

test("Bundled player filters run before the first page script and preserve the content stream", async ({ stil }) => {
  const page = await stil.openYoutube();
  expect(await page.evaluate(() => window.initialAdSnapshot)).toEqual({
    placements: false, slots: false, playerAds: false,
    videoId: "stil-content", contentURL: "/stil-test/media/content.wav",
  });
  expect(await page.evaluate(() => window.__stilYoutubeMain.ready)).toBe(true);
});

test("Bundled filters remove ad schedules from Fetch and XHR player responses without changing unrelated APIs", async ({ stil }) => {
  const page = await stil.openYoutube();
  const result = await page.evaluate(async () => {
    const fetched = await (await fetch("/youtubei/v1/player?videoId=normal")).json();
    const xhr = await new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/youtubei/v1/player?videoId=normal");
      request.onload = () => resolve(JSON.parse(request.responseText));
      request.onerror = reject;
      request.send("{}");
    });
    const unrelated = await (await fetch("/stil-unrelated-api")).json();
    return { fetched, xhr, unrelated };
  });
  for (const response of [result.fetched, result.xhr]) {
    expect(response.adPlacements).toBeUndefined();
    expect(response.adSlots).toBeUndefined();
    expect(response.videoDetails.videoId).toBe("stil-content");
    expect(response.streamingData.formats[0].url).toContain("googlevideo.com/videoplayback?content=1");
    expect(response.playabilityStatus.status).toBe("OK");
  }
  expect(result.unrelated.adPlacements).toHaveLength(1);
  expect(result.unrelated.adSlots).toHaveLength(1);
});

test("Bundled filters remove sponsored Shorts entries and report both execution worlds in the popup", async ({ stil }) => {
  const page = await stil.openYoutube();
  const entries = await page.evaluate(async () =>
    (await (await fetch("/youtubei/v1/reel/reel_watch_sequence?test=1")).json()).entries
  );
  expect(entries.map(entry => entry.id)).toEqual(["content"]);
  const popup = await stil.context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${stil.extensionId}/popup/popup.html`);
  await expect(popup.locator("#youtube-status")).toHaveText("YouTube filters loaded · 2026.1021.1354");
});

test("Early registration respects saved site/global pauses across page and browser reloads", async ({ stil }) => {
  await stil.send({ type: "TOGGLE_SITE", hostname: "www.youtube.com" });
  let page = await stil.openYoutube();
  expect(await page.evaluate(() => window.initialAdSnapshot.placements)).toBe(true);
  expect(await page.evaluate(() => Boolean(window.__stilYoutubeMain))).toBe(false);
  await stil.send({ type: "TOGGLE_SITE", hostname: "www.youtube.com" });
  await page.reload();
  expect(await page.evaluate(() => window.initialAdSnapshot.placements)).toBe(false);
  await stil.send({ type: "UPDATE_SETTINGS", patch: { enabled: false } });
  await stil.restart();
  page = await stil.openYoutube();
  expect(await page.evaluate(() => window.initialAdSnapshot.placements)).toBe(true);
  expect(await page.evaluate(() => Boolean(window.__stilYoutubeMain))).toBe(false);
  await stil.send({ type: "UPDATE_SETTINGS", patch: { enabled: true } });
  await page.reload();
  expect(await page.evaluate(() => window.initialAdSnapshot.placements)).toBe(false);
});
