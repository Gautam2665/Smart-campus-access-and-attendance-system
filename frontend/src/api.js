// src/api.js
import axios from "axios";
import { msalInstance, loginRequest } from "./authConfig";

const api = axios.create({
    // ❌ OLD: "http://localhost:5000"
    // ✅ NEW: Use your actual Azure Backend URL
    baseURL: "https://college-attendance-api-h7audmhshuhecqg5.centralindia-01.azurewebsites.net/api",
});

api.interceptors.request.use(async (config) => {
    const account = msalInstance.getActiveAccount();
    if (account) {
        console.log("👤 [API] Active Account found:", account.username);
        try {
            console.log("🔄 [API] Attempting to acquire token silent...");
            const response = await msalInstance.acquireTokenSilent({
                ...loginRequest,
                account: account,
            });
            console.log("✅ [API] Token acquired!", response.accessToken.substring(0, 15) + "...");

            // 🛡️ This attaches the token only if the URL is correct
            config.headers.Authorization = `Bearer ${response.accessToken}`;
        } catch (error) {
            console.error("❌ [API] Token acquisition failed:", error);
            // Fallback: Try popup if silent fails (optional, but good for debugging)
        }
    } else {
        console.warn("⚠️ [API] No active account! Request will be sent anonymously.");
    }
    return config;
}, (error) => Promise.reject(error));

export default api;