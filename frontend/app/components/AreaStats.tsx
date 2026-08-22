import styles from './AreaStats.module.css';
import { Eye, Shield, Activity, Target, Zap } from 'lucide-react';

export default function AreaStats() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Demographics</h3>
        <span className={styles.subtitle}>Patient distribution</span>
      </div>

      <div className={styles.sliders}>
        {/* Slider 1 */}
        <div className={styles.sliderCol}>
          <div className={styles.sliderTrack}>
            <div className={styles.sliderFill} style={{ height: '30%', backgroundColor: '#d9e2ec' }}></div>
          </div>
          <span className={styles.sliderValue}>30%</span>
          <div className={styles.iconWrapper}><Eye size={14} /></div>
        </div>

        {/* Slider 2 */}
        <div className={styles.sliderCol}>
          <div className={styles.sliderTrack}>
            <div className={styles.sliderFill} style={{ height: '72%', backgroundColor: '#e2d9ec' }}></div>
          </div>
          <span className={styles.sliderValue}>72%</span>
          <div className={styles.iconWrapper}><Shield size={14} /></div>
        </div>

        {/* Slider 3 (Active) */}
        <div className={styles.sliderCol}>
          <div className={styles.sliderTrack}>
            <div className={styles.sliderFill} style={{ height: '52%', backgroundColor: '#1a1a1a' }}></div>
          </div>
          <span className={styles.sliderValue}>52%</span>
          <div className={`${styles.iconWrapper} ${styles.iconActive}`}><Activity size={14} /></div>
        </div>

        {/* Slider 4 */}
        <div className={styles.sliderCol}>
          <div className={styles.sliderTrack}>
            <div className={styles.sliderFill} style={{ height: '70%', backgroundColor: '#d9ecea' }}></div>
          </div>
          <span className={styles.sliderValue}>70%</span>
          <div className={styles.iconWrapper}><Target size={14} /></div>
        </div>

        {/* Slider 5 */}
        <div className={styles.sliderCol}>
          <div className={styles.sliderTrack}>
            <div className={styles.sliderFill} style={{ height: '27%', backgroundColor: '#ecd9e8' }}></div>
          </div>
          <span className={styles.sliderValue}>27%</span>
          <div className={styles.iconWrapper}><Zap size={14} /></div>
        </div>
      </div>
    </div>
  );
}
