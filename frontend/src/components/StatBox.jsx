import { Box, Typography, useTheme } from "@mui/material";
import { tokens } from "../theme";
import { motion } from "framer-motion";

const StatBox = ({ title, subtitle, icon }) => {
  const theme = useTheme();
  const colors = tokens;

  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 200 }}
    >
      <Box
        width="100%"
        p="25px"
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="flex-start"
        sx={{
          background: `linear-gradient(145deg, ${colors.grey[200]}, ${colors.grey[100]})`,
          borderRadius: "16px",
          boxShadow:
            "0 8px 20px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)",
          transition: "all 0.3s ease",
        }}
      >
        {/* ICON + VALUE */}
        <Box display="flex" alignItems="center" mb="10px" gap="15px">
          <Box
            sx={{
              backgroundColor: colors.primary[400],
              borderRadius: "12px",
              p: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 3px 8px rgba(0,0,0,0.15)",
            }}
          >
            {icon}
          </Box>
          <Typography
            variant="h3"
            fontWeight="700"
            sx={{ color: colors.grey[900], fontFamily: "Poppins, sans-serif" }}
          >
            {title}
          </Typography>
        </Box>

        {/* SUBTITLE */}
        <Typography
          variant="subtitle1"
          sx={{
            color: colors.primary[600],
            letterSpacing: "0.5px",
            fontWeight: "500",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          {subtitle}
        </Typography>

        {/* SMALL DECORATIVE BAR */}
        <Box
          mt="12px"
          height="4px"
          width="50%"
          borderRadius="10px"
          sx={{
            background:
              subtitle.toLowerCase().includes("authorized") ||
              subtitle.toLowerCase().includes("entries")
                ? colors.greenAccent[500]
                : colors.redAccent[500],
          }}
        />
      </Box>
    </motion.div>
  );
};

export default StatBox;
