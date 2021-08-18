import {
  simpleOrbitClozeTaskSpec,
  simpleOrbitQATaskSpec,
} from "./__fixtures__/testData";
import {
  getITPromptForOrbitTaskSpec,
  getOrbitTaskSpecForITPrompt,
} from "./cstOrbitAdapters";

test("round trip", () => {
  expect(
    getOrbitTaskSpecForITPrompt(
      getITPromptForOrbitTaskSpec(simpleOrbitQATaskSpec)!,
    ),
  ).toMatchObject(simpleOrbitQATaskSpec);

  expect(
    getOrbitTaskSpecForITPrompt(
      getITPromptForOrbitTaskSpec(simpleOrbitClozeTaskSpec)!,
    ),
  ).toMatchObject(simpleOrbitClozeTaskSpec);
});
