/**
 * 변경된 영역 정확히 확인
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";

async function renderSvg(browser, svgContent) {
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:500px;height:500px">${svgContent}</body></html>`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const bs = document.querySelector("#background-simple");
    if (bs) bs.style.display = "none";
  });
  await new Promise(r => setTimeout(r, 400));
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return buf;
}

async function findChangedClusters(origBuf, modBuf) {
  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  const points = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dr = Math.abs(origData[idx] - modData[idx]);
      const dg = Math.abs(origData[idx+1] - modData[idx+1]);
      const db = Math.abs(origData[idx+2] - modData[idx+2]);
      if (dr + dg + db > 30) points.push({x, y});
    }
  }

  if (points.length === 0) return [];

  // 간단한 클러스터링
  const CLUSTER_DIST = 40;
  const clusters = [];
  for (const px of points) {
    let found = false;
    for (const cluster of clusters) {
      const cx = cluster.sumX / cluster.count;
      const cy = cluster.sumY / cluster.count;
      if (Math.hypot(px.x - cx, px.y - cy) < CLUSTER_DIST) {
        cluster.sumX += px.x; cluster.sumY += px.y; cluster.count++;
        cluster.minX = Math.min(cluster.minX, px.x); cluster.maxX = Math.max(cluster.maxX, px.x);
        cluster.minY = Math.min(cluster.minY, px.y); cluster.maxY = Math.max(cluster.maxY, px.y);
        found = true;
        break;
      }
    }
    if (!found) clusters.push({ sumX: px.x, sumY: px.y, count: 1,
      minX: px.x, maxX: px.x, minY: px.y, maxY: px.y });
  }

  return clusters.map(c => ({
    cx: Math.round(c.sumX / c.count), cy: Math.round(c.sumY / c.count),
    count: c.count, minX: c.minX, maxX: c.maxX, minY: c.minY, maxY: c.maxY,
  })).sort((a, b) => b.count - a.count);
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  // 카페 변경 영역 확인
  console.log("=== 카페 변경 영역 ===");
  const cafeOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/cafe.svg"), "utf-8");
  const cafeMod = fs.readFileSync(path.join(PROJECT, "public/scenes/cafe-modified.svg"), "utf-8");
  const cafeOrigBuf = await renderSvg(browser, cafeOrig);
  const cafeModBuf = await renderSvg(browser, cafeMod);
  const cafeClusters = await findChangedClusters(cafeOrigBuf, cafeModBuf);
  cafeClusters.slice(0, 10).forEach((c, i) => {
    console.log(`  [${i+1}] cx:${c.cx} cy:${c.cy} 범위:(${c.minX}-${c.maxX}, ${c.minY}-${c.maxY}) 픽셀:${c.count}`);
  });

  // 공원 변경 영역 확인
  console.log("\n=== 공원 변경 영역 ===");
  const parkOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/park.svg"), "utf-8");
  const parkMod = fs.readFileSync(path.join(PROJECT, "public/scenes/park-modified.svg"), "utf-8");
  const parkOrigBuf = await renderSvg(browser, parkOrig);
  const parkModBuf = await renderSvg(browser, parkMod);
  const parkClusters = await findChangedClusters(parkOrigBuf, parkModBuf);
  parkClusters.slice(0, 10).forEach((c, i) => {
    console.log(`  [${i+1}] cx:${c.cx} cy:${c.cy} 범위:(${c.minX}-${c.maxX}, ${c.minY}-${c.maxY}) 픽셀:${c.count}`);
  });

  // 거실 변경 영역 확인
  console.log("\n=== 거실 변경 영역 ===");
  const livingOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/livingroom.svg"), "utf-8");
  const livingMod = fs.readFileSync(path.join(PROJECT, "public/scenes/livingroom-modified.svg"), "utf-8");
  const livingOrigBuf = await renderSvg(browser, livingOrig);
  const livingModBuf = await renderSvg(browser, livingMod);
  const livingClusters = await findChangedClusters(livingOrigBuf, livingModBuf);
  livingClusters.slice(0, 10).forEach((c, i) => {
    console.log(`  [${i+1}] cx:${c.cx} cy:${c.cy} 범위:(${c.minX}-${c.maxX}, ${c.minY}-${c.maxY}) 픽셀:${c.count}`);
  });

  await browser.close();
}

main().catch(console.error);
