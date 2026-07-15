import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Button } from '@/components/core/button';
import { decodeInstructions } from '@/lib/db/repositories';
import type { TaskRecord } from '@/lib/domain/types';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

export type CompletionProof = {
  note: string | null;
  photoUri: string | null;
  mimeType: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Bottom-sheet shown before a task is marked done. Light confirmation:
 * the farmer ticks the steps they actually did, can attach a photo/note as
 * proof, and is warned if the task isn't due yet — turning a random tap into
 * a deliberate, recorded action.
 */
export function TaskCompletionSheet({
  visible,
  task,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  task: TaskRecord | null;
  onConfirm: (proof: CompletionProof) => void;
  onCancel: () => void;
}) {
  const { t, localize } = useI18n();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');

  // Reset whenever a new task opens the sheet.
  useEffect(() => {
    setChecked(new Set());
    setNote('');
    setPhotoUri(null);
    setMimeType('image/jpeg');
  }, [task?.id]);

  if (!task) return null;

  const steps = decodeInstructions(task);
  const isEarly = Boolean(task.due_date && task.due_date > todayIso());
  const allStepsChecked = steps.length > 0 && checked.size >= steps.length;

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const addPhoto = async (mode: 'camera' | 'library') => {
    const perm =
      mode === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result =
      mode === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: true });
    if (result.canceled || !result.assets?.[0]) return;
    setPhotoUri(result.assets[0].uri);
    setMimeType(result.assets[0].mimeType ?? 'image/jpeg');
  };

  const confirm = () => {
    onConfirm({
      note: note.trim() ? note.trim() : null,
      photoUri,
      mimeType: photoUri ? mimeType : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>{localize(task.title)}</Text>
            <Text style={styles.subtitle}>{t('taskSheet.confirmWhatDid')}</Text>

            {isEarly ? (
              <View style={styles.warnBanner}>
                <Ionicons name="time-outline" size={16} color={theme.colors.warning} />
                <Text style={styles.warnText}>{t('taskSheet.notDueUntil', { date: task.due_date ?? '' })}</Text>
              </View>
            ) : null}

            {steps.length > 0 ? (
              <View style={styles.steps}>
                <Text style={styles.sectionLabel}>{t('taskSheet.steps')}</Text>
                {steps.map((step, i) => {
                  const on = checked.has(i);
                  return (
                    <TouchableOpacity
                      key={`${step}-${i}`}
                      style={styles.stepRow}
                      activeOpacity={0.7}
                      onPress={() => toggle(i)}
                    >
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={on ? theme.colors.primary : theme.colors.disabled}
                      />
                      <Text style={[styles.stepText, on && styles.stepTextOn]}>{step}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {/* Optional proof */}
            <Text style={styles.sectionLabel}>{t('taskSheet.addProof')}</Text>
            {photoUri ? (
              <View style={styles.photoWrap}>
                <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
                <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotoUri(null)}>
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => addPhoto('camera')} activeOpacity={0.8}>
                  <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.photoBtnText}>{t('taskSheet.photo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={() => addPhoto('library')} activeOpacity={0.8}>
                  <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.photoBtnText}>{t('taskSheet.gallery')}</Text>
                </TouchableOpacity>
              </View>
            )}

            <TextInput
              style={styles.note}
              placeholder={t('taskSheet.notePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </ScrollView>

          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button label={t('common.cancel')} variant="ghost" onPress={onCancel} />
            </View>
            <View style={{ flex: 1.4 }}>
              <Button
                label={t('taskSheet.confirmDone', { xp: task.xp_value ?? 10 })}
                onPress={confirm}
                accessibilityHint={allStepsChecked ? undefined : t('taskSheet.confirmHint')}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlay },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  scroll: { gap: theme.spacing.md, paddingBottom: theme.spacing.md },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text, textTransform: 'capitalize' },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18, marginTop: -4 },

  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.warning + '1c',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  warnText: { flex: 1, fontSize: 13, color: theme.colors.warning, fontWeight: '600' },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  steps: { gap: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  stepText: { flex: 1, fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  stepTextOn: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },

  photoRow: { flexDirection: 'row', gap: theme.spacing.md },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  photoWrap: { position: 'relative' },
  photo: { width: '100%', height: 160, borderRadius: theme.radius.md },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10,23,14,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  note: {
    minHeight: 64,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    fontSize: 15,
    color: theme.colors.text,
    textAlignVertical: 'top',
  },

  actions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.md },
});
