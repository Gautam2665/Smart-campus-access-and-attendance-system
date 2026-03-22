
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useMsal } from "@azure/msal-react";
import api from '../api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const { instance, accounts } = useMsal();
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchUserProfile = async () => {
        try {
            const response = await api.get('/auth/me');
            setUser(response.data);
            setPermissions(response.data.permissions || []);
        } catch (error) {
            console.error("❌ Failed to fetch user profile:", error);
            setUser(null);
            setPermissions([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const activeAccount = instance.getActiveAccount();
        if (activeAccount) {
            fetchUserProfile();
        } else if (accounts.length > 0) {
            instance.setActiveAccount(accounts[0]);
            fetchUserProfile();
        } else {
            setLoading(false);
        }
    }, [instance, accounts]);

    const hasPermission = (requiredPerm) => {
        if (permissions.includes('ALL_ACCESS')) return true;
        return permissions.includes(requiredPerm);
    };

    return (
        <AuthContext.Provider value={{ user, permissions, hasPermission, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
