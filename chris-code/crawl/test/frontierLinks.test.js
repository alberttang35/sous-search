#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { parseHtml, extractFrontierLinks } = require("../lib/parseHtml.js");
const { getRecipeUrlPolicy, isAllrecipesDetail, isBudgetBytesDetail, isSeriousEatsDetail } = require("../lib/recipeUrlPolicy.js");
const { parseRobotsSitemaps, parseSitemapLocs, isSitemapIndex } = require("../lib/sitemapSeeds.js");
const { isRichCrawlDoc } = require("../crawlRichStats.js");

function readFixture(name) {
  const p = path.join(__dirname, "fixtures", name);
  return fs.readFileSync(p, "utf8");
}

function testPolicyAllrecipesSlug() {
  const u = new URL("https://www.allrecipes.com/charcuterie-salad-recipe-11952947");
  assert.ok(isAllrecipesDetail(u));
}

function testPolicyAllrecipesLegacy() {
  const u = new URL("https://www.allrecipes.com/recipe/12345/test-dish/");
  assert.ok(isAllrecipesDetail(u));
}

function testPolicyAllrecipesRejectGallery() {
  const u = new URL("https://www.allrecipes.com/gallery/summer-salads");
  assert.ok(!isAllrecipesDetail(u));
}

function testPolicySeriousEats() {
  assert.ok(isSeriousEatsDetail(new URL("https://www.seriouseats.com/recipes/skillet-potatoes-crispy")));
  assert.ok(!isSeriousEatsDetail(new URL("https://www.seriouseats.com/about")));
}

function testPolicyBudgetBytes() {
  assert.ok(isBudgetBytesDetail(new URL("https://www.budgetbytes.com/creamy-tomato-spinach-pasta/")));
  assert.ok(!isBudgetBytesDetail(new URL("https://www.budgetbytes.com/category/chicken/")));
}

function testExtractAllrecipesItemList() {
  const html = readFixture("allrecipes-itemlist.html");
  const dom = parseHtml(html, "https://www.allrecipes.com/chicken/");
  const policy = getRecipeUrlPolicy("multisite");
  const links = extractFrontierLinks(dom, "https://www.allrecipes.com/chicken/", policy, 50);
  assert.ok(links.includes("https://www.allrecipes.com/charcuterie-salad-recipe-11952947"));
  assert.ok(links.includes("https://www.allrecipes.com/poke-scrambled-eggs-recipe-11945628"));
  assert.ok(links.includes("https://www.allrecipes.com/classic-burger-recipe-11900001"));
}

function testExtractSeriousEatsGraph() {
  const html = readFixture("seriouseats-listing.html");
  const dom = parseHtml(html, "https://www.seriouseats.com/recipes/");
  const policy = getRecipeUrlPolicy("multisite");
  const links = extractFrontierLinks(dom, "https://www.seriouseats.com/recipes/", policy, 50);
  assert.ok(links.some((l) => l.includes("skillet-potatoes-crispy")));
  assert.ok(links.some((l) => l.includes("soft-scrambled-eggs")));
}

function testExtractBudgetBytesAnchors() {
  const html = readFixture("budgetbytes-listing.html");
  const dom = parseHtml(html, "https://www.budgetbytes.com/");
  const policy = getRecipeUrlPolicy("multisite");
  const links = extractFrontierLinks(dom, "https://www.budgetbytes.com/", policy, 50);
  assert.deepStrictEqual(links, ["https://www.budgetbytes.com/creamy-tomato-spinach-pasta/"]);
}

function testSitemapParsing() {
  const robots = "User-agent: *\nDisallow: /tmp\n\nSitemap: https://ex.com/s1.xml\n";
  assert.deepStrictEqual(parseRobotsSitemaps(robots), ["https://ex.com/s1.xml"]);

  const idx = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap><loc>https://ex.com/a.xml</loc></sitemap></sitemapindex>`;
  assert.ok(isSitemapIndex(idx));
  assert.deepStrictEqual(parseSitemapLocs(idx), ["https://ex.com/a.xml"]);

  const urlset = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://www.budgetbytes.com/hello-world/</loc></url></urlset>`;
  assert.ok(!isSitemapIndex(urlset));
  assert.deepStrictEqual(parseSitemapLocs(urlset), ["https://www.budgetbytes.com/hello-world/"]);
}

function testRichDoc() {
  assert.ok(isRichCrawlDoc({ ingredients: ["salt"] }));
  assert.ok(isRichCrawlDoc({ times: { totalMinutes: 5 } }));
  assert.ok(!isRichCrawlDoc({ ingredients: [], text: "x" }));
  assert.ok(!isRichCrawlDoc(null));
}

const tests = [
  testPolicyAllrecipesSlug,
  testPolicyAllrecipesLegacy,
  testPolicyAllrecipesRejectGallery,
  testPolicySeriousEats,
  testPolicyBudgetBytes,
  testExtractAllrecipesItemList,
  testExtractSeriousEatsGraph,
  testExtractBudgetBytesAnchors,
  testSitemapParsing,
  testRichDoc,
];

let failed = 0;
for (const t of tests) {
  try {
    t();
    console.error("ok:", t.name);
  } catch (e) {
    failed++;
    console.error("FAIL:", t.name, e);
  }
}

if (failed) {
  process.exit(1);
}
console.error(`All ${tests.length} tests passed.`);
