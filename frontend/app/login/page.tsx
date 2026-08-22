"use client";
import styles from './login.module.css';
import { Shield } from 'lucide-react';
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Redirecting directly since this is a mock frontend
    window.location.href = '/';
  };

  return (
    <div className={styles.loginWrapper}>
      <div className={styles.loginCard}>
        <div className={styles.logoBox}>
          <Shield size={32} color="#000" />
        </div>
        <h2 className={styles.title}>Welcome back</h2>
        <p className={styles.subtitle}>Enter your details to access the local node</p>
        
        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Email</label>
            <input 
              type="email" 
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className={styles.inputGroup}>
            <label>Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <button type="submit" className={styles.loginBtn}>
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
