import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_SETTINGS, STORAGE_KEY, decodeLineEnding } from "./src/constants/defaults";
import {
  BleDriver,
  ClassicBluetoothDriver,
  SimulatorDriver
} from "./src/services/bluetoothDrivers";
import ConnectModal from "./src/components/ConnectModal";
import SettingsModal from "./src/components/SettingsModal";
import {
  applyOtaUpdate,
  checkForAppUpdate,
  downloadAndInstallApk
} from "./src/services/updater";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [connType, setConnType] = useState(null); // "classic" | "ble" | "demo" | null
  const [connLabel, setConnLabel] = useState("Disconnected");
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [logsVisible, setLogsVisible] = useState(true);
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [rawInput, setRawInput] = useState("");
  const [telemetry, setTelemetry] = useState({
    left: 0,
    middle: 0,
    right: 0,
    fire: 0,
    pump: 0,
    mode: "auto",
    emergency: 0,
    moving: 0,
    enabled: 1,
    state: 0,
    ts: 0
  });

  const driverRef = useRef(null);
  const logScrollRef = useRef(null);
  const logIdRef = useRef(1);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        let merged = DEFAULT_SETTINGS;
        if (raw) {
          const parsed = JSON.parse(raw);
          merged = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            commands: { ...DEFAULT_SETTINGS.commands, ...(parsed.commands || {}) }
          };
          setSettings(merged);
        }
        if (merged.autoCheckUpdates !== false) {
          checkForAppUpdate(merged)
            .then((res) => {
              if (res.kind === "ota" || res.kind === "apk") {
                setAvailableUpdate(res);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    appendLog('FireBot Control ready. Tap "Disconnected" to connect via Bluetooth.', "sys");

    const timer = setTimeout(() => setShowSplash(false), 1100);
    return () => {
      clearTimeout(timer);
      driverRef.current?.disconnect?.();
    };
  }, []);

  function appendLog(text, kind = "rx") {
    const id = logIdRef.current++;
    setLogs((prev) => {
      const next = [...prev, { id, text, kind }];
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }

  function handleIncomingLine(line) {
    appendLog(line, "rx");
    try {
      const startIdx = line.indexOf("{");
      const endIdx = line.lastIndexOf("}");
      if (startIdx !== -1 && endIdx > startIdx) {
        const data = JSON.parse(line.slice(startIdx, endIdx + 1));
        if (
          data &&
          (data.type === "SENSOR_STATUS" ||
            "left" in data ||
            "middle" in data ||
            "right" in data ||
            "fire" in data)
        ) {
          setTelemetry((prev) => ({
            ...prev,
            ...data,
            left: Number(data.left ?? prev.left),
            middle: Number(data.middle ?? data.center ?? prev.middle),
            right: Number(data.right ?? prev.right),
            fire: Number(data.fire ?? prev.fire),
            pump: Number(data.pump ?? prev.pump),
            moving: Number(data.moving ?? prev.moving),
            emergency: Number(data.emergency ?? prev.emergency),
            enabled: Number(data.enabled ?? prev.enabled),
            mode: String(data.mode ?? prev.mode).toLowerCase()
          }));
        }
      }
    } catch {
      // Non-JSON log line
    }
  }

  function handleUnexpectedDisconnect() {
    driverRef.current = null;
    setConnType(null);
    setConnLabel("Disconnected");
  }

  async function disconnectCurrent() {
    if (driverRef.current) {
      const drv = driverRef.current;
      driverRef.current = null;
      await drv.disconnect();
    }
    setConnType(null);
    setConnLabel("Disconnected");
  }

  async function connectClassic(deviceItem) {
    await disconnectCurrent();
    const drv = new ClassicBluetoothDriver(
      handleIncomingLine,
      handleUnexpectedDisconnect,
      (msg) => appendLog(msg, "sys")
    );
    try {
      await drv.connect(deviceItem);
      driverRef.current = drv;
      setConnType("classic");
      setConnLabel("Connected");
    } catch (err) {
      appendLog(`Classic BT error: ${err.message}`, "sys");
      Alert.alert("Connection Failed", err.message);
    }
  }

  async function connectBle(deviceItem) {
    await disconnectCurrent();
    const drv = new BleDriver(
      handleIncomingLine,
      handleUnexpectedDisconnect,
      (msg) => appendLog(msg, "sys")
    );
    try {
      await drv.connect(deviceItem, settings);
      driverRef.current = drv;
      setConnType("ble");
      setConnLabel("Connected");
    } catch (err) {
      appendLog(`BLE error: ${err.message}`, "sys");
      Alert.alert("Connection Failed", err.message);
    }
  }

  async function connectDemo() {
    await disconnectCurrent();
    const drv = new SimulatorDriver(
      handleIncomingLine,
      handleUnexpectedDisconnect,
      (msg) => appendLog(msg, "sys")
    );
    await drv.connect();
    driverRef.current = drv;
    setConnType("demo");
    setConnLabel("Demo Mode");
  }

  async function sendCommand(cmd) {
    if (!cmd) return;
    setHistory((prev) => [cmd, ...prev].slice(0, 16));

    if (!driverRef.current) {
      appendLog(`TX (offline): ${cmd}`, "tx");
      Alert.alert("Not Connected", "Tap the Disconnected button to connect via Bluetooth or Demo Mode.");
      return;
    }

    const payload = cmd + decodeLineEnding(settings.lineEnding);
    try {
      await driverRef.current.send(payload, settings);
      appendLog(`TX: ${cmd}`, "tx");
    } catch (err) {
      appendLog(`Send error: ${err.message}`, "sys");
    }
  }

  function saveNewSettings(nextSettings) {
    setSettings(nextSettings);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings)).catch(() => {});
  }

  async function handleInstallUpdate(updateInfo) {
    if (!updateInfo) return;
    setInstallingUpdate(true);
    try {
      if (updateInfo.kind === "ota") {
        appendLog("Downloading OTA update...", "sys");
        await applyOtaUpdate();
      } else if (updateInfo.kind === "apk") {
        appendLog(`Downloading APK update ${updateInfo.version}...`, "sys");
        await downloadAndInstallApk(updateInfo);
      }
    } catch (err) {
      Alert.alert("Update Error", err.message || "Could not install update.");
    } finally {
      setInstallingUpdate(false);
    }
  }

  const isFire =
    telemetry.fire > 0 ||
    telemetry.left > 0 ||
    telemetry.middle > 0 ||
    telemetry.right > 0;
  const isStopped = telemetry.emergency > 0 || telemetry.enabled === 0;
  const isAuto = telemetry.mode === "auto";

  const fireSources = [];
  if (telemetry.left > 0) fireSources.push("LEFT");
  if (telemetry.middle > 0) fireSources.push("CENTER");
  if (telemetry.right > 0) fireSources.push("RIGHT");

  return (
    <SafeAreaProvider>
      <LinearGradient colors={["#10172a", "#18223d"]} style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
          {/* Header */}
          <View style={styles.topBar}>
            <View style={styles.topLeft}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setConnectModalOpen(true)}
              >
                <MaterialCommunityIcons name="chevron-left" size={24} color="#f3f6fc" />
              </TouchableOpacity>
              <Text style={styles.appTitle}>FireBot Control</Text>
            </View>

            <View style={styles.topRight}>
              <TouchableOpacity
                style={[
                  styles.statusPill,
                  connType === "demo"
                    ? styles.pillDemo
                    : connType
                      ? styles.pillConnected
                      : styles.pillDisconnected
                ]}
                onPress={() => {
                  if (connType) disconnectCurrent();
                  else setConnectModalOpen(true);
                }}
              >
                <View style={styles.statusDot} />
                <Text style={styles.statusPillText}>{connLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setSettingsModalOpen(true)}
              >
                <MaterialCommunityIcons name="cog-outline" size={21} color="#f3f6fc" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* In-App Update Available Banner */}
            {availableUpdate && (
              <View style={styles.updateBar}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.updateBarTitle}>
                    Update Available ({availableUpdate.version})
                  </Text>
                  <Text style={styles.updateBarSub}>
                    {availableUpdate.kind === "ota"
                      ? "Instant OTA update ready"
                      : "Tap Update to install over current app"}
                  </Text>
                </View>
                <View style={styles.demoActions}>
                  <TouchableOpacity
                    style={styles.updateNowBtn}
                    disabled={installingUpdate}
                    onPress={() => handleInstallUpdate(availableUpdate)}
                  >
                    <Text style={styles.demoBtnText}>
                      {installingUpdate ? "Updating..." : "Update"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.demoExitBtn}
                    onPress={() => setAvailableUpdate(null)}
                  >
                    <Text style={styles.demoBtnText}>Later</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Demo Simulator Bar */}
            {connType === "demo" && (
              <View style={styles.demoBar}>
                <Text style={styles.demoBarText}>Demo Simulator Active</Text>
                <View style={styles.demoActions}>
                  <TouchableOpacity
                    style={styles.demoFireBtn}
                    onPress={() => driverRef.current?.triggerTestFire?.()}
                  >
                    <Text style={styles.demoBtnText}>Trigger Test Fire</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.demoExitBtn} onPress={disconnectCurrent}>
                    <Text style={styles.demoBtnText}>Exit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Status Banner */}
            <LinearGradient
              colors={
                isFire
                  ? ["#b71c1c", "#e53935"]
                  : isStopped
                    ? ["#b45309", "#d97706"]
                    : ["#2e7d32", "#43a047"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            >
              <View style={styles.bannerIconWrap}>
                <MaterialCommunityIcons
                  name={isFire ? "fire" : isStopped ? "alert" : "check-circle"}
                  size={30}
                  color="#fff"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>
                  {isFire
                    ? "Fire Detected!"
                    : isStopped
                      ? telemetry.emergency > 0
                        ? "Emergency Stop"
                        : "System Paused"
                      : "System Safe"}
                </Text>
                <Text style={styles.bannerSub}>
                  {isFire
                    ? fireSources.length
                      ? `Flame on: ${fireSources.join(", ")}${telemetry.pump ? " • Pump ON" : ""}`
                      : "Flame sensor triggered"
                    : isStopped
                      ? "Press START to resume robot operation"
                      : "No fire detected"}
                </Text>
              </View>
            </LinearGradient>

            {/* Sensor Readings Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="access-point" size={20} color="#00b4d8" />
                <Text style={styles.cardTitle}>Sensor Readings</Text>
              </View>

              <View style={styles.gaugesRow}>
                {[
                  { label: "LEFT", val: telemetry.left, color: "#f97316" },
                  { label: "CENTER", val: telemetry.middle, color: "#eab308" },
                  { label: "RIGHT", val: telemetry.right, color: "#f97316" }
                ].map((g) => {
                  const active = g.val > 0;
                  return (
                    <View key={g.label} style={styles.gaugeItem}>
                      <Text style={styles.gaugeLabel}>{g.label}</Text>
                      <View
                        style={[
                          styles.gaugeRing,
                          { borderColor: active ? "#ef4444" : g.color },
                          active && styles.gaugeActive
                        ]}
                      >
                        <Text style={[styles.gaugeVal, active && { color: "#fff" }]}>
                          {g.val}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.pillsRow}>
                <View
                  style={[
                    styles.infoPill,
                    isAuto ? styles.pillModeAuto : styles.pillModeManual
                  ]}
                >
                  <Text
                    style={[
                      styles.infoPillText,
                      { color: isAuto ? "#c084fc" : "#93c5fd" }
                    ]}
                  >
                    Mode: {isAuto ? "AUTO" : "MANUAL"}
                  </Text>
                </View>

                <View
                  style={[styles.infoPill, telemetry.pump ? styles.pillActiveBlue : null]}
                >
                  <Text
                    style={[
                      styles.infoPillText,
                      telemetry.pump ? { color: "#7dd3fc" } : null
                    ]}
                  >
                    Pump: {telemetry.pump ? "ON" : "OFF"}
                  </Text>
                </View>

                <View
                  style={[styles.infoPill, telemetry.moving ? styles.pillActiveGreen : null]}
                >
                  <Text
                    style={[
                      styles.infoPillText,
                      telemetry.moving ? { color: "#86efac" } : null
                    ]}
                  >
                    Moving: {telemetry.moving ? "YES" : "NO"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Control Panel Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="gamepad-variant" size={20} color="#a855f7" />
                <Text style={styles.cardTitle}>Control Panel</Text>
              </View>

              <View style={styles.controlGrid}>
                {[
                  {
                    key: "start",
                    label: "START",
                    icon: "play",
                    colors: ["#43a047", "#4caf50"]
                  },
                  {
                    key: "emergencyStop",
                    label: "STOP",
                    icon: "stop",
                    colors: ["#e53935", "#f44336"]
                  },
                  {
                    key: "pumpOn",
                    label: "PUMP ON",
                    icon: "water",
                    colors: ["#1e88e5", "#2196f3"],
                    active: Boolean(telemetry.pump)
                  },
                  {
                    key: "pumpOff",
                    label: "PUMP OFF",
                    icon: "water-outline",
                    colors: ["#f57c00", "#ff9800"],
                    active: !telemetry.pump
                  },
                  {
                    key: "manual",
                    label: "MANUAL",
                    icon: "gesture-tap",
                    colors: ["#8e24aa", "#9c27b0"],
                    active: !isAuto
                  },
                  {
                    key: "auto",
                    label: "AUTO",
                    icon: "robot",
                    colors: ["#546e7a", "#647d89"],
                    active: isAuto
                  }
                ].map((btn) => (
                  <TouchableOpacity
                    key={btn.key}
                    style={styles.ctrlBtnWrap}
                    activeOpacity={0.82}
                    onPress={() => sendCommand(settings.commands[btn.key])}
                  >
                    <LinearGradient
                      colors={btn.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.ctrlBtn, btn.active && styles.ctrlBtnActive]}
                    >
                      <MaterialCommunityIcons name={btn.icon} size={24} color="#fff" />
                      <Text style={styles.ctrlBtnLabel}>{btn.label}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Movement Control Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="directions" size={20} color="#06b6d4" />
                <Text style={styles.cardTitle}>Movement Control</Text>
              </View>

              <View style={styles.dpad}>
                <DpadButton
                  icon="arrow-up"
                  colors={["#06b6d4", "#2563eb"]}
                  onPressIn={() => sendCommand(settings.commands.forward)}
                  onPressOut={() => {
                    if (settings.holdStopOnRelease) sendCommand(settings.commands.stop);
                  }}
                />

                <View style={styles.dpadMidRow}>
                  <DpadButton
                    icon="arrow-left"
                    colors={["#06b6d4", "#2563eb"]}
                    onPressIn={() => sendCommand(settings.commands.left)}
                    onPressOut={() => {
                      if (settings.holdStopOnRelease) sendCommand(settings.commands.stop);
                    }}
                  />

                  <DpadButton
                    icon="stop"
                    colors={["#ef4444", "#f43f5e"]}
                    onPressIn={() => sendCommand(settings.commands.stop)}
                  />

                  <DpadButton
                    icon="arrow-right"
                    colors={["#06b6d4", "#2563eb"]}
                    onPressIn={() => sendCommand(settings.commands.right)}
                    onPressOut={() => {
                      if (settings.holdStopOnRelease) sendCommand(settings.commands.stop);
                    }}
                  />
                </View>

                <DpadButton
                  icon="arrow-down"
                  colors={["#06b6d4", "#2563eb"]}
                  onPressIn={() => sendCommand(settings.commands.backward)}
                  onPressOut={() => {
                    if (settings.holdStopOnRelease) sendCommand(settings.commands.stop);
                  }}
                />
              </View>
            </View>

            {/* Command History Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderBetween}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="history" size={20} color="#94a3b8" />
                  <Text style={styles.cardTitle}>Command History</Text>
                </View>
                <TouchableOpacity onPress={() => setHistory([])}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.historyWrap}>
                {history.length === 0 ? (
                  <Text style={styles.historyEmpty}>No commands sent yet</Text>
                ) : (
                  history.map((cmd, idx) => (
                    <TouchableOpacity
                      key={`${cmd}-${idx}`}
                      style={styles.historyChip}
                      onPress={() => sendCommand(cmd)}
                    >
                      <Text style={styles.historyChipText}>{cmd}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>

            {/* Serial Logs Toggle & Terminal */}
            <TouchableOpacity
              style={styles.logToggleBtn}
              onPress={() => setLogsVisible((v) => !v)}
            >
              <Text style={styles.logToggleText}>
                {logsVisible ? "Hide Serial Logs" : "Show Serial Logs"}
              </Text>
            </TouchableOpacity>

            {logsVisible && (
              <View style={styles.serialDrawer}>
                <ScrollView
                  ref={logScrollRef}
                  style={styles.logBox}
                  nestedScrollEnabled
                  onContentSizeChange={() =>
                    logScrollRef.current?.scrollToEnd({ animated: false })
                  }
                >
                  {logs.map((entry) => (
                    <Text
                      key={entry.id}
                      style={[
                        styles.logLine,
                        entry.kind === "tx" && { color: "#38bdf8" },
                        entry.kind === "sys" && { color: "#facc15" }
                      ]}
                    >
                      {entry.text}
                    </Text>
                  ))}
                </ScrollView>

                <View style={styles.rawRow}>
                  <TextInput
                    style={styles.rawInput}
                    placeholder="Send raw command (e.g. robot_on)..."
                    placeholderTextColor="#64748b"
                    value={rawInput}
                    onChangeText={setRawInput}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.rawSendBtn}
                    onPress={() => {
                      const val = rawInput.trim();
                      if (!val) return;
                      sendCommand(val);
                      setRawInput("");
                    }}
                  >
                    <Text style={styles.rawBtnText}>Send</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rawClearBtn} onPress={() => setLogs([])}>
                    <Text style={styles.rawBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          <ConnectModal
            visible={connectModalOpen}
            onClose={() => setConnectModalOpen(false)}
            onSelectClassicDevice={connectClassic}
            onSelectBleDevice={connectBle}
            onSelectDemo={connectDemo}
          />

          <SettingsModal
            visible={settingsModalOpen}
            settings={settings}
            onClose={() => setSettingsModalOpen(false)}
            onSave={saveNewSettings}
            onInstallUpdate={handleInstallUpdate}
          />

          {/* Splash Screen Overlay */}
          {showSplash && (
            <LinearGradient
              colors={["#101a31", "#1e2239", "#7e1c20"]}
              style={styles.splash}
            >
              <View style={styles.splashBadge}>
                <MaterialCommunityIcons name="car-key" size={62} color="#e4e7ef" />
              </View>
              <Text style={styles.splashTitle}>FireBot Control</Text>
              <ActivityIndicator size="large" color="#d83a34" style={{ marginTop: 8 }} />
            </LinearGradient>
          )}
        </SafeAreaView>
      </LinearGradient>
    </SafeAreaProvider>
  );
}

function DpadButton({ icon, colors, onPressIn, onPressOut }) {
  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [styles.dpadWrap, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.dpadBtn}
      >
        <MaterialCommunityIcons name={icon} size={28} color="#fff" />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  appTitle: {
    color: "#f3f6fc",
    fontSize: 20,
    fontWeight: "700"
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999
  },
  pillConnected: { backgroundColor: "#4caf50" },
  pillDemo: { backgroundColor: "#0284c7" },
  pillDisconnected: { backgroundColor: "#475569" },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff"
  },
  statusPillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13
  },
  scrollContent: {
    padding: 16,
    paddingTop: 6,
    gap: 16,
    paddingBottom: 32
  },
  demoBar: {
    backgroundColor: "rgba(2,132,199,0.2)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.35)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  demoBarText: {
    color: "#bae6fd",
    fontWeight: "600",
    fontSize: 13
  },
  demoActions: {
    flexDirection: "row",
    gap: 6
  },
  demoFireBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  demoExitBtn: {
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  demoBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600"
  },
  banner: {
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16
  },
  bannerIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center"
  },
  bannerTitle: {
    color: "#fff",
    fontSize: 21,
    fontWeight: "700"
  },
  bannerSub: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13.5,
    marginTop: 2
  },
  card: {
    backgroundColor: "#12284e",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)"
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14
  },
  cardHeaderBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cardTitle: {
    color: "#f3f6fc",
    fontSize: 17,
    fontWeight: "700"
  },
  clearText: {
    color: "#8ea2c4",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 14
  },
  gaugesRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16
  },
  gaugeItem: {
    alignItems: "center",
    gap: 8
  },
  gaugeLabel: {
    color: "#8ea2c4",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8
  },
  gaugeRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3.5,
    backgroundColor: "rgba(255, 193, 7, 0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  gaugeActive: {
    backgroundColor: "rgba(239, 68, 68, 0.35)"
  },
  gaugeVal: {
    color: "#facc15",
    fontSize: 24,
    fontWeight: "700"
  },
  pillsRow: {
    flexDirection: "row",
    gap: 8
  },
  infoPill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.4)",
    backgroundColor: "rgba(15,23,42,0.35)",
    paddingVertical: 6,
    alignItems: "center"
  },
  pillModeAuto: {
    borderColor: "#9333ea",
    backgroundColor: "rgba(147,51,234,0.22)"
  },
  pillModeManual: {
    borderColor: "#3b82f6",
    backgroundColor: "rgba(59,130,246,0.22)"
  },
  pillActiveBlue: {
    borderColor: "#38bdf8",
    backgroundColor: "rgba(14,165,233,0.22)"
  },
  pillActiveGreen: {
    borderColor: "#4ade80",
    backgroundColor: "rgba(34,197,94,0.22)"
  },
  infoPillText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600"
  },
  controlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12
  },
  ctrlBtnWrap: {
    width: "48%"
  },
  ctrlBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  ctrlBtnActive: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)"
  },
  ctrlBtnLabel: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.4
  },
  dpad: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 4
  },
  dpadMidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20
  },
  dpadWrap: {
    borderRadius: 36
  },
  dpadBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  historyWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  historyEmpty: {
    color: "#8ea2c4",
    fontSize: 13
  },
  historyChip: {
    backgroundColor: "rgba(10, 20, 42, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  historyChipText: {
    color: "#cbd5e1",
    fontSize: 12.5,
    fontFamily: "monospace"
  },
  logToggleBtn: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 12
  },
  logToggleText: {
    color: "#8ea2c4",
    fontSize: 13.5,
    fontWeight: "500"
  },
  serialDrawer: {
    gap: 8
  },
  logBox: {
    backgroundColor: "#040805",
    borderWidth: 1.5,
    borderColor: "#22c55e",
    borderRadius: 12,
    padding: 10,
    height: 180
  },
  logLine: {
    color: "#4ade80",
    fontFamily: "monospace",
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 4
  },
  rawRow: {
    flexDirection: "row",
    gap: 8
  },
  rawInput: {
    flex: 1,
    backgroundColor: "#0d1b38",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 12.5
  },
  rawSendBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  rawClearBtn: {
    backgroundColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  rawBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12.5
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: 18
  },
  splashBadge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "rgba(185, 38, 43, 0.88)",
    alignItems: "center",
    justifyContent: "center"
  },
  splashTitle: {
    color: "#e7ebf5",
    fontSize: 26,
    fontWeight: "700"
  },
  updateBar: {
    backgroundColor: "rgba(22, 163, 74, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.45)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  updateBarTitle: {
    color: "#bbf7d0",
    fontWeight: "700",
    fontSize: 13
  },
  updateBarSub: {
    color: "#dcfce7",
    fontSize: 11.5,
    marginTop: 1
  },
  updateNowBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  }
});
