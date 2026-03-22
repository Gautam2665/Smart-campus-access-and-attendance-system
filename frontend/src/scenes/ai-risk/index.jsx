import React, { useState, useEffect } from "react";
import {
    Box, Button, Typography, Paper, Stack, Chip,
    CircularProgress, Alert, LinearProgress, Divider,
    Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Tooltip, IconButton
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import PersonIcon from "@mui/icons-material/Person";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import Header from "../../components/Header";
import api from "../../api";

const RISK_CONFIG = {
    LOW: { color: "success", bg: "#e8f5e9", bar: "#43a047", label: "Low Risk" },
    MODERATE: { color: "warning", bg: "#fff8e1", bar: "#fb8c00", label: "Moderate" },
    HIGH: { color: "error", bg: "#fce4ec", bar: "#e53935", label: "High Risk" },
};

const RiskBar = ({ score, level }) => {
    const cfg = RISK_CONFIG[level] || RISK_CONFIG.LOW;
    // Handle both decimal (0.85) and whole-number (85) score formats from LLM
    const pct = score > 1 ? Math.round(score) : Math.round((score || 0) * 100);
    return (
        <Tooltip title={`Score: ${pct}%`}>
            <Box sx={{ width: 120 }}>
                <LinearProgress
                    variant="determinate"
                    value={Math.min(pct, 100)}
                    sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: "#e0e0e0",
                        "& .MuiLinearProgress-bar": { bgcolor: cfg.bar, borderRadius: 4 },
                    }}
                />
                <Typography variant="caption" color="text.secondary">{pct}%</Typography>
            </Box>
        </Tooltip>
    );
};

const AiRisk = () => {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastScanned, setLastScanned] = useState(null);

    const fetchRiskScores = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.post("/ai/risk-scores");
            const data = res.data?.risk_profiles || [];
            // Sort: HIGH first, then MODERATE, then LOW
            const order = { HIGH: 0, MODERATE: 1, LOW: 2 };
            data.sort((a, b) => (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3));
            setProfiles(data);
            setLastScanned(new Date());
        } catch (err) {
            setError(err.response?.data?.error || "AI service unavailable. Check GEMINI_API_KEY.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRiskScores(); }, []);

    const counts = {
        HIGH: profiles.filter(p => p.risk_level === "HIGH").length,
        MODERATE: profiles.filter(p => p.risk_level === "MODERATE").length,
        LOW: profiles.filter(p => p.risk_level === "LOW").length,
    };

    return (
        <Box m="20px">
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Header
                    title="AI RISK SCORES"
                    subtitle="Predictive identity risk scoring powered by Gemini 2.5 Flash"
                />
                <Stack direction="row" spacing={1.5} alignItems="center">
                    {lastScanned && (
                        <Typography variant="caption" color="text.secondary">
                            Last scanned: {lastScanned.toLocaleTimeString()}
                        </Typography>
                    )}
                    <Button
                        variant="contained"
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                        onClick={fetchRiskScores}
                        disabled={loading}
                        size="small"
                    >
                        {loading ? "Scoring..." : "Refresh Scores"}
                    </Button>
                </Stack>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>
            )}

            {/* Summary chips */}
            {profiles.length > 0 && (
                <Stack direction="row" spacing={2} mb={3}>
                    <Paper variant="outlined" sx={{ px: 3, py: 1.5, borderRadius: 2, textAlign: "center" }}>
                        <Typography variant="h4" fontWeight="bold" color="error.main">{counts.HIGH}</Typography>
                        <Typography variant="caption">High Risk</Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ px: 3, py: 1.5, borderRadius: 2, textAlign: "center" }}>
                        <Typography variant="h4" fontWeight="bold" color="warning.main">{counts.MODERATE}</Typography>
                        <Typography variant="caption">Moderate</Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ px: 3, py: 1.5, borderRadius: 2, textAlign: "center" }}>
                        <Typography variant="h4" fontWeight="bold" color="success.main">{counts.LOW}</Typography>
                        <Typography variant="caption">Low Risk</Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ px: 3, py: 1.5, borderRadius: 2, textAlign: "center" }}>
                        <Typography variant="h4" fontWeight="bold">{profiles.length}</Typography>
                        <Typography variant="caption">Total Identities</Typography>
                    </Paper>
                </Stack>
            )}

            {/* Table */}
            {loading && profiles.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3 }}>
                    <CircularProgress size={48} />
                    <Typography variant="h6" mt={2}>AI is scoring campus identities...</Typography>
                    <Typography variant="body2" color="text.secondary" mt={1}>
                        Analyzing attendance history, denial patterns, and time anomalies
                    </Typography>
                </Paper>
            ) : profiles.length === 0 && !loading ? (
                <Paper sx={{ p: 6, textAlign: "center", borderRadius: 3, border: "2px dashed", borderColor: "divider" }}>
                    <TrendingUpIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">No scores available</Typography>
                    <Typography variant="body2" color="text.secondary" mt={1}>
                        Click "Refresh Scores" to run AI risk analysis on your logs.
                    </Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 3 }} elevation={1}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: "action.hover" }}>
                                <TableCell sx={{ fontWeight: "bold", width: 40 }}>#</TableCell>
                                <TableCell sx={{ fontWeight: "bold" }}>Identity</TableCell>
                                <TableCell sx={{ fontWeight: "bold" }}>Tag / ID</TableCell>
                                <TableCell sx={{ fontWeight: "bold" }}>Risk Level</TableCell>
                                <TableCell sx={{ fontWeight: "bold" }}>Score</TableCell>
                                <TableCell sx={{ fontWeight: "bold" }}>AI Reasoning</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {profiles.map((p, i) => {
                                const cfg = RISK_CONFIG[p.risk_level] || RISK_CONFIG.LOW;
                                return (
                                    <TableRow
                                        key={p.tag_id || i}
                                        sx={{
                                            bgcolor: i === 0 && p.risk_level === "HIGH" ? cfg.bg : "transparent",
                                            "&:hover": { bgcolor: "action.hover" },
                                        }}
                                    >
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">{i + 1}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <PersonIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                                                <Typography variant="body2" fontWeight={p.risk_level === "HIGH" ? "bold" : "normal"}>
                                                    {p.name || "Unknown"}
                                                </Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                <FingerprintIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                                <Typography variant="caption" fontFamily="monospace">{p.tag_id}</Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={cfg.label}
                                                color={cfg.color}
                                                size="small"
                                                variant={p.risk_level === "HIGH" ? "filled" : "outlined"}
                                                sx={{ fontWeight: "bold" }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <RiskBar score={p.risk_score} level={p.risk_level} />
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 360 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                                                {p.reason || "—"}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
};

export default AiRisk;
