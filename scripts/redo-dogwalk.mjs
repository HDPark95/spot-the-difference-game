/**
 * dogwalk 레벨 재설계 스크립트
 * 1. SVG 분석 (g[id] + 하위 요소 면적 200~4000)
 * 2. 차이점 5개 재설계
 * 3. dogwalk-modified.svg 생성
 * 4. 픽셀 검증 (Sharp)
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

// ===== 1단계: SVG 요소 분석 =====
async function analyzeElements() {
  console.log("=== 1단계: SVG 요소 분석 ===\n");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(SVG_PATH, "utf-8");
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 500));

  // g[id] 그룹 내 하위 요소 분석
  const elements = await page.evaluate(() => {
    const svgEl = document.querySelector("svg");
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / svgEl.clientWidth;
    const scaleY = vb.height / svgEl.clientHeight;

    const results = [];

    // g[id] 그룹들 분석
    const groups = svgEl.querySelectorAll("g[id]");
    const groupInfos = [];
    groups.forEach(g => {
      const rect = g.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        groupInfos.push({
          id: g.id,
          cx: Math.round((rect.left + rect.width / 2) * scaleX),
          cy: Math.round((rect.top + rect.height / 2) * scaleY),
          w: Math.round(rect.width * scaleX),
          h: Math.round(rect.height * scaleY),
          area: Math.round(rect.width * rect.height),
          childCount: g.querySelectorAll("*").length
        });
      }
    });

    // 각 그룹 내 하위 요소 분석 (면적 200~4000)
    const allShapes = svgEl.querySelectorAll("path, circle, rect, polygon, ellipse, polyline, line");
    allShapes.forEach((el, i) => {
      try {
        const rect = el.getBoundingClientRect();
        const pixelArea = rect.width * rect.height;
        if (pixelArea < 200 || pixelArea > 4000) return;

        const cx = (rect.left + rect.width / 2) * scaleX;
        const cy = (rect.top + rect.height / 2) * scaleY;
        const w = rect.width * scaleX;
        const h = rect.height * scaleY;

        // 부모 그룹 찾기
        let parentGroup = el.parentElement;
        let parentGroupId = "";
        while (parentGroup && parentGroup !== svgEl) {
          if (parentGroup.id) { parentGroupId = parentGroup.id; break; }
          parentGroup = parentGroup.parentElement;
        }

        results.push({
          index: i,
          tag: el.tagName,
          fill: el.getAttribute("fill") || el.style?.fill || "",
          stroke: el.getAttribute("stroke") || "",
          cx: Math.round(cx),
          cy: Math.round(cy),
          w: Math.round(w),
          h: Math.round(h),
          pixelArea: Math.round(pixelArea),
          svgArea: Math.round(w * h),
          parentGroupId,
          // outerHTML 앞부분 (식별용)
          snippet: el.outerHTML.substring(0, 120)
        });
      } catch(e) {}
    });

    return { groupInfos, elements: results };
  });

  await browser.close();

  console.log("그룹 목록:");
  elements.groupInfos.forEach(g => {
    console.log(`  id="${g.id}" cx=${g.cx} cy=${g.cy} w=${g.w} h=${g.h} area=${g.area} children=${g.childCount}`);
  });

  console.log(`\n면적 200~4000 요소: ${elements.elements.length}개\n`);

  // 구역별 분류
  const zones = { "상단(cy<170)": [], "중단(cy170~330)": [], "하단(cy>=330)": [] };
  for (const el of elements.elements) {
    if (el.cy < 170) zones["상단(cy<170)"].push(el);
    else if (el.cy < 330) zones["중단(cy170~330)"].push(el);
    else zones["하단(cy>=330)"].push(el);
  }

  for (const [zone, els] of Object.entries(zones)) {
    console.log(`[${zone}] ${els.length}개:`);
    els.slice(0, 30).forEach(el => {
      console.log(`  #${el.index} <${el.tag}> cx=${el.cx} cy=${el.cy} w=${el.w} h=${el.h} area=${el.pixelArea} parent="${el.parentGroupId}" fill="${el.fill.substring(0, 20)}"`);
    });
    if (els.length > 30) console.log(`  ... ${els.length - 30}개 더`);
    console.log();
  }

  return elements;
}

// ===== SVG 읽기 =====
function loadSVG() {
  return fs.readFileSync(SVG_PATH, "utf-8");
}

// ===== 2~3단계: 변형 SVG 생성 =====
async function createModifiedSVG(analysisData) {
  console.log("=== 2~3단계: 변형 SVG 생성 ===\n");

  let svg = loadSVG();

  // Puppeteer로 요소 outerHTML 수집 (index 기준으로 정확히 식별)
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 500));

  // 변경 후보 요소들의 outerHTML 수집
  const candidates = await page.evaluate(() => {
    const svgEl = document.querySelector("svg");
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / svgEl.clientWidth;
    const scaleY = vb.height / svgEl.clientHeight;

    const allShapes = svgEl.querySelectorAll("path, circle, rect, polygon, ellipse, polyline, line");
    const results = [];
    allShapes.forEach((el, i) => {
      try {
        const rect = el.getBoundingClientRect();
        const pixelArea = rect.width * rect.height;
        if (pixelArea < 100 || pixelArea > 6000) return;

        const cx = (rect.left + rect.width / 2) * scaleX;
        const cy = (rect.top + rect.height / 2) * scaleY;
        const w = rect.width * scaleX;
        const h = rect.height * scaleY;

        let parentGroup = el.parentElement;
        let parentGroupId = "";
        while (parentGroup && parentGroup !== svgEl) {
          if (parentGroup.id) { parentGroupId = parentGroup.id; break; }
          parentGroup = parentGroup.parentElement;
        }

        results.push({
          index: i,
          tag: el.tagName,
          fill: el.getAttribute("fill") || "",
          stroke: el.getAttribute("stroke") || "",
          style: el.getAttribute("style") || "",
          cx: Math.round(cx),
          cy: Math.round(cy),
          w: Math.round(w),
          h: Math.round(h),
          pixelArea: Math.round(pixelArea),
          parentGroupId,
          outerHTML: el.outerHTML
        });
      } catch(e) {}
    });
    return results;
  });

  console.log(`후보 요소 수집: ${candidates.length}개`);

  // Cloud 그룹 내 요소
  const cloudEls = candidates.filter(c => c.parentGroupId === "Cloud");
  console.log(`\nCloud 그룹 요소 (${cloudEls.length}개):`);
  cloudEls.forEach(c => {
    console.log(`  #${c.index} cx=${c.cx} cy=${c.cy} w=${c.w} h=${c.h} area=${c.pixelArea} fill="${c.fill.substring(0,20)}"`);
  });

  // Floor 그룹 내 요소
  const floorEls = candidates.filter(c => c.parentGroupId === "Floor");
  console.log(`\nFloor 그룹 요소 (${floorEls.length}개):`);
  floorEls.slice(0, 20).forEach(c => {
    console.log(`  #${c.index} cx=${c.cx} cy=${c.cy} w=${c.w} h=${c.h} area=${c.pixelArea} fill="${c.fill.substring(0,20)}"`);
  });

  // Plants 그룹 내 요소
  const plantEls = candidates.filter(c => c.parentGroupId === "Plants");
  console.log(`\nPlants 그룹 요소 (${plantEls.length}개):`);
  plantEls.slice(0, 20).forEach(c => {
    console.log(`  #${c.index} cx=${c.cx} cy=${c.cy} w=${c.w} h=${c.h} area=${c.pixelArea} fill="${c.fill.substring(0,20)}"`);
  });

  // Characters 그룹 내 요소
  const charEls = candidates.filter(c => c.parentGroupId === "Characters");
  console.log(`\nCharacters 그룹 요소 (${charEls.length}개):`);
  charEls.slice(0, 30).forEach(c => {
    console.log(`  #${c.index} cx=${c.cx} cy=${c.cy} w=${c.w} h=${c.h} area=${c.pixelArea} fill="${c.fill.substring(0,20)}"`);
  });

  // background-simple 그룹 내 요소
  const bgEls = candidates.filter(c => c.parentGroupId === "background-simple");
  console.log(`\nbackground-simple 요소 (${bgEls.length}개):`);
  bgEls.slice(0, 20).forEach(c => {
    console.log(`  #${c.index} cx=${c.cx} cy=${c.cy} w=${c.w} h=${c.h} area=${c.pixelArea} fill="${c.fill.substring(0,20)}"`);
  });

  await browser.close();

  // 분석 결과를 바탕으로 변형 계획 수립
  console.log("\n=== 변형 계획 ===");

  // 목표:
  // 1. 제거 2~3개: 소형 독립 요소 제거 (area 200~1500)
  // 2. 위치 이동 1개: 50px+ 이동
  // 3. 색 변경 1개: 작은 요소 색상 변경

  // 요소들을 JSON에 저장하여 다음 단계에서 활용
  const analysisPath = path.join(PROJECT, "scripts/dogwalk-analysis.json");
  fs.writeFileSync(analysisPath, JSON.stringify({
    cloudEls: cloudEls.slice(0, 30),
    floorEls: floorEls.slice(0, 30),
    plantEls: plantEls.slice(0, 30),
    charEls: charEls.slice(0, 50),
    bgEls: bgEls.slice(0, 30),
    all: candidates.slice(0, 200)
  }, null, 2));
  console.log(`\n분석 저장: ${analysisPath}`);

  return candidates;
}

// ===== 4단계: 실제 변형 적용 =====
async function applyAndVerify() {
  console.log("\n=== 4단계: 변형 적용 ===\n");

  const svg = loadSVG();

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 500));

  // 정밀 분석: 그룹별 하위 그룹까지 탐색
  const detailData = await page.evaluate(() => {
    const svgEl = document.querySelector("svg");
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb.width / svgEl.clientWidth;
    const scaleY = vb.height / svgEl.clientHeight;

    function getInfo(el, i) {
      const rect = el.getBoundingClientRect();
      const pixelArea = rect.width * rect.height;
      const cx = (rect.left + rect.width / 2) * scaleX;
      const cy = (rect.top + rect.height / 2) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;

      // SVG 문서 내 위치 파악 (부모 체인)
      const parentChain = [];
      let p = el.parentElement;
      while (p && p !== svgEl) {
        parentChain.push(p.tagName + (p.id ? `#${p.id}` : ""));
        p = p.parentElement;
      }

      return {
        index: i,
        tag: el.tagName,
        fill: el.getAttribute("fill") || "",
        stroke: el.getAttribute("stroke") || "",
        cx: Math.round(cx),
        cy: Math.round(cy),
        w: Math.round(w),
        h: Math.round(h),
        pixelArea: Math.round(pixelArea),
        parentChain: parentChain.slice(0, 4).join(" > "),
        outerHTML: el.outerHTML.substring(0, 200)
      };
    }

    // Cloud 그룹의 모든 shape
    const cloudGroup = svgEl.querySelector("g#Cloud");
    const cloudShapes = [];
    if (cloudGroup) {
      cloudGroup.querySelectorAll("path, circle, rect, ellipse").forEach((el, i) => {
        try {
          const info = getInfo(el, i);
          if (info.pixelArea > 50) cloudShapes.push(info);
        } catch(e) {}
      });
    }

    // Plants 그룹의 모든 shape
    const plantsGroup = svgEl.querySelector("g#Plants");
    const plantShapes = [];
    if (plantsGroup) {
      plantsGroup.querySelectorAll("path, circle, rect, ellipse").forEach((el, i) => {
        try {
          const info = getInfo(el, i);
          if (info.pixelArea > 100) plantShapes.push(info);
        } catch(e) {}
      });
    }

    // Floor 그룹의 모든 shape
    const floorGroup = svgEl.querySelector("g#Floor");
    const floorShapes = [];
    if (floorGroup) {
      floorGroup.querySelectorAll("path, circle, rect, ellipse").forEach((el, i) => {
        try {
          const info = getInfo(el, i);
          if (info.pixelArea > 100) floorShapes.push(info);
        } catch(e) {}
      });
    }

    // Characters 그룹의 서브그룹들
    const charsGroup = svgEl.querySelector("g#Characters");
    const charSubGroups = [];
    if (charsGroup) {
      charsGroup.querySelectorAll("g").forEach((g, i) => {
        try {
          const rect = g.getBoundingClientRect();
          if (rect.width > 0) {
            charSubGroups.push({
              index: i,
              id: g.id,
              cx: Math.round((rect.left + rect.width/2) * scaleX),
              cy: Math.round((rect.top + rect.height/2) * scaleY),
              w: Math.round(rect.width * scaleX),
              h: Math.round(rect.height * scaleY),
              area: Math.round(rect.width * rect.height),
              childCount: g.querySelectorAll("*").length
            });
          }
        } catch(e) {}
      });

      // Characters 직속 path/shape들도 수집
      charsGroup.querySelectorAll(":scope > path, :scope > circle, :scope > rect, :scope > ellipse, :scope > g > path, :scope > g > circle, :scope > g > rect").forEach((el, i) => {
        try {
          const rect = el.getBoundingClientRect();
          const pixelArea = rect.width * rect.height;
          if (pixelArea > 100 && pixelArea < 5000) {
            const cx = (rect.left + rect.width / 2) * scaleX;
            const cy = (rect.top + rect.height / 2) * scaleY;
            const w = rect.width * scaleX;
            const h = rect.height * scaleY;
            charSubGroups.push({
              isShape: true,
              index: i,
              tag: el.tagName,
              fill: el.getAttribute("fill") || "",
              cx: Math.round(cx),
              cy: Math.round(cy),
              w: Math.round(w),
              h: Math.round(h),
              pixelArea: Math.round(pixelArea),
              parentId: el.parentElement?.id || "",
              outerHTML: el.outerHTML.substring(0, 150)
            });
          }
        } catch(e) {}
      });
    }

    return { cloudShapes, plantShapes, floorShapes, charSubGroups };
  });

  console.log(`Cloud shapes: ${detailData.cloudShapes.length}`);
  detailData.cloudShapes.forEach(s => {
    console.log(`  #${s.index} cx=${s.cx} cy=${s.cy} w=${s.w} h=${s.h} area=${s.pixelArea} fill="${s.fill}" chain="${s.parentChain}"`);
  });

  console.log(`\nPlants shapes: ${detailData.plantShapes.length}`);
  detailData.plantShapes.slice(0, 30).forEach(s => {
    console.log(`  #${s.index} cx=${s.cx} cy=${s.cy} w=${s.w} h=${s.h} area=${s.pixelArea} fill="${s.fill}" chain="${s.parentChain}"`);
  });

  console.log(`\nFloor shapes: ${detailData.floorShapes.length}`);
  detailData.floorShapes.slice(0, 20).forEach(s => {
    console.log(`  #${s.index} cx=${s.cx} cy=${s.cy} w=${s.w} h=${s.h} area=${s.pixelArea} fill="${s.fill}" chain="${s.parentChain}"`);
  });

  console.log(`\nCharacters sub-groups: ${detailData.charSubGroups.length}`);
  detailData.charSubGroups.slice(0, 40).forEach(s => {
    if (s.isShape) {
      console.log(`  [SHAPE] #${s.index} <${s.tag}> cx=${s.cx} cy=${s.cy} w=${s.w} h=${s.h} area=${s.pixelArea} parent="${s.parentId}"`);
    } else {
      console.log(`  [GROUP] #${s.index} id="${s.id}" cx=${s.cx} cy=${s.cy} w=${s.w} h=${s.h} area=${s.area} children=${s.childCount}`);
    }
  });

  await browser.close();

  return detailData;
}

// ===== 5단계: outerHTML 기반으로 SVG 변형 =====
async function buildModifiedSVG() {
  console.log("\n=== 5단계: Modified SVG 빌드 ===\n");

  const svg = loadSVG();

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 500));

  // 각 그룹의 전체 outerHTML 수집
  const groupHTMLs = await page.evaluate(() => {
    const svgEl = document.querySelector("svg");

    const cloudGroup = svgEl.querySelector("g#Cloud");
    const plantsGroup = svgEl.querySelector("g#Plants");
    const floorGroup = svgEl.querySelector("g#Floor");
    const charsGroup = svgEl.querySelector("g#Characters");
    const bgGroup = svgEl.querySelector("g#background-simple");

    // Plants 내 서브그룹들
    const plantSubGroups = [];
    if (plantsGroup) {
      Array.from(plantsGroup.children).forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        plantSubGroups.push({
          index: i,
          tag: el.tagName,
          id: el.id || "",
          area: Math.round(rect.width * rect.height),
          html: el.outerHTML.substring(0, 300)
        });
      });
    }

    // Cloud 내 서브그룹들
    const cloudSubGroups = [];
    if (cloudGroup) {
      Array.from(cloudGroup.children).forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        cloudSubGroups.push({
          index: i,
          tag: el.tagName,
          id: el.id || "",
          area: Math.round(rect.width * rect.height),
          html: el.outerHTML.substring(0, 300)
        });
      });
    }

    // Characters 내 서브그룹들 (직속 자식)
    const charChildren = [];
    if (charsGroup) {
      Array.from(charsGroup.children).forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        charChildren.push({
          index: i,
          tag: el.tagName,
          id: el.id || "",
          area: Math.round(rect.width * rect.height),
          cx: Math.round((rect.left + rect.width/2) * 500 / document.querySelector("svg").clientWidth),
          cy: Math.round((rect.top + rect.height/2) * 500 / document.querySelector("svg").clientHeight),
          html: el.outerHTML.substring(0, 300)
        });
      });
    }

    return {
      cloudOuterHTML: cloudGroup?.outerHTML?.substring(0, 500),
      plantsOuterHTML: plantsGroup?.outerHTML?.substring(0, 500),
      plantSubGroups,
      cloudSubGroups,
      charChildren
    };
  });

  console.log("Cloud 직속 자식들:");
  groupHTMLs.cloudSubGroups.forEach(s => {
    console.log(`  #${s.index} <${s.tag}> id="${s.id}" area=${s.area}`);
    console.log(`    html: ${s.html}`);
  });

  console.log("\nPlants 직속 자식들:");
  groupHTMLs.plantSubGroups.forEach(s => {
    console.log(`  #${s.index} <${s.tag}> id="${s.id}" area=${s.area}`);
    console.log(`    html: ${s.html}`);
  });

  console.log("\nCharacters 직속 자식들:");
  groupHTMLs.charChildren.forEach(s => {
    console.log(`  #${s.index} <${s.tag}> id="${s.id}" area=${s.area} cx=${s.cx} cy=${s.cy}`);
    if (s.html) console.log(`    html: ${s.html}`);
  });

  await browser.close();

  return groupHTMLs;
}

// ===== 메인 =====
async function main() {
  console.log("=== dogwalk 레벨 재설계 ===\n");

  // 1단계: 분석
  const analysisData = await analyzeElements();

  // 2~3단계: 후보 수집
  const candidates = await createModifiedSVG(analysisData);

  // 4단계: 상세 분석
  const detailData = await applyAndVerify();

  // 5단계: 그룹 HTML 분석
  const groupHTMLs = await buildModifiedSVG();

  console.log("\n=== 분석 완료 ===");
  console.log("다음 단계: 분석 결과를 바탕으로 변형 설계 및 적용");
}

main().catch(console.error);
