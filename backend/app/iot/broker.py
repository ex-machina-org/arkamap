"""Device credentials on the MQTT broker (Mosquitto Dynamic Security).

The broker rejects any CONNECT without valid credentials: username
`dev<id>`, password = the device's API key. Each device gets its own role
allowing publish to exactly `ingest/<username>` (Mosquitto 2.0's dynsec
does not substitute %u in ACLs, verified), so the bridge can trust the
topic. We never keep the plain key; Mosquitto stores its own salted hash.
"""
import json
import logging
import os
import threading
import uuid

import paho.mqtt.client as mqtt

log = logging.getLogger(__name__)

HOST = os.getenv("MQTT_HOST", "localhost")
PORT = int(os.getenv("MQTT_PORT_INTERNAL", "1883"))
ADMIN_USER = "admin"
ADMIN_PASSWORD = os.getenv("MQTT_BRIDGE_PASSWORD", "dev-bridge-password")
CONTROL = "$CONTROL/dynamic-security/v1"


class BrokerError(RuntimeError):
    pass


def username(device_id: int) -> str:
    return f"dev{device_id}"


def topic(device_id: int) -> str:
    return f"ingest/{username(device_id)}"


def control(commands: list[dict], ok_errors: tuple[str, ...] = (), timeout: float = 5) -> None:
    """Send Dynamic Security commands as the broker admin and wait for the
    answer. Errors listed in ok_errors (e.g. 'already exists') are ignored."""
    done, answer = threading.Event(), {}

    def on_connect(c, userdata, flags, reason, props):
        if reason.is_failure:
            answer["error"] = f"login admin broker gagal: {reason}"
            done.set()
            return
        c.subscribe(CONTROL + "/response", qos=1)

    def on_subscribe(c, userdata, mid, reasons, props):
        c.publish(CONTROL, json.dumps({"commands": commands}), qos=1)

    def on_message(c, userdata, msg):
        answer["responses"] = json.loads(msg.payload).get("responses", [])
        done.set()

    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"atlas-ctl-{uuid.uuid4().hex[:8]}")
    c.username_pw_set(ADMIN_USER, ADMIN_PASSWORD)
    c.on_connect, c.on_subscribe, c.on_message = on_connect, on_subscribe, on_message
    try:
        c.connect(HOST, PORT, keepalive=10)
    except OSError as exc:
        raise BrokerError(f"broker MQTT tidak bisa dihubungi: {exc}") from exc
    c.loop_start()
    try:
        if not done.wait(timeout):
            raise BrokerError("broker MQTT tidak menjawab")
        if "error" in answer:
            raise BrokerError(answer["error"])
        for r in answer["responses"]:
            err = r.get("error")
            if err and not any(e in err for e in ok_errors):
                raise BrokerError(f"{r.get('command')}: {err}")
    finally:
        c.loop_stop()
        c.disconnect()


def ensure_setup() -> None:
    """Idempotent: the admin (the bridge) may read everything devices send."""
    control([
        {"command": "addRoleACL", "rolename": "admin", "acltype": "subscribePattern",
         "topic": "ingest/#", "priority": 0, "allow": True},
        {"command": "addRoleACL", "rolename": "admin", "acltype": "publishClientReceive",
         "topic": "ingest/#", "priority": 0, "allow": True},
    ], ok_errors=("already exists", "already in"))


def _role(device_id: int) -> str:
    return f"r_{username(device_id)}"


def add_device(device_id: int, key: str) -> None:
    control([
        {"command": "createRole", "rolename": _role(device_id), "acls": [
            {"acltype": "publishClientSend", "topic": topic(device_id), "priority": 0, "allow": True}]},
        {"command": "createClient", "username": username(device_id), "password": key,
         "roles": [{"rolename": _role(device_id)}]},
    ], ok_errors=("Role already exists",))


def set_key(device_id: int, key: str) -> None:
    """Rotate, or recreate if the client is missing (e.g. created before
    broker auth existed)."""
    try:
        control([{"command": "setClientPassword", "username": username(device_id), "password": key}])
    except BrokerError as exc:
        if "not found" not in str(exc):
            raise
        add_device(device_id, key)


def remove_device(device_id: int) -> None:
    control([{"command": "deleteClient", "username": username(device_id)},
             {"command": "deleteRole", "rolename": _role(device_id)}], ok_errors=("not found",))
