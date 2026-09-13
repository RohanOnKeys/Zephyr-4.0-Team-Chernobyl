import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame, ATTRIBUTE_META, DIFFICULTY_META } from "../context/GameContext";
import useHabits from "../hooks/useHabits";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { STREAK_MILESTONES } from "../utils/dateHelpers";
import { celebrate, celebrateBig, celebrateMilestone } from "../utils/confetti";
import Mascot, { celebrationPoseForCategory } from "./habits/Mascot";
import JournalHabitsTab from "./journal/JournalHabitsTab";
import JournalProgressTab from "./journal/JournalProgressTab";

const TABS = [
  { id: "quests", label: "Quests" },
  { id: "habits", label: "Habits" },
  { id: "progress", label: "Progress" },
];

const FILTERS = [
  { id: "active", label: "Active" },
  { id: "done", label: "Completed" },
  { id: "all", label: "All" },
];

const EMPTY_DRAFT = {
  title: "",
  description: "",
  type: "todo",
  difficulty: "easy",
  attribute: "intellect",
};

/**
 * The quest journal: full task CRUD themed as an RPG logbook.
 *
 * Rendered as a modal dialog over the room. Focus is trapped while it's open
 * and restored to whatever opened it on close.
 */
export default function QuestJournal({ open, onClose }) {
  const {
    signedIn, loading, error, tasks, addTask, editTask, removeTask, completeTask,
    currentUser, applyReward, settings, stats,
  } = useGame();

  const [tab, setTab] = useState("quests");
  // Habit data is fetched the first time a habit tab is opened, then kept.
  const [habitsRequested, setHabitsRequested] = useState(false);
  const habitsState = useHabits(signedIn ? currentUser : null, { enabled: signedIn && habitsRequested });
  const prefersReducedMotion = usePrefersReducedMotion();
  const reducedMotion = Boolean(settings?.reducedMotion) || prefersReducedMotion;
  const [celebration, setCelebration] = useState(null);
  const celebrationTimer = useRef(null);
  const tabRefs = useRef({});
  const subEscape = useRef(null);
  const registerEscape = useCallback((fn) => {
    subEscape.current = fn;
  }, []);

  useEffect(() => {
    if (open && tab !== "quests" && signedIn) setHabitsRequested(true);
  }, [open, tab, signedIn]);

  useEffect(() => () => window.clearTimeout(celebrationTimer.current), []);

  const [filter, setFilter] = useState("active");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const restoreFocusTo = useRef(null);

  // Remember what had focus so it can be handed back on close.
  useEffect(() => {
    if (open) {
      restoreFocusTo.current = document.activeElement;
      window.setTimeout(() => (tab === "quests" ? titleRef.current : tabRefs.current[tab])?.focus(), 40);
    } else if (restoreFocusTo.current instanceof HTMLElement) {
      restoreFocusTo.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus only on open/close
  }, [open]);

  // Escape closes; Tab cycles within the dialog so focus can't escape behind it.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        // An inline form/confirmation inside a tab closes first.
        if (subEscape.current?.()) return;
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = Array.from(
        dialogRef.current?.querySelectorAll(
          'button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.getClientRects().length > 0);
      if (!focusables?.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  const visible = useMemo(() => {
    if (filter === "active") return tasks.filter((t) => !t.completed);
    if (filter === "done") return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  if (!open) return null;

  const resetForm = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setFormError("");
  };

  async function onSubmit(event) {
    event.preventDefault();
    const title = draft.title.trim();

    if (!title) {
      setFormError("Give your quest a name.");
      titleRef.current?.focus();
      return;
    }
    if (title.length > 120) {
      setFormError("Keep the name under 120 characters.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      if (editingId) {
        await editTask(editingId, { ...draft, title });
      } else {
        await addTask({ ...draft, title });
      }
      resetForm();
    } catch (err) {
      setFormError(err.message || "Could not save that quest.");
    } finally {
      setSaving(false);
    }
  }

  async function onComplete(task) {
    setBusyId(task.id);
    setFormError("");
    try {
      await completeTask(task.id);
    } catch (err) {
      setFormError(err.message || "Could not complete that quest.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(task) {
    setBusyId(task.id);
    try {
      await removeTask(task.id);
    } catch (err) {
      setFormError(err.message || "Could not delete that quest.");
    } finally {
      setBusyId(null);
    }
  }

  function onTabKeyDown(event) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  function showCelebration(pose) {
    window.clearTimeout(celebrationTimer.current);
    setCelebration(pose);
    celebrationTimer.current = window.setTimeout(() => setCelebration(null), 1800);
  }

  // Mirrors the dashboard's check-in celebration, plus room HUD rewards.
  async function onHabitCheckIn(habit) {
    const { completed, reward, newStreak, completedAll } = await habitsState.toggleHabit(habit, { optimistic: true });
    if (reward?.xpGained > 0) applyReward(reward);
    if (!completed) return;

    showCelebration(celebrationPoseForCategory(habit.category));
    if (reducedMotion) return;

    celebrate();
    if (STREAK_MILESTONES.includes(newStreak) || reward?.leveledUp) {
      window.setTimeout(celebrateMilestone, 150);
    }
    if (completedAll) window.setTimeout(celebrateBig, 300);
  }

  const guestPrompt = (
    <div className="journal-empty journal-guest" role="status">
      <Mascot pose="wave" size={56} className="journal-mascot" />
      <div>Habits and progress live with your account.</div>
      <a className="journal-primary" href="/login">Sign in to track habits</a>
    </div>
  );

  function startEditing(task) {
    setEditingId(task.id);
    setDraft({
      title: task.title,
      description: task.description || "",
      type: task.type,
      difficulty: task.difficulty,
      attribute: task.attribute || "intellect",
    });
    titleRef.current?.focus();
  }

  return (
    <div className="journal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className="quest-journal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-heading"
      >
        <header className="journal-head">
          <div>
            <span className="journal-kicker">Logbook</span>
            <h2 id="journal-heading">Quest journal</h2>
          </div>
          <button type="button" className="journal-close" onClick={onClose} aria-label="Close quest journal">
            ×
          </button>
        </header>

        <div className="journal-tabs" role="tablist" aria-label="Journal sections" onKeyDown={onTabKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              type="button"
              role="tab"
              id={`journal-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`journal-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={tab === t.id ? "is-active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab !== "quests" && (
          <div
            className="journal-tabpanel"
            role="tabpanel"
            id={`journal-panel-${tab}`}
            aria-labelledby={`journal-tab-${tab}`}
          >
            {!signedIn ? guestPrompt : tab === "habits" ? (
              <JournalHabitsTab habitsState={habitsState} onCheckIn={onHabitCheckIn} registerEscape={registerEscape} />
            ) : (
              <JournalProgressTab habitsState={habitsState} stats={stats} />
            )}
          </div>
        )}

        <div
          className="journal-tabpanel journal-quests"
          role="tabpanel"
          id="journal-panel-quests"
          aria-labelledby="journal-tab-quests"
          hidden={tab !== "quests"}
        >
        {!signedIn && (
          <p className="journal-notice" role="status">
            You're browsing as a guest. <a href="/login">Sign in</a> to save quests and earn XP.
          </p>
        )}
        {error && <p className="journal-notice is-error" role="alert">{error}</p>}

        <form className="journal-form" onSubmit={onSubmit}>
          <div className="journal-row">
            <label className="journal-field journal-title-field">
              <span>Quest</span>
              <input
                ref={titleRef}
                value={draft.title}
                maxLength={120}
                placeholder="Read one chapter of the textbook"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                aria-invalid={Boolean(formError)}
              />
            </label>

            <label className="journal-field">
              <span>Type</span>
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                <option value="todo">One-off</option>
                <option value="daily">Daily</option>
                <option value="habit">Habit</option>
              </select>
            </label>
          </div>

          <div className="journal-row">
            <label className="journal-field">
              <span>Difficulty</span>
              <select
                value={draft.difficulty}
                onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
              >
                {Object.entries(DIFFICULTY_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label} · {meta.xp} XP</option>
                ))}
              </select>
            </label>

            <label className="journal-field">
              <span>Trains</span>
              <select
                value={draft.attribute}
                onChange={(e) => setDraft({ ...draft, attribute: e.target.value })}
              >
                {Object.entries(ATTRIBUTE_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.icon} {meta.label}</option>
                ))}
              </select>
            </label>

            <div className="journal-actions">
              <button type="submit" className="journal-primary" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Add quest"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} disabled={saving}>Cancel</button>
              )}
            </div>
          </div>

          {formError && <p className="journal-error" role="alert">{formError}</p>}
          <p className="journal-hint">
            Reward scales with difficulty, and a longer streak multiplies it — up to 1.35× on day seven.
          </p>
        </form>

        <nav className="journal-filters" aria-label="Filter quests">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? "is-active" : ""}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <em>{f.id === "active" ? tasks.filter((t) => !t.completed).length
                 : f.id === "done" ? tasks.filter((t) => t.completed).length
                 : tasks.length}</em>
            </button>
          ))}
        </nav>

        <ul className="journal-list">
          {loading && (
            // Skeletons rather than a spinner, so the layout doesn't jump once
            // the real quests arrive.
            Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="quest-row is-skeleton" aria-hidden="true">
                <span /><span /><span />
              </li>
            ))
          )}

          {!loading && !visible.length && (
            <li className="journal-empty">
              {filter === "done"
                ? "No completed quests yet. Finish one to see it here."
                : "Your logbook is empty. Add your first quest above."}
            </li>
          )}

          {!loading && visible.map((task) => {
            const meta = ATTRIBUTE_META[task.attribute];
            const busy = busyId === task.id || task.pending;

            return (
              <li key={task.id} className={`quest-row ${task.completed ? "is-done" : ""} ${busy ? "is-busy" : ""}`}>
                <button
                  type="button"
                  className="quest-check"
                  onClick={() => onComplete(task)}
                  disabled={task.completed || busy}
                  aria-label={task.completed ? `${task.title} completed` : `Complete ${task.title}`}
                >
                  {task.completed ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg className="quest-check-hover" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                <div className="quest-body">
                  <strong>{task.title}</strong>
                  {task.description && <p>{task.description}</p>}
                  <div className="quest-tags">
                    <span className={`tag tag-${task.difficulty}`}>
                      {DIFFICULTY_META[task.difficulty]?.label ?? task.difficulty}
                    </span>
                    {meta && <span className="tag tag-attr">{meta.icon} {meta.label}</span>}
                    <span className="tag tag-type">{task.type}</span>
                  </div>
                </div>

                <div className="quest-tools">
                  {!task.completed && (
                    <button
                      type="button"
                      className="quest-edit"
                      onClick={() => startEditing(task)}
                      aria-label={`Edit ${task.title}`}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="quest-delete"
                    onClick={() => onDelete(task)}
                    disabled={busy}
                    aria-label={`Delete ${task.title}`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        </div>
      </section>

      {celebration && (
        <div className={`journal-celebration ${reducedMotion ? "is-still" : ""}`} aria-hidden="true">
          <Mascot pose={celebration} size={160} />
        </div>
      )}
    </div>
  );
}
