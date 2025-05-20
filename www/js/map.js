// Initialize map
const INIT_LAT = "46.5202958";
const INIT_LON = "6.6304485";

const map = L.map("map").setView([INIT_LAT, INIT_LON], 10);

// Add a minimal tile layer (CartoDB Positron)
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://carto.com/attributions">CARTO</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

// Store all markers by file
const allMarkers = {};
const allPoints = {};
let colorIndex = 0;
const colors = [
  "#e41a1c",
  "#377eb8",
  "#4daf4a",
  "#984ea3",
  "#ff7f00",
  "#ffff33",
  "#a65628",
  "#f781bf",
];

// Format timestamp in a human-friendly way
function formatTimestamp(timestamp) {
  if (!timestamp) return "Unknown time";

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return timestamp; // Return original if invalid

  const now = new Date();
  const diff = now - date;

  // If less than a day, show relative time
  if (diff < 86400000) {
    // 24 hours
    if (diff < 60000) return "Just now"; // Less than a minute
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`; // Less than an hour
    return `${Math.floor(diff / 3600000)} hours ago`; // Hours
  }

  // If less than a week, show day and time
  if (diff < 604800000) {
    // 7 days
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return `${days[date.getDay()]} at ${date.getHours()}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }

  // Otherwise show full date
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

// Create pulsating marker effect
function createPulsatingMarker(latlng, color) {
  const pulsingIcon = L.divIcon({
    className: "pulsating-marker",
    html: `<div class="pulsating-circle" style="background-color: ${color}"></div>`,
    iconSize: [20, 20],
  });

  return L.marker(latlng, {
    icon: pulsingIcon,
    zIndexOffset: 1000, // Ensure it's above other markers
  });
}

// Parse CSV function
function parseCSV(text) {
  const lines = text.split("\n");
  const headers = lines[0].split(",");

  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const values = line.split(",");
      const obj = {};

      headers.forEach((header, i) => {
        obj[header.trim()] = values[i] ? values[i].trim() : "";
      });

      return obj;
    });
}

// Load available data files from data directory
async function loadAvailableFiles() {
  try {
    const response = await fetch("./data/");

    // If directory listing is supported
    if (response.ok) {
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const links = doc.querySelectorAll("a");

      const dataSelect = document.getElementById("dataSelect");
      dataSelect.innerHTML = "";

      let foundFiles = false;

      links.forEach((link) => {
        const href = link.getAttribute("href");
        if (href && href.toLowerCase().endsWith(".csv")) {
          foundFiles = true;
          const option = document.createElement("option");
          option.value = href;
          option.textContent = href;
          dataSelect.appendChild(option);
        }
      });

      if (!foundFiles) {
        dataSelect.innerHTML =
          '<option value="" disabled>No CSV files found</option>';
      }
    } else {
      // Fetch specific files we know should be there
      const files = ["locations.csv"];
      const dataSelect = document.getElementById("dataSelect");
      dataSelect.innerHTML = "";

      files.forEach((file) => {
        fetch(`./${file}`, { method: "HEAD" }).then((response) => {
          if (response.ok) {
            const option = document.createElement("option");
            option.value = file;
            option.textContent = file;
            dataSelect.appendChild(option);
          }
        });
      });
    }
  } catch (error) {
    console.error("Error loading file list:", error);
    document.getElementById("dataSelect").innerHTML =
      '<option value="" disabled>Error loading files</option>';
  }
}

// Add this function near the top of your file, after your other utility functions
async function fetchAndProcessData(fileName, isUpdate = false) {
  try {
    console.log(`Loading file: ${fileName}`);
    const response = await fetch(`${fileName}`); // Add cache-busting parameter
    const content = await response.text();

    // Create a file object from the content
    const blob = new Blob([content], { type: "text/csv" });
    const file = new File([blob], fileName, { type: "text/csv" });

    // Process the file and track if it was updated
    return processData(file, isUpdate);
  } catch (error) {
    console.error(`Error loading file ${fileName}:`, error);
    return false;
  }
}

// Refactor processFile to processData that can handle both new files and updates
async function processData(file, isUpdate = false) {
  const content = file.text
    ? await file.text()
    : await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(file);
      });

  const data = parseCSV(content);

  // Filter only entries with valid coordinates
  const validPoints = data.filter(
    (point) => !isNaN(parseFloat(point.lat)) && !isNaN(parseFloat(point.lon))
  );

  if (validPoints.length === 0) {
    alert(`No valid coordinates found in file: ${file.name}`);
    return false;
  }

  // Get existing points if updating
  const existingPoints = isUpdate ? allPoints[file.name] || [] : [];
  const existingCount = existingPoints.length;

  // If updating, find only new points
  let newPoints = validPoints;
  if (isUpdate && existingCount > 0) {
    const existingTimestamps = new Set(
      existingPoints.map((p) => p.timestamp || p.recorded_at)
    );

    newPoints = validPoints.filter((point) => {
      const timestamp = point.timestamp || point.recorded_at;
      return !existingTimestamps.has(timestamp);
    });

    if (newPoints.length === 0) {
      console.log(`No new points found in ${file.name}`);
      return false;
    }

    console.log(`Found ${newPoints.length} new points in ${file.name}`);
  }

  // Choose color - use existing color if updating, or get a new one
  let color;
  if (isUpdate && allMarkers[file.name] && allMarkers[file.name].length > 0) {
    // Get the color from existing markers
    const existingMarker = allMarkers[file.name][0];
    color = existingMarker.options.fillColor;
  } else {
    color = colors[colorIndex % colors.length];
    colorIndex++;

    // Initialize arrays if new file
    if (!allMarkers[file.name]) allMarkers[file.name] = [];
    if (!allPoints[file.name]) allPoints[file.name] = [];
  }

  // Combine points for processing
  const allFilePoints = [...existingPoints, ...newPoints];

  // Store updated points
  allPoints[file.name] = allFilePoints;

  // Find most recent point
  let mostRecentPoint = allFilePoints[0];
  let mostRecentTimestamp =
    mostRecentPoint.timestamp || mostRecentPoint.recorded_at;
  let mostRecentIndex = 0;

  allFilePoints.forEach((point, index) => {
    const timestamp = point.timestamp || point.recorded_at;
    if (timestamp && new Date(timestamp) > new Date(mostRecentTimestamp)) {
      mostRecentPoint = point;
      mostRecentTimestamp = timestamp;
      mostRecentIndex = index;
    }
  });

  // If updating, remove any existing pulsing markers
  if (isUpdate) {
    allMarkers[file.name] = allMarkers[file.name].filter((marker) => {
      if (marker._icon && marker._icon.classList.contains("pulsating-marker")) {
        map.removeLayer(marker);
        return false;
      }
      return true;
    });
  }

  // Add markers for new points only
  newPoints.forEach((point) => {
    const lat = parseFloat(point.lat);
    const lng = parseFloat(point.lon);
    const timestamp = point.timestamp || point.recorded_at;

    // Calculate opacity based on age relative to most recent point
    let opacity = 1.0;
    if (timestamp && mostRecentTimestamp) {
      const pointDate = new Date(timestamp);
      const mostRecentDate = new Date(mostRecentTimestamp);

      if (!isNaN(pointDate.getTime()) && !isNaN(mostRecentDate.getTime())) {
        const ageInHours = (mostRecentDate - pointDate) / (1000 * 60 * 60);
        opacity = Math.max(0.3, 1 - ageInHours / 72);
      }
    }

    // Create marker
    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: color,
      stroke: false,
      weight: 1,
      opacity: opacity,
      fillOpacity: opacity * 0.8,
    }).addTo(map);

    marker.bindPopup(`
      <strong>Point ${allPoints[file.name].indexOf(point) + 1}</strong><br>
      Latitude: ${lat.toFixed(6)}<br>
      Longitude: ${lng.toFixed(6)}<br>
      ${point.altitude ? `Altitude: ${point.altitude} m<br>` : ""}
      Recorded: ${formatTimestamp(timestamp)}
      ${
        timestamp === mostRecentTimestamp
          ? "<br><strong>(Most recent location)</strong>"
          : ""
      }
    `);

    allMarkers[file.name].push(marker);
  });

  // Add pulsating effect for most recent point
  const mrlat = parseFloat(mostRecentPoint.lat);
  const mrlng = parseFloat(mostRecentPoint.lon);
  const pulsingMarker = createPulsatingMarker([mrlat, mrlng], color).addTo(map);
  allMarkers[file.name].push(pulsingMarker);

  // Update or create sidebar entry
  updateSidebar(file.name, allFilePoints, color, mostRecentIndex);

  // Show control buttons
  document.getElementById("fitAllBtn").style.display = "inline-block";
  document.getElementById("clearBtn").style.display = "inline-block";

  // Focus on most recent point if requested
  if (
    !isUpdate ||
    newPoints.some(
      (p) => (p.timestamp || p.recorded_at) === mostRecentTimestamp
    )
  ) {
    setTimeout(() => {
      map.setView([mrlat, mrlng], 16);
      // Find marker for most recent point
      allMarkers[file.name].forEach((marker) => {
        if (
          marker.getLatLng &&
          marker.getLatLng().lat === mrlat &&
          marker.getLatLng().lng === mrlng &&
          marker.openPopup
        ) {
          marker.openPopup();
        }
      });
    }, 500);
  }

  return true;
}

// Simplified sidebar update function
function updateSidebar(fileName, points, color, mostRecentIndex) {
  const fileNameOnly = fileName.split(/[\\/]/).pop();
  const existingDiv = Array.from(document.querySelectorAll(".file-info")).find(
    (div) => div.querySelector("strong").textContent === fileNameOnly
  );

  const html = `
    <div>
      <span class="color-indicator" style="background-color: ${color};"></span>
      <strong>${fileNameOnly}</strong> (${points.length} points)
    </div>
    <div class="point-list">
      ${points
        .map(
          (point, i) => `
        <div class="point-item ${i === mostRecentIndex ? "recent-point" : ""}" 
             data-file="${fileName}" data-index="${i}">
          ${point.posname || `Point ${i + 1}`}
          <div class="timestamp">${formatTimestamp(
            point.timestamp || point.recorded_at
          )}</div>
          ${
            i === mostRecentIndex
              ? '<span class="latest-indicator">Latest</span>'
              : ""
          }
        </div>
      `
        )
        .join("")}
    </div>
  `;

  if (existingDiv) {
    // Update existing div
    existingDiv.innerHTML = html;
  } else {
    // Create new div
    const datasetDiv = document.createElement("div");
    datasetDiv.className = "file-info";
    datasetDiv.innerHTML = html;
    document.getElementById("datasets").appendChild(datasetDiv);
  }

  // Add click events to points
  const container =
    existingDiv || document.getElementById("datasets").lastChild;
  const pointItems = container.querySelectorAll(".point-item");
  pointItems.forEach((item) => {
    item.addEventListener("click", function () {
      const fileName = this.getAttribute("data-file");
      const index = parseInt(this.getAttribute("data-index"));
      const marker = allMarkers[fileName][index];

      map.setView(marker.getLatLng(), 18);
      marker.openPopup();
    });
  });
}

// // Event listener for file input
// document.getElementById("loadBtn").addEventListener("click", function () {
//   const fileInput = document.getElementById("fileInput");
//   const files = fileInput.files;

//   if (files.length === 0) {
//     alert("Please select at least one CSV file.");
//     return;
//   }

//   // Process each file
//   for (let i = 0; i < files.length; i++) {
//     processData(files[i]);
//   }
// });

// Load selected files from the dropdown
document
  .getElementById("loadSelectedBtn")
  .addEventListener("click", function () {
    const dataSelect = document.getElementById("dataSelect");
    const selectedOptions = Array.from(dataSelect.selectedOptions);

    if (selectedOptions.length === 0) {
      alert("Please select at least one file from the list.");
      return;
    }

    // Show loading indicator
    const loadingIndicator = document.getElementById("loadingIndicator");
    loadingIndicator.style.display = "inline-block";

    // Process each selected file
    const promises = selectedOptions.map((option) =>
      fetchAndProcessData(option.value)
    );

    Promise.all(promises).then(() => {
      loadingIndicator.style.display = "none";
    });
  });

// Add event listener for the update button
document.getElementById("updateDataBtn").addEventListener("click", function () {
  const dataSelect = document.getElementById("dataSelect");
  const selectedOptions = Array.from(dataSelect.selectedOptions);

  if (selectedOptions.length === 0) {
    alert("Please select at least one file to update.");
    return;
  }

  // Show loading indicator
  const loadingIndicator = document.getElementById("loadingIndicator");
  loadingIndicator.style.display = "inline-block";

  // Update each selected file
  const promises = selectedOptions.map((option) =>
    fetchAndProcessData(option.value, true)
  );

  Promise.all(promises).then(() => {
    loadingIndicator.style.display = "none";
  });
});

// Fit all points
document.getElementById("fitAllBtn").addEventListener("click", function () {
  const allBounds = [];

  Object.keys(allMarkers).forEach((fileName) => {
    allMarkers[fileName].forEach((marker) => {
      allBounds.push(marker.getLatLng());
    });
  });

  if (allBounds.length > 0) {
    const bounds = L.latLngBounds(allBounds);
    map.fitBounds(bounds);
  }
});

// Clear all
document.getElementById("clearBtn").addEventListener("click", function () {
  Object.keys(allMarkers).forEach((fileName) => {
    allMarkers[fileName].forEach((marker) => {
      map.removeLayer(marker);
    });
  });

  // Clear stored data
  colorIndex = 0;
  Object.keys(allMarkers).forEach((key) => delete allMarkers[key]);
  Object.keys(allPoints).forEach((key) => delete allPoints[key]);

  // Clear UI
  document.getElementById("datasets").innerHTML = "";
  document.getElementById("fitAllBtn").style.display = "none";
  document.getElementById("clearBtn").style.display = "none";

  // Reset map view
  map.setView([INIT_LAT, INIT_LON], 12);
});

// Load available files on initial page load
loadAvailableFiles();
