import { describe, expect, it } from 'vitest'

import {
  parseReconcileArgs,
  parseReconciliationEvidence,
  reconciliationReport,
  requireReconciliationDatabase
} from '../scripts/reconcile-summary'

const operationId = '38036029-4971-4c94-98a1-3cf08a19d141'
const evidence = {
  action: 'succeed',
  operationId,
  evidence: 'Provider response saved before the database interruption.',
  actualCostMicros: 1_575,
  preview: { title: 'A recovered preview', highlights: ['A saved result'] }
}

describe('summary reconciliation safety', () => {
  it('requires explicit evidence and apply before allowing a repair', () => {
    for (const args of [
      ['succeed', operationId],
      ['succeed', operationId, '--apply'],
      ['succeed', operationId, '--evidence', 'private.json'],
      ['status', operationId, '--apply'],
      ['list-stale', '--apply'],
      ['retry', operationId, '--apply', '--evidence', 'private.json']
    ])
      expect(() => parseReconcileArgs(args)).toThrow()
    expect(
      parseReconcileArgs([
        'succeed',
        operationId,
        '--evidence',
        'private.json',
        '--apply'
      ])
    ).toEqual({ action: 'succeed', operationId, evidencePath: 'private.json' })
    expect(parseReconcileArgs(['status', operationId])).toEqual({
      action: 'status',
      operationId
    })
  })

  it('requires the evidence to match the action and operation, and validates recovered text', () => {
    expect(
      parseReconciliationEvidence('succeed', operationId, evidence)
    ).toMatchObject({ preview: evidence.preview })
    for (const invalid of [
      { ...evidence, operationId: '207f5f20-5d54-440b-b64f-2b626a744717' },
      { ...evidence, evidence: ' ' },
      { ...evidence, actualCostMicros: 1.5 },
      { ...evidence, actualCostMicros: null },
      { ...evidence, preview: { title: '', highlights: [] } },
      {
        ...evidence,
        preview: { title: 'A title', highlights: ['duplicate', 'duplicate'] }
      }
    ])
      expect(() =>
        parseReconciliationEvidence('succeed', operationId, invalid)
      ).toThrow()
    expect(() =>
      parseReconciliationEvidence('fail', operationId, evidence)
    ).toThrow()
    const failure = {
      action: 'fail',
      operationId,
      evidence: 'A definitive unusable result; final billing not yet known.',
      actualCostMicros: null
    }
    expect(parseReconciliationEvidence('fail', operationId, failure)).toEqual(
      failure
    )
    expect(() =>
      parseReconciliationEvidence('cost', operationId, {
        ...failure,
        action: 'cost'
      })
    ).toThrow()
  })

  it('rejects missing or invalid database targets without exposing supplied credentials', () => {
    for (const target of [
      undefined,
      '',
      'https://secret:password@example.invalid/db',
      'postgres://secret:password@example.invalid/'
    ]) {
      expect(() => requireReconciliationDatabase(target)).toThrow(
        'Set an explicit, valid PostgreSQL DATABASE_URL'
      )
    }
    expect(() =>
      requireReconciliationDatabase(
        'postgresql://postgres@127.0.0.1:55437/disposable_test'
      )
    ).not.toThrow()
  })

  it('projects only operational metadata, never stored results or account identities', () => {
    const stored = {
      id: operationId,
      status: 'uncertain',
      createdAt: new Date('2026-09-14T10:00:00Z'),
      updatedAt: new Date('2026-09-14T10:20:00Z'),
      providerRequestId: 'req_sample',
      reservedCostMicros: 2e4,
      actualCostMicros: null,
      periodUsed: 2,
      periodReserved: 1,
      periodAllowance: 25,
      budgetSpentMicros: 1575,
      budgetReservedMicros: 2e4,
      budgetLimitMicros: 25e6,
      result: { title: 'PRIVATE CONTENT' },
      ownerId: 'PRIVATE USER',
      requestKey: 'PRIVATE KEY',
      subjectKey: 'PRIVATE SUBJECT'
    }
    const report = reconciliationReport(
      stored,
      new Date('2026-09-14T11:00:00Z')
    )
    expect(report.ageMinutes).toBe(60)
    expect(report.inactiveMinutes).toBe(40)
    expect(JSON.stringify(report)).not.toContain('PRIVATE')
    expect(report).not.toHaveProperty('result')
    expect(report).not.toHaveProperty('requestKey')
  })
})
