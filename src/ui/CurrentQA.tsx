import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import type { Message, RunState } from '../types';
import { COLORS, getScoreColor } from './colors';

interface CurrentQAProps {
  state: RunState;
}

function truncate(text: string, maxLines: number, maxChars: number): string {
  // First truncate by total chars
  let result = text.length > maxChars ? text.slice(0, maxChars - 3) + '...' : text;
  // Then truncate by lines
  const lines = result.split('\n');
  if (lines.length > maxLines) {
    result = lines.slice(0, maxLines).join('\n') + '...';
  }
  return result;
}

// Simple markdown renderer for common LLM output patterns
function renderMarkdown(text: string): string {
  return (
    text
      // Headers: ### Header -> just the text (no special formatting in string)
      .replace(/^#{1,6}\s+/gm, '')
      // Bullet points: - item or * item -> • item
      .replace(/^(\s*)[-*]\s+/gm, '$1• ')
      // Remove bold markers (can't style inline in a string)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      // Collapse multiple blank lines into one
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export const CurrentQA: React.FC<CurrentQAProps> = ({ state }: CurrentQAProps) => {
  const { currentPrompt, currentQuestion, currentAnswer, phase, completedExamples } = state;
  const [expanded, setExpanded] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null); // null = current

  // Handle keyboard navigation
  useInput((input, key) => {
    if (key.ctrl && input === 'o') {
      setExpanded((e) => !e);
    }

    // Arrow keys to browse completed examples
    if (key.leftArrow && completedExamples.length > 0) {
      setViewingIndex((prev) => {
        if (prev === null) {
          // From current, go to last completed
          return completedExamples.length - 1;
        }
        // Go to previous, or stay at first
        return Math.max(0, prev - 1);
      });
    }

    if (key.rightArrow && completedExamples.length > 0) {
      setViewingIndex((prev) => {
        if (prev === null) return null; // Already at current
        if (prev >= completedExamples.length - 1) {
          // At last completed, go to current
          return null;
        }
        return prev + 1;
      });
    }

    // 'c' to return to current
    if (input === 'c') {
      setViewingIndex(null);
    }
  });

  // Don't show when loading or complete
  if (phase !== 'running' || !currentQuestion) {
    return null;
  }

  // Collapsed: same width as runner (70), truncate to fit ~10 lines total
  // Expanded: fill remaining screen width
  const contentWidth = 70 - 6; // account for border + padding + "Q: "/"A: " prefix

  // Determine what to display: historical example or current
  const isViewingHistory = viewingIndex !== null && viewingIndex < completedExamples.length;
  const viewedExample = isViewingHistory ? completedExamples[viewingIndex] : null;

  // Build header text based on viewing mode
  const headerText = isViewingHistory
    ? `Example ${viewingIndex + 1}/${completedExamples.length}`
    : 'Current Example';
  const headerHint = isViewingHistory ? '←→ browse, c=current' : '←→ browse';
  const scorePercent = isViewingHistory ? Math.round(viewedExample!.score * 100) : null;
  const scoreColor = isViewingHistory ? getScoreColor(viewedExample!.score) : null;

  // Collapsed view: just final Q&A
  if (!expanded) {
    const questionText = isViewingHistory
      ? truncate(renderMarkdown(viewedExample!.question), 3, contentWidth * 3)
      : truncate(renderMarkdown(currentQuestion), 3, contentWidth * 3);
    const answerText = isViewingHistory
      ? truncate(renderMarkdown(viewedExample!.model_response), 10, contentWidth * 10)
      : currentAnswer
        ? truncate(renderMarkdown(currentAnswer), 10, contentWidth * 10)
        : null;

    return (
      <Box flexDirection='column' flexGrow={1} marginLeft={1}>
        <Box flexDirection='column' borderStyle='round' borderColor='cyan' paddingX={1} height='100%'>
          <Text>
            <Text bold color='cyan'>
              {headerText}
            </Text>
            {scorePercent !== null && (
              <Text color={scoreColor!}> • {scorePercent}%</Text>
            )}
            <Text color='gray' dimColor>
              {' '}
              ({headerHint}, ctrl+o to expand)
            </Text>
          </Text>

          <Box marginTop={1}>
            <Text>
              <Text color='gray'>Q: </Text>
              <Text>{questionText}</Text>
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text>
              <Text color={COLORS.model} bold>A: </Text>
              {answerText ? (
                <Text>{answerText}</Text>
              ) : (
                <Text color={COLORS.model}>Generating...</Text>
              )}
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Expanded view: full conversation history + model response
  // Group messages into Q&A pairs for visual separation
  const promptToUse = isViewingHistory ? viewedExample!.prompt : currentPrompt;
  const answerToUse = isViewingHistory ? viewedExample!.model_response : currentAnswer;
  const messagePairs: { question?: Message; answer?: Message }[] = [];
  if (promptToUse) {
    let currentPair: { question?: Message; answer?: Message } = {};
    for (const msg of promptToUse) {
      if (msg.role === 'user') {
        if (currentPair.question) {
          messagePairs.push(currentPair);
          currentPair = {};
        }
        currentPair.question = msg;
      } else if (msg.role === 'assistant') {
        currentPair.answer = msg;
        messagePairs.push(currentPair);
        currentPair = {};
      }
    }
    if (currentPair.question) {
      messagePairs.push(currentPair);
    }
  }

  return (
    <Box flexDirection='column' flexGrow={1} marginLeft={1}>
      <Box flexDirection='column' borderStyle='round' borderColor='cyan' paddingX={1} height='100%'>
        <Text>
          <Text bold color='cyan'>
            {headerText}
          </Text>
          {scorePercent !== null && (
            <Text color={scoreColor!}> • {scorePercent}%</Text>
          )}
          <Text color='gray' dimColor>
            {' '}
            ({headerHint}, ctrl+o to collapse)
          </Text>
        </Text>

        {/* Full conversation history grouped by Q&A pairs */}
        {messagePairs.map((pair, idx) => (
          <Box key={idx} flexDirection='column' marginTop={1}>
            {pair.question && (
              <Text>
                <Text color='gray'>Q: </Text>
                <Text>{renderMarkdown(pair.question.content)}</Text>
              </Text>
            )}
            {pair.answer && (
              <Box marginTop={0}>
                <Text>
                  <Text color='gray'>A: </Text>
                  <Text>{renderMarkdown(pair.answer.content)}</Text>
                </Text>
              </Box>
            )}
          </Box>
        ))}

        {/* Model's response (the actual answer being generated/graded) */}
        <Box marginTop={1}>
          <Text>
            <Text color={COLORS.model} bold>
              A:{' '}
            </Text>
            {answerToUse ? (
              <Text>{renderMarkdown(answerToUse)}</Text>
            ) : (
              <Text color={COLORS.model}>Generating...</Text>
            )}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
