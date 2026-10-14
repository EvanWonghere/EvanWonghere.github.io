#!/usr/bin/env bash
# Write lines.csv: for every commit since 2026-08-01 that touched the old guest FSM or the
# Encounter bridge, record the line count of both files. Usage: collect_lines.sh <HeirCut checkout> > lines.csv
set -u  # no -e: git show fails for commits where a file does not exist yet, which counts as 0 lines
cd "$1"
git log HEAD --since=2026-08-01 --format='%h %cI' -- \
    Assets/Scripts/GuestSystem/GuestStates.cs \
    Assets/Scripts/HeirCutLegacy/LegacyEncounterBridge.cs \
    Assets/Scripts/HeirCutLegacy/Stage3EncounterRuntimeHost.cs |
while read -r h d; do
    gs=$(git show "${h}:Assets/Scripts/GuestSystem/GuestStates.cs" 2>/dev/null | wc -l | tr -d ' ')
    b1=$(git show "${h}:Assets/Scripts/HeirCutLegacy/LegacyEncounterBridge.cs" 2>/dev/null | wc -l | tr -d ' ')
    b2=$(git show "${h}:Assets/Scripts/HeirCutLegacy/Stage3EncounterRuntimeHost.cs" 2>/dev/null | wc -l | tr -d ' ')
    echo "$d,$h,$gs,$((b1 + b2))"
done | sort
