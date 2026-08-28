import { useState } from "react";
import { Alert, Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../src/api/client";
import type { TransactionKind, TransferPurpose } from "../../src/api/types";
import { formatDate, localDateIso, normalizeDecimal } from "../../src/lib/format";

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
    mutationFn: () => api.createTransaction({
      date, kind, amount: normalizeDecimal(amount), description: description.trim(), account_id: accountId!,
      category_id: kind === "expense" ? categoryId : null,
      destination_account_id: kind === "transfer" ? destinationAccountId : null,
      destination_amount: kind === "transfer" && destination?.currency !== source?.currency ? normalizeDecimal(destinationAmount) : null,
      purpose: kind === "transfer" ? purpose : null,
    }),
    onSuccess: async () => {
      await Promise.all(["transactions", "dashboard", "accounts"].map(queryKey => client.invalidateQueries({ queryKey: [queryKey] })));
      router.back();
    },
    onError: error => Alert.alert("No se pudo guardar", error instanceof ApiError ? error.message : "Revisá los datos ingresados."),
  });
  if (accounts.isPending || categories.isPending || !accounts.data || !categories.data) return <View style={styles.center}><Text>Cargando formulario…</Text></View>;
  const canSubmit = Boolean(description.trim() && normalizeDecimal(amount) && accountId && (kind !== "expense" || categoryId) && (kind !== "transfer" || (destinationAccountId && destinationAccountId !== accountId && (destination?.currency === source?.currency || normalizeDecimal(destinationAmount)))));
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Nueva operación</Text>
    <View style={styles.switch}>{(["expense", "income", "transfer"] as TransactionKind[]).map(value => <Pressable key={value} style={[styles.kind, kind === value && styles.selected]} onPress={() => setKind(value)}><Text style={kind === value ? styles.selectedText : undefined}>{value === "expense" ? "Gasto" : value === "income" ? "Ingreso" : "Transferencia"}</Text></Pressable>)}</View>
    <TextInput style={styles.input} placeholder="Importe" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
    {kind === "transfer" && destination?.currency !== source?.currency && <TextInput style={styles.input} placeholder={`Importe recibido (${destination?.currency ?? "destino"})`} keyboardType="decimal-pad" value={destinationAmount} onChangeText={setDestinationAmount} />}
    <TextInput style={styles.input} placeholder="Descripción" value={description} onChangeText={setDescription} />
    <Text style={styles.label}>Fecha contable</Text><Pressable style={styles.input} onPress={() => setShowDatePicker(true)}><Text>{formatDate(date)}</Text></Pressable>
    {showDatePicker && <DateTimePicker value={new Date(`${date}T12:00:00`)} mode="date" maximumDate={new Date()} onChange={(_, selected) => { setShowDatePicker(false); if (selected) setDate(localDateIso(selected)); }} />}
    <Text style={styles.label}>Cuenta de origen</Text>{accounts.data.map(item => <Button key={item.id} title={`${item.name} · ${item.currency}`} color={item.id === accountId ? "#2563eb" : "#64748b"} onPress={() => setAccountId(item.id)} />)}
    {kind === "transfer" && <><Text style={styles.label}>Cuenta de destino</Text>{accounts.data.filter(item => item.id !== accountId).map(item => <Button key={item.id} title={`${item.name} · ${item.currency}`} color={item.id === destinationAccountId ? "#2563eb" : "#64748b"} onPress={() => setDestinationAccountId(item.id)} />)}<Text style={styles.label}>Propósito</Text><View style={styles.switch}>{(["regular", "savings", "investment"] as TransferPurpose[]).map(value => <Button key={value} title={value} onPress={() => setPurpose(value)} color={purpose === value ? "#2563eb" : "#64748b"} />)}</View></>}
    {kind === "expense" && <><Text style={styles.label}>Categoría</Text>{categories.data.map(item => <Button key={item.id} title={item.name} color={item.id === categoryId ? "#2563eb" : "#64748b"} onPress={() => setCategoryId(item.id)} />)}</>}
    <Button title={mutation.isPending ? "Guardando…" : "Guardar"} disabled={!canSubmit || mutation.isPending} onPress={() => mutation.mutate()} />
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 20, gap: 12, backgroundColor: "#f8fafc" }, center: { flex: 1, justifyContent: "center", alignItems: "center" }, title: { fontSize: 26, fontWeight: "700" }, switch: { flexDirection: "row", justifyContent: "space-around", gap: 6 }, kind: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center", backgroundColor: "#e2e8f0" }, selected: { backgroundColor: "#2563eb" }, selectedText: { color: "white", fontWeight: "700" }, input: { backgroundColor: "white", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 13 }, label: { fontWeight: "600", marginTop: 8 } });
