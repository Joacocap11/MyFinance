import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ApiError, loadLastLoginEmail } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { Icon, PrimaryButton } from "../src/ui/components";
import { colors, commonStyles, radii, spacing, typography } from "../src/ui/theme";

export default function Login() {
  const { login } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
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

  function revealFocusedField() {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <SafeAreaView style={commonStyles.page} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={commonStyles.page} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
          <View style={styles.brand}>
            <View style={styles.logo}><Icon name="wallet-outline" size={34} color={colors.primary} /></View>
            <Text style={typography.title}>MyFinance</Text>
            <Text style={styles.subtitle}>Tus finanzas, en tu espacio.</Text>
          </View>
          <View style={commonStyles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="tu@email.com" value={email} onChangeText={setEmail} onFocus={revealFocusedField} style={commonStyles.input} />
            <Text style={styles.label}>Contraseña</Text>
            <TextInput accessibilityLabel="Contraseña" placeholder="Tu contraseña" autoComplete="current-password" secureTextEntry value={password} onChangeText={setPassword} onFocus={revealFocusedField} style={commonStyles.input} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <PrimaryButton label={busy ? "Ingresando…" : "Ingresar"} onPress={() => { void submit(); }} disabled={busy || !email.trim() || !password} icon="arrow-forward-outline" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logo: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radii.pill, height: 68, justifyContent: "center", marginBottom: spacing.md, width: 68 },
  subtitle: { ...typography.muted, marginTop: spacing.sm },
  label: { ...typography.label, marginBottom: spacing.sm, marginTop: spacing.md },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, color: colors.danger, padding: spacing.md },
});
