export interface ChunkRow {
  id: string;
  content: string;
}

export interface BM25Index {
  avgDocLength: number;
  docCount: number;
  docLengths: Map<string, number>;
  termDocFrequencies: Map<string, number>;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
}

export function buildBM25Index(chunks: ChunkRow[]): BM25Index {
  const docLengths = new Map<string, number>();
  const termDocFrequencies = new Map<string, number>();

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.content);
    docLengths.set(chunk.id, tokens.length);

    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      termDocFrequencies.set(term, (termDocFrequencies.get(term) ?? 0) + 1);
    }
  }

  const docCount = chunks.length;
  let totalLength = 0;
  for (const len of docLengths.values()) {
    totalLength += len;
  }
  const avgDocLength = docCount > 0 ? totalLength / docCount : 0;

  return { avgDocLength, docCount, docLengths, termDocFrequencies };
}

export function scoreBM25(
  queryTerms: string[],
  docTokens: string[],
  docLength: number,
  index: BM25Index,
  k1 = 1.2,
  b = 0.75,
): number {
  const tf = new Map<string, number>();
  for (const token of docTokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  let total = 0;
  for (const term of queryTerms) {
    const termFreq = tf.get(term) ?? 0;
    if (termFreq === 0) continue;

    const n = index.termDocFrequencies.get(term) ?? 0;
    const idf = Math.log((index.docCount - n + 0.5) / (n + 0.5) + 1);
    const numerator = termFreq * (k1 + 1);
    const denominator =
      termFreq + k1 * (1 - b + b * (docLength / index.avgDocLength));
    total += idf * (numerator / denominator);
  }

  return total;
}
