import { parseArgs } from 'util';
import React from 'react';
import { render } from 'ink';
import type { CLIArgs, ReasoningEffort } from './types';
import type { DatasetType } from './dataset';
import { App } from './ui/App';

const DEFAULT_GRADER = 'openai/gpt-4.1';

function parseCliArgs(): CLIArgs {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      model: { type: 'string', short: 'm' },
      examples: { type: 'string', short: 'n' },
      dataset: { type: 'string', short: 'd', default: 'main' },
      grader: { type: 'string', short: 'g', default: DEFAULT_GRADER },
      output: { type: 'string', short: 'o', default: 'results' },
      concurrency: { type: 'string', short: 'c', default: '1' },
      'reasoning-effort': { type: 'string', short: 'r' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: false,
  });

  if (values.help || !values.model) {
    console.log(`
HealthBench Runner - Evaluate any model on OpenAI's HealthBench

Usage:
  bun run src/index.tsx --model <openrouter-model-string> [options]

Options:
  -m, --model       OpenRouter model string (required)
                    Examples: openai/gpt-3.5-turbo, anthropic/claude-3.5-sonnet
  -n, --examples    Number of examples to evaluate (default: all)
  -d, --dataset     Dataset variant: main, hard, consensus (default: main)
  -g, --grader      Grader model (default: ${DEFAULT_GRADER})
  -o, --output      Output directory (default: results)
  -c, --concurrency Concurrent grading requests (default: 1)
  -r, --reasoning-effort  Reasoning effort for reasoning models (GPT-5.1, o3, etc.)
                    Values: none, minimal, low, medium, high
  -h, --help        Show this help message

Examples:
  # Quick test with 10 examples
  bun run src/index.tsx --model openai/gpt-3.5-turbo --examples 10

  # Full evaluation
  bun run src/index.tsx --model openai/gpt-3.5-turbo

  # Test Claude on hard subset
  bun run src/index.tsx --model anthropic/claude-3.5-sonnet --dataset hard

Known HealthBench Scores (for validation):
  - GPT-3.5 Turbo: 16%
  - GPT-4o (Aug 2024): 32%
  - o1: 42%
  - o3: 60%
`);
    process.exit(values.help ? 0 : 1);
  }

  return {
    model: values.model as string,
    examples: values.examples ? parseInt(values.examples as string, 10) : undefined,
    dataset: ((values.dataset as string) || 'main') as DatasetType,
    grader: (values.grader as string) || DEFAULT_GRADER,
    output: (values.output as string) || 'results',
    concurrency: parseInt((values.concurrency as string) || '1', 10),
    reasoningEffort: values['reasoning-effort'] as ReasoningEffort | undefined,
  };
}

const args = parseCliArgs();
render(<App args={args} />);
