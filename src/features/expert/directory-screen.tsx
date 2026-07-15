import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { consultsApi } from '@/lib/api/consults';
import { theme } from '@/lib/theme';

export function AdvisorDirectoryScreen() {
  const query = useQuery({ queryKey: ['verified-advisors'], queryFn: () => consultsApi.listAdvisors() });

  return (
    <Screen contentContainerStyle={s.content} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={s.intro}>
        <Text style={s.title}>Verified agronomists</Text>
        <Text style={s.subtitle}>Choose who should review your next crop scan. Advice remains separate from supplier offers.</Text>
      </View>
      {query.isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      {query.isError ? <Text style={s.message}>Agronomists could not be loaded. Pull down to retry.</Text> : null}
      {!query.isLoading && !query.data?.length ? (
        <View style={s.empty}>
          <Ionicons name="people-outline" size={30} color={theme.colors.textMuted} />
          <Text style={s.emptyTitle}>No verified experts available</Text>
          <Text style={s.message}>You can still scan a crop and queue it for the next available agronomist.</Text>
          <TouchableOpacity style={s.primaryButton} onPress={() => router.push('/scan')}><Text style={s.primaryButtonText}>Scan crop</Text></TouchableOpacity>
        </View>
      ) : null}
      {(query.data ?? []).map((advisor) => (
        <View key={advisor.id} style={s.card}>
          <View style={s.cardHead}>
            <View style={s.avatar}><Text style={s.avatarText}>{(advisor.display_name || 'A').slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={s.nameRow}><Text style={s.name}>{advisor.display_name || 'Agronomist'}</Text><Ionicons name="checkmark-circle" size={17} color={theme.colors.primary} /></View>
              <Text style={s.role}>{advisor.professional_title || 'Crop agronomist'}</Text>
            </View>
            <View style={s.status}><View style={s.statusDot} /><Text style={s.statusText}>{advisor.availability_status === 'available' ? 'Available' : advisor.availability_status}</Text></View>
          </View>
          {advisor.bio ? <Text style={s.bio} numberOfLines={3}>{advisor.bio}</Text> : null}
          <View style={s.metaRow}>
            {advisor.average_rating ? <Text style={s.meta}>★ {advisor.average_rating.toFixed(1)}</Text> : null}
            <Text style={s.meta}>{advisor.consultations_completed} reviews</Text>
            {advisor.years_experience ? <Text style={s.meta}>{advisor.years_experience} yrs experience</Text> : null}
          </View>
          {advisor.crop_specialties?.length ? <Text style={s.specialties}>{advisor.crop_specialties.slice(0, 4).join(' · ')}</Text> : null}
          <TouchableOpacity
            style={s.primaryButton}
            onPress={() => router.push({ pathname: '/scan', params: { advisorId: advisor.user_id, advisorName: advisor.display_name || 'Agronomist' } })}
          >
            <Ionicons name="scan-outline" size={17} color="#fff" />
            <Text style={s.primaryButtonText}>Choose for crop review</Text>
          </TouchableOpacity>
        </View>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 28, gap: 14 },
  intro: { gap: 5 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  card: { gap: 12, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary + '14' },
  avatarText: { fontSize: 18, fontWeight: '800', color: theme.colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  role: { marginTop: 2, fontSize: 12, color: theme.colors.textMuted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.success },
  statusText: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  bio: { fontSize: 13, lineHeight: 19, color: theme.colors.text },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  meta: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  specialties: { fontSize: 12, color: theme.colors.primary },
  primaryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 14, backgroundColor: theme.colors.primary },
  primaryButtonText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  empty: { alignItems: 'center', gap: 10, padding: 24, borderRadius: 20, backgroundColor: theme.colors.surface },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  message: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted, textAlign: 'center' },
});
