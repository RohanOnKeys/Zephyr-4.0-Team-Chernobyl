const { getOrCreateUser, updateSettings } = require("../services/userService");

const getMe = async (req, res, next) => {
  try {
    // req.user is populated by authMiddleware from the decoded Firebase token.
    const { uid, email, name, picture } = req.user;

    // Creates the Postgres profile on first sign-in, otherwise just loads it.
    const dbUser = await getOrCreateUser(uid, email, name);

    res.status(200).json({
      uid,
      email,
      name: dbUser.displayName,
      picture: picture || null,
      // The whole character sheet, so the room HUD can render level, XP,
      // attributes and streak from a single request on load.
      stats: dbUser.stats,
      attributes: dbUser.attributes,
      streak: dbUser.streak,
      integrations: dbUser.integrations,
      settings: dbUser.settings,
    });
  } catch (error) {
    next(error);
  }
};

// Persist user preferences so they follow the account across devices.
const putSettings = async (req, res, next) => {
  try {
    const settings = req.body;

    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return res.status(400).json({ error: "Settings must be an object" });
    }

    res.status(200).json({ settings: await updateSettings(req.user.uid, settings) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
};

module.exports = { getMe, putSettings };
