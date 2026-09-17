export const paidPlanIds = ['plus', 'pro'] as const
export type PaidPlanId = (typeof paidPlanIds)[number]
export type PlanId = 'free' | PaidPlanId

export const planCatalog = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    summaryGenerations: 25
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    monthlyPriceCents: 1_000,
    annualPriceCents: 9_600,
    summaryGenerations: 100
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPriceCents: 2_500,
    annualPriceCents: 24_000,
    summaryGenerations: 300
  }
} as const

export function isPaidPlan(value: unknown): value is PaidPlanId {
  return value === 'plus' || value === 'pro'
}
