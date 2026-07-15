import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type StyleProp,
  View,
  type ScrollViewProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { theme } from '@/lib/theme';

type ScreenProps = ScrollViewProps & {
  edges?: Edge[];
  scrollEnabled?: boolean;
  /** Pass to enable pull-to-refresh. */
  onRefresh?: () => void;
  refreshing?: boolean;
  safeAreaStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  contentContainerStyle,
  edges = [],
  scrollEnabled = true,
  onRefresh,
  refreshing = false,
  safeAreaStyle,
  ...props
}: ScreenProps) {
  return (
    <SafeAreaView style={[styles.safeArea, safeAreaStyle]} edges={edges}>
      <KeyboardAvoidingView
        style={styles.keyboardAware}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
              />
            ) : undefined
          }
          {...props}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Section({ style, ...props }: ViewProps) {
  return <View style={[styles.section, style]} {...props} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardAware: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  section: {
    gap: theme.spacing.md,
  },
});
