/**
 * Classifies a URL the in-laptop browser opened, so the server can grant a
 * small productivity reward for study/coding destinations.
 *
 * Matching is on hostname labels, never on substrings: "notgithub.com" and
 * "github.com.evil.co" both fail, while "en.wikipedia.org" passes.
 */

const CODING_SITES = [
  "github.com",
  "gitlab.com",
  "leetcode.com",
  "stackoverflow.com",
  "codeforces.com",
  "hackerrank.com",
  "codechef.com",
  "replit.com",
  "developer.mozilla.org",
  "geeksforgeeks.org",
];

const STUDY_SITES = [
  "wikipedia.org",
  "notion.so",
  "khanacademy.org",
  "coursera.org",
  "edx.org",
  "brilliant.org",
  "quizlet.com",
  "scholar.google.com",
  "arxiv.org",
];

/** True when `host` is `domain` itself or a subdomain of it. */
function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function hostnameOf(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    // URL() needs a scheme; bare "github.com/foo" is common in an address bar.
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch (err) {
    return "";
  }
}

/** "study_site" | "coding_site" | null */
export function classifySite(url) {
  const host = hostnameOf(url);
  if (!host) return null;
  if (CODING_SITES.some((domain) => hostMatches(host, domain))) return "coding_site";
  if (STUDY_SITES.some((domain) => hostMatches(host, domain))) return "study_site";
  return null;
}

/** Exposed so the browser start page can offer the rewarded sites as shortcuts. */
export function siteHostname(url) {
  return hostnameOf(url);
}

export { CODING_SITES, STUDY_SITES };
