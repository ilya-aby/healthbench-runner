import OpenAI from 'openai';
import type { ChatResponse, Message, ReasoningEffort, TokenUsage } from './types';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function createClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    throw new Error('OPENROUTER_API_KEY not set in .env.local');
  }

  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/healthbench-runner',
      'X-Title': 'HealthBench Runner',
    },
  });
}

export async function chat(
  client: OpenAI,
  model: string,
  messages: Message[],
  options?: { temperature?: number }
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 1.0,
    });

    // Check for errors in the response
    if (!response) {
      throw new Error('API returned null response');
    }
    const anyResponse = response as unknown as { error?: { message?: string; code?: string } };
    if (anyResponse?.error) {
      console.error(`\nAPI returned error in response: ${JSON.stringify(anyResponse.error)}`);
      throw new Error(anyResponse.error.message || 'Unknown API error');
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error(`\nEmpty response from API. Full response: ${JSON.stringify(response)}`);
      throw new Error('Empty response from API');
    }

    return content;
  } catch (e: unknown) {
    const error = e as Error & { status?: number; message?: string; response?: unknown };
    console.error(`\nAPI error: ${error.message || e}`);
    if (error.status) {
      console.error(`Status: ${error.status}`);
    }
    if (error.response) {
      console.error(`Response: ${JSON.stringify(error.response)}`);
    }
    throw e;
  }
}

/**
 * Chat with token usage tracking
 */
export async function chatWithUsage(
  client: OpenAI,
  model: string,
  messages: Message[],
  options?: { temperature?: number; reasoningEffort?: ReasoningEffort }
): Promise<ChatResponse> {
  // Build request body
  const requestBody: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options?.temperature ?? 1.0,
  };

  // OpenRouter uses nested reasoning object for reasoning models
  if (options?.reasoningEffort) {
    requestBody.reasoning = {
      effort: options.reasoningEffort,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await client.chat.completions.create(requestBody as any);

  // Check for errors in the response
  if (!response) {
    throw new Error('API returned null response');
  }
  const anyResponse = response as unknown as { error?: { message?: string; code?: string } };
  if (anyResponse?.error) {
    throw new Error(anyResponse.error.message || 'Unknown API error');
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from API');
  }

  // Extract token usage
  const usage: TokenUsage = {
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };

  return { content, usage };
}
