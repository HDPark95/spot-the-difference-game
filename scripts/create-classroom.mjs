/**
 * 교실 레벨 생성 스크립트
 * 1. SVG 분석 → g[id] 그룹 열거, 하위 요소 면적 열거
 * 2. 차이점 5개 설계 + 변형 SVG 생성
 * 3. 픽셀 검증 (히트 영역 내 2% 이상 변경)
 * 4. 결과 출력
 */
import { createRequire } from "module";
import fs from "fs";

const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCENES_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/public/scenes";
const QA_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/qa-screenshots";
const SIZE = 500;

// ===================================================
// Step 1: SVG 분석
// ===================================================
async function analyzeSvg(browser) {
  console.log("\n========== SVG 분석 ==========");
  const svgPath = `${SCENES_DIR}/classroom.svg`;

  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.goto(`file://${svgPath}`);
  await page.waitForSelector("svg");

  const analysis = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const groups = svg.querySelectorAll("g[id]");
    const result = [];

    for (const g of groups) {
      const id = g.getAttribute("id");
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse, line, polyline");
      const items = [];
      let idx = 0;
      for (const el of els) {
        try {
          const bb = el.getBBox();
          const area = bb.width * bb.height;
          if (area >= 200 && area <= 4000) {
            items.push({
              idx,
              tag: el.tagName,
              x: Math.round(bb.x),
              y: Math.round(bb.y),
              w: Math.round(bb.width),
              h: Math.round(bb.height),
              area: Math.round(area),
              cx: Math.round(bb.x + bb.width / 2),
              cy: Math.round(bb.y + bb.height / 2),
            });
          }
          idx++;
        } catch (e) {}
      }
      result.push({ id, count: els.length, suitableItems: items });
    }
    return result;
  });

  for (const g of analysis) {
    console.log(`\n그룹: #${g.id} (총 ${g.count}개 요소)`);
    console.log(`  면적 200~4000 요소 ${g.suitableItems.length}개:`);
    for (const item of g.suitableItems.slice(0, 10)) {
      console.log(`    idx=${item.idx} ${item.tag} cx:${item.cx} cy:${item.cy} ${item.w}x${item.h} (area:${item.area})`);
    }
    if (g.suitableItems.length > 10) {
      console.log(`    ... 그 외 ${g.suitableItems.length - 10}개`);
    }
  }

  await page.close();
  return analysis;
}

// ===================================================
// Step 2: 변형 적용 및 SVG 저장
// ===================================================
async function createModifiedSvg(browser) {
  console.log("\n========== 변형 SVG 생성 ==========");
  const svgPath = `${SCENES_DIR}/classroom.svg`;

  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.goto(`file://${svgPath}`);
  await page.waitForSelector("svg");

  // 원본 스크린샷
  await page.screenshot({ path: `${QA_DIR}/classroom-before.png`, fullPage: false });
  console.log("원본 스크린샷 저장: classroom-before.png");

  const result = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const diffs = [];

    // -------------------------------------------------------
    // 차이점 1: Board 그룹에서 요소 제거 (칠판 위 요소)
    // Board 그룹: 칠판 관련 요소들
    // -------------------------------------------------------
    {
      const g = svg.querySelector("#Board");
      if (g) {
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let count = 0;
        let found = false;
        for (const el of els) {
          try {
            const eb = el.getBBox();
            const area = eb.width * eb.height;
            if (area >= 200 && area <= 4000) {
              if (count === 2) {
                el.style.display = "none";
                diffs.push({
                  id: 1,
                  cx: Math.round(eb.x + eb.width / 2),
                  cy: Math.round(eb.y + eb.height / 2),
                  r: 35,
                  label: "칠판 위 글씨가 사라졌어요",
                });
                found = true;
                break;
              }
              count++;
            }
          } catch (e) {}
        }
        if (!found) {
          // 대안: 첫 번째 적합한 요소 제거
          const els2 = g.querySelectorAll("path, polygon, rect, circle, ellipse");
          for (const el of els2) {
            try {
              const eb = el.getBBox();
              const area = eb.width * eb.height;
              if (area >= 100 && area <= 8000) {
                el.style.display = "none";
                diffs.push({
                  id: 1,
                  cx: Math.round(eb.x + eb.width / 2),
                  cy: Math.round(eb.y + eb.height / 2),
                  r: 35,
                  label: "칠판 위 요소가 사라졌어요",
                });
                break;
              }
            } catch (e) {}
          }
        }
      }
    }

    // -------------------------------------------------------
    // 차이점 2: character-1 색 변경 (상의 색)
    // character-1: 첫 번째 학생 — 면적 큰 요소 중 idx=2 (43x73 path)
    // -------------------------------------------------------
    {
      const g = svg.querySelector("#character-1");
      if (g) {
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let allEls = [];
        for (const el of els) {
          try {
            const eb = el.getBBox();
            allEls.push({ el, eb, area: eb.width * eb.height });
          } catch (e) {}
        }
        // 면적 1000 이상 요소 중 두 번째를 색 변경 (충분히 눈에 띄는 크기)
        const bigEls = allEls.filter(e => e.area >= 1000).sort((a, b) => b.area - a.area);
        if (bigEls.length >= 2) {
          const target = bigEls[1]; // 두 번째로 큰 요소
          target.el.setAttribute("fill", "#E74C3C");
          // fill 속성이 없는 경우 style도 설정
          target.el.style.fill = "#E74C3C";
          diffs.push({
            id: 2,
            cx: Math.round(target.eb.x + target.eb.width / 2),
            cy: Math.round(target.eb.y + target.eb.height / 2),
            r: 40,
            label: "학생 상의 색이 바뀌었어요",
          });
        } else if (bigEls.length >= 1) {
          const target = bigEls[0];
          target.el.setAttribute("fill", "#E74C3C");
          target.el.style.fill = "#E74C3C";
          diffs.push({
            id: 2,
            cx: Math.round(target.eb.x + target.eb.width / 2),
            cy: Math.round(target.eb.y + target.eb.height / 2),
            r: 40,
            label: "학생 상의 색이 바뀌었어요",
          });
        }
      }
    }

    // -------------------------------------------------------
    // 차이점 3: character-2 그룹 위치 이동 (60px 오른쪽)
    // -------------------------------------------------------
    {
      const g = svg.querySelector("#character-2");
      if (g) {
        try {
          const bb = g.getBBox();
          const existing = g.getAttribute("transform") || "";
          g.setAttribute("transform", existing + " translate(60, 0)");
          diffs.push({
            id: 3,
            cx: Math.round(bb.x + bb.width / 2 + 30),
            cy: Math.round(bb.y + bb.height / 2),
            r: 45,
            label: "학생 위치가 바뀌었어요",
          });
        } catch (e) {}
      }
    }

    // -------------------------------------------------------
    // 차이점 4: background-complete 내 요소 제거 (교실 배경 오브젝트)
    // -------------------------------------------------------
    {
      const g = svg.querySelector("#background-complete");
      if (g) {
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let count = 0;
        for (const el of els) {
          try {
            const eb = el.getBBox();
            const area = eb.width * eb.height;
            if (area >= 400 && area <= 3000) {
              if (count === 8) {
                el.style.display = "none";
                diffs.push({
                  id: 4,
                  cx: Math.round(eb.x + eb.width / 2),
                  cy: Math.round(eb.y + eb.height / 2),
                  r: 35,
                  label: "교실 배경 물건이 사라졌어요",
                });
                break;
              }
              count++;
            }
          } catch (e) {}
        }
      }
    }

    // -------------------------------------------------------
    // 차이점 5: character-3 그룹 좌우 반전
    // -------------------------------------------------------
    {
      const g = svg.querySelector("#character-3");
      if (g) {
        try {
          const bb = g.getBBox();
          const cx = bb.x + bb.width / 2;
          const existing = g.getAttribute("transform") || "";
          g.setAttribute("transform", existing + ` translate(${2 * cx}, 0) scale(-1, 1)`);
          diffs.push({
            id: 5,
            cx: Math.round(bb.x + bb.width / 2),
            cy: Math.round(bb.y + bb.height / 2),
            r: 45,
            label: "학생이 반대 방향을 보고 있어요",
          });
        } catch (e) {}
      }
    }

    return { svgHTML: svg.outerHTML, diffs };
  });

  console.log("\n차이점 목록:");
  result.diffs.forEach((d) =>
    console.log(`  #${d.id}: cx:${d.cx}, cy:${d.cy}, r:${d.r} — ${d.label}`)
  );

  if (result.diffs.length < 5) {
    console.warn(`경고: 차이점이 ${result.diffs.length}개만 생성됨 (목표: 5개)`);
  }

  // 수정 SVG 저장
  fs.writeFileSync(`${SCENES_DIR}/classroom-modified.svg`, result.svgHTML);
  console.log("\nclassroom-modified.svg 저장 완료");

  // 수정 스크린샷
  const tmpHtml = `${QA_DIR}/_tmp_classroom_after.html`;
  fs.writeFileSync(
    tmpHtml,
    `<html><body style="margin:0;padding:0;background:#fff;">${result.svgHTML}</body></html>`
  );
  await page.goto(`file://${tmpHtml}`);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${QA_DIR}/classroom-after.png`, fullPage: false });
  fs.unlinkSync(tmpHtml);
  console.log("수정 스크린샷 저장: classroom-after.png");

  await page.close();
  return result.diffs;
}

// ===================================================
// Step 3: 픽셀 검증
// ===================================================
async function renderSvgToPixels(browser, svgPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  const svgContent = fs.readFileSync(svgPath, "utf-8");
  await page.setContent(
    `<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svgContent}</body></html>`,
    { waitUntil: "domcontentloaded" }
  );
  await page.evaluate(() => {
    const bs = document.querySelector("#background-simple");
    if (bs) bs.style.display = "none";
  });
  await new Promise((r) => setTimeout(r, 500));
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return buf;
}

async function comparePixels(origBuf, modBuf) {
  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width,
    h = info.height,
    ch = info.channels;

  const diffMap = new Uint8Array(w * h);
  let totalChanged = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      const dr = Math.abs(origData[idx] - modData[idx]);
      const dg = Math.abs(origData[idx + 1] - modData[idx + 1]);
      const db = Math.abs(origData[idx + 2] - modData[idx + 2]);
      if (dr + dg + db > 30) {
        diffMap[y * w + x] = 1;
        totalChanged++;
      }
    }
  }

  return { diffMap, w, h, totalChanged };
}

function checkDiffArea(diffMap, w, h, diff) {
  // viewBox 0 0 500 500 → 픽셀 좌표 동일
  const px = diff.cx,
    py = diff.cy,
    pr = diff.r;

  let changedInArea = 0;
  let totalInArea = 0;

  for (let y = Math.max(0, py - pr); y < Math.min(h, py + pr); y++) {
    for (let x = Math.max(0, px - pr); x < Math.min(w, px + pr); x++) {
      const dist = Math.hypot(x - px, y - py);
      if (dist <= pr) {
        totalInArea++;
        if (diffMap[y * w + x]) changedInArea++;
      }
    }
  }

  const changeRatio = totalInArea > 0 ? changedInArea / totalInArea : 0;
  return { changedInArea, totalInArea, changeRatio, px, py, pr };
}

async function pixelVerify(browser, diffs) {
  console.log("\n========== 픽셀 검증 ==========");

  const origBuf = await renderSvgToPixels(browser, `${SCENES_DIR}/classroom.svg`);
  const modBuf = await renderSvgToPixels(browser, `${SCENES_DIR}/classroom-modified.svg`);

  const { diffMap, w, h, totalChanged } = await comparePixels(origBuf, modBuf);
  console.log(
    `전체 변경 픽셀: ${totalChanged} / ${w * h} (${((totalChanged / w / h) * 100).toFixed(2)}%)`
  );

  if (totalChanged < 50) {
    console.log("[FAIL] 시각적 변경이 거의 없음!");
    return { pass: false, results: [] };
  }

  let allPass = true;
  const results = [];

  for (const diff of diffs) {
    const res = checkDiffArea(diffMap, w, h, diff);
    const pass = res.changeRatio >= 0.02;
    if (!pass) allPass = false;
    results.push({ ...diff, ...res, pass });
    console.log(
      `  #${diff.id} ${pass ? "OK" : "FAIL"}: ${res.changedInArea}px 변경 (${(res.changeRatio * 100).toFixed(1)}%) — ${diff.label}`
    );
  }

  console.log(`\n결과: ${allPass ? "ALL PASS" : "FAIL"}`);
  return { pass: allPass, results };
}

// ===================================================
// 재시도용: 더 큰 r 또는 다른 요소로 수정
// ===================================================
async function fixAndRetry(browser, failedDiffs, diffs) {
  console.log("\n========== FAIL 항목 수정 ==========");
  const svgPath = `${SCENES_DIR}/classroom.svg`;

  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.goto(`file://${svgPath}`);
  await page.waitForSelector("svg");

  // 재분석: 각 그룹의 모든 요소 정보 수집
  const allElements = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const groups = svg.querySelectorAll("g[id]");
    const result = {};

    for (const g of groups) {
      const id = g.getAttribute("id");
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
      const items = [];
      let idx = 0;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          const area = eb.width * eb.height;
          if (area >= 100) {
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

  console.log("재분석 완료. 그룹별 요소 수:");
  for (const [id, items] of Object.entries(allElements)) {
    console.log(`  #${id}: ${items.length}개 요소`);
    items.slice(0, 5).forEach((it) =>
      console.log(`    idx=${it.idx} cx:${it.cx},cy:${it.cy} ${it.w}x${it.h} area:${it.area}`)
    );
  }

  await page.close();
  return allElements;
}

// ===================================================
// Main
// ===================================================
async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // Step 1: 분석
    await analyzeSvg(browser);

    // Step 2: 변형 SVG 생성
    let diffs = await createModifiedSvg(browser);

    // Step 3: 픽셀 검증
    let verifyResult = await pixelVerify(browser, diffs);

    if (!verifyResult.pass) {
      console.log("\n일부 항목 FAIL — 상세 분석 진행");
      await fixAndRetry(browser, verifyResult.results.filter((r) => !r.pass), diffs);
      console.log("\n수동 수정 후 재실행하거나 r 값을 증가시켜 재검증하세요.");
    }

    // Step 4: 결과 출력
    console.log("\n========== levels.js 추가 항목 ==========\n");
    const entry = {
      id: "classroom",
      title: "교실",
      desc: "교실에서 다른 곳 5개를 찾아보세요",
      difficulty: "보통",
      diffCount: 5,
      originalSvg: "/scenes/classroom.svg",
      modifiedSvg: "/scenes/classroom-modified.svg",
      diffs: diffs,
    };

    const diffsStr = entry.diffs
      .map((d) => `    { id: ${d.id}, cx: ${d.cx}, cy: ${d.cy}, r: ${d.r}, label: "${d.label}" },`)
      .join("\n");

    const output = `{
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

    console.log(output);

    if (verifyResult.pass) {
      console.log("\n모든 차이점 픽셀 검증 통과!");
    } else {
      console.log("\n일부 차이점이 픽셀 검증 미통과. fixAndRetry 정보를 참고해 수정하세요.");
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
