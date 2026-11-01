import { test, expect } from '@playwright/test'

const TITLE = 'Bugis kopi breakfast set'
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)

test('Discover cards show an auto-extracted listing as not reviewed', async ({ page }) => {
  const draft = {
    id: 'auto-e2e-1', status: 'draft', type: 'deal', title: TITLE, merchant: 'Kopi House', summary: 'Breakfast set for two.',
    outlets: [{ name: 'Kopi House', address: '1 Bugis St' }], validity: { dateFrom: null, dateTo: isoDay(365) },
    startsAt: null, endsAt: null, conditions: ['Dine-in only'], exclusions: null, priceText: '$12 for two', category: 'food',
    dealText: '20% off the set', unknownFields: [], area: 'bugis', lat: 1.3006, lng: 103.8556, address: '1 Bugis St, Singapore 188000',
    autoPublish: true, autoCheckedAt: new Date().toISOString(), rawPostId: 'telegram:sgfooddeals:e2e',
    source: { kind: 'scraped', name: '@sgfooddeals', url: 'https://t.me/sgfooddeals/e2e', retrievedAt: new Date().toISOString(), postedAt: new Date().toISOString() },
  }
  await page.route('**/api/ingest/drafts', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([draft]) }))
  await page.goto('/discover?view=cards')
  await page.getByRole('button', { name: 'Cards view', exact: true }).click()
  const card = page.locator('.cards article').filter({ hasText: TITLE })
  await expect(card).toBeVisible()
  await expect(card.getByText('Auto-extracted · not reviewed')).toBeVisible()
})
