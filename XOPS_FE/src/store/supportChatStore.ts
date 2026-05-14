import { create } from "zustand";

interface SupportChatState {
  isOpen: boolean;
  isMounted: boolean;
  orderId: string | undefined;

  // Realtime Inbox
  unreadCount: number;
  latestUnreadOrderId: string | null;
  
  // Actions
  openChat: (orderId?: string) => void;
  closeChat: () => void;
  minimizeChat: () => void;
  mountChat: (orderId?: string) => void;

  setUnreadCount: (count: number) => void;
  incrementUnread: (orderId: string) => void;
  markOrderRead: (orderId: string) => void;
  clearUnread: () => void;
}

export const useSupportChatStore = create<SupportChatState>((set) => ({
  isOpen: false,
  isMounted: false,
  orderId: undefined,
  unreadCount: 0,
  latestUnreadOrderId: null,

  openChat: (orderId) => set({ isOpen: true, isMounted: true, orderId: orderId !== undefined ? orderId : undefined }),
  closeChat: () => set({ isOpen: false, isMounted: false, orderId: undefined }),
  minimizeChat: () => set({ isOpen: false }),
  mountChat: (orderId) => set({ isMounted: true, orderId: orderId !== undefined ? orderId : undefined }),
  
  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: (orderId) => set((state) => ({ 
    unreadCount: state.unreadCount + 1,
    latestUnreadOrderId: orderId
  })),
  markOrderRead: (orderId) => set((state) => ({
    unreadCount: Math.max(0, state.unreadCount - 1), // Simplification: decrement by 1 if we don't know the exact count
    latestUnreadOrderId: state.latestUnreadOrderId === orderId ? null : state.latestUnreadOrderId
  })),
  clearUnread: () => set({ unreadCount: 0, latestUnreadOrderId: null }),
}));
