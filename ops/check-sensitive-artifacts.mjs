import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  findDockerIgnorePolicyGaps,
  isSensitiveArtifact,
} = require("../packages/config/dist/artifact-policy.js");

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const sensitiveFiles = trackedFiles.filter(isSensitiveArtifact);

if (sensitiveFiles.length > 0) {
  console.error("Artefatos sensiveis rastreados pelo Git:");
  for (const file of sensitiveFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const dockerIgnoreGaps = findDockerIgnorePolicyGaps(
  readFileSync(new URL("../.dockerignore", import.meta.url), "utf8"),
);
if (dockerIgnoreGaps.length > 0) {
  console.error("Regras obrigatorias ausentes do contexto Docker:");
  for (const rule of dockerIgnoreGaps) console.error(`- ${rule}`);
  process.exit(1);
}

console.log(
  `Politica de artefatos e contexto Docker validada em ${trackedFiles.length} arquivos rastreados.`,
);
