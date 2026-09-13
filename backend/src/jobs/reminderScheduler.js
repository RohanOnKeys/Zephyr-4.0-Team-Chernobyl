const cron = require("node-cron");
const { query } = require("../config/db");
const { sendMail } = require("../services/emailService");

function currentHHMM() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

async function sendDueReminders() {
  const { rows } = await query(
    `SELECT h.name, u.email
       FROM habits h
       JOIN users u ON u.uid = h.user_id
      WHERE h.reminder_time = $1 AND NOT h.is_archived`,
    [currentHHMM()]
  );

  for (const row of rows) {
    if (!row.email) continue;
    await sendMail({
      to: row.email,
      subject: `Reminder: ${row.name}`,
      text: `Time for your habit "${row.name}" — open Habitify to check it off.`,
    });
  }
}

// Runs once a minute, matching each habit's reminderTime (HH:MM) against
// the server's local clock. There's no per-user timezone stored yet, so
// this assumes the server and the user are in the same timezone — fine
// for a single-region deploy, worth revisiting if users span timezones.
function startReminderScheduler() {
  cron.schedule("* * * * *", () => {
    sendDueReminders().catch((err) => console.error("Reminder scheduler error:", err.message));
  });
  console.log("✅ Reminder scheduler started (checks every minute).");
}

module.exports = { startReminderScheduler, sendDueReminders };
