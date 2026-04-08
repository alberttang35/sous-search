# non-distribution

This milestone aims (among others) to refresh (and confirm) everyone's
background on developing systems in the languages and libraries used in this
course.

By the end of this assignment you will be familiar with the basics of
JavaScript, shell scripting, stream processing, Docker containers, deployment
to AWS, and performance characterization—all of which will be useful for the
rest of the project.

Your task is to implement a simple search engine that crawls a set of web
pages, indexes them, and allows users to query the index. All the components
will run on a single machine.

## Getting Started

To get started with this milestone, run `npm install` inside this folder. To
execute the (initially unimplemented) crawler run `./engine.sh`. Use
`./query.js` to query the produced index. To run tests, do `npm run test`.
Initially, these will fail.

### Overview

The code inside `non-distribution` is organized as follows:

```
.
├── c            # The components of your search engine
├── d            # Data files like seed urls and the produced index
├── s            # Utility scripts for linting your solutions
├── t            # Tests for your search engine
├── README.md    # This file
├── crawl.sh     # The crawler
├── index.sh     # The indexer
├── engine.sh    # The orchestrator script that runs the crawler and the indexer
├── package.json # The npm package file that holds information like JavaScript dependencies
└── query.js     # The script you can use to query the produced global index
```

### Submitting

To submit your solution, run `./scripts/submit.sh` from the root of the stencil. This will create a
`submission.zip` file which you can upload to the autograder.

# M0: Setup & Centralized Computing

* name: `Christopher Chen`

* email: `christopher_chen3@brown.edu`

* cslogin: `cchen234`


## Summary

> Summarize your implementation, including the most challenging aspects; remember to update the `report` section of the `package.json` file with the total number of hours it took you to complete M0 (`hours`), the total number of JavaScript lines you added, including tests (`jsloc`), the total number of shell lines you added, including for deployment and testing (`sloc`).


My implementation consists of 5 components addressing T1--8, `getText.js, getURLs.js, merge.js, stem.js`, and the `query.js` file. The most challenging aspect was implementing the query algorithm because it was hard to ensure that all valid indices of the global indices were matched to the query. In order to do this, I had to make sure to search each index through a sliding window, which involved some creative thinking and also debugging.

Total lines of code in JavaScript is roughly 160 lines. Total lines of shell lines added is roughly 170 lines, with the majority of it being from the tests.


## Correctness & Performance Characterization


> Describe how you characterized the correctness and performance of your implementation.


To characterize correctness, I developed 8 tests that test the following cases: one test for each of the implemented components plus the query (6); one test for the edge case where the newline has a stop word (interaction between process and stem); one test for the edge case where the input text is empty. There are also integration tests for the full pipeline (successfully running sandbox 1 and 2). 


*Performance*: The throughput of various subsystems is described in the `"throughput"` portion of package.json. The characteristics of my development machines are summarized in the `"dev"` portion of package.json.


## Wild Guess

> How many lines of code do you think it will take to build the fully distributed, scalable version of your search engine? Add that number to the `"dloc"` portion of package.json, and justify your answer below.

I estimate that it will take 1000 more lines of code. This is just a random guess that it will take 5 times more of the current amount considering the code is as efficient as can be. If this assignment took roughly 200 lines of code, then maybe it can average out to be around 1000 more lines of code to build the full distributed system, but I think this is definitely on the lower end of the spectrum.