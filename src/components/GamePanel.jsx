import { useRef, useEffect, useState } from "react";
import styles from "./GamePanel.module.css";

export default function GamePanel({ svgUrl, label, diffs, found, hintTarget, onDiffFound, onWrong }) {
  const containerRef = useRef(null);
  const [svgLoaded, setSvgLoaded] = useState(false);
  const [viewBox, setViewBox] = useState([0, 0, 500, 500]);

  useEffect(() => {
    setSvgLoaded(false);
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
          const vb = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) || [0, 0, 500, 500];
          setViewBox(vb);
          const bgSimple = svg.querySelector("#background-simple");
          if (bgSimple) bgSimple.style.display = "none";
        }
        setSvgLoaded(true);
      });
  }, [svgUrl]);

  const handleClick = (e) => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
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
      const pr = containerRef.current.getBoundingClientRect();
      onWrong(e.clientX - pr.left, e.clientY - pr.top);
    }
  };

  const getCircleStyle = (d) => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return {};
    const rect = svg.getBoundingClientRect();
    const parentRect = containerRef.current.getBoundingClientRect();
    const sx = rect.width / viewBox[2], sy = rect.height / viewBox[3];
    const sz = d.r * 2 * sx;
    return {
      width: sz, height: sz,
      left: d.cx * sx - sz / 2 + (rect.left - parentRect.left),
      top: d.cy * sy - sz / 2 + (rect.top - parentRect.top),
    };
  };

  return (
    <div className={styles.panel} onClick={handleClick}>
      <div className={styles.label}>{label}</div>
      <div ref={containerRef} className={styles.svgContainer} />
      {svgLoaded && [...found].map((fid) => {
        const d = diffs.find((x) => x.id === fid);
        if (!d) return null;
        return <div key={fid} className={styles.foundCircle} style={getCircleStyle(d)} />;
      })}
      {svgLoaded && hintTarget && (
        <div className={styles.hintPulse} style={getCircleStyle({ ...hintTarget, r: hintTarget.r * 1.3 })} />
      )}
    </div>
  );
}
