import { useEffect, useRef } from 'react';
import { getSupportSocket } from '@/lib/support-socket';

export function useSupportRealtime(
  conversationId: string | null | undefined,
  onNewMessage: (msg: any) => void
) {
  // Use a ref to hold the latest callback so the effect doesn't need to re-run  
  // when the callback changes identity (inline arrow functions change every render)
  const callbackRef = useRef(onNewMessage);
  useEffect(() => {
    callbackRef.current = onNewMessage;
  });

  useEffect(() => {
    if (!conversationId) return;
    const socket = getSupportSocket();

    const tryJoin = () => {
      console.debug('[SupportRealtime] Attempting to join conversation:', conversationId);
      socket.emit('support:join', conversationId, (ok: boolean) => {
        console.debug(`[SupportRealtime] join response for ${conversationId}:`, ok);
        if (!ok) {
          // Retry join once after 1.5s — socket auth may not be ready yet on first connect
          setTimeout(() => {
            console.debug('[SupportRealtime] Retrying join for conversation:', conversationId);
            socket.emit('support:join', conversationId, (ok2: boolean) => {
              console.debug(`[SupportRealtime] retry join response for ${conversationId}:`, ok2);
            });
          }, 1500);
        }
      });
    };

    // If already connected, join immediately. Otherwise wait for connect event.
    if (socket.connected) {
      tryJoin();
    } else {
      socket.once('connect', tryJoin);
    }

    // Re-join the room on every reconnect (e.g. tab focuses back, network flicker)
    socket.on('connect', tryJoin);

    const handler = (payload: any) => {
      console.debug('[SupportRealtime] Received support:new_message', payload);
      if (payload?.conversationId === conversationId) {
        callbackRef.current(payload);
      } else {
        console.debug(`[SupportRealtime] Ignored message (mismatch focus): expected ${conversationId}, got ${payload?.conversationId}`);
      }
    };

    socket.on('support:new_message', handler);

    return () => {
      socket.off('connect', tryJoin);
      socket.off('support:new_message', handler);
    };
  }, [conversationId]); // Only depend on conversationId, NOT on the callback
}
