import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import { mobileApi } from '@/lib/api/mobile';
import type { AssistantMessageRecord } from '@/lib/domain/types';
import { assistantRepository, journeyRepository } from '@/lib/db/repositories';
import { useAuth } from '@/lib/auth/provider';
import { theme } from '@/lib/theme';

export function AssistantScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { data } = useQuery({
    queryKey: ['assistant-context'],
    queryFn: async () => {
      const [journey, messages] = await Promise.all([
        journeyRepository.getActiveJourney(),
        assistantRepository.listMessages(),
      ]);

      return { journey, messages };
    },
  });

  async function sendMessage() {
    const nextText = draft.trim();
    if (!nextText) {
      return;
    }

    setDraft('');
    setIsSending(true);

    try {
      await assistantRepository.appendMessage({
        farm_id: data?.journey?.farm_id ?? null,
        journey_id: data?.journey?.id ?? null,
        role: 'user',
        text: nextText,
        delivery_status: 'local',
      });
      await queryClient.invalidateQueries({ queryKey: ['assistant-context'] });

      const response = await mobileApi.sendAssistantMessage({
        farm_id: data?.journey?.farm_id ?? null,
        journey_id: data?.journey?.id ?? null,
        message: nextText,
      });

      await assistantRepository.appendMessage({
        farm_id: data?.journey?.farm_id ?? null,
        journey_id: data?.journey?.id ?? null,
        role: 'assistant',
        text: response.reply,
        delivery_status: 'sent',
      });
    } catch {
      await assistantRepository.appendMessage({
        farm_id: data?.journey?.farm_id ?? null,
        journey_id: data?.journey?.id ?? null,
        role: 'assistant',
        text: 'I could not reach the live assistant, but your message is saved locally. When the network returns, try again for farm-specific advice.',
        delivery_status: 'failed',
      });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['assistant-context'] });
      setIsSending(false);
    }
  }

  async function clearConversation() {
    await assistantRepository.clearMessages();
    await queryClient.invalidateQueries({ queryKey: ['assistant-context'] });
  }

  function renderMessage({ item }: { item: AssistantMessageRecord }) {
    const isAssistant = item.role === 'assistant';

    return (
      <Card style={isAssistant ? styles.assistantCard : styles.userCard}>
        <View style={styles.messageHeader}>
          <Text style={styles.messageRole}>{isAssistant ? 'Ecofy AI' : 'You'}</Text>
          {item.delivery_status !== 'sent' ? (
            <Text style={styles.messageStatus}>
              {item.delivery_status === 'failed' ? 'Saved offline' : 'Local'}
            </Text>
          ) : null}
        </View>
        <Text style={styles.messageText}>{item.text}</Text>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlashList
        data={data?.messages ?? []}
        renderItem={renderMessage}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.title}>AI field desk</Text>
                <Text style={styles.copy}>
                  Ask for crop advice, spray windows, input planning, or what to inspect next in the field.
                </Text>
              </View>
              <Button
                label="Clear"
                variant="ghost"
                accessibilityHint="Clears the locally cached assistant conversation on this device."
                onPress={() => void clearConversation()}
              />
            </View>

            <Card>
              <Text style={styles.contextText}>
                Signed in as {user?.full_name ?? user?.email ?? 'farmer'} • Context farm {data?.journey?.farm_id ?? 'not selected'}
              </Text>
            </Card>
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Text style={styles.messageRole}>Ecofy AI</Text>
            <Text style={styles.messageText}>
              Ask your first question about pests, irrigation timing, field health, or harvest planning.
            </Text>
          </Card>
        }
        ListFooterComponent={
          <Card>
            <TextInput
              placeholder="Ask about pests, irrigation timing, field health, or harvest planning"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              multiline
              accessibilityLabel="Assistant message"
              accessibilityHint="Write a question for Ecofy AI. Your message is also stored locally on this device."
              value={draft}
              onChangeText={setDraft}
            />
            <Button
              label={isSending ? 'Sending...' : 'Send'}
              accessibilityHint="Sends your question to the assistant and stores the conversation locally."
              onPress={() => void sendMessage()}
            />
          </Card>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  headerStack: {
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  copy: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  contextText: {
    color: theme.colors.textMuted,
  },
  assistantCard: {
    backgroundColor: '#f2f7f1',
  },
  userCard: {
    backgroundColor: '#fff8ea',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  messageRole: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  messageStatus: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  messageText: {
    color: theme.colors.text,
    lineHeight: 22,
  },
  input: {
    minHeight: 120,
    color: theme.colors.text,
    textAlignVertical: 'top',
    fontSize: 16,
  },
});
