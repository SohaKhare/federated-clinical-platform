"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Header.module.css';
import { Search, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

const searchableRoutes = [
  { name: 'Dashboard Overview', path: '/', keywords: ['home', 'main'] },
  { name: 'Hospital Nodes Directory', path: '/nodes', keywords: ['nodes', 'hospitals', 'global', 'servers'] },
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
  const { user, loading, logout } = useAuth();

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
          <span className={styles.userName}>
            {loading ? '…' : user ? user.hospitalName ?? user.email : 'Guest'}
          </span>
          {user?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt={user?.email ?? 'avatar'} className={styles.avatar} referrerPolicy="no-referrer" />
          ) : (
            <div className={styles.avatar}>
              <LogOut size={16} color="#fff" />
            </div>
          )}
          <button type="button" onClick={logout} title="Log out" className={styles.logoutBtn} aria-label="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
