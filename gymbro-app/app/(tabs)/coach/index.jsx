import { limit, orderBy } from 'firebase/firestore';
import { ChatScreen } from '../../../components/coach/ChatScreen';
import { ReadError } from '../../../components/shared/ReadError';
import { LoadingSpinner } from '../../../components/shared/LoadingSpinner';
import { useFirestoreCollection } from '../../../hooks/useFirestoreCollection';
import { useAuthStore } from '../../../store/useAuthStore';

/**
 * The AI tab and the Dashboard FAB both land here. Rather than showing a
 * conversation list first, this resumes the most recent conversation — the
 * common case is continuing an ongoing chat with a coach who remembers you.
 */
export default function CoachEntry() {
  const user = useAuthStore((s) => s.user);

  const { data: conversations, isLoading, error, retry } = useFirestoreCollection(
    user ? `users/${user.uid}/aiConversations` : null,
    [orderBy('updatedAt', 'desc'), limit(1)],
    'latest-conversation'
  );

  if (error) return <ReadError message="Could not load your conversations." onRetry={retry} />;
  if (isLoading) return <LoadingSpinner message="Opening Coach..." />;

  // No conversation yet is fine — the first send creates one server-side.
  return <ChatScreen conversationId={conversations[0]?.id ?? null} />;
}
