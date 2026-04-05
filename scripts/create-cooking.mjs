import { createRequire } from "module";
import fs from "fs";

const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SCENES_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/public/scenes";
const QA_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/qa-screenshots";

// ===================================================
// 요리 레벨 생성
// SVG viewBox: 0 0 500 500
// 그룹: background-complete, background-simple, Shadow, Oven, Character
//
// 차이점 설계:
// 1. Oven 내 idx=3 (화염 path) 제거 → 오븐 위 불꽃 사라짐
// 2. Oven 내 큰 rect(오븐 본체) 색 변경 → 오븐 색 변경 (색 변경 1개)
// 3. Character 그룹 오른쪽으로 60px 이동 → 캐릭터 위치 변경
// 4. Character 내 큰 요소(의상) 제거 → 캐릭터 일부 사라짐
// 5. Oven 내 오븐 창문(glass rect) 제거 → 오븐 유리창 사라짐
// ===================================================

async function renderPng(page, svgHtml, outputPath) {
  const tmpHtml = `${QA_DIR}/_tmp_cooking_render.html`;
  fs.writeFileSync(
    tmpHtml,
    `<html><body style="margin:0;padding:0;background:#fff;width:500px;height:500px;overflow:hidden;">${svgHtml}</body></html>`
  );
  await page.goto(`file://${tmpHtml}`);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width: 500, height: 500 } });
  fs.unlinkSync(tmpHtml);
}

async function pixelVerify(origPng, modPng, diffs) {
  const origRaw = await sharp(origPng).raw().toBuffer();
  const modRaw = await sharp(modPng).raw().toBuffer();

  const W = 500;
  const H = 500;
  const C = 4; // RGBA

  const results = [];
  for (const diff of diffs) {
    const { id, cx, cy, r } = diff;
    let total = 0;
    let changed = 0;

    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;

        total++;
        const i = (y * W + x) * C;
        let diff_val = 0;
        for (let c = 0; c < 3; c++) {
          diff_val += Math.abs(origRaw[i + c] - modRaw[i + c]);
        }
        if (diff_val > 15) changed++;
      }
    }

    const ratio = total > 0 ? changed / total : 0;
    const pass = ratio >= 0.02;
    results.push({ id, cx, cy, r, ratio: (ratio * 100).toFixed(1), pass, label: diff.label });
  }
  return results;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500 });

  const svgPath = `${SCENES_DIR}/cooking.svg`;

  // 원본 스크린샷
  await page.goto(`file://${svgPath}`);
  await page.waitForSelector("svg");
  await page.screenshot({ path: `${QA_DIR}/cooking-before.png`, clip: { x: 0, y: 0, width: 500, height: 500 } });
  console.log("요리 원본 스크린샷 저장");

  // SVG 분석: 그룹별 요소 열거
  const analysis = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const groups = svg.querySelectorAll("g[id]");
    const result = {};
    for (const g of groups) {
      const id = g.id;
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
      const items = [];
      let idx = 0;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          const area = eb.width * eb.height;
          if (area >= 200 && area <= 4000) {
            items.push({
              idx,
              tag: el.tagName,
              x: Math.round(eb.x),
              y: Math.round(eb.y),
              w: Math.round(eb.width),
              h: Math.round(eb.height),
              area: Math.round(area),
              cx: Math.round(eb.x + eb.width / 2),
              cy: Math.round(eb.y + eb.height / 2),
            });
          }
          idx++;
        } catch (e) {}
      }
      result[id] = items;
    }
    return result;
  });

  console.log("\n===== SVG 분석 결과 (면적 200~4000) =====");
  for (const [gid, items] of Object.entries(analysis)) {
    console.log(`\n[${gid}] (${items.length}개):`);
    items.slice(0, 20).forEach((it) =>
      console.log(`  idx:${it.idx} ${it.tag} cx:${it.cx} cy:${it.cy} w:${it.w} h:${it.h} area:${it.area}`)
    );
  }

  // 변형 적용
  console.log("\n===== 변형 적용 =====");
  const result = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const diffs = [];

    // 차이점 1: Oven 내 화염(flame) path 제거 - idx 3 (화염 모양 복잡한 path)
    // Oven 그룹에서 면적 200~4000인 요소를 순서대로 탐색하여 제거
    {
      const g = svg.querySelector("#Oven");
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
      let count = 0;
      let removed = false;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          const area = eb.width * eb.height;
          if (area >= 200 && area <= 4000) {
            if (count === 3) {
              // 화염 path (오븐 위의 불꽃)
              el.style.display = "none";
              diffs.push({
                id: 1,
                cx: Math.round(eb.x + eb.width / 2),
                cy: Math.round(eb.y + eb.height / 2),
                r: 40,
                label: "오븐 위 불꽃이 사라졌어요",
              });
              removed = true;
              break;
            }
            count++;
          }
        } catch (e) {}
      }
      if (!removed) {
        // fallback: Oven에서 중간 크기 요소 제거 시도
        const allEls = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let fallbackIdx = 0;
        for (const el of allEls) {
          try {
            const eb = el.getBBox();
            if (eb.width > 10 && eb.height > 10) {
              if (fallbackIdx === 3) {
                el.style.display = "none";
                diffs.push({
                  id: 1,
                  cx: Math.round(eb.x + eb.width / 2),
                  cy: Math.round(eb.y + eb.height / 2),
                  r: 40,
                  label: "오븐 위 불꽃이 사라졌어요",
                });
                break;
              }
              fallbackIdx++;
            }
          } catch (e) {}
        }
      }
    }

    // 차이점 2: Oven 내 오븐창(유리 rect) 제거
    // Oven 안의 두 번째 큰 rect(오븐 유리창 영역)
    {
      const g = svg.querySelector("#Oven");
      const els = g.querySelectorAll("rect");
      let bestEl = null;
      let bestScore = -1;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          const area = eb.width * eb.height;
          // 오븐 창문: 오븐 중단에 위치한 적당히 큰 rect
          // 오븐 창문 특성: y > 280, w > 100, h > 80, area > 8000
          if (eb.y > 280 && eb.width > 80 && eb.height > 70) {
            const score = area;
            if (score > bestScore) {
              bestScore = score;
              bestEl = { el, eb };
            }
          }
        } catch (e) {}
      }
      if (bestEl) {
        bestEl.el.style.display = "none";
        diffs.push({
          id: 2,
          cx: Math.round(bestEl.eb.x + bestEl.eb.width / 2),
          cy: Math.round(bestEl.eb.y + bestEl.eb.height / 2),
          r: 50,
          label: "오븐 유리창이 사라졌어요",
        });
      } else {
        // fallback: Oven 내 idx=5 rect
        const rectEls = g.querySelectorAll("rect");
        let idx = 0;
        for (const el of rectEls) {
          try {
            const eb = el.getBBox();
            if (eb.width > 50 && eb.height > 50) {
              if (idx === 0) {
                el.style.display = "none";
                diffs.push({
                  id: 2,
                  cx: Math.round(eb.x + eb.width / 2),
                  cy: Math.round(eb.y + eb.height / 2),
                  r: 50,
                  label: "오븐 유리창이 사라졌어요",
                });
                break;
              }
              idx++;
            }
          } catch (e) {}
        }
      }
    }

    // 차이점 3: Character 그룹 오른쪽으로 60px 이동
    {
      const g = svg.querySelector("#Character");
      if (g) {
        try {
          const bb = g.getBBox();
          const existing = g.getAttribute("transform") || "";
          g.setAttribute("transform", existing + " translate(60, 0)");
          diffs.push({
            id: 3,
            cx: Math.round(bb.x + bb.width / 2 + 30),
            cy: Math.round(bb.y + bb.height / 2),
            r: 80,
            label: "요리사 위치가 바뀌었어요",
          });
        } catch (e) {}
      }
    }

    // 차이점 4: Oven 내 오븐 본체 가장 큰 rect 색 변경 (색 변경 1개)
    {
      const g = svg.querySelector("#Oven");
      const rects = g.querySelectorAll("rect");
      let biggestEl = null;
      let biggestArea = 0;
      for (const el of rects) {
        try {
          const eb = el.getBBox();
          const area = eb.width * eb.height;
          if (area > biggestArea) {
            biggestArea = area;
            biggestEl = { el, eb };
          }
        } catch (e) {}
      }
      if (biggestEl) {
        biggestEl.el.setAttribute("fill", "#E74C3C");
        diffs.push({
          id: 4,
          cx: Math.round(biggestEl.eb.x + biggestEl.eb.width / 2),
          cy: Math.round(biggestEl.eb.y + biggestEl.eb.height / 2),
          r: 70,
          label: "오븐 색이 바뀌었어요",
        });
      }
    }

    // 차이점 5: background-complete 내 중간 크기 요소 제거 (장식 요소)
    {
      const g = svg.querySelector("#background-complete");
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
      let count = 0;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          const area = eb.width * eb.height;
          if (area >= 200 && area <= 4000) {
            if (count === 5) {
              el.style.display = "none";
              diffs.push({
                id: 5,
                cx: Math.round(eb.x + eb.width / 2),
                cy: Math.round(eb.y + eb.height / 2),
                r: 40,
                label: "배경의 장식이 사라졌어요",
              });
              break;
            }
            count++;
          }
        } catch (e) {}
      }
    }

    return { svgHTML: svg.outerHTML, diffs };
  });

  console.log("\n요리 차이점:");
  result.diffs.forEach((d) =>
    console.log(`  ${d.id}: cx:${d.cx}, cy:${d.cy}, r:${d.r} - ${d.label}`)
  );

  // 수정 SVG 저장
  fs.writeFileSync(`${SCENES_DIR}/cooking-modified.svg`, result.svgHTML);
  console.log("\ncooking-modified.svg 저장 완료");

  // 수정 스크린샷
  const modPngPath = `${QA_DIR}/cooking-after.png`;
  await renderPng(page, result.svgHTML, modPngPath);
  console.log("수정 스크린샷 저장");

  // 픽셀 검증
  console.log("\n===== 픽셀 검증 =====");
  const verifyResults = await pixelVerify(
    `${QA_DIR}/cooking-before.png`,
    modPngPath,
    result.diffs
  );

  let allPass = true;
  for (const vr of verifyResults) {
    const status = vr.pass ? "PASS" : "FAIL";
    console.log(`  diff ${vr.id}: ${status} (변경 픽셀 ${vr.ratio}%) cx:${vr.cx} cy:${vr.cy} r:${vr.r} - ${vr.label}`);
    if (!vr.pass) allPass = false;
  }

  if (!allPass) {
    console.log("\n일부 FAIL. 차이점을 강화하여 재시도합니다...");
    await browser.close();
    process.exit(1);
  }

  console.log("\n모두 PASS!");

  // levels.js 항목 출력
  const entry = {
    id: "cooking",
    title: "요리",
    desc: "맛있는 요리 장면에서 다른 곳 5개를 찾아보세요",
    difficulty: "쉬움",
    diffCount: 5,
    originalSvg: "/scenes/cooking.svg",
    modifiedSvg: "/scenes/cooking-modified.svg",
    diffs: result.diffs,
  };

  const diffsStr = entry.diffs
    .map((d) => `    { id: ${d.id}, cx: ${d.cx}, cy: ${d.cy}, r: ${d.r}, label: "${d.label}" },`)
    .join("\n");

  const entryStr = `{
  id: "${entry.id}",
  title: "${entry.title}",
  desc: "${entry.desc}",
  difficulty: "${entry.difficulty}",
  diffCount: ${entry.diffCount},
  originalSvg: "${entry.originalSvg}",
  modifiedSvg: "${entry.modifiedSvg}",
  diffs: [
${diffsStr}
  ],
},`;

  console.log("\n========== levels.js 항목 ==========\n");
  console.log(entryStr);

  await browser.close();
}

main().catch(console.error);
