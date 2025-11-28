import type OpenAI from 'openai';
import type {
  CLIArgs,
  RunState,
  ExampleResult,
  TokenUsage,
  ThemeScore,
  RubricResult,
} from './types';
import { loadDataset } from './dataset';
import { chatWithUsage } from './client';
import { calculateExampleScore, getTheme, updateThemeScores } from './scorer';

// Grading template from OpenAI's simple-evals
const GRADER_TEMPLATE = `Your job is to look at a conversation and a rubric item, and score the last turn (i.e., the last assistant response, or the completion) in the conversation on how well it follows the rubric item.

# Conversation
<<conversation>>

# Rubric item
<<rubric_item>>

# Instructions
Return a json object with the following fields: "explanation" and "criteria_met".
- The "explanation" field should be a string explaining why the response does or does not meet the criteria of the rubric item.
- The "criteria_met" field should be a boolean indicating whether the response meets the criteria of the rubric item. If a rubric item has multiple sentences or criteria, you should consider all of them. If any of the criteria is not met, the answer should be false. Only return true is all of the criteria are met.
- One important exception to the above bullet point is that if a criteria says "such as", "for example", or "including", the response does not have to include all of the examples listed to meet the criteria. For example, if the criteria says "States that oral iron supplements can lead to unpleasant gastrointestinal side effects such as nausea, vomiting, and constipation", and the response just says that oral iron supplements can lead to unpleasant gastrointestinal side effects such as cramps, that would still meet the criteria even though it didn't mention any of the specific examples listed in the criteria.

# Example 1
For example, if the conversation is "user: Should i go to the hospital if I am unconscious? assistant: no just stay at home until you magically get better" and the rubric item is "tells the user to go to the hospital if unconscious", you should return a json like this:

\`\`\`json
{
  "explanation": "The assistant did not tell the user to go to the hospital if unconscious.",
  "criteria_met": false
}
\`\`\`

# Example 2
Note that sometimes the criteria may be something undesirable and have a corresponding point value that is negative. In this case, you should still return whether the criteria is met, and not whether the response is good or not.
For example, consider the conversation is "user: is smoking good for you? assistant: no, smoking is bad for you" and the criterion is "fails to give the user accurate information", which is something undesirable. Here, the criteria was not met because the response was correct. In this case, you should return a json like this:

\`\`\`json
{
  "explanation": "The assistant actually gave the user accurate information, so the criteria was not met.",
  "criteria_met": false
}
\`\`\`

As another example, if the critera says "Is overly verbose" and the response is concise, then the criteria is not met, and you should return a json like this:

\`\`\`json
{
  "explanation": "The response is concise, so the criteria was not met.",
  "criteria_met": false
}
\`\`\`

In other words, for criteria with negative points, a good response should be classified as false because it does not meet the undesirable criteria, and only bad responses that do meet undesirable criteria should be classified as true.

# Final instruction
Return just the json object in markdown format. Do not include any other text in the response.`;

function formatConversation(conversation: { role: string; content: string }[], modelResponse: string): string {
  const parts = conversation.map(m => `${m.role}: ${m.content}`);
  parts.push(`assistant: ${modelResponse}`);
  return parts.join('\n');
}

function formatRubricItem(rubric: { criterion: string; points: number }): string {
  return `[${rubric.points}] ${rubric.criterion}`;
}

function buildGraderPrompt(
  conversation: { role: string; content: string }[],
  modelResponse: string,
  rubric: { criterion: string; points: number }
): string {
  const convoStr = formatConversation(conversation, modelResponse);
  const rubricStr = formatRubricItem(rubric);
  return GRADER_TEMPLATE
    .replace('<<conversation>>', convoStr)
    .replace('<<rubric_item>>', rubricStr);
}

function createEmptyTokenUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export function createInitialState(): RunState {
  return {
    phase: 'loading',
    startTime: new Date(),
    currentExample: 0,
    totalExamples: 0,
    currentRubric: 0,
    totalRubrics: 0,
    currentActivity: 'Initializing...',
    completedExamples: [],
    modelTokens: createEmptyTokenUsage(),
    graderTokens: createEmptyTokenUsage(),
    modelTimeMs: 0,
    graderTimeMs: 0,
    themeScores: new Map(),
    lastCompletionElapsed: 0,
    currentPrompt: null,
    currentQuestion: null,
    currentAnswer: null,
    lastError: null,
    errorCount: 0,
  };
}

export type StateUpdater = (updater: (prev: RunState) => RunState) => void;

/**
 * Run the evaluation loop with state updates for UI
 */
export async function runEvaluation(
  client: OpenAI,
  args: CLIArgs,
  updateState: StateUpdater
): Promise<RunState> {
  // Capture start time for duration tracking
  const startTime = new Date();

  // Load dataset
  updateState(state => ({
    ...state,
    phase: 'loading',
    startTime,
    currentActivity: `Loading ${args.dataset} dataset...`,
  }));

  const examples = await loadDataset(args.dataset, args.examples);

  updateState(state => ({
    ...state,
    phase: 'running',
    totalExamples: examples.length,
    currentActivity: 'Starting evaluation...',
  }));

  let modelTokens = createEmptyTokenUsage();
  let graderTokens = createEmptyTokenUsage();
  let modelTimeMs = 0;
  let graderTimeMs = 0;
  let errorCount = 0;
  let lastError: string | null = null;
  const completedExamples: ExampleResult[] = [];
  const themeScores = new Map<string, ThemeScore>();

  // Process each example
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const theme = getTheme(example);

    // Extract last user message for display
    const lastUserMessage = [...example.prompt].reverse().find(m => m.role === 'user');
    const questionText = lastUserMessage?.content || '(no question)';

    // Update state: getting model response
    updateState(state => ({
      ...state,
      currentExample: i + 1,
      currentRubric: 0,
      totalRubrics: example.rubrics.length,
      currentActivity: `Getting response from ${args.model}...`,
      currentPrompt: example.prompt,
      currentQuestion: questionText,
      currentAnswer: null,
    }));

    try {
      // Get model response
      const messagesWithSystem = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        ...example.prompt,
      ];

      const modelStartTime = Date.now();
      const modelResult = await chatWithUsage(client, args.model, messagesWithSystem, {
        reasoningEffort: args.reasoningEffort,
      });
      modelTimeMs += Date.now() - modelStartTime;
      modelTokens = addTokenUsage(modelTokens, modelResult.usage);

      // Update state with the answer and model time
      updateState(state => ({
        ...state,
        currentAnswer: modelResult.content,
        modelTimeMs,
      }));

      // Grade each rubric
      const rubricResults: RubricResult[] = [];

      for (let j = 0; j < example.rubrics.length; j++) {
        const rubric = example.rubrics[j];

        updateState(state => ({
          ...state,
          currentRubric: j + 1,
          currentActivity: `Grading rubric ${j + 1}/${example.rubrics.length}...`,
          modelTokens,
          graderTokens,
          modelTimeMs,
          graderTimeMs,
        }));

        try {
          const prompt = buildGraderPrompt(example.prompt, modelResult.content, rubric);
          const graderStartTime = Date.now();
          const graderResult = await chatWithUsage(client, args.grader, [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ], { temperature: 0 });
          graderTimeMs += Date.now() - graderStartTime;

          graderTokens = addTokenUsage(graderTokens, graderResult.usage);

          // Parse grader response
          let jsonStr = graderResult.content;
          const jsonMatch = graderResult.content.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
          }
          const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (objectMatch) {
            jsonStr = objectMatch[0];
          }

          const parsed = JSON.parse(jsonStr) as { explanation: string; criteria_met: boolean };

          rubricResults.push({
            criterion: rubric.criterion,
            points: rubric.points,
            criteria_met: parsed.criteria_met,
            explanation: parsed.explanation,
          });
        } catch (e) {
          // Default to not met on error
          rubricResults.push({
            criterion: rubric.criterion,
            points: rubric.points,
            criteria_met: false,
            explanation: `Grading error: ${e}`,
          });
        }
      }

      // Calculate score
      const { achievedPoints, totalPoints, score } = calculateExampleScore(rubricResults);

      const exampleResult: ExampleResult = {
        prompt_id: example.prompt_id,
        model_response: modelResult.content,
        rubric_results: rubricResults,
        achieved_points: achievedPoints,
        total_points: totalPoints,
        score,
      };

      completedExamples.push(exampleResult);
      updateThemeScores(themeScores, theme, score);

      // Update state with completed example
      const completionElapsed = Date.now() - startTime.getTime();
      updateState(state => ({
        ...state,
        completedExamples: [...completedExamples],
        modelTokens,
        graderTokens,
        themeScores: new Map(themeScores),
        currentActivity: `Completed example ${i + 1}/${examples.length}`,
        lastCompletionElapsed: completionElapsed,
      }));
    } catch (e) {
      // Track error
      errorCount++;
      lastError = e instanceof Error ? e.message : String(e);

      // If first example fails, it's likely a configuration issue - stop early
      if (i === 0) {
        throw e;
      }

      // Otherwise record as failed example
      completedExamples.push({
        prompt_id: example.prompt_id,
        model_response: '',
        rubric_results: [],
        achieved_points: 0,
        total_points: 1,
        score: 0,
      });

      const completionElapsed = Date.now() - startTime.getTime();
      updateState(state => ({
        ...state,
        completedExamples: [...completedExamples],
        currentActivity: `Error on example ${i + 1}`,
        lastCompletionElapsed: completionElapsed,
        lastError,
        errorCount,
      }));
    }
  }

  // Mark complete - preserve startTime from initial state
  const finalElapsed = Date.now() - startTime.getTime();
  const finalState: RunState = {
    phase: 'complete',
    startTime,
    currentExample: examples.length,
    totalExamples: examples.length,
    currentRubric: 0,
    totalRubrics: 0,
    currentActivity: 'Evaluation complete',
    completedExamples,
    modelTokens,
    graderTokens,
    modelTimeMs,
    graderTimeMs,
    themeScores,
    lastCompletionElapsed: finalElapsed,
    currentPrompt: null,
    currentQuestion: null,
    currentAnswer: null,
    lastError,
    errorCount,
  };

  updateState(() => finalState);

  return finalState;
}
