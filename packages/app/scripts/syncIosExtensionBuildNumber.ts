import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PBXNativeTarget, XcodeProject } from "@bacons/xcode";
import { build } from "@bacons/xcode/json";

const WIDGET_TARGET_NAME = "OrbitWidget";

async function main() {
  const buildNumber = process.env.EAS_BUILD_IOS_BUILD_NUMBER;
  if (!buildNumber || !/^[1-9]\d*$/.test(buildNumber)) {
    throw new Error("EAS_BUILD_IOS_BUILD_NUMBER must be a positive integer");
  }

  const projectPath = path.resolve(
    process.env.ORBIT_IOS_PROJECT_PATH ??
      path.join(process.cwd(), "ios/Orbit.xcodeproj/project.pbxproj"),
  );
  const project = XcodeProject.open(projectPath);
  const widgetTarget = project.rootObject.props.targets.find(
    (target) =>
      PBXNativeTarget.is(target) &&
      target.props.productName === WIDGET_TARGET_NAME,
  );
  if (!widgetTarget) {
    throw new Error(`Could not find ${WIDGET_TARGET_NAME} target`);
  }

  widgetTarget.setBuildSetting("CURRENT_PROJECT_VERSION", buildNumber);
  const configurations =
    widgetTarget.props.buildConfigurationList.props.buildConfigurations;
  if (
    configurations.some(
      (configuration) =>
        configuration.props.buildSettings.CURRENT_PROJECT_VERSION !==
        buildNumber,
    )
  ) {
    throw new Error(`Could not update every ${WIDGET_TARGET_NAME} configuration`);
  }

  await writeFile(projectPath, build(project.toJSON()));
  console.log(`Set ${WIDGET_TARGET_NAME} build number to ${buildNumber}`);
}

void main();
