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


// ✅ Use relative path — api instance already has the base URL set
const ATTENDANCE_PATH = "/attendance";

// Format timestamp
const formatTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
    : "—";

const FingerprintLogs = () => {
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  // ✅ FIX: No default date restriction
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  /* ================= FETCH DATA ================= */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(ATTENDANCE_PATH, { params: { source_type: 'FINGERPRINT' } });
      const data = Array.isArray(res.data) ? res.data : [];
      setAllRows(data);
    } catch (err) {
      console.error("❌ Error fetching logs:", err);
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ================= DATE FILTER ================= */
  const isDateInRange = (dateString, start, end) => {
    if (!dateString) return false;

    // If no filter selected → show all logs
    if (!start && !end) return true;

    const date = new Date(dateString);

    if (start) {
      const startObj = new Date(start);
      startObj.setHours(0, 0, 0, 0);
      if (date < startObj) return false;
    }

    if (end) {
      const endObj = new Date(end);
      endObj.setHours(23, 59, 59, 999);
      if (date > endObj) return false;
    }

    return true;
  };

  /* ================= FILTERED ROWS ================= */
  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      const inRange = isDateInRange(r.timestamp, startDate, endDate);
      if (!inRange) return false;

      const isAuthorized =
        r.authorized == 1 || r.authorized === true;

      if (filter === "allowed") return isAuthorized;
      if (filter === "denied") return !isAuthorized;

      return true;
    });
  }, [allRows, filter, startDate, endDate]);

  /* ================= GRID COLUMNS ================= */
  const columns = [
    {
      field: "tag_id",
      headerName: "Finger ID",
      width: 130,
      renderCell: ({ value }) => (
        <Typography fontWeight="500">
          {value?.replace("FIN-", "") ?? "—"}
        </Typography>
      ),
    },
    {
      field: "name",
      headerName: "Faculty Name",
      width: 200,
      renderCell: ({ value }) => (
        <Typography fontWeight="500">{value}</Typography>
      ),
    },
    {
      field: "verification_type",
      headerName: "Method",
      width: 160,
      renderCell: ({ value }) => (
        <Typography fontWeight="500">
          {value || "FINGERPRINT"}
        </Typography>
      ),
    },
    {
      field: "authorized",
      headerName: "Status",
      width: 130,
      renderCell: ({ row }) => {
        const isAuthorized =
          row.authorized == 1 || row.authorized === true;

        return (
          <Chip
            label={isAuthorized ? "AUTHORIZED" : "DENIED"}
            color={isAuthorized ? "success" : "error"}
            size="small"
            sx={{ fontWeight: 600 }}
          />
        );
      },
    },
    {
      field: "confidence_score",
      headerName: "Confidence",
      width: 150,
      renderCell: ({ value }) => (
        <Typography fontWeight="500">
          {value ? `${(value * 100).toFixed(1)}%` : "—"}
        </Typography>
      ),
    },
    {
      field: "timestamp",
      headerName: "Time",
      width: 260,
      renderCell: ({ value }) => (
        <Typography fontWeight="500">
          {formatTime(value)}
        </Typography>
      ),
    },
  ];

  /* ================= UI ================= */
  return (
    <Box p={4}>
      <Header title="FINGERPRINT AUDIT LOGS" />

      {/* Filter Buttons */}
      <Stack direction="row" spacing={1} mb={3}>
        <Chip
          label="SHOW ALL"
          clickable
          color={filter === "all" ? "primary" : "default"}
          onClick={() => setFilter("all")}
        />
        <Chip
          label="AUTHORIZED"
          clickable
          color={filter === "allowed" ? "success" : "default"}
          onClick={() => setFilter("allowed")}
        />
        <Chip
          label="DENIED"
          clickable
          color={filter === "denied" ? "error" : "default"}
          onClick={() => setFilter("denied")}
        />
      </Stack>

      {/* Date Picker */}
      <Card sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            type="date"
            label="Start Date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            label="End Date"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            onClick={loadData}
            disabled={loading}
          >
            Refresh
          </Button>
        </Stack>
      </Card>

      {/* DataGrid */}
      <DataGrid
        autoHeight
        rows={filteredRows}
        columns={columns}
        pageSize={10}
        rowsPerPageOptions={[10, 25, 50]}
        loading={loading}
        getRowId={(row) => row.id}
        disableRowSelectionOnClick
      />
    </Box>
  );
};

export default FingerprintLogs;
