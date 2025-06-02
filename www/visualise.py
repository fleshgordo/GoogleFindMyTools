#!/usr/bin/env python3
import pandas as pd
import math
import matplotlib.pyplot as plt

# Haversine function to calculate distance in meters between two lat/lon pairs.
def haversine(lat1, lon1, lat2, lon2):
    # Convert decimal degrees to radians.
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371000  # Radius of Earth in meters.
    return c * r

# Read your CSV file.
# Adjust the filename as necessary.
# Assumed columns:
# col0: ISO timestamp, col1: human-readable timestamp, col2: latitude, col3: longitude, col4: value, col5: extra
df = pd.read_csv('data/moto_a.csv', header=None)
df.columns = ['iso_timestamp', 'timestamp', 'lat', 'lon', 'value', 'extra']

# Convert latitude and longitude columns to numeric.
df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
df['lon'] = pd.to_numeric(df['lon'], errors='coerce')

# Convert 'timestamp' column to datetime.
df['timestamp'] = pd.to_datetime(df['timestamp'], format='%Y-%m-%d %H:%M:%S', errors='coerce')

# Create lists to hold distances from previous and next points.
prev_dists = [None] * len(df)
next_dists = [None] * len(df)

# Set the threshold in meters, e.g., 100 meters.
threshold = 1000

# Compute distances between consecutive points.
for i in range(len(df)):
    if i > 0:
        prev_dists[i] = haversine(df.loc[i-1, 'lat'], df.loc[i-1, 'lon'],
                                  df.loc[i, 'lat'], df.loc[i, 'lon'])
    else:
        prev_dists[i] = None

    if i < len(df) - 1:
        next_dists[i] = haversine(df.loc[i, 'lat'], df.loc[i, 'lon'],
                                  df.loc[i+1, 'lat'], df.loc[i+1, 'lon'])
    else:
        next_dists[i] = None

df['prev_distance'] = prev_dists
df['next_distance'] = next_dists

# Classify each entry as static or moving.
def classify(row):
    if pd.notnull(row['prev_distance']) and pd.notnull(row['next_distance']):
        if row['prev_distance'] <= threshold and row['next_distance'] <= threshold:
            return 'static'
        else:
            return 'moving'
    elif pd.isnull(row['prev_distance']) and pd.notnull(row['next_distance']):
        return 'static' if row['next_distance'] <= threshold else 'moving'
    elif pd.notnull(row['prev_distance']) and pd.isnull(row['next_distance']):
        return 'static' if row['prev_distance'] <= threshold else 'moving'
    else:
        return 'unknown'

df['movement'] = df.apply(classify, axis=1)

# Optionally, save the annotated data to a new CSV file.
df.to_csv('annotated_output.csv', index=False)

# Print out some statistics for inspection.
print(df[['prev_distance', 'next_distance', 'movement']])

# Plot a simple scatter plot to visualize movement classification.
plt.figure(figsize=(12, 6))

# Use colors based on movement classification.
colors = {'static': 'green', 'moving': 'red', 'unknown': 'gray'}
plt.scatter(df['timestamp'], df['lat'],
           c=df['movement'].apply(lambda x: colors.get(x, 'black')),
           label='Entries')
plt.xlabel('Timestamp')
plt.ylabel('Latitude')
plt.title('Movement Classification Over Time (Green=Static, Red=Moving)')
plt.tight_layout()
plt.show()