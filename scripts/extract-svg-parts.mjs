/**
 * SVG 원본 파일에서 특정 부분 추출
 */
import fs from "fs";
import path from "path";

const PROJECT = "/Users/hyundoopark/workspace/spot-the-difference-game";

function extractSvgPart(svgPath, searchTerms) {
  const content = fs.readFileSync(path.join(PROJECT, "public", svgPath), "utf-8");

  // SVG는 한 줄이므로 id 기반으로 g 그룹 추출
  for (const term of searchTerms) {
    const idx = content.indexOf(term);
    if (idx >= 0) {
      console.log(`Found "${term}" at index ${idx}`);
      // 앞뒤 200자
      const start = Math.max(0, idx - 50);
      const end = Math.min(content.length, idx + 300);
      console.log(`  ...${content.slice(start, end)}...`);
      console.log("");
    } else {
      console.log(`"${term}" NOT FOUND`);
    }
  }
}

// 카페 SVG 분석 - Counter 내부 구조와 선반 위 병
console.log("\n=== 카페 원본 Counter ===");
const cafeContent = fs.readFileSync(path.join(PROJECT, "public/scenes/cafe.svg"), "utf-8");
const counterIdx = cafeContent.indexOf('id="Counter"');
if (counterIdx >= 0) {
  // Counter 그룹 찾기
  const start = counterIdx - 10;
  // 닫히는 </g> 찾기 (간단하게 2000자 추출)
  console.log(cafeContent.slice(start, start + 3000));
}

console.log("\n=== 카페 변형 Counter ===");
const cafeMContent = fs.readFileSync(path.join(PROJECT, "public/scenes/cafe-modified.svg"), "utf-8");
const counterMIdx = cafeMContent.indexOf('id="Counter"');
if (counterMIdx >= 0) {
  const start = counterMIdx - 10;
  console.log(cafeMContent.slice(start, start + 3000));
}

// 카페 background-complete에서 병 관련 요소 (cy~113-116 영역)
console.log("\n=== 카페 원본에서 cy~113 영역 병 요소 ===");
const bgIdx = cafeContent.indexOf('id="background-complete"');
if (bgIdx >= 0) {
  const bgSection = cafeContent.slice(bgIdx, bgIdx + 5000);
  // 선반 위 병 그룹 찾기 - path cx:377 cy:113
  console.log(bgSection.slice(0, 3000));
}
