import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import { formatDate, formatMoney } from "../../src/lib/format";
export default function Movements() {
  const query = useQuery({ queryKey: ["transactions", 1], queryFn: () => api.transactions(1) });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  if (query.isPending) return <View style={styles.center}><Text>Cargando movimientos…</Text></View>;
  if (query.isError || accounts.isError) return <View style={styles.center}><Text>No se pudieron cargar los movimientos.</Text></View>;
  return <View style={styles.page}><Link href="/movement/new" asChild><Pressable style={styles.add}><Text style={styles.addText}>+ Nuevo movimiento</Text></Pressable></Link><FlatList data={query.data.items} keyExtractor={item => String(item.id)} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} />} ListEmptyComponent={<Text style={styles.empty}>Todavía no hay movimientos.</Text>} renderItem={({ item }) => <Link href={{ pathname: "/movement/[id]", params: { id: item.id } }} asChild><Pressable style={styles.item}><View style={{ flex: 1 }}><Text style={styles.title}>{item.description}</Text><Text style={styles.muted}>{formatDate(item.date)} · {item.is_voided ? "Anulado" : "Movimiento"}</Text></View><Text style={{ color: item.kind === "expense" ? "#b91c1c" : "#15803d" }}>{item.kind === "expense" ? "−" : "+"}{formatMoney(item.amount, accounts.data?.find(account => account.id === item.account_id)?.currency ?? "UYU")}</Text></Pressable></Link>} /></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, padding: 16, backgroundColor: "#f8fafc" }, center: { flex: 1, justifyContent: "center", alignItems: "center" }, add: { backgroundColor: "#2563eb", borderRadius: 10, padding: 14, marginBottom: 12 }, addText: { color: "white", textAlign: "center", fontWeight: "700" }, item: { backgroundColor: "white", padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: "row", alignItems: "center" }, title: { fontWeight: "700" }, muted: { color: "#64748b", marginTop: 4 }, empty: { textAlign: "center", color: "#64748b", marginTop: 32 } });
