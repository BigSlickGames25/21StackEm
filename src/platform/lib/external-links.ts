import * as Linking from "expo-linking";

import { runtimeConfig } from "../../config/runtime";

export function hasBigSlickGamesWebsite() {
  return Boolean(runtimeConfig.bigSlickGamesUrl);
}

export function getBigSlickGamesWebsiteLabel() {
  return runtimeConfig.bigSlickGamesHostLabel;
}

export async function openBigSlickGamesWebsite() {
  if (!runtimeConfig.bigSlickGamesUrl) {
    return false;
  }

  await Linking.openURL(runtimeConfig.bigSlickGamesUrl);
  return true;
}
