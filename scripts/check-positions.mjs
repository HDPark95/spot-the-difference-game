/**
 * 실제 픽셀 차이 위치 확인
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

async function renderSvgToPixels(browser, svgContent) {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden">${svgContent}</body></html>`, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 800));
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return buf;
}

async function main() {
  const origSvg = fs.readFileSync(SVG_PATH, "utf-8");
  const modSvg = fs.readFileSync(MOD_SVG_PATH, "utf-8");

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const origBuf = await renderSvgToPixels(browser, origSvg);
  const modBuf = await renderSvgToPixels(browser, modSvg);
  await browser.close();

  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  // 차이 픽셀 맵 생성
  const diffMap = new Uint8Array(w * h);
  let totalChanged = 0;

  // 50x50 그리드별 변화량 측정
  const gridSize = 50;
  const gridW = Math.ceil(w / gridSize);
  const gridH = Math.ceil(h / gridSize);
  const grid = new Array(gridH).fill(null).map(() => new Array(gridW).fill(0));
  const gridTotal = new Array(gridH).fill(null).map(() => new Array(gridW).fill(0));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dr = Math.abs(origData[idx] - modData[idx]);
      const dg = Math.abs(origData[idx+1] - modData[idx+1]);
      const db = Math.abs(origData[idx+2] - modData[idx+2]);
      const gx = Math.floor(x / gridSize);
      const gy = Math.floor(y / gridSize);
      gridTotal[gy][gx]++;
      if (dr + dg + db > 30) {
        diffMap[y * w + x] = 1;
        totalChanged++;
        grid[gy][gx]++;
      }
    }
  }

  console.log(`총 변경 픽셀: ${totalChanged} (${(totalChanged/w/h*100).toFixed(2)}%)`);
  console.log("\n50x50 그리드별 변화 (>1% 표시):");
  for (let gy = 0; gy < gridH; gy++) {
    const y_center = gy * gridSize + gridSize/2;
    let row_has_diff = false;
    for (let gx = 0; gx < gridW; gx++) {
      const ratio = grid[gy][gx] / gridTotal[gy][gx];
      if (ratio > 0.01) row_has_diff = true;
    }
    if (row_has_diff) {
      let line = `y~${Math.round(y_center)}:`;
      for (let gx = 0; gx < gridW; gx++) {
        const x_center = gx * gridSize + gridSize/2;
        const ratio = grid[gy][gx] / gridTotal[gy][gx];
        if (ratio > 0.01) {
          line += ` x~${Math.round(x_center)}(${(ratio*100).toFixed(0)}%)`;
        }
      }
      console.log(line);
    }
  }
}

main().catch(console.error);
