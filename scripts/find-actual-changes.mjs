/**
 * 원본과 변형 SVG의 실제 픽셀 차이를 시각화해서 어디가 다른지 찾기
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";

async function renderSvg(browser, svgPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(PROJECT, "public", svgPath), "utf-8");
  await page.setContent(`<html><body style="margin:0;width:500px;height:500px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const bs = document.querySelector("#background-simple");
    if (bs) bs.style.display = "none";
  });
  await new Promise(r => setTimeout(r, 500));
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return buf;
}

async function findDiffRegions(origBuf, modBuf) {
  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  // 변경된 픽셀 찾기
  const changedPixels = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dr = Math.abs(origData[idx] - modData[idx]);
      const dg = Math.abs(origData[idx+1] - modData[idx+1]);
      const db = Math.abs(origData[idx+2] - modData[idx+2]);
      if (dr + dg + db > 30) {
        changedPixels.push({ x, y });
      }
    }
  }

  if (changedPixels.length === 0) return [];

  // 클러스터링 - 가까운 픽셀들을 그룹으로 묶기
  const CLUSTER_DIST = 30;
  const clusters = [];
  for (const px of changedPixels) {
    let found = false;
    for (const cluster of clusters) {
      const cx = cluster.sumX / cluster.count;
      const cy = cluster.sumY / cluster.count;
      if (Math.hypot(px.x - cx, px.y - cy) < CLUSTER_DIST) {
        cluster.sumX += px.x;
        cluster.sumY += px.y;
        cluster.count++;
        cluster.minX = Math.min(cluster.minX, px.x);
        cluster.maxX = Math.max(cluster.maxX, px.x);
        cluster.minY = Math.min(cluster.minY, px.y);
        cluster.maxY = Math.max(cluster.maxY, px.y);
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push({
        sumX: px.x, sumY: px.y, count: 1,
        minX: px.x, maxX: px.x, minY: px.y, maxY: px.y
      });
    }
  }

  return clusters.map(c => ({
    cx: Math.round(c.sumX / c.count),
    cy: Math.round(c.sumY / c.count),
    count: c.count,
    minX: c.minX, maxX: c.maxX,
    minY: c.minY, maxY: c.maxY,
    w: c.maxX - c.minX,
    h: c.maxY - c.minY,
  })).sort((a, b) => b.count - a.count);
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  for (const [label, orig, mod] of [
    ["카페", "/scenes/cafe.svg", "/scenes/cafe-modified.svg"],
    ["거실", "/scenes/livingroom.svg", "/scenes/livingroom-modified.svg"],
    ["공원", "/scenes/park.svg", "/scenes/park-modified.svg"],
  ]) {
    console.log(`\n=== ${label} 변경 영역 ===`);
    const origBuf = await renderSvg(browser, orig);
    const modBuf = await renderSvg(browser, mod);
    const regions = await findDiffRegions(origBuf, modBuf);
    regions.slice(0, 10).forEach((r, i) => {
      console.log(`  [${i+1}] 중심: (${r.cx}, ${r.cy}) 크기: ${r.w}x${r.h} 픽셀수: ${r.count}`);
    });
  }

  await browser.close();
}

main().catch(console.error);
