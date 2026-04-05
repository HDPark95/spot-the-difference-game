/**
 * lesson.svg 레벨 생성 스크립트
 * 1. SVG 분석 (g[id] 그룹 열거, 하위 요소 면적 200~4000 열거)
 * 2. 차이점 5개 설계 + 변형 SVG 생성
 * 3. 픽셀 검증 (히트 영역 내 변경 픽셀 비율 2% 이상)
 * 4. 결과 출력
 */
import { createRequire } from "module";
import fs from "fs";

const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const sharp = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/sharp");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCENES_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/public/scenes";
const SVG_PATH = `${SCENES_DIR}/lesson.svg`;
const MODIFIED_SVG_PATH = `${SCENES_DIR}/lesson-modified.svg`;

// ===================================================
// Phase 1: SVG 분석
// ===================================================
async function analyzeSvg(browser) {
  console.log("\n========== Phase 1: SVG 분석 ==========");
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500 });
  await page.goto(`file://${SVG_PATH}`);
  await page.waitForSelector("svg");

  const groups = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const gEls = svg.querySelectorAll("g[id]");
    const result = [];

    for (const g of gEls) {
      const groupId = g.id;
      let groupBBox = null;
      try { groupBBox = g.getBBox(); } catch (e) {}

      const children = g.querySelectorAll("path, polygon, rect, circle, ellipse, line, polyline");
      const elements = [];
      let idx = 0;
      for (const el of children) {
        try {
          const eb = el.getBBox();
          const area = eb.width * eb.height;
          if (area >= 200 && area <= 4000) {
            elements.push({
              idx,
              tag: el.tagName,
              x: Math.round(eb.x),
              y: Math.round(eb.y),
              w: Math.round(eb.width),
              h: Math.round(eb.height),
              cx: Math.round(eb.x + eb.width / 2),
              cy: Math.round(eb.y + eb.height / 2),
              area: Math.round(area),
              fill: el.getAttribute("fill") || el.style.fill || "none",
            });
          }
          idx++;
        } catch (e) {}
      }

      result.push({
        id: groupId,
        bbox: groupBBox ? {
          x: Math.round(groupBBox.x), y: Math.round(groupBBox.y),
          w: Math.round(groupBBox.width), h: Math.round(groupBBox.height)
        } : null,
        elementCount: children.length,
        candidateElements: elements,
      });
    }
    return result;
  });

  console.log("\n그룹 목록:");
  for (const g of groups) {
    const bbox = g.bbox ? `bbox(${g.bbox.x},${g.bbox.y},${g.bbox.w},${g.bbox.h})` : "bbox:없음";
    console.log(`  #${g.id}: 요소 ${g.elementCount}개, ${bbox}`);
    if (g.candidateElements.length > 0) {
      console.log(`    면적 200~4000 후보 (${g.candidateElements.length}개):`);
      for (const el of g.candidateElements.slice(0, 8)) {
        console.log(`      idx=${el.idx}: ${el.tag} cx:${el.cx},cy:${el.cy} area:${el.area} fill:${el.fill}`);
      }
      if (g.candidateElements.length > 8) {
        console.log(`      ... 외 ${g.candidateElements.length - 8}개`);
      }
    }
  }

  await page.close();
  return groups;
}

// ===================================================
// Phase 2: 차이점 5개 적용 + 변형 SVG 생성
// ===================================================
async function createModifiedSvg(browser) {
  console.log("\n========== Phase 2: 변형 SVG 생성 ==========");
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500 });
  await page.goto(`file://${SVG_PATH}`);
  await page.waitForSelector("svg");

  const result = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const diffs = [];

    // ---------------------------------------------------
    // 차이점 1: Blackboard 그룹에서 칠판 내용 요소 제거
    // Blackboard 내 idx=2 (중간 면적 요소) 제거 → 칠판의 글씨/그림 사라짐
    // ---------------------------------------------------
    {
      const g = svg.querySelector("#Blackboard");
      if (g) {
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let count = 0;
        for (const el of els) {
          try {
            const eb = el.getBBox();
            const area = eb.width * eb.height;
            if (area >= 200 && area <= 4000) {
              if (count === 0) {
                el.style.display = "none";
                diffs.push({
                  id: 1,
                  cx: Math.round(eb.x + eb.width / 2),
                  cy: Math.round(eb.y + eb.height / 2),
                  r: 35,
                  label: "칠판의 내용이 사라졌어요",
                });
                break;
              }
              count++;
            }
          } catch (e) {}
        }
      }
    }

    // ---------------------------------------------------
    // 차이점 2: trash-bin 그룹 전체를 오른쪽으로 60px 이동
    // 구조적 변경: 위치 이동 50px+
    // ---------------------------------------------------
    {
      const g = svg.querySelector("#trash-bin");
      if (g) {
        try {
          const bb = g.getBBox();
          const existing = g.getAttribute("transform") || "";
          g.setAttribute("transform", (existing + " translate(60, 0)").trim());
          diffs.push({
            id: 2,
            cx: Math.round(bb.x + bb.width / 2 + 60),
            cy: Math.round(bb.y + bb.height / 2),
            r: 40,
            label: "쓰레기통 위치가 바뀌었어요",
          });
        } catch (e) {}
      }
    }

    // ---------------------------------------------------
    // 차이점 3: character-2 그룹에서 요소 제거 (소품/액세서리)
    // character-2 내 면적 200~4000 인 idx=3 제거
    // ---------------------------------------------------
    {
      const g = svg.querySelector("#character-2");
      if (g) {
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let count = 0;
        for (const el of els) {
          try {
            const eb = el.getBBox();
            const area = eb.width * eb.height;
            if (area >= 200 && area <= 4000) {
              if (count === 3) {
                el.style.display = "none";
                diffs.push({
                  id: 3,
                  cx: Math.round(eb.x + eb.width / 2),
                  cy: Math.round(eb.y + eb.height / 2),
                  r: 35,
                  label: "학생의 소품이 사라졌어요",
                });
                break;
              }
              count++;
            }
          } catch (e) {}
        }
      }
    }

    // ---------------------------------------------------
    // 차이점 4: character-1 그룹에서 요소 제거 (선생님 소품)
    // character-1 내 면적 200~4000 인 idx=2 제거
    // ---------------------------------------------------
    {
      const g = svg.querySelector("#character-1");
      if (g) {
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let count = 0;
        for (const el of els) {
          try {
            const eb = el.getBBox();
            const area = eb.width * eb.height;
            if (area >= 200 && area <= 4000) {
              if (count === 2) {
                el.style.display = "none";
                diffs.push({
                  id: 4,
                  cx: Math.round(eb.x + eb.width / 2),
                  cy: Math.round(eb.y + eb.height / 2),
                  r: 35,
                  label: "선생님의 소품이 사라졌어요",
                });
                break;
              }
              count++;
            }
          } catch (e) {}
        }
      }
    }

    // ---------------------------------------------------
    // 차이점 5: background-complete 그룹에서 요소 제거 (창문/배경 장식)
    // background-complete 내 면적 200~4000 인 idx=5 제거
    // ---------------------------------------------------
    {
      const g = svg.querySelector("#background-complete");
      if (g) {
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
                  r: 35,
                  label: "배경 장식이 사라졌어요",
                });
                break;
              }
              count++;
            }
          } catch (e) {}
        }
      }
    }

    return { svgHTML: svg.outerHTML, diffs };
  });

  console.log("\n적용된 차이점:");
  result.diffs.forEach((d) =>
    console.log(`  #${d.id}: cx:${d.cx}, cy:${d.cy}, r:${d.r} — ${d.label}`)
  );

  if (result.diffs.length < 5) {
    console.log(`\n경고: 차이점이 ${result.diffs.length}개만 적용됨 (5개 필요)`);
  }

  fs.writeFileSync(MODIFIED_SVG_PATH, result.svgHTML);
  console.log(`\nlesson-modified.svg 저장 완료`);

  await page.close();
  return result.diffs;
}

// ===================================================
// Phase 3: 픽셀 검증
// ===================================================
async function renderSvgToBuffer(browser, svgPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500, deviceScaleFactor: 1 });
  const svgContent = fs.readFileSync(svgPath, "utf-8");
  await page.setContent(
    `<html><body style="margin:0;width:500px;height:500px">${svgContent}</body></html>`,
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

async function pixelVerify(browser, diffs) {
  console.log("\n========== Phase 3: 픽셀 검증 ==========");

  const origBuf = await renderSvgToBuffer(browser, SVG_PATH);
  const modBuf = await renderSvgToBuffer(browser, MODIFIED_SVG_PATH);

  const origRaw = await sharp(origBuf).raw().toBuffer({ resolveWithObject: true });
  const modRaw = await sharp(modBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: origData, info } = origRaw;
  const { data: modData } = modRaw;
  const w = info.width, h = info.height, ch = info.channels;

  // diffMap 생성
  const diffMap = new Uint8Array(w * h);
  let totalChanged = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const diff = Math.abs(origData[i] - modData[i]) + Math.abs(origData[i + 1] - modData[i + 1]) + Math.abs(origData[i + 2] - modData[i + 2]);
      if (diff > 30) {
        diffMap[y * w + x] = 1;
        totalChanged++;
      }
    }
  }

  console.log(`\n전체 변경 픽셀: ${totalChanged} / ${w * h} (${((totalChanged / w / h) * 100).toFixed(2)}%)`);

  const results = [];
  let allPass = true;

  for (const diff of diffs) {
    const scaleX = w / 500;
    const scaleY = h / 500;
    const px = Math.round(diff.cx * scaleX);
    const py = Math.round(diff.cy * scaleY);
    const pr = Math.round(diff.r * Math.max(scaleX, scaleY));

    let changedInArea = 0, totalInArea = 0;
    for (let y = Math.max(0, py - pr); y < Math.min(h, py + pr); y++) {
      for (let x = Math.max(0, px - pr); x < Math.min(w, px + pr); x++) {
        if (Math.hypot(x - px, y - py) <= pr) {
          totalInArea++;
          if (diffMap[y * w + x]) changedInArea++;
        }
      }
    }

    const changeRatio = totalInArea > 0 ? changedInArea / totalInArea : 0;
    const pass = changeRatio >= 0.02;
    if (!pass) allPass = false;

    const status = pass ? "PASS" : "FAIL";
    console.log(`  #${diff.id} [${status}]: ${changedInArea}px 변경 (${(changeRatio * 100).toFixed(1)}%) — ${diff.label}`);
    results.push({ ...diff, changeRatio, pass });
  }

  console.log(`\n최종: ${allPass ? "ALL PASS" : "FAIL"}`);
  return { allPass, results };
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
    // Phase 1: 분석
    const groups = await analyzeSvg(browser);

    // Phase 2: 변형 SVG 생성
    let diffs = await createModifiedSvg(browser);

    // Phase 3: 픽셀 검증 (FAIL이면 재시도)
    let verifyResult = await pixelVerify(browser, diffs);

    if (!verifyResult.allPass) {
      console.log("\n========== 검증 실패: 차이점 수정 후 재시도 ==========");

      // FAIL한 차이점들의 r을 50으로 키우고 재검증
      const failedIds = verifyResult.results.filter((r) => !r.pass).map((r) => r.id);
      console.log(`FAIL 차이점 ID: ${failedIds.join(", ")}`);
      console.log("히트박스 r을 50으로 확장하여 재검증...");

      diffs = diffs.map((d) => ({
        ...d,
        r: failedIds.includes(d.id) ? Math.max(d.r, 50) : d.r,
      }));

      verifyResult = await pixelVerify(browser, diffs);
    }

    // Phase 4: 결과 출력
    console.log("\n========== Phase 4: levels.js 추가 항목 ==========\n");

    const entry = {
      id: "lesson",
      title: "수업",
      desc: "교실 수업 장면에서 다른 곳 5개를 찾아보세요",
      difficulty: "어려움",
      diffCount: 5,
      originalSvg: "/scenes/lesson.svg",
      modifiedSvg: "/scenes/lesson-modified.svg",
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

    if (!verifyResult.allPass) {
      console.log("\n경고: 일부 차이점이 픽셀 검증을 통과하지 못했습니다.");
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
