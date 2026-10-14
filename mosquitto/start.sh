#!/bin/sh
# First start: create the Dynamic Security file with the backend's admin
# login. Later starts keep it (it holds every device's credentials).
set -e
F=/mosquitto/data/dynamic-security.json
if [ ! -f "$F" ]; then
  mosquitto_ctrl dynsec init "$F" admin "$MQTT_BRIDGE_PASSWORD"
fi
chown -R mosquitto:mosquitto /mosquitto/data
chmod 0700 "$F"
exec mosquitto -c /mosquitto/config/mosquitto.conf
