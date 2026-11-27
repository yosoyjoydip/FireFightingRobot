import RNBluetoothClassic from "react-native-bluetooth-classic";
import { BleManager } from "react-native-ble-plx";
import base64 from "base-64";
import { KNOWN_BLE_PROFILES } from "../constants/defaults";

let sharedBleManager = null;
function getBleManager() {
  if (!sharedBleManager) {
    sharedBleManager = new BleManager();
  }
  return sharedBleManager;
}

/**
 * Classic Bluetooth (SPP / BluetoothSerial / HC-05 / HC-06) driver.
 */
export class ClassicBluetoothDriver {
  constructor(onLine, onDisconnect, onSystemLog) {
    this.onLine = onLine;
    this.onDisconnect = onDisconnect;
    this.onSystemLog = onSystemLog;
    this.device = null;
    this.readSub = null;
    this.disconnectSub = null;
  }

  static async getPairedDevices() {
    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (!enabled) {
      await RNBluetoothClassic.requestBluetoothEnabled();
    }
    return await RNBluetoothClassic.getBondedDevices();
  }

  static async discoverDevices() {
    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (!enabled) {
      await RNBluetoothClassic.requestBluetoothEnabled();
    }
    return await RNBluetoothClassic.startDiscovery();
  }

  static async cancelDiscovery() {
    try {
      await RNBluetoothClassic.cancelDiscovery();
    } catch {
      // Ignore if discovery not active
    }
  }

  async connect(deviceItem) {
    const address = deviceItem.address || deviceItem.id;
    this.onSystemLog(`Connecting Classic BT to ${deviceItem.name || address}...`);

    const connectedDevice = await RNBluetoothClassic.connectToDevice(address, {
      delimiter: "\n",
      charset: "utf-8"
    });
    this.device = connectedDevice;

    this.readSub = connectedDevice.onDataReceived((event) => {
      const line = String(event?.data ?? "").trim();
      if (line) this.onLine(line);
    });

    this.disconnectSub = RNBluetoothClassic.onDeviceDisconnected(() => {
      this.onSystemLog("Classic Bluetooth device disconnected.");
      this.cleanupSubscriptions();
      this.device = null;
      this.onDisconnect();
    });

    this.onSystemLog(`Classic BT connected to ${connectedDevice.name || address}`);
    return connectedDevice.name || "BT Classic";
  }

  async send(text) {
    if (!this.device) throw new Error("Classic Bluetooth device not connected.");
    await this.device.write(text, "utf-8");
  }

  cleanupSubscriptions() {
    this.readSub?.remove?.();
    this.readSub = null;
    this.disconnectSub?.remove?.();
    this.disconnectSub = null;
  }

  async disconnect() {
    this.cleanupSubscriptions();
    if (this.device) {
      const dev = this.device;
      this.device = null;
      await dev.disconnect().catch(() => {});
    }
    this.onSystemLog("Classic Bluetooth disconnected.");
  }
}

/**
 * Bluetooth Low Energy (BLE GATT) driver using react-native-ble-plx.
 */
export class BleDriver {
  constructor(onLine, onDisconnect, onSystemLog) {
    this.onLine = onLine;
    this.onDisconnect = onDisconnect;
    this.onSystemLog = onSystemLog;
    this.manager = getBleManager();
    this.device = null;
    this.serviceUuid = null;
    this.txUuid = null;
    this.rxUuid = null;
    this.txWithResponse = true;
    this.monitorSub = null;
    this.disconnectSub = null;
    this.buffer = "";
  }

  static startScan(onDeviceFound, onError) {
    const manager = getBleManager();
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        onError?.(error);
        return;
      }
      if (device && (device.name || device.localName)) {
        onDeviceFound(device);
      }
    });
  }

  static stopScan() {
    try {
      getBleManager().stopDeviceScan();
    } catch {
      // Ignore
    }
  }

  async connect(deviceItem, settings) {
    BleDriver.stopScan();
    this.onSystemLog(`Connecting BLE to ${deviceItem.name || deviceItem.id}...`);

    const connected = await this.manager.connectToDevice(deviceItem.id, { timeout: 12000 });
    this.device = await connected.discoverAllServicesAndCharacteristics();

    const resolved = await this._resolveCharacteristics(this.device, settings);
    this.serviceUuid = resolved.serviceUuid;
    this.txUuid = resolved.txUuid;
    this.rxUuid = resolved.rxUuid;
    this.txWithResponse = resolved.txWithResponse;

    if (this.rxUuid) {
      this.monitorSub = this.manager.monitorCharacteristicForDevice(
        this.device.id,
        this.serviceUuid,
        this.rxUuid,
        (error, characteristic) => {
          if (error) {
            if (this.device) {
              this.onSystemLog(`BLE notify error: ${error.message}`);
            }
            return;
          }
          if (characteristic?.value) {
            const chunk = base64.decode(characteristic.value);
            this._pushChunk(chunk);
          }
        }
      );
    }

    this.disconnectSub = this.manager.onDeviceDisconnected(this.device.id, () => {
      this.onSystemLog("BLE device disconnected.");
      this.cleanupSubscriptions();
      this.device = null;
      this.onDisconnect();
    });

    this.onSystemLog(`BLE connected to ${this.device.name || this.device.id}`);
    return this.device.name || "BLE";
  }

  async _resolveCharacteristics(device, settings) {
    const services = await device.services();
    const customProfile = {
      service: settings.bleServiceUuid.trim().toLowerCase(),
      tx: settings.bleTxUuid.trim().toLowerCase(),
      rx: settings.bleRxUuid.trim().toLowerCase()
    };
    const candidates = [customProfile, ...KNOWN_BLE_PROFILES];

    for (const profile of candidates) {
      const svc = services.find((s) => s.uuid.toLowerCase() === profile.service);
      if (!svc) continue;
      const chars = await svc.characteristics();
      const txChar = chars.find((c) => c.uuid.toLowerCase() === profile.tx);
      const rxChar = chars.find((c) => c.uuid.toLowerCase() === profile.rx) || txChar;
      if (txChar) {
        return {
          serviceUuid: svc.uuid,
          txUuid: txChar.uuid,
          rxUuid: rxChar && (rxChar.isNotifiable || rxChar.isIndicatable) ? rxChar.uuid : null,
          txWithResponse: !txChar.isWritableWithoutResponse
        };
      }
    }

    // Fallback: pick first writable and notifiable characteristics on any service
    for (const svc of services) {
      const chars = await svc.characteristics();
      const txChar = chars.find((c) => c.isWritableWithResponse || c.isWritableWithoutResponse);
      const rxChar = chars.find((c) => c.isNotifiable || c.isIndicatable);
      if (txChar) {
        return {
          serviceUuid: svc.uuid,
          txUuid: txChar.uuid,
          rxUuid: rxChar ? rxChar.uuid : null,
          txWithResponse: !txChar.isWritableWithoutResponse
        };
      }
    }

    throw new Error("No writable BLE characteristic found. Check UUIDs in Settings.");
  }

  _pushChunk(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) this.onLine(trimmed);
    }
  }

  async send(text) {
    if (!this.device || !this.serviceUuid || !this.txUuid) {
      throw new Error("BLE device not connected.");
    }
    const chunkSize = 20;
    for (let i = 0; i < text.length; i += chunkSize) {
      const part = base64.encode(text.slice(i, i + chunkSize));
      if (this.txWithResponse) {
        await this.manager.writeCharacteristicWithResponseForDevice(
          this.device.id,
          this.serviceUuid,
          this.txUuid,
          part
        );
      } else {
        await this.manager.writeCharacteristicWithoutResponseForDevice(
          this.device.id,
          this.serviceUuid,
          this.txUuid,
          part
        );
      }
    }
  }

  cleanupSubscriptions() {
    this.monitorSub?.remove?.();
    this.monitorSub = null;
    this.disconnectSub?.remove?.();
    this.disconnectSub = null;
  }

  async disconnect() {
    BleDriver.stopScan();
    this.cleanupSubscriptions();
    if (this.device) {
      const devId = this.device.id;
      this.device = null;
      await this.manager.cancelDeviceConnection(devId).catch(() => {});
    }
    this.onSystemLog("BLE disconnected.");
  }
}

/**
 * Interactive Demo Simulator matching ESP32/Arduino SENSOR_STATUS JSON telemetry.
 */
export class SimulatorDriver {
  constructor(onLine, onDisconnect, onSystemLog) {
    this.onLine = onLine;
    this.onDisconnect = onDisconnect;
    this.onSystemLog = onSystemLog;
    this.timer = null;
    this.startTime = Date.now();
    this.state = {
      left: 0,
      middle: 0,
      right: 0,
      fire: 0,
      pump: 0,
      mode: "auto",
      emergency: 0,
      moving: 0,
      enabled: 1,
      state: 0
    };
  }

  async connect() {
    this.startTime = Date.now();
    this.onSystemLog("Demo Simulator started. Emitting SENSOR_STATUS packets.");
    this._emitStatus();
    this.timer = setInterval(() => this._emitStatus(), 1000);
    return "Demo Mode";
  }

  _emitStatus() {
    this.onLine(
      JSON.stringify({
        type: "SENSOR_STATUS",
        ...this.state,
        ts: Date.now() - this.startTime
      })
    );
  }

  triggerTestFire() {
    const active = this.state.fire === 0 ? 1 : 0;
    if (active) {
      this.state.left = 0;
      this.state.middle = 1;
      this.state.right = 0;
      this.state.fire = 1;
      if (this.state.mode === "auto" && this.state.enabled === 1) {
        this.state.pump = 1;
      }
    } else {
      this.state.left = 0;
      this.state.middle = 0;
      this.state.right = 0;
      this.state.fire = 0;
      if (this.state.mode === "auto") {
        this.state.pump = 0;
      }
    }
    this._emitStatus();
  }

  async send(rawText, settings) {
    const cmd = rawText.trim();
    const c = settings.commands;
    if (cmd === c.start) {
      this.state.enabled = 1;
      this.state.emergency = 0;
    } else if (cmd === c.emergencyStop) {
      this.state.enabled = 0;
      this.state.emergency = 1;
      this.state.moving = 0;
      this.state.pump = 0;
    } else if (cmd === c.pumpOn) {
      this.state.pump = 1;
    } else if (cmd === c.pumpOff) {
      this.state.pump = 0;
    } else if (cmd === c.manual) {
      this.state.mode = "manual";
    } else if (cmd === c.auto) {
      this.state.mode = "auto";
      this.state.moving = 0;
    } else if ([c.forward, c.backward, c.left, c.right].includes(cmd)) {
      this.state.moving = this.state.enabled ? 1 : 0;
    } else if (cmd === c.stop) {
      this.state.moving = 0;
    }
    this._emitStatus();
  }

  async disconnect() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.onSystemLog("Demo Simulator stopped.");
  }
}
