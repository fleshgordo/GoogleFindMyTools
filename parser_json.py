#!/usr/bin/env python3
# filepath: /Users/gordo/Downloads/_SRC/GoogleFindMyTools/parser_json.py
import json
import csv
import sys
import os
import datetime
import argparse

def main():
    # Set up command line argument parsing
    parser = argparse.ArgumentParser(description="Parse JSON location data from stdin and save to CSV")
    parser.add_argument("output", nargs="?", default="locations.csv", help="Output CSV file name")
    args = parser.parse_args()

    # Create www/data directory if it doesn't exist
    os.makedirs("www/data", exist_ok=True)
    
    # Set output path to www/data/[filename]
    csv_file = os.path.join("www/data", args.output)
    
    seen_timestamps = set()

    # Load existing timestamps from the CSV to avoid duplicates
    if os.path.exists(csv_file):
        with open(csv_file, newline="") as f:
            reader = csv.DictReader(f)
            # Check if CSV has header by verifying fieldnames
            if reader.fieldnames and "timestamp" in reader.fieldnames:
                for row in reader:
                    seen_timestamps.add(row["timestamp"])
            else:
                print(f"Warning: {csv_file} does not have the expected header.", file=sys.stderr)

    # Prepare to append new unique entries
    new_entries = []

    # Get current timestamp for recording date
    current_time = datetime.datetime.now().isoformat()

    for line in sys.stdin:
        if line.startswith("JSON "):
            try:
                data = json.loads(line[5:])
                if data["timestamp"] not in seen_timestamps:
                    # Add recording date to each entry
                    data["recorded_at"] = current_time
                    new_entries.append(data)
                    seen_timestamps.add(data["timestamp"])
            except json.JSONDecodeError:
                print(f"Warning: could not parse line as JSON: {line.strip()}", file=sys.stderr)

    # Write new entries
    write_header = not os.path.exists(csv_file)

    with open(csv_file, "a", newline="") as f:
        # Update fieldnames to include recorded_at as the first field
        writer = csv.DictWriter(f, fieldnames=["recorded_at", "timestamp", "lat", "lon", "altitude", "posname"])
        if write_header:
            writer.writeheader()
        writer.writerows(new_entries)

    print(f"Appended {len(new_entries)} new entries to {csv_file}")

if __name__ == "__main__":
    main()
