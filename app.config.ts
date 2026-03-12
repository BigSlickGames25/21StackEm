import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "21 Stack'em",
  slug: "21-stackem",
  scheme: "twentyonestackem",
  version: "1.0.0",
  orientation: "default",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  jsEngine: "hermes",
  splash: {
    backgroundColor: "#050505",
    image: "./assets/images/21StackemIcon.png",
    resizeMode: "contain"
  },
  ios: {
    supportsTablet: true,
    requireFullScreen: true,
    bundleIdentifier: "com.bigslickgames.twentyonestackem"
  },
  android: {
    package: "com.bigslickgames.twentyonestackem",
    adaptiveIcon: {
      foregroundImage: "./assets/images/21StackemIcon.png",
      backgroundColor: "#050505"
    }
  },
  web: {
    bundler: "metro",
    output: "static"
  },
  plugins: [
    "expo-router",
    [
      "expo-screen-orientation",
      {
        initialOrientation: "DEFAULT"
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    ...(config.extra ?? {}),
    router: {
      ...((config.extra as { router?: Record<string, unknown> } | undefined)
        ?.router ?? {}),
      root: "app"
    }
  }
});
