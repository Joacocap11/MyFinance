import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import { formatMoney } from "../../src/lib/format";

export default function Accounts() {
  const query = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  if (query.isPending) return <View style={styles.center}><Text>Cargando cuentas…</Text></View>;
  if (query.isError) return <View style={styles.center}><Text>No se pudieron cargar las cuentas.</Text></View>;
  return <FlatList style={styles.page} contentContainerStyle={{ padding: 16 }} data={query.data} keyExtractor={item => String(item.id)} renderItem={({ item }) => <Link href={{ pathname: "/account/[id]", params: { id: item.id } }} asChild><Pressable style={styles.item}><View><Text style={styles.title}>{item.name}</Text><Text style={styles.muted}>{item.currency}</Text></View><Text style={styles.amount}>{formatMoney(item.current_balance, item.currency)}</Text></Pressable></Link>} ListEmptyComponent={<Text>No hay cuentas configuradas.</Text>} />;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#f8fafc" }, center: { flex: 1, justifyContent: "center", alignItems: "center" }, item: { backgroundColor: "white", padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: "row", justifyContent: "space-between" }, title: { fontSize: 16, fontWeight: "700" }, muted: { color: "#64748b", marginTop: 4 }, amount: { fontWeight: "700" } });
