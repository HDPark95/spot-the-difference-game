import { useRef, useEffect, useState } from "react";
import styles from "./GamePanel.module.css";

export default function GamePanel({ svgUrl, label, diffs, found, onDiffFound, onWrong, applyDiffs, isModified }) {
  const containerRef = useRef(null);
  const [svgLoaded, setSvgLoaded] = useState(false);

  useEffect(() => {
    fetch(svgUrl)
      .then((r) => r.text())
      .then((svgText) => {
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = svgText;
        const svg = container.querySelector("svg");
        if (svg) {
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.style.width = "100%";
          svg.style.height = "auto";
          svg.style.display = "block";
          // background-simple 숨기기
          const bgSimple = svg.querySelector("#background-simple");
          if (bgSimple) bgSimple.style.display = "none";

          // B 패널이면 변형 적용
          if (isModified && applyDiffs) {
            applyDiffs(svg);
          }
        }
        setSvgLoaded(true);
      });
  }, [svgUrl, isModified, applyDiffs]);

  const handleClick = (e) => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) || [0, 0, 500, 500];
    const vw = viewBox[2], vh = viewBox[3];
    const vx = ((e.clientX - rect.left) / rect.width) * vw;
    const vy = ((e.clientY - rect.top) / rect.height) * vh;

    let hit = null, hitDist = Infinity;
    for (const d of diffs) {
      if (found.has(d.id)) continue;
      const dist = Math.hypot(vx - d.cx, vy - d.cy);
      if (dist <= d.r && dist < hitDist) { hit = d; hitDist = dist; }
    }

    if (hit) {
      onDiffFound(hit);
    } else {
      onWrong(e.clientX - rect.left, e.clientY - rect.top);
    }
  };

  return (
    <div className={styles.panel} onClick={handleClick}>
      <div className={styles.label}>{label}</div>
      <div ref={containerRef} className={styles.svgContainer} />
      {/* 정답 원 */}
      {svgLoaded && [...found].map((fid) => {
        const d = diffs.find((x) => x.id === fid);
        if (!d) return null;
        const svg = containerRef.current?.querySelector("svg");
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        const parentRect = containerRef.current.getBoundingClientRect();
        const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) || [0, 0, 500, 500];
        const sx = rect.width / viewBox[2], sy = rect.height / viewBox[3];
        const sz = d.r * 2 * sx;
        return (
          <div key={fid} className={styles.foundCircle} style={{
            width: sz, height: sz,
            left: d.cx * sx - sz / 2 + (rect.left - parentRect.left),
            top: d.cy * sy - sz / 2 + (rect.top - parentRect.top),
          }} />
        );
      })}
    </div>
  );
}
