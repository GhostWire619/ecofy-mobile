import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';

import { Card } from '@/components/core/card';
import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { consultsApi } from '@/lib/api/consults';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/provider';
import { theme } from '@/lib/theme';

const statusLabel: Record<string, string> = {
  queued: 'Available', assigned: 'Assigned', accepted: 'Accepted', in_review: 'In review',
  awaiting_farmer: 'Waiting for farmer', resolved: 'Resolved', cancelled: 'Cancelled',
};

export function ExpertInboxScreen() {
  const qc = useQueryClient();
  const { user, logout } = useAuth();
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [specialties, setSpecialties] = useState('');
  const profile = useQuery({ queryKey: ['advisor-profile'], queryFn: consultsApi.getAdvisorProfile });
  const consults = useQuery({
    queryKey: ['expert-consults'],
    queryFn: consultsApi.listExpertConsults,
    enabled: profile.data?.verification_status === 'verified',
    refetchInterval: 20_000,
  });
  const submit = useMutation({
    mutationFn: async () => {
      await consultsApi.updateAdvisorProfile({
        professional_title: professionalTitle.trim() || undefined,
        crop_specialties: specialties.split(',').map((item) => item.trim()).filter(Boolean),
        ...(licenseNumber.trim() ? { license_number: licenseNumber.trim() } : {}),
      });
      return consultsApi.submitVerification();
    },
    onSuccess: (data) => qc.setQueryData(['advisor-profile'], data),
  });

  if (profile.isLoading) {
    return <Screen><SkeletonCard /><SkeletonCard /></Screen>;
  }

  if (!profile.data) {
    const status = profile.error instanceof ApiError ? profile.error.status : null;
    const message = status === 403
      ? 'This account is not currently recognized as an agronomist. Sign in with the verified expert account or ask an administrator to enable the agronomist role.'
      : status === 0 || status === 408
        ? 'You appear to be offline. Reconnect to load your expert profile and consultations.'
        : 'Your expert profile could not be refreshed right now.';
    return (
      <Screen contentContainerStyle={s.content}>
        <Card>
          <View style={s.inboxFeedbackHead}><Ionicons name="alert-circle-outline" size={22} color={theme.colors.warning} /><Text style={s.sectionTitle}>Expert workspace unavailable</Text></View>
          <Text style={s.copy}>{message}</Text>
          <Pressable style={s.primaryButton} onPress={() => void profile.refetch()}><Text style={s.primaryButtonText}>Try again</Text></Pressable>
        </Card>
      </Screen>
    );
  }

  if (profile.data.verification_status !== 'verified') {
    const canSubmit = ['draft', 'rejected'].includes(profile.data.verification_status);
    return (
      <Screen contentContainerStyle={s.content}>
        <View style={s.heroIcon}><Ionicons name="shield-checkmark-outline" size={34} color={theme.colors.primary} /></View>
        <Text style={s.title}>Expert verification</Text>
        <Text style={s.copy}>
          Your agronomist workspace opens after Ecofy verifies your professional details.
        </Text>
        <Card>
          <Text style={s.eyebrow}>CURRENT STATUS</Text>
          <Text style={s.status}>{profile.data.verification_status.replace('_', ' ')}</Text>
          <Text style={s.copySmall}>Signed in as {user?.full_name}</Text>
        </Card>
        {canSubmit ? (
          <Card>
            <Text style={s.sectionTitle}>Professional details</Text>
            <TextInput style={s.input} value={professionalTitle} onChangeText={setProfessionalTitle} placeholder="Professional title" placeholderTextColor={theme.colors.textMuted} />
            <TextInput style={s.input} value={licenseNumber} onChangeText={setLicenseNumber} placeholder="License or registration number" placeholderTextColor={theme.colors.textMuted} />
            <TextInput style={s.input} value={specialties} onChangeText={setSpecialties} placeholder="Crop specialties, separated by commas" placeholderTextColor={theme.colors.textMuted} />
            <Pressable style={[s.primaryButton, !professionalTitle.trim() && { opacity: 0.5 }]} disabled={!professionalTitle.trim() || submit.isPending} onPress={() => submit.mutate()}>
              <Text style={s.primaryButtonText}>{submit.isPending ? 'Submitting…' : 'Submit for verification'}</Text>
            </Pressable>
            {submit.error ? <Text style={s.error}>{submit.error.message}</Text> : null}
          </Card>
        ) : null}
        <Pressable style={s.textButton} onPress={() => void logout()}><Text style={s.textButtonLabel}>Sign out</Text></Pressable>
      </Screen>
    );
  }

  const rows = consults.data ?? [];
  return (
    <Screen onRefresh={consults.refetch} refreshing={consults.isRefetching} contentContainerStyle={s.content}>
      <View style={s.welcomeRow}>
        <View>
          <Text style={s.eyebrow}>VERIFIED AGRONOMIST</Text>
          <Text style={s.title}>Hello, {user?.full_name?.split(' ')[0]}</Text>
        </View>
        <View style={s.verified}><Ionicons name="checkmark-circle" size={18} color={theme.colors.success} /><Text style={s.verifiedText}>Verified</Text></View>
      </View>
      <View style={s.summaryRow}>
        <Card style={s.summaryCard}><Text style={s.summaryValue}>{rows.filter((r) => r.status !== 'resolved').length}</Text><Text style={s.copySmall}>Open cases</Text></Card>
        <Card style={s.summaryCard}><Text style={s.summaryValue}>{rows.filter((r) => r.priority === 'urgent').length}</Text><Text style={s.copySmall}>Urgent</Text></Card>
      </View>
      <Text style={s.sectionTitle}>Consultation inbox</Text>
      <Text style={s.copySmall}>Accept an assigned case, message the farmer, submit your assessment, and optionally propose a follow-up task.</Text>
      {consults.isLoading ? <><SkeletonCard /><SkeletonCard /></> : consults.isError ? (
        <Card>
          <View style={s.inboxFeedbackHead}><Ionicons name="cloud-offline-outline" size={22} color={theme.colors.warning} /><Text style={s.sectionTitle}>Could not refresh cases</Text></View>
          <Text style={s.copy}>Your expert account is still signed in. Check the connection, then retry to load assigned and queued reviews.</Text>
          <Pressable style={s.primaryButton} onPress={() => void consults.refetch()}><Text style={s.primaryButtonText}>Try again</Text></Pressable>
        </Card>
      ) : rows.length === 0 ? (
        <Card><Text style={s.copy}>No consultations are waiting. Pull down to refresh.</Text></Card>
      ) : rows.map((consult) => (
        <Link key={consult.id} href={{ pathname: '/(expert)/cases/[consultId]', params: { consultId: consult.id } } as never} asChild>
          <Pressable>
            <Card>
              <View style={s.caseTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.caseTitle}>{consult.observation?.category?.replaceAll('_', ' ') ?? 'Crop review'}</Text>
                  <Text style={s.copySmall}>{consult.farmer_name} · {consult.language.toUpperCase()}</Text>
                </View>
                <View style={[s.badge, consult.priority === 'urgent' && s.badgeUrgent]}>
                  <Text style={[s.badgeText, consult.priority === 'urgent' && s.badgeTextUrgent]}>{statusLabel[consult.status] ?? consult.status}</Text>
                </View>
              </View>
              <Text style={s.copy} numberOfLines={2}>{consult.observation?.description || consult.request_reason || 'Farmer requested a second opinion.'}</Text>
              <View style={s.metaRow}>
                <Text style={s.copySmall}>AI confidence {Math.round((consult.ai_confidence ?? 0) * 100)}%</Text>
                <Ionicons name="chevron-forward" size={17} color={theme.colors.textMuted} />
              </View>
            </Card>
          </Pressable>
        </Link>
      ))}
      <Pressable style={s.textButton} onPress={() => void logout()}><Text style={s.textButtonLabel}>Sign out</Text></Pressable>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { gap: 14, paddingBottom: 40 },
  heroIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: theme.colors.primary + '18', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 25, fontWeight: '800', color: theme.colors.text },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginTop: 4 },
  eyebrow: { fontSize: 11, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.8 },
  status: { fontSize: 21, fontWeight: '800', color: theme.colors.text, textTransform: 'capitalize', marginVertical: 5 },
  copy: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 },
  copySmall: { color: theme.colors.textMuted, fontSize: 12 },
  error: { color: theme.colors.danger, fontSize: 14 },
  welcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { color: theme.colors.success, fontWeight: '700', fontSize: 12 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1 },
  summaryValue: { fontSize: 28, fontWeight: '800', color: theme.colors.primary },
  caseTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 },
  caseTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: theme.colors.primary + '15' },
  badgeUrgent: { backgroundColor: theme.colors.danger + '18' },
  badgeText: { color: theme.colors.primary, fontSize: 10, fontWeight: '800' },
  badgeTextUrgent: { color: theme.colors.danger },
  primaryButton: { backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: theme.radius.md, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 11, color: theme.colors.text },
  textButton: { alignItems: 'center', padding: 12 },
  textButtonLabel: { color: theme.colors.textMuted, fontWeight: '700' },
  inboxFeedbackHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
