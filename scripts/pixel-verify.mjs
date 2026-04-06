/**
 * 픽셀 비교 검증 v2
 * 1. 원본/변형 SVG 렌더링 → 픽셀 비교
 * 2. 각 차이점 좌표에 실제 변화가 있는지 확인
 * 3. 변경이 히트박스 밖에만 있는지 확인
 * 4. diff 히트맵 PNG 생성
 * 5. 변경 크기 등급 판정 (눈에 보이는 수준인지)
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
const QA_DIR = path.join(PROJECT, "qa-screenshots");

const { levels } = await import(path.join(PROJECT, "src/data/levels.js"));

if (!fs.existsSync(QA_DIR)) fs.mkdirSync(QA_DIR, { recursive: true });

async function renderSvgToPixels(browser, svgPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(PROJECT, "public", svgPath), "utf-8");
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  // background-simple은 일부 SVG에서 메인 배경이므로 숨기지 않음
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

  const diffMap = new Uint8Array(w * h);
  const diffStrength = new Uint8Array(w * h); // 변경 강도 0~255
  let totalChanged = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dr = Math.abs(origData[idx] - modData[idx]);
      const dg = Math.abs(origData[idx + 1] - modData[idx + 1]);
      const db = Math.abs(origData[idx + 2] - modData[idx + 2]);
      const diff = dr + dg + db;
      if (diff > 30) {
        diffMap[y * w + x] = 1;
        diffStrength[y * w + x] = Math.min(255, diff);
        totalChanged++;
      }
    }
  }

  return { diffMap, diffStrength, w, h, ch, totalChanged, origData, modData };
}

function checkDiffArea(diffMap, w, h, diff, svgViewBox) {
  const scaleX = w / svgViewBox.w;
  const scaleY = h / svgViewBox.h;
  const px = Math.round(diff.cx * scaleX);
  const py = Math.round(diff.cy * scaleY);
  const pr = Math.round(diff.r * Math.max(scaleX, scaleY));

  let changedInArea = 0, totalInArea = 0;

  for (let y = Math.max(0, py - pr); y < Math.min(h, py + pr); y++) {
    for (let x = Math.max(0, px - pr); x < Math.min(w, px + pr); x++) {
      if (Math.hypot(x - px, y - py) <= pr) {
        totalInArea++;
        if (diffMap[y * w + x]) changedInArea++;
      }
    }
  }

  const changeRatio = totalInArea > 0 ? changedInArea / totalInArea : 0;
  return { changedInArea, totalInArea, changeRatio, px, py, pr };
}

// 변경이 히트박스 밖에만 있는지 확인
function findUnmatchedChanges(diffMap, w, h, diffs, svgViewBox) {
  const scaleX = w / svgViewBox.w, scaleY = h / svgViewBox.h;
  // 모든 히트박스를 합친 마스크
  const covered = new Uint8Array(w * h);
  for (const d of diffs) {
    const px = Math.round(d.cx * scaleX), py = Math.round(d.cy * scaleY);
    const pr = Math.round(d.r * Math.max(scaleX, scaleY));
    for (let y = Math.max(0, py - pr); y < Math.min(h, py + pr); y++) {
      for (let x = Math.max(0, px - pr); x < Math.min(w, px + pr); x++) {
        if (Math.hypot(x - px, y - py) <= pr) covered[y * w + x] = 1;
      }
    }
  }
  // 히트박스 밖에 있는 변경 픽셀 수
  let uncovered = 0;
  for (let i = 0; i < w * h; i++) {
    if (diffMap[i] && !covered[i]) uncovered++;
  }
  return uncovered;
}

// diff 히트맵 PNG 생성
async function generateHeatmap(origData, diffStrength, w, h, ch, diffs, svgViewBox, outputPath) {
  const scaleX = w / svgViewBox.w, scaleY = h / svgViewBox.h;
  // RGBA 이미지 생성 (원본 어둡게 + 변경 부분 빨간색 + 히트박스 초록 원)
  const rgba = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * ch;
      const dstIdx = (y * w + x) * 4;
      const strength = diffStrength[y * w + x];

      if (strength > 0) {
        // 변경된 픽셀: 빨간색으로 표시
        rgba[dstIdx] = 255;
        rgba[dstIdx + 1] = 50;
        rgba[dstIdx + 2] = 50;
        rgba[dstIdx + 3] = 200;
      } else {
        // 변경 안 된 픽셀: 원본을 어둡게
        rgba[dstIdx] = Math.round(origData[srcIdx] * 0.3);
        rgba[dstIdx + 1] = Math.round(origData[srcIdx + 1] * 0.3);
        rgba[dstIdx + 2] = Math.round(origData[srcIdx + 2] * 0.3);
        rgba[dstIdx + 3] = 255;
      }
    }
  }

  // 히트박스 원 그리기 (초록색)
  for (const d of diffs) {
    const px = Math.round(d.cx * scaleX), py = Math.round(d.cy * scaleY);
    const pr = Math.round(d.r * Math.max(scaleX, scaleY));
    for (let y = Math.max(0, py - pr); y < Math.min(h, py + pr); y++) {
      for (let x = Math.max(0, px - pr); x < Math.min(w, px + pr); x++) {
        const dist = Math.hypot(x - px, y - py);
        if (dist >= pr - 2 && dist <= pr + 1) {
          const dstIdx = (y * w + x) * 4;
          rgba[dstIdx] = 0;
          rgba[dstIdx + 1] = 255;
          rgba[dstIdx + 2] = 100;
          rgba[dstIdx + 3] = 255;
        }
      }
    }
  }

  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(outputPath);
}

// 변경 크기 등급
function gradeChange(ratio) {
  if (ratio >= 0.3) return "A (확실히 보임)";
  if (ratio >= 0.1) return "B (잘 보면 보임)";
  if (ratio >= 0.02) return "C (겨우 보임)";
  return "F (안 보임)";
}

async function main() {
  console.log("=== 픽셀 비교 검증 v2 ===\n");

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  let allPass = true;
  const report = [];

  for (const level of levels) {
    if (!level.modifiedSvg) { console.log(`[SKIP] ${level.id}`); continue; }
    console.log(`[검증] ${level.id}`);

    const origBuf = await renderSvgToPixels(browser, level.originalSvg);
    const modBuf = await renderSvgToPixels(browser, level.modifiedSvg);
    const { diffMap, diffStrength, w, h, ch, totalChanged, origData } = await comparePixels(origBuf, modBuf);

    const svgContent = fs.readFileSync(path.join(PROJECT, "public", level.originalSvg), "utf-8");
    const vbMatch = svgContent.match(/viewBox="([^"]*)"/);
    const vb = vbMatch ? vbMatch[1].split(/\s+/).map(Number) : [0, 0, 500, 500];
    const svgViewBox = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };

    console.log(`  전체 변경: ${totalChanged}px (${(totalChanged / w / h * 100).toFixed(2)}%)`);

    if (totalChanged < 50) {
      console.log(`  [FAIL] 시각적 변경이 거의 없음!`);
      allPass = false;
      report.push({ id: level.id, pass: false, reason: "변경 없음" });
      continue;
    }

    // 히트박스 밖 변경 확인
    const uncovered = findUnmatchedChanges(diffMap, w, h, level.diffs, svgViewBox);
    if (uncovered > totalChanged * 0.5) {
      console.log(`  [경고] 히트박스 밖 변경 ${uncovered}px (${(uncovered/totalChanged*100).toFixed(0)}%) — 히트박스 좌표 확인 필요`);
    }

    // 각 차이점 검증
    let levelPass = true;
    const diffResults = [];
    for (const diff of level.diffs) {
      const result = checkDiffArea(diffMap, w, h, diff, svgViewBox);
      const pass = result.changeRatio > 0.02;
      const grade = gradeChange(result.changeRatio);
      if (!pass) { levelPass = false; allPass = false; }
      console.log(`  #${diff.id} ${pass ? "OK" : "FAIL"} ${grade}: ${result.changedInArea}px (${(result.changeRatio * 100).toFixed(1)}%) — ${diff.label}`);
      diffResults.push({ ...diff, ...result, pass, grade });
    }

    // 히트맵 PNG 생성
    const heatmapPath = path.join(QA_DIR, `${level.id}-heatmap.png`);
    await generateHeatmap(origData, diffStrength, w, h, ch, level.diffs, svgViewBox, heatmapPath);
    console.log(`  히트맵: ${heatmapPath}`);

    console.log(`  [${levelPass ? "PASS" : "FAIL"}] ${level.id}\n`);
    report.push({ id: level.id, pass: levelPass, diffs: diffResults, uncovered, totalChanged });
  }

  await browser.close();

  // 리포트 JSON 저장
  fs.writeFileSync(path.join(QA_DIR, "pixel-report.json"), JSON.stringify(report, null, 2));

  console.log(`=== 결과: ${allPass ? "ALL PASS" : "FAIL"} ===`);
  console.log(`리포트: ${QA_DIR}/pixel-report.json`);
  console.log(`히트맵: ${QA_DIR}/*-heatmap.png`);
  process.exit(allPass ? 0 : 1);
}

main().catch(console.error);
