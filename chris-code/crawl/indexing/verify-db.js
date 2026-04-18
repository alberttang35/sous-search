#!/usr/bin/env node
// @ts-check
// quick sanity pass after ingest: counts, fts column populated, indexes present

const {createPoolFromEnv} = require('./db.js');

function parseArgs() {
  const out = {sampleLimit: parseInt(process.env.DB_VERIFY_SAMPLE_LIMIT || '5', 10)};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--sample' && process.argv[i + 1]) {
      out.sampleLimit = parseInt(process.argv[++i], 10);
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node crawl/indexing/verify-db.js [options]

  --sample <n>        Number of sample recipe rows to print (default 5)

Required env:
  DATABASE_URL        Postgres connection string
`);
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  const pool = createPoolFromEnv();
  const client = await pool.connect();
  try {
    const counts = await client.query(`
      SELECT 'recipes' AS table_name, COUNT(*)::bigint AS row_count FROM recipes
      UNION ALL SELECT 'recipe_ingredients', COUNT(*)::bigint FROM recipe_ingredients
      UNION ALL SELECT 'recipe_tags', COUNT(*)::bigint FROM recipe_tags
      UNION ALL SELECT 'recipe_steps', COUNT(*)::bigint FROM recipe_steps
      UNION ALL SELECT 'recipe_extraction_meta', COUNT(*)::bigint FROM recipe_extraction_meta
      ORDER BY table_name
    `);
    console.log('--- Row counts ---');
    for (const row of counts.rows) {
      console.log(`${row.table_name}: ${row.row_count}`);
    }

    const fts = await client.query(`
      SELECT
        source_url,
        title,
        search_document IS NOT NULL AS has_search_document
      FROM recipes
      ORDER BY updated_at DESC
      LIMIT $1
    `, [opts.sampleLimit]);
    console.log('\n--- Sample recipes (FTS sanity) ---');
    for (const row of fts.rows) {
      console.log(`- ${row.title} | ${row.source_url} | search_document=${row.has_search_document}`);
    }

    const indexCheck = await client.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('recipes', 'recipe_ingredients', 'recipe_tags', 'recipe_steps', 'recipe_extraction_meta')
      ORDER BY tablename, indexname
    `);
    console.log('\n--- Indexes ---');
    for (const row of indexCheck.rows) {
      console.log(`${row.tablename}: ${row.indexname}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
