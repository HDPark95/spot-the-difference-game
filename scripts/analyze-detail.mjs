/**
 * SVG 요소 상세 분석 - 하위 요소까지 탐색
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";

async function analyzeDetailed(browser, svgPath, targetSelectors, label) {
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(PROJECT, "public", svgPath), "utf-8");
  await page.setContent(`<html><body style="margin:0;width:500px;height:500px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 300));

  console.log(`\n=== ${label} ===`);

  for (const sel of targetSelectors) {
    const info = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      // 하위 g, path, rect, circle 등을 탐색
      const children = [];
      el.querySelectorAll("g, path, rect, circle, ellipse, polygon, line").forEach(child => {
        try {
          const r = child.getBoundingClientRect();
          if (r.width > 1 && r.height > 1) {
            children.push({
              tag: child.tagName,
              id: child.id || "",
              class: child.className.baseVal || "",
              cx: Math.round(r.x + r.width/2),
              cy: Math.round(r.y + r.height/2),
              w: Math.round(r.width),
              h: Math.round(r.height),
              fill: child.getAttribute("fill") || "",
            });
          }
        } catch(e) {}
      });
      return {
        found: true,
        cx: Math.round(rect.x + rect.width/2),
        cy: Math.round(rect.y + rect.height/2),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        children: children.slice(0, 30),
      };
    }, sel);

    if (!info) {
      console.log(`  ${sel}: NOT FOUND`);
    } else {
      console.log(`  ${sel}: cx=${info.cx} cy=${info.cy} size=${info.w}x${info.h}`);
      info.children.forEach(c => {
        const idStr = c.id ? `#${c.id}` : "";
        const classStr = c.class ? `.${c.class}` : "";
        console.log(`    > ${c.tag}${idStr}${classStr} cx:${c.cx} cy:${c.cy} size:${c.w}x${c.h} fill:${c.fill}`);
      });
    }
  }

  await page.close();
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  // 카페 원본 - background-complete 하위 선반 영역(cy~116) 및 카운터 영역
  await analyzeDetailed(browser, "/scenes/cafe.svg", [
    "#background-complete",
    "#Counter",
    "#character-2",
    "#character-1",
  ], "카페 원본 상세");

  await analyzeDetailed(browser, "/scenes/cafe-modified.svg", [
    "#background-complete",
    "#Counter",
    "#character-2",
    "#character-1",
  ], "카페 변형 상세");

  // 거실 - Character 하위 요소
  await analyzeDetailed(browser, "/scenes/livingroom.svg", [
    "#Character",
    "#Shelf",
  ], "거실 원본 상세");

  await analyzeDetailed(browser, "/scenes/livingroom-modified.svg", [
    "#Character",
    "#Shelf",
  ], "거실 변형 상세");

  // 공원 - Tree 하위 요소
  await analyzeDetailed(browser, "/scenes/park.svg", [
    "#Tree",
  ], "공원 원본 상세");

  await analyzeDetailed(browser, "/scenes/park-modified.svg", [
    "#Tree",
  ], "공원 변형 상세");

  await browser.close();
}

main().catch(console.error);
