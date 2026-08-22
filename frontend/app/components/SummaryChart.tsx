"use client";
import styles from './SummaryChart.module.css';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';
import { Download, Crosshair } from 'lucide-react';

const data = [
  { name: '10 Oct', value: 2, fill: '#b8cfcd' },
  { name: '12 Oct', value: 4, fill: '#ffffff', highlight: true },
  { name: '14 Oct', value: 2, fill: '#b8cfcd' },
  { name: '16 Oct', value: 3, fill: '#b8cfcd' },
  { name: '18 Oct', value: 6, fill: '#333333' },
  { name: '20 Oct', value: 8, fill: '#1a1a1a' },
  { name: '22 Oct', value: 5, fill: '#555555' },
  { name: '24 Oct', value: 4, fill: '#777777' },
  { name: '26 Oct', value: 3, fill: '#999999' },
  { name: '28 Oct', value: 2, fill: '#b8cfcd' },
];

export default function SummaryChart() {
  return (
    <div className={styles.chartWrapper}>
      {/* Top tabs */}
      <div className={styles.tabSection}>
        {/* <div className={styles.tabs}>
          <span className={styles.tab}>All</span>
          <span className={`${styles.tab} ${styles.active}`}>Summary</span>
          <span className={styles.tab}>Demographics</span>
          <span className={styles.tab}>Logs</span>
          <span className={styles.tab}>Heatmap</span>
          <span className={styles.addTab}>+</span>
        </div> */}
        <div className={styles.tabActions}>
          <div className={styles.iconBtn}><Download size={14} /></div>
          <div className={styles.iconBtn}><Crosshair size={14} /></div>
        </div>
      </div>

      {/* Main Chart Box */}
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>Predictions</span>
            <h2 className={styles.title}>Model Summary</h2>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.legend}>
              <span className={styles.legendDot}></span> High Risk
            </div>
            <div className={styles.legend}>
              <span className={styles.legendDotLight}></span> Stable
            </div>
          </div>
        </div>

        <div className={styles.contentArea}>
          <div className={styles.statsCard}>
            <div className={styles.statLine}>
              <span className={styles.statName}>New predictions</span>
              <div className={styles.statValueRow}>
                 <span className={styles.bigNum}>12</span>
                 <div className={styles.plusBtn}>+</div>
              </div>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statLine}>
              <span className={styles.statName}>Accuracy confidence</span>
              <div className={styles.statActions}>
                 <span className={styles.actionBtn}>View details</span>
                 <span className={styles.actionBtn}>Export</span>
                 <span className={styles.dots}>...</span>
              </div>
            </div>
          </div>

          <div className={styles.barArea}>
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barSize={24}>
                <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className={styles.verticalActions}>
            <div className={styles.vIconBtnActive}><Crosshair size={14} /></div>
            <div className={styles.vIconBtn}><Download size={14} /></div>
            <div className={styles.vIconBtn}>~</div>
            <div className={styles.vIconBtn}>...</div>
          </div>
        </div>
      </div>
    </div>
  );
}
