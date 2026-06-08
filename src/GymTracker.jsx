import { useState, useEffect, useMemo } from "react";

// ─── DATA ───────────────────────────────────────────────────────────────────

const DAY_SPLITS = {
  Push: {
    emoji: "🔴", color: "#FF4D4D",
    exercises: ["Bench Press","Incline Dumbbell Press","Shoulder Press","Lateral Raises","Tricep Pushdown","Overhead Tricep Extension","Cable Flyes"]
  },
  Pull: {
    emoji: "🔵", color: "#4D9EFF",
    exercises: ["Deadlift","Pull-Ups","Barbell Row","Seated Cable Row","Face Pulls","Bicep Curls","Hammer Curls","Lat Pulldown"]
  },
  Legs: {
    emoji: "🟢", color: "#4DCC88",
    exercises: ["Squats","Leg Press","Romanian Deadlift","Leg Curl","Leg Extension","Calf Raises","Lunges","Hip Thrust"]
  },
  Rest: { emoji: "⚪", color: "#888", exercises: [] }
};

const WEEK_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DEFAULT_SCHEDULE = ["Push","Pull","Legs","Rest","Push","Pull","Rest"];
const empty3Sets = () => [{reps:"",weight:""},{reps:"",weight:""},{reps:"",weight:""}];

function todayKey() { return new Date().toISOString().split("T")[0]; }
function loadStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

// ─── STATS HELPERS ──────────────────────────────────────────────────────────

function computeStats(logs) {
  const allSessions = Object.values(logs).flat();
  const totalWorkouts = allSessions.length;

  // Per-type counts
  const byType = {};
  allSessions.forEach(s => { byType[s.type] = (byType[s.type] || 0) + 1; });

  // Per-exercise: best set (max weight × reps = volume), total sets, total volume
  const exStats = {};
  allSessions.forEach(s => {
    s.exercises.forEach(ex => {
      if (!exStats[ex.name]) exStats[ex.name] = { totalSets: 0, totalVol: 0, bestWeight: 0, bestReps: 0, bestVol: 0 };
      const e = exStats[ex.name];
      ex.sets.forEach(set => {
        const w = parseFloat(set.weight) || 0;
        const r = parseFloat(set.reps) || 0;
        if (w === 0 && r === 0) return;
        e.totalSets++;
        e.totalVol += w * r;
        const vol = w * r;
        if (vol > e.bestVol) { e.bestVol = vol; e.bestWeight = w; e.bestReps = r; }
      });
    });
  });

  // Total volume lifted (kg)
  const totalVolume = Object.values(exStats).reduce((a, e) => a + e.totalVol, 0);

  // Top 5 exercises by total sets
  const topExercises = Object.entries(exStats)
    .sort((a, b) => b[1].totalSets - a[1].totalSets)
    .slice(0, 5);

  // Weekly streak (consecutive weeks with ≥ 3 workouts)
  const dates = Object.keys(logs).sort();
  let streak = 0;
  if (dates.length) {
    const weeks = new Set(dates.map(d => {
      const dt = new Date(d);
      const jan1 = new Date(dt.getFullYear(), 0, 1);
      return dt.getFullYear() + "-W" + Math.ceil(((dt - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    }));
    streak = weeks.size; // simplified: unique active weeks
  }

  // This week's workouts
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const thisWeek = Object.keys(logs).filter(d => new Date(d) >= weekStart).reduce((a, d) => a + logs[d].length, 0);

  return { totalWorkouts, totalVolume, byType, topExercises, streak, thisWeek, exStats };
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function GymTracker() {
  const [screen, setScreen] = useState("home");
  const [schedule, setSchedule] = useState(() => loadStorage("gt_schedule", DEFAULT_SCHEDULE));
  const [logs, setLogs] = useState(() => loadStorage("gt_logs", {}));
  const [workoutSession, setWorkoutSession] = useState(null);
  const [customExercise, setCustomExercise] = useState("");
  const [editScheduleDay, setEditScheduleDay] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { localStorage.setItem("gt_schedule", JSON.stringify(schedule)); }, [schedule]);
  useEffect(() => { localStorage.setItem("gt_logs", JSON.stringify(logs)); }, [logs]);

  const stats = useMemo(() => computeStats(logs), [logs]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200); }

  const todayDayIndex = (new Date().getDay() + 6) % 7;
  const todayType = schedule[todayDayIndex];
  const todayConfig = DAY_SPLITS[todayType];
  const allLogDates = Object.keys(logs).sort().reverse();

  function startWorkout(dayIndex) {
    const type = schedule[dayIndex];
    if (type === "Rest") return showToast("It's a rest day! 💤");
    setWorkoutSession({ date: todayKey(), dayIndex, type, exercises: [] });
    setScreen("log");
  }

  function addExercise(name) {
    if (!name.trim()) return;
    setWorkoutSession(s => ({ ...s, exercises: [...s.exercises, { name: name.trim(), sets: empty3Sets() }] }));
    setCustomExercise("");
  }

  function updateSet(exIdx, setIdx, field, val) {
    setWorkoutSession(s => ({
      ...s,
      exercises: s.exercises.map((ex, i) =>
        i !== exIdx ? ex : { ...ex, sets: ex.sets.map((set, j) => j === setIdx ? { ...set, [field]: val } : set) }
      )
    }));
  }

  function addSet(exIdx) {
    setWorkoutSession(s => ({
      ...s,
      exercises: s.exercises.map((ex, i) =>
        i === exIdx ? { ...ex, sets: [...ex.sets, { reps: "", weight: "" }] } : ex
      )
    }));
  }

  function removeExercise(exIdx) {
    setWorkoutSession(s => ({ ...s, exercises: s.exercises.filter((_, i) => i !== exIdx) }));
  }

  function finishWorkout() {
    if (!workoutSession.exercises.length) return showToast("Add at least one exercise!");
    const key = workoutSession.date;
    setLogs(l => ({ ...l, [key]: [...(l[key] || []), workoutSession] }));
    setWorkoutSession(null);
    setScreen("home");
    showToast("Workout saved! 💪");
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div style={S.root}>
      <style>{css}</style>
      {toast && <div style={S.toast}>{toast}</div>}

      {/* ── HOME ── */}
      {screen === "home" && (
        <div style={S.screen}>
          <div style={S.header}>
            <div>
              <div style={S.greeting}>Today</div>
              <div style={{ ...S.dayBadge, background: todayConfig.color }}>{todayConfig.emoji} {todayType} Day</div>
            </div>
            <button style={S.iconBtn} onClick={() => setScreen("schedule")}>⚙️</button>
          </div>

          <div style={S.weekStrip}>
            {WEEK_DAYS.map((d, i) => {
              const cfg = DAY_SPLITS[schedule[i]];
              const isToday = i === todayDayIndex;
              return (
                <button key={i} style={{ ...S.dayChip, borderColor: isToday ? cfg.color : "transparent", background: isToday ? cfg.color + "22" : "#1a1a2e" }} onClick={() => startWorkout(i)}>
                  <span style={S.dayChipLabel}>{d}</span>
                  <span style={S.dayChipEmoji}>{cfg.emoji}</span>
                </button>
              );
            })}
          </div>

          {todayType !== "Rest" ? (
            <button style={{ ...S.bigBtn, background: todayConfig.color }} onClick={() => startWorkout(todayDayIndex)}>
              Start {todayType} Workout →
            </button>
          ) : (
            <div style={S.restCard}><div style={{ fontSize: 40 }}>😴</div><div style={{ color: "#aaa", marginTop: 8 }}>Rest & recover today</div></div>
          )}

          {/* Quick stats strip */}
          <div style={S.quickStats}>
            <div style={S.qStat}><span style={S.qVal}>{stats.totalWorkouts}</span><span style={S.qLabel}>Workouts</span></div>
            <div style={S.qDivider} />
            <div style={S.qStat}><span style={S.qVal}>{stats.thisWeek}</span><span style={S.qLabel}>This Week</span></div>
            <div style={S.qDivider} />
            <div style={S.qStat}><span style={S.qVal}>{stats.totalVolume >= 1000 ? (stats.totalVolume/1000).toFixed(1)+"t" : Math.round(stats.totalVolume)+"kg"}</span><span style={S.qLabel}>Total Vol</span></div>
            <div style={S.qDivider} />
            <div style={S.qStat}><span style={S.qVal}>{stats.streak}</span><span style={S.qLabel}>Wks Active</span></div>
          </div>

          <div style={S.sectionTitle}>Recent Workouts</div>
          {allLogDates.length === 0 && <div style={S.emptyState}>No workouts yet. Get started! 🏋️</div>}
          {allLogDates.slice(0, 5).map(date => (
            <button key={date} style={S.logCard} onClick={() => setScreen("history")}>
              <div style={S.logCardDate}>{date}</div>
              <div style={S.logCardMeta}>{logs[date].map(s => s.type).join(", ")} · {logs[date].reduce((a, s) => a + s.exercises.length, 0)} exercises</div>
              <span style={S.chevron}>›</span>
            </button>
          ))}
          {allLogDates.length > 5 && <button style={S.textBtn} onClick={() => setScreen("history")}>View all history →</button>}
        </div>
      )}

      {/* ── LOG WORKOUT ── */}
      {screen === "log" && workoutSession && (() => {
        const cfg = DAY_SPLITS[workoutSession.type];
        return (
          <div style={S.screen}>
            <div style={S.header}>
              <button style={S.backBtn} onClick={() => { setWorkoutSession(null); setScreen("home"); }}>‹</button>
              <div style={{ ...S.dayBadge, background: cfg.color }}>{cfg.emoji} {workoutSession.type}</div>
              <button style={{ ...S.iconBtn, background: "#4DCC88", color: "#000" }} onClick={finishWorkout}>Done ✓</button>
            </div>

            {workoutSession.exercises.map((ex, exIdx) => {
              const pr = stats.exStats[ex.name];
              return (
                <div key={exIdx} style={S.exCard}>
                  <div style={S.exHeader}>
                    <div>
                      <span style={S.exName}>{ex.name}</span>
                      {pr && pr.bestWeight > 0 && (
                        <span style={{ ...S.prBadge, color: cfg.color }}>PR {pr.bestWeight}kg × {pr.bestReps}</span>
                      )}
                    </div>
                    <button style={S.removeBtn} onClick={() => removeExercise(exIdx)}>✕</button>
                  </div>
                  <div style={S.setsHeader}>
                    <span style={S.setCol}>#</span>
                    <span style={S.setCol}>Weight (kg)</span>
                    <span style={S.setCol}>Reps</span>
                  </div>
                  {ex.sets.map((set, sIdx) => (
                    <div key={sIdx} style={S.setRow}>
                      <span style={{ ...S.setCol, color: cfg.color, fontWeight: 700 }}>{sIdx + 1}</span>
                      <input style={S.setInput} type="number" inputMode="decimal" placeholder="kg" value={set.weight} onChange={e => updateSet(exIdx, sIdx, "weight", e.target.value)} />
                      <input style={S.setInput} type="number" inputMode="numeric" placeholder="reps" value={set.reps} onChange={e => updateSet(exIdx, sIdx, "reps", e.target.value)} />
                    </div>
                  ))}
                  <button style={{ ...S.addSetBtn, color: cfg.color }} onClick={() => addSet(exIdx)}>+ Add Set</button>
                </div>
              );
            })}

            <div style={S.sectionTitle}>Add Exercise</div>
            <div style={S.presetGrid}>
              {cfg.exercises.map(name => (
                <button key={name} style={{ ...S.presetBtn, opacity: workoutSession.exercises.find(e => e.name === name) ? 0.4 : 1 }} onClick={() => addExercise(name)}>{name}</button>
              ))}
            </div>
            <div style={S.customRow}>
              <input style={S.customInput} placeholder="Custom exercise…" value={customExercise} onChange={e => setCustomExercise(e.target.value)} onKeyDown={e => e.key === "Enter" && addExercise(customExercise)} />
              <button style={{ ...S.iconBtn, background: cfg.color, color: "#000" }} onClick={() => addExercise(customExercise)}>+</button>
            </div>
            <button style={{ ...S.bigBtn, background: cfg.color, marginTop: 20 }} onClick={finishWorkout}>💾 Save Workout</button>
          </div>
        );
      })()}

      {/* ── STATS ── */}
      {screen === "stats" && (
        <div style={S.screen}>
          <div style={S.header}>
            <button style={S.backBtn} onClick={() => setScreen("home")}>‹</button>
            <div style={S.screenTitle}>Summary</div>
            <div />
          </div>

          {stats.totalWorkouts === 0 ? (
            <div style={S.emptyState}>Log your first workout to see stats! 🏋️</div>
          ) : (
            <>
              {/* Big KPI cards */}
              <div style={S.kpiGrid}>
                <div style={S.kpiCard}>
                  <div style={{ ...S.kpiVal, color: "#FF4D4D" }}>{stats.totalWorkouts}</div>
                  <div style={S.kpiLabel}>Total Workouts</div>
                </div>
                <div style={S.kpiCard}>
                  <div style={{ ...S.kpiVal, color: "#4DCC88" }}>
                    {stats.totalVolume >= 1000 ? (stats.totalVolume / 1000).toFixed(1) + "t" : Math.round(stats.totalVolume) + "kg"}
                  </div>
                  <div style={S.kpiLabel}>Volume Lifted</div>
                </div>
                <div style={S.kpiCard}>
                  <div style={{ ...S.kpiVal, color: "#4D9EFF" }}>{stats.thisWeek}</div>
                  <div style={S.kpiLabel}>This Week</div>
                </div>
                <div style={S.kpiCard}>
                  <div style={{ ...S.kpiVal, color: "#FFB84D" }}>{stats.streak}</div>
                  <div style={S.kpiLabel}>Active Weeks</div>
                </div>
              </div>

              {/* Split breakdown */}
              <div style={S.sectionTitle}>Workouts by Split</div>
              {Object.entries(DAY_SPLITS).filter(([t]) => t !== "Rest").map(([type, cfg]) => {
                const count = stats.byType[type] || 0;
                const pct = stats.totalWorkouts ? Math.round((count / stats.totalWorkouts) * 100) : 0;
                return (
                  <div key={type} style={S.splitBar}>
                    <div style={S.splitBarLabel}>
                      <span>{cfg.emoji} {type}</span>
                      <span style={{ color: cfg.color, fontWeight: 700 }}>{count} sessions</span>
                    </div>
                    <div style={S.splitBarTrack}>
                      <div style={{ ...S.splitBarFill, width: pct + "%", background: cfg.color }} />
                    </div>
                  </div>
                );
              })}

              {/* Top exercises */}
              <div style={S.sectionTitle}>Most Trained Exercises</div>
              {stats.topExercises.map(([name, e], i) => (
                <div key={name} style={S.exStatRow}>
                  <span style={S.exStatRank}>#{i + 1}</span>
                  <div style={S.exStatInfo}>
                    <div style={S.exStatName}>{name}</div>
                    <div style={S.exStatMeta}>{e.totalSets} sets · {Math.round(e.totalVol)}kg total vol</div>
                  </div>
                  <div style={S.exStatPR}>
                    {e.bestWeight > 0 && <><div style={{ color: "#FFB84D", fontSize: 12, fontWeight: 700 }}>BEST</div><div style={{ fontSize: 13, fontWeight: 700 }}>{e.bestWeight}kg×{e.bestReps}</div></>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {screen === "history" && (
        <div style={S.screen}>
          <div style={S.header}>
            <button style={S.backBtn} onClick={() => setScreen("home")}>‹</button>
            <div style={S.screenTitle}>Workout History</div>
            <div />
          </div>
          {allLogDates.length === 0 && <div style={S.emptyState}>No history yet.</div>}
          {allLogDates.map(date => (
            <div key={date} style={S.historyBlock}>
              <div style={S.historyDate}>📅 {date}</div>
              {(logs[date] || []).map((session, si) => {
                const cfg = DAY_SPLITS[session.type] || DAY_SPLITS["Push"];
                return (
                  <div key={si} style={{ ...S.historySession, borderLeftColor: cfg.color }}>
                    <div style={{ color: cfg.color, fontWeight: 700, marginBottom: 8 }}>{cfg.emoji} {session.type}</div>
                    {session.exercises.map((ex, ei) => (
                      <div key={ei} style={S.historyEx}>
                        <div style={S.historyExName}>{ex.name}</div>
                        {ex.sets.map((set, si2) => (set.weight || set.reps) ? (
                          <div key={si2} style={S.historySet}>Set {si2+1}: {set.weight ? `${set.weight}kg` : "—"} × {set.reps || "—"} reps</div>
                        ) : null)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── SCHEDULE ── */}
      {screen === "schedule" && (
        <div style={S.screen}>
          <div style={S.header}>
            <button style={S.backBtn} onClick={() => setScreen("home")}>‹</button>
            <div style={S.screenTitle}>Weekly Schedule</div>
            <div />
          </div>
          <div style={S.emptyState}>Tap a day to change its type</div>
          {WEEK_DAYS.map((d, i) => {
            const cfg = DAY_SPLITS[schedule[i]];
            return (
              <div key={i}>
                <button style={{ ...S.scheduleRow, borderLeftColor: cfg.color }} onClick={() => setEditScheduleDay(editScheduleDay === i ? null : i)}>
                  <span style={S.scheduleDayName}>{d}</span>
                  <span style={{ ...S.scheduleType, color: cfg.color }}>{cfg.emoji} {schedule[i]}</span>
                  <span style={S.chevron}>{editScheduleDay === i ? "▲" : "▼"}</span>
                </button>
                {editScheduleDay === i && (
                  <div style={S.splitPicker}>
                    {Object.keys(DAY_SPLITS).map(type => (
                      <button key={type} style={{ ...S.splitOption, background: schedule[i] === type ? DAY_SPLITS[type].color : "#1a1a2e", color: schedule[i] === type ? "#000" : "#fff" }}
                        onClick={() => { setSchedule(s => s.map((v, idx) => idx === i ? type : v)); setEditScheduleDay(null); }}>
                        {DAY_SPLITS[type].emoji} {type}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <button style={{ ...S.bigBtn, background: "#333", marginTop: 24 }} onClick={() => { setSchedule(DEFAULT_SCHEDULE); showToast("Schedule reset!"); }}>Reset to Default</button>
        </div>
      )}

      {/* Bottom nav */}
      <div style={S.bottomNav}>
        {[
          { icon: "🏠", label: "Home", s: "home" },
          { icon: "📊", label: "Stats", s: "stats" },
          { icon: "📋", label: "History", s: "history" },
          { icon: "⚙️", label: "Schedule", s: "schedule" },
        ].map(({ icon, label, s }) => (
          <button key={s} style={{ ...S.navBtn, color: screen === s ? "#fff" : "#444" }} onClick={() => setScreen(s)}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ fontSize: 9, marginTop: 2, fontWeight: screen === s ? 700 : 400 }}>{label}</span>
            {screen === s && <div style={S.navDot} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  root: { fontFamily: "'DM Sans', system-ui, sans-serif", background: "#0d0d1a", color: "#fff", minHeight: "100dvh", maxWidth: 430, margin: "0 auto", position: "relative", paddingBottom: 80 },
  screen: { padding: "16px 16px 0" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingTop: 8 },
  screenTitle: { fontSize: 18, fontWeight: 700 },
  greeting: { fontSize: 13, color: "#888", marginBottom: 4 },
  dayBadge: { display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700, color: "#000" },
  backBtn: { background: "#1a1a2e", border: "none", color: "#fff", fontSize: 24, width: 36, height: 36, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  iconBtn: { background: "#1a1a2e", border: "none", color: "#fff", fontSize: 14, padding: "6px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 700 },
  weekStrip: { display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 },
  dayChip: { flex: "0 0 auto", width: 44, height: 54, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px solid", borderRadius: 12, cursor: "pointer", gap: 2 },
  dayChipLabel: { fontSize: 10, color: "#aaa" },
  dayChipEmoji: { fontSize: 16 },
  bigBtn: { width: "100%", padding: "16px", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", color: "#000", marginBottom: 4 },
  restCard: { background: "#1a1a2e", borderRadius: 16, padding: 24, textAlign: "center", marginBottom: 4 },

  // Quick stats strip on home
  quickStats: { display: "flex", background: "#1a1a2e", borderRadius: 16, padding: "14px 8px", marginTop: 12, marginBottom: 4, alignItems: "center" },
  qStat: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  qVal: { fontSize: 18, fontWeight: 800 },
  qLabel: { fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 },
  qDivider: { width: 1, height: 30, background: "#2a2a3e" },

  sectionTitle: { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, margin: "20px 0 10px" },
  emptyState: { textAlign: "center", color: "#555", padding: 20, fontSize: 14 },
  logCard: { width: "100%", background: "#1a1a2e", border: "none", borderRadius: 14, padding: "14px 16px", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", textAlign: "left", color: "#fff" },
  logCardDate: { fontWeight: 700, fontSize: 14, flex: 1 },
  logCardMeta: { fontSize: 12, color: "#888", marginRight: 8 },
  chevron: { color: "#555", fontSize: 20 },
  textBtn: { background: "none", border: "none", color: "#4D9EFF", cursor: "pointer", fontSize: 14, padding: "8px 0", width: "100%" },

  // Log
  exCard: { background: "#1a1a2e", borderRadius: 14, padding: "14px 12px", marginBottom: 12 },
  exHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  exName: { fontWeight: 700, fontSize: 15 },
  prBadge: { display: "block", fontSize: 11, fontWeight: 700, marginTop: 2, opacity: 0.8 },
  removeBtn: { background: "#2a2a3e", border: "none", color: "#888", borderRadius: 8, width: 28, height: 28, cursor: "pointer" },
  setsHeader: { display: "flex", gap: 8, marginBottom: 6, fontSize: 11, color: "#666", textTransform: "uppercase" },
  setCol: { flex: 1, textAlign: "center" },
  setRow: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
  setInput: { flex: 1, background: "#0d0d1a", border: "1px solid #2a2a3e", borderRadius: 10, color: "#fff", fontSize: 15, padding: "8px 6px", textAlign: "center", outline: "none", WebkitAppearance: "none" },
  addSetBtn: { background: "none", border: "none", fontSize: 13, cursor: "pointer", padding: "4px 0", fontWeight: 600 },
  presetGrid: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  presetBtn: { background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#ddd", borderRadius: 20, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  customRow: { display: "flex", gap: 8, alignItems: "center" },
  customInput: { flex: 1, background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 12, color: "#fff", fontSize: 15, padding: "10px 14px", outline: "none" },

  // Stats
  kpiGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 },
  kpiCard: { background: "#1a1a2e", borderRadius: 16, padding: "18px 14px", textAlign: "center" },
  kpiVal: { fontSize: 28, fontWeight: 800, lineHeight: 1 },
  kpiLabel: { fontSize: 11, color: "#666", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  splitBar: { background: "#1a1a2e", borderRadius: 12, padding: "12px 14px", marginBottom: 8 },
  splitBarLabel: { display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 },
  splitBarTrack: { background: "#0d0d1a", borderRadius: 99, height: 6, overflow: "hidden" },
  splitBarFill: { height: "100%", borderRadius: 99, transition: "width 0.5s ease" },
  exStatRow: { display: "flex", alignItems: "center", background: "#1a1a2e", borderRadius: 12, padding: "12px 14px", marginBottom: 8, gap: 12 },
  exStatRank: { color: "#555", fontWeight: 800, fontSize: 13, width: 24 },
  exStatInfo: { flex: 1 },
  exStatName: { fontWeight: 700, fontSize: 14 },
  exStatMeta: { fontSize: 11, color: "#666", marginTop: 2 },
  exStatPR: { textAlign: "right" },

  // History
  historyBlock: { marginBottom: 20 },
  historyDate: { fontSize: 13, color: "#888", marginBottom: 8, fontWeight: 700 },
  historySession: { background: "#1a1a2e", borderRadius: 14, padding: 14, borderLeft: "3px solid", marginBottom: 10 },
  historyEx: { marginBottom: 10 },
  historyExName: { fontWeight: 700, fontSize: 14, marginBottom: 4 },
  historySet: { fontSize: 12, color: "#888", paddingLeft: 8 },

  // Schedule
  scheduleRow: { width: "100%", background: "#1a1a2e", border: "none", borderLeft: "4px solid", borderRadius: 12, padding: "14px 16px", marginBottom: 6, cursor: "pointer", display: "flex", alignItems: "center", color: "#fff", textAlign: "left" },
  scheduleDayName: { flex: 1, fontWeight: 700 },
  scheduleType: { fontSize: 14, marginRight: 8 },
  splitPicker: { display: "flex", gap: 8, padding: "8px 0 12px", flexWrap: "wrap" },
  splitOption: { border: "none", borderRadius: 20, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" },

  toast: { position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", background: "#222", color: "#fff", padding: "10px 20px", borderRadius: 20, fontSize: 14, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px #0008" },

  bottomNav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#0d0d1aee", backdropFilter: "blur(12px)", borderTop: "1px solid #1a1a2e", display: "flex", padding: "8px 0 env(safe-area-inset-bottom)" },
  navBtn: { flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0", position: "relative" },
  navDot: { width: 4, height: 4, background: "#fff", borderRadius: 99, marginTop: 3 },
};

const css = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background: #0d0d1a; }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
`;
