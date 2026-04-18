// @ts-check
const fs = require('fs');
const path = require('path');
const {Pool} = require('pg');

function createPoolFromEnv() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to write indexed recipes.');
  }
  return new Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX || 8),
  });
}

function cleanNullableString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

// weighted fts: title > ingredients > steps (same expression as insert, kept inline so pg params stay obvious)
const SEARCH_DOCUMENT_SQL = `(
  setweight(to_tsvector('english', coalesce($3, '')), 'A') ||
  setweight(to_tsvector('english', array_to_string($4::text[], ' ')), 'B') ||
  setweight(to_tsvector('english', array_to_string($5::text[], ' ')), 'C')
)`;

// replace-by-url: recipe_id can change when content hash changes, so delete the old row
// and children cascade. first insert wins for a given crawl run.
async function writeCanonicalRecipe(client, recipe) {
  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM recipes WHERE source_url = $1', [recipe.source_url]);

    await client.query(
        `INSERT INTO recipes (
        recipe_id,
        source_url,
        title,
        ingredients_raw,
        steps_raw,
        total_minutes,
        prep_minutes,
        cook_minutes,
        servings,
        categories,
        ingredient_tokens,
        appliance_tags,
        dietary_tags,
        quality_flags,
        extraction_confidence,
        raw_html_ref,
        jsonld_blob,
        extractor_version,
        search_document,
        created_at,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17::jsonb,$18,
        ${SEARCH_DOCUMENT_SQL},
        $19,$20
      )`,
        [
          recipe.recipe_id,
          recipe.source_url,
          recipe.title,
          recipe.ingredients_raw,
          recipe.steps_raw,
          recipe.times.total_minutes ?? null,
          recipe.times.prep_minutes ?? null,
          recipe.times.cook_minutes ?? null,
          cleanNullableString(recipe.servings),
          recipe.categories,
          recipe.ingredient_tokens,
          recipe.appliance_tags,
          recipe.dietary_tags,
          recipe.quality_flags,
          JSON.stringify(recipe.extraction_confidence || {}),
          cleanNullableString(recipe.extraction_meta.raw_html_ref),
          JSON.stringify(recipe.extraction_meta.jsonld_blob || null),
          recipe.extraction_meta.extractor_version,
          recipe.created_at,
          recipe.updated_at,
        ],
    );

    // positions are 0-based; stable order matches crawl doc ingredient list
    for (let i = 0; i < recipe.normalized_ingredients.length; i++) {
      const ing = recipe.normalized_ingredients[i];
      await client.query(
          `INSERT INTO recipe_ingredients (
          recipe_id, position, raw_text, normalized_name, quantity, unit, confidence
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            recipe.recipe_id,
            i,
            ing.raw,
            cleanNullableString(ing.name),
            ing.quantity ?? null,
            cleanNullableString(ing.unit),
            ing.confidence ?? 0,
          ],
      );
    }

    for (let i = 0; i < recipe.steps_raw.length; i++) {
      await client.query(
          'INSERT INTO recipe_steps (recipe_id, position, step_text) VALUES ($1, $2, $3)',
          [recipe.recipe_id, i, recipe.steps_raw[i]],
      );
    }

    const tagRows = [
      ...recipe.appliance_tags.map((tag) => ({type: 'appliance', tag})),
      ...recipe.dietary_tags.map((tag) => ({type: 'dietary', tag})),
      ...recipe.categories.map((tag) => ({type: 'category', tag: tag.toLowerCase()})),
    ];
    for (const row of tagRows) {
      await client.query(
          `INSERT INTO recipe_tags (recipe_id, tag_type, tag, confidence)
         VALUES ($1, $2, $3, $4)`,
          [recipe.recipe_id, row.type, row.tag, 1.0],
      );
    }

    await client.query(
        `INSERT INTO recipe_extraction_meta (
        recipe_id,
        schema_version,
        extraction_confidence,
        missing_field_reasons,
        fallback_status,
        source_hash,
        llm_cache_key,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8,$9)`,
        [
          recipe.recipe_id,
          recipe.extraction_meta.schema_version,
          JSON.stringify(recipe.extraction_confidence || {}),
          JSON.stringify(recipe.extraction_meta.missing_field_reasons || {}),
          JSON.stringify(recipe.extraction_meta.fallback_status || {}),
          recipe.extraction_meta.source_hash,
          recipe.extraction_meta.llm_cache_key || null,
          recipe.created_at,
          recipe.updated_at,
        ],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function writeRecipes(recipes) {
  const pool = createPoolFromEnv();
  const client = await pool.connect();
  try {
    let written = 0;
    for (const recipe of recipes) {
      await writeCanonicalRecipe(client, recipe);
      written++;
    }
    return {written};
  } finally {
    client.release();
    await pool.end();
  }
}

function listDocFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).map((f) => path.join(dirPath, f));
}

module.exports = {
  createPoolFromEnv,
  writeCanonicalRecipe,
  writeRecipes,
  listDocFiles,
};
