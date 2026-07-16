import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/core/card';
import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { consultsApi, type ExpertAssessment } from '@/lib/api/consults';
import { ApiError } from '@/lib/api/client';
import { theme } from '@/lib/theme';
import { toAbsoluteUrl } from '@/lib/utils/url';

const decisions: { value: ExpertAssessment['decision']; label: string }[] = [
  { value: 'confirmed', label: 'Confirm diagnosis' },
  { value: 'disagreed', label: 'Disagree' },
  { value: 'inconclusive', label: 'Need more evidence' },
  { value: 'healthy', label: 'Healthy / no issue' },
];

export function ExpertCaseScreen() {
  const { consultId } = useLocalSearchParams<{ consultId: string }>();
  const qc = useQueryClient();
  const cachedConsult = qc.getQueryData<import('@/lib/api/consults').ExpertConsult[]>(['expert-consults'])
    ?.find((item) => item.id === consultId);
  const query = useQuery({
    queryKey: ['expert-consult', consultId],
    queryFn: () => consultsApi.getExpertConsult(consultId),
    enabled: Boolean(consultId),
    initialData: cachedConsult,
    refetchInterval: 15_000,
  });
  const [message, setMessage] = useState('');
  const [decision, setDecision] = useState<ExpertAssessment['decision']>('confirmed');
  const [reasoning, setReasoning] = useState('');
  const [confidence, setConfidence] = useState('80');
  const [endorses, setEndorses] = useState(true);
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalInstructions, setProposalInstructions] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['expert-consult', consultId] });
    void qc.invalidateQueries({ queryKey: ['expert-consults'] });
  };
  const accept = useMutation({ mutationFn: () => consultsApi.accept(consultId), onSuccess: refresh });
  const send = useMutation({
    mutationFn: () => consultsApi.sendMessage(consultId, message.trim()),
    onSuccess: () => { setMessage(''); refresh(); },
  });
  const assess = useMutation({
    mutationFn: () => consultsApi.submitAssessment(consultId, {
      decision,
      expert_confidence: Math.max(0, Math.min(100, Number(confidence))) / 100,
      reasoning: reasoning.trim(),
      endorses_engine_plan: endorses,
    }),
    onSuccess: refresh,
  });
  const propose = useMutation({
    mutationFn: () => consultsApi.createTaskProposal(consultId, {
      title: proposalTitle.trim(),
      instructions: proposalInstructions.split('\n').map((line) => line.trim()).filter(Boolean),
    }),
    onSuccess: () => { setProposalTitle(''); setProposalInstructions(''); refresh(); },
  });

  if (query.isLoading) return <Screen><SkeletonCard /><SkeletonCard /></Screen>;
  const consult = query.data;
  if (!consult) {
    const status = query.error instanceof ApiError ? query.error.status : null;
    const message = status === 403
      ? 'This case is assigned to another agronomist.'
      : status === 404
        ? 'This consultation is no longer available in your expert inbox.'
        : status === 0 || status === 408
          ? 'You appear to be offline. Reconnect to load the farmer’s scan and messages.'
          : 'The case could not be refreshed. Return to the inbox and try again.';
    return (
      <Screen contentContainerStyle={s.content}>
        <Card>
          <View style={s.feedbackIcon}><Ionicons name="alert-circle-outline" size={28} color={theme.colors.warning} /></View>
          <Text style={s.feedbackTitle}>Case status unavailable</Text>
          <Text style={s.feedbackBody}>{message}</Text>
          <Pressable style={s.primaryButton} onPress={() => void query.refetch()}><Text style={s.primaryButtonText}>Try again</Text></Pressable>
          <Pressable style={s.textButton} onPress={() => router.replace('/(expert)' as never)}><Text style={s.textButtonText}>Back to consultation inbox</Text></Pressable>
        </Card>
      </Screen>
    );
  }
  const analysis = consult.observation?.analysis ?? {};
  const image = consult.observation?.image_urls?.[0];
  const canAccept = !query.isError && (consult.status === 'queued' || consult.status === 'assigned');
  const canWork = !query.isError && ['accepted', 'in_review', 'awaiting_farmer'].includes(consult.status);

  return (
    <Screen onRefresh={query.refetch} refreshing={query.isRefetching} contentContainerStyle={s.content}>
      {query.isError ? (
        <View style={s.statusBanner}>
          <Ionicons name="information-circle-outline" size={19} color={theme.colors.warning} />
          <Text style={s.statusBannerText}>Showing the last saved case status. Reconnect before accepting, messaging, or assessing.</Text>
        </View>
      ) : null}
      <View style={s.headingRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>{consult.priority === 'urgent' ? 'URGENT REVIEW' : 'CROP REVIEW'}</Text>
          <Text style={s.title}>{consult.observation?.category?.replaceAll('_', ' ')}</Text>
          <Text style={s.muted}>{consult.farmer_name} · {consult.language.toUpperCase()}</Text>
        </View>
        <View style={s.confidence}><Text style={s.confidenceValue}>{Math.round((consult.ai_confidence ?? 0) * 100)}%</Text><Text style={s.confidenceLabel}>AI confidence</Text></View>
      </View>

      {image ? <Image source={{ uri: toAbsoluteUrl(image) }} style={s.scanImage} contentFit="cover" /> : null}

      <Card>
        <Text style={s.cardTitle}>Ecofy scan evidence</Text>
        <Text style={s.body}>{String(analysis.description ?? consult.observation?.description ?? '')}</Text>
        <View style={s.divider} />
        <Text style={s.fieldLabel}>Engine recommendation</Text>
        <Text style={s.body}>{Array.isArray(analysis.recommended_actions)
          ? analysis.recommended_actions.map((a) => typeof a === 'object' && a ? String((a as Record<string, unknown>).action_en ?? '') : '').filter(Boolean).join('\n')
          : 'No structured recommendation available.'}</Text>
      </Card>

      {canAccept ? (
        <Pressable style={s.primaryButton} disabled={accept.isPending} onPress={() => accept.mutate()}>
          <Text style={s.primaryButtonText}>{accept.isPending ? 'Accepting…' : 'Accept this consultation'}</Text>
        </Pressable>
      ) : null}

      {canWork ? (
        <>
          <Card>
            <Text style={s.cardTitle}>Conversation</Text>
            {(consult.messages ?? []).length === 0 ? <Text style={s.muted}>No messages yet.</Text> : consult.messages?.map((item) => (
              <View key={item.id} style={s.message}>
                <Text style={s.messageSender}>{item.sender_name ?? 'Participant'}</Text>
                <Text style={s.body}>{item.content}</Text>
              </View>
            ))}
            <TextInput style={s.input} value={message} onChangeText={setMessage} placeholder="Ask the farmer a question…" placeholderTextColor={theme.colors.textMuted} multiline />
            <Pressable style={[s.outlineButton, (!message.trim() || send.isPending) && s.disabled]} disabled={!message.trim() || send.isPending} onPress={() => send.mutate()}>
              <Ionicons name="send-outline" size={16} color={theme.colors.primary} /><Text style={s.outlineButtonText}>Send message</Text>
            </Pressable>
          </Card>

          <Card>
            <Text style={s.cardTitle}>Structured assessment</Text>
            <View style={s.chips}>
              {decisions.map((item) => (
                <Pressable key={item.value} onPress={() => setDecision(item.value)} style={[s.chip, decision === item.value && s.chipActive]}>
                  <Text style={[s.chipText, decision === item.value && s.chipTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.fieldLabel}>Expert confidence (%)</Text>
            <TextInput style={s.input} value={confidence} onChangeText={setConfidence} keyboardType="number-pad" />
            <Text style={s.fieldLabel}>Reasoning</Text>
            <TextInput style={[s.input, s.reasoning]} value={reasoning} onChangeText={setReasoning} placeholder="Explain what you observed and what the farmer should do." placeholderTextColor={theme.colors.textMuted} multiline />
            <Pressable style={s.checkRow} onPress={() => setEndorses((v) => !v)}>
              <Ionicons name={endorses ? 'checkbox' : 'square-outline'} size={22} color={theme.colors.primary} />
              <Text style={s.body}>I endorse the current engine plan</Text>
            </Pressable>
            <Pressable style={[s.primaryButton, (!reasoning.trim() || assess.isPending) && s.disabled]} disabled={!reasoning.trim() || assess.isPending} onPress={() => assess.mutate()}>
              <Text style={s.primaryButtonText}>{assess.isPending ? 'Submitting…' : 'Submit assessment'}</Text>
            </Pressable>
            {assess.error ? <Text style={s.error}>{assess.error.message}</Text> : null}
          </Card>

          <Card>
            <Text style={s.cardTitle}>Optional task proposal</Text>
            <Text style={s.muted}>The farmer must accept this before it changes their journey.</Text>
            <TextInput style={s.input} value={proposalTitle} onChangeText={setProposalTitle} placeholder="Task title" placeholderTextColor={theme.colors.textMuted} />
            <TextInput style={[s.input, s.reasoning]} value={proposalInstructions} onChangeText={setProposalInstructions} placeholder="Instructions, one step per line" placeholderTextColor={theme.colors.textMuted} multiline />
            <Pressable style={[s.outlineButton, (!proposalTitle.trim() || propose.isPending) && s.disabled]} disabled={!proposalTitle.trim() || propose.isPending} onPress={() => propose.mutate()}>
              <Ionicons name="add-circle-outline" size={17} color={theme.colors.primary} /><Text style={s.outlineButtonText}>Send task proposal</Text>
            </Pressable>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { gap: 14, paddingBottom: 50 },
  headingRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', textTransform: 'capitalize', marginTop: 3 },
  muted: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  confidence: { alignItems: 'center', padding: 9, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary + '13' },
  confidenceValue: { color: theme.colors.primary, fontSize: 20, fontWeight: '800' },
  confidenceLabel: { color: theme.colors.textMuted, fontSize: 9 },
  scanImage: { width: '100%', height: 260, borderRadius: theme.radius.lg, backgroundColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  body: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  fieldLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: 12 },
  message: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  messageSender: { color: theme.colors.primary, fontWeight: '800', fontSize: 11, marginBottom: 2 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, color: theme.colors.text, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, minHeight: 44 },
  reasoning: { minHeight: 100, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  primaryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  outlineButton: { marginTop: 10, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  outlineButtonText: { color: theme.colors.primary, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  error: { color: theme.colors.danger, marginTop: 8 },
  feedbackIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: theme.colors.warning + '18' },
  feedbackTitle: { color: theme.colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  feedbackBody: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  textButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' },
  statusBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.warning + '16', borderWidth: 1, borderColor: theme.colors.warning + '35' },
  statusBannerText: { flex: 1, color: theme.colors.text, fontSize: 12, lineHeight: 18 },
});
