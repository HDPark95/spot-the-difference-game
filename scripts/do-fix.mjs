/**
 * FAIL 항목 실제 수정 스크립트
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";

function readSvg(filename) {
  return fs.readFileSync(path.join(PROJECT, "public/scenes", filename), "utf-8");
}
function writeSvg(filename, content) {
  fs.writeFileSync(path.join(PROJECT, "public/scenes", filename), content, "utf-8");
  console.log(`  저장: ${filename}`);
}

// 특정 패턴을 display:none으로 변경
function hideByStyle(svg, stylePattern, description) {
  const idx = svg.indexOf(stylePattern);
  if (idx < 0) {
    console.log(`  [미발견] ${description}: "${stylePattern}"`);
    return { svg, success: false };
  }
  // 해당 요소의 <element ... 시작 찾기
  let start = idx;
  while (start > 0 && svg[start] !== '<') start--;
  // > 찾기
  const end = svg.indexOf('>', idx);

  const originalTag = svg.slice(start, end + 1);
  let newTag;
  if (originalTag.includes('style="')) {
    newTag = originalTag.replace('style="', 'style="display:none;');
  } else {
    newTag = originalTag.slice(0, -1) + ' style="display:none">';
  }

  console.log(`  숨김: ${description}`);
  return { svg: svg.slice(0, start) + newTag + svg.slice(end + 1), success: true };
}

// 두 SVG 비교 - 특정 영역의 픽셀 변화율 계산
async function measureDiffRatio(browser, origSvgPath, modSvgPath, cx, cy, r) {
  async function render(svgContent) {
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

  const origBuf = await render(fs.readFileSync(origSvgPath, "utf-8"));
  const modBuf = await render(fs.readFileSync(modSvgPath, "utf-8"));

  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  let changedInArea = 0, totalInArea = 0;
  const pr = r;
  const px = cx, py = cy;

  for (let y = Math.max(0, py - pr); y < Math.min(h, py + pr); y++) {
    for (let x = Math.max(0, px - pr); x < Math.min(w, px + pr); x++) {
      if (Math.hypot(x - px, y - py) <= pr) {
        totalInArea++;
        const idx2 = (y * w + x) * ch;
        const dr = Math.abs(origData[idx2] - modData[idx2]);
        const dg = Math.abs(origData[idx2+1] - modData[idx2+1]);
        const db = Math.abs(origData[idx2+2] - modData[idx2+2]);
        if (dr + dg + db > 30) changedInArea++;
      }
    }
  }

  return { ratio: totalInArea > 0 ? changedInArea / totalInArea : 0, changedInArea, totalInArea };
}

async function main() {
  console.log("=== FAIL 항목 수정 ===\n");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  // ============================================================
  // 카페 수정
  // ============================================================
  console.log("--- 카페 ---");

  // 기존 변형 SVG를 베이스로 사용 (성공한 변경 #1, #3, #4 유지)
  let cafeMod = readSvg("cafe-modified.svg");
  const cafeOrig = readSvg("cafe.svg");

  // #2 확인: 실제 변경된 병 위치 (379, 120)
  // 현재 변형에 display:none이 적용된 요소가 있는지 확인
  const dispNoneMatch = cafeMod.match(/display: none/g);
  console.log(`  현재 display:none 개수: ${dispNoneMatch ? dispNoneMatch.length : 0}`);

  // 어떤 요소에 display:none이 적용됐는지 찾기
  let pos = 0;
  while (true) {
    const idx = cafeMod.indexOf('display: none', pos);
    if (idx < 0) break;
    let start = idx;
    while (start > 0 && cafeMod[start] !== '<') start--;
    const end = cafeMod.indexOf('>', idx);
    console.log(`  display:none 태그: ${cafeMod.slice(start, end+1).slice(0, 150)}`);
    pos = idx + 1;
  }

  // #5 카운터 문 장식: Counter에서 흰색 장식 path 두 개 제거
  // style="fill:#fff;opacity:0.9" 패턴이 Counter 내부에 있는 두 path
  // cx:146 cy:339와 cx:231 cy:339
  // 이 path들의 실제 content는:
  // <path d="M178.58,403.36h-64.2..." style="fill:#fff;opacity:0.9">
  // <path d="M262.84,403.36H198.65..." style="fill:#fff;opacity:0.9">

  // 카운터 내부 흰색 장식 path를 숨기기
  const whiteDecorPattern1 = `M178.58,403.36h-64.2`;
  const whiteDecorPattern2 = `M262.84,403.36H198.65`;

  const idx1 = cafeMod.indexOf(whiteDecorPattern1);
  const idx2 = cafeMod.indexOf(whiteDecorPattern2);
  console.log(`  흰색 장식 path1 위치: ${idx1}`);
  console.log(`  흰색 장식 path2 위치: ${idx2}`);

  if (idx1 >= 0) {
    let start1 = idx1;
    while (start1 > 0 && cafeMod[start1] !== '<') start1--;
    const end1 = cafeMod.indexOf('</path>', idx1) + 7;
    const path1Content = cafeMod.slice(start1, end1);
    console.log(`  path1 (${path1Content.length}자): ${path1Content.slice(0, 100)}...`);
  }

  // 카운터 문 장식 제거: 두 흰색 장식 path를 display:none으로
  if (idx1 >= 0) {
    let start1 = idx1;
    while (start1 > 0 && cafeMod[start1] !== '<') start1--;
    const tagEnd1 = cafeMod.indexOf('>', start1);
    const origTag1 = cafeMod.slice(start1, tagEnd1 + 1);
    let newTag1 = origTag1.replace('style="', 'style="display:none;');
    cafeMod = cafeMod.slice(0, start1) + newTag1 + cafeMod.slice(tagEnd1 + 1);
    console.log("  카운터 장식 path1 숨김 완료");
  }

  if (idx2 >= 0) {
    // cafeMod가 변경됐으므로 다시 찾기
    const idx2b = cafeMod.indexOf(whiteDecorPattern2);
    let start2 = idx2b;
    while (start2 > 0 && cafeMod[start2] !== '<') start2--;
    const tagEnd2 = cafeMod.indexOf('>', start2);
    const origTag2 = cafeMod.slice(start2, tagEnd2 + 1);
    let newTag2 = origTag2.replace('style="', 'style="display:none;');
    cafeMod = cafeMod.slice(0, start2) + newTag2 + cafeMod.slice(tagEnd2 + 1);
    console.log("  카운터 장식 path2 숨김 완료");
  }

  // 저장 후 #5 검증
  writeSvg("cafe-modified.svg", cafeMod);

  const cafeOrigPath = path.join(PROJECT, "public/scenes/cafe.svg");
  const cafeModPath = path.join(PROJECT, "public/scenes/cafe-modified.svg");

  const r5 = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 146, 370, 22);
  console.log(`  #5 카운터 장식 검증 (cx:146,cy:370): ${(r5.ratio*100).toFixed(1)}% (${r5.changedInArea}/${r5.totalInArea})`);

  const r5b = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 166, 370, 30);
  console.log(`  #5 카운터 장식 검증 (cx:166,cy:370,r:30): ${(r5b.ratio*100).toFixed(1)}% (${r5b.changedInArea}/${r5b.totalInArea})`);

  // 흰색 장식이 카운터 전체를 차지하고 있어 어느 좌표가 좋은지 파악
  const r5c = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 146, 340, 22);
  console.log(`  #5 카운터 장식 검증 (cx:146,cy:340,r:22): ${(r5c.ratio*100).toFixed(1)}%`);

  const r5d = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 231, 340, 22);
  console.log(`  #5 카운터 장식 검증 (cx:231,cy:340,r:22): ${(r5d.ratio*100).toFixed(1)}%`);

  // #2 병 검증 - 현재 히트좌표 (400, 116) vs 실제 변경 (379, 120)
  const r2a = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 400, 116, 22);
  console.log(`  #2 병 검증 (cx:400,cy:116,r:22): ${(r2a.ratio*100).toFixed(1)}%`);

  const r2b = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 379, 120, 22);
  console.log(`  #2 병 검증 (cx:379,cy:120,r:22): ${(r2b.ratio*100).toFixed(1)}%`);

  const r2c = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 375, 116, 25);
  console.log(`  #2 병 검증 (cx:375,cy:116,r:25): ${(r2c.ratio*100).toFixed(1)}%`);

  // ============================================================
  // 거실 수정 - #4 인물 상의
  // ============================================================
  console.log("\n--- 거실 ---");

  let livingMod = readSvg("livingroom.svg"); // 원본에서 시작
  const livingOrig = readSvg("livingroom.svg");

  // 기존 변형에서 성공한 변경들을 적용:
  // #1: 선반 상단 받침대 제거 (cx:111 cy:196 r:22)
  // #2: 선반 중단 받침대 제거 (cx:99 cy:275 r:22)
  // #3: 화분 이동 (cx:398 cy:339 r:28)
  // #5: 책 추가 (cx:86 cy:192 r:22)
  // 기존 변형 SVG 확인
  const livingModExisting = readSvg("livingroom-modified.svg");

  // 기존 변형과 원본의 차이 분석
  console.log("  기존 변형 분석:");

  // Shelf 비교
  const shelfOrigIdx = livingOrig.indexOf('id="Shelf"');
  const shelfModIdx = livingModExisting.indexOf('id="Shelf"');
  if (shelfOrigIdx >= 0 && shelfModIdx >= 0) {
    const shelfOrig = livingOrig.slice(shelfOrigIdx, shelfOrigIdx + 3000);
    const shelfMod = livingModExisting.slice(shelfModIdx, shelfModIdx + 3000);
    if (shelfOrig !== shelfMod) {
      console.log("  Shelf 요소 변경됨");
      for (let i = 0; i < Math.min(shelfOrig.length, shelfMod.length); i++) {
        if (shelfOrig[i] !== shelfMod[i]) {
          console.log(`    원본: ...${shelfOrig.slice(Math.max(0,i-30), i+100)}...`);
          console.log(`    변형: ...${shelfMod.slice(Math.max(0,i-30), i+100)}...`);
          break;
        }
      }
    }
  }

  // Plant 비교
  const plantOrigIdx = livingOrig.indexOf('id="Plant"');
  const plantModIdx = livingModExisting.indexOf('id="Plant"');
  if (plantOrigIdx >= 0 && plantModIdx >= 0) {
    const plantOrig = livingOrig.slice(plantOrigIdx, plantOrigIdx + 100);
    const plantMod = livingModExisting.slice(plantModIdx, plantModIdx + 100);
    console.log(`  Plant 원본: ${plantOrig}`);
    console.log(`  Plant 변형: ${plantMod}`);
  }

  // 기존 변형 SVG를 베이스로 #4만 새로 수정
  livingMod = livingModExisting;

  // #4 수정: 인물 상의 색 변경이 안 됨 → 소파 쿠션(cx:301 cy:318)을 제거
  // 소파 쿠션은 fill:#407BFF인 path. 거실의 Character 그룹 내 cx:301 cy:318 요소
  // 분석에서 path cx:309 cy:326 (40x23)이 상의로 보임
  // 소파 내 쿠션 path: cx:301 cy:318 fill:#407BFF (25x17 크기)

  // Character 내부에서 cx:309 cy:326에 해당하는 요소를 숨기기
  // SVG 좌표로는: cx=309/500*viewBox.w
  // viewBox 확인
  const livingVbMatch = livingOrig.match(/viewBox="([^"]*)"/);
  const livingVb = livingVbMatch ? livingVbMatch[1].split(/\s+/).map(Number) : [0, 0, 500, 500];
  console.log(`  거실 viewBox: ${livingVb}`);

  // 인물 상의는 Character 그룹 내 요소
  // 변형에서 fill:#E67E22로 변경됐지만 작동 안 함
  // 대신: Lamps(조명) 그룹을 숨기거나, 소파 위 쿠션 요소를 제거

  // Lamps 그룹을 숨기기 (cx:239 cy:135 크기:70x158)
  // → 히트좌표는 (239, 135) 정도
  // 하지만 기존 #1, #5와 겹칠 수 있음

  // 더 좋은 방법: 소파의 흰색 장식을 제거
  // Character 그룹에서 isolation:isolate 관련 요소
  // path cx:245 cy:350 fill:#fff opacity:0.6 → 소파 반사광

  // 가장 확실한: Lamps 그룹 자체를 숨기기
  // Lamps: cx:239 cy:135 size:70x158 → 히트좌표 (239, 135)

  // 그러나 더 간단한 방법: 소파 쿠션 (cx:285 cy:359 56x26) 제거
  // Character 그룹 내 소파 관련 path를 숨기기

  // Character 그룹에서 쿠션 관련 요소들 찾기
  // path cx:309 cy:326 (40x23) - 이게 상의
  // 실제 SVG 좌표를 찾아야 함

  // 거실의 경우 픽셀 좌표 = SVG 좌표 (viewBox 500x500이면 1:1)
  // cx:309 cy:326 → SVG에서 이 좌표의 path를 찾기

  // Character 그룹 전체 추출
  const charIdx = livingMod.indexOf('id="Character"');
  if (charIdx >= 0) {
    let charStart = charIdx;
    while (charStart > 0 && livingMod[charStart] !== '<') charStart--;

    // Character 그룹에서 fill:#E67E22 찾기
    const e67Idx = livingMod.indexOf('#E67E22', charStart);
    if (e67Idx >= 0) {
      console.log(`  fill:#E67E22 위치: ${e67Idx}`);
      let s = e67Idx;
      while (s > 0 && livingMod[s] !== '<') s--;
      const t = livingMod.indexOf('>', s);
      console.log(`  E67E22 태그: ${livingMod.slice(s, t+1).slice(0, 200)}`);
    } else {
      console.log("  fill:#E67E22 NOT FOUND in livingMod");
    }
  }

  // 거실 #4 수정 방법:
  // 인물 상의(cx:309 cy:326)를 덮고 있는 요소를 변경
  // Character 그룹에서 fill:#407BFF(파란색)인 path가 상의
  // 이것을 display:none으로 숨기면 뒤에 있는 다른 색이 보임

  // path cx:301 cy:318 fill:#407BFF size:25x17 를 숨기면 #4 히트포인트에서 변화 감지됨
  // 이 path의 style: fill:#407BFF
  // 하지만 여러 개가 있을 수 있으므로 정확한 d 속성을 찾아야 함

  // 가장 안전한 방법: Lamps 전체를 숨기기 (cx:239 cy:135, 조명이 없어지는 것)
  // 히트좌표를 (239, 135)로 변경

  // 또는 더 나은 방법: 소파 위 파란 쿠션을 다른 색으로 변경
  // Character 그룹 내 fill:#407BFF path들

  // 방법 결정: Lamps 그룹을 숨기고 히트좌표를 (239, 135)로 변경
  // Lamps는 cx:239 cy:135 size:70x158로 충분히 큰 영역

  const lampsIdx = livingMod.indexOf('id="Lamps"');
  if (lampsIdx >= 0) {
    let lampsStart = lampsIdx;
    while (lampsStart > 0 && livingMod[lampsStart] !== '<') lampsStart--;
    const lampsTagEnd = livingMod.indexOf('>', lampsStart);
    const origLampsTag = livingMod.slice(lampsStart, lampsTagEnd + 1);
    let newLampsTag = origLampsTag.replace('>', ' style="display:none">');
    livingMod = livingMod.slice(0, lampsStart) + newLampsTag + livingMod.slice(lampsTagEnd + 1);
    console.log("  Lamps 그룹 숨김 완료");
  }

  writeSvg("livingroom-modified.svg", livingMod);

  const livingOrigPath = path.join(PROJECT, "public/scenes/livingroom.svg");
  const livingModPath = path.join(PROJECT, "public/scenes/livingroom-modified.svg");

  const lamps4 = await measureDiffRatio(browser, livingOrigPath, livingModPath, 239, 135, 35);
  console.log(`  조명 검증 (cx:239,cy:135,r:35): ${(lamps4.ratio*100).toFixed(1)}%`);

  const lamps4b = await measureDiffRatio(browser, livingOrigPath, livingModPath, 239, 135, 22);
  console.log(`  조명 검증 (cx:239,cy:135,r:22): ${(lamps4b.ratio*100).toFixed(1)}%`);

  // 기존 성공 항목들 검증
  const liv1 = await measureDiffRatio(browser, livingOrigPath, livingModPath, 111, 196, 22);
  console.log(`  #1 선반상단 (cx:111,cy:196): ${(liv1.ratio*100).toFixed(1)}%`);
  const liv2 = await measureDiffRatio(browser, livingOrigPath, livingModPath, 99, 275, 22);
  console.log(`  #2 선반중단 (cx:99,cy:275): ${(liv2.ratio*100).toFixed(1)}%`);
  const liv3 = await measureDiffRatio(browser, livingOrigPath, livingModPath, 398, 339, 28);
  console.log(`  #3 화분 (cx:398,cy:339): ${(liv3.ratio*100).toFixed(1)}%`);
  const liv5 = await measureDiffRatio(browser, livingOrigPath, livingModPath, 86, 192, 22);
  console.log(`  #5 책 (cx:86,cy:192): ${(liv5.ratio*100).toFixed(1)}%`);

  // ============================================================
  // 공원 수정 - #5 나뭇잎 색
  // ============================================================
  console.log("\n--- 공원 ---");

  const parkOrig = readSvg("park.svg");
  const parkModExisting = readSvg("park-modified.svg");
  let parkMod = parkModExisting;

  // Tree 그룹을 분석
  const treeOrigIdx = parkOrig.indexOf('id="Tree"');
  if (treeOrigIdx >= 0) {
    let treeStart = treeOrigIdx;
    while (treeStart > 0 && parkOrig[treeStart] !== '<') treeStart--;
    const treeSection = parkOrig.slice(treeStart, treeStart + 5000);
    console.log("  Tree 원본 (처음 2000자):");
    console.log("  " + treeSection.slice(0, 2000));
  }

  await browser.close();
  console.log("\n분석 완료.");
}

main().catch(console.error);
