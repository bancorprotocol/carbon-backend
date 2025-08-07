#!/bin/bash

# CSV Deduplication Script - Chronologically Aware
# Usage: ./deduplicate-csv.sh input.csv [output.csv]
# Keeps the LATEST event state for each strategy_id + sub_epoch_timestamp combination
# Uses last_event_timestamp (column 33) to determine chronological order
# If no output file is specified, creates input_deduplicated.csv

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "Usage: $0 input.csv [output.csv]"
    echo "Examples:"
    echo "  $0 reward_breakdown.csv                           # Creates reward_breakdown_deduplicated.csv"
    echo "  $0 reward_breakdown.csv reward_breakdown_clean.csv # Creates specified output file"
    exit 1
fi

INPUT_FILE="$1"

# Generate output filename if not provided
if [ $# -eq 2 ]; then
    OUTPUT_FILE="$2"
else
    # Extract filename without extension and directory
    BASENAME=$(basename "$INPUT_FILE" .csv)
    DIRNAME=$(dirname "$INPUT_FILE")
    OUTPUT_FILE="${DIRNAME}/${BASENAME}_deduplicated.csv"
fi

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found"
    exit 1
fi

echo "Deduplicating CSV: $INPUT_FILE -> $OUTPUT_FILE"
echo "Original file will be preserved, creating deduplicated copy..."
echo "Keeping LATEST event state for each strategy_id + sub_epoch_timestamp..."

# Save header to output file
head -n 1 "$INPUT_FILE" > "$OUTPUT_FILE"

# Process data rows:
# 1. Skip header (tail -n +2)
# 2. Sort by strategy_id (col 1), sub_epoch_timestamp (col 4), and last_event_timestamp (col 33) DESCENDING
# 3. Use awk to keep only the FIRST occurrence (which will be the latest event state) of each key
tail -n +2 "$INPUT_FILE" | \
sort -t',' -k1,1 -k4,4 -k33,33nr | \
awk -F',' '{
  key = $1 "," $4
  if (!(key in seen)) {
    row[key] = $0
    seen[key] = 1
  }
} 
END {
  for (k in row) print row[k]
}' >> "$OUTPUT_FILE"

# Count original vs deduplicated rows
ORIGINAL_ROWS=$(wc -l < "$INPUT_FILE")
DEDUPLICATED_ROWS=$(wc -l < "$OUTPUT_FILE")
REMOVED_ROWS=$((ORIGINAL_ROWS - DEDUPLICATED_ROWS))

echo "✅ Chronological deduplication complete!"
echo "   Original file: $INPUT_FILE (preserved)"
echo "   Deduplicated file: $OUTPUT_FILE (created)"
echo "   Original rows: $ORIGINAL_ROWS"
echo "   Final rows: $DEDUPLICATED_ROWS" 
echo "   Removed duplicates: $REMOVED_ROWS"
echo "   Logic: Kept entries with LATEST last_event_timestamp for each strategy+timestamp"