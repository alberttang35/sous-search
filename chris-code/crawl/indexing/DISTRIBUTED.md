# Distributed Crawling + Indexing Notes

basic documentation + command outlines

## Pipelines

1. Crawl: `crawl/coordinator.js` + `crawl/mrRound.js`
2. Index build (mr pass 1): `crawl/indexing/run-distributed-index.js`
   - Input gid: `crawl_docs`
   - Output gids:
     - `index_postings_v1`
     - `index_docmeta_v1`
     - `index_attr_dietary_v1`
     - `index_attr_appliance_v1`
     - `index_attr_category_v1`
     - `index_attr_timebucket_v1`
3. Stats (mr pass 2): computed from `index_docmeta_v1` into `index_stats_v1`
4. Query (structured-first hybrid): `crawl/indexing/run-distributed-query.js` — if there are no hits but text terms include unknown tokens, the JSON may include `did_you_mean` (edit-distance suggestions ranked by `df:` stats in `index_stats_v1`). Pass `--auto-correct` to run one follow-up query with `suggested_query`.

## Commands

From `chris-code/`:

```bash
npm run crawl-demo
npm run index-distributed
node crawl/indexing/run-distributed-query.js --query "vegetarian pasta under 30 minutes"
```

optional postgres sink during indexing:

```bash
INDEX_WRITE_POSTGRES=1 DATABASE_URL=... node crawl/indexing/run-distributed-index.js --with-postgres-sink
```

postgres is optional and secondary. The distributed key-value index in `distribution.all.store` is the authoritative search index.
