import { domainError } from './hosted.js';

export function createSupabaseRepository({ url, key, fetchImpl = fetch }) {
  const base = url?.replace(/\/$/, '');
  const configured = Boolean(base && key);
  async function send(path, body, accessToken = key) {
    if (!configured) throw domainError('configuration', 'The shared OpenJio database is not configured.');
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { apikey: key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
      });
    } catch { throw domainError('unavailable', 'The shared database is unavailable.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const codes = { '40001': 'conflict', '42501': 'forbidden', '22023': 'invalid', '23514': 'invalid', '23503': 'invalid', '22P02': 'invalid', 'P0002': 'not_found' };
      const code = response.status === 401 ? 'auth' : codes[data.code] || 'unavailable';
      // Database internals and SQL text never enter browser error messages.
      const message = { conflict:'This plan changed. Please try again.', forbidden:'You do not have permission for that action.', invalid:'Please check the supplied values.', auth:'Please sign in again.', not_found:'This item is no longer available.', unavailable:'The shared database request failed.' }[code];
      throw domainError(code, message);
    }
    return data;
  }
  return {
    configured,
    demoInfo() { return send('/rest/v1/rpc/openjio_demo_info', {}); },
    resetDemo(actorId, fixture) { return send('/rest/v1/rpc/openjio_demo_reset', { p_actor: actorId, p_fixture: fixture }); },
    syncListings(listings) {
      return send('/rest/v1/rpc/openjio_sync_live_listings', { p_listings: listings });
    },
    async verifyToken(token) {
      // Auth verifies the actual token; decoding JWT claims is not authentication.
      try { const user = await send('/auth/v1/user', undefined, token); return user?.id ? { id: user.id } : null; }
      catch (error) { if (['auth','forbidden'].includes(error.code)) return null; throw error; }
    },
    snapshot({ actorId, operation, args }) {
      return send('/rest/v1/rpc/openjio_snapshot', { p_actor: actorId, p_operation: operation, p_args: args });
    },
    commit({ actorId, operation, args, revision, state }) {
      return send('/rest/v1/rpc/openjio_commit', { p_actor: actorId, p_operation: operation, p_args: args, p_revision: revision, p_state: state });
    },
  };
}
