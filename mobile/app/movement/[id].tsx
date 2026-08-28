import { useState } from "react";
import { Alert, Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../src/api/client";
import type { TransferPurpose } from "../../src/api/types";
import { formatDate, formatMoney, localDateIso, normalizeDecimal } from "../../src/lib/format";

export default function MovementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Number(id);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["transaction", transactionId], queryFn: () => api.transaction(transactionId) });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const categories = useQuery({ queryKey: ["categories", "expense"], queryFn: () => api.categories("expense") });
  const item = query.data;
  const [description, setDescription] = useState<string>();
  const [amount, setAmount] = useState<string>();
  const [date, setDate] = useState<string>();
  const [accountId, setAccountId] = useState<number>();
  const [destinationAccountId, setDestinationAccountId] = useState<number>();
  const [destinationAmount, setDestinationAmount] = useState<string>();
  const [categoryId, setCategoryId] = useState<number>();
  const [notes, setNotes] = useState<string>();
  const [purpose, setPurpose] = useState<TransferPurpose>();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const value = <T,>(current: T | undefined, original: T) => current ?? original;
  const source = accounts.data?.find(account => account.id === value(accountId, item?.account_id ?? 0));
  const destination = accounts.data?.find(account => account.id === value(destinationAccountId, item?.destination_account_id ?? 0));
  const update = useMutation({
    mutationFn: () => api.updateTransaction(transactionId, {
      date: value(date, item!.date), kind: item!.kind, amount: normalizeDecimal(value(amount, item!.amount)), description: value(description, item!.description).trim(), notes: value(notes, item!.notes ?? ""),
      account_id: value(accountId, item!.account_id), category_id: item!.kind === "expense" ? value(categoryId, item!.category_id ?? undefined) : null,
      destination_account_id: item!.kind === "transfer" ? value(destinationAccountId, item!.destination_account_id ?? undefined) : null,
      destination_amount: item!.kind === "transfer" ? normalizeDecimal(value(destinationAmount, item!.destination_amount ?? item!.amount)) : null,
      purpose: item!.kind === "transfer" ? value(purpose, item!.purpose ?? "regular") : null,
    }),
    onSuccess: async () => { await Promise.all(["transactions", "dashboard", "accounts", "transaction", "report", "history"].map(key => client.invalidateQueries({ queryKey: [key] }))); router.back(); },
    onError: error => Alert.alert("No se pudo editar", error instanceof ApiError ? error.message : "Revisá los datos ingresados."),
  });
  const voidMutation = useMutation({ mutationFn: () => api.voidTransaction(transactionId), onSuccess: async () => { await Promise.all(["transactions", "dashboard", "accounts", "report", "history"].map(key => client.invalidateQueries({ queryKey: [key] }))); router.back(); }, onError: error => Alert.alert("No se pudo anular", error instanceof ApiError ? error.message : "Revisá los datos ingresados.") });
  if (query.isPending || accounts.isPending || categories.isPending || !item || !accounts.data || !categories.data) return <View style={styles.center}><Text>Cargando movimiento…</Text></View>;
  const currency = source?.currency ?? "UYU";
  const currentDate = value(date, item.date);
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><Text style={styles.title}>Editar movimiento</Text><Text style={styles.muted}>{item.kind === "transfer" ? "Transferencia" : item.kind === "income" ? "Ingreso" : "Gasto"}</Text>
    <View style={commonStyles.card}><Text style={styles.label}>Detalle</Text><Text style={styles.muted}>Importe: {formatMoney(item.amount, currency)} · Moneda: {currency}</Text><Text style={styles.muted}>Cuenta: {source?.name ?? "—"}</Text><Text style={styles.muted}>Categoría: {categories.find(category => category.id === item.category_id)?.name ?? (item.kind === "transfer" ? "Transferencia" : "Sin categoría")}</Text><Text style={styles.muted}>Estado: {item.is_voided ? "Anulado" : "Activo"}</Text>{item.category_source ? <Text style={styles.muted}>Origen categoría: {item.category_source}</Text> : null}{item.kind === "transfer" ? <><Text style={styles.muted}>Propósito: {item.purpose ?? "regular"}</Text><Text style={styles.muted}>Destino: {destination?.name ?? "—"}</Text><Text style={styles.muted}>Importe destino: {item.destination_amount ?? "—"}</Text></> : null}</View>
    <TextInput style={styles.input} placeholder="Descripción" value={value(description, item.description)} onChangeText={setDescription} /><TextInput style={styles.input} placeholder="Importe" keyboardType="decimal-pad" value={value(amount, item.amount)} onChangeText={setAmount} /><TextInput style={styles.input} placeholder="Notas (opcional)" value={value(notes, item.notes ?? "")} onChangeText={setNotes} />
    <Text style={styles.label}>Fecha contable</Text><Pressable style={styles.input} onPress={() => setShowDatePicker(true)}><Text>{formatDate(currentDate)}</Text></Pressable>{showDatePicker && <DateTimePicker value={new Date(`${currentDate}T12:00:00`)} mode="date" maximumDate={new Date()} onChange={(_, selected) => { setShowDatePicker(false); if (selected) setDate(localDateIso(selected)); }} />}
    <Text style={styles.label}>Cuenta</Text>{accounts.data.map(account => <Button key={account.id} title={`${account.name} · ${account.currency}`} color={account.id === value(accountId, item.account_id) ? "#2563eb" : "#64748b"} onPress={() => setAccountId(account.id)} />)}
    {item.kind === "expense" && <><Text style={styles.label}>Categoría</Text>{categories.data.map(category => <Button key={category.id} title={category.name} color={category.id === value(categoryId, item.category_id ?? 0) ? "#2563eb" : "#64748b"} onPress={() => setCategoryId(category.id)} />)}</>}
    {item.kind === "transfer" && <><Text style={styles.label}>Cuenta destino</Text>{accounts.data.filter(account => account.id !== value(accountId, item.account_id)).map(account => <Button key={account.id} title={`${account.name} · ${account.currency}`} color={account.id === value(destinationAccountId, item.destination_account_id ?? 0) ? "#2563eb" : "#64748b"} onPress={() => setDestinationAccountId(account.id)} />)}{destination?.currency !== source?.currency && <TextInput style={styles.input} placeholder="Importe recibido" keyboardType="decimal-pad" value={value(destinationAmount, item.destination_amount ?? "")} onChangeText={setDestinationAmount} />}<Text style={styles.label}>Propósito</Text>{(["regular", "savings", "investment"] as TransferPurpose[]).map(valueOption => <Button key={valueOption} title={valueOption} color={valueOption === value(purpose, item.purpose ?? "regular") ? "#2563eb" : "#64748b"} onPress={() => setPurpose(valueOption)} />)}</>}
    <Text style={styles.muted}>Saldo y conversión calculados por el backend. Actual: {formatMoney(item.amount, currency)}</Text><Button title={update.isPending ? "Guardando…" : "Guardar cambios"} disabled={update.isPending || item.is_voided} onPress={() => update.mutate()} /><View style={styles.danger}><Button title={item.is_voided ? "Movimiento anulado" : "Anular movimiento"} disabled={item.is_voided || voidMutation.isPending} color="#b91c1c" onPress={() => Alert.alert("¿Anular este movimiento?", "El historial se conservará.", [{ text: "Cancelar", style: "cancel" }, { text: "Anular", style: "destructive", onPress: () => voidMutation.mutate() }])} /></View></ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 20, gap: 12, backgroundColor: "#f8fafc" }, center: { flex: 1, justifyContent: "center", alignItems: "center" }, title: { fontSize: 25, fontWeight: "700" }, muted: { color: "#64748b" }, label: { fontWeight: "600", marginTop: 8 }, input: { backgroundColor: "white", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 13 }, danger: { marginTop: 12 } });
