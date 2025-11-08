// Master Pipeline Script
// Complete automated pipeline for downloading, transforming, validating, and fixing images

import fs from "fs";
import { spawn } from "child_process";

interface PipelineStep {
  name: string;
  script: string;
  args?: string[];
  optional?: boolean;
}

const steps: PipelineStep[] = [
  {
    name: "Download from Ravensburger",
    script: "scripts/ravensburg-pipeline.ts",
  },
  {
    name: "Cleanup JPG files",
    script: "scripts/cleanup-jpg.ts",
    args: ["010"],
  },
  {
    name: "Validate Images",
    script: "scripts/validate-images.ts",
  },
  {
    name: "Fix Invalid Dimensions",
    script: "scripts/fix-dimensions.ts",
    optional: true, // Only run if validation found issues
  },
  {
    name: "Re-validate Images",
    script: "scripts/validate-images.ts",
    optional: true, // Only run if fixes were applied
  },
];

interface StepResult {
  step: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Run a single script
 */
function runScript(script: string, args: string[] = []): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", [script, ...args], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output: output + errorOutput,
      });
    });

    child.on("error", (error) => {
      resolve({
        success: false,
        output: error.message,
      });
    });
  });
}

/**
 * Check if fixes are needed based on validation report
 */
function needsFixes(): boolean {
  const reports = fs.readdirSync(".")
    .filter((f) => f.startsWith("validation-report-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (reports.length === 0) return false;

  const latestReport = JSON.parse(fs.readFileSync(reports[0], "utf-8"));
  return latestReport.invalidFiles > 0;
}

/**
 * Main pipeline
 */
async function runPipeline(): Promise<void> {
  console.log("🚀 Starting Master Pipeline");
  console.log("=".repeat(80));
  console.log("");

  const startTime = Date.now();
  const results: StepResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Skip optional steps if not needed
    if (step.optional) {
      if (step.name.includes("Fix") && !needsFixes()) {
        console.log(`\n⏭️  Skipping ${step.name} (no fixes needed)\n`);
        continue;
      }
      if (step.name.includes("Re-validate") && !results.some((r) => r.step.includes("Fix"))) {
        console.log(`\n⏭️  Skipping ${step.name} (no fixes applied)\n`);
        continue;
      }
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`📋 Step ${i + 1}/${steps.length}: ${step.name}`);
    console.log(`${"=".repeat(80)}\n`);

    const stepStartTime = Date.now();
    const result = await runScript(step.script, step.args || []);
    const stepDuration = (Date.now() - stepStartTime) / 1000;

    results.push({
      step: step.name,
      success: result.success,
      duration: stepDuration,
      error: result.success ? undefined : result.output,
    });

    if (!result.success) {
      console.error(`\n❌ Step failed: ${step.name}`);
      console.error(`Error: ${result.output}`);
      break;
    }

    console.log(`\n✅ Completed ${step.name} in ${stepDuration.toFixed(2)}s`);
  }

  const totalDuration = (Date.now() - startTime) / 1000;

  // Print final summary
  console.log("\n" + "=".repeat(80));
  console.log("📊 Pipeline Summary");
  console.log("=".repeat(80));

  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    console.log(
      `${status} ${result.step.padEnd(40)} ${result.duration.toFixed(2)}s`
    );
  }

  console.log(`\nTotal duration: ${totalDuration.toFixed(2)}s`);

  const allSuccess = results.every((r) => r.success);
  if (allSuccess) {
    console.log("\n🎉 Pipeline completed successfully!");
  } else {
    console.log("\n⚠️  Pipeline completed with errors");
    process.exit(1);
  }

  console.log("=".repeat(80));
}

// Run pipeline
runPipeline().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

