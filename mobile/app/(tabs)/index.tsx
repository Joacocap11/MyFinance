import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import { currentMonth, formatDate, formatMoney } from "../../src/lib/format";

export default function Dashboard() {
  const report = useQuery({ queryKey: ["dashboard", currentMonth(), "UYU"], queryFn: () => api.dashboard(currentMonth(), "UYU") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  if (report.isPending || accounts.isPending) return <View style={styles.center}><Text>Cargando resumen…</Text></View>;
  if (report.isError || accounts.isError) return <View style={styles.center}><Text>No se pudo cargar el resumen. Deslizá para reintentar.</Text></View>;
  const data = report.data;
  return <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={report.isRefetching || accounts.isRefetching} onRefresh={() => { void report.refetch(); void accounts.refetch(); }} />}>
    <Text style={styles.greeting}>Resumen de {data.month}</Text>
    <View style={styles.summary}><Text style={styles.label}>Resultado del mes</Text><Text style={[styles.amount, { color: Number(data.net) >= 0 ? "#15803d" : "#b91c1c" }]}>{formatMoney(data.net, data.currency)}</Text><View style={styles.metricRow}><View><Text style={styles.label}>Ingresos</Text><Text style={styles.metric}>{formatMoney(data.income, data.currency)}</Text></View><View><Text style={styles.label}>Gastos</Text><Text style={styles.metric}>{formatMoney(data.expenses, data.currency)}</Text></View></View></View>
    <Text style={styles.heading}>Cuentas</Text>{accounts.data.map(account => <Link key={account.id} href={{ pathname: "/account/[id]", params: { id: account.id } }} asChild><Pressable style={styles.item}><Text style={styles.itemTitle}>{account.name}{"\n"}<Text style={styles.muted}>{account.currency}</Text></Text><Text>{formatMoney(account.current_balance, account.currency)}</Text></Pressable></Link>)}
    <Text style={styles.heading}>Últimos movimientos</Text>{data.recent_transactions.slice(0, 5).map(transaction => <Link key={transaction.id} href={{ pathname: "/movement/[id]", params: { id: transaction.id } }} asChild><Pressable style={styles.item}><View style={{ flex: 1 }}><Text style={styles.itemTitle}>{transaction.description}</Text><Text style={styles.muted}>{formatDate(transaction.date)}</Text></View><Text>{formatMoney(transaction.amount, data.currency)}</Text></Pressable></Link>)}
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 16, gap: 10, backgroundColor: "#f8fafc" }, center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }, greeting: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 4 }, summary: { padding: 16, borderRadius: 16, backgroundColor: "white", gap: 8, elevation: 1 }, label: { color: "#64748b" }, amount: { fontSize: 30, fontWeight: "700" }, metricRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 }, metric: { fontSize: 16, fontWeight: "600", marginTop: 2 }, heading: { marginTop: 10, fontSize: 18, fontWeight: "700" }, item: { backgroundColor: "white", padding: 14, borderRadius: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, itemTitle: { fontWeight: "600", flex: 1 }, muted: { color: "#64748b", fontWeight: "400" } });
