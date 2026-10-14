"""Subscribe to ingest/+ and store each message through the same path as
HTTP ingest. Runs as its own container.

The broker has already authenticated the sender (username dev<id> + API
key) and its ACL lets a device publish only to ingest/<its username>, so
the topic identifies the device and no key is needed here.
"""
import logging
import re
import time

import paho.mqtt.client as mqtt

from ..db import init_pool
from . import broker
from . import ingest as iot

log = logging.getLogger("mqtt_bridge")
_TOPIC = re.compile(r"^ingest/dev(\d+)$")


def on_connect(client, userdata, flags, reason, props):
    if reason.is_failure:
        log.error("gagal terhubung ke broker: %s", reason)
        return
    client.subscribe("ingest/+", qos=1)
    log.info("terhubung ke %s:%s, subscribe ingest/+", broker.HOST, broker.PORT)


def on_message(client, userdata, msg):
    m = _TOPIC.match(msg.topic)
    if not m:
        return
    try:
        res = iot.ingest_device(int(m.group(1)), msg.payload, "mqtt")
        log.info("mqtt perangkat %s: %d field (%d baru)", res["device_id"], res["fields"], res["new_fields"])
    except iot.Rejected as exc:
        log.warning("mqtt %s ditolak: %s", msg.topic, exc)
    except Exception:  # noqa: BLE001 - one bad message must not stop the bridge
        log.exception("mqtt error")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    init_pool()
    while True:  # the broker may start after us
        try:
            broker.ensure_setup()
            break
        except broker.BrokerError as exc:
            log.warning("broker belum siap (%s), coba lagi 3 detik", exc)
            time.sleep(3)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="atlas-bridge")
    client.username_pw_set(broker.ADMIN_USER, broker.ADMIN_PASSWORD)
    client.on_connect, client.on_message = on_connect, on_message
    client.connect(broker.HOST, broker.PORT, keepalive=60)
    client.loop_forever(retry_first_connection=True)


if __name__ == "__main__":
    main()
