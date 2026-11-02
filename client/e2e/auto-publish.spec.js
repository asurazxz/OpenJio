import { test, expect } from '@playwright/test'

const TITLE = 'BUGIS KOPI BREAKFAST SET'
const TIDY_TITLE = 'Bugis Kopi Breakfast Set'
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)

test('Discover cards tidy an auto-extracted listing, flag gaps without jargon, and keep incomplete ones off Home', async ({ page }) => {
  const draft = {
    id: 'auto-e2e-1', status: 'draft', type: 'deal', title: TITLE, merchant: 'Kopi House', summary: 'Breakfast set for two.',
    outlets: [{ name: 'Kopi House', address: '1 Bugis St' }], validity: { dateFrom: null, dateTo: isoDay(365) },
    startsAt: null, endsAt: null, conditions: ['Dine-in only'], exclusions: null, priceText: 'FREE', category: 'food',
    dealText: '20% off the set', unknownFields: [], area: 'bugis', lat: 1.3006, lng: 103.8556, address: '1 Bugis St, Singapore 188000',
    autoPublish: true, autoCheckedAt: new Date().toISOString(), rawPostId: 'telegram:sgfooddeals:e2e',
    source: { kind: 'scraped', name: '@sgfooddeals', url: 'https://t.me/sgfooddeals/e2e', retrievedAt: new Date().toISOString(), postedAt: new Date().toISOString() },
  }
  const gappy = { ...draft, id: 'auto-e2e-2', title: 'Gappy Late Night Supper', rawPostId: 'telegram:sgfooddeals:e2e2', missing: ['times'] }
  await page.route('**/api/ingest/drafts', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([draft, gappy]) }))
  await page.goto('/discover?view=cards')
  await page.getByRole('button', { name: 'Cards view', exact: true }).click()
  const card = page.locator('.cards article').filter({ hasText: TIDY_TITLE })
  await expect(card).toBeVisible()
  await expect(card.getByText('Auto-extracted')).toHaveCount(0)
  await expect(card.getByText('Visit details incomplete')).toHaveCount(0)
  await expect(card.getByText('Some details not stated', { exact: true })).toHaveCount(0)
  await expect(page.locator('.cards article').filter({ hasText: 'Gappy Late Night Supper' }).getByText('Some details not stated', { exact: true })).toBeVisible()
  await expect(card.getByText('Free', { exact: true })).toBeVisible()
  await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0)

  // Home's week strip drops auto-extracted listings that have something missing.
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  await expect(page.getByRole('heading', { name: 'This week around you' })).toBeVisible()
  await expect(page.locator('main').getByText('Gappy Late Night Supper')).toHaveCount(0)
  await expect(page.locator('main').getByText('Auto-extracted')).toHaveCount(0)
})
