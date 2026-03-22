import React, { useState } from "react";
import {
    Box, Typography, Paper, Stack, Chip, Button, CircularProgress,
    Alert, TextField, Accordion, AccordionSummary, AccordionDetails,
    Avatar, Divider, LinearProgress
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import BuildIcon from "@mui/icons-material/Build";
import FlagIcon from "@mui/icons-material/Flag";
import StorageIcon from "@mui/icons-material/Storage";
import AssessmentIcon from "@mui/icons-material/Assessment";
import Header from "../../components/Header";
import api from "../../api";
import ReactMarkdown from "react-markdown";

// ─── Preset missions ────────────────────────────────────────────────────────
const PRESETS = [
    { label: "Scan for spoofing this week", icon: "🕵️" },
    { label: "Find credential sharing patterns in the last 7 days", icon: "🔑" },
    { label: "Summarise all off-hours access events", icon: "🌙" },
    { label: "Flag the top 3 highest-risk identities", icon: "🚨" },
    { label: "How many denied attempts happened today?", icon: "📊" },
];

// ─── Tool icon map ───────────────────────────────────────────────────────────
const TOOL_META = {
    query_logs: { icon: <StorageIcon fontSize="small" />, color: "#1565c0", bg: "#e3f2fd", label: "DB Query" },
    get_risk_summary: { icon: <AssessmentIcon fontSize="small" />, color: "#6a1b9a", bg: "#f3e5f5", label: "Risk Summary" },
    flag_identity: { icon: <FlagIcon fontSize="small" />, color: "#b71c1c", bg: "#ffebee", label: "Flag Identity" },
};

const defaultMeta = { icon: <BuildIcon fontSize="small" />, color: "#37474f", bg: "#eceff1", label: "Tool Call" };

// ─── Single tool step card ───────────────────────────────────────────────────
const StepCard = ({ step, index }) => {
    const meta = TOOL_META[step.tool] || defaultMeta;
    let inputStr = step.input;
    try { inputStr = JSON.stringify(JSON.parse(step.input), null, 2); } catch (_) { }
    let outputStr = step.output || "…running";
    try { outputStr = JSON.stringify(JSON.parse(step.output), null, 2).slice(0, 400) + (step.output?.length > 400 ? "\n... (truncated)" : ""); } catch (_) { outputStr = (step.output || "").slice(0, 400); }

    return (
        <Accordion
            disableGutters
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px !important", mb: 1, "&:before": { display: "none" } }}
        >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar sx={{ width: 28, height: 28, bgcolor: meta.bg, color: meta.color, fontSize: 12 }}>
                        {index + 1}
                    </Avatar>
                    <Chip
                        icon={meta.icon}
                        label={meta.label}
                        size="small"
                        sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: "bold", border: "none" }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                        {step.tool}
                    </Typography>
                </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
                <Stack spacing={1}>
                    <Box>
                        <Typography variant="caption" fontWeight="bold" color="text.secondary">INPUT</Typography>
                        <Box component="pre" sx={{
                            m: 0, p: 1.5, borderRadius: 1, bgcolor: "#1e1e2e", color: "#cdd6f4",
                            fontSize: "0.75rem", fontFamily: "monospace", overflowX: "auto", maxHeight: 120
                        }}>
                            {inputStr}
                        </Box>
                    </Box>
                    <Box>
                        <Typography variant="caption" fontWeight="bold" color="text.secondary">OUTPUT</Typography>
                        <Box component="pre" sx={{
                            m: 0, p: 1.5, borderRadius: 1, bgcolor: "#0d1117", color: "#79c0ff",
                            fontSize: "0.72rem", fontFamily: "monospace", overflowX: "auto", maxHeight: 160
                        }}>
                            {outputStr}
                        </Box>
                    </Box>
                </Stack>
            </AccordionDetails>
        </Accordion>
    );
};

// ─── Main page ───────────────────────────────────────────────────────────────
const AiAgent = () => {
    const [mission, setMission] = useState("");
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);   // { result, steps }
    const [error, setError] = useState(null);

    const runMission = async (text) => {
        const query = text || mission.trim();
        if (!query) return;
        setMission(query);
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            const res = await api.post("/ai/agent", { mission: query });
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || "Agent service unavailable. Check GEMINI_API_KEY.");
        } finally {
            setRunning(false);
        }
    };

    return (
        <Box m="20px">
            {/* ── Header ── */}
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Header
                    title="AI AGENT MISSION CONTROL"
                    subtitle="LangGraph ReAct agent — autonomous tool-calling powered by Gemini 2.5 Flash"
                />
                <Chip
                    icon={<SmartToyIcon />}
                    label="Gemini 2.5 Flash · ReAct"
                    color="secondary"
                    variant="outlined"
                    size="small"
                />
            </Box>

            {/* ── Mission input ── */}
            <Paper elevation={1} sx={{ p: 3, borderRadius: 3, mb: 3 }}>
                <Typography variant="subtitle2" fontWeight="bold" mb={1.5} color="text.secondary">
                    ASSIGN A MISSION
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        size="small"
                        placeholder="e.g. Find all spoofing attempts from this week and flag the top offenders"
                        value={mission}
                        onChange={(e) => setMission(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && runMission()}
                        disabled={running}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                    <Button
                        variant="contained"
                        startIcon={running ? <CircularProgress size={16} color="inherit" /> : <RocketLaunchIcon />}
                        onClick={() => runMission()}
                        disabled={running || !mission.trim()}
                        sx={{ borderRadius: 2, px: 3, minWidth: 140, whiteSpace: "nowrap" }}
                    >
                        {running ? "Running…" : "Launch Mission"}
                    </Button>
                </Stack>

                {/* Preset chips */}
                <Stack direction="row" spacing={1} flexWrap="wrap" gap={1} mt={2}>
                    {PRESETS.map((p) => (
                        <Chip
                            key={p.label}
                            label={`${p.icon} ${p.label}`}
                            variant="outlined"
                            clickable
                            disabled={running}
                            onClick={() => runMission(p.label)}
                            size="small"
                            sx={{ fontSize: "0.75rem" }}
                        />
                    ))}
                </Stack>
            </Paper>

            {/* ── Running indicator ── */}
            {running && (
                <Paper elevation={0} sx={{ p: 3, borderRadius: 3, mb: 3, border: "1px solid", borderColor: "divider" }}>
                    <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <CircularProgress size={20} />
                            <Typography variant="body2" fontWeight="medium">Agent is reasoning and calling tools…</Typography>
                        </Stack>
                        <LinearProgress variant="indeterminate" sx={{ borderRadius: 4 }} />
                        <Typography variant="caption" color="text.secondary">
                            The agent will autonomously decide which tools to call. This may take 10–30 seconds.
                        </Typography>
                    </Stack>
                </Paper>
            )}

            {/* ── Error ── */}
            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>
            )}

            {/* ── Result ── */}
            {result && (
                <Stack spacing={2.5}>
                    {/* Thought stream */}
                    {result.steps?.length > 0 && (
                        <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
                            <Typography variant="subtitle2" fontWeight="bold" color="text.secondary" mb={2}>
                                🔍 THOUGHT STREAM — {result.steps.length} TOOL CALL{result.steps.length !== 1 ? "S" : ""}
                            </Typography>
                            {result.steps.map((step, i) => (
                                <StepCard key={i} step={step} index={i} />
                            ))}
                        </Paper>
                    )}

                    {/* Final answer */}
                    <Paper elevation={1} sx={{ p: 3, borderRadius: 3, borderLeft: "4px solid", borderLeftColor: "primary.main" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                            <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32 }}>
                                <SmartToyIcon sx={{ fontSize: 18 }} />
                            </Avatar>
                            <Typography variant="subtitle2" fontWeight="bold">AGENT REPORT</Typography>
                        </Stack>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{
                            "& p": { mt: 0, mb: 1, fontSize: "0.92rem" },
                            "& ul, & ol": { pl: 2.5, mb: 1 },
                            "& li": { fontSize: "0.9rem", mb: 0.5 },
                            "& strong": { color: "text.primary" },
                            "& code": {
                                fontSize: "0.8rem", fontFamily: "monospace",
                                bgcolor: "action.hover", px: 0.5, borderRadius: 0.5
                            },
                        }}>
                            <ReactMarkdown>{result.result || "_No summary returned by agent._"}</ReactMarkdown>
                        </Box>
                    </Paper>
                </Stack>
            )}

            {/* ── Empty state ── */}
            {!result && !running && !error && (
                <Paper
                    elevation={0}
                    sx={{
                        p: 6, textAlign: "center", borderRadius: 3,
                        border: "2px dashed", borderColor: "divider"
                    }}
                >
                    <SmartToyIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">Ready for a mission</Typography>
                    <Typography variant="body2" color="text.secondary" mt={1}>
                        Type a security question or click a preset to launch the agent.
                    </Typography>
                </Paper>
            )}
        </Box>
    );
};

export default AiAgent;
