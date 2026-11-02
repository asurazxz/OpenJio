import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'

test.skip(process.env.OPENJIO_TEST_ALLOW_WRITES !== '1', 'Account creation is opt-in; use an isolated test database.')

test('a new shared account signs up and stays signed in after reload', async ({ page }) => {
  const browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
  const name = `Browser Smoke ${suffix}`
  await page.goto('/signin?mode=signup')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(`openjio-browser-${suffix}@example.test`)
  await page.getByLabel('Password').fill(`Browser-${randomBytes(18).toString('hex')}!`)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).not.toHaveURL(/signin/)
  // Home greets by the member's first name; the full name is not rendered there.
  await expect(page.getByRole('heading', { name: /^(Kopi first|Free later|Jio makan), Browser\?/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /^(Kopi first|Free later|Jio makan), Browser\?/ })).toBeVisible()
  expect(browserErrors).toEqual([])
})


test('two independent real accounts share an invite and membership updates', async ({ page, browser }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  async function signup(target, label) {
    await target.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
    await target.goto('/signin?mode=signup')
    await target.getByLabel('Name').fill(label)
    await target.getByLabel('Email').fill(`openjio-${label}-${randomBytes(8).toString('hex')}@example.test`)
    await target.getByLabel('Password').fill(`Jio-${randomBytes(18).toString('hex')}!`)
    await target.getByRole('button', { name: 'Create account' }).click()
    await expect(target).not.toHaveURL(/signin/)
  }
  await signup(page, 'Host')
  await page.goto('/new?mode=group')
  const title = `Shared browser jio ${randomBytes(5).toString('hex')}`
  await page.getByLabel('Name', { exact: true }).fill(title)
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Create and invite' }).click()
  await expect(page.getByLabel('Invite link')).toHaveValue(/\/j\//)
  const invite = await page.getByLabel('Invite link').inputValue()
  await page.getByRole('link', { name: 'Go to jio' }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const memberContext = await browser.newContext({ baseURL: new URL(invite).origin })
  try {
    const member = await memberContext.newPage()
    member.on('pageerror', error => errors.push(error.message))
    await signup(member, 'Member')
    await member.goto(invite)
    await member.getByRole('button', { name: 'Join and add my free times' }).click()
    await expect(member.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(member.getByRole('button', { name: /^People: 2 members/ })).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('button', { name: /^People: 2 members/ })).toBeVisible()
    await member.reload()
    await expect(member.getByRole('heading', { name: title, exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } finally { await memberContext.close() }
})

test('signup recovers in place after startup outage and another tab can sign it out', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.route('**/config.json', route => route.fulfill({ status: 503, body: '{}' }))
  await page.goto('/signin')
  await expect(page.getByRole('alert')).toContainText('Unable to connect')
  await page.unroute('**/config.json')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.getByLabel('Name').fill('Recovery')
  await page.getByLabel('Email').fill(`recovery-${randomBytes(8).toString('hex')}@example.test`)
  await page.getByLabel('Password').fill(`Recovery-${randomBytes(18).toString('hex')}!`)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
  const other = await context.newPage()
  try {
    await other.goto('/')
    await other.getByRole('button', { name: 'Account menu' }).click()
    await other.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  } finally { await other.close() }
})
