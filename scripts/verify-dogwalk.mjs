/**
 * dogwalk 픽셀 검증 스크립트
 * 원본과 변형 SVG를 렌더링하여 각 차이점 히트박스 내 픽셀 변화율 계산
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";
const SVG_PATH = path.join(PROJECT, "public/scenes/dogwalk.svg");
const MOD_SVG_PATH = path.join(PROJECT, "public/scenes/dogwalk-modified.svg");
const SIZE = 500;

// 검증할 차이점 후보 (히트박스 r=40)
const DIFFS = [
  { id: 1, cx: 165, cy: 248, r: 45, label: "왼쪽 식물 제거" },
  { id: 2, cx: 310, cy: 305, r: 45, label: "오른쪽 잔디 제거" },
  { id: 3, cx: 313, cy: 373, r: 40, label: "강아지 발 제거" },
  { id: 4, cx: 400, cy: 310, r: 45, label: "배경 장식 꽃 이동" },
  { id: 5, cx: 416, cy: 283, r: 40, label: "배경 작은 잎 색상 변경" },
];

async function renderSvgToPixels(browser, svgContent) {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden">${svgContent}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 800));
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
  let totalChanged = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dr = Math.abs(origData[idx] - modData[idx]);
      const dg = Math.abs(origData[idx+1] - modData[idx+1]);
      const db = Math.abs(origData[idx+2] - modData[idx+2]);
      if (dr + dg + db > 30) {
        diffMap[y * w + x] = 1;
        totalChanged++;
      }
    }
  }

  return { diffMap, w, h, totalChanged };
}

function checkArea(diffMap, w, h, cx, cy, r, svgW = 500, svgH = 500) {
  const scaleX = w / svgW, scaleY = h / svgH;
  const px = Math.round(cx * scaleX), py = Math.round(cy * scaleY);
  const pr = Math.round(r * Math.max(scaleX, scaleY));
  let changed = 0, total = 0;
  for (let y = Math.max(0, py - pr); y < Math.min(h, py + pr); y++) {
    for (let x = Math.max(0, px - pr); x < Math.min(w, px + pr); x++) {
      if (Math.hypot(x - px, y - py) <= pr) {
        total++;
        if (diffMap[y * w + x]) changed++;
      }
    }
  }
  return total > 0 ? changed / total : 0;
}

function grade(ratio) {
  if (ratio >= 0.3) return "A";
  if (ratio >= 0.1) return "B";
  if (ratio >= 0.02) return "C";
  return "F";
}

async function main() {
  console.log("=== dogwalk 픽셀 검증 ===\n");

  const origSvg = fs.readFileSync(SVG_PATH, "utf-8");
  const modSvg = fs.readFileSync(MOD_SVG_PATH, "utf-8");

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  console.log("렌더링 중...");
  const origBuf = await renderSvgToPixels(browser, origSvg);
  const modBuf = await renderSvgToPixels(browser, modSvg);

  await browser.close();

  // 스크린샷 저장 (디버그용)
  fs.writeFileSync(path.join(PROJECT, "scripts/dogwalk-orig-preview.png"), origBuf);
  fs.writeFileSync(path.join(PROJECT, "scripts/dogwalk-mod-preview.png"), modBuf);
  console.log("스크린샷 저장 완료\n");

  const { diffMap, w, h, totalChanged } = await comparePixels(origBuf, modBuf);
  const totalPx = w * h;
  console.log(`전체 변경 픽셀: ${totalChanged} / ${totalPx} (${(totalChanged/totalPx*100).toFixed(2)}%)\n`);

  let allPass = true;
  const results = [];

  for (const diff of DIFFS) {
    const ratio = checkArea(diffMap, w, h, diff.cx, diff.cy, diff.r);
    const pct = (ratio * 100).toFixed(1);
    const g = grade(ratio);
    const pass = ratio >= 0.02;
    if (!pass) allPass = false;

    console.log(`[${pass ? "PASS" : "FAIL"}] 차이 ${diff.id}: ${diff.label}`);
    console.log(`  cx=${diff.cx} cy=${diff.cy} r=${diff.r}`);
    console.log(`  변경율: ${pct}% 등급: ${g}`);
    console.log();

    results.push({ ...diff, ratio, pct, grade: g, pass });
  }

  console.log("=== 검증 결과 ===");
  console.log(allPass ? "ALL PASS" : "FAIL 있음");
  console.log();

  // B등급 이상 확인
  const bgrades = results.filter(r => ['A','B'].includes(r.grade)).length;
  console.log(`B등급 이상: ${bgrades}/${results.length}`);

  return { results, allPass };
}

main().catch(console.error);
