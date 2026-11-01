// Shared publication validation: unknown values stay unknown, never area centroids/default hours.
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const fail = (message) => { const error = new Error(message); error.code = 'invalid'; throw error }
function number(value, name, min, max, integer = false) {
  if (value == null || value === '') return null
  const result = Number(value)
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) fail(`Invalid ${name}.`)
  return result
}
function date(value) {
  if (!value) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Enter a real validity date.')
  return value
}
function windows(value, opening = false) {
  if (value == null) return null
  if (!Array.isArray(value)) fail('Invalid time windows.')
  return value.map((window) => {
    const start = opening ? window?.[0] : window?.start
    const end = opening ? window?.[1] : window?.end
    if (!TIME.test(start) || !TIME.test(end) || start >= end || (opening && (!Array.isArray(window) || window.length !== 2))) fail('Time windows need valid same-day start and end times, with end after start.')
    return opening ? [start, end] : { start, end }
  })
}
function hours(value) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) fail('Opening hours must specify known weekdays; leave blank when unknown.')
  const output = {}
  for (const [day, values] of Object.entries(value)) {
    if (!DAYS.map((d) => d.toLowerCase()).includes(day) || values == null) fail('Invalid opening hours weekday or windows.')
    output[day] = windows(values, true)
  }
  return output
}
function restrictions(value, label) {
  if (value == null) return null
  if (!Array.isArray(value) || value.some((v) => !text(v))) fail(`Invalid ${label}. Use one nonempty item per line.`)
  return value.map(text)
}
function timestamp(value) {
  if (!value) return null
  if (typeof value !== 'string' || !/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('Event time must include a real date, time and timezone.')
  date(value.slice(0, 10))
  return value
}

// allowUnlocated (automatic listings only): a draft whose place could not be found may have no area.
// Without an area there is never a location, so lat/lng/address are dropped rather than guessed.
export function preparePublication(draft, areas, verifiedAt = new Date().toISOString(), { allowUnlocated = false } = {}) {
  const area = areas.find((item) => item.slug === draft.area) || null
  const title = text(draft.title)
  if (!title || (!area && !allowUnlocated)) fail('A title and area are required.')
  if (!['deal', 'event'].includes(draft.type)) fail('Choose deal or event.')
  const lat = area ? number(draft.lat, 'latitude coordinate', -90, 90) : null
  const lng = area ? number(draft.lng, 'longitude coordinate', -180, 180) : null
  const durationMins = number(draft.durationMins, 'duration in whole minutes', 1, 1440, true)
  const openingHours = hours(draft.openingHours)
  const conditions = restrictions(draft.conditions, 'conditions')
  const exclusions = restrictions(draft.exclusions, 'exclusions')
  const validity = {
    dateFrom: date(draft.validity?.dateFrom), dateTo: date(draft.validity?.dateTo),
    daysOfWeek: draft.validity?.daysOfWeek?.length ? draft.validity.daysOfWeek : null,
    timeWindows: windows(draft.validity?.timeWindows?.length ? draft.validity.timeWindows : null),
  }
  if (validity.dateFrom && validity.dateTo && validity.dateFrom > validity.dateTo) fail('Validity end date must follow its start date.')
  if (validity.daysOfWeek && (!Array.isArray(validity.daysOfWeek) || validity.daysOfWeek.some((day) => !DAYS.includes(day)))) fail('Choose valid weekdays.')
  const startsAt = timestamp(draft.startsAt)
  const endsAt = timestamp(draft.endsAt)
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) fail('Event end time must follow its start time.')
  const fields = { lat, lng, durationMins, address: area ? text(draft.address) : null, category: text(draft.category), conditions, exclusions }
  if (draft.type === 'deal') Object.assign(fields, { openingHours, 'validity.dateFrom': validity.dateFrom, 'validity.dateTo': validity.dateTo, 'validity.daysOfWeek': validity.daysOfWeek, 'validity.timeWindows': validity.timeWindows })
  else Object.assign(fields, { startsAt, endsAt })
  const routeUnknown = Object.entries(fields).filter(([, value]) => value == null).map(([field]) => field)
  const unknownFields = [...routeUnknown, ...['merchant', 'priceText', 'summary'].filter((field) => !text(draft[field]))]
  const routeReady = draft.routeReady === true
  if (routeReady && routeUnknown.length) fail(`Route-ready listings require known ${routeUnknown.join(', ')}. Fill them from a verified source or publish for manual viewing only.`)
  return {
    id: `pub-${draft.id}`, type: draft.type, kind: draft.kind || (draft.type === 'deal' ? 'meal' : 'activity'), title,
    summary: text(draft.summary) || '', interests: fields.category ? [fields.category] : [], area: area?.slug ?? null,
    address: fields.address, lat, lng, durationMins, priceLevel: 1, priceText: text(draft.priceText) || 'Price not stated', openingHours,
    startsAt: draft.type === 'event' ? startsAt : null, endsAt: draft.type === 'event' ? endsAt : null,
    merchant: text(draft.merchant), outlets: draft.type === 'deal' ? [{ name: text(draft.merchant) || title, address: fields.address, lat, lng }] : null,
    validity: draft.type === 'deal' ? validity : null, conditions, exclusions, dealText: text(draft.dealText),
    source: { ...(draft.source || {}), kind: 'scraped', verifiedAt }, status: 'published', routeReady,
    reviewStatus: routeReady ? 'route-ready' : 'manual-view-only', unknownFields, rawPostId: draft.rawPostId,
  }
}

export function hoursToEditor(openingHours) {
  return Object.fromEntries(DAYS.map((code) => {
    const day = code.toLowerCase()
    const values = openingHours?.[day]
    return [day, { state: values == null ? 'unknown' : values.length ? 'open' : 'closed', windows: (values || []).map(([start, end]) => ({ start, end })) }]
  }))
}
export function hoursFromEditor(editor) {
  for (const value of Object.values(editor)) {
    if (value.state === 'open' && !value.windows.length) fail('Add an opening window or mark the day unknown.')
  }
  const entries = Object.entries(editor).filter(([, value]) => value.state !== 'unknown').map(([day, value]) => [day, value.state === 'closed' ? [] : value.windows.map(({ start, end }) => [start, end])])
  return entries.length ? Object.fromEntries(entries) : null
}
