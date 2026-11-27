import { readFileSync } from "node:fs";
import { blindedPairs, evaluateStudy, studyInput, studySplit } from "../src/domains/color-analysis/research";

const [command, input, seed, id] = process.argv.slice(2);
if (command === "plan" && input && seed && id) {
  console.log(JSON.stringify({ split: studySplit(seed, id), pairs: blindedPairs(input, seed, id, true) }, null, 2));
} else if (command === "evaluate" && input) {
  const study = studyInput.parse(JSON.parse(readFileSync(input, "utf8")));
  console.log(JSON.stringify(evaluateStudy(study), null, 2));
} else {
  console.error("Usage: tsx scripts/color-study.ts plan PALETTE_REVISION STUDY_SEED RANDOM_ID | evaluate PRIVATE_INPUT.json");
  process.exitCode = 1;
}
