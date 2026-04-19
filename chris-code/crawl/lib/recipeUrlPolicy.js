// @ts-check
/**
 * Per-host recipe detail URL rules for multisite crawling.
 * Patterns are aligned with public sitemap/listing samples (2026-04): Allrecipes slug URLs
 * (`…-recipe-<digits>`) and legacy `/recipe/…`; Serious Eats `/recipes/<segment>/…` plus
 * long single-segment article slugs; Budget Bytes Yoast `post-sitemap` single-segment posts
 * with path-prefix exclusions. Hosts that serve sitemaps behind bot challenges may need
 * manual seeds or a browser session when bulk-fetching.
 */
const { URL } = require("url");

/**
 * @typedef {'food_only' | 'multisite'} RecipePolicyPreset
 */

/**
 * @typedef {Object} RecipeUrlPolicy
 * @property {RecipePolicyPreset} preset
 * @property {(urlStr: string) => boolean} isRecipeDetailUrl
 */

/**
 * @param {string} hostname
 * @returns {string}
 */
function normalizeHost(hostname) {
  const h = hostname.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/**
 * @param {URL} u
 * @returns {boolean}
 */
function isFoodComDetail(u) {
  if (normalizeHost(u.hostname) !== "food.com") return false;
  const p = u.pathname || "";
  if (!/\/recipe\//i.test(p)) return false;
  const parts = p.split("/").filter(Boolean);
  return parts.length >= 2 && parts[0].toLowerCase() === "recipe";
}

/**
 * @param {URL} u
 * @returns {boolean}
 */
function isAllrecipesDetail(u) {
  if (normalizeHost(u.hostname) !== "allrecipes.com") return false;
  const raw = u.pathname || "/";
  const p = raw.replace(/\/+$/, "") || "/";
  if (p === "/" || p === "") return false;
  if (/^\/(?:article|gallery|video|kitchen|cook|home|author|profile|user|print|reviews)\b/i.test(p)) {
    return false;
  }
  if (/\/recipe\//i.test(p)) {
    const parts = p.split("/").filter(Boolean);
    return parts.length >= 2 && parts[0].toLowerCase() === "recipe";
  }
  if (/^\/[^/]+-recipe-\d+$/.test(p)) return true;
  return false;
}

/** @type {Set<string>} */
const SE_ROOT_EXCLUDE = new Set([
  "about",
  "contact",
  "login",
  "register",
  "search",
  "subscribe",
  "newsletters",
  "advertise",
  "privacy",
  "terms",
  "shop",
  "authors",
  "contributors",
  "slideshows",
  "user",
  "video",
  "photos",
  "gifts",
  "sitemap",
  "rss",
]);

/**
 * @param {URL} u
 * @returns {boolean}
 */
function isSeriousEatsDetail(u) {
  if (normalizeHost(u.hostname) !== "seriouseats.com") return false;
  const segs = (u.pathname || "/").split("/").filter(Boolean);
  if (!segs.length) return false;
  const first = segs[0].toLowerCase();
  if (SE_ROOT_EXCLUDE.has(first)) return false;
  if (first === "recipes") {
    return segs.length >= 2;
  }
  if (segs.length === 1) {
    const slug = segs[0];
    if (/^page-\d+$/i.test(slug)) return false;
    return slug.length >= 6;
  }
  return false;
}

/** @type {string[]} */
const BB_PATH_PREFIX_BLOCK = [
  "/wp-admin",
  "/wp-login",
  "/wp-content",
  "/cdn-cgi",
  "/search",
  "/login",
  "/category/",
  "/tag/",
  "/author/",
  "/page/",
  "/recipes/",
  "/meal-plan",
  "/about",
  "/contact",
  "/faq",
  "/privacy",
  "/terms",
  "/accessibility",
  "/collaborate",
  "/extra-bytes",
  "/xmlrpc.php",
  "/feed",
  "/wp-json",
];

/**
 * @param {URL} u
 * @returns {boolean}
 */
function isBudgetBytesDetail(u) {
  if (normalizeHost(u.hostname) !== "budgetbytes.com") return false;
  const path = u.pathname || "/";
  const lower = path.toLowerCase();
  for (const prefix of BB_PATH_PREFIX_BLOCK) {
    if (lower.startsWith(prefix)) return false;
  }
  const segs = path.split("/").filter(Boolean);
  if (segs.length !== 1) return false;
  const slug = segs[0].toLowerCase();
  if (slug === "wp-json" || slug === "xmlrpc.php") return false;
  return slug.length >= 3;
}

/**
 * @param {URL} u
 * @returns {boolean}
 */
function isMultisiteRecipeDetail(u) {
  const host = normalizeHost(u.hostname);
  switch (host) {
    case "food.com":
      return isFoodComDetail(u);
    case "allrecipes.com":
      return isAllrecipesDetail(u);
    case "seriouseats.com":
      return isSeriousEatsDetail(u);
    case "budgetbytes.com":
      return isBudgetBytesDetail(u);
    default:
      return false;
  }
}

/**
 * @param {string} urlStr
 * @param {(url: URL) => boolean} predicate
 * @returns {boolean}
 */
function safeTestUrl(urlStr, predicate) {
  try {
    return predicate(new URL(urlStr));
  } catch (_e) {
    return false;
  }
}

/**
 * @param {RecipePolicyPreset} preset
 * @returns {RecipeUrlPolicy}
 */
function getRecipeUrlPolicy(preset) {
  if (preset === "food_only") {
    return {
      preset,
      isRecipeDetailUrl: (urlStr) => safeTestUrl(urlStr, isFoodComDetail),
    };
  }
  return {
    preset: "multisite",
    isRecipeDetailUrl: (urlStr) => safeTestUrl(urlStr, isMultisiteRecipeDetail),
  };
}

module.exports = {
  normalizeHost,
  getRecipeUrlPolicy,
  isFoodComDetail,
  isAllrecipesDetail,
  isSeriousEatsDetail,
  isBudgetBytesDetail,
  isMultisiteRecipeDetail,
};
