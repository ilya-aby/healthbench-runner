import { existsSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import type { HealthBenchExample } from './types';

const DATASET_URLS = {
  main: 'https://openaipublic.blob.core.windows.net/simple-evals/healthbench/2025-05-07-06-14-12_oss_eval.jsonl',
  hard: 'https://openaipublic.blob.core.windows.net/simple-evals/healthbench/hard_2025-05-08-21-00-10.jsonl',
  consensus: 'https://openaipublic.blob.core.windows.net/simple-evals/healthbench/consensus_2025-05-09-20-00-46.jsonl',
} as const;

const DATA_DIR = join(process.cwd(), 'data');

function getLocalPath(dataset: keyof typeof DATASET_URLS): string {
  return join(DATA_DIR, `${dataset}.jsonl`);
}

async function downloadDataset(dataset: keyof typeof DATASET_URLS): Promise<string> {
  const url = DATASET_URLS[dataset];
  const localPath = getLocalPath(dataset);

  if (existsSync(localPath)) {
    console.log(`Using cached dataset: ${localPath}`);
    return localPath;
  }

  console.log(`Downloading ${dataset} dataset from ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download dataset: ${response.statusText}`);
  }

  const content = await response.text();
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(localPath, content);
  console.log(`Dataset saved to ${localPath}`);

  return localPath;
}

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function loadDataset(
  dataset: keyof typeof DATASET_URLS,
  limit?: number,
  randomSample: boolean = true
): Promise<HealthBenchExample[]> {
  const localPath = await downloadDataset(dataset);
  const content = await readFile(localPath, 'utf-8');
  const lines = content.trim().split('\n');

  // Parse all examples first
  const allExamples: HealthBenchExample[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      const example = JSON.parse(lines[i]) as HealthBenchExample;
      allExamples.push(example);
    } catch (e) {
      console.warn(`Failed to parse line ${i + 1}: ${e}`);
    }
  }

  // If limit specified, randomly sample (unless randomSample=false)
  let examples = allExamples;
  if (limit && limit < allExamples.length) {
    if (randomSample) {
      examples = shuffle(allExamples).slice(0, limit);
      console.log(`Randomly sampled ${examples.length} examples from ${dataset} dataset (${allExamples.length} total)`);
    } else {
      examples = allExamples.slice(0, limit);
      console.log(`Loaded first ${examples.length} examples from ${dataset} dataset`);
    }
  } else {
    console.log(`Loaded all ${examples.length} examples from ${dataset} dataset`);
  }

  return examples;
}

export type DatasetType = keyof typeof DATASET_URLS;
