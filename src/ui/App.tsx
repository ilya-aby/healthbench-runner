import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp } from 'ink';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { CLIArgs, RunState, ModelPricing } from '../types';
import { createClient } from '../client';
import { fetchModelPricing, calculateCost } from '../pricing';
import { runEvaluation, createInitialState } from '../runner';
import { calculateOverallScore } from '../scorer';
import { Dashboard } from './Dashboard';
import { CurrentQA } from './CurrentQA';

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
        setError(String(e));
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
          const timestamp = new Date().toISOString();

          // Build complete results object matching original format
          const results: Record<string, unknown> = {
            model: args.model,
            ...(args.reasoningEffort && { reasoning_effort: args.reasoningEffort }),
            grader: args.grader,
            dataset: args.dataset,
            timestamp,
            examples_evaluated: state.completedExamples.length,
            overall_score: overallScore,
            std_dev: stdDev,
            model_tokens: state.modelTokens,
            grader_tokens: state.graderTokens,
            model_cost: modelCost,
            grader_cost: graderCost,
            total_cost: modelCost + graderCost,
            model_time_ms: state.modelTimeMs,
            grader_time_ms: state.graderTimeMs,
            total_time_ms: Date.now() - state.startTime.getTime(),
            example_results: state.completedExamples.map(ex => ({
              prompt_id: ex.prompt_id,
              model_response: ex.model_response,
              rubric_results: ex.rubric_results,
              achieved_points: ex.achieved_points,
              total_points: ex.total_points,
              score: ex.score,
            })),
          };

          // Write timestamped results file
          const safeTimestamp = timestamp.replace(/[:.]/g, '-');
          const filename = `results_${args.model.replace(/\//g, '_')}_${safeTimestamp}.json`;
          await writeFile(
            join(args.output, filename),
            JSON.stringify(results, null, 2)
          );

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
      <Box flexDirection="column">
        <Box borderStyle="single" borderColor="red" paddingX={1}>
          <Box flexDirection="column">
            <Box>Error: {error}</Box>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" alignItems="flex-start">
      <Dashboard args={args} state={state} pricing={pricing} />
      <CurrentQA state={state} />
    </Box>
  );
};
