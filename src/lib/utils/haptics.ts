import * as Haptics from 'expo-haptics';

/** Light tap feedback for primary actions. Never throws (some devices lack a motor). */
export function tapHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Success feedback (e.g. a task confirmed). */
export function successHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
