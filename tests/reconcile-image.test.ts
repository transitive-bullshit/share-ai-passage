import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyImageReconciliation,
  imageReconciliationReport,
  parseImageReconcileArgs,
  parseImageReconciliationEvidence
} from '../scripts/reconcile-image'

const operationId = '38036029-4971-4c94-98a1-3cf08a19d141'
const services = vi.hoisted(() => ({
  recover: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  fail: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cost: vi.fn<(...args: unknown[]) => Promise<unknown>>()
}))
vi.mock('../lib/image-worker', () => ({ recoverImageResult: services.recover }))
vi.mock('../lib/image-usage', () => ({
  failImageOperation: services.fail,
  reconcileImageCost: services.cost
}))
beforeEach(() => vi.clearAllMocks())

describe('image reconciliation safety', () => {
  it('requires explicit mutation flags and never accepts provider retry or asserted success', () => {
    for (const args of [
      ['recover', operationId],
      ['recover', operationId, '--apply', '--provider', 'openai'],
      ['recover', operationId, '--apply', '--evidence', 'private.json'],
      ['fail', operationId, '--apply'],
      ['cost', operationId, '--evidence', 'private.json'],
      ['succeed', operationId, '--apply', '--evidence', 'private.json'],
      ['retry', operationId],
      ['status', operationId, '--apply']
    ])
      expect(() => parseImageReconcileArgs(args)).toThrow()
    expect(
      parseImageReconcileArgs(['recover', operationId, '--apply'])
    ).toMatchObject({ action: 'recover', operationId })
    expect(
      parseImageReconcileArgs(['list-stale', '--limit', '10'])
    ).toMatchObject({ action: 'list-stale', limit: 10 })
  })

  it('binds evidence to one action/operation and never treats unknown cost as zero', () => {
    const evidence = {
      action: 'fail',
      operationId,
      evidence:
        'Provider confirmed there is no usable image; invoice reconciliation is pending.',
      actualCostMicros: null
    }
    expect(
      parseImageReconciliationEvidence('fail', operationId, evidence)
    ).toEqual(evidence)
    for (const invalid of [
      { ...evidence, operationId: '207f5f20-5d54-440b-b64f-2b626a744717' },
      { ...evidence, evidence: ' ' },
      { ...evidence, actualCostMicros: -1 },
      { ...evidence, actualCostMicros: 1.2 },
      { ...evidence, usage: { input_tokens: 1 } }
    ])
      expect(() =>
        parseImageReconciliationEvidence('fail', operationId, invalid)
      ).toThrow()
    expect(() =>
      parseImageReconciliationEvidence('cost', operationId, {
        ...evidence,
        action: 'cost'
      })
    ).toThrow()
  })

  it('uses only immutable-object recovery and preserves uncertainty', async () => {
    services.recover.mockResolvedValue({ operationId, status: 'uncertain' })
    expect(
      await applyImageReconciliation({ action: 'recover', operationId })
    ).toEqual({ operationId, status: 'uncertain' })
    expect(services.recover).toHaveBeenCalledExactlyOnceWith(operationId)
    expect(services.fail).not.toHaveBeenCalled()
    expect(services.cost).not.toHaveBeenCalled()
  })

  it('does not replace stored token usage or expose evidence in failure settlement', async () => {
    services.fail.mockResolvedValue({
      id: operationId,
      status: 'failed',
      actualCostMicros: 12527
    })
    await applyImageReconciliation({
      action: 'fail',
      operationId,
      evidence: 'PRIVATE PROVIDER CASE',
      actualCostMicros: 12527
    })
    expect(services.fail).toHaveBeenCalledExactlyOnceWith(operationId, {
      actualCostMicros: 12527,
      errorCode: 'OPERATOR_CONFIRMED_FAILURE'
    })
    expect(services.cost).not.toHaveBeenCalled()
    expect(services.recover).not.toHaveBeenCalled()
  })

  it('reports immutable terminal-outcome or known-cost conflicts without silently claiming success', async () => {
    services.fail.mockResolvedValue({
      id: operationId,
      status: 'succeeded',
      actualCostMicros: 12527
    })
    await expect(
      applyImageReconciliation({
        action: 'fail',
        operationId,
        evidence: 'Conflicting evidence',
        actualCostMicros: 12527
      })
    ).rejects.toThrow('another final outcome')
    services.cost.mockResolvedValue({
      id: operationId,
      status: 'succeeded',
      actualCostMicros: 12527
    })
    await expect(
      applyImageReconciliation({
        action: 'cost',
        operationId,
        evidence: 'Conflicting invoice',
        actualCostMicros: 1
      })
    ).rejects.toThrow('saved cost differs')
  })

  it('prints only operational metadata even when passed a full private record', () => {
    const row = {
      id: operationId,
      status: 'uncertain',
      createdAt: new Date('2026-09-14T10:00:00Z'),
      updatedAt: new Date('2026-09-14T10:20:00Z'),
      providerRequestId: 'req_sample',
      reservedCostMicros: 1e6,
      actualCostMicros: null,
      grantUsed: 2,
      grantReserved: 1,
      grantAllowance: 10,
      prompt: 'PRIVATE PROMPT',
      recipe: { artDirection: 'PRIVATE STYLE' },
      ownerId: 'PRIVATE USER',
      requestKey: 'PRIVATE KEY',
      referenceAssetId: 'PRIVATE REFERENCE'
    }
    const report = imageReconciliationReport(
      row,
      new Date('2026-09-14T11:00:00Z')
    )
    expect(report).toMatchObject({
      ageMinutes: 60,
      inactiveMinutes: 40,
      outstandingCostMicros: 1e6
    })
    expect(JSON.stringify(report)).not.toContain('PRIVATE')
    expect(report).not.toHaveProperty('recipe')
  })
})
