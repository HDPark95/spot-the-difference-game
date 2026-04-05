export const levels = [
  {
    id: "cafe",
    title: "카페",
    desc: "아늑한 카페에서 다른 곳 5개를 찾아보세요",
    difficulty: "쉬움",
    diffCount: 5,
    originalSvg: "/scenes/cafe.svg",
    diffs: [
      { id: 1, cx: 89, cy: 123, r: 20, label: "메뉴판 커피잔 아이콘 색이 바뀌었어요" },
      { id: 2, cx: 114, cy: 193, r: 22, label: "커피머신 상단 색이 바뀌었어요" },
      { id: 3, cx: 425, cy: 117, r: 18, label: "선반 위 병이 사라졌어요" },
      { id: 4, cx: 389, cy: 240, r: 18, label: "손님의 가방이 사라졌어요" },
      { id: 5, cx: 191, cy: 122, r: 18, label: "메뉴판 커피 아이콘이 사라졌어요" },
    ],
    // Puppeteer page.evaluate 안에서 실행할 변형 로직
    applyDiffs: (svg) => {
      // 1. 메뉴보드 왼쪽 커피잔 아이콘 파랑→빨강
      svg.querySelectorAll("#menu-board polygon").forEach((p) => {
        const s = p.getAttribute("style") || "";
        if (s.includes("#407BFF")) {
          const bb = p.getBBox();
          if (bb.x > 70 && bb.x < 100 && bb.y > 100 && bb.y < 140)
            p.setAttribute("style", s.replace(/#407BFF/g, "#E74C3C"));
        }
      });
      // 2. 커피머신 상단 파란 라인 → 초록
      svg.querySelectorAll("#coffee-machine path").forEach((p) => {
        const s = p.getAttribute("style") || "";
        const bb = p.getBBox();
        if (s.includes("#407BFF") && bb.y < 200 && bb.height < 20)
          p.setAttribute("style", s.replace(/#407BFF/g, "#27AE60"));
      });
      // 3. 선반 위 병 제거
      let removed = 0;
      svg.querySelectorAll("#background-complete path, #background-complete polygon").forEach((p) => {
        const bb = p.getBBox();
        if (bb.x > 410 && bb.x < 445 && bb.y > 100 && bb.y < 135 && removed < 3) {
          p.style.display = "none";
          removed++;
        }
      });
      // 4. 손님 가방 제거
      svg.querySelectorAll("#character-2 path").forEach((p) => {
        const s = p.getAttribute("style") || "";
        const bb = p.getBBox();
        if (s.includes("#263238") && bb.x > 375 && bb.x < 405 && bb.y > 220 && bb.y < 260 && bb.width < 25)
          p.style.display = "none";
      });
      // 5. 메뉴보드 오른쪽 커피 아이콘 제거
      svg.querySelectorAll("#menu-board path").forEach((p) => {
        const bb = p.getBBox();
        if (bb.x > 170 && bb.x < 210 && bb.y > 110 && bb.y < 140 && bb.width < 30)
          p.style.display = "none";
      });
    },
  },
  {
    id: "livingroom",
    title: "거실",
    desc: "편안한 거실에서 다른 곳 5개를 찾아보세요",
    difficulty: "보통",
    diffCount: 5,
    originalSvg: "/scenes/livingroom.svg",
    diffs: [
      { id: 1, cx: 250, cy: 150, r: 22, label: "커튼 색이 바뀌었어요" },
      { id: 2, cx: 400, cy: 200, r: 20, label: "액자가 사라졌어요" },
      { id: 3, cx: 150, cy: 350, r: 22, label: "쿠션 색이 바뀌었어요" },
      { id: 4, cx: 350, cy: 380, r: 20, label: "화분이 사라졌어요" },
      { id: 5, cx: 100, cy: 250, r: 18, label: "책장의 책 색이 바뀌었어요" },
    ],
    applyDiffs: (svg) => {
      // 거실 SVG 변형 - 그룹 ID에 따라 하위 요소 변경
      const groups = svg.querySelectorAll("g[id]");
      groups.forEach((g) => {
        const id = g.id;
        const paths = g.querySelectorAll("path, rect, polygon, ellipse");
        paths.forEach((p) => {
          const s = p.getAttribute("style") || "";
          const bb = p.getBBox();
          // 색상 기반 작은 변경
          if (s.includes("#407BFF") && bb.width < 40 && bb.height < 40) {
            p.setAttribute("style", s.replace(/#407BFF/g, "#E74C3C"));
          }
        });
      });
      // 작은 장식 요소 제거
      let removed = 0;
      svg.querySelectorAll("path, rect").forEach((p) => {
        const bb = p.getBBox();
        const s = p.getAttribute("style") || "";
        if (bb.width > 10 && bb.width < 30 && bb.height > 10 && bb.height < 30 && removed < 2) {
          if (bb.x > 350 && bb.y > 150 && bb.y < 300) {
            p.style.display = "none";
            removed++;
          }
        }
      });
    },
  },
  {
    id: "coffee",
    title: "커피 타임",
    desc: "즐거운 커피 타임! 다른 곳 5개를 찾아보세요",
    difficulty: "보통",
    diffCount: 5,
    originalSvg: "/scenes/coffee.svg",
    diffs: [
      { id: 1, cx: 240, cy: 234, r: 20, label: "접시 위 케이크가 바뀌었어요" },
      { id: 2, cx: 387, cy: 255, r: 22, label: "의자 색이 바뀌었어요" },
      { id: 3, cx: 141, cy: 170, r: 20, label: "컵 색이 바뀌었어요" },
      { id: 4, cx: 300, cy: 280, r: 18, label: "포크가 사라졌어요" },
      { id: 5, cx: 370, cy: 170, r: 20, label: "손 위치가 바뀌었어요" },
    ],
    applyDiffs: (svg) => {
      // 의자 색 변경 (작은 하위 요소)
      svg.querySelectorAll("#Chair path, #Chair polygon, #Chair rect").forEach((p) => {
        const s = p.getAttribute("style") || "";
        const bb = p.getBBox();
        if (s.includes("#BA68C8") && bb.width < 50 && bb.height < 30) {
          p.setAttribute("style", s.replace(/#BA68C8/g, "#E67E22"));
        }
      });
      // 테이블 위 작은 요소 변경
      svg.querySelectorAll("#Table path, #Table polygon").forEach((p) => {
        const s = p.getAttribute("style") || "";
        const bb = p.getBBox();
        if (bb.width < 20 && bb.height < 20 && bb.x > 270 && bb.y > 260) {
          p.style.display = "none";
        }
      });
      // 컵 색 변경
      svg.querySelectorAll("#character-1 path").forEach((p) => {
        const s = p.getAttribute("style") || "";
        const bb = p.getBBox();
        if (s.includes("#BA68C8") && bb.width < 25 && bb.y < 180) {
          p.setAttribute("style", s.replace(/#BA68C8/g, "#3498DB"));
        }
      });
    },
  },
];
