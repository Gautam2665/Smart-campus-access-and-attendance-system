import { PublicClientApplication, EventType } from "@azure/msal-browser";

export const msalConfig = {
    auth: {
        clientId: "a5b16a58-3a7e-497d-aabc-bb969cdd183e", // Application (client) ID
        authority: "https://login.microsoftonline.com/35308931-eced-4972-abaa-eabe34f2b76e", // Directory (tenant) ID
        redirectUri: "http://localhost:5173", // Must match Azure Portal
    },
    cache: {
        cacheLocation: "sessionStorage", // or "localStorage"
        storeAuthStateInCookie: false,
    },
};

// Add scopes here for ID token to be used at Microsoft identity platform endpoints.
export const loginRequest = {
scopes: [
        // ✅ This forces Azure to issue a token where the audience (aud) matches your API
        "api://a5b16a58-3a7e-497d-aabc-bb969cdd183e/access_as_user"
    ]
};

export const msalInstance = new PublicClientApplication(msalConfig);

// 🚨 CRITICAL: Set Active Account for API Interceptors
if (!msalInstance.getActiveAccount() && msalInstance.getAllAccounts().length > 0) {
    msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
}

msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload.account) {
        const account = event.payload.account;
        msalInstance.setActiveAccount(account);
    }
});
