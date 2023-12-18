import { Button, IconName, Spacer, styles } from "@withorbit/ui";
import React from "react";
import { InfoPage } from "../infoPage/InfoPage.js";
import { Heading, Paragraph } from "../infoPage/InfoPageShared.js";

const palette = styles.colors.palettes.brown;

function Contents() {
  return (
    <>
      <Heading>Downloads</Heading>
      <Paragraph>
        You can use the Orbit service from your web browser or by downloading
        the desktop Orbit application, currently available for macOS 11+.
      </Paragraph>
      <Spacer units={2} />
      <Button
        color={styles.colors.white}
        accentColor={palette.accentColor}
        href="https://testflight.apple.com/join/Jq6fObeM"
        iconName={IconName.ArrowRight}
        title="Download Orbit for macOS"
      />
    </>
  );
}

export default function DownloadPage() {
  return (
    <InfoPage
      contents={<Contents />}
      palette={palette}
      summaryContents="Orbit helps you deeply internalize ideas through periodic review."
    />
  );
}
