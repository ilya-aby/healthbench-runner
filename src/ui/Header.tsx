import React from 'react';
import { Box, Text } from 'ink';
import type { CLIArgs } from '../types';
import { COLORS } from './colors';

interface HeaderProps {
  args: CLIArgs;
  totalExamples: number;
}

export const Header: React.FC<HeaderProps> = ({ args, totalExamples }: HeaderProps) => {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">HealthBench Runner</Text>
      <Box marginTop={1}>
        <Text>
          <Text color="gray">Model: </Text>
          <Text color={COLORS.model}>{args.model}</Text>
          {args.reasoningEffort && (
            <Text color="gray"> (effort: {args.reasoningEffort})</Text>
          )}
          <Text color="gray"> | Grader: </Text>
          <Text color={COLORS.grader}>{args.grader}</Text>
        </Text>
      </Box>
      <Box>
        <Text>
          <Text color="gray">Dataset: </Text>
          <Text>{args.dataset}</Text>
          <Text color="gray"> ({totalExamples} examples)</Text>
        </Text>
      </Box>
    </Box>
  );
};
