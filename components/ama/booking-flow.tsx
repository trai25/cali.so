'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { SlotPicker, type PublicSlot } from '~/components/ama/slot-picker'
import { Button } from '~/components/ui/button'
import { CheckboxGroup, CheckboxItem } from '~/components/ui/checkbox-group'
import { Input } from '~/components/ui/input'
import { RadioGroup, RadioItem } from '~/components/ui/radio-group'
import { Textarea } from '~/components/ui/textarea'
import { trackFunnelEvent } from '~/lib/analytics'
import { AMA_TOPIC_LABELS, AMA_TOPICS, type AmaTopic } from '~/lib/ama/booking/topics'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import { localePath } from '~/lib/locale-route'
import { assignLocation } from '~/lib/navigation'
import { cn } from '~/lib/utils'

const HOLD_SYNC_INTERVAL_MS = 60_000
const MAX_BRIEF_LENGTH = 2000
const URL_SLOTS = [0, 1, 2] as const

type Stage = 'loading' | 'unavailable' | 'open' | 'hold' | 'expired'

type Hold = {
  id: string
  startsAt: string
  endsAt: string
  /** Server authority, mirrored locally as epoch ms for the countdown. */
  expiresAtMs: number
}

type FieldKey =
  | 'slot'
  | 'name'
  | 'email'
  | 'topics'
  | 'brief'
  | 'url-0'
  | 'url-1'
  | 'url-2'

type NoticeKey =
  | 'slot_taken'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'network'
  | null

const FIELD_ERRORS: Record<FieldKey, { zh: string; en: string }> = {
  slot: { zh: '请先选择一个时间。', en: 'Pick a time first.' },
  name: { zh: '请填写你的名字。', en: 'Please add your name.' },
  email: { zh: '请填写有效的邮箱地址。', en: 'Please enter a valid email address.' },
  topics: { zh: '请至少选择一个话题。', en: 'Choose at least one topic.' },
  brief: {
    zh: '请写几句你想聊什么，这一小时才能对你最有价值。',
    en: 'A few sentences about what you want to cover makes the hour count.',
  },
  'url-0': { zh: '链接需要以 http:// 或 https:// 开头。', en: 'Links must start with http:// or https://.' },
  'url-1': { zh: '链接需要以 http:// 或 https:// 开头。', en: 'Links must start with http:// or https://.' },
  'url-2': { zh: '链接需要以 http:// 或 https:// 开头。', en: 'Links must start with http:// or https://.' },
}

const NOTICES: Record<Exclude<NoticeKey, null>, { zh: string; en: string }> = {
  slot_taken: {
    zh: '这个时间刚刚被别人订走了，请再选一个。你填写的内容都还在。',
    en: 'That time was just taken. Pick another one; everything you typed is still here.',
  },
  rate_limited: {
    zh: '请求有点频繁，请稍等片刻再试。',
    en: 'Too many attempts. Wait a moment and try again.',
  },
  provider_unavailable: {
    zh: '预订服务暂时不可用。你可以稍后再试，或者直接把你方便的时间发给我。',
    en: 'Booking is temporarily unavailable. Try again shortly, or send an alternate time request instead.',
  },
  network: {
    zh: '网络似乎断开了，请检查连接后重试。',
    en: 'The network seems offline. Check your connection and try again.',
  },
}

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function isValidUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value)
}

async function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function heldTimeFormatters(timeZone: string) {
  const options: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }
  try {
    return {
      zh: new Intl.DateTimeFormat('zh-CN', { ...options, hour12: false, hour: '2-digit' }),
      en: new Intl.DateTimeFormat('en-US', { ...options, hour12: true }),
    }
  } catch {
    return {
      zh: new Intl.DateTimeFormat('zh-CN', { hour12: false }),
      en: new Intl.DateTimeFormat('en-US', { hour12: true }),
    }
  }
}

// The blog-post h2 register (boxed ordinal + hazard hatch + editorial
// heading text) for the form's numbered sections. Rendered as children of
// an <h2> or <legend> so fieldset semantics stay intact.
function SectionHeading({ index, zh, en }: { index: number; zh: string; en: string }) {
  return (
    <>
      <span className="section-tag" aria-hidden>
        <span className="section-tag-index">{String(index).padStart(2, '0')}</span>
        <span className="section-tag-hatch" />
      </span>
      <span className="text-lg font-semibold tracking-[-0.02em] text-foreground">
        <T zh={zh} en={en} />
      </span>
    </>
  )
}

function FieldError({ id, error }: { id: string; error: FieldKey | undefined }) {
  if (!error) return null
  const copy = FIELD_ERRORS[error]
  return (
    <p id={id} role="alert" className="text-[13px] text-foreground">
      <T zh={copy.zh} en={copy.en} />
    </p>
  )
}

/**
 * The unpaid recovery path: guests who cannot use any open time describe
 * what would work instead. Nothing is reserved and nothing is charged.
 */
function AlternateTimeRequestForm({
  timeZone,
  defaultName,
  defaultEmail,
}: {
  timeZone: string
  defaultName: string
  defaultEmail: string
}) {
  const locale = useLocale()
  const baseId = useId()
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [preferredWindows, setPreferredWindows] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'preferredWindows', true>>>({})
  const [notice, setNotice] = useState<'provider_unavailable' | 'network' | 'rate_limited' | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const windowsRef = useRef<HTMLTextAreaElement>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    if (!name.trim()) nextErrors.name = true
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = true
    if (!preferredWindows.trim()) nextErrors.preferredWindows = true
    setErrors(nextErrors)
    if (nextErrors.name) return nameRef.current?.focus()
    if (nextErrors.email) return emailRef.current?.focus()
    if (nextErrors.preferredWindows) return windowsRef.current?.focus()

    setPending(true)
    setNotice(null)
    try {
      const response = await postJson('/api/ama/alternate-time-requests', {
        name: name.trim(),
        email: email.trim(),
        locale,
        timeZone,
        preferredWindows: preferredWindows.trim(),
        note: note.trim() || undefined,
      })
      if (response.status === 201) {
        trackFunnelEvent('ama_alternate_time_requested')
        setDone(true)
        return
      }
      if (response.status === 429) return setNotice('rate_limited')
      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as { field?: string } | null
        const field = body?.field
        if (field === 'name' || field === 'email' || field === 'preferredWindows') {
          setErrors({ [field]: true })
          return
        }
        return setNotice('network')
      }
      setNotice('provider_unavailable')
    } catch {
      setNotice('network')
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-lg px-4 py-5 shadow-[0_0_0_1px_var(--border)]">
        <p className="text-sm font-medium">
          <T zh="收到了，谢谢！" en="Got it, thank you." />
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          <T
            zh="我会看看这些时间能不能排上，然后邮件回复你。现在还不需要付款，也没有为你预留任何时段。"
            en="I will see whether one of those windows can work and reply by email. Nothing is paid and no time is reserved yet."
          />
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`${baseId}-name`} className="text-muted-foreground">
          <T zh="名字" en="Name" />
        </label>
        <Input
          ref={nameRef}
          id={`${baseId}-name`}
          type="text"
          autoComplete="name"
          value={name}
          disabled={pending}
          aria-invalid={errors.name || undefined}
          aria-describedby={errors.name ? `${baseId}-name-error` : undefined}
          onChange={(event) => setName(event.target.value)}
          destructive={errors.name}
        />
        {errors.name && <FieldError id={`${baseId}-name-error`} error="name" />}
      </div>

      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`${baseId}-email`} className="text-muted-foreground">
          <T zh="邮箱" en="Email" />
        </label>
        <Input
          ref={emailRef}
          id={`${baseId}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          disabled={pending}
          aria-invalid={errors.email || undefined}
          aria-describedby={errors.email ? `${baseId}-email-error` : undefined}
          onChange={(event) => setEmail(event.target.value)}
          destructive={errors.email}
        />
        {errors.email && <FieldError id={`${baseId}-email-error`} error="email" />}
      </div>

      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`${baseId}-windows`} className="text-muted-foreground">
          <T zh="你方便的时间" en="Times that work for you" />
        </label>
        <Textarea
          ref={windowsRef}
          id={`${baseId}-windows`}
          rows={3}
          value={preferredWindows}
          disabled={pending}
          maxLength={1000}
          aria-invalid={errors.preferredWindows || undefined}
          aria-describedby={
            errors.preferredWindows ? `${baseId}-windows-error` : `${baseId}-windows-hint`
          }
          onChange={(event) => setPreferredWindows(event.target.value)}
          className="leading-6"
        />
        {errors.preferredWindows ? (
          <p id={`${baseId}-windows-error`} role="alert" className="text-[13px] text-foreground">
            <T zh="请写几个你方便的时间段。" en="Please describe a few windows that would work." />
          </p>
        ) : (
          <p id={`${baseId}-windows-hint`} className="text-[13px] text-muted-foreground">
            <T
              zh={`例如：工作日晚上 8 点后，或周末上午（${timeZone}）。`}
              en={`For example: weekday evenings after 8pm, or weekend mornings (${timeZone}).`}
            />
          </p>
        )}
      </div>

      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`${baseId}-note`} className="text-muted-foreground">
          <T zh="备注（可选）" en="Note (optional)" />
        </label>
        <Textarea
          id={`${baseId}-note`}
          rows={2}
          value={note}
          disabled={pending}
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          className="leading-6"
        />
      </div>

      {notice && (
        <p role="alert" className="text-sm text-foreground">
          <T zh={NOTICES[notice].zh} en={NOTICES[notice].en} />
        </p>
      )}

      <div>
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          expandHitArea
        >
          {pending ? (
            <T zh="正在发送…" en="Sending…" />
          ) : (
            <T zh="发送时间建议" en="Send alternate time request" />
          )}
        </Button>
      </div>
    </form>
  )
}

export function BookingFlow() {
  const locale = useLocale()
  const baseId = useId()

  const [stage, setStage] = useState<Stage>('loading')
  const [slots, setSlots] = useState<PublicSlot[]>([])
  const [timeZone, setTimeZone] = useState(detectTimeZone)
  const [selected, setSelected] = useState<string | null>(null)

  // Intake state survives every recovery path: timezone changes, taken
  // slots, expired holds. Losing a typed Booking Brief is not acceptable.
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topics, setTopics] = useState<AmaTopic[]>([])
  const [brief, setBrief] = useState('')
  const [urls, setUrls] = useState<[string, string, string]>(['', '', ''])
  const [provider, setProvider] = useState<'google-meet' | 'tencent-meeting'>('google-meet')

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, true>>>({})
  const [notice, setNotice] = useState<NoticeKey>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showAlternate, setShowAlternate] = useState(false)

  const [hold, setHold] = useState<Hold | null>(null)
  // Deliberately not Date.now(): reading the clock during the prerender
  // would block the static shell (Cache Components validation). The real
  // time arrives with the first hold and every countdown tick.
  const [nowMs, setNowMs] = useState(0)
  const [checkoutPending, setCheckoutPending] = useState(false)

  const slotSectionRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const topicsRef = useRef<HTMLFieldSetElement>(null)
  const briefRef = useRef<HTMLTextAreaElement>(null)
  const urlRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ] as const
  const holdRef = useRef<Hold | null>(null)
  const syncingRef = useRef(false)

  useEffect(() => {
    holdRef.current = hold
  }, [hold])

  const fetchSlots = useCallback(async (): Promise<'available' | 'unavailable'> => {
    try {
      const response = await fetch('/api/ama/slots')
      if (!response.ok) return 'unavailable'
      const body = (await response.json()) as {
        status: 'available' | 'unavailable'
        slots: PublicSlot[]
      }
      if (body.status !== 'available') return 'unavailable'
      setSlots(body.slots)
      setSelected((current) =>
        current && body.slots.some((slot) => slot.startsAt === current) ? current : null,
      )
      return 'available'
    } catch {
      return 'unavailable'
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchSlots().then((status) => {
      if (cancelled) return
      setStage(status === 'available' ? 'open' : 'unavailable')
    })
    return () => {
      cancelled = true
    }
  }, [fetchSlots])

  // ── Hold lifecycle: the countdown reflects server authority ─────────
  const syncHold = useCallback(async () => {
    const current = holdRef.current
    if (!current || syncingRef.current) return
    syncingRef.current = true
    try {
      const response = await fetch(`/api/ama/holds/${current.id}`)
      if (response.status === 404) {
        setHold(null)
        setStage('expired')
        return
      }
      if (!response.ok) return
      const body = (await response.json()) as {
        hold:
          | { state: 'active'; startsAt: string; endsAt: string; expiresAt: string; checkoutStarted: boolean }
          | { state: 'paid'; bookingStatus: string }
          | { state: 'processing' | 'expired' | 'cancelled' }
      }
      if (body.hold.state === 'active') {
        const expiresAtMs = new Date(body.hold.expiresAt).getTime()
        setHold({
          id: current.id,
          startsAt: body.hold.startsAt,
          endsAt: body.hold.endsAt,
          expiresAtMs,
        })
        return
      }
      if (body.hold.state === 'paid' || body.hold.state === 'processing') {
        assignLocation(localePath(locale, `/ama/book/confirmation?hold=${current.id}`))
        return
      }
      setHold(null)
      setStage('expired')
    } catch {
      // Offline sync failures leave the local countdown running; the next
      // visibility or online event tries again.
    } finally {
      syncingRef.current = false
    }
  }, [locale])

  useEffect(() => {
    if (stage !== 'hold' || !hold) return

    const tick = window.setInterval(() => setNowMs(Date.now()), 1000)
    const resync = window.setInterval(() => void syncHold(), HOLD_SYNC_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncHold()
    }
    const onOnline = () => void syncHold()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      window.clearInterval(tick)
      window.clearInterval(resync)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [stage, hold, syncHold])

  const remainingMs = hold ? Math.max(0, hold.expiresAtMs - nowMs) : 0

  useEffect(() => {
    // Local zero is a hypothesis, not a verdict: confirm with the server
    // before declaring the Slot Hold expired.
    if (stage !== 'hold' || !hold || remainingMs > 0) return
    void syncHold().then(() => {
      const current = holdRef.current
      if (current && current.expiresAtMs - Date.now() <= 0) {
        setHold(null)
        setStage('expired')
      }
    })
  }, [stage, hold, remainingMs, syncHold])

  function validate(): FieldKey | null {
    const nextErrors: Partial<Record<FieldKey, true>> = {}
    if (!selected) nextErrors.slot = true
    if (!name.trim()) nextErrors.name = true
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = true
    if (topics.length === 0) nextErrors.topics = true
    if (!brief.trim() || brief.length > MAX_BRIEF_LENGTH) nextErrors.brief = true
    for (const index of URL_SLOTS) {
      const value = urls[index].trim()
      if (value && !isValidUrl(value)) nextErrors[`url-${index}`] = true
    }
    setFieldErrors(nextErrors)
    const order: FieldKey[] = ['slot', 'name', 'email', 'topics', 'brief', 'url-0', 'url-1', 'url-2']
    return order.find((key) => nextErrors[key]) ?? null
  }

  function focusField(key: FieldKey) {
    if (key === 'slot') {
      slotSectionRef.current
        ?.querySelector<HTMLButtonElement>('[data-slot="calendar"] button:not(:disabled)')
        ?.focus()
    }
    if (key === 'name') nameRef.current?.focus()
    if (key === 'email') emailRef.current?.focus()
    if (key === 'topics')
      topicsRef.current?.querySelector<HTMLElement>('[data-proximity-index]')?.focus()
    if (key === 'brief') briefRef.current?.focus()
    if (key === 'url-0') urlRefs[0].current?.focus()
    if (key === 'url-1') urlRefs[1].current?.focus()
    if (key === 'url-2') urlRefs[2].current?.focus()
  }

  async function submitHold(event: React.FormEvent) {
    event.preventDefault()
    setNotice(null)
    const firstInvalid = validate()
    if (firstInvalid) {
      focusField(firstInvalid)
      return
    }

    setSubmitting(true)
    try {
      const response = await postJson('/api/ama/holds', {
        startsAt: selected,
        name: name.trim(),
        email: email.trim(),
        locale,
        timeZone,
        topics,
        brief: brief.trim(),
        urls: urls.map((url) => url.trim()).filter(Boolean),
        provider,
      })

      if (response.status === 201) {
        const body = (await response.json()) as {
          hold: { id: string; expiresAt: string; startsAt: string; endsAt: string }
        }
        trackFunnelEvent('ama_hold_created')
        setHold({
          id: body.hold.id,
          startsAt: body.hold.startsAt,
          endsAt: body.hold.endsAt,
          expiresAtMs: new Date(body.hold.expiresAt).getTime(),
        })
        setNowMs(Date.now())
        setStage('hold')
        return
      }

      if (response.status === 409) {
        setNotice('slot_taken')
        setSelected(null)
        const status = await fetchSlots()
        if (status !== 'available') setStage('unavailable')
        return
      }

      if (response.status === 429) return setNotice('rate_limited')

      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as { field?: string } | null
        const map: Record<string, FieldKey> = {
          startsAt: 'slot',
          name: 'name',
          email: 'email',
          topics: 'topics',
          brief: 'brief',
          urls: 'url-0',
        }
        const key = body?.field ? map[body.field] : undefined
        if (key) {
          setFieldErrors({ [key]: true })
          focusField(key)
          return
        }
        return setNotice('network')
      }

      setNotice('provider_unavailable')
    } catch {
      setNotice('network')
    } finally {
      setSubmitting(false)
    }
  }

  async function continueToPayment() {
    const current = holdRef.current
    if (!current) return
    setCheckoutPending(true)
    setNotice(null)
    try {
      const response = await postJson(`/api/ama/holds/${current.id}/checkout`, {})
      if (response.ok) {
        const body = (await response.json()) as { checkout: { url: string } }
        trackFunnelEvent('ama_checkout_started')
        assignLocation(body.checkout.url)
        return
      }
      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        if (body?.error === 'already_paid') {
          assignLocation(localePath(locale, `/ama/book/confirmation?hold=${current.id}`))
          return
        }
        setHold(null)
        setStage('expired')
        return
      }
      if (response.status === 429) return setNotice('rate_limited')
      setNotice('provider_unavailable')
    } catch {
      setNotice('network')
    } finally {
      setCheckoutPending(false)
    }
  }

  async function pickNewTime() {
    setNotice(null)
    setHold(null)
    setSelected(null)
    setStage('loading')
    const status = await fetchSlots()
    setStage(status === 'available' ? 'open' : 'unavailable')
  }

  function handleSelect(startsAt: string) {
    setSelected(startsAt)
    setFieldErrors((current) => {
      if (!current.slot) return current
      const { slot: _slot, ...rest } = current
      return rest
    })
    trackFunnelEvent('ama_slot_selected')
  }

  function toggleTopic(topic: AmaTopic) {
    setTopics((current) =>
      current.includes(topic) ? current.filter((entry) => entry !== topic) : [...current, topic],
    )
  }

  const checkedTopicIndices = useMemo(
    () => new Set(AMA_TOPICS.flatMap((topic, index) => (topics.includes(topic) ? [index] : []))),
    [topics],
  )

  const heldTime = useMemo(() => {
    if (!hold) return null
    const formatters = heldTimeFormatters(timeZone)
    const start = new Date(hold.startsAt)
    return { zh: formatters.zh.format(start), en: formatters.en.format(start) }
  }, [hold, timeZone])

  const remainingWhole = Math.ceil(remainingMs / 1000)
  const remainingMinutes = Math.floor(remainingWhole / 60)
  const remainingSeconds = remainingWhole % 60
  const countdownDisplay = `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`

  // ── Stages ───────────────────────────────────────────────────────────

  if (stage === 'loading') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-6">
        <p className="sr-only">
          {localize(locale, '正在加载可预约时间…', 'Loading available times…')}
        </p>
        <div aria-hidden className="flex flex-col gap-5">
          <div className="h-8 rounded-lg bg-muted" />
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10.5rem]">
            <div className="h-[19rem] rounded-lg bg-muted" />
            <div className="flex flex-col gap-2">
              <div className="h-4 w-24 rounded bg-muted" />
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-11 rounded-full bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'unavailable') {
    return (
      <div className="flex flex-col gap-8">
        <div role="status">
          <p className="text-sm font-medium">
            <T zh="现在还拿不到可预约时间。" en="Times cannot be shown right now." />
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            <T
              zh="预订服务暂时没有开放，或日历这会儿连不上。你可以稍后再来，或者把你方便的时间发给我。"
              en="Booking is not open at the moment, or the calendar cannot be reached. Come back a bit later, or tell me what times would work for you."
            />
          </p>
        </div>
        <AlternateTimeRequestForm timeZone={timeZone} defaultName={name} defaultEmail={email} />
        <div>
          <Button asChild variant="ghost" size="lg" expandHitArea>
            <Link href={localePath(locale, '/ama')}>
              <T zh="返回介绍页" en="Back to the AMA page" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  if (stage === 'expired') {
    return (
      <div className="flex flex-col gap-6">
        <div role="status">
          <p className="text-sm font-medium">
            <T zh="时间保留已经到期。" en="Your held time has expired." />
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            <T
              zh="没有产生任何费用。重新选一个时间就行，你填写的内容都还在。"
              en="Nothing was charged. Just pick a new time; everything you typed is still here."
            />
          </p>
        </div>
        <div>
          <Button type="button" size="lg" expandHitArea onClick={() => void pickNewTime()}>
            <T zh="重新选择时间" en="Pick a new time" />
          </Button>
        </div>
      </div>
    )
  }

  if (stage === 'hold' && hold) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-lg px-4 py-5 shadow-[0_0_0_1px_var(--border)]">
          <p className="text-sm text-muted-foreground">
            <T zh="已为你保留" en="Held for you" />
          </p>
          {heldTime && (
            <p className="mt-1 text-base font-medium tabular-nums">
              <T zh={heldTime.zh} en={heldTime.en} />
            </p>
          )}
          <p className="mt-1 text-[13px] text-muted-foreground">{timeZone}</p>

          <div className="mt-4 flex items-baseline gap-2">
            <span aria-hidden className="text-lg font-medium tabular-nums">
              {countdownDisplay}
            </span>
            <span aria-hidden className="text-[13px] text-muted-foreground">
              <T zh="后释放" en="until this time is released" />
            </span>
          </div>
          {/* Screen readers hear minute-level updates; the seconds above are
              visual only, so the live region stays calm. */}
          <p role="status" aria-live="polite" className="sr-only">
            {localize(
              locale,
              `你的时间已保留，剩余约 ${Math.max(1, remainingMinutes)} 分钟。`,
              `Your time is held. About ${Math.max(1, remainingMinutes)} ${remainingMinutes === 1 ? 'minute' : 'minutes'} remaining.`,
            )}
          </p>
        </div>

        <p className="text-sm leading-6 text-muted-foreground">
          <T
            zh="你的时间会保留 15 分钟。付款通过 Stripe 托管页面完成，银行卡信息不会经过本站。"
            en="Your time is held for 15 minutes. Payment happens on Stripe's hosted page; card details never touch this site."
          />
        </p>

        {notice && (
          <p role="alert" className="text-sm text-foreground">
            <T zh={NOTICES[notice].zh} en={NOTICES[notice].en} />
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="lg"
            expandHitArea
            disabled={checkoutPending}
            onClick={() => void continueToPayment()}
          >
            {checkoutPending ? (
              <T zh="正在前往付款…" en="Heading to payment…" />
            ) : (
              <T zh="继续付款" en="Continue to payment" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            expandHitArea
            disabled={checkoutPending}
            onClick={() => void pickNewTime()}
          >
            <T zh="换一个时间" en="Choose a different time" />
          </Button>
        </div>
      </div>
    )
  }

  // stage === 'open'. The alternate-time form nests nowhere: the intake
  // form and the recovery form stay sibling <form> elements.
  return (
    <div className="flex flex-col gap-10">
      <div ref={slotSectionRef} className="flex flex-col gap-5">
        <h2 className="flex items-center gap-2.5">
          <SectionHeading index={1} zh="选择时间" en="Pick a time" />
        </h2>
        {slots.length > 0 ? (
          <>
            <SlotPicker
              slots={slots}
              timeZone={timeZone}
              onTimeZoneChange={setTimeZone}
              selected={selected}
              onSelect={handleSelect}
              onDateChange={() => setSelected(null)}
              disabled={submitting}
            />
            <FieldError id={`${baseId}-slot-error`} error={fieldErrors.slot ? 'slot' : undefined} />
          </>
        ) : (
          <div role="status">
            <p className="text-sm leading-6 text-muted-foreground">
              <T
                zh="接下来 30 天暂时没有开放的时间。把对你合适的时间发给我，我看看能不能安排。"
                en="No open times in the next 30 days. Tell me what would work for you and I will see what I can do."
              />
            </p>
          </div>
        )}
      </div>

      {slots.length === 0 ? (
        <AlternateTimeRequestForm timeZone={timeZone} defaultName={name} defaultEmail={email} />
      ) : (
        <>
          <form onSubmit={submitHold} noValidate className="flex flex-col gap-10">
          <fieldset className="flex flex-col gap-4" disabled={submitting}>
            <legend className="mb-5 flex items-center gap-2.5">
              <SectionHeading index={2} zh="介绍你自己" en="Introduce yourself" />
            </legend>

            <div className="grid gap-1.5 text-sm">
              <label htmlFor={`${baseId}-name`} className="text-muted-foreground">
                <T zh="名字" en="Name" />
              </label>
              <Input
                ref={nameRef}
                id={`${baseId}-name`}
                type="text"
                autoComplete="name"
                value={name}
                aria-invalid={fieldErrors.name || undefined}
                aria-describedby={fieldErrors.name ? `${baseId}-name-error` : undefined}
                onChange={(event) => setName(event.target.value)}
                destructive={fieldErrors.name}
              />
              <FieldError id={`${baseId}-name-error`} error={fieldErrors.name ? 'name' : undefined} />
            </div>

            <div className="grid gap-1.5 text-sm">
              <label htmlFor={`${baseId}-email`} className="text-muted-foreground">
                <T zh="邮箱" en="Email" />
              </label>
              <Input
                ref={emailRef}
                id={`${baseId}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                aria-invalid={fieldErrors.email || undefined}
                aria-describedby={fieldErrors.email ? `${baseId}-email-error` : undefined}
                onChange={(event) => setEmail(event.target.value)}
                destructive={fieldErrors.email}
              />
              <FieldError id={`${baseId}-email-error`} error={fieldErrors.email ? 'email' : undefined} />
              <p className="text-[13px] text-muted-foreground">
                <T
                  zh="日历邀请、会议链接和管理链接都会发到这个邮箱。"
                  en="The calendar invite, meeting link, and your Manage Link all arrive here."
                />
              </p>
            </div>
          </fieldset>

          <fieldset
            ref={topicsRef}
            className="flex flex-col gap-4"
            disabled={submitting}
            aria-describedby={fieldErrors.topics ? `${baseId}-topics-error` : undefined}
          >
            <legend className="mb-5 flex items-center gap-2.5">
              <SectionHeading index={3} zh="想聊什么" en="What to talk about" />
            </legend>
            <CheckboxGroup checkedIndices={checkedTopicIndices} className="quiet-selection w-full">
              {AMA_TOPICS.map((topic, index) => {
                const label = AMA_TOPIC_LABELS[topic]
                return (
                  <CheckboxItem
                    key={topic}
                    index={index}
                    label={localize(locale, label.zh, label.en)}
                    checked={topics.includes(topic)}
                    onToggle={() => {
                      if (!submitting) toggleTopic(topic)
                    }}
                    className="h-11 touch-manipulation"
                  />
                )
              })}
            </CheckboxGroup>
            <FieldError id={`${baseId}-topics-error`} error={fieldErrors.topics ? 'topics' : undefined} />
          </fieldset>

          <fieldset className="flex flex-col gap-4" disabled={submitting}>
            <legend className="mb-5 flex items-center gap-2.5">
              <SectionHeading index={4} zh="预约简述" en="Booking Brief" />
            </legend>

            <div className="grid gap-1.5 text-sm">
              <label htmlFor={`${baseId}-brief`} className="text-muted-foreground">
                <T zh="你想从这一小时得到什么" en="What would make this hour valuable" />
              </label>
              <Textarea
                ref={briefRef}
                id={`${baseId}-brief`}
                rows={5}
                maxLength={MAX_BRIEF_LENGTH}
                value={brief}
                aria-invalid={fieldErrors.brief || undefined}
                aria-describedby={
                  fieldErrors.brief ? `${baseId}-brief-error` : `${baseId}-brief-hint`
                }
                onChange={(event) => setBrief(event.target.value)}
                className="leading-6"
              />
              {fieldErrors.brief ? (
                <FieldError id={`${baseId}-brief-error`} error="brief" />
              ) : (
                <p id={`${baseId}-brief-hint`} className="text-[13px] text-muted-foreground">
                  <T
                    zh="写下你的处境、卡住的问题和希望带走的答案，聊得越具体越值。"
                    en="Where you are, what you are stuck on, and what you hope to walk away with. Specific beats polished."
                  />
                </p>
              )}
            </div>

            <div className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">
                <T zh="相关链接（可选，最多 3 个）" en="Related links (optional, up to 3)" />
              </span>
              {URL_SLOTS.map((index) => {
                const errorKey: FieldKey = `url-${index}`
                return (
                  <div key={index} className="grid gap-1.5">
                    <Input
                      ref={urlRefs[index]}
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={urls[index]}
                      aria-label={localize(locale, `链接 ${index + 1}`, `Link ${index + 1}`)}
                      aria-invalid={fieldErrors[errorKey] || undefined}
                      aria-describedby={
                        fieldErrors[errorKey] ? `${baseId}-${errorKey}-error` : undefined
                      }
                      onChange={(event) =>
                        setUrls((current) => {
                          const next = [...current] as [string, string, string]
                          next[index] = event.target.value
                          return next
                        })
                      }
                      destructive={fieldErrors[errorKey]}
                    />
                    <FieldError
                      id={`${baseId}-${errorKey}-error`}
                      error={fieldErrors[errorKey] ? errorKey : undefined}
                    />
                  </div>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4" disabled={submitting}>
            <legend className="mb-5 flex items-center gap-2.5">
              <SectionHeading index={5} zh="会议方式" en="Meeting" />
            </legend>
            <RadioGroup
              value={provider}
              onValueChange={(value) => {
                if (!submitting) setProvider(value as 'google-meet' | 'tencent-meeting')
              }}
              className="quiet-selection w-full"
            >
              {(
                [
                  { value: 'google-meet', zh: 'Google Meet', en: 'Google Meet' },
                  { value: 'tencent-meeting', zh: '腾讯会议', en: 'Tencent Meeting' },
                ] as const
              ).map((option, index) => (
                <RadioItem
                  key={option.value}
                  index={index}
                  value={option.value}
                  label={localize(locale, option.zh, option.en)}
                  className="h-11 touch-manipulation"
                />
              ))}
            </RadioGroup>
          </fieldset>

          {notice && (
            <p role="alert" className="text-sm text-foreground">
              <T zh={NOTICES[notice].zh} en={NOTICES[notice].en} />
            </p>
          )}

          <div className="flex flex-col gap-3">
            <div>
              <Button type="submit" size="lg" expandHitArea disabled={submitting}>
                {submitting ? (
                  <T zh="正在预订…" en="Holding your time…" />
                ) : (
                  <T zh="预订" en="Hold this time" />
                )}
              </Button>
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">
              <T
                zh="提交后时间会为你保留 15 分钟，付款在 Stripe 托管页面完成。"
                en="Your time is held for 15 minutes while you pay on Stripe's hosted page."
              />
            </p>
          </div>
          </form>

          <div className="hairline-top pt-6">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              expandHitArea
              aria-expanded={showAlternate}
              onClick={() => setShowAlternate((value) => !value)}
            >
              <T zh="没有合适的时间？把你方便的时间告诉我。" en="No times fit? Tell me what works." />
            </Button>
            {showAlternate && (
              <div className="mt-4">
                <AlternateTimeRequestForm
                  timeZone={timeZone}
                  defaultName={name}
                  defaultEmail={email}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
