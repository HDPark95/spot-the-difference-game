import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { levels } from "../data/levels";
import styles from "./HomePage.module.css";

function LevelCard({ level }) {
  const thumbRef = useRef(null);

  useEffect(() => {
    fetch(level.originalSvg)
      .then((r) => r.text())
      .then((svgText) => {
        const el = thumbRef.current;
        if (!el) return;
        el.innerHTML = svgText;
        const svg = el.querySelector("svg");
        if (svg) {
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.style.width = "100%";
          svg.style.height = "100%";
          svg.style.objectFit = "cover";
          const bgSimple = svg.querySelector("#background-simple");
          if (bgSimple) bgSimple.style.display = "none";
        }
      });
  }, [level.originalSvg]);

  return (
    <Link to={`/level/${level.id}`} className={styles.card}>
      <div className={styles.cardThumb}>
        <div ref={thumbRef} className={styles.thumbSvg} />
        <div className={styles.badge}>{level.difficulty}</div>
      </div>
      <div className={styles.cardInfo}>
        <div className={styles.cardTitle}>{level.title}</div>
        <div className={styles.cardDesc}>{level.desc}</div>
        <div className={styles.cardMeta}>
          <span>차이점 {level.diffCount}개</span>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>틀린그림 찾기</h1>
      <p className={styles.subtitle}>두 그림에서 다른 곳을 찾아보세요</p>

      <div className={styles.levels}>
        {levels.map((level) => (
          <LevelCard key={level.id} level={level} />
        ))}
      </div>

      <div className={styles.footer}>
        Illustration by <a href="https://storyset.com" target="_blank" rel="noreferrer">Storyset</a>
      </div>
    </div>
  );
}
