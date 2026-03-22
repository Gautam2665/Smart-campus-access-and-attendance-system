import React, { useState, useEffect, useCallback } from "react";
import {
    Box, Button, TextField, Typography, Paper, Stack,
    Chip, IconButton, Alert, Divider, Tooltip, CircularProgress
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ApartmentIcon from "@mui/icons-material/Apartment";
import Header from "../../components/Header";
import api from "../../api";

const DepartmentManager = () => {
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState("");
    const [status, setStatus] = useState(null);

    const fetchDepts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get("/departments");
            setDepartments(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setStatus({ type: "error", msg: "Could not load departments. Is the server running?" });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDepts(); }, [fetchDepts]);

    const handleAdd = async () => {
        const trimmed = newName.trim().toUpperCase();
        if (!trimmed) return;
        try {
            await api.post("/departments", { name: trimmed });
            setStatus({ type: "success", msg: `'${trimmed}' added successfully.` });
            setNewName("");
            fetchDepts();
        } catch (e) {
            const msg = e.response?.data?.message || "Failed to add department (may already exist).";
            setStatus({ type: "error", msg });
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete department '${name}'? Faculty linked to this dept won't lose their records, but future log filters may be affected.`)) return;
        try {
            await api.delete(`/departments/${id}`);
            setStatus({ type: "info", msg: `'${name}' removed.` });
            fetchDepts();
        } catch (e) {
            setStatus({ type: "error", msg: "Delete failed: " + (e.response?.data?.message || e.message) });
        }
    };

    const columns = [
        {
            field: "id",
            headerName: "ID",
            width: 80,
        },
        {
            field: "name",
            headerName: "Department Code",
            flex: 1,
            renderCell: ({ value }) => (
                <Chip
                    icon={<ApartmentIcon sx={{ fontSize: 16 }} />}
                    label={value}
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                />
            ),
        },
        {
            field: "actions",
            headerName: "",
            width: 80,
            sortable: false,
            renderCell: (params) => (
                <Tooltip title={`Delete ${params.row.name}`}>
                    <IconButton
                        color="error"
                        size="small"
                        onClick={() => handleDelete(params.row.id, params.row.name)}
                    >
                        <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            ),
        },
    ];

    return (
        <Box m="20px">
            <Box display="flex" justifyContent="space-between" alignItems="center" mb="25px">
                <Header
                    title="DEPARTMENT MANAGEMENT"
                    subtitle="Define the canonical department list used across enrollment and access control"
                />
            </Box>

            {/* ── ADD DEPARTMENT ── */}
            <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 3 }}>
                <Typography variant="h6" fontWeight="bold" mb={2}>
                    Add New Department
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                    <TextField
                        size="small"
                        label="Department Code"
                        placeholder="e.g. CS, IT, MECH"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        sx={{ width: 300 }}
                        helperText="Will be saved as uppercase automatically"
                    />
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<AddCircleOutlineIcon />}
                        onClick={handleAdd}
                        sx={{ height: 40 }}
                    >
                        Add Department
                    </Button>
                </Stack>

                {status && (
                    <Alert
                        severity={status.type}
                        variant="outlined"
                        onClose={() => setStatus(null)}
                        sx={{ mt: 2, maxWidth: 500 }}
                    >
                        {status.msg}
                    </Alert>
                )}
            </Paper>

            {/* ── DEPARTMENTS TABLE ── */}
            <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" fontWeight="bold">
                        Defined Departments
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {departments.length} total
                    </Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <DataGrid
                    rows={departments}
                    columns={columns}
                    getRowId={(row) => row.id}
                    autoHeight
                    loading={loading}
                    hideFooter={departments.length <= 10}
                    disableRowSelectionOnClick
                    sx={{ border: "none" }}
                />
            </Paper>
        </Box>
    );
};

export default DepartmentManager;
