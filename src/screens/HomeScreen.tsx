import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Href, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { startTransition, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "../components/layout/ScreenContainer";
import { STACKEM_HERO_SIZE, STACKEM_ICON } from "../components/branding/stackem-branding";
import { runtimeConfig } from "../config/runtime";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { useHubSession } from "../platform/auth/session";
import { openBigSlickGamesWebsite } from "../platform/lib/external-links";
import { formatChipCount } from "../platform/lib/format";
import { fireHaptic } from "../services/haptics";
import { useGameSettings } from "../store/game-settings";
import { theme } from "../theme";

type BannerVariant =
  | "play"
  | "profile"
  | "wallet"
  | "leaderboard"
  | "guide"
  | "settings";

interface BannerStat {
  label: string;
  value: string;
}

interface QuickGuideStep {
  detail: string;
  step: string;
}

interface BannerCardConfig {
  actionLabel: string;
  quickGuide?: QuickGuideStep[];
  label: string;
  route: Href;
  stats: BannerStat[];
  tone?: "primary" | "secondary";
  variant: BannerVariant;
}

export function HomeScreen() {
  const device = useDeviceProfile();
  const { settings } = useGameSettings();
  const { currentProduct, profile, status } = useHubSession();
  const [expandedBanner, setExpandedBanner] = useState<string | null>("Play Now");
  const isWide = device.width >= 760;

  function navigate(path: Href, tone: "confirm" | "tap" = "tap") {
    void fireHaptic(settings.haptics, tone);

    startTransition(() => {
      router.navigate(path);
    });
  }

  const playerName =
    profile?.sUserName?.trim() ||
    (status === "authenticated" ? "Player" : status === "guest" ? "Guest" : "Local");
  const walletValue =
    typeof profile?.nChips === "number"
      ? formatChipCount(profile.nChips)
      : status === "guest"
        ? "Guest"
        : "--";
  const sessionLabel =
    status === "authenticated"
      ? "Verified"
      : status === "guest"
        ? "Guest"
        : "Offline";

  const banners: BannerCardConfig[] = [
    {
      actionLabel: "Enter Table",
      label: "Play Now",
      route: "/game",
      stats: [
        { label: "Board", value: "5 x 5" },
        { label: "Queue", value: "3 tiles" },
        { label: "Shoe", value: "156 cards" },
        { label: "Goal", value: "Hit 21" }
      ],
      tone: "primary",
      variant: "play"
    },
    {
      actionLabel: "Open Profile",
      label: "Player Profile",
      route: "/hub",
      stats: [
        { label: "Name", value: playerName },
        { label: "Session", value: sessionLabel },
        { label: "Product", value: currentProduct.title },
        { label: "Side", value: settings.handPreference }
      ],
      variant: "profile"
    },
    {
      actionLabel: "Open Wallet",
      label: "Wallet",
      route: "/wallet",
      stats: [
        { label: "Balance", value: walletValue },
        { label: "Antes", value: "100 / 500 / 1K" },
        { label: "Source", value: "Shared hub" },
        { label: "Mode", value: sessionLabel }
      ],
      variant: "wallet"
    },
    {
      actionLabel: "Open Big Slick Games",
      label: "Big Slick Games",
      route: "/leaderboard",
      stats: [
        { label: "Shell", value: "Website" },
        { label: "Community", value: "Forum" },
        { label: "Hub", value: "Shared wallet" },
        { label: "Target", value: runtimeConfig.bigSlickGamesHostLabel }
      ],
      variant: "leaderboard"
    },
    {
      actionLabel: "Open Guide",
      label: "How To Play",
      quickGuide: [
        { detail: "Pay the ante and draw 3 tiles.", step: "1 Deal" },
        { detail: "Drag the lead tile onto any open square.", step: "2 Place" },
        { detail: "Every drop changes one row and one column total.", step: "3 Count" },
        { detail: "Hit 21 to score. Going over 21 busts that live line.", step: "4 Chase 21" }
      ],
      route: "/how-to-play",
      stats: [
        { label: "Objective", value: "Rows + cols" },
        { label: "Aces", value: "1 or 11" },
        { label: "Bust", value: "> 21" },
        { label: "Focus", value: "Placement" }
      ],
      variant: "guide"
    },
    {
      actionLabel: "Open Settings",
      label: "Settings",
      route: "/settings",
      stats: [
        { label: "Orientation", value: settings.orientation },
        { label: "Haptics", value: settings.haptics },
        { label: "Motion", value: settings.reducedMotion ? "Reduced" : "Full" },
        { label: "Wake", value: settings.keepAwake ? "On" : "Off" }
      ],
      variant: "settings"
    }
  ];

  return (
    <ScreenContainer scroll contentContainerStyle={styles.content}>
      <View style={styles.heroStage}>
        <View style={styles.heroGlowA} />
        <View style={styles.heroGlowB} />
        <Image resizeMode="contain" source={STACKEM_ICON} style={styles.heroIcon} />
      </View>

      <View style={styles.bannerGrid}>
        {banners.map((banner) => {
          const expanded = expandedBanner === banner.label;

          return (
            <View
              key={banner.label}
              style={[
                styles.bannerCard,
                isWide && styles.bannerCardWide,
                banner.tone === "primary" && styles.bannerCardPrimary,
                expanded && styles.bannerCardExpanded
              ]}
            >
              <View style={styles.bannerCardGlow} />
              <Pressable
                onPress={() => {
                  void fireHaptic(settings.haptics, "tap");
                  setExpandedBanner((current) =>
                    current === banner.label ? null : banner.label
                  );
                }}
                style={({ pressed }) => [
                  styles.bannerHeaderShell,
                  pressed && styles.bannerHeaderPressed
                ]}
              >
                <LinearGradient
                  colors={getBannerGradient(banner.variant, banner.tone)}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={styles.bannerHeader}
                >
                  <BannerArtwork variant={banner.variant} />
                  <Text numberOfLines={1} style={styles.bannerLabel}>
                    {banner.label}
                  </Text>
                  <View style={[styles.twisty, expanded && styles.twistyExpanded]}>
                    <MaterialCommunityIcons
                      color="#f5f5f5"
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={18}
                    />
                  </View>
                </LinearGradient>
              </Pressable>

              {expanded ? (
                <View style={styles.bannerBody}>
                  {banner.quickGuide?.length ? (
                    <View style={styles.quickGuideBlock}>
                      <Text style={styles.quickGuideTitle}>Quick Guide</Text>
                      <View style={styles.quickGuideList}>
                        {banner.quickGuide.map((item) => (
                          <View
                            key={`${banner.label}-${item.step}`}
                            style={styles.quickGuideRow}
                          >
                            <Text style={styles.quickGuideStep}>{item.step}</Text>
                            <Text style={styles.quickGuideDetail}>{item.detail}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.statsGrid}>
                    {banner.stats.map((stat) => (
                      <View key={`${banner.label}-${stat.label}`} style={styles.statTile}>
                        <Text style={styles.statLabel}>{stat.label}</Text>
                        <Text numberOfLines={1} style={styles.statValue}>
                          {stat.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => {
                      if (banner.route === "/leaderboard") {
                        void fireHaptic(settings.haptics, "tap");
                        void openBigSlickGamesWebsite();
                        return;
                      }

                      navigate(
                        banner.route,
                        banner.tone === "primary" ? "confirm" : "tap"
                      );
                    }}
                    style={({ pressed }) => [
                      styles.bannerAction,
                      banner.tone === "primary" && styles.bannerActionPrimary,
                      pressed && styles.bannerActionPressed
                    ]}
                  >
                    <Text
                      style={[
                        styles.bannerActionLabel,
                        banner.tone === "primary" && styles.bannerActionLabelPrimary
                      ]}
                    >
                      {banner.actionLabel}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

function BannerArtwork({ variant }: { variant: BannerVariant }) {
  switch (variant) {
    case "play":
      return (
        <>
          <View style={[styles.artCircle, styles.artPlayCircle]} />
          <View style={[styles.artBand, styles.artPlayBand]} />
          <View style={[styles.artBandThin, styles.artPlayBandThin]} />
        </>
      );
    case "profile":
      return (
        <>
          <View style={[styles.artBlock, styles.artProfileBlockA]} />
          <View style={[styles.artBlock, styles.artProfileBlockB]} />
          <View style={[styles.artCircle, styles.artProfileCircle]} />
        </>
      );
    case "wallet":
      return (
        <>
          <View style={[styles.artBand, styles.artWalletBand]} />
          <View style={[styles.artBandThin, styles.artWalletBandThin]} />
          <View style={[styles.artCircle, styles.artWalletCircle]} />
        </>
      );
    case "leaderboard":
      return (
        <>
          <View style={[styles.artRing, styles.artLeaderboardRing]} />
          <View style={[styles.artBandThin, styles.artLeaderboardBand]} />
          <View style={[styles.artBandThin, styles.artLeaderboardBandTwo]} />
        </>
      );
    case "guide":
      return (
        <>
          <View style={[styles.artGrid, styles.artGuideGrid]} />
          <View style={[styles.artBandThin, styles.artGuideSlash]} />
          <View style={[styles.artCircle, styles.artGuideCircle]} />
        </>
      );
    case "settings":
      return (
        <>
          <View style={[styles.artBand, styles.artSettingsBand]} />
          <View style={[styles.artCircle, styles.artSettingsCircle]} />
          <View style={[styles.artBandThin, styles.artSettingsBandTwo]} />
        </>
      );
  }
}

function getBannerGradient(
  variant: BannerVariant,
  tone?: "primary" | "secondary"
): [string, string, string] {
  if (tone === "primary") {
    return ["#efefef", "#9a9a9a", "#111111"];
  }

  switch (variant) {
    case "profile":
      return ["#b5b5b5", "#5a5a5a", "#121212"];
    case "wallet":
      return ["#cecece", "#676767", "#141414"];
    case "leaderboard":
      return ["#c8c8c8", "#5f5f5f", "#111111"];
    case "guide":
      return ["#bbbbbb", "#595959", "#121212"];
    case "settings":
      return ["#d6d6d6", "#6b6b6b", "#121212"];
    case "play":
      return ["#efefef", "#9a9a9a", "#111111"];
  }
}

const styles = StyleSheet.create({
  artBand: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    position: "absolute"
  },
  artBandThin: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    position: "absolute"
  },
  artBlock: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 18,
    position: "absolute"
  },
  artCircle: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    position: "absolute"
  },
  artGrid: {
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    position: "absolute"
  },
  artGuideCircle: {
    height: 120,
    left: 44,
    top: -14,
    width: 120
  },
  artGuideGrid: {
    height: 84,
    left: 22,
    top: 2,
    width: 156
  },
  artGuideSlash: {
    height: 150,
    right: 84,
    top: -36,
    transform: [{ rotate: "-38deg" }],
    width: 3
  },
  artLeaderboardBand: {
    height: 3,
    left: 70,
    top: 28,
    width: 144
  },
  artLeaderboardBandTwo: {
    height: 3,
    left: 82,
    top: 48,
    width: 116
  },
  artLeaderboardRing: {
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    borderWidth: 2,
    height: 122,
    left: 28,
    position: "absolute",
    top: -18,
    width: 122
  },
  artPlayBand: {
    height: 104,
    left: 108,
    top: -8,
    transform: [{ rotate: "28deg" }],
    width: 42
  },
  artPlayBandThin: {
    height: 112,
    left: 164,
    top: -12,
    transform: [{ rotate: "28deg" }],
    width: 16
  },
  artPlayCircle: {
    height: 132,
    left: 24,
    top: -26,
    width: 132
  },
  artProfileBlockA: {
    height: 120,
    left: 34,
    top: -18,
    width: 62
  },
  artProfileBlockB: {
    height: 120,
    left: 108,
    top: -18,
    width: 120
  },
  artProfileCircle: {
    height: 144,
    left: 84,
    top: -30,
    width: 144
  },
  artRing: {
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    borderWidth: 2,
    position: "absolute"
  },
  artSettingsBand: {
    height: 160,
    right: 82,
    top: -44,
    transform: [{ rotate: "-28deg" }],
    width: 34
  },
  artSettingsBandTwo: {
    height: 136,
    right: 34,
    top: -28,
    transform: [{ rotate: "-28deg" }],
    width: 12
  },
  artSettingsCircle: {
    height: 118,
    right: 124,
    top: -16,
    width: 118
  },
  artWalletBand: {
    height: 124,
    left: 92,
    top: -20,
    transform: [{ rotate: "34deg" }],
    width: 46
  },
  artWalletBandThin: {
    height: 132,
    left: 144,
    top: -22,
    transform: [{ rotate: "34deg" }],
    width: 14
  },
  artWalletCircle: {
    height: 110,
    left: 28,
    top: -8,
    width: 110
  },
  bannerAction: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(104, 104, 104, 0.28)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: theme.spacing.md
  },
  bannerActionLabel: {
    color: theme.colors.text,
    fontFamily: theme.fonts.label,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  bannerActionLabelPrimary: {
    color: "#050505"
  },
  bannerActionPressed: {
    opacity: 0.84
  },
  bannerActionPrimary: {
    backgroundColor: "rgba(228, 228, 228, 0.92)"
  },
  bannerBody: {
    backgroundColor: "rgba(86, 86, 86, 0.16)",
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    borderTopWidth: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingTop: 4
  },
  bannerCard: {
    backgroundColor: "rgba(52, 52, 52, 0.74)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 28,
    borderWidth: 1,
    flexGrow: 1,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  bannerCardExpanded: {
    minHeight: 300
  },
  bannerCardGlow: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 180,
    bottom: -90,
    height: 180,
    position: "absolute",
    right: -80,
    width: 180
  },
  bannerCardPrimary: {
    backgroundColor: "rgba(64, 64, 64, 0.78)"
  },
  bannerCardWide: {
    flexBasis: "48.8%",
    maxWidth: "48.8%"
  },
  bannerGrid: {
    columnGap: theme.spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: theme.spacing.md,
    width: "100%"
  },
  bannerHeader: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 84,
    overflow: "hidden",
    paddingHorizontal: theme.spacing.md,
    position: "relative"
  },
  bannerHeaderPressed: {
    opacity: 0.92
  },
  bannerHeaderShell: {
    padding: 14
  },
  bannerLabel: {
    color: "#050505",
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: 25,
    lineHeight: 34,
    zIndex: 2
  },
  content: {
    alignItems: "center",
    alignSelf: "center",
    flexGrow: 1,
    gap: theme.spacing.lg,
    maxWidth: 1080,
    paddingBottom: 74,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    width: "100%"
  },
  heroGlowA: {
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderRadius: 180,
    height: 180,
    left: -42,
    position: "absolute",
    top: 6,
    width: 180
  },
  heroGlowB: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 240,
    bottom: -30,
    height: 240,
    position: "absolute",
    right: -74,
    width: 240
  },
  heroIcon: {
    height: STACKEM_HERO_SIZE.height,
    maxWidth: "100%",
    width: STACKEM_HERO_SIZE.width
  },
  heroStage: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 248,
    overflow: "visible",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    position: "relative",
    width: "100%"
  },
  quickGuideBlock: {
    gap: theme.spacing.xs
  },
  quickGuideDetail: {
    color: theme.colors.text,
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 18
  },
  quickGuideList: {
    gap: theme.spacing.xs
  },
  quickGuideRow: {
    alignItems: "center",
    backgroundColor: "rgba(112, 112, 112, 0.16)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: theme.spacing.sm,
    minHeight: 52,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8
  },
  quickGuideStep: {
    color: theme.colors.text,
    fontFamily: theme.fonts.label,
    fontSize: 11,
    letterSpacing: 1,
    minWidth: 72,
    textTransform: "uppercase"
  },
  quickGuideTitle: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  statLabel: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  statTile: {
    backgroundColor: "rgba(112, 112, 112, 0.22)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "48.8%",
    flexGrow: 1,
    maxWidth: "48.8%",
    minHeight: 86,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm
  },
  statValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    lineHeight: 24
  },
  statsGrid: {
    columnGap: theme.spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: theme.spacing.sm
  },
  twisty: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 5, 0.92)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
    zIndex: 2
  },
  twistyExpanded: {
    backgroundColor: "#050505"
  }
});
