import { Href, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "../components/layout/ScreenContainer";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { fireHaptic } from "../services/haptics";
import { useGameSettings } from "../store/game-settings";
import { theme } from "../theme";

export function HowToPlayScreen() {
  const device = useDeviceProfile();
  const { settings } = useGameSettings();
  const isWide = device.isLandscape || device.width >= 860;

  function openTutorial() {
    void fireHaptic(settings.haptics, "confirm");
    router.push({ pathname: "/play", params: { tutorial: "1" } } as Href);
  }

  function openTable() {
    void fireHaptic(settings.haptics, "tap");
    router.push("/game" as Href);
  }

  return (
    <ScreenContainer
      scroll
      contentContainerStyle={[styles.content, isWide && styles.contentWide]}
    >
      <LinearGradient
        colors={["#123127", "#090d0c", "#3b1a11"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.hero, isWide && styles.heroWide]}
      >
        <View style={styles.heroGlowCool} />
        <View style={styles.heroGlowWarm} />
        <Text style={styles.heroKicker}>How To Play</Text>
        <Text style={styles.heroTitle}>Read the queue. Protect the bankroll. Lock green 21s.</Text>
        <Text style={styles.heroBody}>
          Every placement updates one row and one column at the same time. Standard tiles fill
          empty spaces, special tiles bend the board, and your bankroll is your live score.
        </Text>
        <View style={styles.heroActions}>
          <Pressable
            onPress={openTutorial}
            style={({ pressed }) => [
              styles.heroAction,
              styles.heroActionPrimary,
              pressed && styles.heroActionPressed
            ]}
          >
            <Text style={styles.heroActionPrimaryText}>Launch Guided Tutorial</Text>
          </Pressable>
          <Pressable
            onPress={openTable}
            style={({ pressed }) => [
              styles.heroAction,
              styles.heroActionSecondary,
              pressed && styles.heroActionPressed
            ]}
          >
            <Text style={styles.heroActionSecondaryText}>Open Table</Text>
          </Pressable>
        </View>
        <Text style={styles.heroHint}>
          The splash screen ? button launches the same guided tutorial before a run.
        </Text>
      </LinearGradient>

      <View style={[styles.specialGrid, isWide && styles.specialGridWide]}>
        <ActionCard
          body="Call any value from A to 10 after choosing an empty board square."
          glyph="W"
          title="Wild Tile"
          wide={isWide}
        />
        <ActionCard
          body="Target an occupied square, then swap in any value you choose."
          glyph="S"
          title="Swap Tile"
          wide={isWide}
        />
        <ActionCard
          body="Rewind the last move. You only get three undo uses per run."
          glyph={"\u21B6"}
          title="Undo"
          wide={isWide}
        />
      </View>

      <RuleCard
        body="You always hold a queue of three tiles. Only the front tile is active, and when you play it the next tiles slide forward."
        title="Queue Flow"
        wide={isWide}
      />
      <RuleCard
        body="Rows and columns score like blackjack hands. Aces count as 11 unless that line would bust, then they count as 1. Face cards count as 10."
        title="Card Values"
        wide={isWide}
      />
      <RuleCard
        body="A line that lands on 21 pays 25 percent of your ante, flashes bright green, and locks for the rest of the run. Locked green lines never turn red."
        title="Scoring 21"
        wide={isWide}
      />
      <RuleCard
        body="If the row or column you changed goes over 21, that line busts, costs 10 percent of your ante, and flashes red across the board."
        title="Busts"
        wide={isWide}
      />
      <RuleCard
        body="Every tile placement costs 1 percent of the ante. Your bankroll starts at the ante, changes after every move, and is also your live score."
        title="Economy"
        wide={isWide}
      />
      <RuleCard
        body="Use the guided tutorial from the button above or from the splash screen before a run. It spotlights the start control, queue, board target, special tiles, and the undo limit."
        title="Guided Tutorial"
        wide={isWide}
      />
    </ScreenContainer>
  );
}

function ActionCard({
  body,
  glyph,
  title,
  wide
}: {
  body: string;
  glyph: string;
  title: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.actionCard, wide && styles.actionCardWide]}>
      <View style={styles.actionGlyphShell}>
        <Text style={styles.actionGlyph}>{glyph}</Text>
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionBody}>{body}</Text>
    </View>
  );
}

function RuleCard({
  body,
  title,
  wide
}: {
  body: string;
  title: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.card, wide && styles.cardWide]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBody: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center"
  },
  actionCard: {
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: theme.spacing.sm,
    minWidth: 0,
    padding: theme.spacing.lg,
    width: "100%"
  },
  actionCardWide: {
    width: "31.5%"
  },
  actionGlyph: {
    color: "#0a0a0a",
    fontFamily: theme.fonts.display,
    fontSize: 26,
    lineHeight: 26
  },
  actionGlyphShell: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    height: 54,
    justifyContent: "center",
    width: 54
  },
  actionTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18
  },
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    width: "100%"
  },
  cardBody: {
    color: theme.colors.subtleText,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  cardTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 20
  },
  cardWide: {
    minWidth: "48%",
    width: "48%"
  },
  content: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.lg,
    marginHorizontal: "auto",
    maxWidth: 1180,
    paddingBottom: theme.spacing.xxxl + 96,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl
  },
  contentWide: {
    alignItems: "flex-start"
  },
  hero: {
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: theme.spacing.md,
    overflow: "hidden",
    padding: theme.spacing.xl,
    position: "relative",
    width: "100%"
  },
  heroAction: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 168,
    paddingHorizontal: theme.spacing.lg
  },
  heroActionPressed: {
    opacity: 0.88
  },
  heroActionPrimary: {
    backgroundColor: theme.colors.surface
  },
  heroActionPrimaryText: {
    color: "#050505",
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14
  },
  heroActionSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: 1
  },
  heroActionSecondaryText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  heroBody: {
    color: "rgba(241, 245, 233, 0.86)",
    fontFamily: theme.fonts.body,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 620
  },
  heroGlowCool: {
    backgroundColor: "rgba(86, 255, 173, 0.18)",
    borderRadius: 999,
    bottom: -70,
    height: 180,
    left: -34,
    position: "absolute",
    width: 180
  },
  heroGlowWarm: {
    backgroundColor: "rgba(255, 120, 72, 0.2)",
    borderRadius: 999,
    height: 180,
    position: "absolute",
    right: -44,
    top: -70,
    width: 180
  },
  heroHint: {
    color: "rgba(241, 245, 233, 0.72)",
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 18
  },
  heroKicker: {
    color: "#8ef0bc",
    fontFamily: theme.fonts.label,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: "#f4f9ec",
    fontFamily: theme.fonts.display,
    fontSize: 34,
    lineHeight: 36,
    maxWidth: 720
  },
  heroWide: {
    minHeight: 260
  },
  specialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.lg,
    width: "100%"
  },
  specialGridWide: {
    justifyContent: "space-between"
  }
});
