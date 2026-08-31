import type { ReactElement, ReactNode } from "react";
import { FlatList, type FlatListProps, KeyboardAvoidingView, Platform, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import type { RefreshControlProps } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { commonStyles, spacing } from "./theme";

type ScrollableScreenProps = { children: ReactNode; style?: StyleProp<ViewStyle>; contentContainerStyle?: StyleProp<ViewStyle>; keyboardShouldPersistTaps?: "always" | "never" | "handled"; refreshControl?: ReactElement<RefreshControlProps> };

export function ScrollableScreen({ children, style, contentContainerStyle, keyboardShouldPersistTaps = "handled", refreshControl }: ScrollableScreenProps) {
  const insets = useSafeAreaInsets();
  return <SafeAreaView style={commonStyles.page} edges={["top"]}><KeyboardAvoidingView style={commonStyles.page} behavior={Platform.OS === "ios" ? "padding" : "height"}><ScrollView style={style} contentContainerStyle={[styles.content, contentContainerStyle, { paddingBottom: spacing.xxl + insets.bottom }]} keyboardShouldPersistTaps={keyboardShouldPersistTaps} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} refreshControl={refreshControl}>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export function SafeAreaFlatList<T>({ contentContainerStyle, ...props }: FlatListProps<T>) {
  const insets = useSafeAreaInsets();
  return <SafeAreaView style={commonStyles.page} edges={["top"]}><FlatList {...props} contentContainerStyle={[contentContainerStyle, { paddingBottom: spacing.xxl + insets.bottom }]} /></SafeAreaView>;
}

export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView style={commonStyles.page} edges={["top", "bottom"]}><View style={commonStyles.page}>{children}</View></SafeAreaView>;
}

export function useSafeAreaContentStyle(basePadding = spacing.xxl): ViewStyle {
  const insets = useSafeAreaInsets();
  return { paddingBottom: basePadding + insets.bottom };
}

const styles = StyleSheet.create({ content: { flexGrow: 1 } });