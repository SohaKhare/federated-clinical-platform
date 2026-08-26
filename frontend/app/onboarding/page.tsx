"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/lib/ToastContext';
import styles from '../login/login.module.css';
import onboardingStyles from './onboarding.module.css';

export default function Onboarding() {
  const { user } = useAuth();
  const { success } = useToast();
  const router = useRouter();
  const [hospitalName, setHospitalName] = useState('');
  const [pincode, setPincode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!hospitalName.trim() || !pincode.trim() || !latitude.trim() || !longitude.trim()) {
      setError('All fields are required.');
      return;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError('Latitude and longitude must be numbers.');
      return;
    }

    setSubmitting(true);
    try {
      await api.onboard({
        hospitalName: hospitalName.trim(),
        pincode: pincode.trim(),
        geolocation: { latitude: lat, longitude: lng },
      });
      success('Hospital profile set up successfully! Welcome to the federation.');
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Onboarding failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.loginWrapper}>
      <div className={styles.loginCard}>
        <h2 className={styles.title}>Hospital profile</h2>
        <p className={styles.subtitle}>
          {user?.email
            ? `Set up your hospital to join the federation (${user.role} node).`
            : 'Set up your hospital to join the federation.'}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label htmlFor="hospitalName">Hospital name</label>
            <input
              id="hospitalName"
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              placeholder="AIIMS Delhi"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="pincode">Pincode</label>
            <input
              id="pincode"
              type="text"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              placeholder="110029"
            />
          </div>

          <div className={onboardingStyles.geoRow}>
            <div className={styles.inputGroup}>
              <label htmlFor="latitude">Latitude</label>
              <input
                id="latitude"
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="28.5672"
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="longitude">Longitude</label>
              <input
                id="longitude"
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="77.21"
              />
            </div>
          </div>

          {error && <p className={onboardingStyles.error}>{error}</p>}

          <button type="submit" className={styles.loginBtn} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
