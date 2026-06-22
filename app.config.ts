import type { ConfigContext, ExpoConfig } from "expo/config";

const APP_NAME = "Ecofy";
const PRIMARY_COLOR = "#1f6a3a";
const PRIMARY_DARK = "#0f3d24";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: "ecofy",
  owner: "ghostwire619",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "ecofy",
  userInterfaceStyle: "light",
  icon: "./assets/images/icon.png",
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: PRIMARY_DARK,
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "com.ecofy.mobile",
    supportsTablet: false,
    icon: "./assets/expo.icon",
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Ecofy uses your location to place farms on the map and improve weather and agronomy guidance.",
      NSCameraUsageDescription:
        "Ecofy uses the camera so farmers can capture crop conditions and field logs.",
      NSPhotoLibraryUsageDescription:
        "Ecofy uses the photo library so farmers can attach field images to offline logs.",
      UIBackgroundModes: ["fetch", "remote-notification"],
    },
  },
  android: {
    package: "com.ecofy.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
      backgroundColor: "#eff5ee",
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "CAMERA",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
      "POST_NOTIFICATIONS",
      "RECEIVE_BOOT_COMPLETED",
      "VIBRATE",
    ],
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-localization",
    "expo-secure-store",
    "expo-background-task",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Ecofy uses your location to help farmers map plots and download offline field regions.",
      },
    ],
    [
      "expo-notifications",
      {
        color: PRIMARY_COLOR,
        defaultChannel: "field-alerts",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: PRIMARY_DARK,
        image: "./assets/images/splash-icon.png",
        imageWidth: 96,
      },
    ],
    [
      "expo-sqlite",
      {
        enableFTS: true,
        useSQLCipher: false,
      },
    ],
    [
      "@rnmapbox/maps",
      {
        RNMapboxMapsUseV11: true,
      },
    ],
    "@react-native-google-signin/google-signin",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://api.ecofy.co.tz",
    mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "",
    mapboxStyleUrl:
      process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ??
      "mapbox://styles/mapbox/satellite-streets-v12",
    environmentName: process.env.EXPO_PUBLIC_ENVIRONMENT ?? "local",
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
    googleAndroidClientId:
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "",
    eas: {
      // Public, non-secret identifier. Hardcoded fallback so EAS cloud builds
      // (which pull from git and never see the gitignored .env) still resolve it.
      projectId:
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
        "8ea8241a-8972-41ed-862f-2bc25e0231b6",
    },
  },
});
