#!/bin/bash
# Spell suggestion: typo with no matches suggests a high-frequency index token (stem space).

T_FOLDER=${T_FOLDER:-t}
R_FOLDER=${R_FOLDER:-}

cd "$(dirname "$0")/..$R_FOLDER" || exit 1

DIFF=${DIFF:-diff}

cp "$T_FOLDER/d/spell-index.txt" d/global-index.txt

err=$(./query.js stufx 2>&1 >/dev/null)
if ! echo "$err" | grep -q "Did you mean"; then
  echo "$0 failure: expected Did you mean on stderr" >&2
  exit 1
fi
if ! echo "$err" | grep -q "stuff"; then
  echo "$0 failure: expected suggested token stuff" >&2
  exit 1
fi

if ! $DIFF <(./query.js --auto-correct stufx 2>/dev/null) <(./query.js stuff 2>/dev/null) >&2; then
  echo "$0 failure: auto-correct stdout should match query for corrected term" >&2
  exit 1
fi

echo "$0 success: spell suggestion and auto-correct behave as expected"
exit 0
