import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getHabits,
  createHabit,
  updateHabit,
  archiveHabit as archiveHabitRequest,
  deleteHabit as deleteHabitRequest,
  getTodayLogs,
  getRangeLogs,
  getHeatmapLogs,
  createLog,
  deleteLog,
} from "../lib/api";
import { streakFromKeys, todayKey, weekKeys } from "../utils/dateHelpers";

const RECOVERY_DISMISSED_KEY = "habit-recovery-dismissed";

function readDismissed() {
  try {
    return JSON.parse(localStorage.getItem(RECOVERY_DISMISSED_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Habit tracker state + actions, shared by the dashboard and the room's quest
 * journal. Pass `enabled: false` (e.g. a guest, or a closed tab) to skip fetching.
 */
export default function useHabits(currentUser, { enabled = true } = {}) {
  const [habits, setHabits] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [weekLogs, setWeekLogs] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [logsByHabit90d, setLogsByHabit90d] = useState({});
  const [loading, setLoading] = useState(Boolean(currentUser && enabled));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [recoveryHabit, setRecoveryHabit] = useState(null);

  const reload = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError("");
    try {
      const week = weekKeys();
      const [habitsData, todayData, weekData, heatmapData] = await Promise.all([
        getHabits(currentUser),
        getTodayLogs(currentUser),
        getRangeLogs(currentUser, week[0].key, week[6].key),
        getHeatmapLogs(currentUser),
      ]);

      setHabits(habitsData);
      setTodayLogs(todayData);
      setWeekLogs(weekData);
      setHeatmap(heatmapData);

      const start90 = heatmapData[0]?.date || todayKey();
      const range90 = await getRangeLogs(currentUser, start90, todayKey());
      const byHabit = {};
      for (const h of habitsData) byHabit[h.id] = [];
      for (const l of range90) {
        if (!byHabit[l.habitId]) byHabit[l.habitId] = [];
        byHabit[l.habitId].push(l.date);
      }
      setLogsByHabit90d(byHabit);
      setLoaded(true);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not load habits.");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !enabled) {
      setLoading(false);
      return;
    }
    reload();
  }, [currentUser, enabled, reload]);

  const completedTodayIds = useMemo(() => new Set(todayLogs.map((l) => l.habitId)), [todayLogs]);

  const weekLogsByHabit = useMemo(() => {
    const out = {};
    for (const l of weekLogs) {
      if (!out[l.habitId]) out[l.habitId] = [];
      out[l.habitId].push(l.date);
    }
    return out;
  }, [weekLogs]);

  const streaksById = useMemo(() => {
    const out = {};
    for (const h of habits) out[h.id] = streakFromKeys(logsByHabit90d[h.id] || []);
    return out;
  }, [habits, logsByHabit90d]);

  const todayProgress = habits.length ? Math.round((completedTodayIds.size / habits.length) * 100) : 0;
  const activeStreaks = Object.values(streaksById).filter((s) => s.current > 0).length;
  const bestStreak = Math.max(0, ...Object.values(streaksById).map((s) => s.longest));
  const weekTotal = habits.length * 7;
  const weekDone = Object.values(weekLogsByHabit).reduce((s, arr) => s + arr.length, 0);
  const weekRate = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  useEffect(() => {
    if (recoveryHabit || !habits.length) return;
    const dismissed = readDismissed();
    for (const h of habits) {
      const s = streaksById[h.id];
      if (s && s.longest >= 7 && s.current === 0 && !dismissed[h.id]) {
        setRecoveryHabit({ ...h, longest: s.longest });
        return;
      }
    }
  }, [habits, streaksById, recoveryHabit]);

  function dismissRecovery() {
    if (!recoveryHabit) return;
    const dismissed = readDismissed();
    dismissed[recoveryHabit.id] = Date.now();
    try {
      localStorage.setItem(RECOVERY_DISMISSED_KEY, JSON.stringify(dismissed));
    } catch {
      /* storage unavailable - dismissal just won't persist */
    }
    setRecoveryHabit(null);
  }

  /**
   * Checks a habit in or out for today.
   * Resolves to { completed, stats, reward, newStreak, completedAll }.
   */
  async function toggleHabit(habit, { optimistic = false } = {}) {
    const done = completedTodayIds.has(habit.id);
    const today = todayKey();

    if (optimistic) {
      // Flip local state first, then reconcile; restore the snapshot on failure.
      const snapshot = { todayLogs, weekLogs, logsByHabit90d };
      const completedAll = !done && completedTodayIds.size + 1 === habits.length && habits.length > 0;
      const newStreak = done ? 0 : streakFromKeys([...(logsByHabit90d[habit.id] || []), today]).current;
      const placeholder = { id: `pending-${habit.id}`, habitId: habit.id, date: today, pending: true };

      if (done) {
        setTodayLogs((logs) => logs.filter((l) => l.habitId !== habit.id));
        setWeekLogs((logs) => logs.filter((l) => !(l.habitId === habit.id && l.date === today)));
        setLogsByHabit90d((prev) => ({ ...prev, [habit.id]: (prev[habit.id] || []).filter((d) => d !== today) }));
      } else {
        setTodayLogs((logs) => [...logs.filter((l) => l.habitId !== habit.id), placeholder]);
        setWeekLogs((logs) =>
          logs.some((l) => l.habitId === habit.id && l.date === today) ? logs : [...logs, placeholder]
        );
        setLogsByHabit90d((prev) => ({
          ...prev,
          [habit.id]: [...(prev[habit.id] || []).filter((d) => d !== today), today],
        }));
      }

      try {
        if (done) {
          const { stats } = await deleteLog(currentUser, habit.id, today);
          return { completed: false, stats };
        }
        const { stats, reward, ...log } = await createLog(currentUser, habit.id, today);
        const swap = (logs) => logs.map((l) => (l === placeholder ? log : l));
        setTodayLogs(swap);
        setWeekLogs(swap);
        return { completed: true, stats, reward, newStreak, completedAll };
      } catch (err) {
        setTodayLogs(snapshot.todayLogs);
        setWeekLogs(snapshot.weekLogs);
        setLogsByHabit90d(snapshot.logsByHabit90d);
        throw err;
      }
    }

    if (done) {
      const { stats } = await deleteLog(currentUser, habit.id, today);
      setTodayLogs((logs) => logs.filter((l) => l.habitId !== habit.id));
      setWeekLogs((logs) => logs.filter((l) => !(l.habitId === habit.id && l.date === today)));
      setLogsByHabit90d((prev) => ({
        ...prev,
        [habit.id]: (prev[habit.id] || []).filter((d) => d !== today),
      }));
      return { completed: false, stats };
    }

    const completedAll = completedTodayIds.size + 1 === habits.length && habits.length > 0;
    const newStreak = streakFromKeys([...(logsByHabit90d[habit.id] || []), today]).current;

    const { stats, reward, ...log } = await createLog(currentUser, habit.id, today);
    setTodayLogs((logs) => [...logs.filter((l) => l.habitId !== habit.id), log]);
    setWeekLogs((logs) =>
      logs.some((l) => l.habitId === habit.id && l.date === today) ? logs : [...logs, log]
    );
    setLogsByHabit90d((prev) => ({
      ...prev,
      [habit.id]: [...(prev[habit.id] || []).filter((d) => d !== today), today],
    }));
    return { completed: true, stats, reward, newStreak, completedAll };
  }

  /** Creates a habit, or updates `editing` when given. */
  async function saveHabit(data, editing) {
    if (editing) {
      const updated = await updateHabit(currentUser, editing.id, data);
      setHabits((hs) => hs.map((h) => (h.id === updated.id ? updated : h)));
      return updated;
    }
    const created = await createHabit(currentUser, data);
    setHabits((hs) => [...hs, created]);
    setLogsByHabit90d((prev) => ({ ...prev, [created.id]: [] }));
    return created;
  }

  async function removeHabit(habit) {
    await deleteHabitRequest(currentUser, habit.id);
    setHabits((hs) => hs.filter((h) => h.id !== habit.id));
    setTodayLogs((ls) => ls.filter((l) => l.habitId !== habit.id));
    setWeekLogs((ls) => ls.filter((l) => l.habitId !== habit.id));
  }

  async function archiveHabit(habit) {
    await archiveHabitRequest(currentUser, habit.id);
    setHabits((hs) => hs.filter((h) => h.id !== habit.id));
  }

  return {
    habits,
    todayLogs,
    weekLogs,
    heatmap,
    logsByHabit90d,
    loading,
    loaded,
    error,
    reload,
    completedTodayIds,
    weekLogsByHabit,
    streaksById,
    todayProgress,
    activeStreaks,
    bestStreak,
    weekRate,
    recoveryHabit,
    dismissRecovery,
    toggleHabit,
    saveHabit,
    removeHabit,
    archiveHabit,
  };
}
