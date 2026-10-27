import { useRouter } from 'expo-router';
import { limitToLast, orderBy } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography } from '../../constants/theme';
import { useCallBackend } from '../../hooks/useCallBackend';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import { useFirestoreDoc } from '../../hooks/useFirestoreDoc';
import { useToday } from '../../hooks/useToday';
import { currentWorkoutStreak } from '../../services/workoutStreak';
import { useVoiceCapture } from '../../hooks/useVoiceCapture';
import { useAuthStore } from '../../store/useAuthStore';
import { useConnectivityStore } from '../../store/useConnectivityStore';
import { ReadError } from '../shared/ReadError';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useUserProfileStore } from '../../store/useUserProfileStore';
import { Icon } from '../shared/Icon';
import { ChatBubble } from './ChatBubble';
import { ChatInputBar } from './ChatInputBar';
import { QuickReplyRow } from './QuickReplyRow';
import { StatusChipBar } from './StatusChipBar';
import { useThemedStyles } from '../shared/ThemeProvider';

export function ChatScreen({ conversationId: initialConversationId = null }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const userDoc = useUserProfileStore((s) => s.userDoc);
  const { execute, isLoading: isSending, loadingHint } = useCallBackend();
  const voice = useVoiceCapture({
    onAutoTranscript: (transcript) => setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript)),
  });
  const scrollRef = useRef(null);

  const [conversationId, setConversationId] = useState(initialConversationId);
  const [draft, setDraft] = useState('');
  const [pendingMessage, setPendingMessage] = useState(null); // optimistic bubble
  const [failedMessage, setFailedMessage] = useState(null);

  const messagesPath = user && conversationId
    ? `users/${user.uid}/aiConversations/${conversationId}/messages`
    : null;

  // Only the last 30 render here — a separate window from the backend's
  // "last 10 for Gemini context" (Phase 3 §2.4); the two must not be conflated.
  const { data: rawMessages, isLoading: messagesLoading, error: messagesError, retry: retryMessages } = useFirestoreCollection(
    messagesPath,
    [orderBy('timestamp', 'asc'), limitToLast(30)],
    `messages:${conversationId ?? 'none'}`
  );

  // The backend writes both messages in one batch, so they share a
  // serverTimestamp and the schema has no `sequence` field to break the tie
  // (Phase 4 §3.3). Sort user before assistant on identical timestamps.
  const messages = useMemo(() => {
    return [...rawMessages].sort((a, b) => {
      const at = a.timestamp?.toMillis?.() ?? 0;
      const bt = b.timestamp?.toMillis?.() ?? 0;
      if (at !== bt) return at - bt;
      return (a.role === 'user' ? 0 : 1) - (b.role === 'user' ? 0 : 1);
    });
  }, [rawMessages]);

  const { dateId: today, dayLabel } = useToday();
  const { data: todayLog, isLoading: logLoading, error: logError, retry: retryLog } = useFirestoreDoc(user ? `users/${user.uid}/dailyLogs/${today}` : null);
  const { data: plan, isLoading: planLoading, error: planError, retry: retryPlan } = useFirestoreDoc(
    user && userDoc?.currentPlanId
      ? `users/${user.uid}/workoutPlans/${userDoc.currentPlanId}`
      : null
  );

  const chips = useMemo(() => {
    const day = plan?.weeklySchedule?.find((d) => d.dayLabel === dayLabel);
    return [
      { icon: 'train', label: day?.isRestDay ? 'Rest day' : day?.sessionName ?? 'No session' },
      {
        icon: 'meals',
        label: `${todayLog?.nutritionLog?.aiEstimatedTotals?.calories ?? 0} kcal`,
      },
      { icon: 'flame', label: `${currentWorkoutStreak(userDoc?.stats, plan?.weeklySchedule, today)} day streak` },
    ];
  }, [plan, todayLog, userDoc, today, dayLabel]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages.length, pendingMessage, isSending]);

  const sendMessage = async (text, contextType) => {
    const message = text.trim();
    if (!message) return;

    setDraft('');
    setFailedMessage(null);
    setPendingMessage({ content: message, contextType });

    try {
      const result = await execute('/api/ai/chat', {
        message,
        ...(contextType ? { contextType } : {}),
        ...(conversationId ? { conversationId } : {}),
      });
      // The backend has already written both message documents; the snapshot
      // listener renders them, so the optimistic bubble can be dropped.
      if (result?.data?.conversationId) setConversationId(result.data.conversationId);
      setPendingMessage(null);
    } catch {
      setPendingMessage(null);
      setFailedMessage({ content: message, contextType });
    }
  };

  const handleMic = async () => {
    if (voice.isRecording) {
      const transcript = await voice.stopAndTranscribe();
      // Never auto-send — the transcript lands in the field for editing.
      if (transcript) setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
    } else {
      await voice.startRecording();
    }
  };

  const initial = (userDoc?.displayName || user?.displayName || 'U').charAt(0).toUpperCase();
  const isEmpty = messages.length === 0 && !pendingMessage && !failedMessage;

  if (messagesError || logError || planError) {
    return <ReadError message="Could not load Coach data." onRetry={() => Promise.all([retryMessages(), retryLog(), retryPlan()])} />;
  }
  if (messagesLoading || logLoading || planLoading) return <LoadingSpinner message="Loading Coach..." />;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Go back">
          <Icon name="back" size={22} color={colors.text.inverse} />
        </Pressable>
        <View style={styles.avatar}>
          <Icon name="coachActive" size={19} color={colors.text.inverse} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>GYMBRO AI COACH</Text>
          <View style={styles.statusRow}>
            <Icon name="dot" size={7} color={isOnline ? colors.success : colors.text.inverseMuted} />
            <Text style={[styles.headerStatus, !isOnline && { color: colors.text.inverseMuted }]}>{isOnline ? 'Internet connected' : 'Offline'}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/workout')}
          hitSlop={8}
          accessibilityLabel="Go to workout"
        >
          <Icon name="train" size={19} color={colors.text.inverse} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/(profile)/progress')}
          hitSlop={8}
          accessibilityLabel="Go to progress"
        >
          <Icon name="chart" size={19} color={colors.text.inverse} />
        </Pressable>
      </View>

      <StatusChipBar chips={chips} />

      {/*
        style, not just contentContainerStyle: without flex:1 here the message
        list sizes to its content and the column's leftover height has nowhere
        defined to go, which lets the two horizontal chip rows stretch (F4).
      */}
      <ScrollView ref={scrollRef} style={styles.messagesScroll} contentContainerStyle={styles.messages}>
        {isEmpty ? (
          <View style={styles.intro}>
            <ChatBubble
              role="assistant"
              content={`Hey ${(userDoc?.displayName || 'there').split(' ')[0]}! I'm your coach. Ask me about training, food, or how you're recovering.`}
            />
          </View>
        ) : null}

        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            role={message.role}
            content={message.content}
            initial={initial}
          />
        ))}

        {pendingMessage ? (
          <ChatBubble role="user" content={pendingMessage.content} initial={initial} pending />
        ) : null}

        {failedMessage ? (
          <ChatBubble
            role="user"
            content={failedMessage.content}
            initial={initial}
            failed
            onRetry={() => sendMessage(failedMessage.content, failedMessage.contextType)}
          />
        ) : null}

        {isSending ? (
          <Text style={styles.typing}>
            {loadingHint === 'slow' ? 'Still waiting for Coach...' : 'Coach is typing...'}
          </Text>
        ) : null}
      </ScrollView>

      <QuickReplyRow
        disabled={isSending}
        onSelect={(reply) => sendMessage(reply.prompt, reply.contextType)}
      />

      <View style={{ paddingBottom: insets.bottom }}>
        <ChatInputBar
          value={draft}
          onChangeText={setDraft}
          onSend={() => sendMessage(draft)}
          onMicPress={handleMic}
          isRecording={voice.isRecording}
          isTranscribing={voice.isTranscribing}
          disabled={isSending}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface.tertiary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface.inverse,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { ...typography.label, fontSize: 12, color: colors.text.inverse },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerStatus: { ...typography.eyebrow, fontSize: 8, color: colors.success, letterSpacing: 0.5 },
  messagesScroll: { flex: 1 },
  messages: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  intro: { gap: spacing.md },
  typing: { ...typography.small, color: colors.text.muted, marginLeft: 40 },
});
