"use client";
import styles from './HeatmapWidget.module.css';
import { useRouter } from 'next/navigation';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { ChevronRight } from 'lucide-react';

const INDIA_TOPO_JSON = "/india-states.json";

// Heatmap Data matching the full Heatmap page
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
  if (value === 0) return "#e8edf5"; // Light neutral for states without data
  
  const v = Math.max(0, Math.min(100, value)) / 100;
  
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
      const localT = (v - current.threshold) / (next.threshold - current.threshold);
      return interpolateHex(current.color, next.color, localT);
    }
  }

  return stops[stops.length - 1].color;
};

export default function HeatmapWidget() {
  const router = useRouter();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Heatmap</h3>
        <span className={styles.subtitle}>Geographic distributions</span>
      </div>

      <div className={styles.card} onClick={() => router.push('/heatmap')} style={{ cursor: 'pointer' }}>
        {/* Inner Box for Map Preview */}
        <div className={styles.mapInnerBox}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              scale: 370,
              center: [82.5, 22.0]
            }}
            width={200}
            height={160}
            className={styles.miniMap}
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
                      style={{
                        default: {
                          fill: getColor(value),
                          stroke: "#ffffff",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill: getColor(value),
                          stroke: "#111827",
                          strokeWidth: 1,
                          outline: "none",
                          cursor: "pointer",
                        },
                        pressed: {
                          outline: "none",
                        }
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        </div>

        {/* Footer Bar */}
        <div className={styles.cardFooter}>
          <span className={styles.footerText}>Expand Heatmap</span>
          <button type="button" className={styles.footerBadge}>
            Show <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
