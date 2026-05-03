# WebSockets

`WebsocketConnector` is a small reconnecting WebSocket client that dispatches incoming messages as `CustomEvent`s on `document`. It assumes a server protocol where every frame has `{ channel, data }`, and uses `PING`/`PONG` keepalive.

## Default: NullWebsocketConnector

`ApiEngine` ships with `NullWebsocketConnector` — a no-op subclass that throws on use. This avoids accidentally opening a WS in apps that don't need one. Replace it explicitly:

```ts
import { ApiEngine, WebsocketConnector } from "api-engine";

api.websocketConnector = new WebsocketConnector("/ws", api);
api.websocketConnector.initWebsocket();
```

## URL composition

The connector takes the engine's `serverUrl`, swaps `https` → `wss`, and appends the `url` you passed:

```
serverUrl=https://example.com  +  url=/ws  →  wss://example.com/ws
```

Slashes are not normalized — pass `"ws"` not `"/ws"` if you don't want a trailing slash, etc.

## Custom connect handshake

By default, on `onopen` the connector sends:

```json
{
  "title": "connect",
  "session_id": <peer_id>,
  "user_id": <id>,
  "conferenceId": <conferenceId>
}
```

…pulled from `apiEngine.sessionContainer.currentEntity`. If your server expects a different shape:

```ts
api.websocketConnector.connectMessageBuilder = () => ({
    type: "auth",
    token: api.sessionContainer.jwtContainer?.content,
});
```

`connectMessageBuilder` runs every time the connection opens (including on reconnects), so it always reflects the current session state.

## Receiving messages

Every incoming message of the form `{ channel: "...", data: ... }` becomes a `CustomEvent` named after the channel:

```ts
document.addEventListener("orders.updated", (e: CustomEvent) => {
    console.log(e.detail); // the parsed `data` field
});
```

`PONG` frames are dropped. `usedChannels` accumulates a `Set<string>` of channel names seen so far; on reconnect the connector dispatches a `{ title: "RESTART" }` event for each so subscribers can re-fetch.

## Keepalive

`pingAlive` sends `{"title":"PING"}` every 5 seconds (hardcoded). The server is expected to echo `{"title":"PONG"}` (which the connector silently drops).

## Reconnect

`onerror` and `onclose` both call `websocketResque`, which clears the ping interval, drops the socket, and schedules `initWebsocket` after 3 seconds. There's no exponential backoff — if the server is permanently down you're hitting it every 3s.

## Sending

```ts
api.websocketConnector.sendMessage(JSON.stringify({ type: "subscribe", channel: "orders" }));
```

`sendMessage` returns `false` if the socket is closed; it does not queue messages for after reconnect.

## Hangup

```ts
api.websocketConnector.hangupWebSocket();
```
