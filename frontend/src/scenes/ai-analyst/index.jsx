import React, { useState } from "react";
import {
    Box, Button, Typography, Paper, Stack, Chip,
    Card, CardContent, CircularProgress, Alert,
    Divider, Grid, LinearProgress, Tooltip
} from "@mui/material";
import ShieldIcon from "@mui/icons-material/Shield";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import DangerousIcon from "@mui/icons-material/Dangerous";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadarIcon from "@mui/icons-material/Radar";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import StorageIcon from "@mui/icons-material/Storage";
import Header from "../../components/Header";
import api from "../../api";

const THREAT_COLORS = {
    LOW: "success",
    MODERATE: "warning",
    HIGH: "error",
    CRITICAL: "error",
    UNKNOWN: "default",
};

const THREAT_ICONS = {
    LOW: <CheckCircleIcon />,
    MODERATE: <WarningAmberIcon />,
    HIGH: <DangerousIcon />,
    CRITICAL: <DangerousIcon />,
};

const THREAT_TYPE_ICONS = {
    SPOOFING_ATTEMPT: <PersonOffIcon fontSize="small" />,
    TAILGATING: <PersonOffIcon fontSize="small" />,
    OFF_HOURS: <AccessTimeIcon fontSize="small" />,
    CREDENTIAL_SHARING: <PersonOffIcon fontSize="small" />,
    ANOMALY_CLUSTER: <RadarIcon fontSize="small" />,
};

const StatCard = ({ label, value, color = "text.primary" }) => (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 100 }}>
        <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography variant="h4" fontWeight="bold" color={color}>{value ?? "—"}</Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
        </CardContent>
    </Card>
);

const ThreatCard = ({ threat }) => (
    <Card
        variant="outlined"
        sx={{
            borderLeft: "4px solid",
            borderLeftColor: `${THREAT_COLORS[threat.severity] || "primary"}.main`,
            mb: 1.5,
        }}
    >
        <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Stack direction="row" spacing={1} alignItems="center">
                    {THREAT_TYPE_ICONS[threat.type]}
                    <Typography variant="subtitle2" fontWeight="bold">
                        {threat.type?.replace(/_/g, " ")}
                    </Typography>
                </Stack>
                <Chip
                    label={threat.severity}
                    color={THREAT_COLORS[threat.severity] || "default"}
                    size="small"
                    variant="filled"
                />
            </Stack>

            <Typography variant="body2" color="text.secondary" mt={1}>
                {threat.description}
            </Typography>

            {threat.affected_ids?.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} mt={1}>
                    <Typography variant="caption" color="text.secondary" mr={0.5}>Affected:</Typography>
                    {threat.affected_ids.map((id) => (
                        <Chip key={id} label={id} size="small" variant="outlined" sx={{ fontSize: "0.7rem", height: 20 }} />
                    ))}
                </Stack>
            )}

            <Box mt={1.5} p={1} bgcolor="action.hover" borderRadius={1}>
                <Typography variant="caption" color="text.secondary">
                    💡 <strong>Recommendation:</strong> {threat.recommendation}
                </Typography>
            </Box>
        </CardContent>
    </Card>
);

const AiAnalyst = () => {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const runAnalysis = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await api.post("/ai/analyze");
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || "AI service unavailable. Check AWS Bedrock credentials.");
        } finally {
            setLoading(false);
        }
    };

    const threatLevel = result?.threat_level || "LOW";

    return (
        <Box m="20px">
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Header
                    title="AI SECURITY ANALYST"
                    subtitle="Autonomous threat detection powered by Claude 3.5 Sonnet"
                />
                <Stack direction="row" spacing={2} alignItems="center">
                    <Chip icon={<ShieldIcon />} label="Claude 3.5 Sonnet" color="primary" variant="outlined" size="small" />
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <RadarIcon />}
                        onClick={runAnalysis}
                        disabled={loading}
                        sx={{ fontWeight: "bold", px: 3 }}
                    >
                        {loading ? "Scanning Logs..." : "Run AI Security Scan"}
                    </Button>
                </Stack>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {loading && (
                <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
                    <CircularProgress size={48} color="primary" />
                    <Typography variant="h6" mt={2}>Analyzing security logs with AI...</Typography>
                    <Typography variant="body2" color="text.secondary" mt={1}>
                        Claude is scanning for anomalies, spoofing patterns, and unusual access events
                    </Typography>
                    <LinearProgress sx={{ mt: 3, borderRadius: 1 }} />
                </Paper>
            )}

            {result && !loading && (
                <Box>
                    {/* Threat Level Banner */}
                    <Paper
                        sx={{
                            p: 3,
                            mb: 3,
                            borderRadius: 3,
                            border: "2px solid",
                            borderColor: `${THREAT_COLORS[threatLevel]}.main`,
                            bgcolor: `${THREAT_COLORS[threatLevel] === "success" ? "success" : threatLevel === "MODERATE" ? "warning" : "error"}.50`,
                        }}
                    >
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ color: `${THREAT_COLORS[threatLevel]}.main`, display: "flex" }}>
                                {THREAT_ICONS[threatLevel] || <ShieldIcon />}
                            </Box>
                            <Box flex={1}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Typography variant="h5" fontWeight="bold">
                                        Threat Level:
                                    </Typography>
                                    <Chip
                                        label={threatLevel}
                                        color={THREAT_COLORS[threatLevel]}
                                        sx={{ fontWeight: "bold", fontSize: "1rem", height: 32 }}
                                    />
                                </Stack>
                                <Typography variant="body1" mt={0.5} color="text.secondary">
                                    {result.summary}
                                </Typography>
                            </Box>
                        </Stack>
                    </Paper>

                    {/* Statistics */}
                    {result.statistics && (
                        <Stack direction="row" spacing={2} mb={3} flexWrap="wrap">
                            <StatCard label="Total Logs Scanned" value={result.statistics.total_logs} />
                            <StatCard label="Authorized" value={result.statistics.authorized} color="success.main" />
                            <StatCard label="Denied" value={result.statistics.denied} color="error.main" />
                            <StatCard label="Anomalies Detected" value={result.statistics.anomaly_count} color="warning.main" />
                        </Stack>
                    )}

                    {/* Threats */}
                    <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
                        <Typography variant="h6" fontWeight="bold" mb={2}>
                            {result.threats?.length > 0 ? `${result.threats.length} Threat(s) Identified` : "✅ No Threats Detected"}
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        {result.threats?.length === 0 && (
                            <Stack direction="row" spacing={2} alignItems="center" py={2}>
                                <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
                                <Box>
                                    <Typography variant="subtitle1" fontWeight="bold">All Clear</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        No suspicious patterns detected in the analyzed logs.
                                    </Typography>
                                </Box>
                            </Stack>
                        )}
                        {result.threats?.map((threat, i) => (
                            <ThreatCard key={i} threat={threat} />
                        ))}
                    </Paper>
                </Box>
            )}

            {!result && !loading && !error && (
                <Paper
                    sx={{
                        p: 6,
                        textAlign: "center",
                        borderRadius: 3,
                        border: "2px dashed",
                        borderColor: "divider",
                    }}
                >
                    <RadarIcon sx={{ fontSize: 72, color: "text.disabled", mb: 2 }} />
                    <Typography variant="h5" fontWeight="bold" color="text.secondary">
                        AI Security Analyst Ready
                    </Typography>
                    <Typography variant="body1" color="text.secondary" mt={1} mb={3}>
                        Click "Run AI Security Scan" to analyze your recent logs for threats,
                        anomalies, and suspicious patterns using Claude 3.5 Sonnet.
                    </Typography>
                    <Button variant="outlined" color="primary" startIcon={<RadarIcon />} onClick={runAnalysis}>
                        Start Analysis
                    </Button>
                </Paper>
            )}
        </Box>
    );
};

export default AiAnalyst;
