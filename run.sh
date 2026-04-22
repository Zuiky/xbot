#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Installing dependencies..."
pip3 install -r requirements.txt --upgrade

echo "✅ Starting Twitter PRO Bot (Auto Restart)"
while true; do
    echo "📡 Bot starting... $(date)"
    python3 bot.py
    echo "💥 Bot crashed! Restarting in 5s... $(date)"
    sleep 5
done
