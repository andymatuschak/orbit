"""Extractor/split tests need only Python; no optimizer install or private data."""

import unittest
from calibrateFSRS import chronological_split, extract_samples, utc_day_difference


DAY = 86_400_000


def review(timestamp, component="main", outcome="remembered"):
    return {"kind": "review", "taskID": "task", "componentID": component,
            "occurredAtTimestampMillis": timestamp, "outcome": outcome,
            "reviewSessionID": "session"}


class CalibrationTest(unittest.TestCase):
    def test_only_exact_import_aliases_are_deduplicated(self):
        observations = {
            "legacy/original": review(0),
            "legacy/00001/original": review(0),
            "legacy/00002/original": review(0, outcome="forgotten"),
            "new-a": review(0), "new-b": review(0),
            "legacy/different": review(0), "next": review(DAY),
        }
        samples, counts = extract_samples(observations)
        self.assertEqual(counts["duplicateLegacyAliasesExcluded"], 1)
        self.assertEqual(counts["binaryReviews"], 6)
        self.assertEqual(len(samples[0].reviews), 6)
        self.assertEqual(counts["zeroDayReviewsRetainedAsContext"], 4)

    def test_calendar_days_not_elapsed_24_hour_periods(self):
        self.assertEqual(utc_day_difference(DAY - 1, DAY), 1)
        self.assertEqual(utc_day_difference(DAY, 2 * DAY - 1), 0)
        self.assertEqual(utc_day_difference(DAY - 0.25, DAY + 0.25), 1)
        samples, _ = extract_samples({"first": review(0.5), "next": review(DAY + 0.5)})
        self.assertEqual(samples[0].reviews, ((3, 0), (3, 1)))

    def test_cloze_components_and_non_memory_events(self):
        observations = {"a": review(0, "a"), "b": review(0, "b"),
                        "skip": review(DAY, "a", "skipped"),
                        "next-a": review(2 * DAY, "a", "forgotten"),
                        "next-b": review(3 * DAY, "b"),
                        "reschedule": {"kind": "reschedule"}}
        samples, counts = extract_samples(observations)
        self.assertEqual(counts["taskComponents"], 2)
        self.assertEqual(counts["skippedExcluded"], 1)
        self.assertEqual(counts["reschedulesExcluded"], 1)
        self.assertEqual(samples[0].reviews, ((3, 0), (1, 2)))
        self.assertNotEqual(samples[0].card_id, samples[1].card_id)

    def test_chronological_prefixes_have_no_future_outcomes(self):
        observations = {f"review-{index}": review(index * DAY) for index in range(11)}
        samples, _ = extract_samples(observations)
        train, holdout, cutoff = chronological_split(samples)
        self.assertEqual((len(train), len(holdout)), (8, 2))
        self.assertTrue(all(item.timestamp < cutoff for item in train))
        self.assertTrue(all(item.timestamp >= cutoff for item in holdout))
        self.assertEqual(len(train[-1].reviews), 9)
        self.assertEqual(len(holdout[0].reviews), 10)

    def test_tied_cutoff_not_split_across_training_and_holdout(self):
        observations = {f"{component}-{index}": review(index * DAY, component)
                        for component in ("a", "b") for index in range(6)}
        samples, _ = extract_samples(observations)
        train, holdout, _ = chronological_split(samples, 0.3)
        self.assertLess(max(item.timestamp for item in train), min(item.timestamp for item in holdout))


if __name__ == "__main__":
    unittest.main()
