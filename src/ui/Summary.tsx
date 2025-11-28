import { Box, Text } from 'ink';
import React from 'react';
import { calculateCost, formatCost } from '../pricing';
import { calculateOverallScore, getSortedThemeScores, THEME_NAMES } from '../scorer';
import type { ModelPricing, ReasoningEffort, RunState } from '../types';
import { COLORS } from './colors';

interface SummaryProps {
  state: RunState;
  pricing: Map<string, ModelPricing>;
  model: string;
  grader: string;
  dataset: string;
  reasoningEffort?: ReasoningEffort;
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

export const Summary: React.FC<SummaryProps> = ({
  state,
  pricing,
  model,
  grader,
  dataset,
  reasoningEffort,
}: SummaryProps) => {
  const { overallScore, stdDev } = calculateOverallScore(state.completedExamples);
  const themeScores = getSortedThemeScores(state.themeScores);

  const modelCost = calculateCost(state.modelTokens, model, pricing);
  const graderCost = calculateCost(state.graderTokens, grader, pricing);
  const totalCost = modelCost + graderCost;
  const totalTime = Date.now() - state.startTime.getTime();

  return (
    <Box flexDirection='column' marginTop={1} width={70}>
      {/* Results Box */}
      <Box flexDirection='column' borderStyle='single' paddingX={1}>
        <Text bold color='cyan'>
          Evaluation Results
        </Text>

        <Box marginTop={1}>
          <Text>
            <Text color='gray'>Model: </Text>
            <Text color={COLORS.model}>{model}</Text>
            {reasoningEffort && <Text color='gray'> (effort: {reasoningEffort})</Text>}
            <Text color='gray'> | Grader: </Text>
            <Text color={COLORS.grader}>{grader}</Text>
          </Text>
        </Box>
        <Box>
          <Text color='gray'>Dataset: </Text>
          <Text>
            {dataset} ({state.completedExamples.length} examples)
          </Text>
        </Box>
        <Box>
          <Text>
            <Text color='gray'>Runtime: </Text>
            <Text>{formatDuration(totalTime)}</Text>
            <Text color='gray'> (model: </Text>
            <Text color={COLORS.model}>{formatDuration(state.modelTimeMs)}</Text>
            <Text color='gray'> | grader: </Text>
            <Text color={COLORS.grader}>{formatDuration(state.graderTimeMs)}</Text>
            <Text color='gray'>)</Text>
          </Text>
        </Box>
        <Box>
          <Text>
            <Text color='gray'>Cost: </Text>
            <Text>{formatCost(totalCost)}</Text>
            <Text color='gray'> (model: </Text>
            <Text color={COLORS.model}>{formatCost(modelCost)}</Text>
            <Text color='gray'> | grader: </Text>
            <Text color={COLORS.grader}>{formatCost(graderCost)}</Text>
            <Text color='gray'>)</Text>
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text bold>Overall Score: </Text>
          <Text bold color={overallScore >= 0.4 ? 'green' : overallScore >= 0.1 ? 'yellow' : 'red'}>
            {(overallScore * 100).toFixed(2)}%
          </Text>
          <Text color='gray'>
            {' '}
            ({'\u00B1'}
            {(stdDev * 100).toFixed(2)}%)
          </Text>
        </Box>

        {/* Theme Breakdown */}
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
    </Box>
  );
};
