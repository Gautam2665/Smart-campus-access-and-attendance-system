import {
    Box,
    Typography,
    Chip,
    Stack,
    Card,
    Button,
    TextField
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { useEffect, useMemo, useState, useCallback } from "react";
import api from "../../api";
import Header from "../../components/Header";
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const ATTENDANCE_PATH = "/attendance";

const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatTime = (iso) =>
    iso ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    }) : "—";

const AIFlagLogs = () => {
    const [allRows, setAllRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(getTodayDate());
    const [endDate, setEndDate] = useState(getTodayDate());

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(ATTENDANCE_PATH);
            const data = Array.isArray(res.data) ? res.data : [];
            // Filter for AI Flags
            const flags = data.filter(r => r.verification_type === 'AI_FLAG');
            setAllRows(flags);
        } catch (err) {
            console.error("❌ Error fetching AI Flags:", err);
            setAllRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleTodayClick = () => {
        const today = getTodayDate();
        setStartDate(today);
        setEndDate(today);
        setTimeout(loadData, 0);
    };

    const filteredRows = useMemo(() => {
        if (!startDate && !endDate) return allRows;
        const startObj = startDate ? new Date(startDate) : new Date(0);
        const endObj = endDate ? new Date(endDate) : new Date(8640000000000000);
        startObj.setHours(0, 0, 0, 0);
        endObj.setHours(23, 59, 59, 999);

        return allRows.filter((r) => {
            const rowDate = new Date(r.timestamp);
            return rowDate >= startObj && rowDate <= endObj;
        });
    }, [allRows, startDate, endDate]);

    const columns = [
        { field: "id", headerName: "Log ID", width: 90 },
        {
            field: "tag_id",
            headerName: "Tag ID",
            width: 140,
        },
        {
            field: "name",
            headerName: "User Name",
            flex: 1,
            renderCell: ({ value }) => (
                <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                    {value}
                </Typography>
            ),
        },
        {
            field: "confidence_score",
            headerName: "Severity",
            width: 120,
            renderCell: () => (
                <Chip
                    icon={<WarningAmberIcon />}
                    label="HIGH RISK"
                    color="error"
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: "bold" }}
                />
            ),
        },
        {
            field: "anomaly_details",
            headerName: "AI Flag Reason",
            flex: 2,
            renderCell: ({ value }) => (
                <Typography variant="body2" color="error.main" sx={{ fontStyle: "italic" }}>
                    {value || "Flagged for manual review."}
                </Typography>
            ),
        },
        {
            field: "timestamp",
            headerName: "Time Flagged",
            width: 220,
            renderCell: ({ value }) => (
                <Typography variant="body2" fontWeight="500">
                    {formatTime(value)}
                </Typography>
            ),
        },
    ];

    return (
        <Box m="20px">
            <Header title="AI SECURITY FLAGS" subtitle="Identities manually flagged by the LangGraph ReAct Agent" />

            {/* 📅 FILTER & DATE CARD */}
            <Card sx={{ p: 2, mb: 3, boxShadow: 2, borderRadius: 1 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <TextField
                        label="Start Date"
                        type="date"
                        size="small"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        sx={{ width: 160 }}
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="End Date"
                        type="date"
                        size="small"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        sx={{ width: 160 }}
                        InputLabelProps={{ shrink: true }}
                    />
                    <Button
                        variant="contained"
                        onClick={loadData}
                        disabled={loading}
                        sx={{ fontWeight: "500" }}
                    >
                        {loading ? "Loading..." : "Refresh"}
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={handleTodayClick}
                        disabled={loading}
                        sx={{ fontWeight: "500" }}
                    >
                        Today
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                        Showing {filteredRows.length} flagged identites
                    </Typography>
                </Stack>
            </Card>

            <Box sx={{ height: 600, width: "100%" }}>
                <DataGrid
                    rows={filteredRows}
                    columns={columns}
                    loading={loading}
                    disableSelectionOnClick
                    sx={{
                        "& .MuiDataGrid-root": { border: "none" },
                        "& .MuiDataGrid-cell": { borderBottom: "none" },
                        "& .MuiDataGrid-columnHeaders": {
                            backgroundColor: "#2e2e48",
                            color: "#fff",
                            borderBottom: "none",
                        },
                        "& .MuiDataGrid-virtualScroller": { backgroundColor: "#f9f9fc" },
                        "& .MuiDataGrid-footerContainer": {
                            borderTop: "none",
                            backgroundColor: "#2e2e48",
                            color: "#fff",
                        },
                        boxShadow: 2,
                        borderRadius: 2,
                        overflow: "hidden"
                    }}
                />
            </Box>
        </Box>
    );
};

export default AIFlagLogs;
