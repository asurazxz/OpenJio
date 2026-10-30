import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import parse
import extract

RAW = {'source': 'telegram', 'channel_id': 'fixture', 'message_id': '1', 'url': 'https://example.test/1', 'text': 'Promo 1-3 Nov, weekdays, 12pm-3pm', 'posted_at': '2028-10-29T12:00:00+08:00', 'retrieved_at': '2028-10-29T12:00:00+08:00'}
class DateContextTests(unittest.TestCase):
    def test_unstated_year_uses_post_date_for_regex_and_prompt(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}):
            draft = extract.build_draft(RAW)
        self.assertEqual(draft['validity']['dateFrom'], '2028-11-01')
        self.assertEqual(draft['validity']['dateTo'], '2028-11-03')
        hints = parse.parse_text(RAW['text'])
        prompt = extract._prompt(RAW, hints)
        self.assertIn('2028', prompt)
        self.assertNotIn('current year is 2026', prompt)
    def test_explicit_year_wins_and_unknown_post_date_uses_current_sgt_year(self):
        self.assertEqual(parse.parse_text('Promo 1 Nov 2030')['dateFrom'], '2030-11-01')
        self.assertEqual(parse.parse_text('Promo 1 Nov')['dateFrom'], f'{datetime.now(parse.SGT).year}-11-01')
    def test_missing_hours_do_not_become_opening_hours(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}):
            draft = extract.build_draft({**RAW, 'text': 'Promo 1 Nov 2028'})
        self.assertIsNone(draft['validity']['timeWindows'])
        self.assertIn('validity.timeWindows', draft['unknownFields'])


import draft_store
class DraftRetirementTests(unittest.TestCase):
    def test_edit_to_other_retires_older_draft_and_keeps_tombstone(self):
        old = {'id': 'draft-1', 'type': 'deal', 'status': 'draft', 'title': 'Old offer', 'rawPostId': 'telegram:fixture:1'}
        store = {'draft-1': old.copy()}
        result = draft_store.apply_draft(store, {**old, 'type': 'other', 'source': {'retrievedAt': '2028-11-01T12:00:00+08:00'}})
        self.assertEqual(result, 'retired')
        self.assertEqual(store['draft-1']['status'], 'retired')
        self.assertEqual(store['draft-1']['retiredReason'], 'source-no-longer-listing')
        self.assertEqual(store['draft-1']['title'], 'Old offer')
    def test_edit_to_other_also_retires_reviewed_listing(self):
        store = {'draft-1': {'id': 'draft-1', 'type': 'event', 'status': 'published'}}
        self.assertEqual(draft_store.apply_draft(store, {'id': 'draft-1', 'type': 'other'}), 'retired')
        self.assertEqual(store['draft-1']['status'], 'retired')
    def test_other_without_prior_listing_is_not_stored(self):
        store = {}
        self.assertEqual(draft_store.apply_draft(store, {'id': 'draft-1', 'type': 'other'}), 'dropped_other')
        self.assertEqual(store, {})
    def test_edited_source_replaces_draft_and_marks_it_for_re_review(self):
        store = {'draft-1': {'id': 'draft-1', 'type': 'deal', 'status': 'draft', 'title': 'Reviewed'}}
        edited = {'id': 'draft-1', 'type': 'deal', 'status': 'draft', 'title': 'Edited', 'source': {'retrievedAt': '2028-11-02T09:00:00+08:00'}}
        self.assertEqual(draft_store.apply_draft(store, edited), 'edited')
        self.assertEqual(store['draft-1']['title'], 'Edited')
        self.assertEqual(store['draft-1']['sourceEditedAt'], '2028-11-02T09:00:00+08:00')
    def test_retired_source_can_return_for_review(self):
        store = {'draft-1': {'id': 'draft-1', 'type': 'deal', 'status': 'retired', 'title': 'Old'}}
        returned = {'id': 'draft-1', 'type': 'deal', 'status': 'draft', 'title': 'Back', 'source': {'retrievedAt': '2028-11-03T09:00:00+08:00'}}
        self.assertEqual(draft_store.apply_draft(store, returned), 'edited')
        self.assertEqual(store['draft-1']['status'], 'draft')
    def test_new_draft_has_no_edit_marker(self):
        store = {}
        self.assertEqual(draft_store.apply_draft(store, {'id': 'draft-2', 'type': 'event'}), 'written')
        self.assertNotIn('sourceEditedAt', store['draft-2'])

if __name__ == '__main__': unittest.main()
