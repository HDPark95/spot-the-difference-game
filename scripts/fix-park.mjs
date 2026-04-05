/**
 * 공원 #5 - 나뭇잎 변경 시각화 및 수정
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
  await new Promise(r => setTimeout(r, 500));
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
  return totalInArea > 0 ? changedInArea / totalInArea : 0;
}

async function findChangedRegions(origBuf, modBuf) {
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
  return points;
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  const parkOrig = fs.readFileSync(path.join(PROJECT, "public/scenes/park.svg"), "utf-8");
  let parkMod = fs.readFileSync(path.join(PROJECT, "public/scenes/park-modified.svg"), "utf-8");

  // 현재 변형에서 display:none 확인
  const dispNone = parkMod.match(/display:none/g);
  console.log(`현재 공원 변형 display:none 개수: ${dispNone ? dispNone.length : 0}`);

  // 현재 변형의 Tree 영역 확인
  const treeIdx = parkMod.indexOf('id="Tree"');
  let treeStart = treeIdx;
  while (treeStart > 0 && parkMod[treeStart] !== '<') treeStart--;
  const treePart = parkMod.slice(treeStart, treeStart + 2000);
  console.log("현재 변형 Tree 시작 부분:");
  console.log(treePart.slice(0, 500));

  // 원본과 변형의 픽셀 비교
  const origBuf = await renderSvg(browser, parkOrig);
  const modBuf = await renderSvg(browser, parkMod);
  const changedPoints = await findChangedRegions(origBuf, modBuf);

  console.log(`\n전체 변경 픽셀: ${changedPoints.length}`);

  if (changedPoints.length > 0) {
    // 나무 상단 영역 (x:150-350, y:80-220)의 변경 확인
    const treeChanges = changedPoints.filter(p => p.x >= 150 && p.x <= 380 && p.y >= 60 && p.y <= 240);
    console.log(`나무 상단 영역 변경: ${treeChanges.length}픽셀`);
    if (treeChanges.length > 0) {
      const minX = Math.min(...treeChanges.map(p => p.x));
      const maxX = Math.max(...treeChanges.map(p => p.x));
      const minY = Math.min(...treeChanges.map(p => p.y));
      const maxY = Math.max(...treeChanges.map(p => p.y));
      console.log(`  범위: x:${minX}-${maxX}, y:${minY}-${maxY}`);
    }
  } else {
    console.log("변경이 없습니다 - display:none이 작동 안 함");

    // display:none이 제대로 적용되지 않은 경우
    // 나뭇잎을 visibility:hidden 또는 완전히 제거하는 방식 시도
  }

  // 전략 변경: Tree 내 파란 잎을 숨기는 대신 완전히 다른 요소를 제거
  // 공원에서 쉽게 제거할 수 있는 요소를 찾기
  // character-3 (배드민턴 치는 아이) - 이미 제거됨
  // Tablecloth는 이미 제거됨
  // Basket은 이미 이동됨

  // 남은 옵션:
  // 1. character-2 내의 일부 요소 제거
  // 2. character-1 내의 일부 요소 제거
  // 3. Tree 내 나뭇잎 자체를 완전히 제거 (display:none이 아닌 직접 삭제)
  // 4. background-complete의 구름이나 다른 요소 제거

  // 방법 4: background-complete에서 구름 찾기
  const bgIdx = parkOrig.indexOf('id="background-complete"');
  let bgStart = bgIdx;
  while (bgStart > 0 && parkOrig[bgStart] !== '<') bgStart--;
  const bgPart = parkOrig.slice(bgStart, bgStart + 15000);
  console.log("\nbg-complete 시작 (3000자):");
  console.log(bgPart.slice(0, 3000));

  await browser.close();
}

main().catch(console.error);
