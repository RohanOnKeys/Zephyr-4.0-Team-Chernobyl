const dns = require("node:dns").promises;
const net = require("node:net");

/**
 * Tells the in-room browser whether a site can be shown inside an iframe.
 *
 * Most large sites (GitHub, LeetCode, Google...) send X-Frame-Options or a CSP
 * frame-ancestors directive, and the browser refuses to render them in a frame.
 * That can't be overridden client-side, so we look at the headers first and let
 * the UI fall back to "open in a new tab" instead of showing a broken frame.
 *
 * This fetches arbitrary user-supplied URLs, so it is guarded against SSRF:
 * http(s) only, every hop's hostname must resolve to a public address, and
 * redirects are followed manually so a public URL can't bounce to an internal one.
 */

const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;
const MAX_HOPS = 3;

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("Invalid address"), { statusCode: 400 });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw Object.assign(new Error("Only http and https addresses are supported"), { statusCode: 400 });
  }
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw Object.assign(new Error("Site not found"), { statusCode: 404 });
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw Object.assign(new Error("That address is not allowed"), { statusCode: 400 });
  }
  return url;
}

/** True when the response headers forbid being framed by another origin. */
function blocksFraming(headers) {
  const xfo = (headers.get("x-frame-options") || "").toLowerCase();
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return true;

  const csp = (headers.get("content-security-policy") || "").toLowerCase();
  const directive = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-ancestors"));
  if (!directive) return false;
  const sources = directive.split(/\s+/).slice(1);
  // Only a wildcard lets an unrelated origin (our app) embed the page.
  return !sources.includes("*");
}

const frameCheck = async (req, res) => {
  const raw = String(req.query.url || "");

  const cached = cache.get(raw);
  if (cached && Date.now() - cached.at < CACHE_MS) return res.json(cached.result);

  try {
    let url = await assertPublicUrl(raw);
    let response;

    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (LifeRPG frame check)" },
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        url = await assertPublicUrl(new URL(location, url).href);
        continue;
      }
      break;
    }
    // Only headers are needed; don't download the page.
    response.body?.cancel().catch(() => {});

    const result = { url: url.href, embeddable: !blocksFraming(response.headers) };
    cache.set(raw, { at: Date.now(), result });
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    // Timeouts and TLS failures: we genuinely don't know, so let the UI offer a new tab.
    res.json({ url: raw, embeddable: false, unreachable: true });
  }
};

module.exports = { frameCheck, blocksFraming, isPrivateAddress };
