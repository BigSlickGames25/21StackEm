import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { theme } from "../../theme";

export function AppBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[
          theme.colors.background,
          theme.colors.backgroundAlt,
          theme.colors.background
        ]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.gridVeil} />
      <View style={styles.glowA} />
      <View style={styles.glowB} />
    </View>
  );
}

const styles = StyleSheet.create({
  glowA: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 260,
    height: 260,
    left: -70,
    position: "absolute",
    top: 56,
    width: 260
  },
  glowB: {
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderRadius: 320,
    bottom: -20,
    height: 320,
    position: "absolute",
    right: -120,
    width: 320
  },
  gridVeil: {
    borderColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    inset: 18,
    position: "absolute"
  }
});
