#!/usr/bin/env node

/*
Extract all text from an HTML page.
Usage: input > ./getText.js > output
*/

const {convert} = require('html-to-text');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
});

const options = {
  wordwrap: false,
  preserveNewlines: false,
};
let html = '';

rl.on('line', (line) => {
  // 1. Read HTML input from standard input, line by line using the `readline` module.
  html += line + ' ';
});

// 2. after all input is received, use convert to output plain text.
rl.on('close', () => {
  const text = convert(html, options);
  console.log(text);
});
