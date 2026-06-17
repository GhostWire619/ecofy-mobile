import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/lib/theme';

/**
 * A bottom snackbar with an Undo action. Visibility + auto-dismiss are owned by
 * the caller (so the timer can be cancelled when Undo is tapped).
 */
export function UndoToast({
  visible,
  message,
  onUndo,
}: {
  visible: boolean;
  message: string;
  onUndo: () => void;
}) {
  if (!visible) return null;
  return (
    <SafeAreaView edges={['bottom']} pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.toast}>
        <Ionicons name="checkmark-circle" size={18} color={theme.colors.accent} />
        <Text style={styles.message} numberOfLines={1}>
          {message}
        </Text>
        <TouchableOpacity onPress={onUndo} hitSlop={10} accessibilityRole="button">
          <Text style={styles.undo}>UNDO</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryDark,
    ...(theme.shadow as object),
  },
  message: { color: '#fff', fontWeight: '700', fontSize: 14 },
  undo: { color: theme.colors.accent, fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});
