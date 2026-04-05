/**
 * 레벨 3(park), 4(dogwalk), 5(coffee) 전면 개편 스크립트
 *
 * 각 레벨 차이점 5개:
 * - 소요소 제거 1~2개
 * - 소요소 추가 1~2개 (컴포넌트 SVG)
 * - 위치이동 or 크기변경 1개
 * - 색변경 최대 1개
 */

import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCENES_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/public/scenes";
const QA_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/qa-screenshots";
const COMP_DIR = "/Users/hyundoopark/workspace/html-to-image-plugin/components";

if (!fs.existsSync(QA_DIR)) fs.mkdirSync(QA_DIR, { recursive: true });

// 컴포넌트 SVG를 읽어서 내부 콘텐츠와 viewBox 크기 반환
function readComponent(relPath) {
  const fullPath = path.join(COMP_DIR, relPath);
  const svgText = fs.readFileSync(fullPath, "utf-8");
  const inner = svgText.replace(/<\/?svg[^>]*>/g, "");
  const vbMatch = svgText.match(/viewBox="([^"]*)"/);
  let compW = 100, compH = 100;
  if (vbMatch) {
    const parts = vbMatch[1].split(/[\s,]+/).map(Number);
    compW = parts[2];
    compH = parts[3];
  }
  return { inner, compW, compH };
}

// SVG 파일을 읽어 data URL 생성
function svgToDataUrl(svgPath) {
  const content = fs.readFileSync(svgPath, "utf-8");
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(content);
}

async function captureScene(page, svgPath, outputPath) {
  const dataUrl = svgToDataUrl(svgPath);
  await page.goto("about:blank");
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff;">
    <img src="${dataUrl}" width="500" height="500" style="display:block"/>
  </body></html>`);
  await new Promise(r => setTimeout(r, 300));
  const clip = { x: 0, y: 0, width: 500, height: 500 };
  await page.screenshot({ path: outputPath, clip, type: "png" });
  console.log("  Screenshot saved:", outputPath);
}

// ──────────────────────────────────────────────
// PARK SVG 수정
// 차이점 설계:
//  1. [제거] 나무 아래 그림자 피크닉 매트(Tablecloth) 제거
//  2. [제거] character-3 (세 번째 인물) 제거
//  3. [추가] 나비(butterfly-1) 추가 (나무 근처)
//  4. [이동] Basket 오른쪽으로 60px 이동
//  5. [색변경] character-1 의 특정 소요소 색 변경
// ──────────────────────────────────────────────
async function revampPark(browser) {
  console.log("\n=== PARK 개편 시작 ===");
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500 });

  const origSvg = fs.readFileSync(path.join(SCENES_DIR, "park.svg"), "utf-8");

  // 컴포넌트: butterfly-1 (viewBox 0 0 64 64)
  const butterfly = readComponent("nature/butterfly-1.svg");
  // 컴포넌트: flower-1 (viewBox 0 0 1024 1024)
  const flower = readComponent("nature/flower-1.svg");

  const butterInner = butterfly.inner;
  const butterW = butterfly.compW;
  const butterH = butterfly.compH;

  const flowerInner = flower.inner;
  const flowerW = flower.compW;
  const flowerH = flower.compH;

  // page.evaluate를 사용하여 SVG 수정
  const modifiedSvg = await page.evaluate(
    ({ origSvg, butterInner, butterW, butterH, flowerInner, flowerW, flowerH }) => {
      // DOMParser 사용
      const parser = new DOMParser();
      const doc = parser.parseFromString(origSvg, "image/svg+xml");
      const svg = doc.documentElement;

      // 1. [제거] Tablecloth 제거 (피크닉 매트)
      const tablecloth = svg.querySelector("#Tablecloth");
      if (tablecloth) {
        tablecloth.style.display = "none";
        tablecloth.setAttribute("data-diff", "removed-tablecloth");
      }

      // 2. [제거] character-3 제거
      const char3 = svg.querySelector("#character-3");
      if (char3) {
        char3.style.display = "none";
        char3.setAttribute("data-diff", "removed-char3");
      }

      // 3. [추가] 나비 추가 - 나무 위쪽 (x=300, y=80), 크기 30px
      const targetButterSize = 35;
      const butterScale = targetButterSize / Math.max(butterW, butterH);
      const gButter = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gButter.setAttribute("transform", `translate(290,60) scale(${butterScale})`);
      gButter.setAttribute("data-diff", "added-butterfly");
      gButter.innerHTML = butterInner;
      svg.appendChild(gButter);

      // 4. [이동] Basket을 오른쪽으로 55px 이동
      const basket = svg.querySelector("#Basket");
      if (basket) {
        const existingTransform = basket.getAttribute("transform") || "";
        basket.setAttribute("transform", existingTransform + " translate(55,0)");
        basket.setAttribute("data-diff", "moved-basket");
      }

      // 5. [색변경] Tree 그룹 내 작은 원형 요소(잎사귀 원) 하나 색 변경
      // Tree 내부의 첫 번째 circle 또는 ellipse를 찾아서 색 변경
      const tree = svg.querySelector("#Tree");
      if (tree) {
        // tree 내부의 원형 또는 패스 요소 중 작은 것 선택 (잎 표현 원)
        const treeCircles = tree.querySelectorAll("circle, ellipse");
        if (treeCircles.length > 0) {
          // 두 번째 원 (첫 번째는 그림자일 수 있음)
          const target = treeCircles[treeCircles.length > 1 ? 1 : 0];
          target.style.fill = "#e8a020";
          target.setAttribute("data-diff", "color-tree-element");
        } else {
          // circle이 없으면 path 중 상단 요소 색 변경
          const treePaths = tree.querySelectorAll("path");
          if (treePaths.length > 2) {
            treePaths[1].style.fill = "#e8a020";
            treePaths[1].setAttribute("data-diff", "color-tree-path");
          }
        }
      }

      // XMLSerializer로 직렬화
      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc);
    },
    { origSvg, butterInner, butterW, butterH, flowerInner, flowerW, flowerH }
  );

  // 저장
  fs.writeFileSync(path.join(SCENES_DIR, "park-modified.svg"), modifiedSvg, "utf-8");
  console.log("  park-modified.svg 저장 완료");

  // QA 스크린샷
  await captureScene(page, path.join(SCENES_DIR, "park.svg"), path.join(QA_DIR, "park-before.png"));
  await captureScene(page, path.join(SCENES_DIR, "park-modified.svg"), path.join(QA_DIR, "park-after.png"));

  await page.close();

  // 차이점 좌표 반환 (SVG 500x500 기준)
  return {
    id: "park",
    diffs: [
      { cx: 250, cy: 412, r: 25, label: "Tablecloth 제거" },
      { cx: 375, cy: 333, r: 25, label: "character-3 제거" },
      { cx: 308, cy: 78,  r: 22, label: "나비 추가" },
      { cx: 233, cy: 386, r: 22, label: "Basket 이동 (+55px)" },
      { cx: 260, cy: 155, r: 25, label: "Tree 색변경" },
    ],
  };
}

// ──────────────────────────────────────────────
// DOGWALK SVG 수정
// 차이점 설계:
//  1. [제거] Cloud (구름) 제거
//  2. [제거] Plants 중 하위 소요소 제거 (배경 식물)
//  3. [추가] bird-1 추가 (하늘 오른쪽)
//  4. [크기변경] Characters 그룹 내 강아지 크기 변경 (scale up)
//  5. [색변경] Floor 색상 변경
// ──────────────────────────────────────────────
async function revampDogwalk(browser) {
  console.log("\n=== DOGWALK 개편 시작 ===");
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500 });

  const origSvg = fs.readFileSync(path.join(SCENES_DIR, "dogwalk.svg"), "utf-8");

  // 컴포넌트: bird-1 (viewBox 0 0 100 100)
  const bird = readComponent("nature/bird-1.svg");
  const birdInner = bird.inner;
  const birdW = bird.compW;
  const birdH = bird.compH;

  // 컴포넌트: flower-1 (viewBox 0 0 1024 1024)
  const flower = readComponent("nature/flower-1.svg");
  const flowerInner = flower.inner;
  const flowerW = flower.compW;
  const flowerH = flower.compH;

  const modifiedSvg = await page.evaluate(
    ({ origSvg, birdInner, birdW, birdH, flowerInner, flowerW, flowerH }) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(origSvg, "image/svg+xml");
      const svg = doc.documentElement;

      // 1. [제거] Cloud 제거
      const cloud = svg.querySelector("#Cloud");
      if (cloud) {
        cloud.style.display = "none";
        cloud.setAttribute("data-diff", "removed-cloud");
      }

      // 2. [제거] Plants 그룹 전체 제거 (왼쪽 식물)
      const plants = svg.querySelector("#Plants");
      if (plants) {
        plants.style.display = "none";
        plants.setAttribute("data-diff", "removed-plants");
      }

      // 3. [추가] bird-1 추가 - 오른쪽 하늘 (x=380, y=60), 크기 40px
      const targetBirdSize = 40;
      const birdScale = targetBirdSize / Math.max(birdW, birdH);
      const gBird = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gBird.setAttribute("transform", `translate(380,62) scale(${birdScale})`);
      gBird.setAttribute("data-diff", "added-bird");
      gBird.innerHTML = birdInner;
      // background-simple 다음에 삽입 (배경 위, 캐릭터 아래)
      const bgSimple = svg.querySelector("#background-simple");
      if (bgSimple && bgSimple.nextSibling) {
        svg.insertBefore(gBird, bgSimple.nextSibling);
      } else {
        svg.appendChild(gBird);
      }

      // 4. [크기변경] Characters 그룹 전체를 scale up (1.15배, 중심 이동 보정)
      // Characters 그룹의 중심은 약 (250, 300) 근처
      // scale(1.15) translate 보정: origin 250,300 -> (1-1.15)*250, (1-1.15)*300
      const characters = svg.querySelector("#Characters");
      if (characters) {
        const existing = characters.getAttribute("transform") || "";
        // translate(-37.5,-45) scale(1.15) -> 250*(1-1.15)=-37.5, 300*(1-1.15)=-45
        characters.setAttribute("transform", existing + " translate(-22,-30) scale(1.15)");
        characters.setAttribute("data-diff", "scaled-characters");
      }

      // 5. [색변경] background-simple의 첫 번째 path (배경 녹색 원형) 색상 변경
      // #92E3A9 (연초록) → #FFD166 (따뜻한 노란색)
      const bgEl = svg.querySelector("#background-simple");
      if (bgEl) {
        const firstPath = bgEl.querySelector("path");
        if (firstPath) {
          firstPath.style.fill = "#FFD166";
          firstPath.setAttribute("data-diff", "color-background");
        }
      }

      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc);
    },
    { origSvg, birdInner, birdW, birdH, flowerInner, flowerW, flowerH }
  );

  fs.writeFileSync(path.join(SCENES_DIR, "dogwalk-modified.svg"), modifiedSvg, "utf-8");
  console.log("  dogwalk-modified.svg 저장 완료");

  await captureScene(page, path.join(SCENES_DIR, "dogwalk.svg"), path.join(QA_DIR, "dogwalk-before.png"));
  await captureScene(page, path.join(SCENES_DIR, "dogwalk-modified.svg"), path.join(QA_DIR, "dogwalk-after.png"));

  await page.close();

  return {
    id: "dogwalk",
    diffs: [
      { cx: 195, cy: 108, r: 25, label: "Cloud 제거" },
      { cx: 155, cy: 245, r: 25, label: "Plants 제거" },
      { cx: 400, cy: 82,  r: 22, label: "Bird 추가" },
      { cx: 235, cy: 265, r: 35, label: "캐릭터 크기 변경" },
      { cx: 250, cy: 160, r: 35, label: "배경 색변경" },
    ],
  };
}

// ──────────────────────────────────────────────
// COFFEE SVG 수정
// 차이점 설계:
//  1. [제거] Spoon 제거
//  2. [제거] Slice (케이크 조각) 제거
//  3. [추가] cat-1 추가 (카페 구석, 아래쪽)
//  4. [이동] Pot를 왼쪽으로 50px 이동
//  5. [색변경] Chair 색상 변경
// ──────────────────────────────────────────────
async function revampCoffee(browser) {
  console.log("\n=== COFFEE 개편 시작 ===");
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500 });

  const origSvg = fs.readFileSync(path.join(SCENES_DIR, "coffee.svg"), "utf-8");

  // 컴포넌트: cat-1 (viewBox 0 0 128 128)
  const cat = readComponent("nature/cat-1.svg");
  const catInner = cat.inner;
  const catW = cat.compW;
  const catH = cat.compH;

  // 컴포넌트: cup-1 (viewBox 0 0 24 24)
  const cup = readComponent("food/cup-1.svg");
  const cupInner = cup.inner;
  const cupW = cup.compW;
  const cupH = cup.compH;

  const modifiedSvg = await page.evaluate(
    ({ origSvg, catInner, catW, catH, cupInner, cupW, cupH }) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(origSvg, "image/svg+xml");
      const svg = doc.documentElement;

      // 1. [제거] Spoon 제거 (id="Spoon" 또는 id="spoon")
      const spoon = svg.querySelector("#Spoon") || svg.querySelector("#spoon");
      if (spoon) {
        spoon.style.display = "none";
        spoon.setAttribute("data-diff", "removed-spoon");
      }

      // 2. [제거] Slice (케이크 조각) 제거
      const slice = svg.querySelector("#Slice") || svg.querySelector("#slice");
      if (slice) {
        slice.style.display = "none";
        slice.setAttribute("data-diff", "removed-slice");
      }

      // 3. [추가] cat-1 추가 - 왼쪽 아래 구석 (x=30, y=320), 크기 60px
      const targetCatSize = 60;
      const catScale = targetCatSize / Math.max(catW, catH);
      const gCat = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gCat.setAttribute("transform", `translate(25,320) scale(${catScale})`);
      gCat.setAttribute("data-diff", "added-cat");
      gCat.innerHTML = catInner;
      svg.appendChild(gCat);

      // 4. [이동] Pot를 왼쪽으로 50px 이동
      const pot = svg.querySelector("#Pot");
      if (pot) {
        const existing = pot.getAttribute("transform") || "";
        pot.setAttribute("transform", existing + " translate(-50,0)");
        pot.setAttribute("data-diff", "moved-pot");
      }

      // 5. [색변경] Chair(의자) 색상 변경 - chair-2 또는 두 번째 chair의 주요 요소
      // character-2 내 Chair 또는 직접 #Chair
      const chair2 = svg.querySelector("#character-2 #Chair") || svg.querySelector("#Chair");
      if (chair2) {
        // Chair 내부의 path들 중 fill이 보라/파란색인 것을 빨간색으로
        const chairPaths = chair2.querySelectorAll("path, polygon, rect");
        for (const el of chairPaths) {
          const style = el.getAttribute("style") || "";
          // BA68C8 (보라) 또는 455a64 (어두운 청회색) 변경
          if (style.includes("#BA68C8") || style.includes("#ba68c8")) {
            el.style.fill = "#e57373";
            el.setAttribute("data-diff", "color-chair");
            break;
          }
        }
        // 위 조건 못 찾으면 첫 번째 fill 있는 path를
        const allChairPaths = chair2.querySelectorAll("[style]");
        let colorChanged = false;
        for (const el of allChairPaths) {
          const style = el.getAttribute("style") || "";
          if (style.includes("#BA68C8") || style.includes("#ba68c8")) {
            colorChanged = true;
            break;
          }
        }
        if (!colorChanged) {
          // 첫 번째 fill이 있는 요소 색변경
          const firstFillEl = chair2.querySelector("[style*='fill']");
          if (firstFillEl) {
            firstFillEl.style.fill = "#e57373";
            firstFillEl.setAttribute("data-diff", "color-chair-fallback");
          }
        }
      }

      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc);
    },
    { origSvg, catInner, catW, catH, cupInner, cupW, cupH }
  );

  fs.writeFileSync(path.join(SCENES_DIR, "coffee-modified.svg"), modifiedSvg, "utf-8");
  console.log("  coffee-modified.svg 저장 완료");

  await captureScene(page, path.join(SCENES_DIR, "coffee.svg"), path.join(QA_DIR, "coffee-before.png"));
  await captureScene(page, path.join(SCENES_DIR, "coffee-modified.svg"), path.join(QA_DIR, "coffee-after.png"));

  await page.close();

  return {
    id: "coffee",
    diffs: [
      { cx: 239, cy: 223, r: 22, label: "Spoon 제거" },
      { cx: 211, cy: 202, r: 22, label: "Slice 제거" },
      { cx: 55,  cy: 350, r: 28, label: "고양이 추가" },
      { cx: 190, cy: 260, r: 22, label: "Pot 이동 (-50px)" },
      { cx: 381, cy: 265, r: 25, label: "Chair 색변경" },
    ],
  };
}

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────
async function main() {
  console.log("브라우저 시작...");
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const parkResult    = await revampPark(browser);
    const dogwalkResult = await revampDogwalk(browser);
    const coffeeResult  = await revampCoffee(browser);

    console.log("\n\n========================================");
    console.log("== levels.js 항목 (park / dogwalk / coffee) ==");
    console.log("========================================\n");

    const results = [parkResult, dogwalkResult, coffeeResult];
    for (const r of results) {
      const diffsStr = r.diffs
        .map(d => `    { cx: ${String(d.cx).padStart(3)}, cy: ${String(d.cy).padStart(3)}, r: ${d.r} }, // ${d.label}`)
        .join("\n");
      console.log(`{
  id: "${r.id}",
  diffs: [
${diffsStr}
  ]
},`);
    }

    console.log("\n\n[QA 스크린샷]");
    for (const r of results) {
      console.log(`  ${r.id}-before.png / ${r.id}-after.png`);
    }

    console.log("\n완료!");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
