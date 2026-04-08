#!/usr/bin/env node

/*
Search the inverted index for a particular (set of) terms.
Usage: ./query.js your search terms

The behavior of this JavaScript file should be similar to the following shell pipeline:
grep "$(echo "$@" | ./c/process.sh | ./c/stem.js | tr "\r\n" "  ")" d/global-index.txt

Here is one idea on how to develop it:
1. Read the command-line arguments using `process.argv`. A user can provide any string to search for.
2. Normalize, remove stopwords from and stem the query string — use already developed components
3. Search the global index using the processed query string.
4. Print the matching lines from the global index file.

Examples:
./query.js A     # Search for "A" in the global index. This should return all lines that contain "A" as part of an 1-gram, 2-gram, or 3-gram.
./query.js A B   # Search for "A B" in the global index. This should return all lines that contain "A B" as part of a 2-gram, or 3-gram.
./query.js A B C # Search for "A B C" in the global index. This should return all lines that contain "A B C" as part of a 3-gram.

Note: Since you will be removing stopwords from the search query, you will not find any matches for words in the stopwords list.

The simplest way to use existing components is to call them using execSync.
For example, `execSync(`echo "${input}" | ./c/process.sh`, {encoding: 'utf-8'});`
*/


const fs = require('fs');
const {execSync} = require('child_process');
const path = require('path');

// read index once at startup
const indexFile = path.join(__dirname, 'd', 'global-index.txt');
const indexContent = fs.readFileSync(indexFile, 'utf-8');
const indexLines = indexContent.split('\n').filter((line) => line.trim());

function query(args) {
  // join query arguments
  const input = args.join(' ');

  // process and stem the query
  const stemmedQuery = execSync(`echo "${input}" | ./c/process.sh | ./c/stem.js`, {encoding: 'utf-8'});
  const stemmedTerms = stemmedQuery.trim().split(/\s+/).filter((term) => term.length > 0);

  // handle empty queries (all stopwords)
  if (stemmedTerms.length === 0) {
    return;
  }

  const queryLength = stemmedTerms.length;

  // search each line in the index
  for (const line of indexLines) {
    const [indexTerm] = line.split(' | ');
    const indexWords = indexTerm.split(' ');

    // sliding window to find the query terms in sequence
    let match = false;
    for (let i = 0; i <= indexWords.length - queryLength; i++) {
      const slice = indexWords.slice(i, i + queryLength);
      if (slice.every((word, j) => word === stemmedTerms[j])) {
        match = true;
        break;
      }
    }

    if (match) {
      console.log(line);
    }
  }
}

// main
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: ./query.js [query_strings...]');
  process.exit(1);
}

query(args);
