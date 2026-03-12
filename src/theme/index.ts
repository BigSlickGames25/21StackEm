import { Platform } from "react-native";

export const theme = {
  colors: {
    background: "#050505",
    backgroundAlt: "#131313",
    card: "rgba(255, 255, 255, 0.055)",
    cardMuted: "rgba(255, 255, 255, 0.085)",
    border: "rgba(255, 255, 255, 0.12)",
    surface: "#f2f2f2",
    surfacePressed: "#cfcfcf",
    accent: "#d6d6d6",
    text: "#f5f5f5",
    subtleText: "#9d9d9d",
    warning: "#ff8f8f",
    joystickBase: "rgba(255, 255, 255, 0.12)",
    joystickKnob: "#f0f0f0",
    player: "#f2f2f2",
    orb: "#b8b8b8",
    hazard: "#7f7f7f"
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 28,
    xxl: 36,
    xxxl: 52
  },
  radius: {
    md: 14,
    lg: 18,
    xl: 24
  },
  fonts: {
    display: Platform.select({
      ios: "AvenirNextCondensed-Heavy",
      android: "sans-serif-condensed",
      default: "System"
    }),
    body: Platform.select({
      ios: "Avenir Next",
      android: "sans-serif",
      default: "System"
    }),
    bodyBold: Platform.select({
      ios: "AvenirNext-DemiBold",
      android: "sans-serif-medium",
      default: "System"
    }),
    label: Platform.select({
      ios: "AvenirNextCondensed-DemiBold",
      android: "sans-serif-medium",
      default: "System"
    })
  }
} as const;

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
