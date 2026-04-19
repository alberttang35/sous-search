#!/usr/bin/env node
/**
 * Build crawl seed URLs from robots.txt → sitemaps, filtered by multisite recipe URL policy.
 *
 * Usage (from chris-code/):
 *   node crawl/run-build-sitemap-seeds.js --site budgetbytes --max 5000 --out seeds.txt
 *   node crawl/run-build-sitemap-seeds.js --site allrecipes --max 1000
 *
 * Note: Some hosts return Cloudflare interstitials to automated clients; seeds may be empty.
 * Budget Bytes post sitemaps typically work with a normal User-Agent.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { getRecipeUrlPolicy } = require("./lib/recipeUrlPolicy.js");
const { buildSeedsFromRobots } = require("./lib/sitemapSeeds.js");

/** @type {Record<string, string>} */
const ROBOTS_BY_SITE = {
  food: "https://www.food.com/robots.txt",
  allrecipes: "https://www.allrecipes.com/robots.txt",
  seriouseats: "https://www.seriouseats.com/robots.txt",
  budgetbytes: "https://www.budgetbytes.com/robots.txt",
};

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option("site", {
      type: "string",
      demandOption: true,
      describe: "food | allrecipes | seriouseats | budgetbytes",
    })
    .option("max", {
      type: "number",
      default: 50_000,
      describe: "Maximum seed URLs after filtering",
    })
    .option("out", {
      type: "string",
      describe: "Write one URL per line to this file (default: stdout)",
    })
    .option("preset", {
      type: "string",
      default: "multisite",
      choices: ["multisite", "food_only"],
      describe: "Recipe URL filter preset",
    })
    .strict()
    .help()
    .parse();

  const robotsUrl = ROBOTS_BY_SITE[argv.site];
  if (!robotsUrl) {
    console.error(`Unknown site: ${argv.site}. Use one of: ${Object.keys(ROBOTS_BY_SITE).join(", ")}`);
    process.exit(1);
  }

  const policy = getRecipeUrlPolicy(argv.preset === "food_only" ? "food_only" : "multisite");
  const seeds = await buildSeedsFromRobots({
    robotsUrl,
    filterUrl: (u) => policy.isRecipeDetailUrl(u),
    maxUrls: argv.max,
  });

  const text = seeds.join("\n") + (seeds.length ? "\n" : "");
  if (argv.out) {
    const dir = path.dirname(argv.out);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(argv.out, text, "utf8");
    console.error(`Wrote ${seeds.length} URLs to ${argv.out}`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
