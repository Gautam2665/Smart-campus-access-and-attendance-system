
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import { Button } from "@mui/material";
import { Login, Logout } from "@mui/icons-material";

export const SignInButton = () => {
    const { instance } = useMsal();

    const handleLogin = (loginType) => {
        if (loginType === "popup") {
            // ✅ Force account picker so cached "Super User" isn't auto-selected
            instance.loginPopup({
                ...loginRequest,
                prompt: "select_account"
            }).catch(e => {
                console.log(e);
            });
        }
    }
    return (
        <Button
            variant="contained"
            color="secondary"
            startIcon={<Login />}
            onClick={() => handleLogin("popup")}
        >
            Login
        </Button>
    );
}

export const SignOutButton = () => {
    const { instance } = useMsal();

    const handleLogout = (logoutType) => {
        if (logoutType === "popup") {
            instance.logoutPopup({
                postLogoutRedirectUri: "/",
                mainWindowRedirectUri: "/"
            });
        }
    }
    return (
        <Button
            variant="outlined"
            color="inherit"
            startIcon={<Logout />}
            onClick={() => handleLogout("popup")}
            sx={{ borderColor: 'rgba(255,255,255,0.5)', color: 'white' }}
        >
            Logout
        </Button>
    );
}
