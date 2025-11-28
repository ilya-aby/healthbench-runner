import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';
import { calculateCost, formatCost } from '../pricing';
import { calculateOverallScore } from '../scorer';
import type { ModelPricing, RunState } from '../types';

interface StatsProps {
  state: RunState;
  pricing: Map<string, ModelPricing>;
  model: string;
  grader: string;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export const Stats: React.FC<StatsProps> = ({ state, pricing, model, grader }: StatsProps) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (state.phase === 'running' || state.phase === 'loading') {
      const interval = setInterval(() => {
        setElapsed(Date.now() - state.startTime.getTime());
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsed(Date.now() - state.startTime.getTime());
    }
  }, [state.phase, state.startTime]);

  // Calculate ETA: use avg from completed examples, then tick down based on current progress
  const completedCount = state.completedExamples.length;
  const avgTimePerExample = completedCount > 0 ? state.lastCompletionElapsed / completedCount : 0;
  const remainingExamples = state.totalExamples - completedCount;
  const timeForRemaining = avgTimePerExample * remainingExamples;
  const timeSpentOnCurrent = elapsed - state.lastCompletionElapsed;
  const estimatedRemaining = Math.max(0, timeForRemaining - timeSpentOnCurrent);

  // Calculate running score
  const { overallScore, stdDev } = calculateOverallScore(state.completedExamples);

  // Calculate costs
  const modelCost = calculateCost(state.modelTokens, model, pricing);
  const graderCost = calculateCost(state.graderTokens, grader, pricing);
  const totalCost = modelCost + graderCost;

  // Recent examples (last 3)
  const recentExamples = state.completedExamples.slice(-3);

  if (state.phase === 'loading') {
    return null;
  }

  return (
    <Box flexDirection='column' marginTop={1}>
      {/* Timing */}
      <Box>
        <Text color='gray'>Elapsed: </Text>
        <Text>{formatDuration(elapsed)}</Text>
        {state.phase === 'running' && completedCount > 0 && (
          <>
            <Text color='gray'> | Est. Remaining: </Text>
            <Text>{formatDuration(estimatedRemaining)}</Text>
          </>
        )}
      </Box>

      {/* Cost */}
      <Box marginTop={0}>
        <Text color='gray'>Est. Cost: </Text>
        <Text>{formatCost(totalCost)}</Text>
        <Text color='gray'>
          {' '}
          (model: {formatCost(modelCost)} | grader: {formatCost(graderCost)})
        </Text>
      </Box>

      {/* Recent Examples */}
      {recentExamples.length > 0 && (
        <Box marginTop={1}>
          <Text color='gray'>Recent Scores: </Text>
          {recentExamples.map((ex: { prompt_id: string; score: number }, i: number) => (
            <React.Fragment key={ex.prompt_id}>
              {i > 0 && <Text color='gray'> | </Text>}
              <Text color={ex.score >= 0.5 ? 'green' : ex.score >= 0 ? 'yellow' : 'red'}>
                #{state.completedExamples.length - recentExamples.length + i + 1}:{' '}
                {(ex.score * 100).toFixed(1)}%
              </Text>
            </React.Fragment>
          ))}
        </Box>
      )}

      {/* Running Score */}
      {completedCount > 0 && (
        <Box marginTop={0}>
          <Text color='gray'>Running Score: </Text>
          <Text color={overallScore >= 0.4 ? 'green' : overallScore >= 0.1 ? 'yellow' : 'red'}>
            {(overallScore * 100).toFixed(1)}%
          </Text>
          <Text color='gray'>
            {' '}
            ({'\u00B1'}
            {(stdDev * 100).toFixed(1)}%)
          </Text>
        </Box>
      )}
    </Box>
  );
};
