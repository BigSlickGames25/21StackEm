import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle
} from "react-native";

import { theme } from "../../theme";

export function GameButton({
  compact = false,
  disabled = false,
  label,
  labelStyle,
  onPress,
  style,
  subtitle,
  subtitleStyle,
  tone = "secondary"
}: {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  subtitleStyle?: StyleProp<TextStyle>;
  tone?: "primary" | "secondary";
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        tone === "primary" ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        style,
        pressed &&
          !disabled &&
          (tone === "primary" ? styles.primaryPressed : styles.secondaryPressed)
      ]}
    >
      <View style={styles.copy}>
        <Text
          style={[
            styles.label,
            compact && styles.labelCompact,
            tone === "primary" && styles.labelPrimary,
            labelStyle
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.subtitle,
              compact && styles.subtitleCompact,
              tone === "primary" && styles.subtitlePrimary,
              subtitleStyle
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.radius.lg,
    minHeight: 82,
    overflow: "hidden",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md
  },
  buttonCompact: {
    minHeight: 64,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm
  },
  primary: {
    backgroundColor: theme.colors.surface
  },
  primaryPressed: {
    backgroundColor: theme.colors.surfacePressed
  },
  secondary: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1
  },
  secondaryPressed: {
    backgroundColor: theme.colors.cardMuted
  },
  disabled: {
    opacity: 0.5
  },
  copy: {
    gap: 6
  },
  label: {
    color: theme.colors.text,
    flexShrink: 1,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18
  },
  labelPrimary: {
    color: "#050505"
  },
  labelCompact: {
    fontSize: 16
  },
  subtitle: {
    color: theme.colors.subtleText,
    flexShrink: 1,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  subtitlePrimary: {
    color: "rgba(5, 5, 5, 0.72)"
  },
  subtitleCompact: {
    fontSize: 12,
    lineHeight: 17
  }
});
