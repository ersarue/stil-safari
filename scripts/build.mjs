import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const extension = join(root, "extension");
const source = await readFile(join(root, "filters/ad-domains.txt"), "utf8");
const domains = [...new Set(source.split(/\r?\n/).map(line => line.trim())
  .filter(line => line && !line.startsWith("#")))].sort();

for (const domain of domains) {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
    throw new Error(`Invalid ad hostname: ${domain}`);
  }
}
if (!domains.length || domains.length > 30000) throw new Error("Unexpected blocklist size.");

const rules = domains.map((domain, index) => ({
  id: index + 1,
  priority: 1,
  action: { type: "block" },
  condition: {
    urlFilter: `||${domain}^`,
    isUrlFilterCaseSensitive: false,
    domainType: "thirdParty",
    resourceTypes: ["script", "image", "stylesheet", "xmlhttprequest", "sub_frame", "ping", "media", "font", "websocket", "other"],
  },
}));
await mkdir(join(extension, "rules"), { recursive: true });
await writeFile(join(extension, "rules/ads.json"), `${JSON.stringify(rules, null, 2)}\n`);

// Small dependency-free PNG renderer. Icons are generated locally, with no
// font, image-service or platform-specific build dependency.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function lineDistance(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

function cubicPoint([p0, p1, p2, p3], t) {
  const mt = 1 - t;
  return [
    mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
    mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1],
  ];
}

// Stil's mark is a lowercase "s" with a single dot, matching the popup
// wordmark. The previous artwork was inherited from Hush and must not ship.
const sCurves = [
  [[.66, .345], [.67, .255], [.39, .235], [.36, .35]],
  [[.36, .35], [.34, .455], [.65, .50], [.65, .62]],
  [[.65, .62], [.63, .735], [.35, .745], [.345, .645]],
];
const strokes = sCurves.flatMap(curve => {
  const points = Array.from({ length: 21 }, (_, index) => cubicPoint(curve, index / 20));
  return points.slice(1).map((point, index) => [points[index], point]);
});

function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const samples = size <= 128 ? 4 : 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const x = (px + (sx + .5) / samples) / size;
        const y = (py + (sy + .5) / samples) / size;
        const qx = Math.max(.22 - x, 0, x - .78);
        const qy = Math.max(.22 - y, 0, y - .78);
        if (Math.hypot(qx, qy) > .2) continue;
        const dot = Math.hypot(x - .69, y - .705) < .045;
        const mark = strokes.some(([a, b]) => lineDistance(x, y, a, b) < .058);
        const color = dot ? [201, 222, 153] : mark ? [248, 250, 239] : [40, 102, 76];
        color.forEach((value, channel) => { sum[channel] += value; });
        sum[3] += 255;
      }
      const offset = py * (size * 4 + 1) + 1 + px * 4;
      const coverage = sum[3] / 255;
      for (let channel = 0; channel < 3; channel++) raw[offset + channel] = coverage ? Math.round(sum[channel] / coverage) : 0;
      raw[offset + 3] = Math.round(sum[3] / (samples * samples));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(join(extension, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128, 256, 512]) {
  await writeFile(join(extension, `icons/icon-${size}.png`), icon(size));
}

const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
const resources = [manifest.background.service_worker, manifest.action.default_popup,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])]),
  ...manifest.declarative_net_request.rule_resources.map(rule => rule.path),
  "vendor/youtube/youtube-main.js", "vendor/youtube/youtube-isolated.js", "vendor/youtube/LICENSE.txt"];
for (const resource of resources) await access(join(extension, resource));
console.log(`Built Stil: ${rules.length} base network rules, bundled YouTube filters, 6 icons; resources verified.`);
