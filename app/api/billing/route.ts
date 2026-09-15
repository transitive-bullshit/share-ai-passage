import { eq } from 'drizzle-orm'

import { billingRequest } from '@/lib/billing-http'
import { readEntitlements } from '@/lib/billing'
import { billingConfiguration } from '@/lib/billing-config'
import { getDb } from '@/lib/db'
import { billingAccounts } from '@/lib/db/schema'
import { getImageUsage } from '@/lib/image-usage'
import { imagePack, planCatalog } from '@/lib/plans'

export function GET(request: Request) {
  return billingRequest(request, async (userId) => {
    const [entitlements, accounts, imageBalance] = await Promise.all([
      readEntitlements(userId),
      getDb()
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, userId)),
      getImageUsage(userId)
    ])
    const account = accounts[0]
    return {
      configuration: billingConfiguration(),
      plans: planCatalog,
      imagePack,
      entitlements,
      subscription: account
        ? {
            status: account.status,
            billingInterval: account.billingInterval,
            periodEnd: account.periodEnd,
            cancelAtPeriodEnd: account.cancelAtPeriodEnd,
            cancelAt: account.cancelAt,
            pendingPlan: account.pendingPlan,
            pendingBillingInterval: account.pendingBillingInterval,
            pendingEffectiveAt: account.pendingEffectiveAt,
            hasCustomer: Boolean(account.stripeCustomerId)
          }
        : null,
      imageBalance
    }
  })
}
