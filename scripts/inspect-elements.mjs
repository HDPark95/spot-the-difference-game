/**
 * 특정 픽셀 좌표에 있는 SVG 요소 찾기
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";

async function findElementsAtPoint(browser, svgPath, points) {
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(PROJECT, "public", svgPath), "utf-8");
  await page.setContent(`<html><body style="margin:0;width:500px;height:500px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 300));

  const results = await page.evaluate((points) => {
    const results = [];
    for (const [x, y] of points) {
      const elements = document.elementsFromPoint(x, y);
      const relevant = elements
        .filter(el => el.tagName !== 'HTML' && el.tagName !== 'BODY')
        .slice(0, 5)
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            id: el.id || "",
            class: el.className?.baseVal || el.className || "",
            cx: Math.round(rect.x + rect.width/2),
            cy: Math.round(rect.y + rect.height/2),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            fill: el.getAttribute("fill") || el.style?.fill || "",
            style: el.getAttribute("style") || "",
          };
        });
      results.push({ point: [x, y], elements: relevant });
    }
    return results;
  }, points);

  await page.close();
  return results;
}

async function getAllIds(browser, svgPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(PROJECT, "public", svgPath), "utf-8");
  await page.setContent(`<html><body style="margin:0;width:500px;height:500px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 300));

  const ids = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll("[id]").forEach(el => {
      const rect = el.getBoundingClientRect();
      results.push({
        id: el.id,
        tag: el.tagName,
        cx: Math.round(rect.x + rect.width/2),
        cy: Math.round(rect.y + rect.height/2),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    });
    return results;
  });

  await page.close();
  return ids;
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  // 카페 원본에서 카운터 문 장식 영역(cx:166 cy:370)의 요소 확인
  console.log("=== 카페 원본 cx:166 cy:370 (카운터 문 장식) ===");
  const cafeResults1 = await findElementsAtPoint(browser, "/scenes/cafe.svg", [
    [166, 370], [140, 350], [200, 350], [130, 340], [145, 339], [180, 380]
  ]);
  cafeResults1.forEach(r => {
    console.log(`  (${r.point}) elements:`);
    r.elements.forEach(el => {
      console.log(`    ${el.tag}#${el.id} cx:${el.cx} cy:${el.cy} fill:${el.fill} style:${el.style.slice(0,60)}`);
    });
  });

  // 거실 원본에서 인물 상의 영역(cx:309 cy:326)의 요소 확인
  console.log("\n=== 거실 원본 cx:309 cy:326 (인물 상의) ===");
  const livingResults = await findElementsAtPoint(browser, "/scenes/livingroom.svg", [
    [309, 326], [300, 320], [320, 330], [310, 315]
  ]);
  livingResults.forEach(r => {
    console.log(`  (${r.point}) elements:`);
    r.elements.forEach(el => {
      console.log(`    ${el.tag}#${el.id} cx:${el.cx} cy:${el.cy} fill:${el.fill} style:${el.style.slice(0,60)}`);
    });
  });

  // 공원 원본에서 나뭇잎 영역(cx:260 cy:155)의 요소 확인
  console.log("\n=== 공원 원본 cx:260 cy:155 (나뭇잎 색) ===");
  const parkResults = await findElementsAtPoint(browser, "/scenes/park.svg", [
    [260, 155], [250, 145], [270, 165], [248, 100]
  ]);
  parkResults.forEach(r => {
    console.log(`  (${r.point}) elements:`);
    r.elements.forEach(el => {
      console.log(`    ${el.tag}#${el.id} cx:${el.cx} cy:${el.cy} fill:${el.fill} style:${el.style.slice(0,60)}`);
    });
  });

  // 공원 원본 전체 id 목록
  console.log("\n=== 공원 원본 전체 ID ===");
  const parkIds = await getAllIds(browser, "/scenes/park.svg");
  parkIds.forEach(el => {
    console.log(`  #${el.id} [${el.tag}] cx:${el.cx} cy:${el.cy} ${el.w}x${el.h}`);
  });

  // 거실 원본 전체 id 목록
  console.log("\n=== 거실 원본 전체 ID ===");
  const livingIds = await getAllIds(browser, "/scenes/livingroom.svg");
  livingIds.forEach(el => {
    console.log(`  #${el.id} [${el.tag}] cx:${el.cx} cy:${el.cy} ${el.w}x${el.h}`);
  });

  await browser.close();
}

main().catch(console.error);
