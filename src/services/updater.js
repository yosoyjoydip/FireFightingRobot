import { Platform } from "react-native";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { File, Paths } from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";

export function getCurrentAppVersion() {
  return {
    version: Application.nativeApplicationVersion || "1.0.0",
    build: Application.nativeBuildVersion || "1"
  };
}

/**
 * Compares semver-like strings such as "v1.0.2" vs "1.0.0".
 * Returns >0 if `a > b`, 0 if equal, <0 if `a < b`.
 */
export function compareVersions(a, b) {
  const clean = (v) =>
    String(v || "0")
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const pa = clean(a);
  const pb = clean(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * Checks for both Expo OTA updates (if configured) and newer GitHub Release APKs.
 * Returns { kind: "ota" | "apk" | "none" | "error", ... }
 */
export async function checkForAppUpdate(settings) {
  // 1. Check Expo OTA updates first when enabled in a production/EAS build
  if (Updates.isEnabled) {
    try {
      const otaCheck = await Updates.checkForUpdateAsync();
      if (otaCheck.isAvailable) {
        return {
          kind: "ota",
          version: otaCheck.manifest?.runtimeVersion || "OTA",
          notes: "Instant UI/JS update ready to apply without reinstalling APK."
        };
      }
    } catch {
      // Fall through to GitHub Releases check if OTA endpoint isn't configured
    }
  }

  // 2. Check GitHub Releases for a newer .apk
  const repo = (settings?.githubRepo || "").trim();
  if (!repo) {
    return { kind: "none", message: "No update repository configured." };
  }

  const headers = { Accept: "application/vnd.github+json" };
  if (settings?.githubToken?.trim()) {
    headers.Authorization = `Bearer ${settings.githubToken.trim()}`;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (res.status === 404) {
    return {
      kind: "none",
      message: "No published GitHub Release found (or repo is private without a token)."
    };
  }
  if (!res.ok) {
    throw new Error(`GitHub update check failed (HTTP ${res.status})`);
  }

  const release = await res.json();
  const latestTag = release.tag_name || release.name || "0.0.0";
  const current = getCurrentAppVersion();

  if (compareVersions(latestTag, current.version) <= 0) {
    return {
      kind: "none",
      message: `You are on the latest version (v${current.version}).`
    };
  }

  const apkAsset = (release.assets || []).find((a) =>
    String(a.name || "").toLowerCase().endsWith(".apk")
  );
  if (!apkAsset) {
    return {
      kind: "none",
      message: `Release ${latestTag} has no .apk asset attached.`
    };
  }

  return {
    kind: "apk",
    version: latestTag,
    apkName: apkAsset.name,
    downloadUrl: settings?.githubToken?.trim() ? apkAsset.url : apkAsset.browser_download_url,
    authToken: settings?.githubToken?.trim() || "",
    notes: release.body || "New APK release available."
  };
}

/**
 * Applies an Expo OTA update and reloads the app.
 */
export async function applyOtaUpdate() {
  const result = await Updates.fetchUpdateAsync();
  if (result.isNew) {
    await Updates.reloadAsync();
  }
}

/**
 * Downloads a release APK into cache and opens Android's native Package Installer
 * so the app updates in-place without uninstalling (requires matching signing key).
 */
export async function downloadAndInstallApk(updateInfo) {
  if (Platform.OS !== "android") {
    throw new Error("APK installation is only supported on Android.");
  }

  const destFile = new File(Paths.cache, "firebot-update.apk");
  const headers = {};
  if (updateInfo.authToken) {
    headers.Authorization = `Bearer ${updateInfo.authToken}`;
    headers.Accept = "application/octet-stream";
  }

  const downloaded = await File.downloadFileAsync(updateInfo.downloadUrl, destFile, {
    idempotent: true,
    headers
  });

  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: downloaded.contentUri,
    type: "application/vnd.android.package-archive",
    flags: 1 // Intent.FLAG_GRANT_READ_URI_PERMISSION
  });
}
