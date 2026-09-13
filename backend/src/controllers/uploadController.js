const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";

/**
 * Proxies a flashcard image to ImgBB.
 *
 * This exists purely so IMGBB_API_KEY stays on the server. Uploading straight
 * from the browser would mean shipping the key to every visitor, where anyone
 * can lift it out of the bundle and burn the quota.
 *
 * The client sends base64 rather than multipart, which is what ImgBB's API
 * wants anyway and saves pulling in a multipart parser.
 */
const uploadImage = async (req, res, next) => {
  try {
    if (!process.env.IMGBB_API_KEY) {
      return res.status(503).json({
        error: "Image uploads are not configured. Set IMGBB_API_KEY on the server.",
      });
    }

    const { image, name } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "An image is required" });
    }

    // Accept either a raw base64 string or a full data URL from a FileReader.
    const base64 = image.includes(",") ? image.split(",").pop() : image;

    // Base64 inflates by ~4/3, so this caps the original file at roughly 8MB.
    if (base64.length > 11_000_000) {
      return res.status(413).json({ error: "Image is too large (8MB maximum)" });
    }

    const body = new URLSearchParams({ image: base64 });
    if (name) body.set("name", String(name).slice(0, 64));

    const response = await fetch(`${IMGBB_ENDPOINT}?key=${process.env.IMGBB_API_KEY}`, {
      method: "POST",
      body,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.data?.url) {
      return res.status(502).json({
        error: payload?.error?.message || "Image host rejected the upload",
      });
    }

    res.status(201).json({
      url: payload.data.url,
      thumbUrl: payload.data.thumb?.url ?? payload.data.url,
      // Kept so the card can clean up after itself when the image is replaced.
      deleteUrl: payload.data.delete_url ?? null,
      width: payload.data.width,
      height: payload.data.height,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadImage };
