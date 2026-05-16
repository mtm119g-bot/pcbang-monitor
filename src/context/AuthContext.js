import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://port-0-pcbang-monitor-mp3lddim57e72eb2.sel3.cloudtype.app';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadToken();
  }, []);

  async function loadToken() {
    try {
      const t = await SecureStore.getItemAsync('token');
      if (t) {
        setToken(t);
        await fetchMe(t);
      }
    } catch (e) {}
    setLoading(false);
  }

  async function fetchMe(t) {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      const data = await res.json();
      if (!data.error) setUser(data);
      else { setToken(null); setUser(null); await SecureStore.deleteItemAsync('token'); }
    } catch (e) {}
  }

  async function login(username, password) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    await SecureStore.setItemAsync('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  async function register(username, password, name) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    await SecureStore.setItemAsync('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  async function logout() {
    await SecureStore.deleteItemAsync('token');
    setToken(null);
    setUser(null);
  }

  async function authFetch(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    return res;
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout, authFetch, API_URL, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
