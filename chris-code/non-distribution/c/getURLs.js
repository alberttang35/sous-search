#!/usr/bin/env node

/*
Extract all URLs from a web page.
Usage: page.html > ./getURLs.js <base_url>
*/

const readline = require('readline');
const {JSDOM} = require('jsdom');
const {extractAnchorUrls} = require('../../crawl/lib/links.js');

// 1. Read the base URL from the command-line argument using `process.argv`.
let baseURL = process.argv[2];

if (baseURL.endsWith('index.html')) {
  baseURL = baseURL.slice(0, baseURL.length - 'index.html'.length);
} else {
  baseURL += '/';
}

const rl = readline.createInterface({
  input: process.stdin,
});

let html = '';

rl.on('line', (line) => {
  // 2. Read HTML input from standard input (stdin) line by line using the `readline` module.
  html += line;
});

rl.on('close', () => {
  // 3. Parse HTML using jsdom
  const dom = new JSDOM(html, {url: baseURL});
  const document = dom.window.document;
  // 4–5. Anchor hrefs → absolute, normalized URLs (shared with chris-code/crawl).
  for (const normalizedURL of extractAnchorUrls(document, baseURL)) {
    console.log(normalizedURL);
  }
});


