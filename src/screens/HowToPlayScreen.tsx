import { StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "../components/layout/ScreenContainer";
import { useDeviceProfile } from "../hooks/useDeviceProfile";
import { theme } from "../theme";

export function HowToPlayScreen() {
  const device = useDeviceProfile();
  const isWide = device.isLandscape || device.width >= 860;

  return (
    <ScreenContainer
      scroll
      contentContainerStyle={[styles.content, isWide && styles.contentWide]}
    >
      <RuleCard
        body="Place tiles to build row and column totals toward 21. Every time a line lands exactly on 21 you score and trigger a celebration burst."
        title="Objective"
        wide={isWide}
      />
      <RuleCard
        body="The board is a 5 x 5 grid. Every placement updates one row total and one column total at the same time."
        title="Board"
        wide={isWide}
      />
      <RuleCard
        body="You always hold a queue of three tiles. Only the lead tile is active. Standard tiles drag onto empty cells, W tiles let you choose any value from A to 10, and S tiles swap an occupied board tile for a value you choose."
        title="Queue"
        wide={isWide}
      />
      <RuleCard
        body="Number cards score at face value. 10, J, Q, and K all count as 10. Aces count as 11 unless that line would bust, then they count as 1."
        title="Card Values"
        wide={isWide}
      />
      <RuleCard
        body="A row or column that lands exactly on 21 pays 25 percent of your ante immediately, flashes bright green, and locks for the rest of the run."
        title="Scoring 21"
        wide={isWide}
      />
      <RuleCard
        body="If the affected row or column goes over 21 after a placement, that line busts, costs 10 percent of your ante, and flashes red across the board."
        title="Bust"
        wide={isWide}
      />
      <RuleCard
        body="Choose an ante of 100, 500, or 1K. Your bankroll starts at that amount, every tile placement costs 1 percent of the ante, and the run ends when you cannot afford another move or the board seals. Leaderboard scores are saved locally."
        title="Economy"
        wide={isWide}
      />
    </ScreenContainer>
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
  }
});
