const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * AGP 8+/9+ disables BuildConfig generation for library modules by default.
 * react-native-bluetooth-classic references BuildConfig.DEBUG in its Java receivers
 * without enabling buildFeatures.buildConfig in its build.gradle.
 */
module.exports = function withBluetoothClassicFix(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const target = path.join(
        modConfig.modRequest.projectRoot,
        "node_modules",
        "react-native-bluetooth-classic",
        "android",
        "build.gradle"
      );

      if (fs.existsSync(target)) {
        let contents = fs.readFileSync(target, "utf8");
        if (!contents.includes("buildFeatures")) {
          contents = contents.replace(
            /lintOptions\s*\{/,
            `buildFeatures {\n        buildConfig = true\n    }\n    lintOptions {`
          );
          fs.writeFileSync(target, contents, "utf8");
        }
      }

      return modConfig;
    }
  ]);
};
