document.addEventListener("alpine:init", () => {
  Alpine.data("beaconFinder", () => ({
    // State variables
    sidebarCollapsed: false,
    availableFiles: [],
    isLoading: false,
    hasLoadedData: false,
    showLines: false,
    datasetsHTML: "",

    // Map related variables
    map: null,
    allMarkers: {},
    allPoints: {},
    allPolylines: {},
    colorIndex: 0,
    colors: [
      "#e41a1c",
      "#377eb8",
      "#4daf4a",
      "#984ea3",
      "#ff7f00",
      "#ffff33",
      "#a65628",
      "#f781bf",
    ],

    // Additional state properties
    filePoints: {}, // Store points by file
    fileColors: {}, // Store colors by file
    fileMostRecentIndices: {}, // Store most recent index by file

    // Initialization
    init() {
      this.initMap();
      this.loadAvailableFiles();

      // Set up watchers
      this.$watch("showLines", (value) => {
        this.togglePolylines(value);
      });
    },

    // Initialize the map
    initMap() {
      const INIT_LAT = 46.5202958;
      const INIT_LON = 6.6304485;
      const INIT_ZOOM = 10;

      this.map = L.map(this.$refs.mapContainer).setView(
        [INIT_LAT, INIT_LON],
        INIT_ZOOM
      );

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://carto.com/attributions">CARTO</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(this.map);
    },

    // Toggle sidebar
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      // Trigger a resize event to make sure the map adjusts
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 300);
    },

    // Load available data files
    async loadAvailableFiles() {
      try {
        const response = await fetch("./data/");

        // If directory listing is supported
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const links = doc.querySelectorAll("a");

          this.availableFiles = [];

          links.forEach((link) => {
            const href = link.getAttribute("href");
            if (href && href.toLowerCase().endsWith(".csv")) {
              this.availableFiles.push(href);
            }
          });

          if (this.availableFiles.length === 0) {
            this.availableFiles = [];
          }
        } else {
          // Fetch specific files we know should be there
          const files = ["locations.csv"];
          this.availableFiles = [];

          for (const file of files) {
            try {
              const response = await fetch(`./${file}`, { method: "HEAD" });
              if (response.ok) {
                this.availableFiles.push(file);
              }
            } catch (error) {
              console.error(`Error checking file ${file}:`, error);
            }
          }
        }
      } catch (error) {
        console.error("Error loading file list:", error);
        this.availableFiles = [];
      }
    },

    // Get selected files from the dropdown
    getSelectedFiles() {
      return Array.from(this.$refs.dataSelect.selectedOptions).map(
        (option) => option.value
      );
    },

    // Load selected files
    async loadSelectedFiles() {
      const selectedFiles = this.getSelectedFiles();

      if (selectedFiles.length === 0) {
        alert("Please select at least one file from the list.");
        return;
      }

      this.isLoading = true;

      try {
        const promises = selectedFiles.map((file) =>
          this.fetchAndProcessData(file)
        );
        await Promise.all(promises);
        this.hasLoadedData = true;
      } catch (error) {
        console.error("Error loading files:", error);
      } finally {
        this.isLoading = false;
      }
    },

    // Update selected files
    async updateSelectedFiles() {
      const selectedFiles = this.getSelectedFiles();

      if (selectedFiles.length === 0) {
        alert("Please select at least one file to update.");
        return;
      }

      this.isLoading = true;

      try {
        const promises = selectedFiles.map((file) =>
          this.fetchAndProcessData(file, true)
        );
        await Promise.all(promises);
      } catch (error) {
        console.error("Error updating files:", error);
      } finally {
        this.isLoading = false;
      }
    },

    // Fetch and process data
    async fetchAndProcessData(fileName, isUpdate = false) {
      try {
        console.log(`Loading file: ${fileName}`);
        const response = await fetch(`${fileName}`);
        const content = await response.text();

        // Process the data
        return this.processData(fileName, content, isUpdate);
      } catch (error) {
        console.error(`Error loading file ${fileName}:`, error);
        return false;
      }
    },

    // Process data
    async processData(fileName, content, isUpdate = false) {
      const data = this.parseCSV(content);

      // Filter only entries with valid coordinates
      const validPoints = data.filter(
        (point) =>
          !isNaN(parseFloat(point.lat)) && !isNaN(parseFloat(point.lon))
      );

      if (validPoints.length === 0) {
        alert(`No valid coordinates found in file: ${fileName}`);
        return false;
      }

      // Get existing points if updating
      const existingPoints = isUpdate ? this.allPoints[fileName] || [] : [];
      const existingCount = existingPoints.length;

      // If updating, find only new points
      let newPoints = validPoints;
      if (isUpdate && existingCount > 0) {
        const existingTimestamps = new Set(
          existingPoints.map((p) => p.timestamp)
        );

        newPoints = validPoints.filter((point) => {
          const timestamp = point.timestamp;
          return !existingTimestamps.has(timestamp);
        });

        if (newPoints.length === 0) {
          console.log(`No new points found in ${fileName}`);
          return false;
        }

        console.log(`Found ${newPoints.length} new points in ${fileName}`);
      }

      // Choose color - use existing color if updating, or get a new one
      let color;
      if (
        isUpdate &&
        this.allMarkers[fileName] &&
        this.allMarkers[fileName].length > 0
      ) {
        // Get the color from existing markers
        const existingMarker = this.allMarkers[fileName][0];
        color = existingMarker.options.fillColor;
      } else {
        color = this.colors[this.colorIndex % this.colors.length];
        this.colorIndex++;

        // Initialize arrays if new file
        if (!this.allMarkers[fileName]) this.allMarkers[fileName] = [];
        if (!this.allPoints[fileName]) this.allPoints[fileName] = [];
      }

      // Combine points for processing
      const allFilePoints = [...existingPoints, ...newPoints];

      // Store updated points, sorted by timestamp (ascending)
      this.allPoints[fileName] = allFilePoints.slice().sort((a, b) => {
        const tA = new Date(a.timestamp).getTime();
        const tB = new Date(b.timestamp).getTime();
        return tA - tB;
      });

      // Find most recent point
      let mostRecentPoint = allFilePoints[0];
      let mostRecentTimestamp = mostRecentPoint.timestamp;
      let mostRecentIndex = 0;

      allFilePoints.forEach((point, index) => {
        const timestamp = point.timestamp;
        if (timestamp && new Date(timestamp) > new Date(mostRecentTimestamp)) {
          mostRecentPoint = point;
          mostRecentTimestamp = timestamp;
          mostRecentIndex = index;
        }
      });

      // If updating, remove any existing pulsing markers
      if (isUpdate) {
        this.allMarkers[fileName] = this.allMarkers[fileName].filter(
          (marker) => {
            if (
              marker._icon &&
              marker._icon.classList.contains("pulsating-marker")
            ) {
              this.map.removeLayer(marker);
              return false;
            }
            return true;
          }
        );
      }

      // Add markers for new points only
      newPoints.forEach((point) => {
        const lat = parseFloat(point.lat);
        const lng = parseFloat(point.lon);
        const timestamp = point.timestamp;

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
        }).addTo(this.map);

        marker.bindPopup(`
          <strong>Point ${this.allPoints[fileName].indexOf(point)}</strong><br>
          Latitude: ${lat.toFixed(6)}<br>
          Longitude: ${lng.toFixed(6)}<br>
          ${point.altitude ? `Altitude: ${point.altitude} m<br>` : ""}
          Recorded: ${this.formatTimestamp(timestamp)}
          ${
            timestamp === mostRecentTimestamp
              ? "<br><strong>(Most recent location)</strong>"
              : ""
          }
        `);

        this.allMarkers[fileName].push(marker);
      });

      // Add pulsating effect for most recent point
      const mrlat = parseFloat(mostRecentPoint.lat);
      const mrlng = parseFloat(mostRecentPoint.lon);
      const pulsingMarker = this.createPulsatingMarker(
        [mrlat, mrlng],
        color
      ).addTo(this.map);
      this.allMarkers[fileName].push(pulsingMarker);

      // Update or create sidebar entry
      //console.log(mostRecentIndex);
      this.updateSidebar(fileName, allFilePoints, color, mostRecentIndex);
      this.updatePolyline(fileName, allFilePoints, color);

      // Focus on most recent point if requested
      if (
        !isUpdate ||
        newPoints.some((p) => p.timestamp === mostRecentTimestamp)
      ) {
        setTimeout(() => {
          this.map.setView([mrlat, mrlng], 16);
          // Find marker for most recent point
          this.allMarkers[fileName].forEach((marker) => {
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
    },

    // Parse CSV
    parseCSV(text) {
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
    },

    // Format timestamp
    formatTimestamp(timestamp) {
      if (!timestamp) return "Unknown time";

      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return timestamp;

      const now = new Date();
      const diff = now - date;

      // If less than a day, show relative time
      if (diff < 86400000) {
        if (diff < 60000) return "Just now";
        if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
        return `${Math.floor(diff / 3600000)} hours ago`;
      }

      // If less than a week, show day and time
      if (diff < 604800000) {
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
    },

    // Create pulsating marker
    createPulsatingMarker(latlng, color) {
      const pulsingIcon = L.divIcon({
        className: "pulsating-marker",
        html: `<div class="pulsating-circle" style="background-color: ${color}"></div>`,
        iconSize: [20, 20],
      });

      return L.marker(latlng, {
        icon: pulsingIcon,
        zIndexOffset: 1000,
      });
    },

    // Update polyline
    updatePolyline(fileName, points, color) {
      // Remove existing polyline if it exists
      if (this.allPolylines[fileName]) {
        this.map.removeLayer(this.allPolylines[fileName]);
      }

      // Sort points by timestamp
      const sortedPoints = [...points].sort((a, b) => {
        const tA = new Date(a.timestamp).getTime();
        const tB = new Date(b.timestamp).getTime();
        return tA - tB;
      });

      // Create line coordinates
      const lineCoords = sortedPoints.map((point) => [
        parseFloat(point.lat),
        parseFloat(point.lon),
      ]);

      // Create the polyline
      this.allPolylines[fileName] = L.polyline(lineCoords, {
        color: color,
        weight: 2,
        opacity: 0.5,
        dashArray: "2, 8",
        smoothFactor: 1,
      });

      // Only add to map if checkbox is checked
      if (this.showLines) {
        this.allPolylines[fileName].addTo(this.map);
      }
    },

    // Toggle polylines
    togglePolylines(show) {
      Object.keys(this.allPolylines).forEach((fileName) => {
        const polyline = this.allPolylines[fileName];

        if (show) {
          polyline.addTo(this.map);
        } else {
          this.map.removeLayer(polyline);
        }
      });
    },

    // Update sidebar
    updateSidebar(fileName, points, color, mostRecentIndex) {
      // Store data in Alpine reactive properties
      this.filePoints[fileName] = points.slice().sort((a, b) => {
        const tA = new Date(a.timestamp).getTime();
        const tB = new Date(b.timestamp).getTime();
        return tA - tB;
      });
      this.fileColors[fileName] = color;
      this.fileMostRecentIndices[fileName] = mostRecentIndex;

      // Force Alpine to re-render
      this.datasetsHTML = Date.now().toString();
    },

    // Handle point click in sidebar
    pointClicked(fileName, index) {
      const marker = this.allMarkers[fileName][index];
      console.log("Clicked marker:", this.allMarkers[fileName]);
      console.log(this.filePoints[fileName][index]);
      this.map.setView(marker.getLatLng(), 18);
      marker.openPopup();
    },

    // Fit all points on the map
    fitAllPoints() {
      const allBounds = [];

      Object.keys(this.allMarkers).forEach((fileName) => {
        this.allMarkers[fileName].forEach((marker) => {
          if (marker.getLatLng) {
            allBounds.push(marker.getLatLng());
          }
        });
      });

      if (allBounds.length > 0) {
        const bounds = L.latLngBounds(allBounds);
        this.map.fitBounds(bounds);
      }
    },

    // Clear all data
    clearAll() {
      // Remove markers from map
      Object.keys(this.allMarkers).forEach((fileName) => {
        this.allMarkers[fileName].forEach((marker) => {
          this.map.removeLayer(marker);
        });
      });

      // Remove polylines from map
      Object.keys(this.allPolylines).forEach((fileName) => {
        this.map.removeLayer(this.allPolylines[fileName]);
      });

      // Reset all data structures
      this.colorIndex = 0;
      this.allMarkers = {};
      this.allPoints = {};
      this.allPolylines = {};

      // Most importantly, reset the Alpine reactive properties
      // that drive the UI components
      this.filePoints = {};
      this.fileColors = {};
      this.fileMostRecentIndices = {};
      this.hasLoadedData = false;

      // Reset map view
      const INIT_LAT = 46.5202958;
      const INIT_LON = 6.6304485;
      const INIT_ZOOM = 10;
      this.map.setView([INIT_LAT, INIT_LON], INIT_ZOOM);
    },
  }));
});
