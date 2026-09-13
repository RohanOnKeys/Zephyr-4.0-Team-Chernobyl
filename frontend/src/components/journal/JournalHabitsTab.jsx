import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import HabitForm from "../habits/HabitForm";
import TodayHabitCard from "../habits/TodayHabitCard";
import ProgressRing from "../habits/ProgressRing";
import StreakRecoveryCard from "../habits/StreakRecoveryCard";
import Mascot from "../habits/Mascot";

/**
 * Habits tab of the quest journal. Everything that would be a modal on the
 * dashboard (form, confirmations) renders inline so the journal's own focus
 * trap and Escape handling stay the only ones in play.
 *
 * `registerEscape(fn)` lets the journal ask this tab to close an inline panel
 * before Escape closes the whole dialog; fn returns true when it handled it.
 */
export default function JournalHabitsTab({ habitsState, onCheckIn, registerEscape }) {
  const {
    habits,
    loading,
    loaded,
    error,
    reload,
    completedTodayIds,
    streaksById,
    todayProgress,
    recoveryHabit,
    dismissRecovery,
    saveHabit,
    removeHabit,
    archiveHabit,
  } = habitsState;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: "delete" | "archive", habit }
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const formWrapRef = useRef(null);
  const confirmRef = useRef(null);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  useEffect(() => {
    registerEscape(() => {
      if (confirm) {
        setConfirm(null);
        return true;
      }
      if (formOpen) {
        closeForm();
        return true;
      }
      return false;
    });
    return () => registerEscape(null);
  }, [confirm, formOpen, registerEscape]);

  // Move focus into inline panels when they appear.
  useEffect(() => {
    if (formOpen) window.setTimeout(() => formWrapRef.current?.querySelector("input")?.focus(), 20);
  }, [formOpen, editing]);
  useEffect(() => {
    if (confirm) window.setTimeout(() => confirmRef.current?.querySelector("button")?.focus(), 20);
  }, [confirm]);

  async function handleSave(data) {
    setSubmitting(true);
    setActionError("");
    try {
      await saveHabit(data, editing);
      closeForm();
    } catch (err) {
      setActionError(err.message || "Could not save that habit.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(habit) {
    if (busyId === habit.id) return;
    setBusyId(habit.id);
    setActionError("");
    try {
      await onCheckIn(habit);
    } catch (err) {
      setActionError(err.message || "Could not update that check-in.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    const { kind, habit } = confirm;
    setBusyId(habit.id);
    setActionError("");
    try {
      if (kind === "delete") await removeHabit(habit);
      else await archiveHabit(habit);
      setConfirm(null);
    } catch (err) {
      setActionError(err.message || `Could not ${kind} that habit.`);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !loaded) {
    return (
      <ul className="journal-list" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="quest-row is-skeleton" aria-hidden="true">
            <span /><span /><span />
          </li>
        ))}
      </ul>
    );
  }

  if (error && !loaded) {
    return (
      <div className="journal-notice is-error" role="alert">
        {error}{" "}
        <button type="button" className="journal-inline-button" onClick={reload}>Try again</button>
      </div>
    );
  }

  return (
    <div className="journal-habits">
      <div className="journal-habits-head">
        <div className="journal-ring">
          <ProgressRing value={todayProgress} size={52} stroke={5} />
          <span>{todayProgress}%</span>
        </div>
        <div className="journal-habits-summary">
          <strong>Today's habits</strong>
          <span>{completedTodayIds.size} of {habits.length} complete</span>
        </div>
        {!formOpen && (
          <button
            type="button"
            className="journal-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={12} aria-hidden="true" /> New habit
          </button>
        )}
      </div>

      {error && loaded && <p className="journal-notice is-error" role="alert">{error}</p>}
      {actionError && <p className="journal-error" role="alert">{actionError}</p>}

      {recoveryHabit && <StreakRecoveryCard habit={recoveryHabit} onDismiss={dismissRecovery} />}

      {formOpen && (
        <div className="journal-subpanel" ref={formWrapRef} role="group" aria-label={editing ? "Edit habit" : "New habit"}>
          <h3>{editing ? "Edit habit" : "New habit"}</h3>
          <HabitForm
            key={editing?.id || "new"}
            initial={editing}
            submitting={submitting}
            onCancel={closeForm}
            onSubmit={handleSave}
          />
        </div>
      )}

      {confirm && (
        <div className="journal-subpanel is-confirm" ref={confirmRef} role="alertdialog" aria-label={`${confirm.kind} habit`}>
          <p>
            {confirm.kind === "delete" ? (
              <>This will permanently delete <strong>{confirm.habit.name}</strong> and all its history. This can't be undone.</>
            ) : (
              <>Archive <strong>{confirm.habit.name}</strong>? It will leave today's list, but its history is kept.</>
            )}
          </p>
          <div className="journal-actions">
            <button type="button" className="journal-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button
              type="button"
              className={confirm.kind === "delete" ? "journal-danger" : "journal-primary"}
              onClick={handleConfirm}
              disabled={busyId === confirm.habit.id}
            >
              {confirm.kind === "delete" ? "Delete" : "Archive"}
            </button>
          </div>
        </div>
      )}

      {habits.length === 0 ? (
        !formOpen && (
          <div className="journal-empty">
            <Mascot pose="gasp" size={56} className="journal-mascot" />
            <div>Let's build your first habit — something you can do in under 5 minutes.</div>
          </div>
        )
      ) : (
        <div className="journal-habit-list">
          {habits.map((h) => (
            <div key={h.id} className={busyId === h.id ? "is-busy" : ""}>
              <TodayHabitCard
                habit={h}
                completed={completedTodayIds.has(h.id)}
                streak={streaksById[h.id]?.current || 0}
                onToggle={() => handleToggle(h)}
                onEdit={() => {
                  setConfirm(null);
                  setEditing(h);
                  setFormOpen(true);
                }}
                onArchive={() => setConfirm({ kind: "archive", habit: h })}
                onDelete={() => setConfirm({ kind: "delete", habit: h })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
