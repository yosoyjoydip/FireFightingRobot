# FireBot Control — Android APK (React Native / Expo)

Native Android app for controlling the **FireFightingRobot** (Arduino Uno R3 + ESP32 DevKit) over **Bluetooth Classic (SPP / HC-05)** or **Bluetooth Low Energy (BLE)**, plus a built-in **Demo Simulator**.

## Features

- **Classic Bluetooth (SPP):** Connects to paired ESP32 `BluetoothSerial` or HC-05/HC-06 modules (`react-native-bluetooth-classic`) with an in-app device list and nearby discovery.
- **Bluetooth Low Energy (BLE):** Scans and connects to ESP32 BLE UART devices (`react-native-ble-plx`, Nordic UART `6e400001-...`, HM-10 `0000ffe0-...`, or custom UUIDs in Settings).
- **Demo Simulator Mode:** Emits live `SENSOR_STATUS` JSON telemetry and lets you test **Trigger Test Fire** without hardware.
- **Full FireBot Control UI:** Splash screen, System Safe / Fire Detected banner, `LEFT` / `CENTER` / `RIGHT` gauges, `Mode`/`Pump`/`Moving` pills, 2×3 Control Panel (`START`, `STOP`, `PUMP ON`, `PUMP OFF`, `MANUAL`, `AUTO`), D-pad Movement Control, Command History chips, collapsible Serial Logs terminal, and persistent Settings.

## How to Build the `.apk` Without Android Studio on Your PC

Because native Bluetooth modules require a real Android build (Expo Go does not bundle custom Bluetooth native modules), build the `.apk` in the cloud using **either** option below:

### Option 1: Expo EAS Cloud Build (Recommended — Easiest)

```powershell
cd C:\FireFightingRobot\FireBotApp
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

When the build finishes (~5–10 minutes), EAS prints a QR code and direct `.apk` download link to install on your Android phone.

### Option 2: Free GitHub Actions APK Build

Push the `C:\FireFightingRobot` folder to a GitHub repository. The included workflow (`.github/workflows/build-apk.yml`) automatically compiles `app-release.apk` and attaches it under **Actions → Build FireBot Android APK → Artifacts (`firebot-control-apk`)**.
