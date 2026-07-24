import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outputDir = path.join(root, "output/playwright");
const rawDir = path.join(outputDir, ".ldl-demo-video");
const rawVideo = path.join(outputDir, "ldl-discordance-demo.webm");
const finalVideo = path.join(outputDir, "ldl-discordance-demo.mp4");
const subtitles = path.join(outputDir, "ldl-discordance-demo.srt");
const poster = path.join(outputDir, "ldl-discordance-demo-poster.png");
const metadata = path.join(outputDir, "ldl-discordance-demo.json");
const port = Number(process.env.CLY_DEMO_VIDEO_PORT ?? 3212);
const baseUrl = `http://127.0.0.1:${port}`;
const width = 1440;
const height = 900;

mkdirSync(outputDir, { recursive: true });
rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });

const server = spawn(
  "pnpm",
  [
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: root,
    env: { ...process.env, VITE_CLY_DEMO_MODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
}

const waitForServer = async () => {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before capture began.\n${serverOutput}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${baseUrl}.\n${serverOutput}`);
};

const formatTimestamp = (milliseconds) => {
  const bounded = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(bounded / 3_600_000);
  const minutes = Math.floor((bounded % 3_600_000) / 60_000);
  const seconds = Math.floor((bounded % 60_000) / 1_000);
  const millis = bounded % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const writeSrt = (entries) => {
  const body = entries
    .map(
      (entry, index) =>
        `${index + 1}\n${formatTimestamp(entry.start)} --> ${formatTimestamp(entry.end)}\n${entry.text}\n`,
    )
    .join("\n");
  writeFileSync(subtitles, body);
};

let browser;
let context;
let page;
let startedAt = 0;
let activeCaption;
const captionEntries = [];

const elapsed = () => Date.now() - startedAt;
const pause = (milliseconds) => page.waitForTimeout(milliseconds);

const finishActiveCaption = () => {
  if (activeCaption) activeCaption.end = elapsed();
  activeCaption = undefined;
};

const setCaption = async (eyebrow, text) => {
  finishActiveCaption();
  activeCaption = { start: elapsed(), end: elapsed(), text };
  captionEntries.push(activeCaption);
  await page.evaluate(
    ({ nextEyebrow, nextText }) => {
      let caption = document.querySelector("#cly-demo-caption");
      if (!caption) {
        caption = document.createElement("aside");
        caption.id = "cly-demo-caption";
        caption.setAttribute("aria-hidden", "true");
        caption.innerHTML = '<span class="cly-demo-eyebrow"></span><p></p>';
        document.body.append(caption);
      }
      caption.querySelector(".cly-demo-eyebrow").textContent = nextEyebrow;
      caption.querySelector("p").textContent = nextText;
      caption.classList.remove("cly-demo-caption-enter");
      void caption.offsetWidth;
      caption.classList.add("cly-demo-caption-enter");
    },
    { nextEyebrow: eyebrow, nextText: text },
  );
};

const addVideoStyles = async () => {
  await page.addStyleTag({
    content: `
      #cly-demo-caption {
        position: fixed;
        z-index: 2147483647;
        left: 50%;
        bottom: 28px;
        width: min(980px, calc(100vw - 96px));
        transform: translateX(-50%);
        box-sizing: border-box;
        padding: 16px 22px 17px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 16px;
        color: #f7fafc;
        background: linear-gradient(135deg, rgba(9, 15, 25, 0.96), rgba(21, 31, 47, 0.94));
        box-shadow: 0 18px 52px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(14px);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      #cly-demo-caption .cly-demo-eyebrow {
        display: block;
        margin-bottom: 5px;
        color: #74d8b4;
        font-size: 12px;
        font-weight: 750;
        letter-spacing: 0.13em;
        line-height: 1.2;
        text-transform: uppercase;
      }
      #cly-demo-caption p {
        margin: 0;
        color: #ffffff;
        font-size: 22px;
        font-weight: 590;
        letter-spacing: -0.012em;
        line-height: 1.34;
        text-wrap: balance;
      }
      #cly-demo-caption.cly-demo-caption-enter {
        animation: cly-demo-caption-in 360ms cubic-bezier(.2,.8,.2,1);
      }
      .cly-demo-focus {
        position: relative;
        z-index: 2;
        outline: 3px solid rgba(56, 189, 149, 0.96) !important;
        outline-offset: 4px !important;
        border-radius: 8px;
        box-shadow: 0 0 0 10px rgba(56, 189, 149, 0.14) !important;
        transition: outline-color 220ms ease, box-shadow 220ms ease;
      }
      @keyframes cly-demo-caption-in {
        from { opacity: 0; transform: translate(-50%, 12px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
    `,
  });
};

const focus = async (locator) => {
  await page.locator(".cly-demo-focus").evaluateAll((nodes) => {
    for (const node of nodes) node.classList.remove("cly-demo-focus");
  });
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((node) => node.classList.add("cly-demo-focus"));
};

const clearFocus = async () => {
  await page.locator(".cly-demo-focus").evaluateAll((nodes) => {
    for (const node of nodes) node.classList.remove("cly-demo-focus");
  });
};

const navigate = async (id, heading) => {
  const destination = page.getByTestId(`nav-${id}`);
  await focus(destination);
  await pause(700);
  await destination.click();
  await page.getByRole("heading", { name: heading, level: 1 }).waitFor();
  await clearFocus();
  await pause(550);
};

const typeSlowly = async (locator, value, delay = 14) => {
  await focus(locator);
  await locator.click();
  await locator.pressSequentially(value, { delay });
  await clearFocus();
};

const titleDocument = (kicker, title, body, footer) => `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; }
        body {
          display: grid;
          place-items: center;
          overflow: hidden;
          color: #f8fafc;
          background:
            radial-gradient(circle at 78% 20%, rgba(39, 172, 135, .24), transparent 32%),
            radial-gradient(circle at 18% 78%, rgba(74, 104, 214, .2), transparent 38%),
            linear-gradient(145deg, #07101b, #101d2c 58%, #0b1722);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        main { width: min(1060px, calc(100vw - 120px)); }
        .kicker {
          margin: 0 0 24px;
          color: #72ddb7;
          font-size: 16px;
          font-weight: 760;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        h1 {
          max-width: 1000px;
          margin: 0;
          font-size: 64px;
          font-weight: 700;
          letter-spacing: -.045em;
          line-height: 1.04;
          text-wrap: balance;
        }
        .rule { width: 90px; height: 4px; margin: 34px 0 28px; border-radius: 999px; background: #47c99d; }
        .body {
          max-width: 900px;
          margin: 0;
          color: #cbd5e1;
          font-size: 27px;
          line-height: 1.45;
          text-wrap: balance;
        }
        footer {
          position: fixed;
          right: 50px;
          bottom: 40px;
          color: #8391a3;
          font-size: 15px;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
      </style>
    </head>
    <body>
      <main>
        <p class="kicker">${kicker}</p>
        <h1>${title}</h1>
        <div class="rule"></div>
        <p class="body">${body}</p>
      </main>
      <footer>${footer}</footer>
    </body>
  </html>
`;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: rawDir, size: { width, height } },
    colorScheme: "light",
  });
  page = await context.newPage();
  const video = page.video();
  startedAt = Date.now();

  await page.setContent(
    titleDocument(
      "Cly · Professor demo",
      "A research question, worked from blank project to verified result",
      "Watch Cly capture the question, connect official data, define the analysis, and finish with evidence and limitations.",
      "NHANES 2005–2006",
    ),
  );
  activeCaption = {
    start: elapsed(),
    end: elapsed(),
    text: "Can basic health data predict when LDL cholesterol gives a misleading picture of heart-disease risk?",
  };
  captionEntries.push(activeCaption);
  await pause(4_500);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "When LDL-C misleads", level: 1 })
    .waitFor();
  await addVideoStyles();
  await setCaption(
    "1 · Launch Cly",
    "Cly opens as a desktop research workspace. We start a fresh guided project so none of the results are preloaded.",
  );
  await pause(2_500);
  const startDemo = page.getByTestId("guided-demo-start");
  await focus(startDemo);
  await pause(900);
  await startDemo.click();
  await page
    .getByRole("heading", { name: "Untitled research project", level: 1 })
    .waitFor();
  await clearFocus();
  await pause(2_000);

  await setCaption(
    "2 · Enter the research brief",
    "The project begins with an explicit question, hypothesis, and scope. The scope keeps biomarker discordance separate from heart-attack prediction.",
  );
  const editBrief = page.getByTestId("edit-project-brief");
  await focus(editBrief);
  await pause(650);
  await editBrief.click();
  const briefDialog = page.getByRole("dialog", {
    name: "Research project brief",
  });
  await typeSlowly(
    briefDialog.getByLabel("Project name"),
    "When LDL-C misleads",
  );
  await typeSlowly(
    briefDialog.getByLabel("Research question"),
    "Can basic health data predict when LDL cholesterol gives a misleading picture of heart-disease risk?",
    10,
  );
  await typeSlowly(
    briefDialog.getByLabel("Working hypothesis"),
    "Triglycerides, HDL-C, BMI, blood pressure, age, and sex can flag people whose ApoB percentile is much higher than their LDL-C percentile.",
    9,
  );
  await typeSlowly(
    briefDialog.getByLabel("Scope note"),
    "Adults in the NHANES 2005-2006 fasting sample; predicts biomarker discordance, not cardiovascular events.",
    9,
  );
  const saveBrief = briefDialog.getByRole("button", { name: "Save brief" });
  await focus(saveBrief);
  await pause(600);
  await saveBrief.click();
  await page
    .getByRole("heading", { name: "When LDL-C misleads", level: 1 })
    .waitFor();
  await clearFocus();
  await pause(3_000);

  await setCaption(
    "3 · Connect the official dataset",
    "Now we add the checked-in CDC NHANES fasting laboratory, demographic, body measurement, and blood-pressure inputs.",
  );
  await navigate("sources", "Source Manager");
  const importSource = page
    .getByRole("button", { name: "Import source" })
    .first();
  await focus(importSource);
  await pause(650);
  await importSource.click();
  const sourceDialog = page.getByRole("dialog", { name: "Import source" });
  await sourceDialog
    .getByLabel("Source type", { exact: true })
    .selectOption("Dataset");
  await typeSlowly(
    sourceDialog.getByLabel("Source title"),
    "NHANES 2005-2006 fasting lipids and ApoB",
  );
  await typeSlowly(
    sourceDialog.getByLabel("Dataset location"),
    "demo-data/nhanes-2005-2006/raw",
  );
  await typeSlowly(
    sourceDialog.getByLabel("Role in this project"),
    "Official CDC inputs for the fasting adult discordance analysis.",
  );
  const importAndScan = sourceDialog.getByRole("button", {
    name: "Import and scan",
  });
  await focus(importAndScan);
  await pause(600);
  await importAndScan.click();
  const importedSource = page
    .locator("#main-workspace")
    .getByText("NHANES 2005-2006 fasting lipids and ApoB", { exact: true })
    .first();
  await importedSource.waitFor();
  await focus(importedSource);
  await pause(3_500);
  await clearFocus();

  await setCaption(
    "4 · Define the experiment",
    "The experiment records the research goal and the comparison we expect: basic health data should outperform LDL-C alone.",
  );
  await navigate("experiments", "Experiment Manager");
  const newExperiment = page
    .getByRole("button", { name: "New experiment" })
    .first();
  await focus(newExperiment);
  await pause(650);
  await newExperiment.click();
  const experimentDialog = page.getByRole("dialog", {
    name: "New experiment",
  });
  await typeSlowly(
    experimentDialog.getByLabel("Name"),
    "LDL-C discordance prediction benchmark",
  );
  await typeSlowly(
    experimentDialog.getByLabel("Research goal"),
    "Predict ApoB-LDL-C percentile discordance from basic health data.",
  );
  await typeSlowly(
    experimentDialog.getByLabel("Hypothesis"),
    "The basic-health model performs better than an LDL-C-only baseline.",
  );
  await experimentDialog
    .getByLabel("Type")
    .selectOption("Statistical analysis");
  const createExperiment = experimentDialog.getByRole("button", {
    name: "Create experiment",
  });
  await focus(createExperiment);
  await pause(600);
  await createExperiment.click();
  const createdExperiment = page
    .locator("#main-workspace")
    .getByText("LDL-C discordance prediction benchmark", { exact: true })
    .first();
  await createdExperiment.waitFor();
  await focus(createdExperiment);
  await pause(3_000);
  await clearFocus();

  await setCaption(
    "5 · Supply the analysis inputs",
    "Before execution, Cly requires the dataset, outcome definition, random seed, cross-validation folds, and exact feature set.",
  );
  const runAnalysis = page.getByTestId("run-guided-analysis");
  await focus(runAnalysis);
  await pause(700);
  await runAnalysis.click();
  const analysisDialog = page.getByRole("dialog", {
    name: "Run LDL-C discordance analysis",
  });
  await typeSlowly(
    analysisDialog.getByLabel("Dataset"),
    "NHANES 2005-2006 fasting sample",
  );
  await typeSlowly(
    analysisDialog.getByLabel("Outcome definition"),
    "ApoB percentile >= LDL-C percentile + 20",
  );
  await typeSlowly(analysisDialog.getByLabel("Random seed"), "20260722", 45);
  await typeSlowly(
    analysisDialog.getByLabel("Cross-validation folds"),
    "5",
    100,
  );
  await typeSlowly(
    analysisDialog.getByLabel("Basic health features"),
    "Age, sex, race/ethnicity, BMI, blood pressure, HDL-C, triglycerides",
    11,
  );
  await pause(1_500);

  await setCaption(
    "6 · Run the verified workflow",
    "Cly builds the 1,950-adult fasting cohort, runs deterministic five-fold validation, and verifies the saved metrics and provenance.",
  );
  const runVerified = analysisDialog.getByRole("button", {
    name: "Run verified analysis",
  });
  await focus(runVerified);
  await pause(750);
  await runVerified.click();
  await page.getByText("Analysis complete").waitFor({ timeout: 12_000 });
  await clearFocus();
  await pause(2_000);

  await setCaption(
    "7 · Compare the result",
    "The basic-health model reaches weighted AUC 0.925 versus 0.683 for LDL-C alone. The weighted Brier score is 0.0458.",
  );
  const fullAuc = page.getByText("0.9249", { exact: true });
  await focus(fullAuc);
  await pause(7_000);
  await clearFocus();

  await setCaption(
    "8 · Review the bounded claim",
    "Cly links the primary claim to its sources, experiment, runs, and caveats. It also records the explicit limitation: this does not predict heart attacks.",
  );
  await navigate("claims", "Claim Audit Board");
  const mainClaim = page
    .getByText("Basic health data identify adults", { exact: false })
    .first();
  await focus(mainClaim);
  await pause(6_500);
  await clearFocus();

  await setCaption(
    "9 · Trace the result",
    "The model comparison table points back to the canonical run, generator, source data, commit, and supported claim.",
  );
  await navigate("provenance", "Figure & Table Provenance");
  const modelTable = page
    .getByText("Model comparison table", { exact: true })
    .first();
  await focus(modelTable);
  await pause(6_500);
  await clearFocus();

  await setCaption(
    "10 · Audit reproducibility",
    "The audit preserves passing data-hash and deterministic-rerun checks while surfacing environment, survey-variance, and external-validation gaps.",
  );
  await navigate("reproducibility", "Reproducibility Auditor");
  const runAudit = page.getByRole("button", { name: "Run audit" });
  await focus(runAudit);
  await pause(750);
  await runAudit.click();
  await page.getByText("Reproducibility audit complete").waitFor();
  await clearFocus();
  await pause(5_000);

  await setCaption(
    "11 · Finish the question",
    "Cly finishes with a linked answer: 7.4% weighted discordance prevalence, strong internal discrimination, and a clear next step—validate in later cohorts.",
  );
  await navigate("overview", "When LDL-C misleads");
  await pause(7_500);

  finishActiveCaption();
  await page.setContent(
    titleDocument(
      "Cly · Research complete",
      "A useful signal for biomarker discordance—not a diagnosis",
      "This cross-sectional, internally validated result predicts when LDL-C and ApoB rankings disagree. It does not predict heart attacks, establish treatment thresholds, or replace clinical judgment.",
      "1,950 adults · 0.925 AUC · External validation next",
    ),
  );
  activeCaption = {
    start: elapsed(),
    end: elapsed(),
    text: "The model predicts biomarker discordance—not heart attacks, treatment decisions, or an individual diagnosis.",
  };
  captionEntries.push(activeCaption);
  await pause(8_000);
  finishActiveCaption();

  await page.close();
  await context.close();
  const capturedPath = await video.path();
  copyFileSync(capturedPath, rawVideo);
  await browser.close();
  browser = undefined;

  writeSrt(captionEntries);

  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      rawVideo,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      finalVideo,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (ffmpeg.status !== 0) {
    throw new Error(`ffmpeg failed.\n${ffmpeg.stderr}`);
  }

  const posterResult = spawnSync(
    "ffmpeg",
    ["-y", "-ss", "00:00:03", "-i", finalVideo, "-frames:v", "1", poster],
    { cwd: root, encoding: "utf8" },
  );
  if (posterResult.status !== 0) {
    throw new Error(`Poster generation failed.\n${posterResult.stderr}`);
  }

  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=width,height,codec_name,r_frame_rate",
      "-of",
      "json",
      finalVideo,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (probe.status !== 0) {
    throw new Error(`ffprobe failed.\n${probe.stderr}`);
  }

  const probeData = JSON.parse(probe.stdout);
  writeFileSync(
    metadata,
    `${JSON.stringify(
      {
        title: "Cly LDL-C discordance blank-to-result professor demo",
        researchQuestion:
          "Can basic health data predict when LDL cholesterol gives a misleading picture of heart-disease risk?",
        generatedAt: new Date().toISOString(),
        video: path.relative(root, finalVideo),
        captions: path.relative(root, subtitles),
        poster: path.relative(root, poster),
        captionCount: captionEntries.length,
        probe: probeData,
      },
      null,
      2,
    )}\n`,
  );

  if (!existsSync(finalVideo) || readFileSync(finalVideo).byteLength === 0) {
    throw new Error("The final MP4 was not created.");
  }

  rmSync(rawVideo, { force: true });
  rmSync(rawDir, { recursive: true, force: true });

  console.log(`Video: ${path.relative(root, finalVideo)}`);
  console.log(`Captions: ${path.relative(root, subtitles)}`);
  console.log(`Poster: ${path.relative(root, poster)}`);
  console.log(`Metadata: ${path.relative(root, metadata)}`);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server.exitCode === null) server.kill("SIGTERM");
}
