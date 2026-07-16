import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/core/card';
import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { consultsApi } from '@/lib/api/consults';
import { mobileApi } from '@/lib/api/mobile';
import { ApiError } from '@/lib/api/client';
import { useActiveFarmSelection, useSetActiveFarmSelection } from '@/lib/hooks/use-active-farm';
import { theme } from '@/lib/theme';
import { toAbsoluteUrl } from '@/lib/utils/url';

export function FarmerConsultScreen() {
  const { consultId } = useLocalSearchParams<{ consultId: string }>();
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const activeFarm = useActiveFarmSelection();
  const setActiveFarm = useSetActiveFarmSelection();
  const cachedConsult = qc.getQueryData<import('@/lib/api/consults').ExpertConsult[]>(['farmer-consults'])
    ?.find((item) => item.id === consultId);
  const query = useQuery({
    queryKey: ['farmer-consult', consultId],
    queryFn: () => consultsApi.getFarmerConsult(consultId),
    enabled: Boolean(consultId),
    initialData: cachedConsult,
    refetchInterval: 15_000,
  });
  const farms = useQuery({ queryKey: ['consult-farms'], queryFn: mobileApi.listFarms });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['farmer-consult', consultId] });
    void qc.invalidateQueries({ queryKey: ['farmer-consults'] });
  };
  const send = useMutation({ mutationFn: () => consultsApi.sendMessage(consultId, message.trim()), onSuccess: () => { setMessage(''); refresh(); } });
  const accept = useMutation({ mutationFn: (proposalId: string) => consultsApi.acceptTaskProposal(consultId, proposalId), onSuccess: refresh });
  const resolve = useMutation({ mutationFn: () => consultsApi.resolve(consultId), onSuccess: refresh });
  if (query.isLoading) return <Screen><SkeletonCard /><SkeletonCard /></Screen>;
  const consult = query.data;
  if (!consult) {
    const status = query.error instanceof ApiError ? query.error.status : null;
    const message = status === 404
      ? 'This review is not available for the account currently signed in.'
      : status === 0 || status === 408
        ? 'You appear to be offline. Your review request is safe; reconnect and try again.'
        : 'We could not refresh this review right now. Your request has not been lost.';
    return (
      <Screen contentContainerStyle={s.content}>
        <Card>
          <View style={s.feedbackIcon}><Ionicons name="cloud-offline-outline" size={28} color={theme.colors.warning} /></View>
          <Text style={s.feedbackTitle}>Review status unavailable</Text>
          <Text style={s.feedbackBody}>{message}</Text>
          <Pressable style={s.primaryButton} onPress={() => void query.refetch()}><Text style={s.primaryButtonText}>Try again</Text></Pressable>
          <Pressable style={s.textButton} onPress={() => router.replace('/consults' as never)}><Text style={s.textButtonText}>Back to my reviews</Text></Pressable>
        </Card>
      </Screen>
    );
  }
  const image = consult.observation?.image_urls?.[0];
  const consultFarmName = farms.data?.find((farm) => String(farm.id) === String(consult.farm_id))?.name ?? 'this farm';
  const consultFarmIsActive = String(activeFarm.data) === String(consult.farm_id);
  const openFarmNotes = async () => {
    if (!consultFarmIsActive) {
      await setActiveFarm({ farmId: consult.farm_id, journeyId: consult.journey_id ?? null });
    }
    router.push('/(tabs)/logbook' as never);
  };
  return (
    <Screen onRefresh={query.refetch} refreshing={query.isRefetching} contentContainerStyle={s.content}>
      {query.isError ? (
        <View style={s.statusBanner}>
          <Ionicons name="information-circle-outline" size={19} color={theme.colors.warning} />
          <Text style={s.statusBannerText}>Showing the latest saved status. Pull down when connected to refresh messages and assessment.</Text>
        </View>
      ) : null}
      <View>
        <Text style={s.eyebrow}>{consult.status.replace('_', ' ').toUpperCase()}</Text>
        <Text style={s.title}>{consult.observation?.category?.replaceAll('_', ' ')}</Text>
        <Text style={s.muted}>{consult.advisor_name ? `Agronomist: ${consult.advisor_name}` : 'Waiting for a verified agronomist'}</Text>
      </View>
      <Card>
        <View style={s.farmLinkHead}>
          <Ionicons name="leaf-outline" size={21} color={theme.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{consultFarmName}</Text>
            <Text style={s.muted}>{consultFarmIsActive ? 'This is your active farm.' : 'This scan belongs to a different farm than the one currently active.'}</Text>
          </View>
        </View>
        <Pressable style={s.farmNotesButton} onPress={() => void openFarmNotes()}>
          <Text style={s.farmNotesButtonText}>{consultFarmIsActive ? 'Open farm Notes' : `Switch to ${consultFarmName} and open Notes`}</Text>
        </Pressable>
      </Card>
      {image ? <Image source={{ uri: toAbsoluteUrl(image) }} style={s.image} contentFit="cover" /> : null}
      {consult.assessment ? (
        <Card>
          <View style={s.assessmentHead}><Ionicons name="shield-checkmark" size={22} color={theme.colors.success} /><Text style={s.cardTitle}>Expert assessment</Text></View>
          <Text style={s.decision}>{consult.assessment.decision.replace('_', ' ')}</Text>
          <Text style={s.body}>{consult.assessment.reasoning}</Text>
          <Text style={s.muted}>Expert confidence {Math.round((consult.assessment.expert_confidence ?? 0) * 100)}% · Engine plan {consult.assessment.endorses_engine_plan ? 'endorsed' : 'not endorsed'}</Text>
        </Card>
      ) : <Card><Text style={s.body}>Your scan and journey context are ready for expert review.</Text></Card>}
      {(consult.task_proposals ?? []).map((proposal) => (
        <Card key={proposal.id}>
          <Text style={s.cardTitle}>Optional task proposed</Text>
          <Text style={s.body}>{proposal.title}</Text>
          {proposal.instructions.map((line, index) => <Text key={index} style={s.muted}>• {line}</Text>)}
          {proposal.status === 'proposed' ? (
            <Pressable style={s.primaryButton} disabled={accept.isPending} onPress={() => accept.mutate(proposal.id)}><Text style={s.primaryButtonText}>Accept and add to journey</Text></Pressable>
          ) : <Text style={s.accepted}>Added to your journey</Text>}
        </Card>
      ))}
      <Card>
        <Text style={s.cardTitle}>Conversation</Text>
        {(consult.messages ?? []).map((item) => <View key={item.id} style={s.message}><Text style={s.sender}>{item.sender_name ?? 'Participant'}</Text><Text style={s.body}>{item.content}</Text></View>)}
        {consult.status !== 'resolved' ? <><TextInput style={s.input} value={message} onChangeText={setMessage} placeholder="Reply to the agronomist…" placeholderTextColor={theme.colors.textMuted} multiline /><Pressable style={[s.primaryButton, !message.trim() && { opacity: 0.5 }]} disabled={!message.trim() || send.isPending} onPress={() => send.mutate()}><Text style={s.primaryButtonText}>Send message</Text></Pressable></> : null}
      </Card>
      {consult.assessment && consult.status !== 'resolved' ? (
        <Pressable style={s.resolveButton} disabled={resolve.isPending} onPress={() => resolve.mutate()}><Text style={s.resolveButtonText}>Mark review complete</Text></Pressable>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { gap: 14, paddingBottom: 40 }, eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', textTransform: 'capitalize', marginTop: 3 }, muted: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  image: { width: '100%', height: 240, borderRadius: theme.radius.lg, backgroundColor: theme.colors.border }, assessmentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800' }, decision: { color: theme.colors.success, fontWeight: '800', fontSize: 18, textTransform: 'capitalize' }, body: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  message: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }, sender: { color: theme.colors.primary, fontWeight: '800', fontSize: 11 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 11, minHeight: 54, color: theme.colors.text, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 6 }, primaryButtonText: { color: '#fff', fontWeight: '800' }, accepted: { color: theme.colors.success, fontWeight: '800' }, error: { color: theme.colors.danger },
  resolveButton: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center' }, resolveButtonText: { color: theme.colors.primary, fontWeight: '800' },
  farmLinkHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  farmNotesButton: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' },
  farmNotesButtonText: { color: theme.colors.primary, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  feedbackIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: theme.colors.warning + '18' },
  feedbackTitle: { color: theme.colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  feedbackBody: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  textButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' },
  statusBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.warning + '16', borderWidth: 1, borderColor: theme.colors.warning + '35' },
  statusBannerText: { flex: 1, color: theme.colors.text, fontSize: 12, lineHeight: 18 },
});
