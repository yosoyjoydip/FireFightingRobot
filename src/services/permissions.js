import { PermissionsAndroid, Platform } from "react-native";

/**
 * Requests Android Bluetooth & Location runtime permissions needed
 * for both Classic Bluetooth discovery and BLE scanning.
 */
export async function requestBluetoothPermissions() {
  if (Platform.OS !== "android") return true;

  const apiLevel = Number(Platform.Version) || 0;
  if (apiLevel >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: "Location Permission",
      message: "FireBot Control needs location permission to scan for nearby Bluetooth devices.",
      buttonPositive: "Allow"
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}
