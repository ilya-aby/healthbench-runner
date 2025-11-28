import { mkdir, writeFile } from 'fs/promises';
import { Box, Text, useApp } from 'ink';
import { join } from 'path';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '../client';
import { calculateCost, fetchModelPricing } from '../pricing';
import { createInitialState, runEvaluation } from '../runner';
import { calculateOverallScore } from '../scorer';
import type { CLIArgs, ModelPricing, RunState } from '../types';
import { CurrentQA } from './CurrentQA';
import { Dashboard } from './Dashboard';

interface AppProps {
  args: CLIArgs;
}

export const App: React.FC<AppProps> = ({ args }: AppProps) => {
  const { exit } = useApp();
  const [state, setState] = useState<RunState>(createInitialState());
  const [pricing, setPricing] = useState<Map<string, ModelPricing>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const updateState = useCallback((updater: (prev: RunState) => RunState) => {
    setState((prev: RunState) => updater(prev));
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        // Fetch pricing first
        const pricingData = await fetchModelPricing();
        setPricing(pricingData);

        // Create client and run evaluation
        const client = createClient();
        await runEvaluation(client, args, updateState);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };

    run();
  }, [args, updateState]);

  // Track if we've already written results
  const resultsWritten = useRef(false);

  // Write results and exit when complete
  useEffect(() => {
    if (state.phase === 'complete' && !resultsWritten.current) {
      resultsWritten.current = true;

      const writeResults = async () => {
        try {
          await mkdir(args.output, { recursive: true });

          const { overallScore, stdDev } = calculateOverallScore(state.completedExamples);
          const modelCost = calculateCost(state.modelTokens, args.model, pricing);
          const graderCost = calculateCost(state.graderTokens, args.grader, pricing);
          const exampleCount = state.completedExamples.length;
          const timestamp = new Date().toISOString();

          // Build complete results object matching original format
          const results: Record<string, unknown> = {
            model: args.model,
            ...(args.reasoningEffort && { reasoning_effort: args.reasoningEffort }),
            grader: args.grader,
            dataset: args.dataset,
            timestamp,
            examples_evaluated: exampleCount,
            overall_score: overallScore,
            std_dev: stdDev,
            model_tokens: state.modelTokens,
            grader_tokens: state.graderTokens,
            model_cost: modelCost,
            model_cost_per_example: exampleCount > 0 ? modelCost / exampleCount : 0,
            grader_cost: graderCost,
            total_cost: modelCost + graderCost,
            model_time_ms: state.modelTimeMs,
            model_time_per_example_ms: exampleCount > 0 ? state.modelTimeMs / exampleCount : 0,
            grader_time_ms: state.graderTimeMs,
            total_time_ms: Date.now() - state.startTime.getTime(),
            example_results: state.completedExamples.map((ex) => ({
              prompt_id: ex.prompt_id,
              model_response: ex.model_response,
              rubric_results: ex.rubric_results,
              achieved_points: ex.achieved_points,
              total_points: ex.total_points,
              score: ex.score,
            })),
          };

          // Write timestamped results file
          // Format: YYYY-MM-DD_HH-MM-SS_model_samples.json (for easy sorting)
          const safeTimestamp = timestamp.slice(0, 19).replace(/[T:]/g, '-');
          const safeModel = args.model.replace(/\//g, '_');
          const filename = `${safeTimestamp}_${safeModel}_${state.completedExamples.length}.json`;
          await writeFile(join(args.output, filename), JSON.stringify(results, null, 2));

          console.log(`\nResults written to ${args.output}/${filename}`);
        } catch (e) {
          console.error('Failed to write results:', e);
        }

        setTimeout(() => exit(), 500);
      };

      writeResults();
    }
  }, [state.phase, state.completedExamples, args, pricing, exit]);

  if (error) {
    return (
      <Box borderStyle='single' borderColor='red' paddingX={1} alignSelf='flex-start'>
        <Text color='red'>{error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection='column'>
      <Box flexDirection='row' alignItems='stretch'>
        <Dashboard args={args} state={state} pricing={pricing} />
        <CurrentQA state={state} />
      </Box>
      {/* Error display */}
      {state.errorCount > 0 && (
        <Box marginTop={0}>
          <Text color='red'>
            {state.errorCount} error{state.errorCount > 1 ? 's' : ''}. Last error: {state.lastError}
          </Text>
        </Box>
      )}
    </Box>
  );
};
