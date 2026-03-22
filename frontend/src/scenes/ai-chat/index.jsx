import React, { useState, useRef, useEffect } from "react";
import {
    Box, TextField, Button, Typography, Paper, Stack,
    Avatar, Chip, CircularProgress, Divider, IconButton, Tooltip
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import PersonIcon from "@mui/icons-material/Person";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Header from "../../components/Header";
import api from "../../api";
import ReactMarkdown from "react-markdown";

const STARTER_QUESTIONS = [
    "Show me today's attendance summary",
    "How many denied attempts happened this week?",
    "List all off-hours access events",
    "Which fingerprint ID has the most failed scans?",
];

const MessageBubble = ({ msg }) => {
    const isUser = msg.role === "user";

    const handleCopy = () => {
        navigator.clipboard.writeText(msg.content);
    };

    return (
        <Stack
            direction="row"
            spacing={1.5}
            alignItems="flex-start"
            justifyContent={isUser ? "flex-end" : "flex-start"}
            sx={{ mb: 2 }}
        >
            {!isUser && (
                <Avatar sx={{ bgcolor: "primary.main", width: 34, height: 34, mt: 0.5 }}>
                    <SmartToyIcon sx={{ fontSize: 18 }} />
                </Avatar>
            )}

            <Box sx={{ maxWidth: "78%" }}>
                <Paper
                    elevation={0}
                    sx={{
                        px: 2.5,
                        py: 1.5,
                        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        bgcolor: isUser ? "primary.main" : "background.paper",
                        color: isUser ? "white" : "text.primary",
                        border: isUser ? "none" : "1px solid",
                        borderColor: "divider",
                    }}
                >
                    {isUser ? (
                        <Typography variant="body2">{msg.content}</Typography>
                    ) : (
                        <Box
                            sx={{
                                "& pre": { bgcolor: "#1e1e2e", p: 1.5, borderRadius: 1, overflowX: "auto" },
                                "& code": { fontSize: "0.8rem", fontFamily: "monospace" },
                                "& p": { mt: 0, mb: 0.5, fontSize: "0.9rem" },
                                "& ul, & ol": { pl: 2, mb: 0.5 },
                            }}
                        >
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </Box>
                    )}
                </Paper>

                {!isUser && (
                    <Stack direction="row" spacing={1} alignItems="center" mt={0.5} ml={0.5}>
                        <Typography variant="caption" color="text.secondary">
                            {msg.log_count != null ? `Based on ${msg.log_count} log records` : ""}
                        </Typography>
                        <Tooltip title="Copy response">
                            <IconButton size="small" onClick={handleCopy} sx={{ opacity: 0.5, "&:hover": { opacity: 1 } }}>
                                <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                )}
            </Box>

            {isUser && (
                <Avatar sx={{ bgcolor: "secondary.main", width: 34, height: 34, mt: 0.5 }}>
                    <PersonIcon sx={{ fontSize: 18 }} />
                </Avatar>
            )}
        </Stack>
    );
};

const AiChat = () => {
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            content: "👋 Hello! I'm your **Campus Security AI**. I can answer questions about attendance logs, detect patterns, and generate SQL queries — all within your access scope.\n\nWhat would you like to know?",
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const sendMessage = async (text) => {
        const query = text || input.trim();
        if (!query) return;

        setMessages((prev) => [...prev, { role: "user", content: query }]);
        setInput("");
        setLoading(true);

        try {
            const res = await api.post("/ai/chat", { query });
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: res.data.answer, log_count: res.data.log_count },
            ]);
        } catch (err) {
            const errMsg = err.response?.data?.error || "AI service unavailable. Check AWS credentials.";
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `❌ **Error:** ${errMsg}` },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 72px)", p: 3, gap: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
                <Header
                    title="AI INTELLIGENCE CHAT"
                    subtitle="Natural language queries powered by Claude 3.5 Sonnet"
                />
                <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                        icon={<SmartToyIcon />}
                        label="Claude 3.5 Sonnet"
                        color="primary"
                        variant="outlined"
                        size="small"
                    />
                    <Tooltip title="Clear conversation">
                        <IconButton onClick={() => setMessages([{ role: "assistant", content: "Conversation cleared. How can I help?" }])}>
                            <DeleteSweepIcon />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {/* Starter question chips */}
            {messages.length <= 1 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                    {STARTER_QUESTIONS.map((q) => (
                        <Chip
                            key={q}
                            label={q}
                            variant="outlined"
                            clickable
                            onClick={() => sendMessage(q)}
                            size="small"
                            sx={{ fontSize: "0.78rem" }}
                        />
                    ))}
                </Stack>
            )}

            {/* Messages */}
            <Paper
                elevation={0}
                sx={{
                    flex: 1,
                    overflowY: "auto",
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                    bgcolor: "grey.50",
                }}
            >
                {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} />
                ))}

                {loading && (
                    <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                        <Avatar sx={{ bgcolor: "primary.main", width: 34, height: 34 }}>
                            <SmartToyIcon sx={{ fontSize: 18 }} />
                        </Avatar>
                        <Paper
                            elevation={0}
                            sx={{ px: 2.5, py: 1.5, borderRadius: "18px 18px 18px 4px", border: "1px solid", borderColor: "divider" }}
                        >
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <CircularProgress size={12} />
                                <Typography variant="body2" color="text.secondary">Analyzing your logs...</Typography>
                            </Stack>
                        </Paper>
                    </Stack>
                )}
                <div ref={bottomRef} />
            </Paper>

            {/* Input */}
            <Stack direction="row" spacing={1}>
                <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="Ask anything about attendance logs..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    disabled={loading}
                    size="small"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
                />
                <Button
                    variant="contained"
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim()}
                    sx={{ borderRadius: 3, px: 3, minWidth: 56 }}
                >
                    <SendIcon />
                </Button>
            </Stack>
        </Box>
    );
};

export default AiChat;
