import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, api } from "../../src/api/client";
import type { Currency } from "../../src/api/types";
import { normalizeDecimal } from "../../src/lib/format";
import { Icon, PrimaryButton } from "../../src/ui/components";
import { colors, commonStyles, radii, spacing, typography } from "../../src/ui/theme";

const currencies: Currency[] = ["UYU", "USD", "UI"];

export default function NewAccount() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>("UYU");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({ mutationFn: () => api.createAccount({ name: name.trim(), currency, opening_balance: normalizeDecimal(openingBalance) || "0" }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["accounts"] }); await client.invalidateQueries({ queryKey: ["dashboard"] }); router.back(); }, onError: (reason: unknown) => setError(reason instanceof ApiError ? reason.message : "No se pudo crear la cuenta.") });
  const valid = Boolean(name.trim() && normalizeDecimal(openingBalance) !== "");
  return <ScrollView style={commonStyles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={typography.title}>Nueva cuenta</Text><Text style={styles.subtitle}>Agregá una cuenta para administrar su saldo y movimientos.</Text><View style={commonStyles.card}><Text style={styles.label}>Nombre</Text><TextInput accessibilityLabel="Nombre de cuenta" style={commonStyles.input} placeholder="Cuenta principal" value={name} onChangeText={setName} /><Text style={styles.label}>Moneda</Text><View style={styles.choices}>{currencies.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: currency === value }} onPress={() => setCurrency(value)} style={[styles.choice, currency === value && styles.selected]}><Icon name="cash-outline" size={18} color={currency === value ? colors.primary : colors.muted} /><Text style={[styles.choiceText, currency === value && styles.selectedText]}>{value}</Text></Pressable>)}</View><Text style={styles.label}>Saldo inicial</Text><TextInput accessibilityLabel="Saldo inicial" style={styles.amountInput} placeholder="0,00" keyboardType="decimal-pad" value={openingBalance} onChangeText={setOpeningBalance} /><Text style={styles.hint}>Acepta formatos como 1000, 1000.50 o 1000,50.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton label={create.isPending ? "Creando…" : "Crear cuenta"} icon="checkmark" disabled={!valid || create.isPending} onPress={() => { setError(null); create.mutate(); }} /></View></ScrollView>;
}

const styles = StyleSheet.create({ content: { ...commonStyles.content, paddingBottom: spacing.xxl }, subtitle: { ...typography.muted, marginBottom: spacing.lg }, label: { ...typography.label, marginBottom: spacing.sm, marginTop: spacing.md }, choices: { gap: spacing.sm }, choice: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, minHeight: 48, padding: spacing.md }, selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1 }, choiceText: { color: colors.ink, fontSize: 15, fontWeight: "700" }, selectedText: { color: colors.primary }, amountInput: { borderBottomColor: colors.primary, borderBottomWidth: 2, color: colors.ink, fontSize: 30, fontWeight: "800", paddingVertical: spacing.sm }, hint: { ...typography.muted, marginTop: spacing.sm }, error: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, color: colors.danger, marginVertical: spacing.md, padding: spacing.md } });
