# Cly Open Beta testing

This is the supported start-to-finish Cly Open Beta path. It does not require a
signed or notarized public macOS build.

## Before the session

- Use de-identified, non-sensitive data only.
- Prepare a CSV or TSV file no larger than 20 MB.
- Include a header row, one binary or numeric outcome column, and at least one
  numeric predictor column.
- Binary outcomes must contain exactly two non-empty values. Missing numeric
  predictor values are median-imputed inside each validation fold.

Launch from the repository with `pnpm dev`, or launch the unpacked app produced
by `pnpm package:dir`.

## Tester workflow

1. Open the project switcher and choose **New local project**.
2. In **Research Loop**, select the current **Question** step and enter the
   project name, research question, working hypothesis, and scope note.
3. Create a preliminary claim in **Claims** if the study has an expected result.
4. In **Experiments**, create an experiment with its goal and hypothesis.
5. Select **Run analysis**, choose the local CSV/TSV file, confirm the outcome,
   task, predictors, fold count, and seed, then run it.
6. Review the cross-validated metrics, majority/mean baseline, standardized
   coefficients, dataset checksum, and limitations. Cly saves the dataset
   record, experiment definition, run, metrics, result artifact, generated
   claim, and evidence links. Raw dataset rows are not copied into Cly.
7. Add other sources and link them to the claim. A model result is supporting
   evidence, not proof of causation.
8. Run **Reproducibility → Run audit** and review any warnings.
9. Quit and reopen Cly. Confirm that the project, sources, claims, experiment,
   and run return.
10. Use **Settings → Privacy → Export project** to save a JSON recovery copy.

## Supported analysis boundary

Cly's local engine supports deterministic k-fold binary classification and
numeric regression with numeric predictors. It reports classification AUC,
accuracy, log loss, majority baseline accuracy, and positive rate, or regression
RMSE, MAE, R², and mean-prediction baseline RMSE. It also reports standardized
coefficients and data-quality warnings.

This beta does not perform causal inference, clinical diagnosis, treatment
recommendations, survival analysis, external validation, or automatic handling
of categorical predictors. Results should be treated as exploratory predictive
associations. Audit finding-resolution choices reset after reload, although the
underlying research objects, provenance, runs, metrics, and exported backups are
durable.

## Report a beta problem

Open **Settings → Diagnostics**, choose **Copy diagnostics**, and include the
copied text with the exact action, file shape (never sensitive rows), expected
result, and observed result in the issue report.
