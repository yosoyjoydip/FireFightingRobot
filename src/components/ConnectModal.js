import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BleDriver, ClassicBluetoothDriver } from "../services/bluetoothDrivers";
import { requestBluetoothPermissions } from "../services/permissions";

export default function ConnectModal({
  visible,
  onClose,
  onSelectClassicDevice,
  onSelectBleDevice,
  onSelectDemo
}) {
  const [mode, setMode] = useState("menu"); // "menu" | "classic" | "ble"
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!visible) {
      cleanupScans();
      setMode("menu");
      setDevices([]);
      setErrorMsg("");
      setLoading(false);
    }
    return () => cleanupScans();
  }, [visible]);

  function cleanupScans() {
    BleDriver.stopScan();
    ClassicBluetoothDriver.cancelDiscovery();
  }

  async function openClassicList() {
    setErrorMsg("");
    setMode("classic");
    setLoading(true);
    try {
      const ok = await requestBluetoothPermissions();
      if (!ok) {
        setErrorMsg("Bluetooth permissions denied.");
        setLoading(false);
        return;
      }
      const paired = await ClassicBluetoothDriver.getPairedDevices();
      setDevices(paired || []);
    } catch (err) {
      setErrorMsg(err.message || "Could not load paired Bluetooth devices.");
    } finally {
      setLoading(false);
    }
  }

  async function scanClassicNearby() {
    setErrorMsg("");
    setLoading(true);
    try {
      const discovered = await ClassicBluetoothDriver.discoverDevices();
      setDevices((prev) => {
        const map = new Map(prev.map((d) => [d.address || d.id, d]));
        for (const item of discovered || []) {
          map.set(item.address || item.id, item);
        }
        return Array.from(map.values());
      });
    } catch (err) {
      setErrorMsg(err.message || "Discovery failed.");
    } finally {
      setLoading(false);
    }
  }

  async function openBleScan() {
    setErrorMsg("");
    setDevices([]);
    setMode("ble");
    setLoading(true);

    const ok = await requestBluetoothPermissions();
    if (!ok) {
      setErrorMsg("Bluetooth/Location permissions denied.");
      setLoading(false);
      return;
    }

    const seen = new Map();
    BleDriver.startScan(
      (device) => {
        seen.set(device.id, device);
        setDevices(Array.from(seen.values()));
      },
      (err) => {
        setErrorMsg(err.message || "BLE scan error. Make sure Bluetooth & Location are ON.");
        setLoading(false);
      }
    );

    setTimeout(() => {
      BleDriver.stopScan();
      setLoading(false);
    }, 8000);
  }

  function handleBackToMenu() {
    cleanupScans();
    setMode("menu");
    setDevices([]);
    setErrorMsg("");
    setLoading(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {mode !== "menu" && (
                <TouchableOpacity onPress={handleBackToMenu} style={styles.backBtn}>
                  <MaterialCommunityIcons name="chevron-left" size={24} color="#f3f6fc" />
                </TouchableOpacity>
              )}
              <Text style={styles.title}>
                {mode === "menu"
                  ? "Connect to FireBot"
                  : mode === "classic"
                    ? "Bluetooth Classic (SPP)"
                    : "Bluetooth Low Energy (BLE)"}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#8ea2c4" />
            </TouchableOpacity>
          </View>

          {mode === "menu" ? (
            <View style={styles.options}>
              <TouchableOpacity style={styles.optionCard} onPress={openClassicList}>
                <View style={[styles.badge, { backgroundColor: "#7c3aed" }]}>
                  <Text style={styles.badgeText}>SPP</Text>
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Bluetooth Classic (ESP32 / HC-05)</Text>
                  <Text style={styles.optionDesc}>
                    Connect to paired BluetoothSerial or HC-05/HC-06 modules directly.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.optionCard} onPress={openBleScan}>
                <View style={[styles.badge, { backgroundColor: "#2563eb" }]}>
                  <Text style={styles.badgeText}>BLE</Text>
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Bluetooth Low Energy (BLE)</Text>
                  <Text style={styles.optionDesc}>
                    Wireless GATT scan for ESP32 DevKit BLE UART devices.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => {
                  onClose();
                  onSelectDemo();
                }}
              >
                <View style={[styles.badge, { backgroundColor: "#059669" }]}>
                  <Text style={styles.badgeText}>SIM</Text>
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Demo Simulator Mode</Text>
                  <Text style={styles.optionDesc}>
                    Test the UI, JSON logs, and fire alerts without hardware.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.listSection}>
              <View style={styles.scanRow}>
                <Text style={styles.scanHint}>
                  {mode === "classic"
                    ? "Tap a paired device (or scan nearby):"
                    : loading
                      ? "Scanning nearby BLE devices..."
                      : "Tap a BLE device to connect:"}
                </Text>
                {mode === "classic" ? (
                  <TouchableOpacity
                    style={styles.rescanBtn}
                    onPress={scanClassicNearby}
                    disabled={loading}
                  >
                    <Text style={styles.rescanText}>{loading ? "Scanning..." : "Scan Nearby"}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.rescanBtn}
                    onPress={openBleScan}
                    disabled={loading}
                  >
                    <Text style={styles.rescanText}>{loading ? "Scanning..." : "Rescan"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {loading && <ActivityIndicator color="#38bdf8" style={{ marginVertical: 10 }} />}
              {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

              <FlatList
                data={devices}
                keyExtractor={(item, idx) => item.address || item.id || String(idx)}
                style={styles.deviceList}
                ListEmptyComponent={
                  !loading ? (
                    <Text style={styles.emptyText}>
                      {mode === "classic"
                        ? "No paired devices found. Pair ESP32 in Android Bluetooth settings or tap Scan Nearby."
                        : "No BLE devices found. Ensure ESP32 is powered on & Location is enabled."}
                    </Text>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.deviceRow}
                    onPress={() => {
                      cleanupScans();
                      onClose();
                      if (mode === "classic") onSelectClassicDevice(item);
                      else onSelectBleDevice(item);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={mode === "classic" ? "bluetooth" : "bluetooth-connect"}
                      size={22}
                      color="#38bdf8"
                    />
                    <View style={styles.deviceMeta}>
                      <Text style={styles.deviceName}>{item.name || item.localName || "Unnamed Device"}</Text>
                      <Text style={styles.deviceAddr}>{item.address || item.id}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#64748b" />
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
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
    padding: 18
  },
  card: {
    backgroundColor: "#132546",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    maxHeight: "82%"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  backBtn: {
    padding: 2
  },
  title: {
    color: "#f3f6fc",
    fontSize: 18,
    fontWeight: "700"
  },
  options: {
    gap: 10
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13
  },
  optionInfo: {
    flex: 1
  },
  optionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2
  },
  optionDesc: {
    color: "#8ea2c4",
    fontSize: 12.5,
    lineHeight: 17
  },
  listSection: {
    gap: 8
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  scanHint: {
    color: "#94a3b8",
    fontSize: 12.5,
    flex: 1
  },
  rescanBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  rescanText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600"
  },
  errorText: {
    color: "#f87171",
    fontSize: 12.5
  },
  deviceList: {
    maxHeight: 280,
    marginTop: 4
  },
  emptyText: {
    color: "#8ea2c4",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    borderRadius: 12,
    marginBottom: 8
  },
  deviceMeta: {
    flex: 1
  },
  deviceName: {
    color: "#fff",
    fontSize: 14.5,
    fontWeight: "600"
  },
  deviceAddr: {
    color: "#8ea2c4",
    fontSize: 12
  }
});
