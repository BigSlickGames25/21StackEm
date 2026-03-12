import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View
} from "react-native";

import {
  STACKEM_HERO_SIZE,
  STACKEM_ICON,
  STACKEM_LEAD_SPLASH_DURATION_MS
} from "./stackem-branding";

export function LeadSplash() {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseUpDuration = 180;
    const driftDownDuration = 3500;
    const reverseDuration =
      STACKEM_LEAD_SPLASH_DURATION_MS - pulseUpDuration - driftDownDuration;

    Animated.sequence([
      Animated.timing(scale, {
        duration: pulseUpDuration,
        easing: Easing.out(Easing.cubic),
        toValue: 1.14,
        useNativeDriver: true
      }),
      Animated.timing(scale, {
        duration: driftDownDuration,
        easing: Easing.inOut(Easing.cubic),
        toValue: 0.9,
        useNativeDriver: true
      }),
      Animated.timing(scale, {
        duration: reverseDuration,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      })
    ]).start();
  }, [scale]);

  return (
    <View style={styles.root}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image resizeMode="contain" source={STACKEM_ICON} style={styles.image} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    height: STACKEM_HERO_SIZE.height,
    maxWidth: "100%",
    width: STACKEM_HERO_SIZE.width
  },
  root: {
    alignItems: "center",
    backgroundColor: "#000000",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24
  }
});
