/**
 * 공원 #5 수정 및 최종 검증
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
  for (let y = Math.max(0, cy - r); y < Math.min(h, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x < Math.min(w, cx + r); x++) {
      if (Math.hypot(x - cx, y - cy) <= r) {
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

  const parkOrig = readSvg("park.svg");
  const parkModExisting = readSvg("park-modified.svg");
  let parkMod = parkModExisting;

  const parkOrigPath = path.join(PROJECT, "public/scenes/park.svg");
  const parkModPath = path.join(PROJECT, "public/scenes/park-modified.svg");

  console.log("=== 공원 수정 ===");

  // Tree 그룹에서 나뭇잎(cy~155) 위치의 요소를 찾아서 숨기기
  // 분석에서 나뭇잎 area는 Tree 내 fill:#407BFF path (cx:248 cy:144 size:190x113)
  // 이 요소를 숨기면 나무 상단 잎이 사라짐
  // 해당 path: "M321.38,116.62c-16.83-15-37.94-20.13-53.42..."

  // Tree 그룹에서 주요 잎 path를 display:none으로
  // path cx:248 cy:144 fill:#407BFF (나뭇잎 색 파란색)
  // 원본 SVG에서 이 path의 d 속성: "M321.38,116.62..."

  // 공원 원본에서 Tree 안의 파란색 나뭇잎 path 찾기
  const treeIdx = parkMod.indexOf('id="Tree"');
  if (treeIdx >= 0) {
    let treeStart = treeIdx;
    while (treeStart > 0 && parkMod[treeStart] !== '<') treeStart--;

    const treePart = parkMod.slice(treeStart, treeStart + 8000);

    // fill:#407BFF 패턴 찾기 (나뭇잎)
    const blueLeafIdx = treePart.indexOf('style="fill:#407BFF"');
    if (blueLeafIdx >= 0) {
      let leafStart = blueLeafIdx;
      while (leafStart > 0 && treePart[leafStart] !== '<') leafStart--;
      const leafEnd = treePart.indexOf('>', blueLeafIdx);
      const leafTag = treePart.slice(leafStart, leafEnd + 1);
      console.log(`  나뭇잎 파란색 태그 (${leafStart}-${leafEnd}): ${leafTag.slice(0, 150)}`);

      // 실제 parkMod에서 이 위치
      const absLeafStart = treeStart + leafStart;
      const absLeafEnd = treeStart + leafEnd;

      // display:none 추가
      const newLeafTag = leafTag.replace('style="fill:#407BFF"', 'style="fill:#407BFF;display:none"');
      parkMod = parkMod.slice(0, absLeafStart) + newLeafTag + parkMod.slice(absLeafEnd + 1);
      console.log("  나뭇잎 숨김 완료");
    } else {
      console.log("  fill:#407BFF NOT FOUND in Tree");
      // 대안: Tree 전체 숨기기 대신 다른 요소 찾기
    }
  }

  writeSvg("park-modified.svg", parkMod);

  // 검증
  const leaf5 = await measureDiffRatio(browser, parkOrigPath, parkModPath, 260, 155, 25);
  console.log(`  #5 나뭇잎 (cx:260,cy:155,r:25): ${(leaf5.ratio*100).toFixed(1)}%`);

  const leaf5b = await measureDiffRatio(browser, parkOrigPath, parkModPath, 248, 144, 25);
  console.log(`  #5 나뭇잎 (cx:248,cy:144,r:25): ${(leaf5b.ratio*100).toFixed(1)}%`);

  // 기존 성공 항목들 검증
  const p1 = await measureDiffRatio(browser, parkOrigPath, parkModPath, 250, 412, 25);
  console.log(`  #1 매트 (cx:250,cy:412): ${(p1.ratio*100).toFixed(1)}%`);
  const p2 = await measureDiffRatio(browser, parkOrigPath, parkModPath, 375, 333, 25);
  console.log(`  #2 배드민턴 (cx:375,cy:333): ${(p2.ratio*100).toFixed(1)}%`);
  const p3 = await measureDiffRatio(browser, parkOrigPath, parkModPath, 308, 78, 22);
  console.log(`  #3 나비 (cx:308,cy:78): ${(p3.ratio*100).toFixed(1)}%`);
  const p4 = await measureDiffRatio(browser, parkOrigPath, parkModPath, 233, 386, 22);
  console.log(`  #4 바구니 (cx:233,cy:386): ${(p4.ratio*100).toFixed(1)}%`);

  // 카페 재검증
  console.log("\n=== 카페 재검증 ===");
  const cafeOrigPath = path.join(PROJECT, "public/scenes/cafe.svg");
  const cafeModPath = path.join(PROJECT, "public/scenes/cafe-modified.svg");

  const c1 = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 89, 123, 22);
  console.log(`  #1 메뉴판 (cx:89,cy:123): ${(c1.ratio*100).toFixed(1)}%`);
  const c2a = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 400, 116, 22);
  const c2b = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 379, 120, 22);
  console.log(`  #2 병 원래좌표 (cx:400,cy:116): ${(c2a.ratio*100).toFixed(1)}%`);
  console.log(`  #2 병 새좌표 (cx:379,cy:120): ${(c2b.ratio*100).toFixed(1)}%`);
  const c3 = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 399, 240, 22);
  console.log(`  #3 핸드백 (cx:399,cy:240): ${(c3.ratio*100).toFixed(1)}%`);
  const c4 = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 108, 221, 30);
  console.log(`  #4 커피머신 (cx:108,cy:221): ${(c4.ratio*100).toFixed(1)}%`);
  const c5a = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 166, 370, 30);
  const c5b = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 146, 340, 30);
  const c5c = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 231, 340, 30);
  const c5d = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 188, 340, 30);
  console.log(`  #5 카운터장식 원래(cx:166,cy:370,r:30): ${(c5a.ratio*100).toFixed(1)}%`);
  console.log(`  #5 카운터장식 (cx:146,cy:340,r:30): ${(c5b.ratio*100).toFixed(1)}%`);
  console.log(`  #5 카운터장식 (cx:231,cy:340,r:30): ${(c5c.ratio*100).toFixed(1)}%`);
  console.log(`  #5 카운터장식 (cx:188,cy:340,r:30): ${(c5d.ratio*100).toFixed(1)}%`);

  // 더 넓은 범위
  const c5e = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 188, 340, 50);
  const c5f = await measureDiffRatio(browser, cafeOrigPath, cafeModPath, 188, 350, 40);
  console.log(`  #5 카운터장식 (cx:188,cy:340,r:50): ${(c5e.ratio*100).toFixed(1)}%`);
  console.log(`  #5 카운터장식 (cx:188,cy:350,r:40): ${(c5f.ratio*100).toFixed(1)}%`);

  await browser.close();
}

main().catch(console.error);
