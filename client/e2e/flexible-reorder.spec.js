import { test, expect } from '@playwright/test'

async function signInAs(page, name) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^(Kopi first|Free later|Jio makan), / })).toBeVisible()
}

async function titles(page) {
  return page.locator('.tl-wrap .stop-title').allTextContents()
}

async function waitForOrder(page, expected) {
  await expect.poll(() => titles(page)).toEqual(expected)
}

async function openEditablePlan(page) {
  await signInAs(page, 'Priya Raman')
  await page.goto('/h/h-hawker')
  await expect(page.getByRole('heading', { name: 'Sunday Chinatown wander' })).toBeVisible()
  await expect(page.locator('.tl-wrap .stop-title').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Reorder stop/ }).first()).toBeVisible()
}

test('host can reorder stops by dragging the grip', async ({ page }) => {
  await openEditablePlan(page)
  const before = await titles(page)
  expect(before.length).toBeGreaterThan(1)
  const grip = page.getByRole('button', { name: `Reorder stop 1: ${before[0]}` })
  const drop = page.locator('.tl-wrap [data-stop-index="1"] .stop-card')
  await grip.scrollIntoViewIfNeeded()
  const viewport = page.viewportSize()
  const from = await grip.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(viewport.width / 2, viewport.height - 8, { steps: 10 })
  await expect.poll(async () => {
    const box = await drop.boundingBox()
    return Boolean(box && box.y < viewport.height - 100 && box.y + box.height > 90)
  }).toBe(true)
  const to = await drop.boundingBox()
  const dropTop = Math.max(to.y, 90)
  const dropBottom = Math.min(to.y + to.height, viewport.height - 100)
  const dropY = (dropTop + dropBottom) / 2
  await page.mouse.move(to.x + to.width / 2, dropY, { steps: 8 })
  await expect(page.locator('.tl-wrap [data-stop-index="1"]')).toHaveClass(/drop-target/)
  await page.mouse.up()
  await waitForOrder(page, [before[1], before[0], ...before.slice(2)])
})

test('keyboard drop, move to the last position, and Escape cancellation work', async ({ page }) => {
  await openEditablePlan(page)
  const original = await titles(page)
  const firstGrip = page.getByRole('button', { name: `Reorder stop 1: ${original[0]}` })
  await firstGrip.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await waitForOrder(page, [original[1], original[0], ...original.slice(2)])

  const afterKeyboard = await titles(page)
  const grip = page.getByRole('button', { name: `Reorder stop 1: ${afterKeyboard[0]}` })
  await expect(grip).toBeEnabled()
  await grip.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await waitForOrder(page, afterKeyboard)

  const lastGrip = page.getByRole('button', { name: `Reorder stop 1: ${afterKeyboard[0]}` })
  await expect(lastGrip).toBeEnabled()
  await lastGrip.focus()
  await page.keyboard.press('Space')
  for (let step = 1; step < afterKeyboard.length; step += 1) {
    await page.keyboard.press('ArrowDown')
  }
  await page.keyboard.press('Enter')
  await waitForOrder(page, [...afterKeyboard.slice(1), afterKeyboard[0]])
})

test('non-host timeline has no reorder controls', async ({ page }) => {
  await signInAs(page, 'Jun Hao Tan')
  await page.goto('/h/h-hawker')
  await expect(page.getByRole('heading', { name: 'Sunday Chinatown wander' })).toBeVisible()
  await expect(page.locator('.tl-wrap .stop-title').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Reorder stop/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Move .* (earlier|later)/i })).toHaveCount(0)
})
