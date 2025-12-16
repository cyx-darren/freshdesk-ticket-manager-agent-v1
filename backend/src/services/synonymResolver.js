import axios from 'axios';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const productAgentApi = axios.create({
  baseURL: config.productAgent.url,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': config.productAgent.apiKey,
  },
});

/**
 * Resolve customer terminology to canonical product names
 * Uses Product Agent's /api/product/resolve endpoint
 *
 * @param {string[]} terms - Array of product terms from customer message
 * @returns {Object} - Map of input term -> { canonical, confidence, alternates }
 */
export async function resolveProductSynonyms(terms) {
  if (!terms || terms.length === 0) {
    return {};
  }

  try {
    logger.info(`Resolving synonyms for terms: ${JSON.stringify(terms)}`);

    const response = await productAgentApi.post('/api/product/resolve', {
      terms,
    });

    if (!response.data.success) {
      logger.warn('Synonym resolution returned unsuccessful:', response.data);
      return buildFallbackMap(terms, 'api_error');
    }

    const resolutions = response.data.resolutions || [];

    // Build mapping from input term to canonical name
    const synonymMap = {};
    resolutions.forEach(r => {
      if (r.canonicalName) {
        synonymMap[r.input] = {
          canonical: r.canonicalName,
          confidence: r.confidence || 'resolved',
          alternates: r.alternates || [],
          category: r.category || null,
        };
        logger.info(`Resolved: "${r.input}" → "${r.canonicalName}" (${r.confidence})`);
      } else {
        // Not found - keep original term
        synonymMap[r.input] = {
          canonical: r.input,
          confidence: 'not_found',
          alternates: [],
          category: null,
        };
        logger.info(`Not resolved: "${r.input}" (keeping original)`);
      }
    });

    return synonymMap;

  } catch (error) {
    logger.error('Error calling synonym resolver:', error.message);

    // Graceful fallback: return original terms as-is
    return buildFallbackMap(terms, 'error');
  }
}

/**
 * Build a fallback map when resolution fails
 */
function buildFallbackMap(terms, reason) {
  const fallbackMap = {};
  terms.forEach(t => {
    fallbackMap[t] = {
      canonical: t,
      confidence: reason,
      alternates: [],
      category: null,
    };
  });
  return fallbackMap;
}

/**
 * Get canonical names from a synonym map
 * @param {Object} synonymMap - Map from resolveProductSynonyms
 * @returns {string[]} - Array of canonical product names
 */
export function getCanonicalNames(synonymMap) {
  return Object.values(synonymMap).map(s => s.canonical);
}

/**
 * Replace terms in a string with their canonical equivalents
 * @param {string} text - Original text
 * @param {Object} synonymMap - Map from resolveProductSynonyms
 * @returns {string} - Text with terms replaced by canonical names
 */
export function replaceWithCanonical(text, synonymMap) {
  let result = text;

  // Sort by length descending to replace longer terms first
  const terms = Object.keys(synonymMap).sort((a, b) => b.length - a.length);

  terms.forEach(term => {
    const canonical = synonymMap[term]?.canonical;
    if (canonical && canonical !== term) {
      // Case-insensitive replacement
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      result = result.replace(regex, canonical);
    }
  });

  return result;
}
