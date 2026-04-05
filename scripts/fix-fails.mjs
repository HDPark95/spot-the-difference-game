/**
 * FAIL된 차이점 수정 스크립트
 *
 * 수정 대상:
 * - 카페 #2: 선반 위 병 히트좌표 수정 (실제 병 위치 cx:377, cy:113)
 * - 카페 #5: 카운터 문 장식 제거 → 카운터의 흰색 장식 path 제거
 * - 거실 #4: 인물 상의 색 변경 → 소파 쿠션 제거로 대체
 * - 공원 #5: 나뭇잎 색 변경 → 구름 제거 또는 나무 요소 제거로 대체
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";

// ===== 유틸리티 =====
function readSvg(filename) {
  return fs.readFileSync(path.join(PROJECT, "public/scenes", filename), "utf-8");
}

function writeSvg(filename, content) {
  fs.writeFileSync(path.join(PROJECT, "public/scenes", filename), content, "utf-8");
  console.log(`  저장: ${filename}`);
}

// SVG에서 특정 요소 제거 (id 기반)
function removeElementById(svg, id) {
  // <g id="...">...</g> 패턴 제거 (중첩 고려)
  const startTag = `id="${id}"`;
  const idx = svg.indexOf(startTag);
  if (idx < 0) {
    console.log(`  [경고] id="${id}" 요소를 찾지 못했습니다`);
    return svg;
  }

  // <g ... id="..." 의 시작 찾기
  let gStart = idx;
  while (gStart > 0 && svg[gStart] !== '<') gStart--;

  // 매칭되는 닫는 태그 찾기 (중첩 카운트)
  const tagName = svg.slice(gStart + 1, gStart + 2) === 'g' ? 'g' :
                  svg.slice(gStart + 1).match(/^(\w+)/)?.[1] || 'g';

  let depth = 0;
  let pos = gStart;
  while (pos < svg.length) {
    const nextOpen = svg.indexOf(`<${tagName}`, pos);
    const nextClose = svg.indexOf(`</${tagName}>`, pos);

    if (nextClose < 0) break;

    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 1;
    } else {
      depth--;
      if (depth === 0) {
        const removed = svg.slice(gStart, nextClose + `</${tagName}>`.length);
        console.log(`  제거: ${removed.slice(0, 100)}...`);
        return svg.slice(0, gStart) + svg.slice(nextClose + `</${tagName}>`.length);
      }
      pos = nextClose + 1;
    }
  }

  console.log(`  [경고] 닫는 태그를 찾지 못했습니다: id="${id}"`);
  return svg;
}

// SVG에서 특정 텍스트 패턴 제거
function removePattern(svg, pattern, description) {
  const idx = svg.indexOf(pattern);
  if (idx < 0) {
    console.log(`  [경고] 패턴을 찾지 못했습니다: ${description}`);
    return { svg, success: false };
  }
  const newSvg = svg.slice(0, idx) + svg.slice(idx + pattern.length);
  console.log(`  제거 성공: ${description}`);
  return { svg: newSvg, success: true };
}

// 요소를 display:none으로 숨기기 (id 기반)
function hideElementById(svg, id, newId) {
  const startTag = `id="${id}"`;
  const idx = svg.indexOf(startTag);
  if (idx < 0) {
    console.log(`  [경고] id="${id}" 요소를 찾지 못했습니다`);
    return svg;
  }
  // id 앞의 <g 태그 찾기
  let gStart = idx;
  while (gStart > 0 && svg[gStart] !== '<') gStart--;
  // > 찾기 (첫 태그 닫기)
  const gTagEnd = svg.indexOf('>', gStart);
  const originalTag = svg.slice(gStart, gTagEnd + 1);

  // display:none 추가
  let newTag;
  if (originalTag.includes('style="')) {
    newTag = originalTag.replace('style="', 'style="display:none;');
  } else {
    newTag = originalTag.replace('>', ' style="display:none">');
  }
  if (newId) {
    newTag = newTag.replace(`id="${id}"`, `id="${newId}"`);
  }

  return svg.slice(0, gStart) + newTag + svg.slice(gTagEnd + 1);
}

// 요소를 transform으로 이동
function moveElementById(svg, id, dx, dy) {
  const startTag = `id="${id}"`;
  const idx = svg.indexOf(startTag);
  if (idx < 0) {
    console.log(`  [경고] id="${id}" 요소를 찾지 못했습니다`);
    return svg;
  }
  let gStart = idx;
  while (gStart > 0 && svg[gStart] !== '<') gStart--;
  const gTagEnd = svg.indexOf('>', gStart);
  const originalTag = svg.slice(gStart, gTagEnd + 1);

  let newTag;
  if (originalTag.includes('transform=')) {
    // 기존 transform에 translate 추가
    newTag = originalTag.replace(/transform="([^"]*)"/, `transform="translate(${dx},${dy}) $1"`);
  } else {
    newTag = originalTag.replace('>', ` transform="translate(${dx},${dy})">`);
  }

  return svg.slice(0, gStart) + newTag + svg.slice(gTagEnd + 1);
}

async function verifyDiff(browser, origSvgPath, modSvgPath, diff, svgViewBox) {
  const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");

  async function render(svgContent) {
    const page = await browser.newPage();
    await page.setViewport({ width: 500, height: 500, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;width:500px;height:500px">${svgContent}</body></html>`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const bs = document.querySelector("#background-simple");
      if (bs) bs.style.display = "none";
    });
    await new Promise(r => setTimeout(r, 300));
    const buf = await page.screenshot({ type: "png" });
    await page.close();
    return buf;
  }

  const origBuf = await render(fs.readFileSync(origSvgPath, "utf-8"));
  const modBuf = await render(fs.readFileSync(modSvgPath, "utf-8"));

  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  const diffMap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx2 = (y * w + x) * ch;
      const dr = Math.abs(origData[idx2] - modData[idx2]);
      const dg = Math.abs(origData[idx2+1] - modData[idx2+1]);
      const db = Math.abs(origData[idx2+2] - modData[idx2+2]);
      if (dr + dg + db > 30) diffMap[y * w + x] = 1;
    }
  }

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

  const ratio = totalInArea > 0 ? changedInArea / totalInArea : 0;
  return { ratio, changedInArea, totalInArea };
}

async function main() {
  console.log("=== FAIL 항목 수정 시작 ===\n");

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  // ===================================
  // 카페 SVG 수정
  // ===================================
  console.log("--- 카페 수정 ---");
  const cafeOrig = readSvg("cafe.svg");
  let cafeMod = cafeOrig;

  // viewBox 파싱
  const vbMatch = cafeOrig.match(/viewBox="([^"]*)"/);
  const vb = vbMatch ? vbMatch[1].split(/\s+/).map(Number) : [0, 0, 500, 500];
  const cafeViewBox = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  console.log("카페 viewBox:", cafeViewBox);

  // #1: 메뉴판 커피잔 아이콘 제거 (이미 성공 - 재적용)
  // 메뉴판 내 coffee cup 요소를 찾아서 제거
  // 분석에서 메뉴판은 cx:89, cy:123에 있음
  // menu-board 내부에서 커피잔 path 찾기
  {
    const menuBoardIdx = cafeMod.indexOf('id="menu-board"');
    if (menuBoardIdx >= 0) {
      // menu-board 그룹 끝 찾기
      let start = menuBoardIdx;
      while (start > 0 && cafeMod[start] !== '<') start--;

      // 그룹 내에서 커피잔처럼 보이는 복잡한 path 요소들 확인
      // 현재 변형 SVG에서 무엇이 없어졌는지 비교
    }
  }

  // 기존 변형 SVG에서 성공한 변경들을 가져와 재적용
  const cafeModExisting = readSvg("cafe-modified.svg");

  // 기존 변형에서 적용된 변경 확인
  // 1. coffee-machine 좌우반전 (transform)
  // 2. character-2 핸드백 제거
  // 3. menu-board 커피잔 아이콘 제거

  // 기존 변형 SVG를 베이스로 시작하되, #2와 #5만 수정
  cafeMod = cafeModExisting;

  // #2 수정: 히트 좌표를 실제 병 위치로 변경
  // 분석 결과: 원본에서 cx:377 cy:113 크기 20x29인 병이 있음
  // 변형에서 이 병이 제거됐는지 확인 필요
  // 원본과 변형의 병 관련 요소 비교
  // 원본: path cx:377 cy:113, path cx:377 cy:98, rect cx:377 cy:110, 추가 경로들
  // 변형: 이 요소들이 없어야 하는데...

  // 변형 SVG에서 병 관련 요소(x=367 이상, y=95~130 범위) 확인
  const bottlePattern1 = `M384.8,100.54v-2H369.88v2`;
  const bottleInOrig = cafeOrig.indexOf(bottlePattern1) >= 0;
  const bottleInMod = cafeModExisting.indexOf(bottlePattern1) >= 0;
  console.log(`  병 패턴1 원본: ${bottleInOrig}, 변형: ${bottleInMod}`);

  // 실제 변형 SVG에서 병이 제거됐는지 확인
  // background-complete에서 병(cy~113 영역) 관련 path들이 원본과 다른지 비교

  // 카페 #2 접근법:
  // 선반 위 병(cx:377 cy:113 영역)이 변형에서 실제로 제거됐는지 먼저 확인
  // 원본과 변형의 background-complete 내용을 비교

  const origBgIdx = cafeOrig.indexOf('id="background-complete"');
  const modBgIdx = cafeModExisting.indexOf('id="background-complete"');

  if (origBgIdx >= 0 && modBgIdx >= 0) {
    const origBg = cafeOrig.slice(origBgIdx, origBgIdx + 8000);
    const modBg = cafeModExisting.slice(modBgIdx, modBgIdx + 8000);

    if (origBg === modBg) {
      console.log("  [정보] background-complete가 원본과 동일 (병 제거 안 됨)");
    } else {
      console.log("  [정보] background-complete가 원본과 다름 (병 관련 변경 있음)");
      // 어디가 다른지 찾기
      for (let i = 0; i < Math.min(origBg.length, modBg.length); i++) {
        if (origBg[i] !== modBg[i]) {
          console.log(`  차이 위치: ${i}`);
          console.log(`  원본: ...${origBg.slice(Math.max(0,i-50), i+100)}...`);
          console.log(`  변형: ...${modBg.slice(Math.max(0,i-50), i+100)}...`);
          break;
        }
      }
    }
  }

  // Counter 비교
  const origCounterIdx = cafeOrig.indexOf('id="Counter"');
  const modCounterIdx = cafeModExisting.indexOf('id="Counter"');
  if (origCounterIdx >= 0 && modCounterIdx >= 0) {
    const origCounter = cafeOrig.slice(origCounterIdx, origCounterIdx + 2000);
    const modCounter = cafeModExisting.slice(modCounterIdx, modCounterIdx + 2000);
    if (origCounter === modCounter) {
      console.log("  [정보] Counter가 원본과 동일 (카운터 문 장식 변경 안 됨)");
    } else {
      console.log("  [정보] Counter가 원본과 다름");
    }
  }

  await browser.close();
  console.log("\n분석 완료. 수동 수정 필요.");
}

main().catch(console.error);
