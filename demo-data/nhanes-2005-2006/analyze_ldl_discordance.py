#!/usr/bin/env python3
"""Reproduce the LDL-C/ApoB discordance analysis used by the Cly demo.

The script deliberately has no network behavior. It reads the six official
NHANES 2005-2006 XPT files in ./raw and writes aggregate, deidentified results
to ./derived/ldl_discordance_summary.json.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
DERIVED = ROOT / "derived"
SEED = 20260722
DISCORDANCE_THRESHOLD = 20.0
RIDRETH1_LABELS = {
    1: "Mexican American",
    2: "Other Hispanic",
    3: "Non-Hispanic White",
    4: "Non-Hispanic Black",
    5: "Other or multiracial",
}


def load_xpt(name: str) -> pd.DataFrame:
    return pd.read_sas(RAW / f"{name}.XPT", format="xport", encoding="latin-1")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def weighted_percentile_rank(values: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Return tied midpoint percentile ranks using NHANES fasting weights."""
    frame = pd.DataFrame({"value": values, "weight": weights})
    grouped = frame.groupby("value", sort=True)["weight"].sum()
    midpoint = (grouped.cumsum() - grouped / 2.0) / grouped.sum()
    return frame["value"].map(midpoint).to_numpy(dtype=float)


def sigmoid(values: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(values, -30.0, 30.0)))


def fit_weighted_logistic(
    design: np.ndarray,
    target: np.ndarray,
    weights: np.ndarray,
    ridge: float = 1.0,
) -> np.ndarray:
    """Fit a deterministic ridge-logistic model with Newton updates."""
    normalized_weights = weights / weights.mean()
    coefficients = np.zeros(design.shape[1], dtype=float)
    penalty = np.eye(design.shape[1], dtype=float)
    penalty[0, 0] = 0.0
    for _ in range(100):
        probability = sigmoid(design @ coefficients)
        curvature = normalized_weights * probability * (1.0 - probability)
        gradient = (
            design.T @ (normalized_weights * (target - probability))
            - ridge * penalty @ coefficients
        )
        hessian = design.T @ (curvature[:, None] * design) + ridge * penalty
        update = np.linalg.solve(hessian, gradient)
        coefficients += update
        if np.max(np.abs(update)) < 1e-8:
            break
    return coefficients


def weighted_auc(
    target: np.ndarray, probability: np.ndarray, weights: np.ndarray
) -> float:
    order = np.argsort(probability, kind="stable")
    sorted_target = target[order]
    sorted_weights = weights[order]
    positive = sorted_weights * sorted_target
    negative = sorted_weights * (1.0 - sorted_target)
    favorable_pairs = np.sum(positive * (np.cumsum(negative) - negative / 2.0))
    return float(favorable_pairs / (positive.sum() * negative.sum()))


def stratified_folds(target: np.ndarray, count: int = 5) -> np.ndarray:
    rng = np.random.default_rng(SEED)
    folds = np.empty(len(target), dtype=int)
    for value in (0.0, 1.0):
        indices = np.where(target == value)[0]
        rng.shuffle(indices)
        for offset, index in enumerate(indices):
            folds[index] = offset % count
    return folds


def cross_validated_predictions(
    raw_design: np.ndarray,
    target: np.ndarray,
    weights: np.ndarray,
    folds: np.ndarray,
) -> np.ndarray:
    predictions = np.zeros(len(target), dtype=float)
    for fold in np.unique(folds):
        train = folds != fold
        test = ~train
        mean = np.average(raw_design[train], axis=0, weights=weights[train])
        variance = np.average(
            (raw_design[train] - mean) ** 2,
            axis=0,
            weights=weights[train],
        )
        scale = np.sqrt(variance)
        scale[scale < 1e-9] = 1.0
        train_design = np.column_stack(
            [np.ones(train.sum()), (raw_design[train] - mean) / scale]
        )
        test_design = np.column_stack(
            [np.ones(test.sum()), (raw_design[test] - mean) / scale]
        )
        coefficients = fit_weighted_logistic(
            train_design, target[train], weights[train]
        )
        predictions[test] = sigmoid(test_design @ coefficients)
    return predictions


def weighted_rate(target: pd.Series | np.ndarray, weights: pd.Series | np.ndarray) -> float:
    return float(np.average(np.asarray(target, dtype=float), weights=np.asarray(weights)))


def rounded(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def main() -> None:
    triglycerides = load_xpt("TRIGLY_D")
    data = triglycerides
    for name in ("HDL_D", "TCHOL_D", "DEMO_D", "BMX_D", "BPX_D"):
        data = data.merge(load_xpt(name), on="SEQN", how="left", validate="one_to_one")

    data["mean_systolic_bp"] = data[
        ["BPXSY1", "BPXSY2", "BPXSY3", "BPXSY4"]
    ].mean(axis=1)
    required = [
        "WTSAF2YR",
        "RIDAGEYR",
        "RIAGENDR",
        "RIDRETH1",
        "BMXBMI",
        "BMXWAIST",
        "mean_systolic_bp",
        "LBXTR",
        "LBDLDL",
        "LBXAPB",
        "LBDHDD",
        "LBXTC",
    ]
    analytic = data.loc[data["RIDAGEYR"] >= 20, ["SEQN", *required]].dropna().copy()
    analytic = analytic.loc[
        (analytic["WTSAF2YR"] > 0) & (analytic["LBXTR"] < 400)
    ].reset_index(drop=True)

    weights = analytic["WTSAF2YR"].to_numpy(dtype=float)
    analytic["ldl_percentile"] = weighted_percentile_rank(
        analytic["LBDLDL"].to_numpy(), weights
    )
    analytic["apob_percentile"] = weighted_percentile_rank(
        analytic["LBXAPB"].to_numpy(), weights
    )
    analytic["percentile_gap"] = 100.0 * (
        analytic["apob_percentile"] - analytic["ldl_percentile"]
    )
    analytic["discordant_high_apob"] = (
        analytic["percentile_gap"] >= DISCORDANCE_THRESHOLD
    ).astype(float)
    target = analytic["discordant_high_apob"].to_numpy(dtype=float)

    race_columns = [
        (analytic["RIDRETH1"] == code).astype(float).to_numpy()
        for code in (2, 3, 4, 5)
    ]
    full_design = np.column_stack(
        [
            analytic["RIDAGEYR"].to_numpy(),
            (analytic["RIAGENDR"] == 2).astype(float).to_numpy(),
            analytic["BMXBMI"].to_numpy(),
            analytic["BMXWAIST"].to_numpy(),
            analytic["mean_systolic_bp"].to_numpy(),
            np.log1p(analytic["LBXTR"].to_numpy()),
            analytic["LBDHDD"].to_numpy(),
            analytic["LBDLDL"].to_numpy(),
            *race_columns,
        ]
    )
    baseline_design = analytic[["LBDLDL"]].to_numpy(dtype=float)
    folds = stratified_folds(target)
    baseline_probability = cross_validated_predictions(
        baseline_design, target, weights, folds
    )
    full_probability = cross_validated_predictions(full_design, target, weights, folds)

    top_quintile_threshold = float(np.quantile(full_probability, 0.8))
    top_quintile = full_probability >= top_quintile_threshold
    triglyceride_hdl_ratio = analytic["LBXTR"] / analytic["LBDHDD"]
    ratio_quintile = pd.qcut(triglyceride_hdl_ratio, 5, labels=False, duplicates="drop")
    highest_ratio_quintile = ratio_quintile == ratio_quintile.max()
    obesity_groups = {
        "normal_bmi": analytic["BMXBMI"] < 25,
        "overweight": (analytic["BMXBMI"] >= 25) & (analytic["BMXBMI"] < 30),
        "obesity": analytic["BMXBMI"] >= 30,
    }

    source_names = ["TRIGLY_D", "HDL_D", "TCHOL_D", "DEMO_D", "BMX_D", "BPX_D"]
    summary = {
        "analysis": {
            "title": "Predicting discordantly high ApoB when LDL-C looks reassuring",
            "research_question": "Can basic health data predict when LDL cholesterol gives a misleading picture of heart-disease risk?",
            "cycle": "NHANES 2005-2006",
            "population": "Adults age 20+ with complete fasting lipid, anthropometric, and blood-pressure data",
            "outcome_definition": "ApoB percentile at least 20 weighted population percentile points above LDL-C percentile",
            "caution": "The outcome is LDL-C/ApoB discordance, not an observed cardiovascular event. This is an exploratory, internally cross-validated proof of concept and not a clinical decision rule.",
            "seed": SEED,
        },
        "cohort": {
            "fasting_laboratory_records": int(len(triglycerides)),
            "complete_adult_records": int(len(analytic)),
            "discordant_records": int(target.sum()),
            "weighted_discordance_prevalence": rounded(weighted_rate(target, weights)),
        },
        "model": {
            "validation": "Deterministic stratified 5-fold cross-validation",
            "features": [
                "LDL-C",
                "age",
                "sex",
                "race and ethnicity",
                "BMI",
                "waist circumference",
                "mean systolic blood pressure",
                "log triglycerides",
                "HDL-C",
            ],
            "ldl_only_weighted_auc": rounded(weighted_auc(target, baseline_probability, weights)),
            "full_model_weighted_auc": rounded(weighted_auc(target, full_probability, weights)),
            "full_model_weighted_brier": rounded(
                np.average((full_probability - target) ** 2, weights=weights)
            ),
            "top_risk_quintile_weighted_prevalence": rounded(
                weighted_rate(target[top_quintile], weights[top_quintile])
            ),
            "top_risk_quintile_weighted_case_capture": rounded(
                np.sum(weights[top_quintile] * target[top_quintile])
                / np.sum(weights * target)
            ),
        },
        "signals": {
            "highest_triglyceride_to_hdl_quintile_weighted_prevalence": rounded(
                weighted_rate(target[highest_ratio_quintile], weights[highest_ratio_quintile])
            ),
            "bmi_group_weighted_prevalence": {
                name: rounded(weighted_rate(target[mask], weights[mask]))
                for name, mask in obesity_groups.items()
            },
            "mean_triglycerides_mg_dl": {
                "discordant": rounded(analytic.loc[target == 1, "LBXTR"].mean(), 1),
                "other": rounded(analytic.loc[target == 0, "LBXTR"].mean(), 1),
            },
        },
        "provenance": {
            "retrieved": "2026-07-22",
            "publisher": "CDC National Center for Health Statistics",
            "documentation": "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2005/DataFiles/TRIGLY_D.htm",
            "source_files": {
                f"{name}.XPT": {
                    "sha256": sha256(RAW / f"{name}.XPT"),
                    "rows": int(len(load_xpt(name))),
                }
                for name in source_names
            },
        },
        "category_labels": {str(key): value for key, value in RIDRETH1_LABELS.items()},
    }

    DERIVED.mkdir(exist_ok=True)
    output = DERIVED / "ldl_discordance_summary.json"
    output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output}")
    print(
        f"n={len(analytic)}; weighted prevalence={summary['cohort']['weighted_discordance_prevalence']:.1%}; "
        f"AUC={summary['model']['full_model_weighted_auc']:.3f}"
    )


if __name__ == "__main__":
    main()
