import { cdk, TextFile } from "projen";

const project = new cdk.JsiiProject({
  author: "GoodNotes DevOps",
  authorAddress: "devops@goodnotes.com",
  defaultReleaseBranch: "main",
  jsiiVersion: "~5.0.0",
  name: "ts-interface-generator",
  projenrcTs: true,
  repositoryUrl: "https://github.com/GoodNotes/ts-interface-generator.git",
  devDeps: ["@datadog/datadog-api-client", "ts-morph"],
  prettier: true,
  release: false,
});

// Configuration to export the Dashboard API Object to an Interface
// ensure to add "@datadog/datadog-api-client" as a devDeps to the project first
const datadogSourceFilesGlob =
  "node_modules/@datadog/datadog-api-client/dist/packages/datadog-api-client-v1/**/*.d.ts";
const datadogBuildInstructions = [
  {
    targetFile: "src/Dashboard.generated.ts",
    sourceTypes: [
      {
        file: "node_modules/@datadog/datadog-api-client/dist/packages/datadog-api-client-v1/models/Dashboard.d.ts",
        type: "Dashboard",
      },
    ],
  },
];
const datadogBuildInstructionsFile = "datadog-build-instructions.json";
new TextFile(project, datadogBuildInstructionsFile, {
  lines: [JSON.stringify(datadogBuildInstructions, null, 2)],
});

// add task to generate interfaces from the DataDog API Client
const exportDataDogInterfacesTask = project.addTask(
  "export-datadog-interfaces",
  {
    exec: `ts-node projenrc/cli.ts '${datadogSourceFilesGlob}' '${datadogBuildInstructionsFile}'`,
    description: "Generate interfaces from the DataDog API Client",
  },
);

// add to pre-compile task
project.preCompileTask.spawn(exportDataDogInterfacesTask);

project.synth();
