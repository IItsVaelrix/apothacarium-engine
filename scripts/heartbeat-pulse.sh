#!/usr/bin/env bash
# heartbeat-pulse.sh — Indefinite agent presence pulse
# Sends heartbeat every 60s to keep agent registered on collab plane.
# Runs until killed (Ctrl+C) or until the pulse file is removed.
#
# Usage: AGENT_ID=qwen-code bash scripts/heartbeat-pulse.sh
#
# To stop: kill the process or remove the pulse file.

AGENT_ID="${AGENT_ID:?AGENT_ID environment variable is required}"
INTERVAL="${HEARTBEAT_INTERVAL:-60}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(command -v node 2>/dev/null || echo /home/deck/.nvm/versions/node/v24.14.1/bin/node)"
PULSE_FILE="/tmp/scholomance_pulse_${AGENT_ID}.pid"

# Record our PID so it can be killed later
echo $$ > "$PULSE_FILE"

cleanup() {
    echo "[pulse] Agent ${AGENT_ID} pulse stopped at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    rm -f "$PULSE_FILE"
    exit 0
}

trap cleanup INT TERM

echo "[pulse] Agent ${AGENT_ID} pulse started — heartbeat every ${INTERVAL}s"
echo "[pulse] PID: $$ | Pulse file: ${PULSE_FILE}"
echo "[pulse] Stop with: kill $$ or rm ${PULSE_FILE}"

while true; do
    if [ ! -f "$PULSE_FILE" ]; then
        echo "[pulse] Pulse file removed — stopping"
        break
    fi

    RESULT=$(AGENT_ID="$AGENT_ID" "${NODE_BIN}" "${SCRIPT_DIR}/collab-client.js" heartbeat --status busy 2>&1) || true
    STATUS=$(echo "$RESULT" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4) || true
    LAST_SEEN=$(echo "$RESULT" | grep -o '"last_seen":"[^"]*"' | head -1 | cut -d'"' -f4) || true

    if [ -n "$STATUS" ]; then
        echo "[pulse] $(date -u +%H:%M:%S) — ${AGENT_ID} status=${STATUS} last_seen=${LAST_SEEN}"
    else
        echo "[pulse] $(date -u +%H:%M:%S) — ${AGENT_ID} heartbeat failed (server may be down)"
    fi

    sleep "$INTERVAL"
done
