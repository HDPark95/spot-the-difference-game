import { createRequire } from "module";
import fs from "fs";

const require = createRequire(import.meta.url);
const puppeteer = require("/Users/hyundoopark/workspace/html-to-image-plugin/node_modules/puppeteer-core");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SCENES_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/public/scenes";
const QA_DIR = "/Users/hyundoopark/workspace/spot-the-difference-game/qa-screenshots";
const COMPONENTS_DIR = "/Users/hyundoopark/workspace/html-to-image-plugin/components";

function extractSvgInner(svgPath) {
  const content = fs.readFileSync(svgPath, "utf-8");
  const innerMatch = content.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  if (!innerMatch) return "";
  return innerMatch[1];
}

// ===================================================
// 카페 개편
// SVG viewBox: 0 0 500 500
//
// 차이점 설계:
// 1. menu-board idx=6 (polygon, cx:89,cy:123) 제거 → 메뉴판 커피잔 아이콘
// 2. background-complete idx=15 (병, cx:377,cy:113) 제거 → 선반 위 병
// 3. character-2 idx=11 (가방, cx:393,cy:375) 제거 → 손님 핸드백
// 4. coffee-machine idx=8 (상단 패널, cx:114,cy:193) 색 변경 → 커피머신 상단 패널
// 5. cashier-machine 위치 이동 +20px 오른쪽 → 계산대 위치 변경
// ===================================================
async function revampCafe(browser) {
  console.log("\n========== 카페 레벨 개편 ==========");
  const svgPath = `${SCENES_DIR}/cafe.svg`;
  const svgContent = fs.readFileSync(svgPath, "utf-8");

  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500 });

  // 원본 스크린샷
  await page.goto(`file://${svgPath}`);
  await page.waitForSelector("svg");
  await page.screenshot({ path: `${QA_DIR}/cafe-before.png`, fullPage: false });
  console.log("카페 원본 스크린샷 저장");

  // 변형 적용
  const result = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const diffs = [];

    // 차이점 1: menu-board 내 idx=6 polygon 제거 (메뉴판 커피잔 아이콘)
    {
      const g = svg.querySelector("#menu-board");
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
      let count = 0;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          if (eb.width > 2 && eb.height > 2) {
            if (count === 6) {
              el.style.display = "none";
              diffs.push({ id: 1, cx: Math.round(eb.x + eb.width / 2), cy: Math.round(eb.y + eb.height / 2), r: 22, label: "메뉴판 커피잔 아이콘이 사라졌어요" });
              break;
            }
            count++;
          }
        } catch (e) {}
      }
    }

    // 차이점 2: background-complete 내 선반 위 병(idx=15) 제거
    {
      const g = svg.querySelector("#background-complete");
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
      let count = 0;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          if (eb.width > 2 && eb.height > 2) {
            if (count === 15) {
              el.style.display = "none";
              diffs.push({ id: 2, cx: Math.round(eb.x + eb.width / 2), cy: Math.round(eb.y + eb.height / 2), r: 22, label: "선반 위 병이 사라졌어요" });
              break;
            }
            count++;
          }
        } catch (e) {}
      }
    }

    // 차이점 3: character-2 내 가방(idx=11) 제거
    {
      const g = svg.querySelector("#character-2");
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
      let count = 0;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          if (eb.width > 3 && eb.height > 3 && eb.width < 80 && eb.height < 80) {
            if (count === 11) {
              el.style.display = "none";
              diffs.push({ id: 3, cx: Math.round(eb.x + eb.width / 2), cy: Math.round(eb.y + eb.height / 2), r: 22, label: "손님 핸드백이 사라졌어요" });
              break;
            }
            count++;
          }
        } catch (e) {}
      }
    }

    // 차이점 4: coffee-machine idx=8 상단 패널 색 변경
    {
      const g = svg.querySelector("#coffee-machine");
      const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
      let count = 0;
      for (const el of els) {
        try {
          const eb = el.getBBox();
          if (eb.width > 2 && eb.height > 2) {
            if (count === 8) {
              el.setAttribute("fill", "#C0392B");
              diffs.push({ id: 4, cx: Math.round(eb.x + eb.width / 2), cy: Math.round(eb.y + eb.height / 2), r: 20, label: "커피머신 상단 패널 색이 바뀌었어요" });
              break;
            }
            count++;
          }
        } catch (e) {}
      }
    }

    // 차이점 5: cashier-machine 전체를 오른쪽으로 20px 이동
    {
      const g = svg.querySelector("#cashier-machine");
      if (g) {
        try {
          const bb = g.getBBox();
          const existing = g.getAttribute("transform") || "";
          g.setAttribute("transform", existing + " translate(22, 0)");
          diffs.push({
            id: 5,
            cx: Math.round(bb.x + bb.width / 2 + 11),
            cy: Math.round(bb.y + bb.height / 2),
            r: 28,
            label: "계산대 기계 위치가 바뀌었어요",
          });
        } catch (e) {}
      }
    }

    return { svgHTML: svg.outerHTML, diffs };
  });

  console.log("카페 차이점:");
  result.diffs.forEach((d) => console.log(`  ${d.id}: cx:${d.cx}, cy:${d.cy}, r:${d.r} - ${d.label}`));

  // 수정 SVG 저장
  fs.writeFileSync(`${SCENES_DIR}/cafe-modified.svg`, result.svgHTML);
  console.log("cafe-modified.svg 저장 완료");

  // 수정 스크린샷: 수정된 SVG를 임시 HTML로 감싸서 로드
  const tmpHtmlCafe = `${QA_DIR}/_tmp_cafe_after.html`;
  fs.writeFileSync(tmpHtmlCafe, `<html><body style="margin:0;padding:0;background:#fff;">${result.svgHTML}</body></html>`);
  await page.goto(`file://${tmpHtmlCafe}`);
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: `${QA_DIR}/cafe-after.png`, fullPage: false });
  fs.unlinkSync(tmpHtmlCafe);
  console.log("카페 수정 스크린샷 저장");

  await page.close();
  return result.diffs;
}

// ===================================================
// 거실 개편
// SVG viewBox: 0 0 500 500
// 그룹: background-complete, background-simple, Shadow,
//        Plant(cx:409,cy:339), Character(cx:258,cy:348),
//        Lamps(cx:239,cy:135), Shelf(cx:105,cy:297)
//
// 차이점 설계:
// 1. Shelf idx=15 제거 (북엔드 상단, cx:111,cy:196) → 선반 책 받침대 사라짐
// 2. Shelf idx=18 제거 (북엔드 중단, cx:99,cy:275) → 선반 책 받침대 사라짐
// 3. Plant 그룹 왼쪽으로 20px 이동 → 화분 위치 변경
// 4. Character idx=15 색 변경 (상의 경계, cx:309,cy:326) → 인물 상의 색 변경
// 5. book-1.svg 컴포넌트를 Shelf 위에 추가 → 책 추가
// ===================================================
async function revampLivingroom(browser) {
  console.log("\n========== 거실 레벨 개편 ==========");
  const svgPath = `${SCENES_DIR}/livingroom.svg`;
  const svgContent = fs.readFileSync(svgPath, "utf-8");
  const bookInner = extractSvgInner(`${COMPONENTS_DIR}/furniture/book-1.svg`);

  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500 });

  // 원본 스크린샷
  await page.goto(`file://${svgPath}`);
  await page.waitForSelector("svg");
  await page.screenshot({ path: `${QA_DIR}/livingroom-before.png`, fullPage: false });
  console.log("거실 원본 스크린샷 저장");

  const result = await page.evaluate(
    (bookInner) => {
      const svg = document.querySelector("svg");
      const diffs = [];

      // 차이점 1: Shelf idx=15 (북엔드 상단 polygon) 제거
      {
        const g = svg.querySelector("#Shelf");
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let count = 0;
        for (const el of els) {
          try {
            const eb = el.getBBox();
            if (eb.width > 2 && eb.height > 2) {
              if (count === 15) {
                el.style.display = "none";
                diffs.push({ id: 1, cx: Math.round(eb.x + eb.width / 2), cy: Math.round(eb.y + eb.height / 2), r: 22, label: "선반 상단 책 받침대가 사라졌어요" });
                break;
              }
              count++;
            }
          } catch (e) {}
        }
      }

      // 차이점 2: Shelf idx=18 (북엔드 중단 polygon) 제거
      {
        const g = svg.querySelector("#Shelf");
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let count = 0;
        for (const el of els) {
          try {
            const eb = el.getBBox();
            if (eb.width > 2 && eb.height > 2) {
              if (count === 18) {
                el.style.display = "none";
                diffs.push({ id: 2, cx: Math.round(eb.x + eb.width / 2), cy: Math.round(eb.y + eb.height / 2), r: 22, label: "선반 중단 책 받침대가 사라졌어요" });
                break;
              }
              count++;
            }
          } catch (e) {}
        }
      }

      // 차이점 3: Plant 그룹 왼쪽으로 20px 이동
      {
        const g = svg.querySelector("#Plant");
        if (g) {
          try {
            const bb = g.getBBox();
            const existing = g.getAttribute("transform") || "";
            g.setAttribute("transform", existing + " translate(-22, 0)");
            diffs.push({
              id: 3,
              cx: Math.round(bb.x + bb.width / 2 - 11),
              cy: Math.round(bb.y + bb.height / 2),
              r: 28,
              label: "화분 위치가 바뀌었어요",
            });
          } catch (e) {}
        }
      }

      // 차이점 4: Character idx=15 (상의 상단 경계선) 색 변경
      {
        const g = svg.querySelector("#Character");
        const els = g.querySelectorAll("path, polygon, rect, circle, ellipse");
        let count = 0;
        for (const el of els) {
          try {
            const eb = el.getBBox();
            if (eb.width > 2 && eb.height > 2) {
              if (count === 15) {
                el.setAttribute("fill", "#E67E22");
                diffs.push({ id: 4, cx: Math.round(eb.x + eb.width / 2), cy: Math.round(eb.y + eb.height / 2), r: 22, label: "인물 상의 색이 바뀌었어요" });
                break;
              }
              count++;
            }
          } catch (e) {}
        }
      }

      // 차이점 5: Shelf 위 빈 공간에 책 컴포넌트 추가
      // Shelf는 x:69~142, y:178~415, 선반 상단 영역(y:178~210)에 책 삽입
      // book-1.svg viewBox: 0 0 32 32 → scale(0.9)하면 약 29x29px, 선반 위(y:185 부근)에 배치
      {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // Shelf 상단 왼쪽에 책 추가: x=72, y=178, scale=0.9 (32*0.9=28.8px)
        g.setAttribute("transform", "translate(72, 178) scale(0.9)");
        g.setAttribute("id", "added-book-diff5");
        g.innerHTML = bookInner;
        svg.appendChild(g);

        diffs.push({
          id: 5,
          cx: 72 + Math.round(32 * 0.9 / 2),
          cy: 178 + Math.round(32 * 0.9 / 2),
          r: 22,
          label: "선반 위에 책이 생겼어요",
        });
      }

      return { svgHTML: svg.outerHTML, diffs };
    },
    bookInner
  );

  console.log("거실 차이점:");
  result.diffs.forEach((d) => console.log(`  ${d.id}: cx:${d.cx}, cy:${d.cy}, r:${d.r} - ${d.label}`));

  fs.writeFileSync(`${SCENES_DIR}/livingroom-modified.svg`, result.svgHTML);
  console.log("livingroom-modified.svg 저장 완료");

  // 수정 스크린샷: 수정된 SVG를 임시 HTML로 감싸서 로드
  const tmpHtmlLR = `${QA_DIR}/_tmp_livingroom_after.html`;
  fs.writeFileSync(tmpHtmlLR, `<html><body style="margin:0;padding:0;background:#fff;">${result.svgHTML}</body></html>`);
  await page.goto(`file://${tmpHtmlLR}`);
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: `${QA_DIR}/livingroom-after.png`, fullPage: false });
  fs.unlinkSync(tmpHtmlLR);
  console.log("거실 수정 스크린샷 저장");

  await page.close();
  return result.diffs;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const cafeDiffs = await revampCafe(browser);
    const livingroomDiffs = await revampLivingroom(browser);

    console.log("\n========== levels.js 항목 ==========\n");

    const cafeEntry = {
      id: "cafe",
      title: "카페",
      desc: "아늑한 카페에서 다른 곳 5개를 찾아보세요",
      difficulty: "쉬움",
      diffCount: 5,
      originalSvg: "/scenes/cafe.svg",
      modifiedSvg: "/scenes/cafe-modified.svg",
      diffs: cafeDiffs,
    };

    const livingroomEntry = {
      id: "livingroom",
      title: "거실",
      desc: "편안한 거실에서 다른 곳 5개를 찾아보세요",
      difficulty: "보통",
      diffCount: 5,
      originalSvg: "/scenes/livingroom.svg",
      modifiedSvg: "/scenes/livingroom-modified.svg",
      diffs: livingroomDiffs,
    };

    const formatEntry = (entry) => {
      const diffsStr = entry.diffs
        .map((d) => `    { id: ${d.id}, cx: ${d.cx}, cy: ${d.cy}, r: ${d.r}, label: "${d.label}" },`)
        .join("\n");
      return `{
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
    };

    console.log("// 카페 레벨");
    console.log(formatEntry(cafeEntry));
    console.log("\n// 거실 레벨");
    console.log(formatEntry(livingroomEntry));
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
