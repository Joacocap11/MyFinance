import { useState } from "react";
import { Alert, Button, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../src/auth/AuthProvider";
import { ApiError } from "../src/api/client";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!email || !password || busy) return;
    setBusy(true);
    try { await login(email, password); router.replace("/(tabs)"); }
    catch (error) { Alert.alert("No se pudo iniciar sesión", error instanceof ApiError ? error.message : "Verificá tus credenciales."); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.card}><Text style={styles.title}>MyFinance</Text><Text style={styles.subtitle}>Tus finanzas, en tu espacio.</Text><TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email" value={email} onChangeText={setEmail} style={styles.input} /><TextInput placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} /><Button title={busy ? "Entrando…" : "Entrar"} onPress={submit} disabled={busy || !email || !password} /></View></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ page: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f8fafc" }, card: { gap: 16, padding: 24, borderRadius: 16, backgroundColor: "white", elevation: 2 }, title: { fontSize: 30, fontWeight: "700", color: "#0f172a" }, subtitle: { color: "#64748b", marginBottom: 8 }, input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 13, fontSize: 16 } });
