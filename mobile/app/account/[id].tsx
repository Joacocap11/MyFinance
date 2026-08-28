import { useLocalSearchParams, Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import { formatDate, formatMoney } from "../../src/lib/format";

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const account = useQuery({ queryKey: ["account", id], queryFn: () => api.account(accountId) });
  const transactions = useQuery({ queryKey: ["transactions", 1, accountId], queryFn: () => api.transactions(1, accountId) });
  if (account.isPending) return <View style={styles.center}><Text>Cargando cuenta…</Text></View>;
  if (account.isError) return <View style={styles.center}><Text>No se pudo cargar la cuenta.</Text></View>;
  return <FlatList style={styles.page} contentContainerStyle={styles.content} data={transactions.data?.items ?? []} keyExtractor={item => String(item.id)} refreshControl={<RefreshControl refreshing={account.isRefetching || transactions.isRefetching} onRefresh={() => { void account.refetch(); void transactions.refetch(); }} />} ListHeaderComponent={<><Text style={styles.title}>{account.data.name}</Text><Text style={styles.currency}>{account.data.currency}</Text><Text style={styles.amount}>{formatMoney(account.data.current_balance, account.data.currency)}</Text><Text style={styles.muted}>Saldo calculado por el backend</Text><Text style={styles.heading}>Movimientos recientes</Text></>} renderItem={({ item }) => <Link href={{ pathname: "/movement/[id]", params: { id: item.id } }} asChild><Pressable style={styles.item}><View style={{ flex: 1 }}><Text>{item.description}</Text><Text style={styles.muted}>{formatDate(item.date)} · {item.is_voided ? "Anulado" : item.kind === "transfer" ? "Transferencia" : item.kind}</Text></View><Text>{formatMoney(item.amount, account.data.currency)}</Text></Pressable></Link>} ListEmptyComponent={<Text style={styles.muted}>No hay movimientos para esta cuenta.</Text>} />;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#f8fafc" }, content: { padding: 20, gap: 12 }, center: { flex: 1, justifyContent: "center", alignItems: "center" }, title: { fontSize: 26, fontWeight: "700" }, currency: { color: "#64748b" }, amount: { fontSize: 32, fontWeight: "700", marginVertical: 12 }, muted: { color: "#64748b" }, heading: { fontSize: 18, fontWeight: "700", marginTop: 12 }, item: { backgroundColor: "white", padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: "row", justifyContent: "space-between" } });
