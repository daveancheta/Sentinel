import type { Person } from "../db";

export interface MatchResult {
  person?: Person;
  similarity: number;
  matched: boolean;
}

export interface CalibrationScore {
  id: number;
  name: string;
  similarity: number;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : Math.max(-1, Math.min(1, dot / denom));
}

export function bestMatch(embedding: number[], people: Person[], threshold = 0.6): MatchResult {
  let bestPerson: Person | undefined;
  let bestScore = -Infinity;
  for (const p of people) {
    if (!p.faceEmbeddings || p.faceEmbeddings.length === 0) continue;
    for (const emb of p.faceEmbeddings) {
      const score = cosineSimilarity(embedding, emb);
      if (score > bestScore) {
        bestScore = score;
        bestPerson = p;
      }
    }
  }
  return {
    person: bestPerson,
    similarity: bestScore === -Infinity ? 0 : bestScore,
    matched: bestScore >= threshold,
  };
}

export function calibrationScores(embedding: number[], people: Person[]): CalibrationScore[] {
  const scores: CalibrationScore[] = [];
  for (const p of people) {
    if (!p.faceEmbeddings || p.faceEmbeddings.length === 0) continue;
    let best = -Infinity;
    for (const emb of p.faceEmbeddings) {
      const score = cosineSimilarity(embedding, emb);
      if (score > best) best = score;
    }
    if (best !== -Infinity) {
      scores.push({ id: p.id!, name: p.name, similarity: best });
    }
  }
  return scores.sort((a, b) => b.similarity - a.similarity);
}
