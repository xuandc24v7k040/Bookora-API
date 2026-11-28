export interface SemanticProduct {
  id: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  authors: string[];
  categories: string[];
  publisher: string | null;
}

export interface ProductVector {
  readonly id: string;
  readonly fingerprint: string;
  readonly vector: readonly number[];
}

export type EmbeddingInput =
  | { kind: 'query'; text: string }
  | { kind: 'document'; product: SemanticProduct };

export interface WorkerRequest {
  id: number;
  input: EmbeddingInput;
}

export type WorkerResponse =
  | { type: 'ready'; loadMs: number }
  | { type: 'unavailable'; reason: string }
  | { type: 'result'; id: number; vector: number[]; tokens: number; ms: number }
  | { type: 'failure'; id: number; reason: string };

export type ModelState = 'disabled' | 'loading' | 'ready' | 'unavailable';

export const AI_MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const AI_DOCUMENT_VERSION = 'allocated-e5-v1';
export const AI_DIMENSIONS = 384;
export const SEMANTIC_THRESHOLD = 0.845;
export const INFERENCE_DEADLINE_MS = 1000;
export const DOCUMENT_DEADLINE_MS = 5000;
export const INFERENCE_CAPACITY = 5;
