# Professor demo: when LDL-C misleads

## Launch

From the repository root:

```bash
pnpm demo
```

Click **Start demo** in the title bar to reset Cly to a blank local project.
The walkthrough then enters every required input before results appear. The
research results come from the checked-in CDC files and reproducible analysis;
after execution, deterministic workflow records make the finished evidence
trail repeatable.

## Captioned demo video

The blank-to-result professor preview is available at
`output/playwright/ldl-discordance-demo.mp4`. Captions are burned into the
recording, with a matching standalone subtitle file at
`output/playwright/ldl-discordance-demo.srt`. Regenerate both from the live
demo interface with:

```bash
pnpm demo:video
```

## The active-use walkthrough

1. **Start blank.** Click **Start demo** and confirm that the project has no
   question, sources, experiments, runs, or claims.
2. **Enter the brief.** Use **Edit brief** to enter the research question,
   working hypothesis, and the guardrail that the project predicts biomarker
   discordance rather than cardiovascular events.
3. **Add the data.** In Sources, import a Dataset named “NHANES 2005–2006
   fasting lipids and ApoB,” enter
   `demo-data/nhanes-2005-2006/raw` as its location, and describe its role.
4. **Define the experiment.** Create “LDL-C discordance prediction benchmark”
   as a Statistical analysis and record the LDL-C-only comparison hypothesis.
5. **Supply execution inputs.** Run the analysis only after entering the
   dataset, `ApoB percentile >= LDL-C percentile + 20` outcome, seed
   `20260722`, five folds, and the complete basic-health feature list.
6. **Watch the verified replay.** Cly visibly builds the adult fasting cohort,
   runs cross-validation, and verifies metrics and provenance before loading
   any result.
7. **Interpret the comparison.** Review weighted AUC 0.683 for LDL-C alone
   versus 0.925 for basic health data, plus weighted Brier score 0.0458.
8. **Finish the evidence trail.** Review the bounded claim, trace the model
   comparison table to its run and inputs, run the reproducibility audit, and
   return to Overview for the conclusion and next validation step.

## Results worth remembering

- 3,352 fasting-laboratory records produced 1,950 complete adult records.
- Weighted discordance prevalence was 7.4% under the exploratory 20-percentile
  ApoB–LDL-C definition.
- The full basic-health model had weighted cross-validated AUC 0.925 and Brier
  score 0.0458; LDL-C alone had AUC 0.683.
- The highest triglyceride-to-HDL quintile had 30.5% weighted discordance
  prevalence. The highest predicted-risk quintile captured 84.5% of weighted
  discordant cases.

## Scientific guardrail

The target is a biomarker mismatch: ApoB population percentile at least 20
points above LDL-C percentile. It is a useful proof of concept for identifying
when LDL-C may understate particle burden. The current analysis is
cross-sectional, internally validated, based on one NHANES cycle, and does not
observe cardiovascular events. It must not be presented as clinical outcome
prediction or individual medical advice.

## Recovery plan

Click **Start demo** at any time to return to a blank project. Quit and relaunch
`pnpm demo` to restore the deterministic completed fixture. The source analysis
can be rerun with the command documented in
`demo-data/nhanes-2005-2006/README.md`.
