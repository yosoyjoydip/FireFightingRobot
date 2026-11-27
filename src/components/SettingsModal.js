import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DEFAULT_SETTINGS } from "../constants/defaults";
import {
  checkForAppUpdate,
  getCurrentAppVersion
} from "../services/updater";

const CMD_FIELDS = [
  { key: "start", label: "START" },
  { key: "emergencyStop", label: "STOP (Emergency)" },
  { key: "pumpOn", label: "PUMP ON" },
  { key: "pumpOff", label: "PUMP OFF" },
  { key: "manual", label: "MANUAL" },
  { key: "auto", label: "AUTO" },
  { key: "forward", label: "FORWARD (↑)" },
  { key: "backward", label: "BACKWARD (↓)" },
  { key: "left", label: "LEFT (←)" },
  { key: "right", label: "RIGHT (→)" },
  { key: "stop", label: "MOVE STOP (■)" }
];

export default function SettingsModal({
  visible,
  settings,
  onClose,
  onSave,
  onInstallUpdate
}) {
  const [draft, setDraft] = useState(settings);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [foundUpdate, setFoundUpdate] = useState(null);
  const [installing, setInstalling] = useState(false);

  const currentVersion = getCurrentAppVersion();

  useEffect(() => {
    if (visible) {
      setDraft(JSON.parse(JSON.stringify(settings)));
      setUpdateStatus("");
      setFoundUpdate(null);
      setCheckingUpdate(false);
      setInstalling(false);
    }
  }, [visible, settings]);

  function updateField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateCmd(key, value) {
    setDraft((prev) => ({
      ...prev,
      commands: { ...prev.commands, [key]: value }
    }));
  }

  async function handleManualUpdateCheck() {
    setCheckingUpdate(true);
    setUpdateStatus("Checking for updates...");
    setFoundUpdate(null);
    try {
      const res = await checkForAppUpdate(draft);
      if (res.kind === "ota" || res.kind === "apk") {
        setFoundUpdate(res);
        setUpdateStatus(
          res.kind === "ota"
            ? `Instant OTA update ready (${res.version}).`
            : `New APK ${res.version} available (${res.apkName}).`
        );
      } else {
        setUpdateStatus(res.message || "Already up to date.");
      }
    } catch (err) {
      setUpdateStatus(err.message || "Update check failed.");
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleInstallNow() {
    if (!foundUpdate || !onInstallUpdate) return;
    setInstalling(true);
    try {
      await onInstallUpdate(foundUpdate);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Bluetooth & App Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#8ea2c4" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* App Updates Section */}
            <Text style={styles.sectionTitle}>
              App Updates (Current: v{currentVersion.version} • build {currentVersion.build})
            </Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Auto-check for updates on launch</Text>
              <Switch
                value={draft.autoCheckUpdates !== false}
                onValueChange={(v) => updateField("autoCheckUpdates", v)}
                trackColor={{ false: "#334155", true: "#2563eb" }}
                thumbColor="#fff"
              />
            </View>

            <Text style={styles.label}>GitHub Repo (owner/repo)</Text>
            <TextInput
              style={styles.input}
              value={draft.githubRepo}
              onChangeText={(v) => updateField("githubRepo", v)}
              placeholder="yosoyjoydip/FireFightingRobot"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />

            <Text style={styles.label}>GitHub Token (optional, only for private repo releases)</Text>
            <TextInput
              style={styles.input}
              value={draft.githubToken}
              onChangeText={(v) => updateField("githubToken", v)}
              placeholder="github_pat_..."
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              secureTextEntry
            />

            <View style={styles.updateBtnRow}>
              <TouchableOpacity
                style={styles.updateCheckBtn}
                onPress={handleManualUpdateCheck}
                disabled={checkingUpdate || installing}
              >
                {checkingUpdate ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="update" size={18} color="#fff" />
                )}
                <Text style={styles.btnText}>Check for Updates</Text>
              </TouchableOpacity>

              {foundUpdate && (
                <TouchableOpacity
                  style={styles.updateInstallBtn}
                  onPress={handleInstallNow}
                  disabled={installing}
                >
                  {installing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="download" size={18} color="#fff" />
                  )}
                  <Text style={styles.btnText}>Install</Text>
                </TouchableOpacity>
              )}
            </View>

            {!!updateStatus && <Text style={styles.updateStatusText}>{updateStatus}</Text>}

            {/* BLE Settings */}
            <Text style={[styles.sectionTitle, { marginTop: 14 }]}>BLE GATT UUIDs</Text>

            <Text style={styles.label}>BLE Service UUID</Text>
            <TextInput
              style={styles.input}
              value={draft.bleServiceUuid}
              onChangeText={(v) => updateField("bleServiceUuid", v)}
              autoCapitalize="none"
            />

            <Text style={styles.label}>BLE TX Characteristic (Write)</Text>
            <TextInput
              style={styles.input}
              value={draft.bleTxUuid}
              onChangeText={(v) => updateField("bleTxUuid", v)}
              autoCapitalize="none"
            />

            <Text style={styles.label}>BLE RX Characteristic (Notify)</Text>
            <TextInput
              style={styles.input}
              value={draft.bleRxUuid}
              onChangeText={(v) => updateField("bleRxUuid", v)}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Line Ending</Text>
            <View style={styles.lineEndRow}>
              {[
                { label: "LF (\\n)", val: "\\n" },
                { label: "CRLF (\\r\\n)", val: "\\r\\n" },
                { label: "None", val: "" }
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.chipBtn, draft.lineEnding === opt.val && styles.chipBtnActive]}
                  onPress={() => updateField("lineEnding", opt.val)}
                >
                  <Text style={styles.chipText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Send STOP when releasing D-pad</Text>
              <Switch
                value={Boolean(draft.holdStopOnRelease)}
                onValueChange={(v) => updateField("holdStopOnRelease", v)}
                trackColor={{ false: "#334155", true: "#2563eb" }}
                thumbColor="#fff"
              />
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Outgoing Command Strings</Text>
            <View style={styles.cmdGrid}>
              {CMD_FIELDS.map((item) => (
                <View key={item.key} style={styles.cmdCell}>
                  <Text style={styles.label}>{item.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.commands[item.key]}
                    onChangeText={(v) => updateCmd(item.key, v)}
                    autoCapitalize="none"
                  />
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))}
            >
              <Text style={styles.btnText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                onSave(draft);
                onClose();
              }}
            >
              <Text style={styles.btnText}>Save Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 10, 22, 0.8)",
    justifyContent: "center",
    padding: 16
  },
  card: {
    backgroundColor: "#132546",
    borderRadius: 20,
    padding: 18,
    maxHeight: "88%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700"
  },
  scroll: {
    marginBottom: 12
  },
  sectionTitle: {
    color: "#7dd3fc",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8
  },
  label: {
    color: "#8ea2c4",
    fontSize: 11.5,
    marginBottom: 4
  },
  input: {
    backgroundColor: "#0d1a33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#fff",
    fontSize: 13,
    marginBottom: 10
  },
  updateBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6
  },
  updateCheckBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0284c7",
    borderRadius: 10,
    paddingVertical: 10
  },
  updateInstallBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  updateStatusText: {
    color: "#fde047",
    fontSize: 12,
    marginBottom: 6
  },
  lineEndRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  chipBtn: {
    flex: 1,
    backgroundColor: "#0d1a33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center"
  },
  chipBtnActive: {
    backgroundColor: "#2563eb",
    borderColor: "#38bdf8"
  },
  chipText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600"
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  switchLabel: {
    color: "#cbd5e1",
    fontSize: 13,
    flex: 1
  },
  cmdGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  cmdCell: {
    width: "48%"
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10
  },
  secondaryBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13.5
  }
});
