import { io, type Socket } from "socket.io-client";

function getSocketBaseUrl() {
  const apiUrl = import.meta.env.VITE_BASE_API;
  if (!apiUrl) {
    console.warn("VITE_BASE_API is not defined. Socket connection might fail.");
    return "";
  }
  // Socket server is mounted at root (not /api)
  return apiUrl.endsWith("/api") ? apiUrl.slice(0, -4) : apiUrl;
}

let socket: Socket | null = null;

export function getSupportSocket() {
  if (!socket) {
    socket = io(getSocketBaseUrl(), {
      withCredentials: true,
      // Default: ['polling', 'websocket'] which is safer for sending cookies on first request
      transports: ["polling", "websocket"],
      // Automatically reconnect
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.debug("[SupportSocket] connected:", socket?.id);
    });

    socket.on("connect_error", (err) => {
      console.debug("[SupportSocket] connect error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.debug("[SupportSocket] disconnected:", reason);
    });
  }
  return socket;
}

/**
 * Destroy and clear the socket instance. Call this on logout.
 */
export function disconnectSupportSocket() {
  if (socket) {
    socket.disconnect();
    // Do not set socket = null so that active hooks keep their listeners.
  }
}

/**
 * Reconnect the socket. Call this on login to ensure the socket uses the new credentials.
 */
export function reconnectSupportSocket() {
  if (socket) {
    socket.disconnect();
    setTimeout(() => {
      socket?.connect();
    }, 100); // Small delay to ensure clean disconnect
  } else {
    getSupportSocket();
  }
}
