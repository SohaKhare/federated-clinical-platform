import styles from './PatientManagement.module.css';
import { Camera, Plus, ChevronRight } from 'lucide-react';

export default function PatientManagement() {
  return (
    <div className={styles.container}>
      
      {/* Add Patient Card (Maps to Add user) */}
      <div className={styles.addPatientCard}>
        <div className={styles.cameraIcon}>
          <Camera size={16} color="#666" />
        </div>
        
        <div className={styles.faceWireframe}>
          <div className={styles.headOutline}></div>
          <div className={styles.crosshair}></div>
        </div>
        
        <div className={styles.addContent}>
          <h4 className={styles.addTitle}>Add patient</h4>
          <span className={styles.addSubtitle}>You can add 2 patients</span>
        </div>
      </div>

      {/* Mini avatars */}
      <div className={styles.miniAvatars}>
        <div className={styles.avatarsRow}>
          <div className={styles.avatar} style={{ backgroundColor: '#2b5c56' }}></div>
          <div className={styles.avatar} style={{ backgroundColor: '#7e57c2' }}></div>
          <div className={styles.avatar} style={{ backgroundColor: '#ec407a' }}></div>
          <div className={styles.avatarDots}>...</div>
        </div>
        <div className={styles.avatarsInfo}>
           <span className={styles.avatarsText}>You have added 6 patients</span>
           <span className={styles.viewAllBtn}>view all <ChevronRight size={12} /></span>
        </div>
      </div>

      {/* Patient List (Maps to Resources) */}
      <div className={styles.listSection}>
        <h4 className={styles.listTitle}>Patients <span>6 added</span></h4>
        
        <div className={styles.listItems}>
          
          <div className={styles.listItem}>
            <span className={styles.itemName}>Patient #1024</span>
            <div className={styles.itemControls}>
               <div className={styles.dotsGroup}>
                 <span className={styles.dotDark}></span>
                 <span className={styles.dotLight}></span>
                 <span className={styles.dotLight}></span>
               </div>
               <div className={styles.toggleOn}></div>
            </div>
          </div>
          
          <div className={styles.listItem}>
            <span className={styles.itemName}>Patient #1025</span>
            <div className={styles.itemControls}>
               <div className={styles.dotsGroup}>
                 <span className={styles.dotGreen}></span>
                 <span className={styles.dotLight}></span>
                 <span className={styles.dotLight}></span>
               </div>
               <div className={styles.toggleOff}></div>
            </div>
          </div>

        </div>

        <div className={styles.listFooter}>
          <span className={styles.viewAllBtn}>view all <ChevronRight size={12} /></span>
          <div className={styles.addBtn}>add <Plus size={12} /></div>
        </div>
      </div>

      {/* Expand card (Maps to Expand your possibilities) */}
      <div className={styles.expandCard}>
        <div className={styles.expandHeader}>
           <div className={styles.progressValue}>17/60</div>
           <span className={styles.progressSub}>resources</span>
        </div>
        <div className={styles.progressBar}>
           <div className={styles.progressFill}></div>
           <div className={styles.progressDot}></div>
           <div className={styles.progressTrackDots}></div>
        </div>
        <div className={styles.expandContent}>
           <h5 className={styles.expandTitle}>Expand your possibilities</h5>
           <p className={styles.expandDesc}>Upgrade your plan and expand your account</p>
           <span className={styles.viewAllBtn}>More info <ChevronRight size={12} /></span>
        </div>
        <div className={styles.plusIconLarge}>
           <Plus size={16} color="#fff" />
        </div>
      </div>

    </div>
  );
}
