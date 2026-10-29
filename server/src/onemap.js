// OneMap client: token management, address search and routing.
import { singaporeParts } from './inputs.js';

const AUTH_URL = 'https://www.onemap.gov.sg/api/auth/post/getToken';
const SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';
const ROUTE_URL = 'https://www.onemap.gov.sg/api/public/routingsvc/route';
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15000;
const SEARCH_LIMIT = 8;

let tokenState = null; // { token, refreshAt }
let inflight = null;

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function isConfigured() {
  return Boolean(process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD);
}

async function send(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw fail('onemap_error', `OneMap request failed: ${err.message}`);
  }
}

async function fetchToken() {
  const res = await send(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ONEMAP_EMAIL,
      password: process.env.ONEMAP_PASSWORD,
    }),
  });
  if (!res.ok) throw fail('onemap_error', `OneMap token request returned ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw fail('onemap_error', 'OneMap token response was not JSON');
  }
  const expirySec = Number(data?.expiry_timestamp);
  if (!data?.access_token || !Number.isFinite(expirySec)) {
    throw fail('onemap_error', 'OneMap token response was malformed');
  }
  tokenState = {
    token: data.access_token,
    refreshAt: expirySec * 1000 - REFRESH_MARGIN_MS,
  };
  return tokenState.token;
}

// Returns a valid token, refreshing it 10 minutes before expiry.
export async function getToken() {
  if (!isConfigured()) {
    throw fail('onemap_missing', 'ONEMAP_EMAIL and ONEMAP_PASSWORD are not set');
  }
  if (tokenState && Date.now() < tokenState.refreshAt) return tokenState.token;
  if (!inflight) {
    inflight = fetchToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function getJson(url, token) {
  const res = await send(url, { headers: { Authorization: token } });
  if (res.status === 401) {
    tokenState = null; // force a fresh token on the next call
    throw fail('onemap_error', 'OneMap rejected the token');
  }
  if (!res.ok) throw fail('onemap_error', `OneMap returned ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw fail('onemap_error', 'OneMap response was not JSON');
  }
}

export async function search(q) {
  const token = await getToken();
  const params = new URLSearchParams({
    searchVal: q,
    returnGeom: 'Y',
    getAddrDetails: 'Y',
    pageNum: '1',
  });
  const data = await getJson(`${SEARCH_URL}?${params}`, token);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .slice(0, SEARCH_LIMIT)
    .map((r) => ({
      name: r.SEARCHVAL,
      address: r.ADDRESS,
      lat: Number(r.LATITUDE),
      lng: Number(r.LONGITUDE),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

// Returns { durationMins, mode, source }. Throws onemap_error if no duration.
export async function route({ from, to, mode, depart }) {
  const token = await getToken();
  const params = new URLSearchParams({
    start: `${from.lat},${from.lng}`,
    end: `${to.lat},${to.lng}`,
  });
  let seconds;
  if (mode === 'pt') {
    const p = singaporeParts(depart);
    params.set('routeType', 'pt');
    params.set('mode', 'TRANSIT');
    params.set('date', `${p.month}-${p.day}-${p.year}`);
    params.set('time', `${p.hour}:${p.minute}:${p.second}`);
    params.set('maxWalkDistance', '1000');
    params.set('numItineraries', '1');
    const data = await getJson(`${ROUTE_URL}?${params}`, token);
    seconds = data?.plan?.itineraries?.[0]?.duration;
  } else if (mode === 'walk') {
    params.set('routeType', 'walk');
    const data = await getJson(`${ROUTE_URL}?${params}`, token);
    seconds = data?.route_summary?.total_time;
  } else {
    throw new Error(`Unsupported route mode: ${mode}`);
  }

  const sec = seconds == null ? NaN : Number(seconds);
  if (!Number.isFinite(sec) || sec <= 0) {
    throw fail('onemap_error', 'OneMap route response had no duration');
  }
  return { durationMins: Math.ceil(sec / 60), mode, source: 'onemap' };
}
