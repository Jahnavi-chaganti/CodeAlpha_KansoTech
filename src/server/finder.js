import { GoogleGenAI, Type } from '@google/genai';
import { db, mapProductRow } from './db.js';

const USAGE_KEYWORDS = {
  programming: ['developer', 'code', 'docker', 'xcode', 'pro', 'k4', '32gb', '24gb', 'thunderbolt', 'vertical', 'ssd'],
  photography: ['camera', '48mp', 'oled', 'xdr', 'calman', 'dci-p3', 'raw', 'cinema', 'tetraprism', 'prores', 'creator'],
  'college studies': ['air', 'se', 'classroom', 'lite', 'student', 'study', 'portable', 'battery', '10th', 'sketch'],
  music: ['audio', 'anc', 'spatial', 'lossless', 'driver', 'hifi', 'studio', 'dac', 'open-back', 'soundbar', 'speakers'],
  fitness: ['watch', 'sport', 'titan', 'dive', 'trail', 'sleep', 'ecg', 'water', 'gps', '50m', '100m', 'marathon'],
  'graphic design': ['oled', 'tandem', 'pencil', 'sketch', 'canvas', 'studio', 'xdr', 'colorist', '6k', 'calman'],
  gaming: ['240hz', '0.03ms', 'oled', 'vrr', 'hdmi 2.1', 'gpu', 'max'],
  travel: ['air', 'feather', 'carbon', 'mini', 'portable', 'compact', 'slim', '5g', 'esim'],
};

const SPEC_KEYWORDS = {
  battery: ['hours', 'day', 'battery', 'endurance', 'mah', 'fast'],
  performance: ['pro', 'max', 'ultra', 'k4', 'a18', 'gpu', '12-core', '14-core', '16-core', '40-core'],
  display: ['oled', 'xdr', 'retina', '120hz', '240hz', '6k', '4k', 'promotion'],
  portability: ['air', 'mini', 'lite', 'feather', 'slim', 'portable', '444 g', '0.96 kg', '1.24 kg'],
  camera: ['48mp', 'camera', 'tetraprism', 'prores', 'cinema', '1-inch', 'optics'],
  audio: ['anc', 'lossless', 'spatial', 'dolby', 'studio', 'balanced', 'driver', 'dac'],
};

function formatInr(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(paise / 100));
}

function buildHaystack(product) {
  const parts = [
    product.name,
    product.category,
    product.tag || '',
    product.shortDescription,
    product.description,
    product.materials,
    JSON.stringify(product.specs || {}),
    JSON.stringify(product.storageOptions || []),
  ];
  return parts.join(' ').toLowerCase();
}

function buildDeterministicReasons(product, { budgetPaise, usage, importantSpecs, preferences }) {
  const reasons = [];

  if (budgetPaise > 0) {
    const diff = budgetPaise - product.priceCents;
    if (diff >= 0) {
      reasons.push(`Fits within your ${formatInr(budgetPaise)} budget at ${formatInr(product.priceCents)}.`);
    }
  }

  if (product.specs?.chip) {
    reasons.push(`Powered by ${product.specs.chip}.`);
  }
  if (product.specs?.display) {
    reasons.push(`Features ${product.specs.display}.`);
  }
  if (product.specs?.battery) {
    reasons.push(`Endurance rated at ${product.specs.battery}.`);
  }

  if (usage) {
    reasons.push(`Well suited for ${usage} workflows.`);
  }
  if (Array.isArray(importantSpecs) && importantSpecs.length > 0) {
    reasons.push(`Aligned with your priority on ${importantSpecs.join(', ')}.`);
  }
  if (preferences) {
    reasons.push(`Matched against your preference: "${preferences.slice(0, 48)}".`);
  }

  return reasons.slice(0, 3);
}

function scoreProduct(product, { budgetPaise, usage, importantSpecs, preferences }) {
  const haystack = buildHaystack(product);
  let score = 0;

  if (product.stock > 0) {
    score += 12;
  } else {
    score -= 40;
  }

  score += (Number(product.rating || 4.7) - 4.5) * 15;

  if (budgetPaise > 0) {
    const ratio = product.priceCents / budgetPaise;
    if (ratio >= 0.55 && ratio <= 1.0) {
      score += 22;
    } else if (ratio < 0.55) {
      score += 12;
    }
  }

  if (usage) {
    const normalizedUsage = usage.toLowerCase();
    const keywords = USAGE_KEYWORDS[normalizedUsage] || normalizedUsage.split(/\s+/);
    for (const kw of keywords) {
      if (kw && haystack.includes(kw)) {
        score += 9;
      }
    }
  }

  for (const spec of importantSpecs) {
    const normalizedSpec = spec.toLowerCase();
    const keywords = SPEC_KEYWORDS[normalizedSpec] || [normalizedSpec];
    for (const kw of keywords) {
      if (kw && haystack.includes(kw)) {
        score += 8;
      }
    }
  }

  if (preferences) {
    const tokens = preferences
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((t) => t.length >= 2);
    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += 11;
      }
    }
  }

  return score;
}

async function enhanceWithGemini(topCandidates, input) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'demo') {
    return null;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const payloadForPrompt = topCandidates.map((c) => ({
    slug: c.product.slug,
    name: c.product.name,
    category: c.product.category,
    priceInr: formatInr(c.product.priceCents),
    stock: c.product.stock,
    shortDescription: c.product.shortDescription,
    specs: c.product.specs,
  }));

  const prompt = [
    'You are the Kanso Tech hardware advisor.',
    'For each of the exact catalog products provided below, write ONE concise factual sentence (max 28 words) explaining why it suits the shopper.',
    'Use ONLY the specs, stock, and prices provided. Do not invent specs, scores, or URLs.',
    `Shopper profile: category="${input.category}", budget="${input.budgetRupees ? formatInr(input.budgetRupees * 100) : 'flexible'}", usage="${input.usage || 'general'}", priorities="${input.importantSpecs.join(', ') || 'balanced'}", preferences="${input.preferences || 'none'}".`,
    `Candidates JSON: ${JSON.stringify(payloadForPrompt)}`,
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slug: { type: Type.STRING },
                  whyRecommended: { type: Type.STRING },
                },
                required: ['slug', 'whyRecommended'],
              },
            },
          },
          required: ['recommendations'],
        },
        abortSignal: controller.signal,
      },
    });

    const text = response?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed?.recommendations)) return null;
    const map = new Map();
    for (const item of parsed.recommendations) {
      if (typeof item?.slug === 'string' && typeof item?.whyRecommended === 'string' && item.whyRecommended.trim()) {
        map.set(item.slug, item.whyRecommended.trim());
      }
    }
    return map;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSmartProductFinder(rawInput = {}) {
  const category = typeof rawInput.category === 'string' && rawInput.category.trim() ? rawInput.category.trim() : 'All';
  const budgetRupeesNum = Number(rawInput.budgetRupees || 0);
  const budgetRupees = Number.isFinite(budgetRupeesNum) && budgetRupeesNum > 0 ? Math.round(budgetRupeesNum) : 0;
  const budgetPaise = budgetRupees * 100;
  const usage = typeof rawInput.usage === 'string' ? rawInput.usage.trim() : '';
  const importantSpecs = Array.isArray(rawInput.importantSpecs)
    ? rawInput.importantSpecs.map((s) => String(s).trim()).filter(Boolean)
    : typeof rawInput.importantSpecs === 'string'
      ? rawInput.importantSpecs.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const preferences = typeof rawInput.preferences === 'string' ? rawInput.preferences.trim().slice(0, 200) : '';
  const inStockOnly = rawInput.inStockOnly !== false;

  const allProducts = db.prepare('SELECT * FROM products ORDER BY id ASC').all().map(mapProductRow);

  const categoryFiltered = allProducts.filter((p) => (category === 'All' ? true : p.category === category));
  const stockFiltered = inStockOnly ? categoryFiltered.filter((p) => p.stock > 0) : categoryFiltered;
  const budgetFiltered =
    budgetPaise > 0 ? stockFiltered.filter((p) => p.priceCents <= budgetPaise) : stockFiltered;

  const context = { category, budgetRupees, budgetPaise, usage, importantSpecs, preferences };

  if (budgetFiltered.length === 0) {
    return {
      matches: [],
      aiEnhanced: false,
      emptyReason:
        budgetPaise > 0
          ? `No results found in ${category === 'All' ? 'our catalog' : category} within ${formatInr(budgetPaise)}. Try increasing your budget or choosing "All" categories.`
          : `No results found matching your selected criteria.`,
    };
  }

  const ranked = budgetFiltered
    .map((product) => {
      const score = scoreProduct(product, context);
      const reasons = buildDeterministicReasons(product, context);
      return {
        product,
        score,
        matchReasons: reasons,
        whyRecommended: `${product.shortDescription} ${reasons[0] || ''}`.trim(),
      };
    })
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating || a.product.priceCents - b.product.priceCents)
    .slice(0, 3);

  const aiSummaries = await enhanceWithGemini(ranked, context);
  const aiEnhanced = Boolean(aiSummaries && aiSummaries.size > 0);

  const finalMatches = ranked.map((entry) => ({
    product: entry.product,
    score: Math.round(entry.score),
    matchReasons: entry.matchReasons,
    whyRecommended: aiSummaries?.get(entry.product.slug) || entry.whyRecommended,
  }));

  return {
    matches: finalMatches,
    aiEnhanced,
    emptyReason: null,
  };
}
