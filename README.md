# FireBot Control — Android APK (React Native / Expo)

Native Android app for controlling the **FireFightingRobot** (Arduino Uno R3 + ESP32 DevKit) over **Bluetooth Classic (SPP / HC-05)** or **Bluetooth Low Energy (BLE)**, plus a built-in **Demo Simulator** and **In-App Auto/Manual Updates**.

## Features

- **Classic Bluetooth (SPP):** Connects to paired ESP32 `BluetoothSerial` or HC-05/HC-06 modules (`react-native-bluetooth-classic`) with an in-app device list and nearby discovery.
- **Bluetooth Low Energy (BLE):** Scans and connects to ESP32 BLE UART devices (`react-native-ble-plx`, Nordic UART `6e400001-...`, HM-10 `0000ffe0-...`, or custom UUIDs in Settings).
- **Demo Simulator Mode:** Emits live `SENSOR_STATUS` JSON telemetry and lets you test **Trigger Test Fire** without hardware.
- **In-App Updates (No Uninstall Needed):**
  - Automatically checks on startup (toggleable in **⚙ Settings**) or manually via **Check for Updates**.
  - Supports **Expo OTA updates** (`expo-updates`) when linked with EAS Update, and **GitHub Releases APK self-updates** (downloads the latest release `.apk` and launches Android's installer in-place).

## How to Enable In-Place APK Updates (Never Uninstall Old Version)

Android allows updating an installed APK without uninstalling **only if every APK is signed with the same keystore** and has a higher `versionCode`.

1. Generate a persistent Android keystore once (on any machine with `keytool` / JDK, or Cloud Shell):
   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore firebot-release.keystore -alias firebot -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Base64-encode it and add these 4 **GitHub Repository Secrets** (`Settings → Secrets and variables → Actions`):
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS` (`firebot`)
   - `ANDROID_KEY_PASSWORD`
3. Whenever you want to publish an update:
   ```powershell
   git tag v1.0.1
   git push origin v1.0.1
   ```
   GitHub Actions builds the signed APK with an incremented `versionCode`, attaches `FireBotControl-v1.0.1.apk` to a GitHub Release, and the app on your phone detects and installs it in-place.
