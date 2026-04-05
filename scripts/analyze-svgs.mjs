/**
 * SVG 요소 분석 스크립트
 * 각 SVG의 주요 요소를 파악하고 수정 가능한 대상을 찾음
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
import fs from "fs";
import path from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";

async function analyzeSvg(browser, svgPath, label) {
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(PROJECT, "public", svgPath), "utf-8");
  await page.setContent(`<html><body style="margin:0;width:500px;height:500px">${svg}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 300));

  const elements = await page.evaluate(() => {
    const results = [];
    // id가 있는 요소들
    document.querySelectorAll("[id]").forEach(el => {
      try {
        const rect = el.getBoundingClientRect();
        if (rect.width > 2 && rect.height > 2) {
          results.push({
            id: el.id,
            tag: el.tagName,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            cx: Math.round(rect.x + rect.width/2),
            cy: Math.round(rect.y + rect.height/2),
          });
        }
      } catch(e) {}
    });
    return results;
  });

  console.log(`\n=== ${label} (${svgPath}) ===`);
  elements.sort((a, b) => a.cy - b.cy);
  elements.forEach(el => {
    console.log(`  #${el.id} [${el.tag}] cx:${el.cx} cy:${el.cy} size:${el.w}x${el.h}`);
  });

  await page.close();
  return elements;
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  await analyzeSvg(browser, "/scenes/cafe.svg", "카페 원본");
  await analyzeSvg(browser, "/scenes/cafe-modified.svg", "카페 변형");
  await analyzeSvg(browser, "/scenes/livingroom.svg", "거실 원본");
  await analyzeSvg(browser, "/scenes/livingroom-modified.svg", "거실 변형");
  await analyzeSvg(browser, "/scenes/park.svg", "공원 원본");
  await analyzeSvg(browser, "/scenes/park-modified.svg", "공원 변형");

  await browser.close();
}

main().catch(console.error);
