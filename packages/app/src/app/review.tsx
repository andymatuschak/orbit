import React from "react";
import { ScrollView, Text, View } from "react-native";
import serviceConfig from "../../serviceConfig.js";
import { Button, Spacer, TextInput, styles } from "../ui/index.js";
import ReviewSession from "../reviewSession/ReviewSession.js";
import { LoadingScreen } from "../reviewSession/LoadingScreen.js";
import { LabHTTPClient } from "../sync/HostedVaultClient.js";
import { labConnectionManager } from "../vault/labConnectionStorage.js";
import type { LabConnection } from "../vault/labConnection.js";

export default function ReviewPage() {
  const [connection, setConnection] = React.useState<
    LabConnection | null | undefined
  >();
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    void labConnectionManager.load().then(
      (value) => {
        if (active) setConnection(value);
      },
      () => {
        if (active) {
          setError("Could not read the saved Lab connection. Pair again.");
          setConnection(null);
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);
  if (connection === undefined) return <LoadingScreen />;
  if (connection)
    return (
      <ReviewSession
        connection={connection}
        onPairAgain={() => setConnection(null)}
      />
    );
  return <PairLab initialError={error} onPaired={setConnection} />;
}

function PairLab({
  initialError,
  onPaired,
}: {
  initialError: string | null;
  onPaired(connection: LabConnection): void;
}) {
  const [origin, setOrigin] = React.useState(serviceConfig.labOrigin);
  const [token, setToken] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState(initialError);
  const palette = styles.colors.palettes.red;
  async function pair() {
    setPending(true);
    setError(null);
    try {
      const rootDocumentURL = await new LabHTTPClient(origin).resolveRoot(
        token.trim(),
      );
      const connection = await labConnectionManager.pair({
        serviceOrigin: origin,
        token,
        rootDocumentURL,
      });
      onPaired(connection);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Could not pair with Orbit Lab.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        padding: styles.layout.edgeMargin,
        backgroundColor: palette.backgroundColor,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: "100%", maxWidth: 500, alignSelf: "center" }}>
        <Text style={styles.type.headline.layoutStyle}>Orbit Lab</Text>
        <Spacer units={3} />
        <Text style={styles.type.runningText.layoutStyle}>
          Pair with your private laptop server. This installation never connects
          to public Orbit.
        </Text>
        <Spacer units={3} />
        <TextInput
          accessibilityLabel="Lab server origin"
          placeholder="https://laptop.tailnet.ts.net"
          value={origin}
          onChangeText={setOrigin}
          autoCapitalize="none"
          autoCorrect={false}
          colorPalette={palette}
        />
        <Spacer units={2} />
        <TextInput
          accessibilityLabel="Pairing key"
          placeholder="Pairing key"
          value={token}
          onChangeText={setToken}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          colorPalette={palette}
        />
        <Spacer units={3} />
        {error ? (
          <Text style={styles.type.runningText.layoutStyle}>{error}</Text>
        ) : null}
        <Button
          title={pending ? "Pairing…" : "Pair with Lab"}
          disabled={pending || !origin.trim() || !token.trim()}
          onPress={() => void pair()}
          backgroundColor={palette.secondaryBackgroundColor}
        />
      </View>
    </ScrollView>
  );
}
