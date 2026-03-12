import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const RAY_COUNT = 8;
const SPARK_COUNT = 14;
const CELEBRATE_ANCHORS = [
  { left: "16%", top: "22%" },
  { left: "34%", top: "30%" },
  { left: "52%", top: "18%" },
  { left: "68%", top: "34%" },
  { left: "82%", top: "22%" }
] as const;
const WARNING_ANCHORS = [
  { left: "20%", top: "24%" },
  { left: "46%", top: "20%" },
  { left: "72%", top: "28%" },
  { left: "50%", top: "54%" }
] as const;
const CELEBRATE_PALETTE = ["#7dffb2", "#8fdcff", "#ffcb6f", "#ff8ff1", "#ffffff"];
const WARNING_PALETTE = ["#ff4343", "#ff6b6b", "#ff8f8f", "#ffb36b"];

export function GameEffectsLayer({
  kind,
  nonce
}: {
  kind: "celebrate" | "warning" | null;
  nonce: number;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const sparks = useMemo(
    () =>
      Array.from({ length: SPARK_COUNT }, (_, index) => {
        const angle = (Math.PI * 2 * index) / SPARK_COUNT;
        return {
          angle,
          distance: index % 3 === 0 ? 172 : index % 2 === 0 ? 132 : 96,
          size: index % 3 === 0 ? 14 : 10
        };
      }),
    []
  );
  const rays = useMemo(
    () =>
      Array.from({ length: RAY_COUNT }, (_, index) => ({
        angle: `${(360 / RAY_COUNT) * index}deg`,
        length: index % 2 === 0 ? 220 : 180
      })),
    []
  );

  useEffect(() => {
    if (!kind) {
      pulse.stopAnimation();
      burst.stopAnimation();
      sweep.stopAnimation();
      pulse.setValue(0);
      burst.setValue(0);
      sweep.setValue(0);
      return;
    }

    pulse.setValue(0);
    burst.setValue(0);
    sweep.setValue(0);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(pulse, {
          duration: kind === "celebrate" ? 840 : 460,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          duration: kind === "celebrate" ? 300 : 220,
          easing: Easing.in(Easing.quad),
          toValue: 0,
          useNativeDriver: true
        })
      ]),
      Animated.timing(burst, {
        duration: kind === "celebrate" ? 940 : 540,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      }),
      Animated.timing(sweep, {
        duration: kind === "celebrate" ? 700 : 420,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true
      })
    ]).start();
  }, [burst, kind, nonce, pulse, sweep]);

  if (!kind) {
    return null;
  }

  const anchors = kind === "celebrate" ? CELEBRATE_ANCHORS : WARNING_ANCHORS;
  const palette = kind === "celebrate" ? CELEBRATE_PALETTE : WARNING_PALETTE;
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [0, 0.58, 0]
  });
  const glowOpacity = pulse.interpolate({
    inputRange: [0, 0.26, 1],
    outputRange: [0, kind === "celebrate" ? 0.28 : 0.34, 0]
  });
  const sparkOpacity = burst.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [0, 0.96, 0]
  });
  const rayOpacity = sweep.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 0.42, 0]
  });

  return (
    <View pointerEvents="none" style={styles.layer}>
      {anchors.map((anchor, clusterIndex) => {
        const toneColor = palette[clusterIndex % palette.length];

        return (
          <View
            key={`${kind}-${clusterIndex}`}
            style={[styles.cluster, { left: anchor.left, top: anchor.top }]}
          >
            <Animated.View
              style={[
                styles.glow,
                {
                  backgroundColor: toneColor,
                  opacity: glowOpacity
                }
              ]}
            />
            <Animated.View
              style={[
                styles.ring,
                {
                  borderColor: toneColor,
                  opacity: ringOpacity,
                  transform: [
                    {
                      scale: pulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.66, 1.42]
                      })
                    }
                  ]
                }
              ]}
            />
            {rays.map((ray, rayIndex) => (
              <Animated.View
                key={`ray-${clusterIndex}-${rayIndex}`}
                style={[
                  styles.ray,
                  {
                    backgroundColor: toneColor,
                    height: ray.length,
                    opacity: rayOpacity,
                    transform: [
                      { rotate: ray.angle },
                      {
                        scaleY: sweep.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.22, 1]
                        })
                      }
                    ]
                  }
                ]}
              />
            ))}
            {sparks.map((spark, sparkIndex) => (
              <Animated.View
                key={`spark-${clusterIndex}-${sparkIndex}`}
                style={[
                  styles.spark,
                  {
                    backgroundColor: toneColor,
                    height: spark.size,
                    opacity: sparkOpacity,
                    width: spark.size,
                    transform: [
                      {
                        translateX: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.cos(spark.angle) * spark.distance]
                        })
                      },
                      {
                        translateY: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.sin(spark.angle) * spark.distance]
                        })
                      },
                      {
                        scale: burst.interpolate({
                          inputRange: [0, 0.7, 1],
                          outputRange: [0.2, 1, 0.72]
                        })
                      }
                    ]
                  }
                ]}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    height: 0,
    position: "absolute",
    width: 0
  },
  glow: {
    borderRadius: 999,
    height: 240,
    left: -120,
    position: "absolute",
    top: -120,
    width: 240
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  ray: {
    borderRadius: 999,
    left: -1,
    position: "absolute",
    top: -110,
    width: 2
  },
  ring: {
    borderRadius: 999,
    borderWidth: 3,
    height: 170,
    left: -85,
    position: "absolute",
    top: -85,
    width: 170
  },
  spark: {
    borderRadius: 999,
    left: -6,
    position: "absolute",
    top: -6
  }
});
