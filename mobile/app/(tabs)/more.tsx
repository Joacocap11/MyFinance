import { Button, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { API_BASE_URL } from "../../src/config/api";

export default function More() {
  const { session, logout } = useAuth();
  return <View style={styles.page}><Text style={styles.title}>Más</Text><Text style={styles.label}>Usuario</Text><Text>{session?.user.email}</Text><Text style={styles.label}>API configurada</Text><Text selectable>{API_BASE_URL}</Text><Text style={styles.version}>MyFinance Mobile 1.0.0</Text><Button title="Cerrar sesión" onPress={() => { void logout(); }} /></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, padding: 20, gap: 10, backgroundColor: "#f8fafc" }, title: { fontSize: 26, fontWeight: "700", marginBottom: 12 }, label: { color: "#64748b", marginTop: 8 }, version: { color: "#64748b", marginVertical: 20 } });
