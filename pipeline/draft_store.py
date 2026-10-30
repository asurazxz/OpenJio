"""Apply extraction revisions without leaving offers live after their source is withdrawn."""


def apply_draft(drafts, draft):
    """Return written, edited, retired, or dropped_other; mutate only this draft id.

    Review decisions live in the app, not in drafts.json, so the pipeline cannot
    tell whether a draft was published. An existing id is only re-extracted when
    its source post changed, so the new draft records sourceEditedAt and the app
    sends any earlier review back to the queue.
    """
    existing = drafts.get(draft['id'])
    if draft['type'] == 'other':
        if not existing:
            return 'dropped_other'
        drafts[draft['id']] = {
            **existing, 'status': 'retired', 'retiredReason': 'source-no-longer-listing',
            'retiredAt': draft.get('source', {}).get('retrievedAt'),
        }
        return 'retired'
    if existing:
        drafts[draft['id']] = {**draft, 'sourceEditedAt': draft.get('source', {}).get('retrievedAt')}
        return 'edited'
    drafts[draft['id']] = draft
    return 'written'
