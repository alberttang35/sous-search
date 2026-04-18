-- recipe index tables + gin for arrays and full-text (tsvector column filled at insert time in application code)

CREATE TABLE IF NOT EXISTS recipes (
  recipe_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  ingredients_raw TEXT[] NOT NULL DEFAULT '{}',
  steps_raw TEXT[] NOT NULL DEFAULT '{}',
  total_minutes INTEGER,
  prep_minutes INTEGER,
  cook_minutes INTEGER,
  servings TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  ingredient_tokens TEXT[] NOT NULL DEFAULT '{}',
  appliance_tags TEXT[] NOT NULL DEFAULT '{}',
  dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  quality_flags TEXT[] NOT NULL DEFAULT '{}',
  extraction_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_html_ref TEXT,
  jsonld_blob JSONB,
  extractor_version TEXT NOT NULL,
  search_document TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  normalized_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  confidence REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY(recipe_id, position)
);

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('appliance', 'dietary', 'category')),
  tag TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY(recipe_id, tag_type, tag)
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  step_text TEXT NOT NULL,
  PRIMARY KEY(recipe_id, position)
);

CREATE TABLE IF NOT EXISTS recipe_extraction_meta (
  recipe_id TEXT PRIMARY KEY REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  extraction_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_field_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
  fallback_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash TEXT NOT NULL,
  llm_cache_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipes_total_minutes ON recipes(total_minutes);
CREATE INDEX IF NOT EXISTS idx_recipes_prep_minutes ON recipes(prep_minutes);
CREATE INDEX IF NOT EXISTS idx_recipes_cook_minutes ON recipes(cook_minutes);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient_tokens_gin ON recipes USING GIN (ingredient_tokens);
CREATE INDEX IF NOT EXISTS idx_recipes_appliance_tags_gin ON recipes USING GIN (appliance_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags_gin ON recipes USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_categories_gin ON recipes USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_recipes_fts_gin
  ON recipes USING GIN (search_document);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_total ON recipes USING BTREE (dietary_tags, total_minutes);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_name ON recipe_ingredients USING BTREE (normalized_name);
