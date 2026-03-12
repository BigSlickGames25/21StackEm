import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Href, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GameButton } from "../components/ui/GameButton";
import { ScreenContainer } from "../components/layout/ScreenContainer";
import { runtimeConfig } from "../config/runtime";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { useHubSession } from "../platform/auth/session";
import {
  getBigSlickGamesWebsiteLabel,
  hasBigSlickGamesWebsite,
  openBigSlickGamesWebsite
} from "../platform/lib/external-links";
import { formatChipCount } from "../platform/lib/format";
import { fireHaptic } from "../services/haptics";
import { useGameSettings } from "../store/game-settings";
import { theme } from "../theme";

type HubSection = "profile" | "games" | "community" | "platform";

type HubStat = {
  label: string;
  value: string;
};

type HubSectionConfig = {
  actionLabel: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  key: HubSection;
  stats: HubStat[];
  subtitle: string;
  title: string;
};

export function LeaderboardScreen() {
  const device = useDeviceProfile();
  const { settings } = useGameSettings();
  const { currentProduct, profile, status } = useHubSession();
  const [expandedSection, setExpandedSection] = useState<HubSection | null>("profile");
  const isWide = device.width >= 860;
  const websiteReady = hasBigSlickGamesWebsite();
  const playerName =
    profile?.sUserName?.trim() ||
    (status === "authenticated" ? "Player" : status === "guest" ? "Guest" : "Local");
  const walletValue =
    typeof profile?.nChips === "number"
      ? formatChipCount(profile.nChips)
      : status === "guest"
        ? "Guest"
        : "--";
  const sessionValue =
    status === "authenticated"
      ? "Verified"
      : status === "guest"
        ? "Guest"
        : "Offline";

  const sections: HubSectionConfig[] = [
    {
      actionLabel: websiteReady ? "Big Slick Games" : "Hub Console",
      icon: "account-badge-outline",
      key: "profile",
      stats: [
        { label: "Player", value: playerName },
        { label: "Session", value: sessionValue },
        { label: "Product", value: currentProduct.title },
        { label: "Wallet", value: walletValue }
      ],
      subtitle: "Shared identity",
      title: "Player Profile"
    },
    {
      actionLabel: websiteReady ? "Big Slick Games" : "Launcher",
      icon: "cards-playing-outline",
      key: "games",
      stats: [
        { label: "Current", value: currentProduct.title },
        { label: "Build", value: "Standalone" },
        { label: "Shell", value: "Website" },
        { label: "Templates", value: "Shared" }
      ],
      subtitle: "Discovery shell",
      title: "Games"
    },
    {
      actionLabel: websiteReady ? "Big Slick Games" : "How To Play",
      icon: "forum-outline",
      key: "community",
      stats: [
        { label: "Forum", value: "Live topics" },
        { label: "Socials", value: "Channels" },
        { label: "Lounge", value: "Chat rail" },
        { label: "Rules", value: "Pinned" }
      ],
      subtitle: "Community layer",
      title: "Forum"
    },
    {
      actionLabel: websiteReady ? "Big Slick Games" : "Settings",
      icon: "web",
      key: "platform",
      stats: [
        { label: "Host", value: getBigSlickGamesWebsiteLabel() },
        { label: "Backend", value: runtimeConfig.apiHostLabel },
        { label: "Wallet", value: "Shared hub" },
        { label: "Prefs", value: "Centralized" }
      ],
      subtitle: "Platform shell",
      title: "Big Slick Games"
    }
  ];

  async function openWebsite() {
    void fireHaptic(settings.haptics, "tap");
    const opened = await openBigSlickGamesWebsite();

    if (!opened) {
      router.push("/hub" as Href);
    }
  }

  function openSectionTarget(section: HubSection) {
    if (websiteReady) {
      void openWebsite();
      return;
    }

    switch (section) {
      case "profile":
      case "platform":
        router.push("/hub" as Href);
        return;
      case "games":
        router.push("/launcher" as Href);
        return;
      case "community":
        router.push("/how-to-play" as Href);
        return;
    }
  }

  return (
    <ScreenContainer scroll contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <LinearGradient
          colors={["rgba(33, 69, 99, 0.74)", "rgba(17, 29, 52, 0.9)", "rgba(7, 10, 18, 0.96)"]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.heroBand}
        >
          <View style={styles.heroBandGlowA} />
          <View style={styles.heroBandGlowB} />
          <Text style={styles.heroKicker}>Big Slick Games</Text>
          <Text style={styles.heroTitle}>Website Frontend</Text>
          <Text style={styles.heroBody}>
            Shared account, wallet, discovery, updates, and community belong in the
            website shell rather than inside each game client.
          </Text>
        </LinearGradient>

        <View style={styles.heroStats}>
          <MetricCard label="Target" value={getBigSlickGamesWebsiteLabel()} />
          <MetricCard label="Session" value={sessionValue} />
          <MetricCard label="Shell" value="Website hub" />
          <MetricCard label="Current" value={currentProduct.title} />
        </View>

        <View style={[styles.heroActions, isWide && styles.heroActionsWide]}>
          <GameButton
            disabled={!websiteReady}
            label="Big Slick Games"
            onPress={() => {
              void openWebsite();
            }}
            subtitle={
              websiteReady
                ? `Open ${getBigSlickGamesWebsiteLabel()} in the browser.`
                : "Set EXPO_PUBLIC_BIG_SLICK_GAMES_URL to enable the website bridge."
            }
            style={styles.heroActionPrimary}
            tone="primary"
          />
          <GameButton
            label="Hub Console"
            onPress={() => {
              void fireHaptic(settings.haptics, "tap");
              router.push("/hub" as Href);
            }}
            subtitle="Keep the local template routes available while the website shell evolves."
            style={styles.heroActionSecondary}
          />
        </View>
      </View>

      <View style={[styles.sectionGrid, isWide && styles.sectionGridWide]}>
        {sections.map((section) => {
          const expanded = expandedSection === section.key;

          return (
            <View key={section.key} style={[styles.sectionCard, isWide && styles.sectionCardWide]}>
              <Pressable
                onPress={() => {
                  void fireHaptic(settings.haptics, "tap");
                  setExpandedSection((current) =>
                    current === section.key ? null : section.key
                  );
                }}
                style={({ pressed }) => [styles.sectionHeaderPressable, pressed && styles.sectionPressed]}
              >
                <LinearGradient
                  colors={getSectionGradient(section.key)}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={styles.sectionHeader}
                >
                  <View style={styles.sectionArtwork}>
                    <MaterialCommunityIcons
                      color="rgba(255, 255, 255, 0.16)"
                      name={section.icon}
                      size={78}
                    />
                  </View>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
                  </View>
                  <View style={styles.twisty}>
                    <MaterialCommunityIcons
                      color="#ffffff"
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={18}
                    />
                  </View>
                </LinearGradient>
              </Pressable>

              {expanded ? (
                <View style={styles.sectionBody}>
                  <View style={styles.metricGrid}>
                    {section.stats.map((stat) => (
                      <MetricTile
                        key={`${section.key}-${stat.label}`}
                        label={stat.label}
                        value={stat.value}
                      />
                    ))}
                  </View>
                  <GameButton
                    compact
                    label={section.actionLabel}
                    onPress={() => {
                      void fireHaptic(settings.haptics, "tap");
                      openSectionTarget(section.key);
                    }}
                    subtitle={
                      websiteReady
                        ? `Bridge to ${getBigSlickGamesWebsiteLabel()}.`
                        : getFallbackSubtitle(section.key)
                    }
                    style={styles.sectionAction}
                    tone="secondary"
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

function MetricCard({ label, value }: HubStat) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

function MetricTile({ label, value }: HubStat) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricTileLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricTileValue}>
        {value}
      </Text>
    </View>
  );
}

function getSectionGradient(section: HubSection): [string, string, string] {
  switch (section) {
    case "profile":
      return ["#3198d8", "#214d87", "#081321"];
    case "games":
      return ["#2dbd7d", "#1d5f8c", "#091421"];
    case "community":
      return ["#7f72ff", "#9c4da7", "#0a1122"];
    case "platform":
      return ["#f4ab33", "#a64b86", "#0a1221"];
  }
}

function getFallbackSubtitle(section: HubSection) {
  switch (section) {
    case "profile":
      return "Website URL not configured yet.";
    case "games":
      return "Open the local launcher while the website URL is being wired.";
    case "community":
      return "Use the local guide until the community shell URL is set.";
    case "platform":
      return "Open the local hub console from this build.";
  }
}

const styles = StyleSheet.create({
  content: {
    alignSelf: "center",
    gap: theme.spacing.lg,
    maxWidth: 1160,
    paddingBottom: theme.spacing.xxxl + 96,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    width: "100%"
  },
  hero: {
    gap: theme.spacing.md
  },
  heroActionPrimary: {
    flex: 1,
    minWidth: 0
  },
  heroActionSecondary: {
    flex: 1,
    minWidth: 0
  },
  heroActions: {
    gap: theme.spacing.sm
  },
  heroActionsWide: {
    flexDirection: "row"
  },
  heroBand: {
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 28,
    borderWidth: 1,
    gap: 8,
    minHeight: 220,
    overflow: "hidden",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    position: "relative"
  },
  heroBandGlowA: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 180,
    height: 180,
    left: -26,
    position: "absolute",
    top: -52,
    width: 180
  },
  heroBandGlowB: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 220,
    bottom: -88,
    height: 220,
    position: "absolute",
    right: -84,
    width: 220
  },
  heroBody: {
    color: "#e3edf7",
    fontFamily: theme.fonts.body,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 620
  },
  heroKicker: {
    color: "#f3f6fb",
    fontFamily: theme.fonts.label,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase"
  },
  heroStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  heroTitle: {
    color: "#ffffff",
    fontFamily: theme.fonts.display,
    fontSize: 42,
    lineHeight: 42
  },
  metricCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    gap: 4,
    minWidth: 140,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  metricLabel: {
    color: "rgba(255, 255, 255, 0.68)",
    fontFamily: theme.fonts.label,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  metricTile: {
    backgroundColor: "rgba(8, 14, 22, 0.74)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "48.5%",
    flexGrow: 1,
    gap: 6,
    minHeight: 82,
    minWidth: 0,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm
  },
  metricTileLabel: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  metricTileValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    lineHeight: 24
  },
  metricValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 16
  },
  sectionAction: {
    backgroundColor: "rgba(255, 255, 255, 0.08)"
  },
  sectionArtwork: {
    alignItems: "center",
    height: 84,
    justifyContent: "center",
    left: 18,
    overflow: "hidden",
    position: "absolute",
    top: -4,
    width: 120
  },
  sectionBody: {
    backgroundColor: "rgba(17, 26, 38, 0.76)",
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    borderTopWidth: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.sm
  },
  sectionCard: {
    backgroundColor: "rgba(12, 16, 24, 0.9)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%"
  },
  sectionCardWide: {
    flexBasis: "48.8%",
    maxWidth: "48.8%"
  },
  sectionCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingLeft: 92
  },
  sectionGrid: {
    gap: theme.spacing.md
  },
  sectionGridWide: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  sectionHeader: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 100,
    overflow: "hidden",
    paddingHorizontal: theme.spacing.md,
    position: "relative"
  },
  sectionHeaderPressable: {
    padding: 14
  },
  sectionPressed: {
    opacity: 0.92
  },
  sectionSubtitle: {
    color: "rgba(255, 255, 255, 0.82)",
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 18
  },
  sectionTitle: {
    color: "#ffffff",
    fontFamily: theme.fonts.display,
    fontSize: 27,
    lineHeight: 36
  },
  twisty: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 5, 0.92)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32
  }
});
