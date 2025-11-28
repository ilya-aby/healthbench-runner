import type { ModelPricing, TokenUsage } from './types';

// Cache for model pricing
let pricingCache: Map<string, ModelPricing> | null = null;

interface OpenRouterModelResponse {
  data: Array<{
    id: string;
    pricing: {
      prompt: string;
      completion: string;
    };
  }>;
}

/**
 * Fetch model pricing from OpenRouter API
 * Returns a map of model ID -> pricing (cost per token)
 */
export async function fetchModelPricing(): Promise<Map<string, ModelPricing>> {
  if (pricingCache) {
    return pricingCache;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`Failed to fetch pricing: ${response.statusText}`);
    }

    const data = (await response.json()) as OpenRouterModelResponse;
    const pricing = new Map<string, ModelPricing>();

    for (const model of data.data) {
      pricing.set(model.id, {
        prompt: parseFloat(model.pricing.prompt) || 0,
        completion: parseFloat(model.pricing.completion) || 0,
      });
    }

    pricingCache = pricing;
    return pricing;
  } catch (error) {
    console.error('Failed to fetch model pricing:', error);
    // Return empty map, cost will show as $0
    return new Map();
  }
}

/**
 * Calculate cost for given token usage and model
 */
export function calculateCost(
  usage: TokenUsage,
  model: string,
  pricing: Map<string, ModelPricing>
): number {
  const modelPricing = pricing.get(model);
  if (!modelPricing) {
    return 0;
  }

  return (
    usage.promptTokens * modelPricing.prompt + usage.completionTokens * modelPricing.completion
  );
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Format cost with precision for small amounts (per-example costs)
 */
export function formatCostPrecise(cost: number): string {
  if (cost >= 0.01) {
    return `$${cost.toFixed(2)}`;
  }
  if (cost >= 0.001) {
    return `$${cost.toFixed(3)}`;
  }
  if (cost >= 0.0001) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(5)}`;
}
