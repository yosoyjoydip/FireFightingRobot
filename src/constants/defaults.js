export const STORAGE_KEY = "firebot_mobile_settings_v1";

export const DEFAULT_SETTINGS = {
  bleServiceUuid: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  bleTxUuid: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
  bleRxUuid: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  lineEnding: "\\n",
  holdStopOnRelease: false,
  autoCheckUpdates: true,
  githubRepo: "yosoyjoydip/FireFightingRobot",
  githubToken: "",
  commands: {
    start: "robot_on",
    emergencyStop: "robot_off",
    pumpOn: "pump_on",
    pumpOff: "pump_off",
    manual: "manual_on",
    auto: "manual_off",
    forward: "forward",
    backward: "backward",
    left: "left",
    right: "right",
    stop: "stop"
  }
};

export const KNOWN_BLE_PROFILES = [
  {
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    tx: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    rx: "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
  },
  {
    service: "0000ffe0-0000-1000-8000-00805f9b34fb",
    tx: "0000ffe1-0000-1000-8000-00805f9b34fb",
    rx: "0000ffe1-0000-1000-8000-00805f9b34fb"
  }
];

export function decodeLineEnding(val) {
  if (val === "\\n") return "\n";
  if (val === "\\r\\n") return "\r\n";
  return "";
}
