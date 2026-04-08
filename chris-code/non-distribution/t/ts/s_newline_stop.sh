#!/bin/bash
# This is a student test

T_FOLDER=${T_FOLDER:-t}
R_FOLDER=${R_FOLDER:-}

cd "$(dirname "$0")/../../$R_FOLDER" || exit 1

DIFF=${DIFF:-diff}


if $DIFF <(cat "$T_FOLDER"/ts/s_inputs/newline_stop.txt | ./c/process.sh | ./c/stem.js ) <(cat "$T_FOLDER"/ts/s_inputs/newline_stop_output.txt) >&2;
then
    echo "$0 success: output is identical"
    exit 0
else
    echo "$0 failure: output is not identical"
    exit 1
fi
