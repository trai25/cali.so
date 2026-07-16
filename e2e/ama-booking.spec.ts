import { expect, test, type Page, type Route } from '@playwright/test'

// The AMA booking journeys run entirely against provider fakes: every
// /api/ama/* request is intercepted before it reaches the server, so no
// database, Stripe, Google, or Tencent dependency is exercised. What the
// tests prove is the browser-side contract: the UI drives the documented
// HTTP shapes (lib/ama/booking/http.ts) and renders every state honestly.

test.use({ timezoneId: 'Asia/Taipei' })

const HOLD_ID = 'e2e00000-0000-4000-8000-000000000001'
const MANAGE_TOKEN = 'e2e-test-token'
const BRIEF =
  'I am building an indie product and want to talk through positioning and a sustainable launch plan.'

type PublicSlot = { startsAt: string; endsAt: string }

type HoldRequestBody = {
  startsAt?: string
  name?: string
  email?: string
  locale?: string
  timeZone?: string
  topics?: string[]
  brief?: string
  urls?: string[]
  provider?: string
}

/** A slot safely in the future so the UI never filters or rejects it. */
function futureSlot(daysAhead: number, hourUtc: number): PublicSlot {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + daysAhead)
  start.setUTCHours(hourUtc, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return { startsAt: start.toISOString(), endsAt: end.toISOString() }
}

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  })
}

/**
 * The in-memory booking provider fake. It follows the real state machine:
 * a hold is created, stays active while the guest reads the countdown, and
 * flips to paid once checkout is requested — simulating the Stripe round
 * trip by sending the browser straight to the confirmation page.
 */
async function installBookingFake(
  page: Page,
  options: {
    slots: PublicSlot[]
    paidBookingStatus: 'confirmed' | 'finalizing'
    localePrefix: '' | '/en'
  },
) {
  const state = {
    holdRequests: [] as HoldRequestBody[],
    hold: null as { startsAt: string; endsAt: string; expiresAt: string } | null,
    checkoutStarted: false,
  }

  await page.route('**/api/ama/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === 'GET' && url.pathname === '/api/ama/slots') {
      return fulfillJson(route, 200, { status: 'available', slots: options.slots })
    }

    if (method === 'POST' && url.pathname === '/api/ama/holds') {
      const body = request.postDataJSON() as HoldRequestBody
      state.holdRequests.push(body)
      const startsAt = body.startsAt ?? options.slots[0].startsAt
      const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      state.hold = { startsAt, endsAt, expiresAt }
      return fulfillJson(route, 201, {
        hold: { id: HOLD_ID, expiresAt, startsAt, endsAt },
      })
    }

    if (method === 'GET' && url.pathname === `/api/ama/holds/${HOLD_ID}`) {
      if (state.checkoutStarted) {
        return fulfillJson(route, 200, {
          hold: { state: 'paid', bookingStatus: options.paidBookingStatus },
        })
      }
      if (!state.hold) return fulfillJson(route, 404, { error: 'not_found' })
      return fulfillJson(route, 200, {
        hold: {
          state: 'active',
          startsAt: state.hold.startsAt,
          endsAt: state.hold.endsAt,
          expiresAt: state.hold.expiresAt,
          checkoutStarted: false,
        },
      })
    }

    if (method === 'POST' && url.pathname === `/api/ama/holds/${HOLD_ID}/checkout`) {
      state.checkoutStarted = true
      return fulfillJson(route, 200, {
        checkout: {
          url: `${url.origin}${options.localePrefix}/ama/book/confirmation?hold=${HOLD_ID}`,
        },
      })
    }

    return fulfillJson(route, 404, { error: 'not_found' })
  })

  return state
}

test('the Google Meet booking journey completes in Chinese', async ({ page }) => {
  const slots = [futureSlot(3, 2), futureSlot(4, 6)]
  const fake = await installBookingFake(page, {
    slots,
    paidBookingStatus: 'confirmed',
    localePrefix: '',
  })

  // The offer page renders the spec sheet before anything transactional.
  await page.goto('/ama')
  await expect(page.getByText('US$99').first()).toBeVisible()
  await expect(page.getByText('60 分钟', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: '预订时间' }).click()
  await expect(page).toHaveURL('/ama/book')

  // The fake slots render as one 44px button per time.
  const slotButtons = page.locator('button[aria-pressed]')
  await expect(slotButtons).toHaveCount(slots.length)

  await page.getByLabel('名字').fill('测试访客')
  await page.getByLabel('邮箱').fill('guest@example.com')
  await page.getByRole('checkbox', { name: '工程与全栈开发' }).check()
  await page.getByRole('checkbox', { name: '独立产品与创业' }).check()
  await page.getByLabel('你想从这一小时得到什么').fill(BRIEF)

  // Google Meet is the default meeting provider; leave it untouched.
  await expect(page.getByRole('radio', { name: 'Google Meet' })).toBeChecked()

  await slotButtons.first().click()
  await expect(slotButtons.first()).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '保留这个时间' }).click()

  // The held state shows the reservation and a live countdown.
  await expect(page.getByText('已为你保留')).toBeVisible()
  await expect(page.getByText(/^\d{1,2}:\d{2}$/)).toBeVisible()

  // The hold request carried the full intake payload to the server.
  expect(fake.holdRequests).toHaveLength(1)
  const holdBody = fake.holdRequests[0]
  expect(holdBody.provider).toBe('google-meet')
  expect(holdBody.startsAt).toBe(slots[0].startsAt)
  expect(holdBody.topics).toEqual(['engineering', 'indie-business'])
  expect(holdBody.brief).toBe(BRIEF)

  // Checkout simulates the Stripe round trip back to the confirmation page.
  await page.getByRole('button', { name: '继续付款' }).click()
  await expect(page).toHaveURL(`/ama/book/confirmation?hold=${HOLD_ID}`)

  await expect(page.getByText('付款已确认。')).toBeVisible()
  await expect(
    page.getByText('确认邮件已经出发，里面有日历邀请、会议链接和专属管理链接。到时见。'),
  ).toBeVisible()
})

test('the Tencent Meeting booking journey completes in English', async ({ page }) => {
  const slots = [futureSlot(3, 2), futureSlot(5, 4)]
  const fake = await installBookingFake(page, {
    slots,
    paidBookingStatus: 'finalizing',
    localePrefix: '/en',
  })

  await page.goto('/en/ama/book')

  const slotButtons = page.locator('button[aria-pressed]')
  await expect(slotButtons).toHaveCount(slots.length)

  await page.getByLabel('Name').fill('E2E Guest')
  await page.getByLabel('Email').fill('guest@example.com')
  await page.getByRole('checkbox', { name: 'Engineering and full-stack' }).check()
  await page.getByLabel('What would make this hour valuable').fill(BRIEF)
  await page.getByRole('radio', { name: 'Tencent Meeting' }).check()

  await slotButtons.first().click()
  await expect(slotButtons.first()).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Hold this time' }).click()

  await expect(page.getByText('Held for you')).toBeVisible()
  await expect(page.getByText(/^\d{1,2}:\d{2}$/)).toBeVisible()

  expect(fake.holdRequests).toHaveLength(1)
  const holdBody = fake.holdRequests[0]
  expect(holdBody.provider).toBe('tencent-meeting')
  expect(holdBody.startsAt).toBe(slots[0].startsAt)
  expect(holdBody.topics).toEqual(['engineering'])
  expect(holdBody.brief).toBe(BRIEF)

  await page.getByRole('button', { name: 'Continue to payment' }).click()
  await expect(page).toHaveURL(`/en/ama/book/confirmation?hold=${HOLD_ID}`)

  // Tencent Meeting links are created asynchronously, so the paid state
  // lands on the honest "being finalized" copy instead of claiming a link.
  await expect(page.getByText('Payment confirmed.')).toBeVisible()
  await expect(page.getByText(/being finalized/)).toBeVisible()
})

test('the Manage Link cancels a booking with a full refund', async ({ page }) => {
  const slot = futureSlot(3, 2)
  const confirmedBooking = {
    status: 'confirmed',
    guestName: 'E2E Guest',
    locale: 'zh',
    guestTimeZone: 'Asia/Taipei',
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    meetingProvider: 'google-meet',
    meetingUrl: 'https://meet.google.com/e2e-fake',
    refundStatus: 'none',
    canReschedule: true,
    canCancel: true,
    refundOnCancel: true,
  }
  const cancelledBooking = {
    ...confirmedBooking,
    status: 'cancelled',
    meetingUrl: null,
    refundStatus: 'pending',
    canReschedule: false,
    canCancel: false,
    refundOnCancel: false,
  }
  let cancelRequests = 0

  await page.route('**/api/ama/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname === `/api/ama/manage/${MANAGE_TOKEN}`) {
      return fulfillJson(route, 200, {
        booking: cancelRequests > 0 ? cancelledBooking : confirmedBooking,
      })
    }
    if (
      request.method() === 'POST' &&
      url.pathname === `/api/ama/manage/${MANAGE_TOKEN}/cancel`
    ) {
      cancelRequests += 1
      return fulfillJson(route, 200, { booking: cancelledBooking })
    }
    return fulfillJson(route, 404, { error: 'not_found' })
  })

  await page.goto(`/ama/manage/${MANAGE_TOKEN}`)

  // The booking summary renders from the manage view.
  await expect(page.getByText('已确认', { exact: true })).toBeVisible()
  await expect(page.getByText('Google Meet').first()).toBeVisible()
  await expect(page.getByText('Asia/Taipei')).toBeVisible()
  await expect(page.getByRole('link', { name: '打开会议链接' })).toBeVisible()

  // Cancelling is a two-step confirmation, never a single click.
  await page.getByRole('button', { name: '取消预订' }).click()
  await expect(
    page.getByText('确定取消吗？付款会自动全额退款，原路退回。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '取消并退款' }).click()

  await expect(page.getByText('已取消。', { exact: true })).toBeVisible()
  await expect(page.getByText('已取消', { exact: true })).toBeVisible()
  await expect(
    page.getByText('退款处理中，通常几个工作日内原路退回。'),
  ).toBeVisible()
  expect(cancelRequests).toBe(1)
})

test('the booking page fails closed to the alternate time request', async ({ page }) => {
  await page.route('**/api/ama/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname === '/api/ama/slots') {
      return fulfillJson(route, 503, { error: 'dependency_unavailable' })
    }
    return fulfillJson(route, 404, { error: 'not_found' })
  })

  await page.goto('/ama/book')

  // The page keeps its shape and states plainly that times are unavailable.
  await expect(page.getByRole('heading', { level: 1, name: '预订时间' })).toBeVisible()
  await expect(page.getByText('现在还拿不到可预约时间。')).toBeVisible()

  // The Alternate Time Request form is the offered recovery path.
  await expect(page.getByLabel('名字')).toBeVisible()
  await expect(page.getByLabel('哪些时间对你合适')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '发送替代时间请求' }),
  ).toBeVisible()
})
