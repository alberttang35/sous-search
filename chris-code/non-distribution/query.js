#!/usr/bin/env node

/*
Search the inverted index for a particular (set of) terms.
Usage: ./query.js [--auto-correct] [query_strings...]

The behavior of this JavaScript file should be similar to the following shell pipeline:
grep "$(echo "$@" | ./c/process.sh | ./c/stem.js | tr "\r\n" "  ")" d/global-index.txt

Spell-check (non-interactive): after you submit the full query, if there are no
matches, the indexer vocabulary is used to suggest nearby tokens (edit distance);
see stderr for "Did you mean:". With --auto-correct, one re-run uses the top
suggestion (tokens are in stem space, same as the index).

Here is one idea on how to develop it:
1. Read the command-line arguments using `process.argv`. A user can provide any string to search.
2. Normalize, remove stopwords from and stem the query string — use already developed components
3. Search the global index using the processed query string.
4. Print the matching lines from the global index file.

Examples:
./query.js A     # Search for "A" in the global index. It should return all lines that contain "A" as part of an 1-gram, 2-gram, or 3-gram.
./query.js A B   # Search for "A B" in the global index. It should return all lines that contain "A B" as part of a 2-gram, or 3-gram.
./query.js A B C # Search for "A B C" in the global index. It should return all lines that contain "A B C" as part of a 3-gram.

Note: Since you will be removing stopwords from the search query, you will not find any matches for words in the stopwords list.

The simplest way to use existing components is to call them using execSync.
For example, `execSync(`echo "${input}" | ./c/process.sh`, {encoding: 'utf-8'});`
*/


const fs = require('fs');
const {execSync} = require('child_process');
const path = require('path');
const {
  buildVocabScoresFromIndexLines,
  suggestTokensArray,
} = require('../crawl/indexing/spellSuggest.js');

// read index once at startup
const indexFile = path.join(__dirname, 'd', 'global-index.txt');
const indexContent = fs.readFileSync(indexFile, 'utf-8');
const indexLines = indexContent.split('\n').filter((line) => line.trim());
const {vocab, score: vocabScore} = buildVocabScoresFromIndexLines(indexLines);

/**
 * @param {string[]} stemmedTerms
 * @returns {string[]}
 */
function findMatchingLines(stemmedTerms) {
  const matches = [];
  if (stemmedTerms.length === 0) return matches;
  const queryLength = stemmedTerms.length;
  for (const line of indexLines) {
    const [indexTerm] = line.split(' | ');
    const indexWords = indexTerm.split(' ');

    let match = false;
    for (let i = 0; i <= indexWords.length - queryLength; i++) {
      const slice = indexWords.slice(i, i + queryLength);
      if (slice.every((word, j) => word === stemmedTerms[j])) {
        match = true;
        break;
      }
    }

    if (match) matches.push(line);
  }
  return matches;
}

/**
 * @param {string} input
 * @returns {string[]}
 */
function stemInput(input) {
  const stemmedQuery = execSync(`echo "${input}" | ./c/process.sh | ./c/stem.js`, {encoding: 'utf-8'});
  return stemmedQuery.trim().split(/\s+/).filter((term) => term.length > 0);
}

// main
const rawArgs = process.argv.slice(2);
const autoCorrect = rawArgs.includes('--auto-correct');
const args = rawArgs.filter((a) => a !== '--auto-correct');
if (args.length < 1) {
  console.error('Usage: ./query.js [--auto-correct] [query_strings...]');
  process.exit(1);
}

const input = args.join(' ');
const stemmedTerms = stemInput(input);
if (stemmedTerms.length === 0) {
  process.exit(0);
}

let lines = findMatchingLines(stemmedTerms);
if (lines.length === 0) {
  const suggested = suggestTokensArray(stemmedTerms, vocab, vocabScore);
  if (suggested) {
    const hint = suggested.join(' ');
    console.error(`Did you mean (stemmed): ${hint}`);
    if (autoCorrect) {
      lines = findMatchingLines(suggested);
      if (lines.length) {
        console.error('[query.js] auto-correct applied; showing matches for suggested terms.');
      }
    }
  }
}

for (const line of lines) {
  console.log(line);
}
