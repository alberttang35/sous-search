// @ts-check
// optional second pass: only runs when heuristics look weak; caches by source_hash + field list
const fs = require('fs');
const path = require('path');

function cachePath(cacheDir, key) {
  return path.join(cacheDir, `${key}.json`);
}

function normalizeTagArray(values) {
  return [...new Set((values || [])
      .map((v) => String(v || '').toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 12))];
}

// drop anything that isn't shaped like our contract; keeps bad model output from poisoning the index
function validateLlmOutput(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (obj);
  const out = /** @type {Record<string, unknown>} */ ({});

  if (Array.isArray(o.appliance_tags)) {
    out.appliance_tags = normalizeTagArray(o.appliance_tags.map(String));
  }
  if (Array.isArray(o.dietary_tags)) {
    out.dietary_tags = normalizeTagArray(o.dietary_tags.map(String));
  }
  if (Array.isArray(o.ingredient_normalizations)) {
    const items = [];
    for (const row of o.ingredient_normalizations) {
      if (!row || typeof row !== 'object') continue;
      const i = /** @type {Record<string, unknown>} */ (row);
      if (!i.raw || !i.name) continue;
      items.push({
        raw: String(i.raw),
        name: String(i.name).toLowerCase().trim(),
        quantity: typeof i.quantity === 'number' ? i.quantity : undefined,
        unit: typeof i.unit === 'string' ? i.unit.toLowerCase().trim() : undefined,
      });
    }
    if (items.length) out.ingredient_normalizations = items;
  }

  if (!out.appliance_tags && !out.dietary_tags && !out.ingredient_normalizations) {
    return null;
  }
  return out;
}

// thresholds tuned so "maybe" dietary tags still trigger a second opinion from the model
function needsFallback(recipe) {
  const fields = [];
  if (!recipe.appliance_tags.length || (recipe.extraction_confidence.appliance_tags || 0) < 0.5) {
    fields.push('appliance_tags');
  }
  if (!recipe.dietary_tags.length || (recipe.extraction_confidence.dietary_tags || 0) < 0.7) {
    fields.push('dietary_tags');
  }
  if (!recipe.ingredient_tokens.length || (recipe.extraction_confidence.ingredients || 0) < 0.65) {
    fields.push('ingredient_normalizations');
  }
  return {required: fields.length > 0, fields};
}

function buildPrompt(recipe) {
  return [
    'You are filling missing recipe indexing fields.',
    'Return strict JSON only with keys:',
    'appliance_tags: string[], dietary_tags: string[], ingredient_normalizations: {raw,name,quantity?,unit?}[]',
    'Use lowercase tags. Keep arrays short and precise.',
    '',
    `title: ${recipe.title}`,
    `categories: ${recipe.categories.join(', ')}`,
    `ingredients_raw: ${recipe.ingredients_raw.join(' || ')}`,
    `steps_raw: ${recipe.steps_raw.slice(0, 12).join(' || ')}`,
  ].join('\n');
}

async function defaultLlmClient(prompt) {
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  if (!apiUrl || !apiKey) return null;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {role: 'system', content: 'Return JSON only.'},
        {role: 'user', content: prompt},
      ],
      response_format: {type: 'json_object'},
    }),
  });

  if (!res.ok) return null;
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') return null;

  try {
    return validateLlmOutput(JSON.parse(content));
  } catch (_e) {
    return null;
  }
}

async function applyLlmFallback(recipe, options = {}) {
  const check = needsFallback(recipe);
  recipe.extraction_meta.fallback_status = {
    required: check.required,
    fields: check.fields,
    executed: false,
    cache_hit: false,
    validated: false,
  };
  if (!check.required) return recipe;

  const cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'llm-fallback');
  fs.mkdirSync(cacheDir, {recursive: true});

  const cacheKey = `${recipe.extraction_meta.source_hash}-${check.fields.join('_')}`;
  const entryPath = cachePath(cacheDir, cacheKey);
  recipe.extraction_meta.llm_cache_key = cacheKey;
  let llmOutput = null;

  if (fs.existsSync(entryPath)) {
    try {
      llmOutput = validateLlmOutput(JSON.parse(fs.readFileSync(entryPath, 'utf8')));
      if (llmOutput) recipe.extraction_meta.fallback_status.cache_hit = true;
    } catch (_e) {
      llmOutput = null;
    }
  }

  if (!llmOutput) {
    const prompt = buildPrompt(recipe);
    const client = options.llmClient || defaultLlmClient;
    llmOutput = await client(prompt);
    if (llmOutput) {
      fs.writeFileSync(entryPath, JSON.stringify(llmOutput, null, 2));
    }
  }

  recipe.extraction_meta.fallback_status.executed = true;
  if (!llmOutput) {
    recipe.extraction_meta.fallback_status.validated = false;
    return recipe;
  }
  recipe.extraction_meta.fallback_status.validated = true;

  if (check.fields.includes('appliance_tags') && llmOutput.appliance_tags?.length) {
    recipe.appliance_tags = normalizeTagArray([...recipe.appliance_tags, ...llmOutput.appliance_tags]);
    recipe.extraction_confidence.appliance_tags = Math.max(
        recipe.extraction_confidence.appliance_tags || 0, 0.82);
  }

  if (check.fields.includes('dietary_tags') && llmOutput.dietary_tags?.length) {
    recipe.dietary_tags = normalizeTagArray([...recipe.dietary_tags, ...llmOutput.dietary_tags]);
    recipe.extraction_confidence.dietary_tags = Math.max(
        recipe.extraction_confidence.dietary_tags || 0, 0.8);
  }

  if (check.fields.includes('ingredient_normalizations') && llmOutput.ingredient_normalizations?.length) {
    const byRaw = new Map(llmOutput.ingredient_normalizations.map((x) => [x.raw.trim().toLowerCase(), x]));
    for (const ing of recipe.normalized_ingredients) {
      const key = ing.raw.trim().toLowerCase();
      const patch = byRaw.get(key);
      if (!patch) continue;
      ing.name = patch.name || ing.name;
      ing.quantity = patch.quantity ?? ing.quantity;
      ing.unit = patch.unit ?? ing.unit;
      ing.confidence = Math.max(ing.confidence, 0.8);
    }
    recipe.ingredient_tokens = [...new Set(recipe.normalized_ingredients
        .flatMap((i) => (i.name || '').split(/\s+/))
        .map((w) => w.toLowerCase())
        .filter((w) => /^[a-z]{3,}$/.test(w)))];
    recipe.extraction_confidence.ingredients = Math.max(
        recipe.extraction_confidence.ingredients || 0, 0.8);
  }

  recipe.updated_at = new Date().toISOString();
  return recipe;
}

module.exports = {
  applyLlmFallback,
  needsFallback,
  validateLlmOutput,
};
