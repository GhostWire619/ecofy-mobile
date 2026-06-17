import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/lib/api/client';
import { mobileApi } from '@/lib/api/mobile';
import { assistantRepository, journeyRepository } from '@/lib/db/repositories';
import type { AssistantMessageRecord } from '@/lib/domain/types';
import { useAuth } from '@/lib/auth/provider';
import { theme } from '@/lib/theme';
import { tapHaptic } from '@/lib/utils/haptics';
import { compressForUpload, uriToBase64 } from '@/lib/utils/image';
import { MarkdownText } from '@/lib/utils/markdown';
import { toAbsoluteUrl } from '@/lib/utils/url';

const SUGGESTIONS = [
  "What's wrong with my crop?",
  'When should I apply fertiliser?',
  'How do I control armyworm?',
  'Is it a good time to plant?',
];

type PendingImage = { uri: string; mimeType: string };

// Turn a failed assistant call into a specific, actionable message instead of a
// generic "couldn't reach" line — so the user (and we) can see what really broke.
function assistantErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 408) return 'That took too long to answer. Try again on a stronger connection.';
    if (error.status === 0) return "I can't reach the Ecofy server right now. Check your connection and try again.";
    if (error.status === 401) return 'Your session expired. Please sign out and sign in again, then retry.';
    if (error.status === 413) return 'That photo was too large to send. Try a smaller or closer photo.';
    if (error.status === 503) return 'The assistant is temporarily unavailable. Please try again in a moment.';
    if (error.status >= 500) return `The assistant hit a server error (${error.status}). Please try again shortly.`;
    return error.message || 'Something went wrong reaching the assistant.';
  }
  return "I couldn't reach the assistant just now. Your message is saved — try again when you're back online.";
}

// Normalized bubble shape rendered by the chat, regardless of source (server or local cache).
type ChatBubbleMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  image_local_uri?: string | null;
  delivery_status?: 'local' | 'sent' | 'failed' | null;
};

type SessionRow = {
  id: string;
  title: string;
  last_message: string | null;
  last_message_time: string | null;
  created_at: string;
};

function mapServerMessage(m: {
  id: string;
  content: string;
  file_url: string | null;
  is_ai: boolean;
}): ChatBubbleMessage {
  return {
    id: m.id,
    role: m.is_ai ? 'assistant' : 'user',
    text: m.content,
    image_local_uri: m.file_url,
    delivery_status: 'sent',
  };
}

function mapLocalMessage(m: AssistantMessageRecord): ChatBubbleMessage {
  return {
    id: m.id,
    role: m.role === 'user' ? 'user' : 'assistant',
    text: m.text,
    image_local_uri: m.image_local_uri,
    delivery_status: m.delivery_status,
  };
}

function formatWhen(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AssistantScreen() {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  // Manual keyboard avoidance: Expo SDK 55 edge-to-edge doesn't resize the
  // window for the keyboard, so KeyboardAvoidingView can't push the composer up.
  // We offset the composer by the real keyboard height instead.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Conversation state: the rendered view, the server conversation id it threads into.
  const [view, setView] = useState<ChatBubbleMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);

  // History picker
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { data: journey } = useQuery({
    queryKey: ['assistant-journey'],
    queryFn: () => journeyRepository.getActiveJourney(),
  });

  // Hydrate on open: load the most recent server conversation; fall back to the
  // offline local cache when the server is unreachable.
  useEffect(() => {
    let alive = true;
    (async () => {
      setHydrating(true);
      try {
        const remote = await mobileApi.listChatSessions();
        if (!alive) return;
        if (remote && remote.length > 0) {
          setSessions(remote);
          const latest = remote[0];
          setSessionId(latest.id);
          const msgs = await mobileApi.getChatMessages(latest.id);
          if (!alive) return;
          setView(msgs.map(mapServerMessage));
          setHydrating(false);
          return;
        }
      } catch {
        // offline / not reachable — fall through to local cache
      }
      try {
        const local = await assistantRepository.listMessages();
        if (alive) setView(local.map(mapLocalMessage));
      } catch {
        // ignore
      }
      if (alive) setHydrating(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [view.length, isSending, pendingImage, keyboardHeight]);

  async function attachImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPendingImage({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    const img = pendingImage;
    if ((!trimmed && !img) || isSending) return;

    tapHaptic();
    setDraft('');
    setPendingImage(null);
    setIsSending(true);

    const history = view
      // Don't replay our own "couldn't reach the assistant" error bubbles as
      // context — they'd pollute the model's view of the conversation.
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.delivery_status !== 'failed')
      .map((m) => ({ role: m.role, content: m.text }))
      .slice(-10);

    const farm_id = journey?.farm_id ?? null;
    const journey_id = journey?.id ?? null;

    // Prepare the image: compress, base64 (for Gemini), and upload to storage so
    // the photo persists with a real served URL the saved message can show.
    let imageBase64: string | null = null;
    let storedUri: string | null = null;
    let imageMime = img?.mimeType ?? 'image/jpeg';
    if (img) {
      const compressed = await compressForUpload(img.uri, img.mimeType);
      imageMime = compressed.mimeType;
      imageBase64 = await uriToBase64(compressed.uri);
      storedUri = compressed.uri;
      try {
        const uploaded = await mobileApi.uploadImage(compressed.uri, compressed.mimeType, 'chat');
        if (uploaded?.url) storedUri = uploaded.url;
      } catch {
        // Upload failed — keep the local URI so the bubble still shows the photo.
      }
    }

    const userText = trimmed || '📷 Photo';
    const tempId = `local-${Date.now()}`;
    setView((prev) => [
      ...prev,
      { id: tempId, role: 'user', text: userText, image_local_uri: storedUri, delivery_status: 'local' },
    ]);
    // Mirror to the offline cache.
    void assistantRepository.appendMessage({
      farm_id,
      journey_id,
      role: 'user',
      text: userText,
      image_local_uri: storedUri,
      delivery_status: 'local',
    });

    try {
      const response = await mobileApi.sendAssistantMessage({
        farm_id,
        journey_id,
        message: trimmed || 'Please look at this photo of my crop and advise.',
        session_id: sessionId,
        history,
        image_base64: imageBase64,
        image_mime_type: imageBase64 ? imageMime : null,
        // Persist the stored photo URL with the message. The upload returns an
        // absolute URL when PUBLIC_BASE_URL is set, otherwise a root-relative
        // "/uploads/..." path — keep both so the photo survives a reload (the
        // bubble resolves it to absolute on render). A failed upload leaves a
        // device file:// URI here, which the server can't fetch, so skip those.
        image_url:
          storedUri && (storedUri.startsWith('http') || storedUri.startsWith('/'))
            ? storedUri
            : null,
      });
      if (response.session_id) setSessionId(response.session_id);
      setView((prev) => [
        // Mark the just-sent user message delivered (clears its "Sending…" label).
        ...prev.map((m) => (m.id === tempId ? { ...m, delivery_status: 'sent' as const } : m)),
        { id: `ai-${Date.now()}`, role: 'assistant', text: response.reply, delivery_status: 'sent' },
      ]);
      void assistantRepository.appendMessage({
        farm_id,
        journey_id,
        role: 'assistant',
        text: response.reply,
        delivery_status: 'sent',
      });
    } catch (err) {
      const failText = assistantErrorMessage(err);
      setView((prev) => [
        // Surface that the user's message didn't get through (no more "Sending…").
        ...prev.map((m) => (m.id === tempId ? { ...m, delivery_status: 'failed' as const } : m)),
        { id: `fail-${Date.now()}`, role: 'assistant', text: failText, delivery_status: 'failed' },
      ]);
      void assistantRepository.appendMessage({
        farm_id,
        journey_id,
        role: 'assistant',
        text: failText,
        delivery_status: 'failed',
      });
    } finally {
      setIsSending(false);
    }
  }

  async function openHistory() {
    tapHaptic();
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const s = await mobileApi.listChatSessions();
      setSessions(s ?? []);
    } catch {
      // keep whatever we have
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadSession(id: string) {
    setHistoryOpen(false);
    if (id === sessionId) return;
    setHydrating(true);
    setSessionId(id);
    try {
      const msgs = await mobileApi.getChatMessages(id);
      setView(msgs.map(mapServerMessage));
    } catch {
      // ignore
    } finally {
      setHydrating(false);
    }
  }

  function startNewChat() {
    tapHaptic();
    setHistoryOpen(false);
    setSessionId(null);
    setView([]);
    setDraft('');
    setPendingImage(null);
  }

  const isEmpty = view.length === 0;
  const canSend = Boolean((draft.trim() || pendingImage) && !isSending);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Ionicons name="sparkles" size={18} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Ecofy AI</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {journey ? `Helping with your ${journey.common_name}` : 'Your farming assistant'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => void openHistory()} hitSlop={8} style={styles.headerBtn} accessibilityLabel="Chat history">
          <Ionicons name="time-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={startNewChat} hitSlop={8} style={styles.headerBtn} accessibilityLabel="New chat">
          <Ionicons name="create-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.flex, { paddingBottom: keyboardHeight > 0 ? keyboardHeight : insets.bottom }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {hydrating && isEmpty ? (
            <View style={styles.empty}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : isEmpty ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Habari {user?.full_name?.split(' ')[0] ?? ''} 👋</Text>
              <Text style={styles.emptyCopy}>
                Ask me anything about your crop — pests, spraying, fertiliser, timing, or markets. You can attach a photo too.
              </Text>
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <TouchableOpacity key={s} style={styles.chip} activeOpacity={0.8} onPress={() => void send(s)}>
                    <Text style={styles.chipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            view.map((m) => <Bubble key={m.id} message={m} />)
          )}
          {isSending ? <TypingBubble /> : null}
        </ScrollView>

        {/* Attached-image preview */}
        {pendingImage ? (
          <View style={styles.previewBar}>
            <Image source={{ uri: pendingImage.uri }} style={styles.previewThumb} contentFit="cover" />
            <Text style={styles.previewText} numberOfLines={1}>Photo attached</Text>
            <TouchableOpacity onPress={() => setPendingImage(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Composer */}
        <View style={styles.composer}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => void attachImage()}
            disabled={isSending}
            accessibilityLabel="Attach a photo"
          >
            <Ionicons name="image-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Message Ecofy AI…"
            placeholderTextColor={theme.colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            accessibilityLabel="Message Ecofy AI"
          />
          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={() => void send(draft)}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>

      {/* History picker */}
      <Modal visible={historyOpen} animationType="slide" transparent onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setHistoryOpen(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Your conversations</Text>
            <TouchableOpacity onPress={startNewChat} style={styles.newChatBtn}>
              <Ionicons name="add" size={18} color={theme.colors.primary} />
              <Text style={styles.newChatText}>New chat</Text>
            </TouchableOpacity>
          </View>
          {historyLoading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : sessions.length === 0 ? (
            <Text style={styles.modalEmpty}>No past conversations yet.</Text>
          ) : (
            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {sessions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.sessionRow, s.id === sessionId && styles.sessionRowActive]}
                  onPress={() => void loadSession(s.id)}
                >
                  <View style={styles.sessionIcon}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionTitle} numberOfLines={1}>{s.title}</Text>
                    {s.last_message ? (
                      <Text style={styles.sessionSub} numberOfLines={1}>{s.last_message}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.sessionWhen}>{formatWhen(s.last_message_time || s.created_at)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: ChatBubbleMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {message.image_local_uri ? (
          <Image
            source={{ uri: toAbsoluteUrl(message.image_local_uri) }}
            style={styles.bubbleImage}
            contentFit="cover"
          />
        ) : null}
        {isUser ? (
          <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{message.text}</Text>
        ) : (
          <MarkdownText content={message.text} color={theme.colors.text} size={15} />
        )}
        {message.delivery_status === 'failed' ? (
          <Text style={styles.bubbleMeta}>Not delivered · saved offline</Text>
        ) : message.delivery_status === 'local' ? (
          <Text style={styles.bubbleMeta}>Sending…</Text>
        ) : null}
      </View>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typing]}>
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
        <Text style={styles.typingText}>Ecofy AI is thinking…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backBtn: { padding: 2 },
  headerBtn: { padding: 2 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  headerSub: { fontSize: 12, color: theme.colors.textMuted },

  messages: { padding: theme.spacing.lg, gap: theme.spacing.sm, flexGrow: 1 },

  empty: { flex: 1, justifyContent: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xxl },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  emptyCopy: { fontSize: 15, color: theme.colors.textMuted, lineHeight: 22 },
  suggestions: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },

  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '84%', borderRadius: theme.radius.lg, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  bubbleAssistant: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22, color: theme.colors.text },
  bubbleTextUser: { color: '#fff' },
  bubbleImage: { width: 200, height: 150, borderRadius: theme.radius.md },
  bubbleMeta: { fontSize: 11, color: theme.colors.textMuted },

  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 13, color: theme.colors.textMuted },

  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  previewThumb: { width: 40, height: 40, borderRadius: theme.radius.sm },
  previewText: { flex: 1, fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: theme.colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.colors.disabled },

  // History picker
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingBottom: theme.spacing.xl,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newChatText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  modalLoading: { padding: theme.spacing.xl, alignItems: 'center' },
  modalEmpty: { padding: theme.spacing.lg, color: theme.colors.textMuted, fontSize: 14 },
  modalList: { paddingHorizontal: theme.spacing.md },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  sessionRowActive: { backgroundColor: theme.colors.primary + '12' },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  sessionSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  sessionWhen: { fontSize: 12, color: theme.colors.textMuted },
});
