import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../src/api/client";
import { formatMoney } from "../src/lib/format";
import { ScreenMessage, PrimaryButton } from "../src/ui/components";
import { colors, commonStyles, spacing, typography } from "../src/ui/theme";
import { ScrollableScreen } from "../src/ui/Screen";
export default function Recurring() {
 const client=useQueryClient(); const query=useQuery({queryKey:["recurring"],queryFn:api.recurring}); const accounts=useQuery({queryKey:["accounts"],queryFn:api.accounts});
 const toggle=useMutation({mutationFn:(item:{id:number;is_active:boolean})=>api.updateRecurring(item.id,{is_active:!item.is_active}),onSuccess:()=>client.invalidateQueries({queryKey:["recurring"]}),onError:e=>Alert.alert("No se pudo actualizar",e instanceof ApiError?e.message:"Revisá los datos.")});
 if(query.isPending||accounts.isPending)return <ScreenMessage title="Cargando recurrentes"/>; if(query.isError||accounts.isError||!query.data||!accounts.data)return <ScreenMessage title="No se pudieron cargar los recurrentes"/>;
 return <ScrollableScreen style={commonStyles.page} contentContainerStyle={styles.content}><Text style={typography.title}>Recurrentes</Text><Text style={typography.muted}>Reglas existentes; la ejecución sigue siendo responsabilidad del backend.</Text><PrimaryButton label="Crear desde Web" icon="open-outline" onPress={()=>Alert.alert("Creación no disponible", "Este contrato móvil permite administrar reglas existentes. Creá una nueva desde Web.")}/>{query.data.length===0?<Text style={typography.muted}>No hay gastos recurrentes configurados.</Text>:query.data.map(item=>{const account=accounts.data.find(x=>x.id===item.account_id);return <View style={commonStyles.card} key={item.id}><Text style={typography.heading}>{item.description}</Text><Text style={styles.detail}>{formatMoney(item.amount,account?.currency??"UYU")} · día {item.day_of_month}</Text><Text style={styles.detail}>{account?.name??"Cuenta"} · {item.is_active?"Activa":"Pausada"}</Text><Pressable onPress={()=>toggle.mutate(item)}><Text style={styles.action}>{item.is_active?"Desactivar":"Activar"}</Text></Pressable></View>})}</ScrollableScreen>;
}
const styles=StyleSheet.create({content:{...commonStyles.content,paddingBottom:spacing.xxl},detail:{...typography.muted,marginTop:spacing.sm},action:{color:colors.primary,fontWeight:"800",marginTop:spacing.md}});