import { useState } from "react";
import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthProvider";
import { API_BASE_URL } from "../../src/config/api";
import { Icon, PrimaryButton, SectionHeader } from "../../src/ui/components";
import { ScrollableScreen } from "../../src/ui/Screen";
import { colors, commonStyles, radii, spacing, typography } from "../../src/ui/theme";

export default function More() {
  const { session, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  async function changePassword() {
    if (busy) return;
    if (!currentPassword || newPassword.length < 10) { Alert.alert("Revisá la contraseña", "La nueva contraseña debe tener al menos 10 caracteres."); return; }
    if (newPassword !== confirmation) { Alert.alert("Las contraseñas no coinciden"); return; }
    setBusy(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      await logout();
      Alert.alert("Contraseña actualizada", "Iniciá sesión nuevamente.");
    } catch (error) {
      Alert.alert("No se pudo cambiar la contraseña", error instanceof ApiError ? error.message : "Revisá los datos ingresados.");
    } finally { setBusy(false); }
  }
  return <ScrollableScreen style={commonStyles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.heading}><View style={styles.avatar}><Icon name="person-outline" size={26} color={colors.primary} /></View><View><Text style={typography.title}>Más</Text><Text style={styles.muted}>Configuración de tu cuenta</Text></View></View><View style={commonStyles.card}><SectionHeader title="Herramientas" /><Pressable style={styles.menu} onPress={() => router.push("/categories")}><Icon name="pricetags-outline" color={colors.primary} /><Text style={styles.value}>Categorías</Text></Pressable><Pressable style={styles.menu} onPress={() => router.push("/reports")}><Icon name="analytics-outline" color={colors.primary} /><Text style={styles.value}>Reportes</Text></Pressable><Pressable style={styles.menu} onPress={() => router.push("/recurring")}><Icon name="repeat-outline" color={colors.primary} /><Text style={styles.value}>Recurrentes</Text></Pressable><Pressable style={styles.menu} onPress={() => router.push("/budget")}><Icon name="wallet-outline" color={colors.primary} /><Text style={styles.value}>Presupuestos</Text></Pressable></View><View style={commonStyles.card}><SectionHeader title="Cuenta" /><Text style={styles.label}>Email</Text><Text style={styles.value}>{session?.user.email}</Text><Text style={styles.label}>Sesión</Text><Text style={styles.value}>Protegida con SecureStore</Text></View><View style={commonStyles.card}><SectionHeader title="Seguridad" /><TextInput accessibilityLabel="Contraseña actual" placeholder="Contraseña actual" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} style={commonStyles.input} /><TextInput accessibilityLabel="Nueva contraseña" placeholder="Nueva contraseña" secureTextEntry value={newPassword} onChangeText={setNewPassword} style={commonStyles.input} /><TextInput accessibilityLabel="Confirmar contraseña" placeholder="Confirmar contraseña" secureTextEntry value={confirmation} onChangeText={setConfirmation} style={commonStyles.input} /><PrimaryButton label={busy ? "Actualizando…" : "Cambiar contraseña"} onPress={() => { void changePassword(); }} disabled={busy} icon="shield-checkmark-outline" /></View><View style={commonStyles.card}><SectionHeader title="Aplicación" /><Text style={styles.label}>API</Text><Text selectable style={styles.value}>{API_BASE_URL}</Text><Text style={styles.muted}>MyFinance Mobile 2.0</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión" onPress={() => { void logout(); }} style={styles.logout}><Icon name="log-out-outline" size={21} color={colors.danger} /><Text style={styles.logoutText}>Cerrar sesión</Text></Pressable></ScrollableScreen>;
}

const styles = StyleSheet.create({
  content: { ...commonStyles.content, paddingBottom: spacing.xxl },
  heading: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radii.pill, height: 52, justifyContent: "center", width: 52 },
  label: { ...typography.label, marginTop: spacing.md },
  value: { ...typography.body, marginTop: spacing.xs },
  muted: { ...typography.muted, marginTop: spacing.xs },
  logout: { alignItems: "center", borderColor: "#f4c8c5", borderRadius: radii.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 52 },
  menu: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  logoutText: { color: colors.danger, fontSize: 16, fontWeight: "800" },
});
