import { createHash } from 'node:crypto'
import { z } from 'zod'

import type { ReviewSnapshot } from './model'

export function hash(value: unknown): string {
  return createHash('sha256')
    .update(Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex')
}

const words = new Intl.Segmenter('en', { granularity: 'word' })
export function countWords(text: string) {
  return [...words.segment(text)].filter((part) => part.isWordLike).length
}

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
const source = z.object({
  title: z.string(),
  parserVersion: z.string(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal('message'),
        role: z.enum(['user', 'assistant', 'system', 'developer', 'tool']),
        phase: z.enum(['commentary', 'final_answer']).optional(),
        content: z.array(
          z.union([
            z.object({
              type: z.enum(['input_text', 'output_text']),
              text: z.string()
            }),
            z.object({
              type: z.literal('omitted'),
              kind: z.enum([
                'image',
                'audio',
                'video',
                'file',
                'tool',
                'artifact',
                'thinking',
                'unknown'
              ]),
              reason: z.enum(['not_exposed', 'unsupported']),
              count: z.number().int().positive().optional()
            })
          ])
        )
      })
    )
    .min(1)
})
const snapshotSchema = z.object({
  version: z.literal(1),
  name: id,
  createdAt: z.string(),
  revision: z.string(),
  dirty: z.boolean(),
  taskHash: fingerprint,
  rendererHash: fingerprint,
  corpusHash: fingerprint,
  templates: z.array(z.object({ id, name: z.string() })).min(1),
  cases: z
    .array(
      z.object({
        id,
        label: z.string(),
        topic: z.string(),
        source,
        sourceHash: fingerprint,
        preview: z.object({
          title: z.string().min(1),
          highlights: z.array(z.string().min(1))
        }),
        provider: z.enum(['chatgpt', 'claude', 'gemini']),
        reviewNotes: z.string(),
        summaryOrigin: z.enum(['authored', 'generated']),
        summaryModel: z.string().nullable(),
        summaryTaskHash: fingerprint.nullable(),
        summaryGeneratedAt: z.string().nullable(),
        inputTruncated: z.boolean(),
        metrics: z.object({
          sourceWords: z.number().int().nonnegative(),
          titleWords: z.number().int().nonnegative(),
          highlightWords: z.number().int().nonnegative(),
          totalWords: z.number().int().nonnegative()
        }),
        cards: z.array(
          z.object({
            templateId: id,
            image: z.string(),
            html: z.string(),
            imageHash: fingerprint,
            htmlHash: fingerprint
          })
        )
      })
    )
    .min(1)
})

export function validateSnapshot(value: unknown): ReviewSnapshot {
  const parsed = snapshotSchema.safeParse(value)
  if (!parsed.success)
    throw new Error(
      'Invalid review snapshot. Capture a new version with cards:review.'
    )
  // Validate without rebuilding objects: source hashes include the exact saved JSON field order.
  const snapshot = value as ReviewSnapshot
  const templates = snapshot.templates.map((template) => template.id)
  if (
    new Set(templates).size !== templates.length ||
    new Set(snapshot.cases.map((entry) => entry.id)).size !==
      snapshot.cases.length
  ) {
    throw new Error('Snapshot contains duplicate cases or templates.')
  }
  for (const entry of snapshot.cases) {
    if (hash(entry.source) !== entry.sourceHash)
      throw new Error('Snapshot source changed since capture.')
    if (
      entry.summaryOrigin === 'generated' &&
      (!entry.summaryModel ||
        !entry.summaryTaskHash ||
        !entry.summaryGeneratedAt)
    ) {
      throw new Error('Generated summaries need model and task provenance.')
    }
    if (
      entry.cards.length === 0 ||
      new Set(entry.cards.map((card) => card.templateId)).size !==
        entry.cards.length
    ) {
      throw new Error('Snapshot is missing rendered cards.')
    }
    for (const card of entry.cards) {
      if (
        !templates.includes(card.templateId) ||
        card.image !== `${entry.id}/${card.templateId}.webp` ||
        card.html !== `${entry.id}/${card.templateId}.html`
      ) {
        throw new Error('Snapshot contains an invalid card path or template.')
      }
    }
  }
  if (
    snapshot.corpusHash !==
    hash(
      snapshot.cases.map(({ id: caseId, sourceHash, provider }) => ({
        id: caseId,
        sourceHash,
        provider
      }))
    )
  ) {
    throw new Error('Snapshot corpus changed since capture.')
  }
  return snapshot
}

export function assertComparable(
  before: ReviewSnapshot,
  after: ReviewSnapshot
) {
  if (before.corpusHash !== after.corpusHash) {
    throw new Error(
      'The chat inputs differ. Capture the candidate with --from <before> to compare the same conversations.'
    )
  }
}
