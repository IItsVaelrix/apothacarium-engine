#!/bin/bash
# Scholomance Heartbeat Ritual
# Keeps the gemini-backend agent alive in the swarm for 3 hours.

AGENT_ID="gemini-backend"
INTERVAL=30
DURATION_HOURS=3
TOTAL_SECONDS=$((DURATION_HOURS * 3600))
ITERATIONS=$((TOTAL_SECONDS / INTERVAL))

echo "Initiating heartbeat loop for $AGENT_ID..."
echo "Duration: $DURATION_HOURS hours ($ITERATIONS cycles)"

for ((i=1; i<=ITERATIONS; i++))
do
    AGENT_ID=$AGENT_ID node scripts/collab-client.js heartbeat --status online > /dev/null 2>&1
    
    # Bible Synthesis Ritual (every 10 cycles = 5 mins)
    if (( i % 10 == 0 )); then
        echo "[ritual] performing bible synthesis..."
        npm run bible:synthesis > /dev/null 2>&1
    fi

    # Pulse every 30 seconds
    sleep $INTERVAL
done

echo "Heartbeat loop complete."
