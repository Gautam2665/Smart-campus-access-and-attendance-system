import { useState, useEffect, useCallback } from "react";
import {
    Box, Button, TextField, Select, MenuItem, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions,
    FormControl, InputLabel, Checkbox, ListItemText,
    Typography, IconButton, Paper
} from "@mui/material";
import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import {
    Delete as DeleteIcon,
    Security as SecurityIcon,
    Group as GroupIcon,
    Edit as EditIcon
} from "@mui/icons-material";
import Header from "../../components/Header";
import api from "../../api";
import { useAuth } from "../../context/AuthContext";

const AVAILABLE_PERMISSIONS = [
    "ALL_ACCESS", "LOGS_VIEW_ALL", "LOGS_VIEW_DEPT", "LOGS_VIEW",
    "LOGS_DELETE", "TAGS_MANAGE", "DEVICES_MANAGE",
    "USERS_MANAGE", "FINGERPRINT_MANAGE", "CAMERA_VIEW"
];

const UserManagement = () => {
    const { hasPermission } = useAuth();

    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [departments, setDepartments] = useState([]);

    const [openUserModal, setOpenUserModal] = useState(false);
    const [openRoleModal, setOpenRoleModal] = useState(false);

    const [editingUser, setEditingUser] = useState(false);
    const [editingRole, setEditingRole] = useState(false);

    const [newUser, setNewUser] = useState({
        email: "", name: "", department: "", role_id: ""
    });

    const [newRole, setNewRole] = useState({
        id: null,
        name: "",
        permissions: ""
    });

    /* ================= FETCH DATA ================= */
    const fetchData = useCallback(async () => {
        try {
            const [usersRes, rolesRes, deptsRes] = await Promise.all([
                api.get("/users"),
                api.get("/roles"),
                api.get("/departments"),
            ]);
            setUsers(usersRes.data);
            setRoles(rolesRes.data);
            setDepartments(Array.isArray(deptsRes.data) ? deptsRes.data : []);
        } catch (error) {
            console.error("Failed to fetch data", error);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /* ================= DELETE ================= */
    const handleDeleteUser = async (email) => {
        if (!window.confirm(`Remove access for ${email}?`)) return;
        await api.delete(`/users/${email}`);
        fetchData();
    };

    const handleDeleteRole = async (id, name) => {
        if (name === "Super Admin") {
            return alert("Cannot delete Super Admin.");
        }
        if (!window.confirm(`Delete role '${name}'?`)) return;
        await api.delete(`/roles/${id}`);
        fetchData();
    };

    /* ================= EDIT HANDLERS ================= */
    const handleEditUser = (row) => {
        setEditingUser(true);
        setNewUser({
            email: row.email,
            name: row.name,
            department: row.department,
            role_id: roles.find(r => r.name === row.role_name)?.id || ""
        });
        setOpenUserModal(true);
    };

    const handleEditRole = (row) => {
        setEditingRole(true);
        setNewRole({
            id: row.id,
            name: row.name,
            permissions: row.permissions
        });
        setOpenRoleModal(true);
    };

    /* ================= SAVE USER ================= */
    const handleSaveUser = async () => {
        if (editingUser) {
            await api.put(`/users/${newUser.email}`, newUser);
        } else {
            await api.post("/users", newUser);
        }
        resetUserModal();
        fetchData();
    };

    /* ================= SAVE ROLE ================= */
    const handleSaveRole = async () => {
        if (editingRole) {
            await api.put(`/roles/${newRole.id}`, newRole);
        } else {
            await api.post("/roles", newRole);
        }
        resetRoleModal();
        fetchData();
    };

    const resetUserModal = () => {
        setOpenUserModal(false);
        setEditingUser(false);
        setNewUser({ email: "", name: "", department: "", role_id: "" });
    };

    const resetRoleModal = () => {
        setOpenRoleModal(false);
        setEditingRole(false);
        setNewRole({ id: null, name: "", permissions: "" });
    };

    /* ================= TABLE COLUMNS ================= */

    const userColumns = [
        { field: "name", headerName: "Name", flex: 1 },
        { field: "email", headerName: "Email", flex: 1.2 },
        { field: "department", headerName: "Department", flex: 0.8 },
        {
            field: "role_name",
            headerName: "Role",
            flex: 0.8,
            renderCell: ({ value }) => (
                <Chip label={value || "No Role"} size="small" />
            )
        },
        {
            field: "actions",
            headerName: "",
            width: 120,
            renderCell: (params) => (
                <>
                    <IconButton
                        size="small"
                        onClick={() => handleEditUser(params.row)}
                    >
                        <EditIcon fontSize="small" />
                    </IconButton>

                    <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteUser(params.row.email)}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </>
            )
        }
    ];

    const roleColumns = [
        { field: "name", headerName: "Role Name", flex: 1 },
        {
            field: "permissions",
            headerName: "Permissions",
            flex: 2,
            renderCell: ({ value }) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {value.split(',').map(p => (
                        <Chip key={p} label={p} size="small" />
                    ))}
                </Box>
            )
        },
        {
            field: "actions",
            headerName: "",
            width: 120,
            renderCell: (params) => (
                <>
                    <IconButton
                        size="small"
                        onClick={() => handleEditRole(params.row)}
                        disabled={params.row.name === "Super Admin"}
                    >
                        <EditIcon fontSize="small" />
                    </IconButton>

                    <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteRole(params.row.id, params.row.name)}
                        disabled={params.row.name === "Super Admin"}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </>
            )
        }
    ];

    return (
        <Box m="20px">
            <Header title="IDENTITY & ACCESS" />

            <Box display="grid" gap={3}>

                {/* ROLES */}
                <Paper sx={{ p: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6">Roles</Typography>
                        <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            onClick={() => {
                                setEditingRole(false);
                                setNewRole({ id: null, name: "", permissions: "" });
                                setOpenRoleModal(true);
                            }}
                        >
                            Create Role
                        </Button>
                    </Box>
                    <DataGrid
                        rows={roles}
                        columns={roleColumns}
                        getRowId={(row) => row.id}
                        autoHeight
                        hideFooter
                    />
                </Paper>

                {/* USERS */}
                <Paper sx={{ p: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6">Users</Typography>
                        <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            onClick={() => {
                                setEditingUser(false);
                                setNewUser({ email: "", name: "", department: "", role_id: "" });
                                setOpenUserModal(true);
                            }}
                        >
                            Invite User
                        </Button>
                    </Box>
                    <DataGrid
                        rows={users}
                        columns={userColumns}
                        getRowId={(row) => row.email}
                        autoHeight
                        slots={{ toolbar: GridToolbar }}
                    />
                </Paper>
            </Box>

            {/* USER MODAL */}
            <Dialog open={openUserModal} onClose={resetUserModal}>
                <DialogTitle>
                    {editingUser ? "Edit User" : "Invite User"}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        margin="dense"
                        label="Email"
                        value={newUser.email}
                        disabled={editingUser}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                    <TextField
                        fullWidth
                        margin="dense"
                        label="Name"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    />
                    <FormControl fullWidth margin="dense">
                        <InputLabel>Department</InputLabel>
                        <Select
                            value={newUser.department}
                            onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                        >
                            {departments.map(d => (
                                <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth margin="dense">
                        <InputLabel>Role</InputLabel>
                        <Select
                            value={newUser.role_id}
                            onChange={(e) => setNewUser({ ...newUser, role_id: e.target.value })}
                        >
                            {roles.map(role => (
                                <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={resetUserModal}>Cancel</Button>
                    <Button variant="contained" onClick={handleSaveUser}>
                        {editingUser ? "Update" : "Invite"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ROLE MODAL */}
            <Dialog open={openRoleModal} onClose={resetRoleModal}>
                <DialogTitle>
                    {editingRole ? "Edit Role" : "Create Role"}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        margin="dense"
                        label="Role Name"
                        value={newRole.name}
                        onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    />
                    <FormControl fullWidth margin="dense">
                        <InputLabel>Permissions</InputLabel>
                        <Select
                            multiple
                            value={newRole.permissions ? newRole.permissions.split(',') : []}
                            onChange={(e) =>
                                setNewRole({
                                    ...newRole,
                                    permissions: e.target.value.join(',')
                                })
                            }
                        >
                            {AVAILABLE_PERMISSIONS.map(p => (
                                <MenuItem key={p} value={p}>
                                    <Checkbox checked={newRole.permissions.includes(p)} />
                                    <ListItemText primary={p} />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={resetRoleModal}>Cancel</Button>
                    <Button variant="contained" onClick={handleSaveRole}>
                        {editingRole ? "Update" : "Create"}
                    </Button>
                </DialogActions>
            </Dialog>

        </Box>
    );
};

export default UserManagement;