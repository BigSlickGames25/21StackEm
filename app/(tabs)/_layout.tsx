import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDeviceProfile } from "../../src/hooks/useDeviceProfile";
import { openBigSlickGamesWebsite } from "../../src/platform/lib/external-links";
import { fireHaptic } from "../../src/services/haptics";
import { useGameSettings } from "../../src/store/game-settings";
import { theme } from "../../src/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const device = useDeviceProfile();
  const { settings } = useGameSettings();
  const isCompact = device.width < 390;
  const dockBottom = Math.max(insets.bottom, 8);
  const tabBarBottomPadding = Math.max(insets.bottom, 6);
  const tabBarHeight = (isCompact ? 40 : 44) + tabBarBottomPadding;
  const dockWidth = Math.min(device.width - (isCompact ? 16 : 24), isCompact ? 320 : 380);
  const dockLeft = Math.max(8, Math.round((device.width - dockWidth) / 2));

  function renderIcon(
    color: string,
    focused: boolean,
    inactiveName: keyof typeof MaterialCommunityIcons.glyphMap,
    activeName: keyof typeof MaterialCommunityIcons.glyphMap
  ) {
    return (
      <View style={[styles.iconShell, focused && styles.iconShellFocused]}>
        <MaterialCommunityIcons
          color={focused ? theme.colors.background : color}
          name={focused ? activeName : inactiveName}
          size={focused ? 20 : 18}
        />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: theme.colors.background
        },
        tabBarActiveTintColor: theme.colors.surface,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: theme.colors.subtleText,
        tabBarAllowFontScaling: false,
        tabBarShowLabel: false,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarItemStyle: styles.tabBarItem,
        tabBarStyle: [
          styles.tabBar,
          {
            bottom: dockBottom,
            height: tabBarHeight,
            left: dockLeft,
            paddingBottom: tabBarBottomPadding,
            paddingTop: 6,
            width: dockWidth
          }
        ]
      }}
    >
      <Tabs.Screen
        listeners={{
          tabPress: () => {
            void fireHaptic(settings.haptics, "tap");
          }
        }}
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) =>
            renderIcon(color, focused, "view-grid-outline", "view-grid")
        }}
      />
      <Tabs.Screen
        listeners={{
          tabPress: () => {
            void fireHaptic(settings.haptics, "tap");
          }
        }}
        name="play"
        options={{
          title: "Play",
          tabBarIcon: ({ color, focused }) =>
            renderIcon(
              color,
              focused,
              "cards-playing-outline",
              "cards-playing"
            )
        }}
      />
      <Tabs.Screen
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            void fireHaptic(settings.haptics, "tap");
            void openBigSlickGamesWebsite();
          }
        }}
        name="leaderboard"
        options={{
          title: "Big Slick Games",
          tabBarIcon: ({ color, focused }) =>
            renderIcon(color, focused, "web", "web")
        }}
      />
      <Tabs.Screen
        listeners={{
          tabPress: () => {
            void fireHaptic(settings.haptics, "tap");
          }
        }}
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) =>
            renderIcon(color, focused, "tune", "tune-variant")
        }}
      />
      <Tabs.Screen
        listeners={{
          tabPress: () => {
            void fireHaptic(settings.haptics, "tap");
          }
        }}
        name="hub"
        options={{
          href: null,
          title: "Hub",
          tabBarIcon: ({ color, focused }) =>
            renderIcon(
              color,
              focused,
              "account-network-outline",
              "account-network"
            )
        }}
      />
      <Tabs.Screen
        listeners={{
          tabPress: () => {
            void fireHaptic(settings.haptics, "tap");
          }
        }}
        name="how-to-play"
        options={{
          href: null,
          title: "Guide",
          tabBarIcon: ({ color, focused }) =>
            renderIcon(
              color,
              focused,
              "controller-classic-outline",
              "controller-classic"
            )
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "rgba(10, 10, 10, 0.96)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    elevation: 0,
    paddingHorizontal: 6,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 18
  },
  iconShell: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  iconShellFocused: {
    backgroundColor: theme.colors.surface
  },
  tabBarIcon: {
    marginBottom: 0,
    marginTop: 0
  },
  tabBarItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 0
  }
});
