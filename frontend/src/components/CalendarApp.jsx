import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame, ATTRIBUTE_META } from "../context/GameContext";
import * as api from "../lib/api";

export const IMPORTANCE_META = {
  low: { label: "Low", xp: 10 },
  medium: { label: "Medium", xp: 25 },
  high: { label: "High", xp: 50 },
  critical: { label: "Critical", xp: 80 },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local-midnight "YYYY-MM-DD". toISOString() would shift the day in any
 *  timezone behind UTC, which is exactly where an off-by-one day comes from. */
export function toDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayKey() {
  return toDayKey(new Date());
}

/** Parses "YYYY-MM-DD" as a local date, for display only. */
export function parseDayKey(key) {
  const [y, m, d] = String(key || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatTimeRange(event) {
  if (!event.startTime) return "All day";
  return event.endTime ? `${event.startTime} – ${event.endTime}` : event.startTime;
}

/** Earliest-first, all-day events ahead of timed ones on the same day. */
export function compareEvents(a, b) {
  if (a.scheduledFor !== b.scheduledFor) return a.scheduledFor < b.scheduledFor ? -1 : 1;
  return (a.startTime || "").localeCompare(b.startTime || "");
}

const emptyDraft = (dayKey) => ({
  title: "",
  notes: "",
  importance: "medium",
  attribute: "focus",
  scheduledFor: dayKey,
  startTime: "",
  endTime: "",
});

/**
 * The calendar app inside the laptop OS: a month grid plus a day panel with
 * full event CRUD. Only the visible month is fetched, so paging months is a
 * small request rather than pulling the whole schedule.
 */
export default function CalendarApp() {
  const { signedIn, currentUser, applyReward } = useGame();

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedDay, setSelectedDay] = useState(() => todayKey());
  const [focusedDay, setFocusedDay] = useState(() => new Date().getDate());
  const [draft, setDraft] = useState(() => emptyDraft(todayKey()));
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const dayRefs = useRef({});
  const titleRef = useRef(null);
  // Discards a month's response that arrives after the user has paged away.
  const requestFor = useRef(null);

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();

  const load = useCallback(async () => {
    if (!signedIn) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const token = Symbol("month");
    requestFor.current = token;
    setLoading(true);
    try {
      const from = toDayKey(new Date(cursor.year, cursor.month, 1));
      const to = toDayKey(new Date(cursor.year, cursor.month + 1, 0));
      const list = await api.getEvents(currentUser, { from, to });
      if (requestFor.current !== token) return;
      setEvents(Array.isArray(list) ? list : []);
      setMessage("");
    } catch (err) {
      if (requestFor.current !== token) return;
      setMessage(err.message || "Could not load your schedule.");
    } finally {
      if (requestFor.current === token) setLoading(false);
    }
  }, [signedIn, currentUser, cursor.year, cursor.month]);

  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const map = new Map();
    [...events].sort(compareEvents).forEach((event) => {
      const list = map.get(event.scheduledFor) || [];
      list.push(event);
      map.set(event.scheduledFor, list);
    });
    return map;
  }, [events]);

  const dayEvents = byDay.get(selectedDay) || [];

  const goMonth = (delta) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
    setFocusedDay(1);
  };

  const goToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDay(todayKey());
    setFocusedDay(now.getDate());
  };

  const pickDay = (day) => {
    const key = toDayKey(new Date(cursor.year, cursor.month, day));
    setSelectedDay(key);
    setFocusedDay(day);
    setEditingId(null);
    setDraft(emptyDraft(key));
  };

  // Arrow keys walk the grid, Enter opens the focused day. Clamping to the
  // month keeps focus inside the grid instead of falling onto padding cells.
  const onGridKeyDown = (event) => {
    const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pickDay(focusedDay);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 1 : daysInMonth;
      setFocusedDay(next);
      dayRefs.current[next]?.focus();
      return;
    }
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = Math.min(daysInMonth, Math.max(1, focusedDay + delta));
    setFocusedDay(next);
    dayRefs.current[next]?.focus();
  };

  async function onSubmit(formEvent) {
    formEvent.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setMessage("Give the event a title.");
      titleRef.current?.focus();
      return;
    }

    const body = {
      title,
      notes: draft.notes.trim(),
      importance: draft.importance,
      attribute: draft.attribute,
      scheduledFor: draft.scheduledFor,
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
    };

    setSaving(true);
    setMessage("");
    try {
      if (editingId) {
        const saved = await api.updateEvent(currentUser, editingId, body);
        setEvents((current) => current.map((e) => (e.id === editingId ? saved : e)));
      } else {
        const created = await api.createEvent(currentUser, body);
        setEvents((current) => [...current, created]);
      }
      setSelectedDay(body.scheduledFor);
      setEditingId(null);
      setDraft(emptyDraft(body.scheduledFor));
    } catch (err) {
      setMessage(err.message || "Could not save that event.");
    } finally {
      setSaving(false);
    }
  }

  /** Optimistic tick, rolled back if the server refuses — the reward shown in
   *  the HUD always comes from the response, never a local guess. */
  async function onComplete(event) {
    const previous = events;
    setBusyId(event.id);
    setEvents((current) =>
      current.map((e) => (e.id === event.id ? { ...e, completed: true } : e))
    );
    try {
      const reward = await api.completeEvent(currentUser, event.id);
      setEvents((current) =>
        current.map((e) =>
          e.id === event.id
            ? { ...e, completed: true, completedAt: new Date().toISOString() }
            : e
        )
      );
      applyReward(reward);
    } catch (err) {
      setEvents(previous);
      setMessage(err.message || "Could not complete that event.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(event) {
    const previous = events;
    setBusyId(event.id);
    setEvents((current) => current.filter((e) => e.id !== event.id));
    try {
      await api.deleteEvent(currentUser, event.id);
      if (editingId === event.id) {
        setEditingId(null);
        setDraft(emptyDraft(selectedDay));
      }
    } catch (err) {
      setEvents(previous);
      setMessage(err.message || "Could not delete that event.");
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(event) {
    setEditingId(event.id);
    setDraft({
      title: event.title,
      notes: event.notes || "",
      importance: event.importance || "medium",
      attribute: event.attribute || "focus",
      scheduledFor: event.scheduledFor,
      startTime: event.startTime || "",
      endTime: event.endTime || "",
    });
    titleRef.current?.focus();
  }

  if (!signedIn) {
    return (
      <div className="calendar-app calendar-guest">
        <h2>Calendar</h2>
        <p>Sign in to plan your schedule — events you finish pay out XP just like quests.</p>
      </div>
    );
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
  const selectedDate = parseDayKey(selectedDay);
  const today = todayKey();

  return (
    <div className="calendar-app">
      <header className="calendar-head">
        <div>
          <span className="calendar-kicker">Schedule</span>
          <h2>{monthLabel}</h2>
        </div>
        <div className="calendar-nav">
          <button type="button" onClick={() => goMonth(-1)} aria-label="Previous month">‹</button>
          <button type="button" className="calendar-today" onClick={goToday}>Today</button>
          <button type="button" onClick={() => goMonth(1)} aria-label="Next month">›</button>
        </div>
      </header>

      {message && <p className="calendar-message" role="alert">{message}</p>}

      <div className="calendar-layout">
        <section className="calendar-grid-wrap" aria-label={`${monthLabel} calendar`}>
          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className="calendar-grid" role="grid" onKeyDown={onGridKeyDown}>
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`pad-${i}`} className="calendar-cell is-pad" aria-hidden="true" />
            ))}

            {loading
              ? Array.from({ length: daysInMonth }, (_, i) => (
                  <span key={`skeleton-${i}`} className="calendar-cell is-skeleton" aria-hidden="true" />
                ))
              : Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const key = toDayKey(new Date(cursor.year, cursor.month, day));
                  const cellEvents = byDay.get(key) || [];
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      ref={(node) => { dayRefs.current[day] = node; }}
                      // One tab stop for the whole grid; arrows move inside it.
                      tabIndex={focusedDay === day ? 0 : -1}
                      className={[
                        "calendar-cell",
                        key === today ? "is-today" : "",
                        key === selectedDay ? "is-selected" : "",
                      ].join(" ").trim()}
                      aria-selected={key === selectedDay}
                      aria-label={`${new Date(cursor.year, cursor.month, day).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}, ${cellEvents.length} event${cellEvents.length === 1 ? "" : "s"}`}
                      onClick={() => pickDay(day)}
                      onFocus={() => setFocusedDay(day)}
                    >
                      <b>{day}</b>
                      <span className="calendar-dots">
                        {cellEvents.slice(0, 4).map((event) => (
                          <i
                            key={event.id}
                            className={`calendar-dot imp-${event.importance} ${event.completed ? "is-done" : ""}`}
                          />
                        ))}
                        {cellEvents.length > 4 && <em>+{cellEvents.length - 4}</em>}
                      </span>
                    </button>
                  );
                })}
          </div>
          <p className="calendar-hint">Arrow keys move between days · Enter opens the focused day</p>
        </section>

        <aside className="calendar-panel" aria-label="Events for the selected day">
          <h3>
            {selectedDate
              ? selectedDate.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })
              : "Pick a day"}
          </h3>

          <ul className="calendar-day-list">
            {!loading && !dayEvents.length && (
              <li className="calendar-empty">Nothing scheduled. Add something below.</li>
            )}
            {dayEvents.map((event) => {
              const attr = ATTRIBUTE_META[event.attribute];
              const busy = busyId === event.id;
              return (
                <li
                  key={event.id}
                  className={`calendar-event imp-${event.importance} ${event.completed ? "is-done" : ""} ${busy ? "is-busy" : ""}`}
                >
                  <div className="calendar-event-main">
                    <strong>{event.title}</strong>
                    <small>{formatTimeRange(event)}</small>
                    {event.notes && <p>{event.notes}</p>}
                    <div className="calendar-event-tags">
                      <span className={`imp-pill imp-${event.importance}`}>
                        {IMPORTANCE_META[event.importance]?.label ?? event.importance}
                      </span>
                      {attr && <span className="imp-pill imp-attr">{attr.icon} {attr.label}</span>}
                    </div>
                  </div>
                  <div className="calendar-event-tools">
                    {!event.completed && (
                      <button type="button" className="calendar-complete" disabled={busy} onClick={() => onComplete(event)}>
                        Complete
                      </button>
                    )}
                    {!event.completed && (
                      <button type="button" disabled={busy} onClick={() => startEditing(event)}>Edit</button>
                    )}
                    <button type="button" className="calendar-delete" disabled={busy} onClick={() => onDelete(event)}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <form className="calendar-form" onSubmit={onSubmit}>
            <h4>{editingId ? "Edit event" : "New event"}</h4>
            <label>
              <span>Title</span>
              <input
                ref={titleRef}
                value={draft.title}
                maxLength={120}
                placeholder="Deep work session"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>

            <div className="calendar-form-row">
              <label>
                <span>Date</span>
                <input
                  type="date"
                  value={draft.scheduledFor}
                  onChange={(e) => setDraft({ ...draft, scheduledFor: e.target.value })}
                />
              </label>
              <label>
                <span>Start</span>
                <input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
              </label>
              <label>
                <span>End</span>
                <input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
              </label>
            </div>

            <div className="calendar-form-row">
              <label>
                <span>Importance</span>
                <select value={draft.importance} onChange={(e) => setDraft({ ...draft, importance: e.target.value })}>
                  {Object.entries(IMPORTANCE_META).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label} · {meta.xp} XP</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Trains</span>
                <select value={draft.attribute} onChange={(e) => setDraft({ ...draft, attribute: e.target.value })}>
                  {Object.entries(ATTRIBUTE_META).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.icon} {meta.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>Notes</span>
              <textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>

            <div className="calendar-form-actions">
              <button type="submit" className="calendar-primary" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Add event"}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft(selectedDay)); }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
