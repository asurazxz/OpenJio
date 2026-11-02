// The link to hand out for a hangout, and whether the viewer may hand it out.
// Private group hangouts use the invite token; Open Jios use their public page.
export function inviteLink(h) {
  const base = window.location.origin
  return h.visibility === 'public' ? `${base}/o/${h.id}` : `${base}/j/${h.inviteToken}`
}

export function canShareInvite(h) {
  if (!h || h.mode === 'solo' || ['ended', 'cancelled'].includes(h.stage)) return false
  return h.visibility === 'public' || h.myRole === 'host' || !!h.inviteToken
}

// Copies the link, or opens the native share sheet on devices that have one. Resolves 'copied',
// 'shared' or 'dismissed'; rejects when copying fails.
export async function shareInvite(h, { native = false } = {}) {
  const url = inviteLink(h)
  if (native && navigator.share) {
    try {
      await navigator.share({ title: h.title, text: `Join "${h.title}" on OpenJio`, url })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'dismissed'
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
