/*
  Smart Extension - Firmware ESP32 (3-Channel)
  Pinout:
  - Relay 1: GPIO 26 (Stop Kontak #1)
  - Relay 2: GPIO 27 (Stop Kontak #2)
  - Relay 3: GPIO 25 (Stop Kontak #3)
  - Sensor PZEM-004T: RX2 GPIO 16, TX2 GPIO 17
  - Sensor DS18B20: GPIO 4
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "NAMA_WIFI";
const char* WIFI_PASSWORD = "PASSWORD_WIFI";
const char* SERVER_URL    = "http://192.168.1.10:3000/api/status";

#define RELAY_1 26
#define RELAY_2 27
#define RELAY_3 25

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_1, OUTPUT);
  pinMode(RELAY_2, OUTPUT);
  pinMode(RELAY_3, OUTPUT);

  digitalWrite(RELAY_1, HIGH);
  digitalWrite(RELAY_2, HIGH);
  digitalWrite(RELAY_3, HIGH);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi Terhubung!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      StaticJsonDocument<1024> doc;
      if (!deserializeJson(doc, payload)) {
        bool r1 = doc["sockets"]["1"]["relayState"];
        bool t1 = doc["sockets"]["1"]["isTripped"];
        bool r2 = doc["sockets"]["2"]["relayState"];
        bool t2 = doc["sockets"]["2"]["isTripped"];
        bool r3 = doc["sockets"]["3"]["relayState"];
        bool t3 = doc["sockets"]["3"]["isTripped"];

        digitalWrite(RELAY_1, (r1 && !t1) ? HIGH : LOW);
        digitalWrite(RELAY_2, (r2 && !t2) ? HIGH : LOW);
        digitalWrite(RELAY_3, (r3 && !t3) ? HIGH : LOW);
      }
    }
    http.end();
  }
  delay(1000);
}
