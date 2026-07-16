import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/core/card';
import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { consultsApi } from '@/lib/api/consults';
import { mobileApi } from '@/lib/api/mobile';
import { theme } from '@/lib/theme';

const statusCopy: Record<string, string> = {
  queued: 'Waiting for an agronomist',
  assigned: 'Agronomist assigned',
  accepted: 'Agronomist accepted',
  in_review: 'Being reviewed',
  awaiting_farmer: 'Agronomist replied',
  resolved: 'Review complete',
  cancelled: 'Cancelled',
};

export function FarmerConsultInboxScreen() {
  const query = useQuery({
    queryKey: ['farmer-consults'],
    queryFn: consultsApi.listFarmerConsults,
    refetchInterval: 20_000,
  });
  const farms = useQuery({ queryKey: ['consult-farms'], queryFn: mobileApi.listFarms });
  const farmNames = new Map((farms.data ?? []).map((farm) => [String(farm.id), farm.name ?? 'Farm']));
  const rows = [...(query.data ?? [])].sort(
    (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
  );

  return (
    <Screen contentContainerStyle={s.content} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={s.intro}>
        <Text style={s.title}>My expert reviews</Text>
        <Text style={s.subtitle}>Open a review to read the agronomist’s assessment, reply, and accept any optional task they propose.</Text>
      </View>
      {query.isLoading ? <><SkeletonCard /><SkeletonCard /></> : null}
      {query.isError ? <Card><Text style={s.error}>Reviews could not be loaded. Pull down to retry.</Text></Card> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <Card style={s.empty}>
          <Ionicons name="chatbubbles-outline" size={30} color={theme.colors.textMuted} />
          <Text style={s.emptyTitle}>No expert reviews yet</Text>
          <Text style={s.subtitle}>Scan a crop, then choose “Send for expert review.” It will appear here.</Text>
          <Pressable style={s.primaryButton} onPress={() => router.push('/scan')}>
            <Ionicons name="scan-outline" size={17} color="#fff" />
            <Text style={s.primaryButtonText}>Scan crop</Text>
          </Pressable>
        </Card>
      ) : null}
      {rows.map((consult) => {
        const hasReply = consult.status === 'awaiting_farmer' || Boolean(consult.assessment);
        return (
          <Pressable key={consult.id} onPress={() => router.push(`/consults/${consult.id}` as never)}>
            <Card style={s.card}>
              <View style={s.cardTop}>
                <View style={[s.icon, hasReply && s.iconReply]}>
                  <Ionicons name={hasReply ? 'chatbubble-ellipses' : 'time-outline'} size={20} color={hasReply ? theme.colors.success : theme.colors.primary} />
                </View>
                <View style={s.cardBody}>
                  <Text style={s.cardTitle} numberOfLines={1}>{consult.observation?.category?.replaceAll('_', ' ') || 'Crop scan review'}</Text>
                  <Text style={[s.status, hasReply && s.statusReply]}>{statusCopy[consult.status] ?? consult.status.replaceAll('_', ' ')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </View>
              <Text style={s.meta} numberOfLines={1}>{farmNames.get(String(consult.farm_id)) ?? 'Farm'} · {consult.advisor_name || 'Verified agronomist'} · {new Date(consult.requested_at).toLocaleDateString()}</Text>
              {hasReply ? <Text style={s.replyHint}>New advice is ready — tap to read and reply.</Text> : null}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { gap: 14, paddingTop: 10, paddingBottom: 36 },
  intro: { gap: 5 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: theme.colors.danger, fontSize: 13 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '800' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: theme.colors.primary, borderRadius: 14, minHeight: 44, paddingHorizontal: 18 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: { gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary + '14' },
  iconReply: { backgroundColor: theme.colors.success + '16' },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  status: { color: theme.colors.primary, fontSize: 12, fontWeight: '700' },
  statusReply: { color: theme.colors.success },
  meta: { color: theme.colors.textMuted, fontSize: 12 },
  replyHint: { color: theme.colors.success, fontSize: 12, fontWeight: '700' },
});
