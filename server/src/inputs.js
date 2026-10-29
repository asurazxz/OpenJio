// Input parsing and Singapore time helpers. No network, no side effects.

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
    this.status = 400;
  }
}

const MODES = new Set(['pt', 'walk']);
const sgFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// Calendar and clock fields for a Date, expressed in Singapore time.
export function singaporeParts(date) {
  const out = {};
  for (const part of sgFormat.formatToParts(date)) out[part.type] = part.value;
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second,
  };
}

// Parses "lat,lng" into { lat, lng }. Throws InputError on anything else.
export function parseLatLng(value, name = 'location') {
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be "lat,lng"`);
  }
  const parts = value.split(',').map((s) => s.trim());
  if (parts.length !== 2 || parts.some((p) => p === '')) {
    throw new InputError(`${name} must be "lat,lng"`);
  }
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new InputError(`${name} must contain numbers`);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new InputError(`${name} is out of range`);
  }
  return { lat, lng };
}

export function parseMode(value) {
  if (typeof value !== 'string' || !MODES.has(value)) {
    throw new InputError('mode must be "pt" or "walk"');
  }
  return value;
}

// Missing depart defaults to now. Otherwise it must be a parseable ISO date.
export function parseDepart(value) {
  if (value === undefined || value === '') return new Date();
  if (typeof value !== 'string') throw new InputError('depart must be an ISO date');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InputError('depart must be an ISO date');
  return date;
}

// Geocode query: trimmed, at least 2 characters, at most 200.
export function parseGeocodeQuery(value) {
  if (typeof value !== 'string') throw new InputError('q is required');
  const q = value.trim();
  if (q.length < 2) throw new InputError('q must be at least 2 characters');
  if (q.length > 200) throw new InputError('q must be at most 200 characters');
  return q;
}
