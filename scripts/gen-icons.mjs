// Rasterizes public/icon.svg to the PNG icons using Playwright (no native
// image deps). Run from the repo root: node scripts/gen-icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const OUT = "public";
const BG = "#0a0a0a"; // the SVG's own background, so the maskable inset is seamless
const svg = readFileSync(`${OUT}/icon.svg`, "utf8");

// `scale` is how much of the square the artwork fills. The maskable icon is
// inset to 80% so Android's mask (which may crop to the middle 80%) never cuts
// into the tiles; the others are full-bleed.
const targets = [
  { file: "pwa-192.png", size: 192, scale: 1 },
  { file: "pwa-512.png", size: 512, scale: 1 },
  { file: "maskable-512.png", size: 512, scale: 0.8 },
  { file: "apple-touch-icon.png", size: 180, scale: 1 },
];

const b = await chromium.launch();
const page = await b.newPage();
for (const t of targets) {
  const inner = t.size * t.scale;
  const inset = (t.size - inner) / 2;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<body style="margin:0;padding:0;background:${BG};overflow:hidden">` +
      `<div style="position:absolute;left:${inset}px;top:${inset}px;width:${inner}px;height:${inner}px">` +
      svg.replace("<svg ", '<svg style="display:block;width:100%;height:100%" ') +
      `</div></body>`,
  );
  await page.waitForTimeout(50);
  await page.screenshot({ path: `${OUT}/${t.file}`, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log(`wrote ${OUT}/${t.file} (${t.size}px, artwork ${Math.round(t.scale * 100)}%)`);
}
await b.close();
