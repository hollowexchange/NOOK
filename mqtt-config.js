// Shared MQTT settings for the web UI and ESP32 (keep topics in sync).
// Browser needs WebSockets. ESP32 uses plain MQTT on port 1883.
window.GALE_MQTT = {
  url: "wss://broker.hivemq.com:8884/mqtt",
  clientIdPrefix: "gale-web-",
  topics: {
    command: "aawdwdookpodk-4",
    state: "aawdwdookpodk-4/state",
  },
};
