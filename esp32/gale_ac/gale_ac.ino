/*
  Gale — ESP32 Super Mini (ESP32-C3) MQTT listener

  Board: ESP32C3 Dev Module (or your Super Mini board package)
  Libraries: PubSubClient (by Nick O'Leary)

  Topics (must match mqtt-config.js):
    aawdwdookpodk-4        command payload: power/airflow/temperature
                           example: "1/3/30"
    aawdwdookpodk-4/state  JSON status from this device

  Broker TCP (not WebSocket): broker.hivemq.com:1883
*/

#include <WiFi.h>
#include <PubSubClient.h>

// --- edit these ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

const char* MQTT_HOST = "broker.hivemq.com";
const uint16_t MQTT_PORT = 1883;

const char* TOPIC_COMMAND = "aawdwdookpodk-4";
const char* TOPIC_STATE = "aawdwdookpodk-4/state";

// Built-in LED on many ESP32-C3 Super Mini boards (active LOW). Change if needed.
const int LED_PIN = 8;
const bool LED_ACTIVE_LOW = true;

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

int airflow = 2;
int temperature = 22;
bool powerOn = true;
unsigned long lastReconnectAttempt = 0;
unsigned long lastStatePublish = 0;

String clientId;

void setLed(bool on) {
  digitalWrite(LED_PIN, LED_ACTIVE_LOW ? !on : on);
}

void publishState() {
  char payload[96];
  snprintf(
    payload,
    sizeof(payload),
    "{\"online\":true,\"power\":\"%s\",\"airflow\":%d,\"temperature\":%d}",
    powerOn ? "on" : "off",
    airflow,
    temperature
  );
  mqtt.publish(TOPIC_STATE, payload, true);
}

void applyAirflow(int value) {
  if (!powerOn) {
    Serial.println("Airflow ignored while power is off");
    return;
  }
  airflow = constrain(value, 0, 5);
  // Soft blink rate hint: higher fan = faster pulse duty via LED brightness steps
  Serial.printf("Airflow -> %d\n", airflow);
  setLed(airflow > 0);
  publishState();
}

void applyPower(bool on) {
  powerOn = on;
  if (!on) {
    airflow = 0;
  }
  Serial.printf("Power -> %s\n", on ? "on" : "off");
  setLed(on && airflow > 0);
  publishState();
}

void applyTemperature(int value) {
  temperature = constrain(value, 16, 30);
  Serial.printf("Temperature -> %d C\n", temperature);
  publishState();
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  char msg[32];
  unsigned int n = length < sizeof(msg) - 1 ? length : sizeof(msg) - 1;
  memcpy(msg, payload, n);
  msg[n] = '\0';

  if (strcmp(topic, TOPIC_COMMAND) != 0) {
    return;
  }

  int powerValue;
  int airflowValue;
  int temperatureValue;
  if (sscanf(msg, "%d/%d/%d", &powerValue, &airflowValue, &temperatureValue) == 3) {
    applyPower(powerValue == 1);
    if (powerValue == 1) {
      applyAirflow(airflowValue);
    }
    applyTemperature(temperatureValue);
  } else {
    Serial.printf("Invalid command -> %s\n", msg);
  }
}

bool connectMqtt() {
  Serial.print("MQTT connecting...");
  if (mqtt.connect(clientId.c_str())) {
    Serial.println(" ok");
    mqtt.subscribe(TOPIC_COMMAND);
    publishState();
    return true;
  }
  Serial.printf(" fail rc=%d\n", mqtt.state());
  return false;
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  setLed(false);

  Serial.begin(115200);
  delay(500);
  Serial.println("\nGale ESP32 Super Mini");

  clientId = "gale-esp32-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\nIP %s\n", WiFi.localIP().toString().c_str());

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(30);
}

void loop() {
  if (!mqtt.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAttempt > 3000) {
      lastReconnectAttempt = now;
      if (connectMqtt()) {
        lastReconnectAttempt = 0;
      }
    }
  } else {
    mqtt.loop();

    // Gentle heartbeat so the web UI can show the board is alive
    if (millis() - lastStatePublish > 15000) {
      lastStatePublish = millis();
      publishState();
    }
  }
}
