import { useEffect, useState } from "react";
import { useGame } from "../context/GameContext";
import * as api from "../lib/api";
import { IMPORTANCE_META, compareEvents, formatTimeRange, todayKey, toDayKey } from "./CalendarApp";

const MAX_ITEMS = 4;

/**
 * Compact schedule pinned to the 3D room: today plus the next few days, with
 * one-tap completion so the room can be used without opening the laptop.
 */
export default function RoomCalendarWidget({ onOpenApp }) {
  const { signedIn, currentUser, applyReward } = useGame();
  const [events, setEvents] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!signedIn) {
      setEvents([]);
      return;
    }
    // A two-week window is enough to fill four slots without a second request.
    const from = todayKey();
    const to = toDayKey(new Date(Date.now() + 13 * 86400000));
    let cancelled = false;
    api
      .getEvents(currentUser, { from, to })
      .then((list) => {
        if (cancelled) return;
        setEvents(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [signedIn, currentUser]);

  const upcoming = events
    .filter((event) => !event.completed)
    .sort(compareEvents)
    .slice(0, MAX_ITEMS);

  async function complete(event) {
    const previous = events;
    setBusyId(event.id);
    setEvents((current) => current.map((e) => (e.id === event.id ? { ...e, completed: true } : e)));
    try {
      const reward = await api.completeEvent(currentUser, event.id);
      applyReward(reward);
    } catch (err) {
      setEvents(previous);
    } finally {
      setBusyId(null);
    }
  }

  const today = todayKey();

  return (
    <div className="room-widget room-calendar-widget">
      <header className="room-widget-header">
        <strong>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f5c47f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
            <path d="M8 2.5v4M16 2.5v4M3 10h18" />
          </svg>
          Schedule
        </strong>
        <button type="button" className="room-widget-link" onClick={() => onOpenApp("calendar")}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: "middle" }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Open calendar
        </button>
      </header>

      {upcoming.length ? (
        <div className="room-widget-body">
          {upcoming.map((event) => (
            <div key={event.id} className={`room-calendar-row imp-${event.importance}`}>
              <i className={`calendar-dot imp-${event.importance}`} aria-hidden="true" />
              <div className="room-calendar-text">
                <b>{event.title}</b>
                <small>
                  {event.scheduledFor === today ? "Today" : event.scheduledFor.slice(5)} ·{" "}
                  {formatTimeRange(event)} · {IMPORTANCE_META[event.importance]?.label ?? event.importance}
                </small>
              </div>
              <button
                type="button"
                className="room-widget-next"
                disabled={busyId === event.id}
                onClick={() => complete(event)}
                aria-label={`Complete ${event.title}`}
              >
                ✓
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="room-widget-body empty" onClick={() => onOpenApp("calendar")}>
          <p className="room-card-text">Nothing scheduled — open the calendar to plan your day.</p>
        </div>
      )}
    </div>
  );
}
