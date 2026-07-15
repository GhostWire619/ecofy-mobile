import Ionicons from '@expo/vector-icons/Ionicons';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/state/empty-state';
import { Screen } from '@/components/layout/screen';
import type { LogRecord } from '@/lib/domain/types';
import { toAbsoluteUrl } from '@/lib/utils/url';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

type NoteImage = { url: string; thumbnail_url?: string | null; caption?: string | null };
type Note = LogRecord & { farmName?: string; images?: NoteImage[] };

function fmtDateTime(value?: string | null) {
  if (!value) return '';
  try {
    const d = parseISO(value);
    return `${format(d, 'EEEE, MMM d')} · ${format(d, 'h:mm')}${format(d, 'a').toLowerCase()}`;
  } catch {
    return value ?? '';
  }
}

export function NoteDetailScreen() {
  const { t } = useI18n();
  const { payload } = useLocalSearchParams<{ payload?: string }>();

  const note = useMemo<Note | null>(() => {
    if (!payload) return null;
    try {
      return JSON.parse(payload) as Note;
    } catch {
      return null;
    }
  }, [payload]);

  if (!note) {
    return (
      <Screen>
        <EmptyState title={t('logbook.noteNotFound')} description={t('logbook.noteNotFoundDesc')} />
      </Screen>
    );
  }

  const images = note.images ?? [];

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={styles.date}>{fmtDateTime(note.updated_at || note.date)}</Text>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Ionicons name="leaf-outline" size={13} color={theme.colors.primary} />
            <Text style={styles.badgeText}>{note.operation_type}</Text>
          </View>
          {note.farmName ? <Text style={styles.farm}>· {note.farmName}</Text> : null}
        </View>
      </View>

      {images.length > 0 ? (
        <ScrollView
          horizontal={images.length > 1}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={images.length > 1 ? styles.imageRow : undefined}
        >
          {images.map((img, i) => (
            <Image
              key={`${img.url}-${i}`}
              source={{ uri: toAbsoluteUrl(img.url) }}
              style={images.length > 1 ? styles.imageMulti : styles.imageSingle}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      ) : null}

      {note.notes?.trim() ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('logbook.noteLabel')}</Text>
          <Text style={styles.body}>{note.notes}</Text>
        </View>
      ) : null}

      {note.cost != null ? (
        <View style={styles.costRow}>
          <Ionicons name="cash-outline" size={18} color={theme.colors.primaryDark} />
          <Text style={styles.costText}>{Number(note.cost).toLocaleString()} TZS</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.lg },
  head: { gap: 8 },
  date: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceMuted,
  },
  badgeText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary, textTransform: 'capitalize' },
  farm: { fontSize: 13, color: theme.colors.textMuted },

  imageRow: { gap: theme.spacing.md, paddingRight: theme.spacing.lg },
  imageSingle: { width: '100%', height: 260, borderRadius: theme.radius.lg, backgroundColor: theme.colors.border },
  imageMulti: { width: 260, height: 260, borderRadius: theme.radius.lg, backgroundColor: theme.colors.border },

  section: { gap: 6 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  body: { fontSize: 16, lineHeight: 24, color: theme.colors.text },

  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.accent + '22',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  costText: { fontSize: 15, fontWeight: '800', color: theme.colors.primaryDark },
});
