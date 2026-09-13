import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Plus, Sparkles, Map } from "lucide-react";
import { getMe } from "../lib/api";
import { STREAK_MILESTONES } from "../utils/dateHelpers";
import { celebrate, celebrateBig, celebrateMilestone } from "../utils/confetti";
import useHabits from "../hooks/useHabits";
import IntegrationsPanel from "../components/IntegrationsPanel";
import Modal from "../components/habits/Modal";
import HabitForm from "../components/habits/HabitForm";
import TodayHabitCard from "../components/habits/TodayHabitCard";
import WeeklyGrid from "../components/habits/WeeklyGrid";
import HeatmapChart from "../components/habits/HeatmapChart";
import SummaryCards from "../components/habits/SummaryCards";
import ProgressRing from "../components/habits/ProgressRing";
import LoadingSpinner from "../components/habits/LoadingSpinner";
import MorningMotivation from "../components/habits/MorningMotivation";
import WeeklySummary from "../components/habits/WeeklySummary";
import StreakRecoveryCard from "../components/habits/StreakRecoveryCard";
import HabitSuggestionModal from "../components/habits/HabitSuggestionModal";
import LevelCard from "../components/habits/LevelCard";
import AchievementsPath from "../components/habits/AchievementsPath";
import RemindersCard from "../components/habits/RemindersCard";
import { getAchievementProgress } from "../utils/achievements";
import Mascot, { celebrationPoseForCategory } from "../components/habits/Mascot";

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [backendUser, setBackendUser] = useState(null);

  const {
    habits,
    heatmap,
    loading,
    completedTodayIds,
    weekLogsByHabit,
    streaksById,
    todayProgress,
    activeStreaks,
    bestStreak,
    weekRate,
    recoveryHabit,
    dismissRecovery,
    toggleHabit: toggleHabitRequest,
    saveHabit: saveHabitRequest,
    removeHabit,
    archiveHabit,
  } = useHabits(currentUser);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [celebrationMascot, setCelebrationMascot] = useState(false);
  const [celebrationPose, setCelebrationPose] = useState("celebrate");

  function showCelebrationMascot(pose = "celebrate") {
    setCelebrationPose(pose);
    setCelebrationMascot(true);
    setTimeout(() => setCelebrationMascot(false), 1800);
  }

  useEffect(() => {
    if (!currentUser) return;
    getMe(currentUser).then(setBackendUser).catch(console.error);
  }, [currentUser]);

  const achievements = useMemo(() => getAchievementProgress(backendUser?.stats || {}), [backendUser?.stats]);
  const unlockedAchievements = achievements.filter((a) => a.unlocked).length;

  async function handleLogout() {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleHabit(habit) {
    const previousLevel = backendUser?.stats?.level;
    const { completed, stats, newStreak, completedAll } = await toggleHabitRequest(habit);
    if (stats) setBackendUser((u) => (u ? { ...u, stats } : u));
    if (!completed) return;

    celebrate();
    showCelebrationMascot(celebrationPoseForCategory(habit.category));

    const hitMilestone = STREAK_MILESTONES.includes(newStreak);
    const leveledUp = previousLevel != null && stats?.level > previousLevel;
    if (hitMilestone || leveledUp) {
      setTimeout(celebrateMilestone, 150);
    }

    if (completedAll) {
      setTimeout(celebrateBig, 300);
    }
  }

  async function saveHabit(data) {
    setSubmitting(true);
    try {
      await saveHabitRequest(data, editing);
      setFormOpen(false);
      setEditing(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(habit) {
    await removeHabit(habit);
    setDeleteTarget(null);
  }

  async function handleArchive(habit) {
    await archiveHabit(habit);
  }

  async function acceptSuggestion(s) {
    await saveHabitRequest({
      name: s.name,
      description: s.description,
      category: s.category,
      icon: s.icon,
      frequency: s.frequency,
      targetDays: s.frequency === "daily" ? 7 : 3,
    });
  }

  if (loading) return <LoadingSpinner full />;

  return (
    <div className="min-h-screen bg-[#04120f] text-[#e8f7f1] p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-center gap-3">
            <Mascot pose="wave" size={56} />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Hey {(backendUser?.name || currentUser?.displayName || "there").split(" ")[0]}
              </h1>
              <MorningMotivation />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate("/study-girl")}
              className="px-3 py-2 text-sm font-medium text-[#071512] bg-[#f0c674] hover:bg-[#ffd98c] rounded-lg flex items-center gap-1.5"
            >
              <Map size={14} />
              Enter Lo-Fi Room
            </button>
            <button
              onClick={() => setSuggestOpen(true)}
              className="px-3 py-2 text-sm text-[#a8d8c8] border border-[#17493e] rounded-lg hover:bg-[#0d2e27] flex items-center gap-1.5"
            >
              <Sparkles size={14} />
              Suggest
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="px-3 py-2 text-sm font-medium bg-[#159c86] hover:bg-[#0d6b5a] text-black rounded-lg flex items-center gap-1.5"
            >
              <Plus size={14} />
              New habit
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm border border-[#17493e] rounded-lg hover:bg-[#0d2e27] text-[#a8d8c8]"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            <SummaryCards
              totalHabits={habits.length}
              activeStreaks={activeStreaks}
              bestStreak={bestStreak}
              weekRate={weekRate}
            />

            {recoveryHabit && (
              <StreakRecoveryCard
                habit={recoveryHabit}
                onDismiss={dismissRecovery}
              />
            )}

            <div className="bg-[#c9ede0] border border-[#9ed9c4] rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-medium text-black">Today's habits</div>
                  <div className="text-xs text-[#6b9285]">
                    {completedTodayIds.size} of {habits.length} complete
                  </div>
                </div>
                <div className="relative w-[52px] h-[52px]">
                  <ProgressRing value={todayProgress} size={52} stroke={5} />
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-black">
                    {todayProgress}%
                  </div>
                </div>
              </div>

              {habits.length === 0 ? (
                <div className="text-center py-10">
                  <Mascot pose="gasp" size={72} className="mx-auto mb-3" />
                  <div className="font-medium">Let's build your first habit</div>
                  <div className="text-sm text-[#6b9285] mt-1">
                    Start small — something you can do in under 5 minutes.
                  </div>
                  <button
                    onClick={() => setFormOpen(true)}
                    className="mt-4 px-4 py-2 text-sm font-medium bg-[#159c86] hover:bg-[#0d6b5a] text-black rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    Create habit
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {habits.map((h) => (
                    <TodayHabitCard
                      key={h.id}
                      habit={h}
                      completed={completedTodayIds.has(h.id)}
                      streak={streaksById[h.id]?.current || 0}
                      onToggle={() => toggleHabit(h)}
                      onEdit={() => {
                        setEditing(h);
                        setFormOpen(true);
                      }}
                      onArchive={() => handleArchive(h)}
                      onDelete={() => setDeleteTarget(h)}
                    />
                  ))}
                </div>
              )}
            </div>

            <WeeklySummary weekRate={weekRate} activeStreaks={activeStreaks} totalHabits={habits.length} />

            <IntegrationsPanel />
          </div>

          <div className="space-y-6 lg:sticky lg:top-8">
            <button
              onClick={() => setJourneyOpen(true)}
              className="w-full flex items-center gap-3 bg-[#c9ede0] border border-[#9ed9c4] rounded-xl p-4 hover:bg-[#bfe8d8] transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-[#a8ddc7] flex items-center justify-center text-[#159c86] shrink-0">
                <Map size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#0d2b24]">Journey</div>
                <div className="text-xs text-[#6b9285]">
                  {unlockedAchievements}/{achievements.length} milestones
                </div>
              </div>
            </button>

            <LevelCard stats={backendUser?.stats} />
            <RemindersCard habits={habits} />
            <WeeklyGrid habits={habits} logsByHabit={weekLogsByHabit} />
            <HeatmapChart data={heatmap} />
          </div>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit habit" : "New habit"}
      >
        <HabitForm
          initial={editing}
          submitting={submitting}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={saveHabit}
        />
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete habit?" maxWidth="max-w-sm">
        <p className="text-sm text-[#3f6359]">
          This will permanently delete <span className="font-medium text-[#0d2b24]">{deleteTarget?.name}</span> and
          all its history. This can't be undone.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm rounded-lg text-[#3f6359] hover:bg-[#bfe8d8]"
          >
            Cancel
          </button>
          <button
            onClick={() => handleDelete(deleteTarget)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[#c0392b] hover:bg-[#a5311f] text-black"
          >
            Delete
          </button>
        </div>
      </Modal>

      <HabitSuggestionModal open={suggestOpen} onClose={() => setSuggestOpen(false)} onAccept={acceptSuggestion} />

      <Modal open={journeyOpen} onClose={() => setJourneyOpen(false)} title="Journey" maxWidth="max-w-sm">
        <AchievementsPath stats={backendUser?.stats} />
      </Modal>

      {celebrationMascot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <Mascot pose={celebrationPose} size={180} className="animate-bounce" />
        </div>
      )}
    </div>
  );
}
