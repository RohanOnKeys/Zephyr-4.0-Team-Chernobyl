import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import * as api from "../lib/api";

const GameContext = createContext(null);

/** XP needed to climb from `level` to the next. Mirrors the server's curve. */
export const xpForLevel = (level) => Math.floor(100 * Math.pow(level, 1.5));

export const ATTRIBUTE_META = {
  intellect: { label: "Intellect", icon: "✦", hint: "Studying, reading, coding" },
  strength: { label: "Strength", icon: "⚔", hint: "Exercise, sport, chores" },
  focus: { label: "Focus", icon: "◎", hint: "Deep work, meditation" },
  charisma: { label: "Charisma", icon: "♥", hint: "People, writing, practice" },
};

export const DIFFICULTY_META = {
  trivial: { label: "Trivial", xp: 5 },
  easy: { label: "Easy", xp: 10 },
  medium: { label: "Medium", xp: 25 },
  hard: { label: "Hard", xp: 50 },
  epic: { label: "Epic", xp: 100 },
};

const EMPTY_ATTRIBUTES = {
  intellect: { level: 1, xp: 0 },
  strength: { level: 1, xp: 0 },
  focus: { level: 1, xp: 0 },
  charisma: { level: 1, xp: 0 },
};

/**
 * Owns everything the room needs to render the RPG: the character sheet, the
 * quest list and the activity history.
 *
 * The page is reachable while signed out, so every action degrades to a clear
 * "sign in" error instead of throwing.
 */
export function GameProvider({ children }) {
  const { currentUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activity, setActivity] = useState({ recent: [], daily: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Most recent reward payout, so the room can play a celebration. Cleared by
  // the consumer once the animation has run.
  const [lastReward, setLastReward] = useState(null);

  // Guards against a slow response from a previous account overwriting state
  // after the user has signed out or switched.
  const requestFor = useRef(null);

  const refresh = useCallback(async () => {
    if (!currentUser) {
      setProfile(null);
      setTasks([]);
      setActivity({ recent: [], daily: [] });
      setLoading(false);
      return;
    }

    const token = Symbol("request");
    requestFor.current = token;
    setLoading(true);
    setError("");

    try {
      const [me, taskList, history] = await Promise.all([
        api.getMe(currentUser),
        api.getTasks(currentUser),
        api.getActivity(currentUser),
      ]);

      if (requestFor.current !== token) return;

      setProfile(me);
      setTasks(taskList);
      setActivity(history);
    } catch (err) {
      if (requestFor.current !== token) return;
      setError(err.message || "Could not reach the server");
    } finally {
      if (requestFor.current === token) setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requireUser = () => {
    if (!currentUser) throw new Error("Sign in to save your progress");
  };

  const addTask = useCallback(
    async (draft) => {
      requireUser();
      const created = await api.createTask(currentUser, draft);
      setTasks((current) => [created, ...current]);
      return created;
    },
    [currentUser]
  );

  const editTask = useCallback(
    async (id, updates) => {
      requireUser();
      const previous = tasks;
      // Optimistic: show the edit immediately, roll back if the server refuses.
      setTasks((current) => current.map((t) => (t.id === id ? { ...t, ...updates } : t)));
      try {
        const saved = await api.updateTask(currentUser, id, updates);
        setTasks((current) => current.map((t) => (t.id === id ? saved : t)));
        return saved;
      } catch (err) {
        setTasks(previous);
        throw err;
      }
    },
    [currentUser, tasks]
  );

  const removeTask = useCallback(
    async (id) => {
      requireUser();
      const previous = tasks;
      setTasks((current) => current.filter((t) => t.id !== id));
      try {
        await api.deleteTask(currentUser, id);
      } catch (err) {
        setTasks(previous);
        throw err;
      }
    },
    [currentUser, tasks]
  );

  /**
   * Completing a quest flips the checkbox instantly, then reconciles with the
   * server's authoritative reward. The XP number shown in the celebration comes
   * from the response, never from a local guess - the streak multiplier means
   * the client genuinely cannot know it in advance.
   */
  const completeTask = useCallback(
    async (id) => {
      requireUser();
      const previousTasks = tasks;
      const previousProfile = profile;

      setTasks((current) =>
        current.map((t) => (t.id === id ? { ...t, completed: true, pending: true } : t))
      );

      try {
        const reward = await api.completeTask(currentUser, id);

        setTasks((current) =>
          current.map((t) =>
            t.id === id ? { ...t, completed: true, pending: false, completedAt: new Date().toISOString() } : t
          )
        );
        setProfile((current) =>
          current
            ? {
                ...current,
                stats: reward.stats,
                attributes: reward.attributes,
                streak: reward.streak,
              }
            : current
        );
        setLastReward(reward);

        // History drives the streak calendar; refresh it quietly in the background.
        api.getActivity(currentUser).then(setActivity).catch(() => {});

        return reward;
      } catch (err) {
        setTasks(previousTasks);
        setProfile(previousProfile);
        throw err;
      }
    },
    [currentUser, tasks, profile]
  );

  /** Applies a reward returned by a non-quest action, such as studying a deck. */
  const applyReward = useCallback((reward) => {
    if (!reward || !reward.xpGained) return;
    setProfile((current) =>
      current
        ? { ...current, stats: reward.stats ?? current.stats, attributes: reward.attributes ?? current.attributes }
        : current
    );
    setLastReward(reward);
  }, []);

  const saveSettings = useCallback(
    async (patch) => {
      requireUser();
      const previous = profile;
      setProfile((current) =>
        current ? { ...current, settings: { ...current.settings, ...patch } } : current
      );
      try {
        const { settings } = await api.saveSettings(currentUser, patch);
        setProfile((current) => (current ? { ...current, settings } : current));
      } catch (err) {
        setProfile(previous);
        throw err;
      }
    },
    [currentUser, profile]
  );

  const stats = profile?.stats ?? { level: 1, xp: 0, xpIntoLevel: 0, gold: 0, totalCompleted: 0 };
  const attributes = profile?.attributes ?? EMPTY_ATTRIBUTES;
  const streak = profile?.streak ?? { current: 0, longest: 0, lastActiveDay: null };
  const settings = profile?.settings ?? {};

  const value = useMemo(
    () => ({
      signedIn: Boolean(currentUser),
      currentUser,
      loading,
      error,
      profile,
      stats,
      attributes,
      streak,
      settings,
      tasks,
      activity,
      lastReward,
      clearReward: () => setLastReward(null),
      refresh,
      addTask,
      editTask,
      removeTask,
      completeTask,
      applyReward,
      saveSettings,
      xpNeeded: xpForLevel(stats.level),
    }),
    [
      currentUser, loading, error, profile, stats, attributes, streak, settings,
      tasks, activity, lastReward, refresh, addTask, editTask, removeTask,
      completeTask, applyReward, saveSettings,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used inside a GameProvider");
  return context;
}
