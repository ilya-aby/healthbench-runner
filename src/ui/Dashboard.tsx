import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';
import { calculateCost, formatCost, formatCostPrecise } from '../pricing';
import { calculateOverallScore, getSortedThemeScores, THEME_NAMES } from '../scorer';
import type { CLIArgs, ModelPricing, RunState } from '../types';
import { COLORS } from './colors';

interface DashboardProps {
  args: CLIArgs;
  state: RunState;
  pricing: Map<string, ModelPricing>;
}

function formatDuration(ms: number, skipSecondsIfHours = false): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return skipSecondsIfHours
      ? `${hours}h ${minutes % 60}m`
      : `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatPerExample(ms: number): string {
  const seconds = ms / 1000;
  if (seconds >= 60) {
    return `${(seconds / 60).toFixed(1)}m`;
  }
  return `${seconds.toFixed(1)}s`;
}

function ProgressBar({ value, width = 25 }: { value: number; width?: number }) {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color='green'>{'█'.repeat(filled)}</Text>
      <Text color='gray'>{'░'.repeat(empty)}</Text>
    </Text>
  );
}

export const Dashboard: React.FC<DashboardProps> = ({ args, state, pricing }) => {
  const [elapsed, setElapsed] = useState(0);
  const { phase, completedExamples, totalExamples } = state;
  const isRunning = phase === 'running';
  const isComplete = phase === 'complete';
  const isLoading = phase === 'loading';

  // Update elapsed time
  useEffect(() => {
    if (isRunning || isLoading) {
      const interval = setInterval(() => {
        setElapsed(Date.now() - state.startTime.getTime());
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsed(Date.now() - state.startTime.getTime());
    }
  }, [phase, state.startTime, isRunning, isLoading]);

  // Calculate metrics
  const completedCount = completedExamples.length;
  const progress = totalExamples > 0 ? completedCount / totalExamples : 0;
  const { overallScore, stdDev } = calculateOverallScore(completedExamples);
  const themeScores = getSortedThemeScores(state.themeScores);

  // Calculate remaining time
  const avgTimePerExample = completedCount > 0 ? state.lastCompletionElapsed / completedCount : 0;
  const remainingExamples = totalExamples - completedCount;
  const timeForRemaining = avgTimePerExample * remainingExamples;
  const timeSpentOnCurrent = elapsed - state.lastCompletionElapsed;
  const estimatedRemaining = Math.max(0, timeForRemaining - timeSpentOnCurrent);

  // Calculate costs
  const modelCost = calculateCost(state.modelTokens, args.model, pricing);
  const graderCost = calculateCost(state.graderTokens, args.grader, pricing);
  const totalCost = modelCost + graderCost;

  return (
    <Box
      flexDirection='column'
      borderStyle='single'
      paddingX={1}
      width={70}
      flexShrink={0}
      alignSelf='flex-start'
    >
      {/* Header */}
      <Text bold color='cyan'>
        HealthBench Runner
      </Text>

      {/* Model & Grader */}
      <Box marginTop={1}>
        <Text>
          <Text color='gray'>Model: </Text>
          <Text color={COLORS.model}>{args.model}</Text>
          {args.reasoningEffort && <Text color='gray'> (effort: {args.reasoningEffort})</Text>}
          <Text color='gray'> | Grader: </Text>
          <Text color={COLORS.grader}>{args.grader}</Text>
        </Text>
      </Box>

      {/* Dataset */}
      <Box>
        <Text color='gray'>Dataset: </Text>
        <Text>
          {args.dataset} ({totalExamples} examples)
        </Text>
      </Box>

      {/* Runtime */}
      {!isLoading && (
        <Box flexDirection='column'>
          <Box>
            <Text color='gray'>Runtime: </Text>
            <Text>{formatDuration(elapsed)}</Text>
            {isComplete && (
              <>
                <Text color='gray'> - </Text>
                <Text color='green'>completed</Text>
              </>
            )}
          </Box>
          <Box>
            <Text color='gray'> Model: </Text>
            <Text color={COLORS.model}>{formatDuration(state.modelTimeMs)}</Text>
            {completedCount > 0 && (
              <>
                <Text color='gray'> | </Text>
                <Text color={COLORS.model}>
                  {formatPerExample(state.modelTimeMs / completedCount)}
                </Text>
                <Text color='gray'>/example</Text>
              </>
            )}
          </Box>
        </Box>
      )}

      {/* Cost */}
      {!isLoading && (
        <Box flexDirection='column'>
          <Box>
            <Text color='gray'>Cost: </Text>
            <Text>{formatCost(totalCost)}</Text>
          </Box>
          <Box>
            <Text color='gray'> Model: </Text>
            <Text color={COLORS.model}>{formatCost(modelCost)}</Text>
            {completedCount > 0 && (
              <>
                <Text color='gray'> | </Text>
                <Text color={COLORS.model}>{formatCostPrecise(modelCost / completedCount)}</Text>
                <Text color='gray'>/example</Text>
              </>
            )}
          </Box>
        </Box>
      )}

      {/* Loading state */}
      {isLoading && (
        <Box marginTop={1}>
          <Text color='yellow'>{state.currentActivity}</Text>
        </Box>
      )}

      {/* Progress bar - only when running */}
      {isRunning && (
        <Box flexDirection='column' marginTop={1}>
          <Box>
            <Text color='gray'>Progress: </Text>
            <Text>[</Text>
            <ProgressBar value={progress} />
            <Text>
              ] {completedCount}/{totalExamples} ({(progress * 100).toFixed(0)}%)
            </Text>
            {completedCount > 0 && (
              <>
                <Text color='gray'> | </Text>
                <Text>{formatDuration(estimatedRemaining, true)}</Text>
                <Text color='gray'> left</Text>
              </>
            )}
          </Box>
          <Box>
            <Text color='gray'>Status: {state.currentActivity}</Text>
          </Box>
        </Box>
      )}

      {/* Score section */}
      {!isLoading && (
        <Box marginTop={1}>
          <Text bold>{isComplete ? 'Overall' : 'Running'} Score: </Text>
          {completedCount > 0 ? (
            <>
              <Text
                bold
                color={overallScore >= 0.4 ? 'green' : overallScore >= 0.1 ? 'yellow' : 'red'}
              >
                {(overallScore * 100).toFixed(2)}%
              </Text>
              <Text color='gray'>
                {' '}
                ({'\u00B1'}
                {(stdDev * 100).toFixed(2)}%)
              </Text>
              {isRunning && (
                <>
                  <Text color='gray'> | Last: </Text>
                  <Text
                    color={
                      completedExamples[completedCount - 1].score >= 0.4
                        ? 'green'
                        : completedExamples[completedCount - 1].score >= 0.1
                        ? 'yellow'
                        : 'red'
                    }
                  >
                    {(completedExamples[completedCount - 1].score * 100).toFixed(1)}%
                  </Text>
                </>
              )}
            </>
          ) : (
            <Text color='gray'>Pending...</Text>
          )}
        </Box>
      )}

      {/* Theme breakdown */}
      {themeScores.length > 0 && (
        <Box flexDirection='column' marginTop={1}>
          <Text color='gray'>By Theme:</Text>
          {themeScores.map((theme) => (
            <Box key={theme.theme}>
              <Text color='gray'> </Text>
              <Text>{(THEME_NAMES[theme.theme] || theme.theme).padEnd(34)}</Text>
              <Text
                color={theme.avgScore >= 0.4 ? 'green' : theme.avgScore >= 0.1 ? 'yellow' : 'red'}
              >
                {(theme.avgScore * 100).toFixed(1).padStart(7)}%
              </Text>
              <Text color='gray'> ({theme.examples})</Text>
            </Box>
          ))}
        </Box>
      )}

    </Box>
  );
};
