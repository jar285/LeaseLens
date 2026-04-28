import { pipeline } from '@huggingface/transformers';

type FeatureExtractionPipeline = Awaited<
  ReturnType<typeof pipeline<'feature-extraction'>>
>;

let cachedPipeline: FeatureExtractionPipeline | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (cachedPipeline) return cachedPipeline;
  cachedPipeline = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
  );
  return cachedPipeline;
}

function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const pipe = await getPipeline();
  const output = await pipe(texts, { pooling: 'mean', normalize: false });

  const rawData = output.tolist() as number[][];

  return rawData.map((vec) => l2Normalize(vec));
}
