"use client";
import React, { useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import styles from './heatmap.module.css';

const INDIA_TOPO_JSON = "/india-states.json";

// Heatmap Data (Mock Data exchange / risk values by state)
const stateData: Record<string, number> = {
  "Maharashtra": 85,
  "Karnataka": 95,
  "Delhi": 90,
  "Tamil Nadu": 75,
  "West Bengal": 65,
  "Gujarat": 60,
  "Uttar Pradesh": 50,
  "Rajasthan": 40,
  "Madhya Pradesh": 30,
  "Jammu and Kashmir": 10,
  "Ladakh": 5,
  "Kerala": 80,
  "Andhra Pradesh": 70,
  "Telangana": 85,
};

// Interpolates between two hex colors
const interpolateHex = (hex1: string, hex2: string, t: number) => {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);

  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `rgb(${r}, ${g}, ${b})`;
};

const getColor = (value: number) => {
  if (value === 0) return "#f0f0f0"; // No data (Grey)
  
  // Normalize value between 0 and 100
  const v = Math.max(0, Math.min(100, value)) / 100;
  
  // Color stops based on the provided image
  const stops = [
    { threshold: 0, color: "#2c7bb6" },    // Dark Blue
    { threshold: 0.25, color: "#abd9e9" }, // Light Blue
    { threshold: 0.5, color: "#ffffbf" },  // Light Green/Yellow
    { threshold: 0.75, color: "#fdae61" }, // Orange
    { threshold: 1, color: "#d7191c" }     // Red
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const current = stops[i];
    const next = stops[i + 1];
    
    if (v >= current.threshold && v <= next.threshold) {
      // Calculate local progress between these two stops
      const localT = (v - current.threshold) / (next.threshold - current.threshold);
      return interpolateHex(current.color, next.color, localT);
    }
  }

  return stops[stops.length - 1].color;
};

export default function HeatmapPage() {
  const [tooltip, setTooltip] = useState("");

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Data Density Heatmap</h1>
          <p className={styles.subtitle}>Geographical distribution of patient cases/traffic</p>
        </div>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendLabel}>Low Density</span>
        <div className={styles.gradientBar}></div>
        <span className={styles.legendLabel}>High Density</span>
      </div>

      <div className={styles.mapContainer}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{
            scale: 1000,
            center: [82.8, 22.5]
          }}
          className={styles.map}
        >
          <Geographies geography={INDIA_TOPO_JSON}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const stateName = geo.properties.shapeName || geo.properties.NAME_1 || geo.properties.name || "Unknown";
                const value = stateData[stateName] || 0;
                
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => setTooltip(`${stateName} (Cases: ${value})`)}
                    onMouseLeave={() => setTooltip("")}
                    style={{
                      default: {
                        fill: getColor(value),
                        stroke: "#333",
                        strokeWidth: 0.5,
                        outline: "none"
                      },
                      hover: {
                        fill: getColor(value),
                        stroke: "#000",
                        strokeWidth: 1.5,
                        outline: "none",
                        cursor: "pointer",
                        opacity: 0.8
                      },
                      pressed: {
                        fill: getColor(value),
                        outline: "none"
                      }
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
        {tooltip && <div className={styles.tooltip}>{tooltip}</div>}
      </div>
    </div>
  );
}
