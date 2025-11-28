# HealthBench Runner

A terminal UI for evaluating LLMs on [OpenAI's HealthBench](https://github.com/openai/simple-evals) medical reasoning benchmark.

## Features

- Evaluate any model available on OpenRouter
- Real-time progress tracking with live scores
- Cost and timing estimates
- Support for reasoning models (GPT-5.1, etc.) with configurable effort levels
- Results saved to JSON for analysis

## Setup

```bash
bun install
```

Set your OpenRouter API key:

```bash
export OPENROUTER_API_KEY=your-key-here
```

Or add to .env.local

## Usage

```bash
bun run src/index.tsx --model <openrouter-model-string> [options]
```

### Options

| Flag                     | Description                                                  | Default          |
| ------------------------ | ------------------------------------------------------------ | ---------------- |
| `-m, --model`            | OpenRouter model string (required)                           | -                |
| `-n, --examples`         | Number of examples to evaluate                               | all              |
| `-d, --dataset`          | Dataset: `main`, `hard`, `consensus`                         | `main`           |
| `-g, --grader`           | Grader model                                                 | `openai/gpt-4.1` |
| `-o, --output`           | Output directory                                             | `results`        |
| `-r, --reasoning-effort` | Reasoning effort: `none`, `minimal`, `low`, `medium`, `high` | -                |

### Examples

```bash
# Quick test with 10 random examples
bun run src/index.tsx --model openai/gpt-3.5-turbo --examples 10

# Full evaluation
bun run src/index.tsx --model openai/gpt-3.5-turbo

# Test Claude on hard subset
bun run src/index.tsx --model anthropic/claude-3.5-sonnet --dataset hard

# GPT-5.1 with high reasoning
bun run src/index.tsx --model openai/gpt-5.1 -r high
```

## Known Scores

Reference scores from OpenAI's evaluations:

| Model             | Score |
| ----------------- | ----- |
| GPT-3.5 Turbo     | 16%   |
| GPT-4o (Aug 2024) | 32%   |
| GPT-4.1           | 48%   |
| o3                | 60%   |

## Output

Results are saved to `results/` as JSON files with:

- Overall score and standard deviation
- Per-theme breakdown
- Token usage and costs
- Timing information
- Individual example results with rubric scores
