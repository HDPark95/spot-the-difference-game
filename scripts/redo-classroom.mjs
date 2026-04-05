/**
 * classroom 레벨 재설계 스크립트
 * 1. SVG 분석 (면적 200~4000 하위 요소)
 * 2. 차이점 5개 재설계 (5~30% 변경 목표)
 * 3. classroom-modified.svg 생성
 * 4. 픽셀 검증
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";
const SVG_PATH = path.join(PROJECT, "public/scenes/classroom.svg");
const MOD_SVG_PATH = path.join(PROJECT, "public/scenes/classroom-modified.svg");
const SIZE = 500;

// ===== 1단계: SVG 요소 분석 =====
async function analyzeElements() {
  console.log("=== 1단계: SVG 요소 분석 ===\n");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(SVG_PATH, "utf-8");
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 500));

  // 모든 SVG 요소의 bounding box 수집
  const elements = await page.evaluate(() => {
    const svgEl = document.querySelector("svg");
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / svgEl.clientWidth;
    const scaleY = vb.height / svgEl.clientHeight;

    const results = [];
    const allEls = svgEl.querySelectorAll("*");
    allEls.forEach((el, i) => {
      try {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area >= 200 && area <= 8000) {
          // SVG 좌표로 변환
          const cx = (rect.left + rect.width / 2) * scaleX;
          const cy = (rect.top + rect.height / 2) * scaleY;
          const w = rect.width * scaleX;
          const h = rect.height * scaleY;
          const tag = el.tagName;
          const id = el.id || "";
          const fill = el.getAttribute("fill") || el.style.fill || "";
          const cls = el.className?.baseVal || "";

          results.push({
            index: i,
            tag,
            id,
            cls,
            fill,
            cx: Math.round(cx),
            cy: Math.round(cy),
            w: Math.round(w),
            h: Math.round(h),
            area: Math.round(area),
            // 위치 구역
            zone: cy < 150 ? "상단" : cy < 300 ? "중단" : "하단"
          });
        }
      } catch(e) {}
    });
    return results;
  });

  await browser.close();

  console.log(`면적 200~8000 요소: ${elements.length}개\n`);

  // 구역별 분류
  const zones = { "상단": [], "중단": [], "하단": [] };
  for (const el of elements) {
    zones[el.zone].push(el);
  }

  for (const [zone, els] of Object.entries(zones)) {
    console.log(`[${zone}] ${els.length}개:`);
    els.slice(0, 20).forEach(el => {
      console.log(`  #${el.index} <${el.tag}> id="${el.id}" cx=${el.cx} cy=${el.cy} w=${el.w} h=${el.h} area=${el.area} fill="${el.fill.substring(0, 20)}"`);
    });
    if (els.length > 20) console.log(`  ... 등 ${els.length - 20}개 더`);
    console.log();
  }

  return elements;
}

// ===== SVG 읽기 및 파싱 =====
function loadSVG() {
  return fs.readFileSync(SVG_PATH, "utf-8");
}

// ===== 2~3단계: 변형 SVG 생성 =====
async function createModifiedSVG() {
  console.log("=== 2~3단계: 변형 SVG 생성 ===\n");

  let svg = loadSVG();

  // Puppeteer로 요소 위치 파악
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 500));

  // 주요 그룹 요소들 분석
  const groupInfo = await page.evaluate(() => {
    const svgEl = document.querySelector("svg");
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / svgEl.clientWidth;
    const scaleY = vb.height / svgEl.clientHeight;

    const groups = svgEl.querySelectorAll("g");
    const results = [];
    groups.forEach((g, i) => {
      const rect = g.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        results.push({
          index: i,
          id: g.id,
          cx: Math.round((rect.left + rect.width/2) * scaleX),
          cy: Math.round((rect.top + rect.height/2) * scaleY),
          w: Math.round(rect.width * scaleX),
          h: Math.round(rect.height * scaleY),
          area: Math.round(rect.width * rect.height)
        });
      }
    });
    return results;
  });

  console.log("주요 그룹들:");
  groupInfo.filter(g => g.area > 1000 && g.area < 50000).slice(0, 30).forEach(g => {
    console.log(`  #${g.index} id="${g.id}" cx=${g.cx} cy=${g.cy} w=${g.w} h=${g.h} area=${g.area}`);
  });

  await browser.close();

  console.log("\nSVG 길이:", svg.length, "chars");

  // SVG 내용 샘플링으로 구조 파악
  // 칠판, 학생, 교실 배경 요소 찾기
  const svgSnippets = [];
  // 주요 id 찾기
  const idMatches = svg.match(/id="([^"]+)"/g) || [];
  console.log("\n주요 ID 목록:", idMatches.slice(0, 30).join(", "));

  return groupInfo;
}

// ===== 픽셀 비교 =====
async function renderSvgToPixels(browser, svgContent) {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svgContent}</body></html>`, { waitUntil: "domcontentloaded" });
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

// ===== SVG 분석 후 변형 적용 =====
async function applyModifications() {
  let svg = loadSVG();

  console.log("\nSVG 내용 분석...");

  // 주요 패턴 찾기
  // 1) 칠판 관련 요소
  const chalkboardIdx = svg.indexOf('background-complete');
  const simpleIdx = svg.indexOf('background-simple');

  // SVG에서 특정 구역 추출을 위해 Puppeteer 사용
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 500));

  // 전체 요소의 outerHTML + boundingRect 수집 (변경 가능한 것들)
  const candidates = await page.evaluate(() => {
    const svgEl = document.querySelector("svg");
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / svgEl.clientWidth;
    const scaleY = vb.height / svgEl.clientHeight;

    const results = [];
    // 모든 path, circle, rect, polygon, ellipse
    const shapes = svgEl.querySelectorAll("path, circle, rect, polygon, ellipse, text");
    shapes.forEach((el, i) => {
      try {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height * scaleX * scaleY;
        if (area < 100 || area > 30000) return;

        const cx = (rect.left + rect.width / 2) * scaleX;
        const cy = (rect.top + rect.height / 2) * scaleY;
        const w = rect.width * scaleX;
        const h = rect.height * scaleY;

        // 실제 픽셀 면적 (500x500 스케일)
        const pixelArea = rect.width * rect.height;

        results.push({
          index: i,
          tag: el.tagName,
          id: el.id || "",
          fill: el.getAttribute("fill") || el.style?.fill || "",
          stroke: el.getAttribute("stroke") || "",
          cx: Math.round(cx),
          cy: Math.round(cy),
          w: Math.round(w),
          h: Math.round(h),
          area: Math.round(area),
          pixelArea: Math.round(pixelArea),
          // 부모 그룹 id
          parentId: el.parentElement?.id || "",
          // 형제 수
          siblingCount: el.parentElement?.children?.length || 0
        });
      } catch(e) {}
    });
    return results;
  });

  await browser.close();

  console.log(`\n변경 가능한 요소 ${candidates.length}개`);

  // 구역별로 분류
  const top = candidates.filter(c => c.cy < 180);
  const mid = candidates.filter(c => c.cy >= 180 && c.cy < 320);
  const bot = candidates.filter(c => c.cy >= 320);

  console.log("\n[상단 cy<180] 요소들 (칠판/배경 장식):");
  top.filter(c => c.area > 300 && c.area < 15000).slice(0, 25).forEach(c => {
    console.log(`  #${c.index} <${c.tag}> cx=${c.cx} cy=${c.cy} w=${c.w} h=${c.h} area=${c.area} fill="${c.fill.substring(0,15)}" parent="${c.parentId}"`);
  });

  console.log("\n[중단 cy 180~320] 요소들 (학생 상반신/소지품):");
  mid.filter(c => c.area > 300 && c.area < 15000).slice(0, 25).forEach(c => {
    console.log(`  #${c.index} <${c.tag}> cx=${c.cx} cy=${c.cy} w=${c.w} h=${c.h} area=${c.area} fill="${c.fill.substring(0,15)}" parent="${c.parentId}"`);
  });

  console.log("\n[하단 cy>=320] 요소들 (책상/학생 하반신):");
  bot.filter(c => c.area > 300 && c.area < 15000).slice(0, 25).forEach(c => {
    console.log(`  #${c.index} <${c.tag}> cx=${c.cx} cy=${c.cy} w=${c.w} h=${c.h} area=${c.area} fill="${c.fill.substring(0,15)}" parent="${c.parentId}"`);
  });

  return candidates;
}

// ===== 메인 =====
async function main() {
  console.log("=== classroom 레벨 재설계 ===\n");

  // 1단계: 분석
  await analyzeElements();

  // 2단계: 더 상세한 후보 분석
  const candidates = await applyModifications();

  // 분석 결과를 파일로 저장
  fs.writeFileSync(
    path.join(PROJECT, "scripts/classroom-analysis.json"),
    JSON.stringify(candidates, null, 2)
  );
  console.log("\n분석 결과 저장: scripts/classroom-analysis.json");
  console.log("\n다음 단계: 분석 결과를 바탕으로 변형 설계");
}

main().catch(console.error);
