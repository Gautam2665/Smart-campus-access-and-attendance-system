import { Typography, Box, useTheme } from '@mui/material';
import { tokens } from '../theme';

const Header = ({ title, subtitle }) => {
  const theme = useTheme();
  const colors = tokens;

  return (
    <Box mb="30px">
      <Typography
        variant="h2"
        sx={{
          m: '0 0 5px 0',
          fontWeight: 'bold',
          fontFamily: 'Poppins, sans-serif',
          color: '#000000', 
        }}
      >
        {title}
      </Typography>

      <Typography
        variant="h5"
        sx={{
          fontFamily: 'Poppins, sans-serif',
          color: colors.primary[500],
        }}
      >
        {subtitle}
      </Typography>
    </Box>
  );
};

export default Header;
