"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Header.module.css';
import { Search, User } from 'lucide-react';

const searchableRoutes = [
  { name: 'Dashboard Overview', path: '/', keywords: ['home', 'main'] },
  { name: 'Patients Directory', path: '/patients', keywords: ['patients', 'list', 'people'] },
  { name: 'System Logs', path: '/logs', keywords: ['logs', 'history', 'events', 'log'] },
  { name: 'Heatmap (Maps)', path: '/heatmap', keywords: ['heatmap', 'maps', 'map', 'india', 'geography'] },
  { name: 'Login Screen', path: '/login', keywords: ['login', 'auth', 'sign in'] },
];

export default function Header() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredRoutes = searchableRoutes.filter(route => {
    const term = query.toLowerCase();
    return route.name.toLowerCase().includes(term) || 
           route.keywords.some(k => k.includes(term));
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (path: string) => {
    setQuery("");
    setIsOpen(false);
    router.push(path);
  };

  return (
    <header className={styles.header}>
      <div className={styles.searchWrapper} ref={dropdownRef}>
        <div className={styles.searchContainer}>
          <input 
            type="text" 
            className={styles.searchInput} 
            placeholder="Search for maps, logs..." 
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(e.target.value.length > 0);
            }}
            onFocus={() => {
              if (query.length > 0) setIsOpen(true);
            }}
          />
          <div className={styles.searchIcons}>
            <Search size={16} />
            <div className={styles.voiceIcon}>
               <svg width="10" height="14" viewBox="0 0 10 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" width="4" height="9" rx="2" fill="currentColor"/>
                  <path d="M1 6V7C1 9.20914 2.79086 11 5 11C7.20914 11 9 9.20914 9 7V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M5 11V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
               </svg>
            </div>
          </div>
        </div>

        {isOpen && query.length > 0 && (
          <div className={styles.dropdown}>
            {filteredRoutes.length > 0 ? (
              filteredRoutes.map((route, idx) => (
                <div 
                  key={idx} 
                  className={styles.dropdownItem}
                  onClick={() => handleSelect(route.path)}
                >
                  <Search size={14} className={styles.dropdownIcon} />
                  <span>{route.name}</span>
                </div>
              ))
            ) : (
              <div className={styles.dropdownEmpty}>No results found</div>
            )}
          </div>
        )}
      </div>
      
      <div className={styles.actions}>
        <div className={styles.profileInfo}>
          <span className={styles.userName}>Leander Fernandes</span>
          <div className={styles.avatar}>
             <User size={20} color="#fff" />
          </div>
        </div>
      </div>
    </header>
  );
}
