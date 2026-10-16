#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["fsrs-rs-python==0.9.3"]
# ///
"""Fit FSRS-6 locally; never upload history or change the source vault.

Run with `uv run --python 3.12 calibrateFSRS.py --input /private/export.json
--output /private/tmp/orbit-fsrs-calibration`. Output is a private report and
21 weights, not an automatically applied scheduler change. Remembered is Good
(3), Forgotten is Again (1); binary history cannot identify Hard/Easy separately.

Prefix construction follows the upstream train_csv.py example. UTC calendar-day
differences deliberately match ts-fsrs 5.4.2's low-level next_state implementation.
"""

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
import math
import os
from pathlib import Path
import re
import time


RATINGS = {"remembered": 3, "forgotten": 1}
LEGACY_ID = re.compile(r"^legacy/(?:\d+/)?(.+)$")
MILLIS_PER_DAY = 86_400_000


@dataclass(frozen=True)
class Sample:
    timestamp: float
    observation_id: str
    card_id: int
    reviews: tuple[tuple[int, int], ...]


def utc_day_difference(previous: float, current: float) -> int:
    return math.floor(current / MILLIS_PER_DAY) - math.floor(previous / MILLIS_PER_DAY)


def extract_samples(observations: dict) -> tuple[list[Sample], dict]:
    """Only importer aliases with the same original ID AND payload are duplicates.

    Distinct IDs with identical timestamps/payloads remain real repetitions. Cloze
    components are independent cards. Skips/reschedules convey no memory outcome.
    """
    groups = defaultdict(list)
    seen_legacy = set()
    counts = Counter()
    for observation_id, review in sorted(observations.items()):
        if review["kind"] != "review":
            counts["reschedulesExcluded"] += 1
            continue
        counts["rawReviewObservations"] += 1
        legacy = LEGACY_ID.fullmatch(observation_id)
        if legacy:
            identity = (
                legacy.group(1),
                json.dumps(review, sort_keys=True, separators=(",", ":")),
            )
            if identity in seen_legacy:
                counts["duplicateLegacyAliasesExcluded"] += 1
                continue
            seen_legacy.add(identity)
        counts["uniqueReviewObservations"] += 1
        if review["outcome"] not in RATINGS:
            counts["skippedExcluded"] += 1
            continue
        counts["binaryReviews"] += 1
        counts[review["outcome"]] += 1
        timestamp = review["occurredAtTimestampMillis"]
        if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp):
            raise ValueError("Review timestamp must be finite milliseconds")
        groups[(review["taskID"], review["componentID"])].append(
            (timestamp, observation_id, RATINGS[review["outcome"]])
        )
    samples = []
    for card_id, (_, history) in enumerate(sorted(groups.items())):
        history.sort()
        previous = history[0][0]
        prefix = []
        for timestamp, observation_id, rating in history:
            delta = utc_day_difference(previous, timestamp)
            prefix.append((rating, delta))
            if delta > 0:
                samples.append(Sample(timestamp, observation_id, card_id, tuple(prefix)))
            elif len(prefix) > 1:
                counts["zeroDayReviewsRetainedAsContext"] += 1
            previous = timestamp
    samples.sort(key=lambda item: (item.timestamp, item.observation_id, item.card_id))
    counts["taskComponents"] = len(groups)
    counts["positiveDayTargets"] = len(samples)
    return samples, dict(counts)


def chronological_split(samples: list[Sample], holdout_fraction: float = 0.2):
    """Split by target time, keeping tied timestamps on the same side.

    Every training prefix ends before the cutoff. Holdout prefixes may include
    earlier holdout outcomes: these are sequential predictions, not future data.
    """
    if len(samples) < 2 or not 0 < holdout_fraction < 1:
        raise ValueError("Need at least two targets and a valid holdout fraction")
    cutoff = samples[max(1, int(len(samples) * (1 - holdout_fraction)))].timestamp
    train = [sample for sample in samples if sample.timestamp < cutoff]
    holdout = [sample for sample in samples if sample.timestamp >= cutoff]
    if not train or not holdout:
        raise ValueError("Cannot make a strict chronological split")
    return train, holdout, cutoff


def assert_weights(weights):
    if len(weights) != 21 or not all(math.isfinite(weight) for weight in weights):
        raise ValueError("Expected exactly 21 finite FSRS-6 weights")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    # Never put private history-derived parameters in the source checkout.
    output = args.output.resolve()
    if output.is_relative_to(Path(__file__).resolve().parents[3]):
        raise ValueError("Calibration output must be outside the source checkout")
    os.umask(0o077)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)

    from fsrs_rs_python import DEFAULT_PARAMETERS, FSRS, FSRSItem, FSRSReview, TrainingConfig

    if version("fsrs-rs-python") != "0.9.3":
        raise ValueError("Calibration requires pinned fsrs-rs-python==0.9.3")
    assert_weights(DEFAULT_PARAMETERS)
    raw = args.input.read_bytes()
    document = json.loads(raw)
    observations = document.get("vault", document)["observations"]
    samples, counts = extract_samples(observations)
    train, holdout, cutoff = chronological_split(samples)

    def items(selected):
        return [FSRSItem([FSRSReview(*review) for review in sample.reviews]) for sample in selected]

    def fit(selected):
        started = time.monotonic()
        weights = FSRS([]).compute_parameters(
            items(selected),
            card_ids=[sample.card_id for sample in selected],
            enable_short_term=True,
            num_relearning_steps=0,
            training_config=TrainingConfig(seed=2023),
        )
        assert_weights(weights)
        return weights, time.monotonic() - started

    def evaluate(weights):
        result = FSRS(weights).evaluate(items(holdout))
        metrics = {"logLoss": result.log_loss, "binnedRMSE": result.rmse_bins}
        if not all(math.isfinite(value) for value in metrics.values()):
            raise ValueError("Non-finite holdout evaluation")
        return metrics

    def write(name, value):
        (output / name).write_text(json.dumps(value, indent=2) + "\n")

    print(json.dumps({"counts": counts, "trainingTargets": len(train), "holdoutTargets": len(holdout)}), flush=True)
    baseline = evaluate(DEFAULT_PARAMETERS)
    print(f"Default holdout: {baseline}", flush=True)
    candidate, train_seconds = fit(train)
    candidate_metrics = evaluate(candidate)
    print(f"Fitted holdout: {candidate_metrics} ({train_seconds:.1f}s training)", flush=True)
    passed = all(candidate_metrics[key] <= baseline[key] for key in baseline)
    report = {
        "modelVersion": 6,
        "optimizer": "fsrs-rs-python==0.9.3",
        "runtime": "ts-fsrs==5.4.2",
        "inputSHA256": hashlib.sha256(raw).hexdigest(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "training": {"seed": 2023, "epochs": 5, "batchSize": 512,
                     "enableShortTerm": True, "numRelearningSteps": 0},
        "split": {"method": "oldest 80% targets / latest 20%, tied timestamps unsplit",
                  "cutoffTimestampMillis": cutoff, "trainingTargets": len(train),
                  "holdoutTargets": len(holdout), "trainingSeconds": train_seconds},
        "holdout": {"default": baseline, "fitted": candidate_metrics, "passed": passed},
        "limitations": [
            "Binary legacy outcomes map Remembered to Good (3), Forgotten to Again (1).",
            "Hard/Easy-specific behavior is not separately identified by this history.",
            "Holdout is sequential prediction: earlier holdout outcomes remain available context.",
            "Full-data fit metrics are not an independent validation set.",
            "Source export and live vault are unchanged; applying parameters is a separate step.",
        ],
    }
    write("holdout-weights.json", candidate)
    write("report.json", report)
    if not passed:
        raise SystemExit("Holdout worsened; no full-data weights produced. Review report before applying.")
    weights, fit_seconds = fit(samples)
    write("weights.json", weights)
    report["fullDataFitSeconds"] = fit_seconds
    write("report.json", report)
    print(f"Validated 21 weights written to {output / 'weights.json'} ({fit_seconds:.1f}s full-data fit)", flush=True)


if __name__ == "__main__":
    main()
