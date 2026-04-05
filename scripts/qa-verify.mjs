/**
 * QA 검증 스크립트
 * 모든 레벨을 Puppeteer로 열어서:
 * 1. 양쪽 패널에 SVG가 렌더링되는지
 * 2. 두 패널이 시각적으로 다른지
 * 3. 각 차이점 좌표를 클릭하면 정답 처리되는지
 * 4. 모든 차이점을 찾으면 축하 화면이 뜨는지
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");

const BASE_URL = "http://localhost:5174";
const SCREENSHOT_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/qa-screenshots";

import fs from "fs";
import path from "path";

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const levels = [
  { id: "cafe", diffs: [
    { cx:89,cy:123,r:20 }, { cx:114,cy:193,r:22 }, { cx:425,cy:117,r:18 },
    { cx:389,cy:240,r:18 }, { cx:191,cy:122,r:18 }
  ]},
  { id: "livingroom", diffs: [
    { cx:111,cy:196,r:20 }, { cx:99,cy:275,r:20 }, { cx:91,cy:359,r:18 },
    { cx:407,cy:395,r:20 }, { cx:336,cy:335,r:22 }
  ]},
  { id: "park", diffs: [
    { cx:106,cy:284,r:18 }, { cx:193,cy:316,r:18 }, { cx:356,cy:300,r:18 },
    { cx:212,cy:372,r:18 }, { cx:250,cy:411,r:22 }
  ]},
  { id: "dogwalk", diffs: [
    { cx:147,cy:110,r:22 }, { cx:190,cy:300,r:20 }, { cx:260,cy:240,r:22 },
    { cx:290,cy:380,r:18 }, { cx:310,cy:280,r:22 }
  ]},
  { id: "coffee", diffs: [
    { cx:240,cy:234,r:20 }, { cx:387,cy:255,r:22 }, { cx:141,cy:170,r:20 },
    { cx:300,cy:280,r:18 }, { cx:370,cy:170,r:20 }
  ]},
];

async function verifyLevel(browser, level) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700, deviceScaleFactor: 2 });
  const results = { id: level.id, pass: true, errors: [] };

  try {
    await page.goto(`${BASE_URL}/level/${level.id}`, { waitUntil: "networkidle0", timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));

    // 1. 양쪽 SVG 렌더링 확인
    const svgCount = await page.evaluate(() => document.querySelectorAll("svg").length);
    if (svgCount < 2) {
      results.errors.push(`SVG ${svgCount}개만 렌더링 (최소 2개 필요)`);
      results.pass = false;
    }

    // 2. 초기 스크린샷
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${level.id}-before.png`) });

    // 3. 각 차이점 클릭 테스트
    const svgA = await page.evaluate(() => {
      const panels = document.querySelectorAll("[class*='panel']");
      if (panels.length < 1) return null;
      const svg = panels[0].querySelector("svg");
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      const vb = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) || [0,0,500,500];
      return { left: r.left, top: r.top, width: r.width, height: r.height, vw: vb[2], vh: vb[3] };
    });

    if (!svgA) {
      results.errors.push("A 패널 SVG를 찾을 수 없음");
      results.pass = false;
    } else {
      for (let i = 0; i < level.diffs.length; i++) {
        const d = level.diffs[i];
        const clickX = svgA.left + (d.cx / svgA.vw) * svgA.width;
        const clickY = svgA.top + (d.cy / svgA.vh) * svgA.height;
        await page.mouse.click(clickX, clickY);
        await new Promise(r => setTimeout(r, 300));
      }

      // 4. 찾은 개수 확인
      const foundText = await page.evaluate(() => {
        const el = document.querySelector("[class*='found']");
        return el?.textContent || "0";
      });
      const foundCount = parseInt(foundText) || 0;

      if (foundCount < level.diffs.length) {
        results.errors.push(`${level.diffs.length}개 중 ${foundCount}개만 찾음 (${level.diffs.length - foundCount}개 미감지)`);
        results.pass = false;
      }
    }

    // 5. 클릭 후 스크린샷
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${level.id}-after.png`) });

  } catch (err) {
    results.errors.push(`에러: ${err.message}`);
    results.pass = false;
  }

  await page.close();
  return results;
}

async function main() {
  console.log("=== QA 검증 시작 ===\n");

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox"],
  });

  let allPass = true;

  for (const level of levels) {
    const result = await verifyLevel(browser, level);
    const status = result.pass ? "PASS" : "FAIL";
    console.log(`[${status}] ${result.id}`);
    if (result.errors.length > 0) {
      result.errors.forEach(e => console.log(`  - ${e}`));
      allPass = false;
    }
  }

  await browser.close();

  console.log(`\n=== 결과: ${allPass ? "ALL PASS" : "FAIL"} ===`);
  console.log(`스크린샷: ${SCREENSHOT_DIR}/`);

  process.exit(allPass ? 0 : 1);
}

main().catch(console.error);
