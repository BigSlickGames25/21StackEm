import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LeadSplash } from "../components/branding/LeadSplash";
import { STACKEM_LEAD_SPLASH_DURATION_MS } from "../components/branding/stackem-branding";
import {
  GameSettingsProvider,
  useGameSettings
} from "../store/game-settings";
import { HubSessionProvider, useHubSession } from "../platform/auth/session";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <GameSettingsProvider>
          <HubSessionProvider>
            <BootstrapGate>{children}</BootstrapGate>
          </HubSessionProvider>
        </GameSettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function BootstrapGate({ children }: { children: React.ReactNode }) {
  const { isReady } = useGameSettings();
  const { isReady: isHubReady } = useHubSession();
  const [leadComplete, setLeadComplete] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLeadComplete(true);
    }, STACKEM_LEAD_SPLASH_DURATION_MS);

    return () => clearTimeout(timeout);
  }, []);

  if (!leadComplete || !isReady || !isHubReady) {
    return <LeadSplash />;
  }

  if (isReady && isHubReady) {
    return <>{children}</>;
  }

  return <View style={styles.loadingScreen} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: "#000000"
  }
});
