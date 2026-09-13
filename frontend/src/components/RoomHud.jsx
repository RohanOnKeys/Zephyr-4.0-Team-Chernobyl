import { useEffect, useState } from "react";
import { useGame, ATTRIBUTE_META } from "../context/GameContext";

/**
 * Compact character sheet pinned in the room: level, XP bar, gold and streak.
 * Deliberately small so the 3D room stays the focus - detail lives in the
 * journal and the Settings profile pane.
 */
export default function RoomHud({ onOpenJournal }) {
  const { signedIn, stats, streak, attributes, xpNeeded, lastReward, clearReward, settings } = useGame();
  const [expanded, setExpanded] = useState(false);
  const [celebration, setCelebration] = useState(null);

  const reducedMotion = settings.reducedMotion;

  // Surface the server's reward, then clear it so the animation only runs once.
  useEffect(() => {
    if (!lastReward) return;
    setCelebration(lastReward);
    clearReward();
    const timer = window.setTimeout(() => setCelebration(null), reducedMotion ? 2200 : 3200);
    return () => window.clearTimeout(timer);
  }, [lastReward, clearReward, reducedMotion]);

  if (!signedIn) {
    return (
      <aside className="room-hud room-hud-guest">
        <strong>Guest</strong>
        <p>Sign in to track quests and earn XP.</p>
      </aside>
    );
  }

  const pct = Math.min(100, Math.round((stats.xpIntoLevel / xpNeeded) * 100));

  return (
    <>
      <aside className={`room-hud ${expanded ? "is-expanded" : ""}`} aria-label="Character stats">
        <button
          type="button"
          className="room-hud-summary"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="hud-level" aria-hidden="true">{stats.level}</span>
          <span className="hud-meta">
            <b>Level {stats.level}</b>
            <small>{stats.xpIntoLevel} / {xpNeeded} XP</small>
          </span>
          <span className="hud-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        </button>

        <div className="hud-xp" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
             aria-label={`Experience toward level ${stats.level + 1}`}>
          <i style={{ width: `${pct}%` }} />
        </div>

        <div className="hud-chips">
          <span className="hud-chip hud-gold" title="Gold">◈ {stats.gold}</span>
          <span className={`hud-chip hud-streak ${streak.current > 0 ? "is-live" : ""}`} title="Day streak">
            ▲ {streak.current}
          </span>
          <span className="hud-chip" title="Quests completed">✓ {stats.totalCompleted}</span>
        </div>

        {expanded && (
          <div className="hud-attributes">
            {Object.entries(ATTRIBUTE_META).map(([key, meta]) => {
              const attr = attributes[key] ?? { level: 1, xp: 0 };
              return (
                <div key={key} className="hud-attribute">
                  <span aria-hidden="true">{meta.icon}</span>
                  <b>{meta.label}</b>
                  <em>Lv {attr.level}</em>
                </div>
              );
            })}
            <button type="button" className="hud-journal-link" onClick={onOpenJournal}>
              Open quest journal
            </button>
          </div>
        )}
      </aside>

      {celebration && (
        <div className={`reward-toast ${celebration.leveledUp ? "is-levelup" : ""} ${reducedMotion ? "is-still" : ""}`}
             role="status" aria-live="polite">
          {celebration.leveledUp && <strong className="reward-levelup">Level {celebration.stats.level}</strong>}
          <span className="reward-xp">+{celebration.xpGained} XP</span>
          {celebration.goldGained > 0 && <span className="reward-gold">+{celebration.goldGained} gold</span>}
          {celebration.attribute && (
            <span className="reward-attr">
              {ATTRIBUTE_META[celebration.attribute.name]?.icon} {ATTRIBUTE_META[celebration.attribute.name]?.label}
              {celebration.attribute.leveledUp ? ` Lv ${celebration.attribute.level}` : ""}
            </span>
          )}
          {/* Particles are pure decoration, so they're dropped entirely when the
              user has asked for reduced motion rather than just slowed down. */}
          {!reducedMotion && (
            <span className="reward-sparks" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--spark": i }} />)}
            </span>
          )}
        </div>
      )}
    </>
  );
}
