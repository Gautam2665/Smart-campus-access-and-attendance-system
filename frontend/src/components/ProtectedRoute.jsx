import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Box, Typography, Button } from '@mui/material';

const Unauthorized = () => (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="80vh">
        <Typography variant="h1" color="error" fontSize="6rem">403</Typography>
        <Typography variant="h4" color="textSecondary" mb={2}>Access Denied</Typography>
        <Typography variant="body1" mb={4}>You do not have permission to view this page.</Typography>
        <Button variant="contained" color="primary" href="/">Go to Dashboard</Button>
    </Box>
);

const ProtectedRoute = ({ requiredPerm }) => {
    const { user, permissions, loading } = useAuth();

    if (loading) {
        return <div>Loading access rights...</div>;
    }

    if (!user) {
        return <Navigate to="/" replace />;
    }

    if (requiredPerm) {
        const permsArray = Array.isArray(requiredPerm)
            ? requiredPerm
            : [requiredPerm];

        const hasAccess =
            permissions?.includes("ALL_ACCESS") ||
            permsArray.some(p => permissions?.includes(p));

        if (!hasAccess) {
            return <Unauthorized />;
        }
    }

    return <Outlet />;
};

export default ProtectedRoute;