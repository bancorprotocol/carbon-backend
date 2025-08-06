#!/bin/bash

# CSV Deduplication Script
# Usage: ./deduplicate-csv.sh input.csv output.csv
# Keeps the LATEST occurrence of each strategy_id + sub_epoch_timestamp combination

if [ $# -ne 2 ]; then
    echo "Usage: $0 input.csv output.csv"
    echo "Example: $0 reward_breakdown_input.csv reward_breakdown_clean.csv"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="$2"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found"
    exit 1
fi

echo "Deduplicating CSV: $INPUT_FILE -> $OUTPUT_FILE"
echo "Keeping latest occurrence of each strategy_id + sub_epoch_timestamp..."

# Save header to output file
head -n 1 "$INPUT_FILE" > "$OUTPUT_FILE"

# Process data rows:
# 1. Skip header (tail -n +2)
# 2. Sort by strategy_id (column 1) and sub_epoch_timestamp (column 4)  
# 3. Use awk to keep only the last occurrence of each key
tail -n +2 "$INPUT_FILE" | \
sort -t',' -k1,1 -k4,4 | \
awk -F',' '{
  key = $1 "," $4
  row[key] = $0
} 
END {
  for (k in row) print row[k]
}' >> "$OUTPUT_FILE"

# Count original vs deduplicated rows
ORIGINAL_ROWS=$(wc -l < "$INPUT_FILE")
DEDUPLICATED_ROWS=$(wc -l < "$OUTPUT_FILE")
REMOVED_ROWS=$((ORIGINAL_ROWS - DEDUPLICATED_ROWS))

echo "✅ Deduplication complete!"
echo "   Original rows: $ORIGINAL_ROWS"
echo "   Final rows: $DEDUPLICATED_ROWS" 
echo "   Removed duplicates: $REMOVED_ROWS"