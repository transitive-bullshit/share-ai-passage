export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly retryAfter?: number,
    public readonly details?: {
      code: 'SUMMARY_LIMIT' | 'FREE_BUDGET_LIMIT'
      resetAt: string
    }
  ) {
    super(message)
    this.name = 'AppError'
  }
}
