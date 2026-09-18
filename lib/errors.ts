export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly retryAfter?: number,
    public readonly details?: {
      code:
        | 'SUMMARY_LIMIT'
        | 'FREE_BUDGET_LIMIT'
        | 'SUMMARY_BUDGET_LIMIT'
        | 'AI_SPEND_LIMIT'
        | 'PAID_ACCOUNT_REQUIRED'
        | 'BILLING_UNAVAILABLE'
        | 'ASSET_LIMIT'
        | 'GENERATION_UNCERTAIN'
        | 'REVISION_CONFLICT'
      resetAt?: string
      billingUrl?: string
    }
  ) {
    super(message)
    this.name = 'AppError'
  }
}
