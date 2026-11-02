import { test, expect } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

async function signInAs(page, name) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name }).click()
  await expect(page).not.toHaveURL(/\/signin/)
}

test('a member can copy the itinerary for the group chat', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/h/h-friday?tab=go')
  const section = page.getByRole('region', { name: 'Your plan, ready to share' })
  await expect(section).toBeVisible()
  await expect(section.getByText('Nothing is booked through OpenJio. Check tickets or reservations before you go.')).toBeVisible()
  await section.getByRole('button', { name: 'Copy itinerary' }).click()
  await expect(page.getByText('Itinerary copied')).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  const lines = text.split(/\r?\n/)
  expect(lines[0]).toMatch(/^Friday night makan · \w{3} \d{1,2} \w{3}, .*(am|pm)$/)
  expect(lines[1]).toMatch(/^Meet: /)
  expect(lines.filter((l) => /^\d{1,2}(:\d{2})? (am|pm) /.test(l)).length).toBeGreaterThan(0)
  expect(lines).toContain('Nothing is booked through OpenJio.')
  expect(lines.at(-1)).toBe(`Plan: ${new URL(page.url()).origin}/h/h-friday`)

  await section.getByRole('button', { name: 'Copy plan link' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}/h/h-friday`)
})

test('Add to calendar downloads an ics file for the outing', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/h/h-friday?tab=go')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Add to calendar' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('Friday night makan.ics')
  const content = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8')
  expect(content).toContain('BEGIN:VCALENDAR')
  expect(content).toContain('SUMMARY:Friday night makan')
  expect(content).toContain('\r\n')
})

test('each stop links to directions in a new tab', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/h/h-friday?tab=go')
  const first = page.getByRole('region', { name: 'Your plan, ready to share' }).getByRole('link', { name: /^Directions to / }).first()
  await expect(first).toHaveAttribute('href', /google\.com\/maps\/dir\/\?api=1&destination=/)
  await expect(first).toHaveAttribute('target', '_blank')
})

test('the host sets an exact meeting point and members see it', async ({ page, context }) => {
  await signInAs(page, 'Daniel Ong')
  await page.goto('/h/h-friday?tab=go')
  const section = page.getByRole('region', { name: 'Your plan, ready to share' })
  await expect(section.getByText(/^Around /)).toBeVisible()
  await section.getByLabel('Set an exact meeting point').fill('Bugis MRT, exit C')
  await section.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(section.getByText('Bugis MRT, exit C')).toBeVisible()
  await expect(section.getByLabel('Set an exact meeting point')).toHaveCount(0)

  // Members read it too (a second tab in the same demo session signed in as Mei).
  const member = await context.newPage()
  await signInAs(member, 'Mei Lin')
  await member.goto('/h/h-friday?tab=go')
  const memberSection = member.getByRole('region', { name: 'Your plan, ready to share' })
  await expect(memberSection.getByText('Meet at:')).toBeVisible()
  await expect(memberSection.getByText('Bugis MRT, exit C')).toBeVisible()
  await expect(memberSection.getByLabel('Set an exact meeting point')).toHaveCount(0)
  await memberSection.getByRole('button', { name: 'Copy itinerary' }).click()
  expect((await member.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/)[1]).toBe('Meet: Bugis MRT, exit C')
})

test('before the host confirms, the on-the-day tab previews the handoff', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/h/h-catchup?tab=go')
  await expect(page.getByText("Once the host confirms, you'll get a shareable itinerary and calendar file here.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy itinerary' })).toHaveCount(0)
})
