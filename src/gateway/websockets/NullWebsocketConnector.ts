import WebsocketConnector from "./WebsocketConnector";

export default class NullWebsocketConnector extends WebsocketConnector {
  initWebsocket() {
    throw new Error("it's a NULL");
  }

  webSocketOpenAction() {
    throw new Error("it's a NULL");
  }

  websocketResque() {
    throw new Error("it's a NULL");
  }
}