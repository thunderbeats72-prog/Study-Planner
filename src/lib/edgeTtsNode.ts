/* Server-only Edge speech connector.
   Uses the `ws` package so the request can carry the same
   Origin/User-Agent headers the Edge browser sends. This module is
   imported exclusively by the /api/voice route — never bundled for
   the browser (the client uses the native-WebSocket connector in
   edgeTts.ts). */

import type { EdgeSocket, EdgeSocketConnector, SocketHandlers } from "./edgeTts";
import WebSocket from "ws";

export const connectEdgeSocketNode: EdgeSocketConnector = async (handlers: SocketHandlers) => {
  const { edgeSynthUrl } = await import("./edgeTts");
  const socket = new WebSocket(await edgeSynthUrl(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    },
    handshakeTimeout: 10_000,
  });
  socket.on("open", handlers.onOpen);
  socket.on("close", handlers.onClosed);
  socket.on("error", handlers.onFailure);
  socket.on("message", (data, isBinary) => {
    if (isBinary) handlers.onBinary(new Uint8Array(data as Buffer));
    else handlers.onText(data.toString());
  });
  const wrapped: EdgeSocket = {
    send: (message) => socket.send(message),
    close: () => socket.close(),
  };
  return wrapped;
};
