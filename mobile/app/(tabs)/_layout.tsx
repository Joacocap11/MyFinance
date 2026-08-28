import { Tabs } from "expo-router";

export default function TabsLayout() {
  return <Tabs screenOptions={{ tabBarActiveTintColor: "#2563eb", headerShown: true }}><Tabs.Screen name="index" options={{ title: "Inicio" }} /><Tabs.Screen name="movements" options={{ title: "Movimientos" }} /><Tabs.Screen name="accounts" options={{ title: "Cuentas" }} /><Tabs.Screen name="more" options={{ title: "Más" }} /></Tabs>;
}
