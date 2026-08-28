import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ApiError, loadLastLoginEmail } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { Icon, PrimaryButton } from "../src/ui/components";
import { colors, commonStyles, radii, spacing, typography } from "../src/ui/theme";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void loadLastLoginEmail().then(setEmail); }, []);
  async function submit() {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try { await login(email.trim(), password); router.replace("/(tabs)"); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "Verificá tus credenciales y el acceso al servidor."); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={commonStyles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.content}><View style={styles.brand}><View style={styles.logo}><Icon name="wallet-outline" size={34} color={colors.primary} /></View><Text style={typography.title}>MyFinance</Text><Text style={styles.subtitle}>Tus finanzas, en tu espacio.</Text></View><View style={commonStyles.card}><Text style={styles.label}>Email</Text><TextInput accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="tu@email.com" value={email} onChangeText={setEmail} style={commonStyles.input} /><Text style={styles.label}>Contraseña</Text><TextInput accessibilityLabel="Contraseña" placeholder="Tu contraseña" autoComplete="current-password" secureTextEntry value={password} onChangeText={setPassword} style={commonStyles.input} />{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<PrimaryButton label={busy ? "Ingresando…" : "Ingresar"} onPress={() => { void submit(); }} disabled={busy || !email.trim() || !password} icon="arrow-forward-outline" /></View></View></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", padding: spacing.xl },
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logo: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radii.pill, height: 68, justifyContent: "center", marginBottom: spacing.md, width: 68 },
  subtitle: { ...typography.muted, marginTop: spacing.sm },
  label: { ...typography.label, marginBottom: spacing.sm, marginTop: spacing.md },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, color: colors.danger, padding: spacing.md },
});
