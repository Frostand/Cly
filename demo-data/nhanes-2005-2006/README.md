# Cly LDL-C discordance demo data

This folder makes the professor demo reproducible from official public data.
It uses the CDC's NHANES 2005-2006 cycle, the first cycle with ApoB, and joins
the fasting lipid panel to demographics, body measurements, and blood pressure.

## Research target

The demo defines a potentially misleading LDL-C result as an ApoB weighted
population percentile at least 20 points higher than the LDL-C percentile.
That flags a cholesterol-depleted particle pattern in which LDL-C may look more
reassuring than ApoB particle burden. It does **not** label cardiovascular
events and is not a clinical decision rule.

## Source files

All files were downloaded on 2026-07-22 from the CDC NHANES 2005-2006 data
release. The analysis output records the SHA-256 and row count of every file.

- `TRIGLY_D.XPT`: LDL-C, triglycerides, ApoB, fasting subsample weight
- `HDL_D.XPT`: HDL-C
- `TCHOL_D.XPT`: total cholesterol
- `DEMO_D.XPT`: age, sex, race and ethnicity, survey design variables
- `BMX_D.XPT`: BMI and waist circumference
- `BPX_D.XPT`: systolic blood pressure measurements

Primary documentation:

- https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2005/DataFiles/TRIGLY_D.htm
- https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2005/DataFiles/HDL_D.htm
- https://www.cdc.gov/nchs/data/nhsr/nhsr127-508.pdf

Scientific framing:

- https://pmc.ncbi.nlm.nih.gov/articles/PMC11170451/

## Reproduce

The script requires Python 3, pandas 2.2, and NumPy 2.3.

```bash
python3 demo-data/nhanes-2005-2006/analyze_ldl_discordance.py
```

It writes `derived/ldl_discordance_summary.json`. The model is a deterministic,
ridge-regularized logistic regression evaluated with stratified five-fold
cross-validation. NHANES fasting weights are used for percentile ranks and
reported metrics; formal variance estimates do not account for strata and PSU,
so this remains an exploratory single-cycle proof of concept.
