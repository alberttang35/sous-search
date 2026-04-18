// @ts-check
// turns crawl store docs (title, ingredients, text, times) into the canonical shape we persist + search on.
const crypto = require('crypto');
const {
  EXTRACTOR_VERSION,
  RECIPE_SCHEMA_VERSION,
} = require('./schema.js');

// substring match against instructions / body text; noisy but cheap; llm can refine later
const APPLIANCE_KEYWORDS = {
  oven: ['oven', 'bake', 'baking tray', 'broil', 'roast'],
  'air fryer': ['air fryer', 'airfry'],
  grill: ['grill', 'griddle', 'barbecue', 'bbq'],
  stovetop: ['stovetop', 'simmer', 'saute', 'skillet', 'frying pan'],
  microwave: ['microwave'],
  blender: ['blender', 'food processor', 'immersion blender'],
  'instant pot': ['instant pot', 'pressure cooker'],
  'slow cooker': ['slow cooker', 'crock pot'],
};

const UNIT_ALIASES = new Set([
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon',
  'teaspoons', 'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'g', 'gram',
  'grams', 'kg', 'ml', 'l', 'pinch', 'clove', 'cloves', 'can', 'cans',
  'slice', 'slices',
]);

const GLUTEN_KEYWORDS = [
  'flour', 'breadcrumbs', 'bread', 'soy sauce', 'pasta', 'noodle', 'linguine',
  'spaghetti', 'fettuccine', 'penne', 'macaroni', 'lasagna', 'orzo', 'farro',
  'barley', 'seitan', 'tortilla', 'cracker',
];

const GLUTEN_FREE_KEYWORDS = [
  'gluten free', 'gluten-free', 'certified gluten free',
];

function slugify(value) {
  return value.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'recipe';
}

function tokenizeWords(text) {
  return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
}

// best-effort parse: leading number, optional unit token, rest is "name" for tokens/search
function normalizeIngredient(line) {
  const raw = String(line || '').trim();
  if (!raw) return {raw: '', confidence: 0};

  const quantityMatch = raw.match(/^(\d+(?:\.\d+)?|\d+\s*\/\s*\d+)\s+/);
  /** @type {number | undefined} */
  let quantity;
  let rest = raw;
  if (quantityMatch) {
    const qToken = quantityMatch[1].replace(/\s+/g, '');
    if (qToken.includes('/')) {
      const [a, b] = qToken.split('/').map(Number);
      if (a && b) quantity = a / b;
    } else {
      quantity = Number(qToken);
    }
    rest = raw.slice(quantityMatch[0].length).trim();
  }

  const parts = rest.toLowerCase().split(/\s+/);
  /** @type {string | undefined} */
  let unit;
  if (parts.length > 1 && UNIT_ALIASES.has(parts[0])) {
    unit = parts.shift();
    rest = parts.join(' ');
  }

  const name = rest
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[,;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  let confidence = 0.5;
  if (name.length >= 3) confidence += 0.25;
  if (quantity !== undefined) confidence += 0.1;
  if (unit) confidence += 0.1;

  return {
    raw,
    name: name || undefined,
    quantity,
    unit,
    confidence: Math.min(1, confidence),
  };
}

function detectApplianceTags(texts) {
  const source = texts.join(' ').toLowerCase();
  const tags = [];
  for (const [tag, keywords] of Object.entries(APPLIANCE_KEYWORDS)) {
    if (keywords.some((k) => source.includes(k))) tags.push(tag);
  }
  return [...new Set(tags)];
}

/** @param {string} haystack lowercased text */
function textMatchesDietKeyword(haystack, keyword) {
  const k = keyword.toLowerCase();
  if (k.includes(' ')) return haystack.includes(k);
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

// title is included so "chicken pasta" in the name counts; gluten-free only if explicitly stated;
// likely gluten sources (ingredients/title/categories) get contains-gluten unless overridden by explicit GF wording
function detectDietaryTags(categories, ingredients, title) {
  const catText = categories.join(' ').toLowerCase();
  const titleText = String(title || '').toLowerCase();
  const ingredientText = ingredients.map((i) => i.name || '').join(' ').toLowerCase();
  const sourceText = `${titleText} ${catText} ${ingredientText}`.trim();

  const hasMeat = /(beef|pork|chicken|turkey|fish|shrimp|bacon|ham|sausage)/.test(sourceText);
  const hasDairy = /(milk|butter|cheese|yogurt|cream)/.test(sourceText);
  const hasEgg = /\begg(s)?\b/.test(sourceText);
  const explicitGlutenFree = GLUTEN_FREE_KEYWORDS.some((k) => sourceText.includes(k));
  const hasLikelyGluten = GLUTEN_KEYWORDS.some((k) => textMatchesDietKeyword(sourceText, k));
  const explicitVegetarian = /vegetarian/.test(sourceText);
  const explicitVegan = /vegan/.test(sourceText);
  const explicitDairyFree = /dairy[-\s]?free/.test(sourceText);

  const tags = [];
  if (explicitVegetarian || (!hasMeat && !catText.includes('meat'))) tags.push('vegetarian');
  if (explicitVegan || (!hasMeat && !hasDairy && !hasEgg && !catText.includes('dairy'))) tags.push('vegan');
  if (explicitDairyFree || !hasDairy) tags.push('dairy-free');
  if (explicitGlutenFree) tags.push('gluten-free');
  else if (hasLikelyGluten) tags.push('contains-gluten');

  const explicitCount = [explicitVegetarian, explicitVegan, explicitDairyFree, explicitGlutenFree]
      .filter(Boolean).length;
  let confidence = 0;
  if (tags.length) confidence = explicitCount ? 0.72 : 0.45;
  if (!ingredients.length) confidence = Math.min(confidence, 0.35);

  return {tags: [...new Set(tags)], confidence};
}

function buildQualityFlags(confidence) {
  const flags = [];
  if ((confidence.ingredients || 0) < 0.7) flags.push('low_ingredient_confidence');
  if ((confidence.appliance_tags || 0) < 0.5) flags.push('missing_appliance_tags');
  if ((confidence.dietary_tags || 0) < 0.5) flags.push('missing_dietary_tags');
  if ((confidence.times || 0) < 0.5) flags.push('missing_time_fields');
  return flags;
}

// crawl doc shape matches what mrRound writes to crawl_docs (url, text, ingredients, times, …)
function normalizeCrawlDoc(doc) {
  const sourceUrl = doc.url;
  const now = new Date().toISOString();
  const title = (doc.title || '').trim() || 'Untitled Recipe';
  const ingredientsRaw = Array.isArray(doc.ingredients) ? doc.ingredients.filter(Boolean) : [];

  // crawl reducer stores plain text lines, not html; first N lines stand in for steps when json-ld has none
  const stepsRaw = Array.isArray(doc.steps) ?
    doc.steps.filter(Boolean) :
    (doc.text ?
      doc.text.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 30) :
      []);

  const categories = Array.isArray(doc.categories) ? doc.categories.map((c) => c.trim()).filter(Boolean) : [];
  const normalizedIngredients = ingredientsRaw.map(normalizeIngredient).filter((x) => x.raw);
  const ingredientTokens = [...new Set(normalizedIngredients
      .flatMap((i) => tokenizeWords(i.name || ''))
      .filter((w) => w.length > 2))];

  const applianceTags = detectApplianceTags([doc.text || '', ...stepsRaw, ...categories]);
  const dietary = detectDietaryTags(categories, normalizedIngredients, title);
  const dietaryTags = dietary.tags;

  const ingredientConf = normalizedIngredients.length ?
    normalizedIngredients.reduce((sum, i) => sum + i.confidence, 0) / normalizedIngredients.length :
    0;

  const times = {
    total_minutes: doc.times?.totalMinutes,
    prep_minutes: doc.times?.prepMinutes,
    cook_minutes: doc.times?.cookMinutes,
  };
  const timesConf = (times.total_minutes || times.prep_minutes || times.cook_minutes) ? 0.85 : 0;

  /** @type {Record<string, number>} */
  const extractionConfidence = {
    title: title === 'Untitled Recipe' ? 0 : 0.95,
    ingredients: ingredientConf,
    times: timesConf,
    appliance_tags: applianceTags.length ? 0.8 : 0,
    dietary_tags: dietary.confidence,
  };

  /** @type {Record<string, string[]>} */
  const missingFieldReasons = {};
  if (!ingredientsRaw.length) missingFieldReasons.ingredients = ['No recipeIngredient field available'];
  if (!timesConf) missingFieldReasons.times = ['No parseable total/prep/cook times'];
  if (!applianceTags.length) missingFieldReasons.appliance_tags = ['No appliance keywords found in text or steps'];
  if (!dietaryTags.length) missingFieldReasons.dietary_tags = ['Unable to infer dietary tags from categories/ingredients'];

  // stable enough for cache keys; bumps when title/body/times change
  const sourceHash = crypto.createHash('sha256')
      .update([
        sourceUrl,
        title,
        ingredientsRaw.join('|'),
        stepsRaw.join('|'),
        JSON.stringify(doc.times || {}),
      ].join('\n'))
      .digest('hex');

  return {
    recipe_id: `${slugify(title)}-${sourceHash.slice(0, 12)}`,
    source_url: sourceUrl,
    title,
    ingredients_raw: ingredientsRaw,
    steps_raw: stepsRaw,
    times,
    servings: doc.servings || null,
    categories,
    ingredient_tokens: ingredientTokens,
    appliance_tags: applianceTags,
    dietary_tags: dietaryTags,
    quality_flags: buildQualityFlags(extractionConfidence),
    extraction_confidence: extractionConfidence,
    normalized_ingredients: normalizedIngredients,
    extraction_meta: {
      schema_version: RECIPE_SCHEMA_VERSION,
      source_hash: sourceHash,
      extractor_version: EXTRACTOR_VERSION,
      raw_html_ref: doc.rawHtmlRef || null,
      jsonld_blob: doc.jsonLdBlob || null,
      missing_field_reasons: missingFieldReasons,
      fallback_status: {
        required: false,
        executed: false,
      },
    },
    created_at: now,
    updated_at: now,
  };
}

module.exports = {
  normalizeCrawlDoc,
  normalizeIngredient,
  detectApplianceTags,
  detectDietaryTags,
};
