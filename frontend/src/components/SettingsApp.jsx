import { useState } from "react";
import { useGame, ATTRIBUTE_META, xpForLevel } from "../context/GameContext";
import { useAuth } from "../context/AuthContext";

const PANES = [
  { id: "profile", label: "Profile" },
  { id: "widgets", label: "Room Widgets" },
  { id: "appearance", label: "Appearance" },
  { id: "flashcards", label: "Flashcards" },
  { id: "accessibility", label: "Accessibility" },
  { id: "account", label: "Account" },
];

/** macOS System Settings-style app: sidebar of panes, detail on the right. */
export default function SettingsApp() {
  const [pane, setPane] = useState("profile");

  return (
    <div className="settings-app">
      <nav className="settings-sidebar" aria-label="Settings sections">
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={pane === p.id ? "is-active" : ""}
            aria-current={pane === p.id ? "page" : undefined}
            onClick={() => setPane(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <section className="settings-pane">
        {pane === "profile" && <ProfilePane />}
        {pane === "widgets" && <WidgetsPane />}
        {pane === "appearance" && <AppearancePane />}
        {pane === "flashcards" && <FlashcardPane />}
        {pane === "accessibility" && <AccessibilityPane />}
        {pane === "account" && <AccountPane />}
      </section>
    </div>
  );
}

function ProfilePane() {
  const { signedIn, stats, attributes, streak, activity, profile } = useGame();

  if (!signedIn) return <p className="settings-guest">Sign in to see your character sheet.</p>;

  const needed = xpForLevel(stats.level);
  const pct = Math.min(100, Math.round((stats.xpIntoLevel / needed) * 100));

  return (
    <>
      <h2>{profile?.name || "Hero"}</h2>
      <p className="settings-sub">Level {stats.level} · {stats.gold} gold · {stats.totalCompleted} quests completed</p>

      <div className="settings-xp">
        <div className="hud-xp" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <small>{stats.xpIntoLevel} / {needed} XP to level {stats.level + 1}</small>
      </div>

      <h3>Attributes</h3>
      <div className="settings-attributes">
        {Object.entries(ATTRIBUTE_META).map(([key, meta]) => {
          const attr = attributes[key] ?? { level: 1, xp: 0 };
          const attrNeeded = xpForLevel(attr.level);
          return (
            <div key={key} className="settings-attr">
              <span aria-hidden="true">{meta.icon}</span>
              <div>
                <b>{meta.label}</b>
                <small>{meta.hint}</small>
                <i className="attr-bar"><b style={{ width: `${Math.min(100, (attr.xp / attrNeeded) * 100)}%` }} /></i>
              </div>
              <em>Lv {attr.level}</em>
            </div>
          );
        })}
      </div>

      <h3>Streak</h3>
      <p className="settings-sub">
        Current {streak.current} day{streak.current === 1 ? "" : "s"} · longest {streak.longest}
      </p>
      <StreakCalendar daily={activity.daily} />
    </>
  );
}

/** Last 26 weeks of quest activity, drawn from the server's daily roll-up. */
function StreakCalendar({ daily }) {
  const byDay = new Map((daily ?? []).map((d) => [d.day, d]));
  const weeks = [];
  const today = new Date();

  // Walk back to the Sunday 25 weeks ago so columns line up as whole weeks.
  const start = new Date(today);
  start.setDate(start.getDate() - 25 * 7 - today.getDay());

  for (let w = 0; w < 26; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      // Build the key from local parts: toISOString would shift the date back
      // a day for anyone east of UTC.
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      week.push({ key, entry: byDay.get(key), future: date > today });
    }
    weeks.push(week);
  }

  const peak = Math.max(1, ...(daily ?? []).map((d) => d.completions));

  return (
    <div className="heatmap streak-calendar" role="img" aria-label="Quest activity over the last 26 weeks">
      {weeks.map((week, w) => (
        <div key={w} className="heatmap-week">
          {week.map((day) => (
            <i
              key={day.key}
              data-level={day.entry ? Math.min(4, Math.ceil((day.entry.completions / peak) * 4)) : 0}
              data-future={day.future ? "true" : undefined}
              title={day.entry ? `${day.entry.completions} quests, ${day.entry.xp} XP on ${day.key}` : day.key}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function AppearancePane() {
  const { signedIn, settings, saveSettings, stats } = useGame();
  const [busy, setBusy] = useState(false);

  if (!signedIn) return <p className="settings-guest">Sign in to change how your room looks.</p>;

  const themes = [
    { id: "default", name: "Daylight", minLevel: 1 },
    { id: "dusk", name: "Dusk", minLevel: 1 },
    { id: "midnight", name: "Midnight", minLevel: 3 },
    { id: "sakura", name: "Sakura", minLevel: 5 },
  ];

  async function pick(theme) {
    setBusy(true);
    try {
      await saveSettings({ theme: theme.id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Appearance</h2>
      <p className="settings-sub">Room themes unlock as you level up.</p>
      <div className="settings-themes">
        {themes.map((theme) => {
          const locked = stats.level < theme.minLevel;
          return (
            <button
              key={theme.id}
              type="button"
              className={`theme-swatch theme-${theme.id} ${settings.theme === theme.id ? "is-active" : ""}`}
              disabled={locked || busy}
              onClick={() => pick(theme)}
            >
              <span />
              <b>{theme.name}</b>
              {locked && <em>Level {theme.minLevel}</em>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function WidgetsPane() {
  const { signedIn, settings, saveSettings } = useGame();

  if (!signedIn) return <p className="settings-guest">Sign in to customize room widgets.</p>;

  const resetPositions = () => {
    ["hud", "clock", "music", "flashcards", "trackers", "calendar"].forEach((id) => {
      try { localStorage.removeItem(`widget_pos_${id}`); } catch (e) {}
    });
    window.location.reload();
  };

  return (
    <>
      <h2>Room Widgets</h2>
      <p className="settings-sub">Toggle and pin movable widgets directly to your 3D room wallpaper.</p>

      <label className="settings-row">
        <span>
          Flashcards widget
          <small>Show flashcards study card overlay on 3D room (left side by default).</small>
        </span>
        <input
          type="checkbox"
          checked={Boolean(settings.showFlashcardsWidget)}
          onChange={(e) => saveSettings({ showFlashcardsWidget: e.target.checked })}
        />
      </label>

      <label className="settings-row">
        <span>
          GitHub & LeetCode trackers widget
          <small>Show developer stats overlay on 3D room (right side by default).</small>
        </span>
        <input
          type="checkbox"
          checked={Boolean(settings.showTrackersWidget)}
          onChange={(e) => saveSettings({ showTrackersWidget: e.target.checked })}
        />
      </label>

      <label className="settings-row">
        <span>
          Calendar widget
          <small>Show today's and upcoming events on the 3D room (right side by default).</small>
        </span>
        <input
          type="checkbox"
          checked={settings.showCalendarWidget !== false}
          onChange={(e) => saveSettings({ showCalendarWidget: e.target.checked })}
        />
      </label>

      <label className="settings-row">
        <span>
          Character HUD widget
          <small>Show Level, XP, Gold, and Streak HUD on 3D room.</small>
        </span>
        <input
          type="checkbox"
          checked={settings.showHudWidget !== false}
          onChange={(e) => saveSettings({ showHudWidget: e.target.checked })}
        />
      </label>

      <label className="settings-row">
        <span>
          Analog Clock widget
          <small>Show live clock widget on 3D room.</small>
        </span>
        <input
          type="checkbox"
          checked={settings.showClockWidget !== false}
          onChange={(e) => saveSettings({ showClockWidget: e.target.checked })}
        />
      </label>

      <div style={{ marginTop: "1.2rem" }}>
        <button type="button" className="journal-primary" onClick={resetPositions}>
          Reset widget positions
        </button>
      </div>
    </>
  );
}

function FlashcardPane() {
  const { signedIn, settings, saveSettings } = useGame();
  const [seconds, setSeconds] = useState(settings.autoplaySeconds ?? 8);

  if (!signedIn) return <p className="settings-guest">Sign in to change flashcard behaviour.</p>;

  return (
    <>
      <h2>Flashcards</h2>
      <label className="settings-row">
        <span>
          Show widget on 3D room
          <small>Displays a movable Flashcards study widget overlay directly in your room.</small>
        </span>
        <input
          type="checkbox"
          checked={Boolean(settings.showFlashcardsWidget)}
          onChange={(e) => saveSettings({ showFlashcardsWidget: e.target.checked })}
        />
      </label>
      <label className="settings-row">
        <span>
          Autoplay interval
          <small>How long each card is shown before the slideshow advances.</small>
        </span>
        <span className="settings-slider">
          <input
            type="range"
            min="3"
            max="20"
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            onMouseUp={() => saveSettings({ autoplaySeconds: seconds })}
            onKeyUp={() => saveSettings({ autoplaySeconds: seconds })}
          />
          <b>{seconds}s</b>
        </span>
      </label>
    </>
  );
}

function AccessibilityPane() {
  const { signedIn, settings, saveSettings } = useGame();

  if (!signedIn) return <p className="settings-guest">Sign in to save accessibility preferences.</p>;

  return (
    <>
      <h2>Accessibility</h2>
      <label className="settings-row">
        <span>
          Reduce motion
          <small>Turns off card flips, reward particles and other animation.</small>
        </span>
        <input
          type="checkbox"
          checked={Boolean(settings.reducedMotion)}
          onChange={(e) => saveSettings({ reducedMotion: e.target.checked })}
        />
      </label>
      <p className="settings-note">
        Your system "reduce motion" setting is respected automatically; this overrides it for this account.
      </p>
    </>
  );
}

function AccountPane() {
  const { signedIn, profile } = useGame();
  const { currentUser, logout } = useAuth();

  if (!signedIn) {
    return (
      <>
        <h2>Account</h2>
        <p className="settings-guest">You're browsing as a guest. <a href="/login">Sign in</a> to save progress.</p>
      </>
    );
  }

  return (
    <>
      <h2>Account</h2>
      <dl className="settings-def">
        <dt>Name</dt><dd>{profile?.name || currentUser?.displayName || "—"}</dd>
        <dt>Email</dt><dd>{currentUser?.email}</dd>
      </dl>
      <button type="button" className="settings-danger" onClick={logout}>Sign out</button>
    </>
  );
}
