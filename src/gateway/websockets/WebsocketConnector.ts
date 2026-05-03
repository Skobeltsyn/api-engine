// Класс чисто для подключения к WebSocket и диспетчит ивенты, совпадающте с каналами.
import ApiEngine from "../ApiEngine";
import { log } from "../../util/Log";

export default class WebsocketConnector {
  websocket?: WebSocket;
  api: ApiEngine;
  url: string;
  pingInterval: any;
  needToReconnect: boolean = true;
  usedChannels: Set<string>;
  alive: boolean = false;
  connecting: boolean = false;
  connectMessageBuilder?: () => unknown;

  constructor(_url: string, _api: ApiEngine) {
    this.url = _url;
    this.api = _api;
    this.usedChannels = new Set<string>();

    this.initWebsocket = this.initWebsocket.bind(this);
    this.websocketResque = this.websocketResque.bind(this);
    this.webSocketOpenAction = this.webSocketOpenAction.bind(this);
    this.pingAlive = this.pingAlive.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
    this.hangupWebSocket = this.hangupWebSocket.bind(this);
  }


  hangupWebSocket() {
    this.websocket?.close();
  }

  initWebsocket() {
    // alert(1);
    let me = this;
    if (me.connecting) return;
    me.connecting = true;
    try {
      let url = `${me.api.serverUrl.replace("https", "wss")}/${me.url}`;
      log(`Enabling websocket on ${url}`)
      me.websocket = new WebSocket(url);
    } catch (e) {
      console.error("Websocket init error", e);
      setTimeout(me.initWebsocket, 2000);
      return;
    }

    me.websocket.onerror = (_e: Event) => { if (me.websocket) me.websocketResque(); }

    me.websocket.onclose = (_e: Event) => { if (me.websocket) me.websocketResque(); }

    me.websocket.onopen = (event) => {
      // alert(3);
      me.webSocketOpenAction();
    }
    me.websocket.onmessage = (_message: MessageEvent) => {
      let parsed = JSON.parse(_message.data);
      if (parsed["title"] === "PONG") {
        return;
      }
      let channelName = parsed["channel"];
      // alert(_message.data);
      let data = parsed["data"];
      if (typeof data === 'string' || data instanceof String) {
        data = JSON.parse(data.toString());
      }
      me.usedChannels.add(channelName);
      const messageEvent = new CustomEvent(channelName, {detail: data});
      // alert(dogFound);
      document.dispatchEvent(messageEvent);
    }
  }

  webSocketOpenAction() {
    let me = this;
    if (!me.websocket) {
      me.needToReconnect = true;
      setTimeout(me.websocketResque, 5000);
      return;
    }
    try {
      const payload = me.connectMessageBuilder
        ? me.connectMessageBuilder()
        : {
            title: "connect",
            session_id: me.api.sessionContainer.currentEntity.peer_id,
            user_id: me.api.sessionContainer.currentEntity.id,
            conferenceId: me.api.sessionContainer.currentEntity.conferenceId
          };
      const message = JSON.stringify(payload);
      me.sendMessage(message);
      // alert(5);
      me.needToReconnect = false;
      me.alive = true;
      me.connecting = false;
      setTimeout(() => {
        if (me.pingInterval) clearInterval(me.pingInterval);
        me.pingInterval = setInterval(me.pingAlive,
          5000);
      });
      me.usedChannels.forEach((_channelName: string) => {
        let event = new CustomEvent(_channelName, {
          detail: {
            title: "RESTART"
          }
        });
        document.dispatchEvent(event);
      });
    } catch (e) {
      me.connecting = false;
      console.error("Websocket open error", e);
      setTimeout(me.websocketResque, 5000);
    }
  }

  websocketResque() {
    let me = this;
    me.needToReconnect = true;
    me.alive = false;
    if (me.pingInterval) clearInterval(me.pingInterval);
    me.websocket?.close(3001);
    delete me.websocket;
    setTimeout(me.initWebsocket, 3000);
  }

  pingAlive() {
    this.sendMessage(JSON.stringify({title: "PING"}))
  }

  sendMessage(_content: string) {
    let me = this;
    try {
      if (me.websocket) {
        me.websocket.send(_content);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Websocket send error", e);
      setTimeout(() => {
        me.websocketResque();
      });
      return false;
    }
  }
}