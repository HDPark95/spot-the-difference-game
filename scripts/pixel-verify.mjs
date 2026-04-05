/**
 * 픽셀 비교 검증
 * 원본 SVG와 변형 SVG를 렌더링 → 픽셀 비교 → 각 차이점 좌표에 실제 변화가 있는지 확인
 * 변화가 없는 차이점은 FAIL 처리
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";
const SIZE = 500;

// levels.js를 동적 import
const { levels } = await import(path.join(PROJECT, "src/data/levels.js"));

async function renderSvgToPixels(browser, svgPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(PROJECT, "public", svgPath), "utf-8");
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  // background-simple 숨기기
  await page.evaluate(() => {
    const bs = document.querySelector("#background-simple");
    if (bs) bs.style.display = "none";
  });
  await new Promise(r => setTimeout(r, 500));
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return buf;
}

async function comparePixels(origBuf, modBuf) {
  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  // 각 픽셀의 차이를 계산, 변경된 영역 맵 생성
  const diffMap = new Uint8Array(w * h);
  let totalChanged = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dr = Math.abs(origData[idx] - modData[idx]);
      const dg = Math.abs(origData[idx + 1] - modData[idx + 1]);
      const db = Math.abs(origData[idx + 2] - modData[idx + 2]);
      const diff = dr + dg + db;
      if (diff > 30) { // 임계값: RGB 합 30 이상 차이
        diffMap[y * w + x] = 1;
        totalChanged++;
      }
    }
  }

  return { diffMap, w, h, totalChanged };
}

function checkDiffArea(diffMap, w, h, diff, svgViewBox) {
  // SVG viewBox 좌표 → 픽셀 좌표로 변환
  const scaleX = w / svgViewBox.w;
  const scaleY = h / svgViewBox.h;
  const px = Math.round(diff.cx * scaleX);
  const py = Math.round(diff.cy * scaleY);
  const pr = Math.round(diff.r * Math.max(scaleX, scaleY));

  // 히트 영역 내에서 변경된 픽셀 수 카운트
  let changedInArea = 0;
  let totalInArea = 0;

  for (let y = Math.max(0, py - pr); y < Math.min(h, py + pr); y++) {
    for (let x = Math.max(0, px - pr); x < Math.min(w, px + pr); x++) {
      const dist = Math.hypot(x - px, y - py);
      if (dist <= pr) {
        totalInArea++;
        if (diffMap[y * w + x]) changedInArea++;
      }
    }
  }

  const changeRatio = totalInArea > 0 ? changedInArea / totalInArea : 0;
  return { changedInArea, totalInArea, changeRatio, px, py, pr };
}

async function main() {
  console.log("=== 픽셀 비교 검증 시작 ===\n");

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  let allPass = true;

  for (const level of levels) {
    if (!level.modifiedSvg) { console.log(`[SKIP] ${level.id}: modifiedSvg 없음`); continue; }

    console.log(`[검증] ${level.id}`);

    // 렌더링
    const origBuf = await renderSvgToPixels(browser, level.originalSvg);
    const modBuf = await renderSvgToPixels(browser, level.modifiedSvg);

    // 픽셀 비교
    const { diffMap, w, h, totalChanged } = await comparePixels(origBuf, modBuf);
    console.log(`  전체 변경 픽셀: ${totalChanged} / ${w * h} (${(totalChanged / w / h * 100).toFixed(2)}%)`);

    if (totalChanged < 50) {
      console.log(`  [FAIL] 시각적 변경이 거의 없음!`);
      allPass = false;
      continue;
    }

    // viewBox 파싱
    const svgContent = fs.readFileSync(path.join(PROJECT, "public", level.originalSvg), "utf-8");
    const vbMatch = svgContent.match(/viewBox="([^"]*)"/);
    const vb = vbMatch ? vbMatch[1].split(/\s+/).map(Number) : [0, 0, 500, 500];
    const svgViewBox = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };

    // 각 차이점 검증
    let levelPass = true;
    for (const diff of level.diffs) {
      const result = checkDiffArea(diffMap, w, h, diff, svgViewBox);
      const status = result.changeRatio > 0.02 ? "OK" : "FAIL"; // 히트 영역 내 2% 이상 변경 필요
      if (status === "FAIL") { levelPass = false; allPass = false; }
      console.log(`  #${diff.id} ${status}: ${result.changedInArea}px 변경 (${(result.changeRatio * 100).toFixed(1)}%) — ${diff.label}`);
    }

    console.log(`  [${levelPass ? "PASS" : "FAIL"}] ${level.id}\n`);
  }

  await browser.close();
  console.log(`=== 결과: ${allPass ? "ALL PASS" : "FAIL"} ===`);
  process.exit(allPass ? 0 : 1);
}

main().catch(console.error);
