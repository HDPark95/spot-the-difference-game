/**
 * 최종 좌표 확인 및 levels.js 업데이트
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

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  // 카페
  const cafeOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/cafe.svg"), "utf-8");
  const cafeMod = fs.readFileSync(path.join(PROJECT, "public/scenes/cafe-modified.svg"), "utf-8");
  const cafeOrigBuf = await renderSvg(browser, cafeOrig);
  const cafeModBuf = await renderSvg(browser, cafeMod);

  console.log("=== 카페 후보 좌표 ===");
  for (const [cx, cy, r, label] of [
    // #2 병
    [379, 120, 22, "#2 병"],
    [377, 113, 22, "#2 병(svgcoord)"],
    // #5 카운터 장식
    [187, 334, 25, "#5 카운터1"],
    [187, 334, 30, "#5 카운터1-r30"],
    [185, 395, 25, "#5 카운터2"],
    [186, 360, 30, "#5 카운터중간"],
    [186, 360, 35, "#5 카운터중간-r35"],
    [166, 370, 30, "#5 원래좌표-r30"],
  ]) {
    const res = await measureRatio(cafeOrigBuf, cafeModBuf, cx, cy, r);
    const status = res.ratio > 0.02 ? "OK" : "FAIL";
    console.log(`  ${status} ${label}: cx:${cx} cy:${cy} r:${r} → ${(res.ratio*100).toFixed(1)}%`);
  }

  // 거실
  const livingOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/livingroom.svg"), "utf-8");
  const livingMod = fs.readFileSync(path.join(PROJECT, "public/scenes/livingroom-modified.svg"), "utf-8");
  const livingOrigBuf = await renderSvg(browser, livingOrig);
  const livingModBuf = await renderSvg(browser, livingMod);

  console.log("\n=== 거실 후보 좌표 ===");
  for (const [cx, cy, r, label] of [
    [111, 196, 22, "#1 선반상단"],
    [99, 275, 22, "#2 선반중단"],
    [398, 339, 28, "#3 화분"],
    // #4 새 좌표 후보
    [239, 135, 22, "#4 조명새좌표"],
    [239, 135, 30, "#4 조명r30"],
    [239, 90, 25, "#4 조명상단"],
    [240, 178, 25, "#4 조명중간"],
    [86, 192, 22, "#5 책"],
  ]) {
    const res = await measureRatio(livingOrigBuf, livingModBuf, cx, cy, r);
    const status = res.ratio > 0.02 ? "OK" : "FAIL";
    console.log(`  ${status} ${label}: cx:${cx} cy:${cy} r:${r} → ${(res.ratio*100).toFixed(1)}%`);
  }

  // 공원
  const parkOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/park.svg"), "utf-8");
  const parkMod = fs.readFileSync(path.join(PROJECT, "public/scenes/park-modified.svg"), "utf-8");
  const parkOrigBuf = await renderSvg(browser, parkOrig);
  const parkModBuf = await renderSvg(browser, parkMod);

  console.log("\n=== 공원 후보 좌표 ===");
  for (const [cx, cy, r, label] of [
    [250, 412, 25, "#1 매트"],
    [375, 333, 25, "#2 배드민턴"],
    [308, 78, 22, "#3 나비"],
    [233, 386, 22, "#4 바구니"],
    // #5 새 좌표 후보
    [205, 217, 25, "#5 나뭇잎새"],
    [205, 215, 22, "#5 나뭇잎새r22"],
    [205, 211, 25, "#5 나뭇잎새2"],
    [210, 215, 22, "#5 나뭇잎새3"],
    [200, 211, 22, "#5 나뭇잎새4"],
  ]) {
    const res = await measureRatio(parkOrigBuf, parkModBuf, cx, cy, r);
    const status = res.ratio > 0.02 ? "OK" : "FAIL";
    console.log(`  ${status} ${label}: cx:${cx} cy:${cy} r:${r} → ${(res.ratio*100).toFixed(1)}%`);
  }

  await browser.close();
}

main().catch(console.error);
