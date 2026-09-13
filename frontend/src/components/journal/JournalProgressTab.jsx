import SummaryCards from "../habits/SummaryCards";
import WeeklyGrid from "../habits/WeeklyGrid";
import HeatmapChart from "../habits/HeatmapChart";
import LevelCard from "../habits/LevelCard";
import AchievementsPath from "../habits/AchievementsPath";

/** Progress tab of the quest journal: week, consistency, streaks, level. */
export default function JournalProgressTab({ habitsState, stats }) {
  const { habits, heatmap, loading, loaded, error, reload, weekLogsByHabit, activeStreaks, bestStreak, weekRate } =
    habitsState;

  if (loading && !loaded) {
    return (
      <ul className="journal-list" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
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
    <div className="journal-progress">
      <SummaryCards totalHabits={habits.length} activeStreaks={activeStreaks} bestStreak={bestStreak} weekRate={weekRate} />
      <div className="journal-progress-grid">
        <LevelCard stats={stats} />
        <div className="journal-achievements">
          <AchievementsPath stats={stats} />
        </div>
      </div>
      <WeeklyGrid habits={habits} logsByHabit={weekLogsByHabit} />
      <HeatmapChart data={heatmap} />
    </div>
  );
}
