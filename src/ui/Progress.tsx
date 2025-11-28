import React from 'react';
import { Box, Text } from 'ink';
import type { RunState } from '../types';

interface ProgressProps {
  state: RunState;
}

// Simple text-based progress bar
function SimpleProgressBar({ value, width = 20 }: { value: number; width?: number }) {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
    </Text>
  );
}

export const Progress: React.FC<ProgressProps> = ({ state }: ProgressProps) => {
  const { currentExample, totalExamples, currentRubric, totalRubrics, currentActivity, phase, completedExamples } = state;
  const completedCount = completedExamples.length;

  if (phase === 'loading') {
    return (
      <Box flexDirection="column">
        <Text color="yellow">{currentActivity}</Text>
      </Box>
    );
  }

  const progress = totalExamples > 0 ? completedCount / totalExamples : 0;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="gray">Progress: </Text>
        <Text>[</Text>
        <SimpleProgressBar value={progress} width={25} />
        <Text>]</Text>
        <Text> {completedCount}/{totalExamples} ({(progress * 100).toFixed(0)}%)</Text>
      </Box>
      {phase === 'running' && totalRubrics > 0 && (
        <Box marginTop={1}>
          <Text color="gray">Current: </Text>
          <Text>Grading rubric {currentRubric}/{totalRubrics} for example {currentExample}</Text>
        </Box>
      )}
      {phase === 'complete' && (
        <Box marginTop={1}>
          <Text color="green">Evaluation complete!</Text>
        </Box>
      )}
    </Box>
  );
};
