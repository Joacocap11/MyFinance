import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../src/api/client";
import type { Account, TransactionKind, TransferPurpose } from "../../src/api/types";
import { formatDate, localDateIso, normalizeDecimal } from "../../src/lib/format";
import { Icon, PrimaryButton, ScreenMessage, SectionHeader } from "../../src/ui/components";
import { ScrollableScreen } from "../../src/ui/Screen";
import { colors, commonStyles, radii, spacing, typography } from "../../src/ui/theme";

const kinds: { value: TransactionKind; label: string; icon: "arrow-up-circle-outline" | "arrow-down-circle-outline" | "swap-horizontal-outline" }[] = [
  { value: "expense", label: "Gasto", icon: "arrow-up-circle-outline" },
  { value: "income", label: "Ingreso", icon: "arrow-down-circle-outline" },
  { value: "transfer", label: "Transferencia", icon: "swap-horizontal-outline" },
];

function Choice({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: "wallet-outline" | "pricetag-outline" | "swap-horizontal-outline" }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>{icon ? <Icon name={icon} size={18} color={selected ? colors.primary : colors.muted} /> : null}<Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function AccountChoices({ accounts, selected, onSelect }: { accounts: Account[]; selected?: number; onSelect: (id: number) => void }) {
  return <View style={styles.choices}>{accounts.map(account => <Choice key={account.id} label={`${account.name} · ${account.currency}`} selected={account.id === selected} onPress={() => onSelect(account.id)} icon="wallet-outline" />)}</View>;
}

export default function NewMovement() {
  const client = useQueryClient();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const categories = useQuery({ queryKey: ["categories", "expense"], queryFn: () => api.categories("expense") });
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [amount, setAmount] = useState("");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState<number>();
  const [destinationAccountId, setDestinationAccountId] = useState<number>();
  const [categoryId, setCategoryId] = useState<number>();
  const [purpose, setPurpose] = useState<TransferPurpose>("regular");
  const [date, setDate] = useState(localDateIso());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const source = accounts.data?.find(item => item.id === accountId);
  const destination = accounts.data?.find(item => item.id === destinationAccountId);
  const mutation = useMutation({
    mutationFn: () => api.createTransaction({ date, kind, amount: normalizeDecimal(amount), description: description.trim(), account_id: accountId!, category_id: kind === "expense" ? categoryId : null, destination_account_id: kind === "transfer" ? destinationAccountId : null, destination_amount: kind === "transfer" && destination?.currency !== source?.currency ? normalizeDecimal(destinationAmount) : null, purpose: kind === "transfer" ? purpose : null }),
    onSuccess: async () => { await Promise.all(["transactions", "dashboard", "accounts"].map(queryKey => client.invalidateQueries({ queryKey: [queryKey] }))); router.back(); },
    onError: error => Alert.alert("No se pudo guardar", error instanceof ApiError ? error.message : "Revisá los datos ingresados."),
  });
  if (accounts.isPending || categories.isPending) return <ScreenMessage title="Cargando formulario" detail="Un momento…" icon="hourglass-outline" />;
  if (accounts.isError || categories.isError || !accounts.data || !categories.data) return <ScreenMessage title="No se pudo cargar el formulario" detail="Comprobá el acceso al servidor e intentá nuevamente." />;
  const canSubmit = Boolean(description.trim() && normalizeDecimal(amount) && accountId && (kind !== "expense" || categoryId) && (kind !== "transfer" || (destinationAccountId && destinationAccountId !== accountId && (destination?.currency === source?.currency || normalizeDecimal(destinationAmount)))));
  return <ScrollableScreen style={commonStyles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={typography.title}>Nueva operación</Text><Text style={styles.subtitle}>Registrá un movimiento en pocos pasos.</Text><View style={styles.kindRow}>{kinds.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: item.value === kind }} onPress={() => setKind(item.value)} style={({ pressed }) => [styles.kind, item.value === kind && styles.kindSelected, pressed && styles.pressed]}><Icon name={item.icon} size={21} color={item.value === kind ? colors.primary : colors.muted} /><Text style={[styles.kindText, item.value === kind && styles.kindTextSelected]}>{item.label}</Text></Pressable>)}</View><View style={commonStyles.card}><Text style={styles.label}>Importe</Text><TextInput accessibilityLabel="Importe" style={styles.amountInput} placeholder="0,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} /><Text style={styles.label}>Descripción</Text><TextInput accessibilityLabel="Descripción" style={commonStyles.input} placeholder="¿En qué fue?" value={description} onChangeText={setDescription} /><Text style={styles.label}>Fecha contable</Text><Pressable accessibilityRole="button" accessibilityLabel="Fecha contable" style={styles.dateButton} onPress={() => setShowDatePicker(true)}><Icon name="calendar-outline" size={20} color={colors.primary} /><Text style={styles.dateText}>{formatDate(date)}</Text></Pressable>{showDatePicker && <DateTimePicker value={new Date(`${date}T12:00:00`)} mode="date" maximumDate={new Date()} onChange={(_, selected) => { setShowDatePicker(false); if (selected) setDate(localDateIso(selected)); }} />}</View><View style={commonStyles.card}><SectionHeader title="Cuenta de origen" /><AccountChoices accounts={accounts.data} selected={accountId} onSelect={setAccountId} /></View>{kind === "expense" && <View style={commonStyles.card}><SectionHeader title="Categoría" /><View style={styles.choices}>{categories.data.map(category => <Choice key={category.id} label={category.name} selected={category.id === categoryId} onPress={() => setCategoryId(category.id)} icon="pricetag-outline" />)}</View></View>}{kind === "transfer" && <View style={commonStyles.card}><SectionHeader title="Transferencia" /><Text style={styles.label}>Cuenta destino</Text><AccountChoices accounts={accounts.data.filter(item => item.id !== accountId)} selected={destinationAccountId} onSelect={setDestinationAccountId} />{destination?.currency !== source?.currency && <><Text style={styles.label}>Importe recibido ({destination?.currency ?? "destino"})</Text><TextInput accessibilityLabel="Importe recibido" style={commonStyles.input} placeholder="0,00" keyboardType="decimal-pad" value={destinationAmount} onChangeText={setDestinationAmount} /></>}<Text style={styles.label}>Propósito</Text><View style={styles.choices}>{(["regular", "savings", "investment"] as TransferPurpose[]).map(value => <Choice key={value} label={value === "regular" ? "Regular" : value === "savings" ? "Ahorro" : "Inversión"} selected={purpose === value} onPress={() => setPurpose(value)} icon="swap-horizontal-outline" />)}</View></View>}<PrimaryButton label={mutation.isPending ? "Guardando…" : "Guardar movimiento"} onPress={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending} icon="checkmark" /></ScrollableScreen>;
}

const styles = StyleSheet.create({
  content: { ...commonStyles.content, paddingBottom: spacing.xxl },
  subtitle: { ...typography.muted, marginTop: -spacing.sm },
  kindRow: { flexDirection: "row", gap: spacing.sm },
  kind: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, flex: 1, gap: spacing.xs, minHeight: 72, padding: spacing.sm },
  kindSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1 },
  kindText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  kindTextSelected: { color: colors.primary },
  label: { ...typography.label, marginBottom: spacing.sm, marginTop: spacing.md },
  amountInput: { borderBottomColor: colors.primary, borderBottomWidth: 2, color: colors.ink, fontSize: 32, fontWeight: "800", minHeight: 58, paddingVertical: spacing.sm },
  dateButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
  dateText: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  choices: { gap: spacing.sm },
  choice: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, flexDirection: "row", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md },
  choiceSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1 },
  choiceText: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: "600" },
  choiceTextSelected: { color: colors.primary, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});
