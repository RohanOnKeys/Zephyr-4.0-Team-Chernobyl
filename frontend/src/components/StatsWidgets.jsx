import { useCallback, useEffect, useState } from "react";
import { useGame } from "../context/GameContext";
import * as api from "../lib/api";

/**
 * GitHub and LeetCode dashboards for the laptop OS.
 *
 * Usernames are stored per account on the server, so the widgets follow the
 * user across devices rather than living in this browser.
 */
export default function StatsWidgets() {
  const { currentUser, signedIn, profile, settings, saveSettings } = useGame();

  const [github, setGithub] = useState("");
  const [leetcode, setLeetcode] = useState("");
  const [githubStats, setGithubStats] = useState(null);
  const [leetcodeStats, setLeetcodeStats] = useState(null);
  const [githubError, setGithubError] = useState("");
  const [leetcodeError, setLeetcodeError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setGithub(profile?.integrations?.github || "");
    setLeetcode(profile?.integrations?.leetcode || "");
  }, [profile]);

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);

    const results = await Promise.allSettled([
      profile?.integrations?.github ? api.getGithubStats(currentUser) : Promise.resolve(null),
      profile?.integrations?.leetcode ? api.getLeetcodeStats(currentUser) : Promise.resolve(null),
    ]);

    // Settled rather than all: one broken username must not blank the other card.
    const [gh, lc] = results;
    if (gh.status === "fulfilled") { setGithubStats(gh.value); setGithubError(""); }
    else { setGithubStats(null); setGithubError(gh.reason?.message || "Could not load GitHub"); }

    if (lc.status === "fulfilled") { setLeetcodeStats(lc.value); setLeetcodeError(""); }
    else { setLeetcodeStats(null); setLeetcodeError(lc.reason?.message || "Could not load LeetCode"); }

    setLoading(false);
  }, [currentUser, profile]);

  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.saveIntegrations(currentUser, { github: github.trim(), leetcode: leetcode.trim() });
      await load();
    } catch (err) {
      setGithubError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="stats-app cards-guest">
        <h2>Trackers</h2>
        <p>Sign in to connect your GitHub and LeetCode profiles.</p>
      </div>
    );
  }

  return (
    <div className="stats-app">
      <header className="cards-head">
        <div><span className="cards-kicker">Connected</span><h2>Developer trackers</h2></div>
      </header>

      <div style={{ margin: "0.5rem 0 1rem", padding: "0.65rem 0.85rem", background: "rgba(25, 40, 50, 0.06)", border: "1px solid rgba(25, 40, 50, 0.14)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong style={{ display: "block", color: "#1e293b", fontSize: "0.8rem", fontWeight: "700" }}>Show Trackers widget on 3D room</strong>
          <small style={{ color: "#475569", fontSize: "0.68rem" }}>Pins developer stats directly to your room wallpaper.</small>
        </div>
        <input
          type="checkbox"
          style={{ width: "1.15rem", height: "1.15rem", cursor: "pointer", accentColor: "#0284c7" }}
          checked={Boolean(settings.showTrackersWidget)}
          onChange={(e) => saveSettings({ showTrackersWidget: e.target.checked })}
        />
      </div>

      <form className="stats-form" onSubmit={save}>
        <label>
          <span>GitHub username</span>
          <input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="octocat" />
        </label>
        <label>
          <span>LeetCode username</span>
          <input value={leetcode} onChange={(e) => setLeetcode(e.target.value)} placeholder="leetcoder" />
        </label>
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save & refresh"}</button>
      </form>

      {loading && <p className="cards-loading">Fetching stats…</p>}

      <div className="stats-grid">
        <GithubCard stats={githubStats} error={githubError} />
        <LeetcodeCard stats={leetcodeStats} error={leetcodeError} />
      </div>
    </div>
  );
}

function GithubCard({ stats, error }) {
  const githubSvg = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "sub", marginRight: 6 }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );

  if (error) return <section className="stat-card is-error"><h3>{githubSvg}GitHub</h3><p>{error}</p></section>;
  if (!stats) return <section className="stat-card is-empty"><h3>{githubSvg}GitHub</h3><p>Add a username to see your contributions.</p></section>;

  return (
    <section className="stat-card stat-github">
      <header>
        {stats.avatarUrl && <img src={stats.avatarUrl} alt="" width="44" height="44" />}
        <div>
          <h3>{githubSvg}{stats.name || stats.username}</h3>
          <a href={stats.profileUrl} target="_blank" rel="noreferrer noopener">@{stats.username}</a>
        </div>
      </header>

      <div className="stat-numbers">
        <div><b>{stats.publicRepos}</b><span>Repos</span></div>
        <div><b>{stats.followers}</b><span>Followers</span></div>
        {stats.totalContributions !== null && <div><b>{stats.totalContributions}</b><span>Contributions</span></div>}
        {stats.currentStreak !== null && <div><b>{stats.currentStreak}</b><span>Day streak</span></div>}
      </div>

      {stats.days ? (
        <ContributionHeatmap days={stats.days} bestDay={stats.bestDay} />
      ) : (
        <p className="stat-note">
          Set <code>GITHUB_TOKEN</code> on the server to unlock the contribution graph.
        </p>
      )}
    </section>
  );
}

/** The familiar contribution grid: one column per week, one square per day. */
function ContributionHeatmap({ days, bestDay }) {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // Scale against the user's own best day so a quiet year still shows contrast.
  const peak = Math.max(bestDay || 0, 1);
  const level = (count) => (count === 0 ? 0 : Math.min(4, Math.ceil((count / peak) * 4)));

  return (
    <div className="heatmap" role="img" aria-label={`Contribution activity, best day ${bestDay} contributions`}>
      {weeks.map((week, w) => (
        <div key={w} className="heatmap-week">
          {week.map((day) => (
            <i
              key={day.date}
              data-level={level(day.contributionCount)}
              title={`${day.contributionCount} on ${day.date}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function LeetcodeCard({ stats, error }) {
  const leetcodeSvg = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffa116" style={{ verticalAlign: "sub", marginRight: 6 }}>
      <path d="M16.102 17.93l-2.697 2.607a1.376 1.376 0 0 1-1.923 0L2.109 11.291a1.376 1.376 0 0 1 0-1.923l9.373-9.246a1.376 1.376 0 0 1 1.923 0l2.697 2.607c.53.522.53 1.385 0 1.907L9.629 10.33l6.473 5.693c.53.522.53 1.385 0 1.907z" />
    </svg>
  );

  if (error) return <section className="stat-card is-error"><h3>{leetcodeSvg}LeetCode</h3><p>{error}</p></section>;
  if (!stats) return <section className="stat-card is-empty"><h3>{leetcodeSvg}LeetCode</h3><p>Add a username to see your solved problems.</p></section>;

  const total = Math.max(stats.totalSolved, 1);
  const bars = [
    { label: "Easy", value: stats.easySolved, key: "easy" },
    { label: "Medium", value: stats.mediumSolved, key: "medium" },
    { label: "Hard", value: stats.hardSolved, key: "hard" },
  ];

  return (
    <section className="stat-card stat-leetcode">
      <header>
        <div>
          <h3>{leetcodeSvg}LeetCode</h3>
          <a href={`https://leetcode.com/${stats.username}/`} target="_blank" rel="noreferrer noopener">
            @{stats.username}
          </a>
        </div>
        <strong className="leet-total">{stats.totalSolved}</strong>
      </header>

      <div className="leet-bars">
        {bars.map((bar) => (
          <div key={bar.key} className={`leet-bar leet-${bar.key}`}>
            <span>{bar.label}</span>
            <i><b style={{ width: `${(bar.value / total) * 100}%` }} /></i>
            <em>{bar.value}</em>
          </div>
        ))}
      </div>

      <div className="stat-numbers">
        <div><b>{stats.currentStreak}</b><span>Day streak</span></div>
        <div><b>{stats.totalActiveDays}</b><span>Active days</span></div>
        {stats.ranking && <div><b>#{stats.ranking.toLocaleString()}</b><span>Ranking</span></div>}
      </div>
    </section>
  );
}
