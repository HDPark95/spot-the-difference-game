import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { levels } from "../data/levels";
import GamePanel from "../components/GamePanel";
import styles from "./GamePage.module.css";

export default function GamePage() {
  const { levelId } = useParams();
  const navigate = useNavigate();
  const level = levels.find((l) => l.id === levelId);
  const levelIdx = levels.findIndex((l) => l.id === levelId);
  const nextLevel = levels[levelIdx + 1];

  const [found, setFound] = useState(new Set());
  const [timer, setTimer] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [toast, setToast] = useState(null);
  const [wrongMarks, setWrongMarks] = useState([]);
  const toastTimer = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    setFound(new Set());
    setTimer(0);
    setGameOver(false);
    setHintsLeft(3);
    intervalRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, [levelId]);

  const showToast = useCallback((msg, color) => {
    setToast({ msg, color: color || "rgba(46,204,113,.95)" });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const handleDiffFound = useCallback((diff) => {
    setFound((prev) => {
      const next = new Set(prev);
      next.add(diff.id);
      if (diff.label) showToast("'" + diff.label + "'");
      if (next.size === level.diffs.length) {
        setGameOver(true);
        clearInterval(intervalRef.current);
      }
      return next;
    });
  }, [level, showToast]);

  const handleWrong = useCallback((x, y) => {
    const id = Date.now();
    setWrongMarks((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setWrongMarks((prev) => prev.filter((m) => m.id !== id)), 500);
  }, []);

  const useHint = () => {
    if (gameOver || hintsLeft <= 0) return;
    const remaining = level.diffs.filter((d) => !found.has(d.id));
    if (remaining.length === 0) return;
    setHintsLeft((h) => h - 1);
    const target = remaining[Math.floor(Math.random() * remaining.length)];
    showToast("이 근처를 잘 살펴보세요!", "rgba(245,166,35,.9)");
    // 힌트 깜빡임은 CSS 애니메이션으로 처리 가능
  };

  const showAnswers = () => {
    if (gameOver) return;
    if (!window.confirm("정답을 보시겠습니까?")) return;
    setGameOver(true);
    clearInterval(intervalRef.current);
    const remaining = level.diffs.filter((d) => !found.has(d.id));
    setFound((prev) => {
      const next = new Set(prev);
      remaining.forEach((d) => next.add(d.id));
      return next;
    });
    showToast("모든 정답이 표시되었습니다", "rgba(233,69,96,.9)");
  };

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (!level) return <div className={styles.notFound}>레벨을 찾을 수 없습니다</div>;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{level.title}에서 틀린그림 찾기</h1>

      <div className={styles.statusBar}>
        <span className={styles.item}>
          찾은 개수: <span className={styles.found}>{found.size}</span> / {level.diffs.length}
        </span>
        <span className={styles.item}>
          시간: <span className={styles.timer}>{formatTime(timer)}</span>
        </span>
      </div>

      <div className={styles.toolbar}>
        <Link to="/" className={styles.toolBtn}>목록</Link>
        <button className={`${styles.toolBtn} ${styles.hint}`} onClick={useHint}>
          힌트 ({hintsLeft}회)
        </button>
        <button className={`${styles.toolBtn} ${styles.answer}`} onClick={showAnswers}>
          정답 보기
        </button>
      </div>

      <div className={styles.gameArea}>
        <GamePanel
          svgUrl={level.originalSvg}
          label="A"
          diffs={level.diffs}
          found={found}
          onDiffFound={handleDiffFound}
          onWrong={handleWrong}
        />
        <GamePanel
          svgUrl={level.originalSvg}
          label="B"
          diffs={level.diffs}
          found={found}
          onDiffFound={handleDiffFound}
          onWrong={handleWrong}
          isModified
          applyDiffs={level.applyDiffs}
        />
      </div>

      <div className={styles.progress}>
        {level.diffs.map((d) => (
          <div key={d.id} className={`${styles.dot} ${found.has(d.id) ? styles.dotFound : ""}`}>
            {d.id}
          </div>
        ))}
      </div>

      <div className={styles.credit}>
        Illustration by <a href="https://storyset.com" target="_blank" rel="noreferrer">Storyset</a>
      </div>

      {toast && (
        <div className={styles.toast} style={{ background: toast.color }}>
          {toast.msg}
        </div>
      )}

      {gameOver && found.size === level.diffs.length && (
        <div className={styles.overlay}>
          <div className={styles.clearBox}>
            <h2>축하합니다!</h2>
            <p>모든 차이점을 찾았습니다</p>
            <div className={styles.clearTime}>{formatTime(timer)}</div>
            <div className={styles.clearButtons}>
              <button className={styles.btn} onClick={() => navigate(0)}>다시 하기</button>
              {nextLevel && (
                <button className={`${styles.btn} ${styles.btnNext}`} onClick={() => navigate(`/level/${nextLevel.id}`)}>
                  다음 문제
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
