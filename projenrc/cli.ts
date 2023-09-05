import { readFileSync } from "fs";
import { exportTypes, BuildInstruction } from "./export";

const projectPathsGlob = process.argv[2];
if (!projectPathsGlob) {
  throw new Error("Missing glob pattern argument");
}
const buildInstructionsPath = process.argv[3];
if (!buildInstructionsPath) {
  throw new Error("Missing build instructions argument");
}

// read json from disk
const buildInstructions = JSON.parse(
  readFileSync(buildInstructionsPath, { encoding: "utf-8" }),
) as Array<BuildInstruction>;

exportTypes(
  // ensure to add "@datadog/datadog-api-client" as a devDeps to the project first
  projectPathsGlob,
  buildInstructions,
);
