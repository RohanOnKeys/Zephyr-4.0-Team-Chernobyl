# Habitify

<p align="center">
  <img src="frontend/public/mascot/wave.png" alt="Habitify mascot" width="130" />
</p>

<p align="center">
  <strong>Turn daily habits, todos, and coding activity into an RPG-style adventure.</strong>
</p>

<p align="center">
  A gamified productivity and habit-tracking web application designed to help you build consistency, complete daily quests, maintain streaks, and track your personal growth.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#project-structure">Project Structure</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#roadmap">Roadmap</a>
</p>

---

## Preview

<p align="center">
  <strong>Habitify — Level Up Your Life, One Habit at a Time</strong>
</p>

<br />

<table align="center">
  <tr>
    <td align="center">
      <img
        src="frontend/public/login.png"
        alt="Habitify landing page"
        width="420"
      />
    </td>
    <td align="center">
      <img
        src="frontend/public/lofi.png"
        alt="Habitify dashboard"
        width="420"
      />
    </td>
  </tr>
  <tr>
    <td align="center">
      <img
        src="frontend/public/journal.png"
        alt="Habitify habit tracking"
        width="420"
      />
    </td>
    <td align="center">
      <img
        src="frontend/public/quest.png"
        alt="Habitify coding integrations"
        width="420"
      />
    </td>
  </tr>
</table>

<p align="center">
  <em>
    A gamified productivity dashboard for habits, quests, streaks,
    and coding progress.
  </em>
</p>


### Live Demo

* **App:** [zephyr-4-0-team-chernobyl.vercel.app](https://zephyr-4-0-team-chernobyl.vercel.app)
* **Backend API:** [zephyr-4-0-team-chernobyl.onrender.com](https://zephyr-4-0-team-chernobyl.onrender.com/api/health)

> Backend is on Render's free tier, so the first request after a period of inactivity can take ~30s to wake up.

---

## About Habitify

Traditional habit trackers can quickly become repetitive. Habitify makes personal growth more engaging by turning everyday productivity into a game-like progression system.

With Habitify, users can:

* Create and complete daily habits
* Manage todos and recurring tasks
* Build and maintain streaks
* Track personal productivity
* Monitor GitHub activity
* Track LeetCode progress
* View their progress through an RPG-inspired dashboard

Every completed action represents progress toward becoming a better version of yourself.

> **Complete quests. Build streaks. Level up your life.**

---

## Features

- **Auth** - Firebase Authentication (email/password + Google) on the frontend, verified on the backend via Firebase Admin.
- **Tasks** - Legacy one-off habit/daily/todo items with a single `completed` flag, stored per-user in Firestore (`backend/src/controllers/taskController.js`).
- **Habit tracker** - Recurring habits with daily completion logging, current/longest streaks, a weekly calendar grid, and a 90-day heatmap. Completing a habit grants XP/gold and can level you up (`backend/src/services/userService.js`). Confetti fires on each completion, a bigger burst on completing every habit for the day, and a milestone burst on streak milestones (3, 7, 14, 30... days) or a level-up. See `backend/README.md` for the `/api/habits` and `/api/logs` endpoints.
- **Journey map** - A Duolingo-style path of achievement nodes (streak, completion count, and level milestones), unlocked as your stats cross each threshold (`frontend/src/utils/achievements.js`). Computed client-side from the same stats the level card uses — no separate achievements backend.
- **Reminders** - An optional time-of-day per habit (`reminderTime`). While the dashboard tab is open and notifications are allowed, a browser notification fires at that time (`frontend/src/components/habits/RemindersCard.jsx`). The same `reminderTime` also drives an email alert via SMTP (`backend/src/jobs/reminderScheduler.js`) so it still reaches you with the tab closed — SMTP is optional, see `backend/README.md`.
- **GitHub & LeetCode tracking** - Users save their GitHub/LeetCode usernames once, and the dashboard pulls live public stats (repos, contribution streak, problems solved, ranking) on each visit. Details and setup in `backend/README.md`.

---

## Tech Stack

### Frontend

* React 19 + Vite
* Tailwind CSS v4
* Firebase Authentication (email/password + Google)
* `canvas-confetti`, `lucide-react`

### Backend

* Node.js + Express 5
* Firebase Admin SDK (auth verification + Firestore)
* `node-cron` for the reminder scheduler, `nodemailer` for email alerts
* Public GitHub REST/GraphQL and LeetCode GraphQL APIs for the coding-activity integration

### Hosting

* Frontend on Vercel, backend on Render (see Live Demo above)

---

## Project Structure

```text
.
├── backend/                 Express API
│   └── src/
│       ├── controllers/     Route handlers (habits, logs, tasks, users, integrations)
│       ├── routes/
│       ├── services/        Firestore access, rewards logic, GitHub/LeetCode clients
│       ├── jobs/             node-cron reminder scheduler
│       ├── middleware/      Auth verification, error handling
│       └── config/          Firebase Admin init
└── frontend/                React (Vite) app
    └── src/
        ├── pages/           Login, Register, Dashboard
        ├── components/      Habit tracker UI (cards, modals, mascot, journey path)
        ├── context/         Firebase auth context
        ├── lib/             Firebase client + backend API wrapper
        └── utils/           Streaks, achievements, confetti, habit colors/icons
```

See `backend/README.md` and `frontend/README.md` for endpoint- and component-level detail.

---

## Getting Started

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in Firebase Admin credentials — see backend/README.md
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # fill in Firebase client config
npm run dev
```

### 3. Open the app

Open `http://localhost:5173`. The backend needs Firestore and Authentication (Email/Password + Google) enabled in the Firebase Console project before either side will actually work — see `backend/README.md`.

---

## Roadmap

* Timezone-aware reminders (currently assumes the server and user share a clock — fine for one region, not correct across them)
* Push notifications instead of the current tab-must-be-open browser notification
* Migrate the legacy `tasks` model onto the same habits/logs data the tracker uses, or retire it
* Trim Render cold-start time on the free tier (or move to a plan that stays warm)
