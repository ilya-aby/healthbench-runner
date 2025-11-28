import type OpenAI from 'openai';
import type { Message, RubricItem, GraderResponse, RubricResult } from './types';
import { chat } from './client';

// Exact grading template from OpenAI's simple-evals
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

function formatConversation(conversation: Message[], modelResponse: string): string {
  const parts = conversation.map(m => `${m.role}: ${m.content}`);
  parts.push(`assistant: ${modelResponse}`);
  return parts.join('\n');
}

function formatRubricItem(rubric: RubricItem): string {
  return `[${rubric.points}] ${rubric.criterion}`;
}

function buildGraderPrompt(conversation: Message[], modelResponse: string, rubric: RubricItem): string {
  const convoStr = formatConversation(conversation, modelResponse);
  const rubricStr = formatRubricItem(rubric);
  return GRADER_TEMPLATE
    .replace('<<conversation>>', convoStr)
    .replace('<<rubric_item>>', rubricStr);
}

export async function gradeRubricItem(
  client: OpenAI,
  graderModel: string,
  conversation: Message[],
  modelResponse: string,
  rubric: RubricItem
): Promise<RubricResult> {
  const prompt = buildGraderPrompt(conversation, modelResponse, rubric);

  try {
    // Original uses system message + user message
    const response = await chat(client, graderModel, [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt },
    ], { temperature: 0 });

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object in response
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as GraderResponse;

    return {
      criterion: rubric.criterion,
      points: rubric.points,
      criteria_met: parsed.criteria_met,
      explanation: parsed.explanation,
    };
  } catch (e) {
    console.error(`\nFailed to grade rubric: ${e}`);
    // Default to not met on error
    return {
      criterion: rubric.criterion,
      points: rubric.points,
      criteria_met: false,
      explanation: `Grading error: ${e}`,
    };
  }
}

export async function gradeExample(
  client: OpenAI,
  graderModel: string,
  conversation: Message[],
  modelResponse: string,
  rubrics: RubricItem[],
  concurrency: number = 5
): Promise<RubricResult[]> {
  const results: RubricResult[] = [];

  // Process rubrics with limited concurrency
  for (let i = 0; i < rubrics.length; i += concurrency) {
    const batch = rubrics.slice(i, i + concurrency);
    process.stdout.write(`  Grading rubrics ${i + 1}-${Math.min(i + concurrency, rubrics.length)}/${rubrics.length}...`);
    const batchResults = await Promise.all(
      batch.map(rubric =>
        gradeRubricItem(client, graderModel, conversation, modelResponse, rubric)
      )
    );
    results.push(...batchResults);
    console.log(' done');
  }

  return results;
}
