/**
 * 정밀 좌표 조정
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

async function measureRatio(origBuf, modBuf, cx, cy, r) {
  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  let changedInArea = 0, totalInArea = 0;
  for (let y = Math.max(0, cy - r); y < Math.min(h, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x < Math.min(w, cx + r); x++) {
      if (Math.hypot(x - cx, y - cy) <= r) {
        totalInArea++;
        const idx = (y * w + x) * ch;
        const dr = Math.abs(origData[idx] - modData[idx]);
        const dg = Math.abs(origData[idx+1] - modData[idx+1]);
        const db = Math.abs(origData[idx+2] - modData[idx+2]);
        if (dr + dg + db > 30) changedInArea++;
      }
    }
  }
  return { ratio: totalInArea > 0 ? changedInArea / totalInArea : 0, changedInArea, totalInArea };
}

async function findBestCoord(origBuf, modBuf, region, r) {
  const { minX, maxX, minY, maxY } = region;
  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  // 변경된 픽셀 히트맵
  const diffMap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dr = Math.abs(origData[idx] - modData[idx]);
      const dg = Math.abs(origData[idx+1] - modData[idx+1]);
      const db = Math.abs(origData[idx+2] - modData[idx+2]);
      if (dr + dg + db > 30) diffMap[y * w + x] = 1;
    }
  }

  // 그리드 검색으로 최적 좌표 찾기
  let best = { ratio: 0, cx: 0, cy: 0 };
  for (let cy = minY; cy <= maxY; cy += 5) {
    for (let cx = minX; cx <= maxX; cx += 5) {
      let changed = 0, total = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.hypot(dx, dy) <= r) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              total++;
              if (diffMap[ny * w + nx]) changed++;
            }
          }
        }
      }
      const ratio = total > 0 ? changed / total : 0;
      if (ratio > best.ratio) best = { ratio, cx, cy };
    }
  }
  return best;
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  // 공원 #5 최적 좌표 찾기
  const parkOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/park.svg"), "utf-8");
  const parkMod = fs.readFileSync(path.join(PROJECT, "public/scenes/park-modified.svg"), "utf-8");
  const origBuf = await renderSvg(browser, parkOrig);
  const modBuf = await renderSvg(browser, parkMod);

  console.log("=== 공원 #5 최적 좌표 탐색 ===");
  const best = await findBestCoord(origBuf, modBuf, { minX: 150, maxX: 350, minY: 60, maxY: 240 }, 25);
  console.log(`  최적 좌표: cx:${best.cx}, cy:${best.cy}, ratio:${(best.ratio*100).toFixed(1)}%`);

  // 여러 좌표 테스트
  for (const [cx, cy, r] of [
    [248, 149, 25], [248, 120, 25], [240, 149, 25],
    [248, 200, 25], [200, 211, 25], [210, 211, 22],
    [248, 149, 30], [248, 130, 30], [270, 165, 25],
  ]) {
    const res = await measureRatio(origBuf, modBuf, cx, cy, r);
    console.log(`  cx:${cx} cy:${cy} r:${r} → ${(res.ratio*100).toFixed(1)}% (${res.changedInArea}px)`);
  }

  // 카페 #5 카운터 장식 최적 좌표
  console.log("\n=== 카페 #5 카운터 장식 최적 좌표 ===");
  const cafeOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/cafe.svg"), "utf-8");
  const cafeMod = fs.readFileSync(path.join(PROJECT, "public/scenes/cafe-modified.svg"), "utf-8");
  const cafeOrigBuf = await renderSvg(browser, cafeOrig);
  const cafeModBuf = await renderSvg(browser, cafeMod);

  const cafeBest = await findBestCoord(cafeOrigBuf, cafeModBuf, { minX: 100, maxX: 280, minY: 260, maxY: 420 }, 25);
  console.log(`  최적 좌표: cx:${cafeBest.cx}, cy:${cafeBest.cy}, ratio:${(cafeBest.ratio*100).toFixed(1)}%`);

  for (const [cx, cy, r] of [
    [146, 340, 22], [146, 340, 30], [178, 340, 22], [178, 340, 30],
    [146, 360, 22], [178, 360, 22], [115, 350, 25], [115, 340, 25],
    [146, 350, 25], [146, 370, 25], [160, 340, 25],
  ]) {
    const res = await measureRatio(cafeOrigBuf, cafeModBuf, cx, cy, r);
    console.log(`  cx:${cx} cy:${cy} r:${r} → ${(res.ratio*100).toFixed(1)}%`);
  }

  await browser.close();
}

main().catch(console.error);
