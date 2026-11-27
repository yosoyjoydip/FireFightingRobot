const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * Configures persistent release APK signing when a keystore is provided
 * at certs/release.keystore (or android/app/release.keystore), using env vars
 * ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
 * Falls back to debug signing when not configured.
 */
module.exports = function withPersistentSigning(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const stagedKeystore = path.join(
        modConfig.modRequest.projectRoot,
        "certs",
        "release.keystore"
      );
      const keystorePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "release.keystore"
      );
      const gradlePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "build.gradle"
      );

      if (fs.existsSync(stagedKeystore) && !fs.existsSync(keystorePath)) {
        fs.copyFileSync(stagedKeystore, keystorePath);
      }

      if (fs.existsSync(keystorePath) && fs.existsSync(gradlePath)) {
        const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD || "android";
        const keyAlias = process.env.ANDROID_KEY_ALIAS || "firebot";
        const keyPassword = process.env.ANDROID_KEY_PASSWORD || storePassword;

        let gradle = fs.readFileSync(gradlePath, "utf8");
        if (!gradle.includes("release.keystore")) {
          gradle = gradle.replace(
            /signingConfigs\s*\{/,
            `signingConfigs {\n        release {\n            storeFile file('release.keystore')\n            storePassword '${storePassword}'\n            keyAlias '${keyAlias}'\n            keyPassword '${keyPassword}'\n        }`
          );
          gradle = gradle.replace(
            /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
            "$1signingConfig signingConfigs.release"
          );
          fs.writeFileSync(gradlePath, gradle, "utf8");
        }
      }

      return modConfig;
    }
  ]);
};
