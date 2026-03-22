import { createTheme } from "@mui/material/styles";

// Define your color tokens
export const tokens = {
  grey: {
    100: "#f0f0f3", 500: "#666666", 900: "#141414",
  },
  primary: {
    100: "#d0e1f9", 500: "#4c8df6", 900: "#0b3a8c",
  },
  greenAccent: {
    500: "#4cceac",
  },
  redAccent: {
    500: "#f44336",
  },
};

// MUI theme settings
export const themeSettings = {
  palette: {
    primary: {
      main: tokens.primary[500],
    },
    secondary: {
      main: tokens.greenAccent[500],
    },
    background: {
      default: tokens.grey[100],
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: ["Poppins", "sans-serif"].join(","),
    fontSize: 12,
  },
};

export const useMode = () => {
  const theme = createTheme(themeSettings);
  return [theme];
};