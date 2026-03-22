import { Box, Button, TextField, Typography, FormControl, Select, MenuItem, InputLabel, FormHelperText } from '@mui/material';  // ✅ ADDED Typography
import { useState, useEffect } from 'react';
import { Formik } from 'formik';
import * as yup from 'yup';
import useMediaQuery from '@mui/material/useMediaQuery';
import api from '../../api';
import Header from '../../components/Header';

const initialValues = {
  tag_id: '',
  name: '',
  email: '',
  department: '',
  is_active: 1,
};

const userSchema = yup.object().shape({
  tag_id: yup.string().required('Tag ID is required'),
  name: yup.string().required('Name is required'),
  email: yup.string().email('Invalid email').required('Email is required for logs access'),
  department: yup.string().required('Department is required'),
});

const Form = () => {
  const isNonMobile = useMediaQuery('(min-width:600px)');
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    api.get('/departments')
      .then(res => setDepartments(Array.isArray(res.data) ? res.data : []))
      .catch(console.error);
  }, []);

  const handleFormSubmit = async (values, { resetForm }) => {
    try {
      console.log('✅ Submitting to Azure:', values);

      await api.post(`/tags/`, {
        tag_id: values.tag_id,
        name: values.name,
        email: values.email,
        department: values.department,
        is_active: 1
      });

      alert('✅ NFC Tag registered successfully!\nRefresh Tags page to see it.');
      resetForm();
    } catch (err) {
      console.error('❌ Azure error:', err.response?.data || err.message);
      const errorMsg = err.response?.data?.message || 'Failed to register tag.';
      alert(`❌ Error: ${errorMsg}`);
    }
  };

  return (
    <Box m="20px" sx={{ fontFamily: 'Poppins, sans-serif' }}>
      <Header
        title="REGISTER NFC TAG"
        subtitle="Add new employee NFC tag to Azure Cloud access list"
      />

      <Formik
        onSubmit={handleFormSubmit}
        initialValues={initialValues}
        validationSchema={userSchema}
      >
        {({
          values,
          errors,
          touched,
          handleBlur,
          handleChange,
          handleSubmit,
        }) => (
          <form onSubmit={handleSubmit}>
            <Box
              display="grid"
              gap="25px"
              gridTemplateColumns="repeat(4, minmax(0, 1fr))"
              sx={{
                '& > div': { gridColumn: isNonMobile ? undefined : 'span 4' },
              }}
            >
              <TextField
                fullWidth
                variant="filled"
                type="text"
                label="NFC Tag ID"
                placeholder="e.g. 04A1B2C3D4E5"
                onBlur={handleBlur}
                onChange={handleChange}
                value={values.tag_id}
                name="tag_id"
                error={!!touched.tag_id && !!errors.tag_id}
                helperText={touched.tag_id && errors.tag_id}
                sx={{
                  gridColumn: 'span 2',
                  '& .MuiInputBase-root': {
                    fontFamily: 'Poppins, sans-serif',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '8px',
                  },
                  '& .MuiInputLabel-root': {
                    fontFamily: 'Poppins, sans-serif',
                  },
                }}
              />
              <TextField
                fullWidth
                variant="filled"
                type="text"
                label="Employee Name"
                placeholder="e.g. abc"
                onBlur={handleBlur}
                onChange={handleChange}
                value={values.name}
                name="name"
                error={!!touched.name && !!errors.name}
                helperText={touched.name && errors.name}
                sx={{
                  gridColumn: 'span 2',
                  '& .MuiInputBase-root': {
                    fontFamily: 'Poppins, sans-serif',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '8px',
                  },
                  '& .MuiInputLabel-root': {
                    fontFamily: 'Poppins, sans-serif',
                  },
                }}
              />
              {/* NEW EMAIL FIELD FOR RBAC LINKING */}
              <TextField
                fullWidth
                variant="filled"
                type="email"
                label="Linked Email (For Logs View)"
                placeholder="e.g. student@college.edu"
                onBlur={handleBlur}
                onChange={handleChange}
                value={values.email}
                name="email"
                error={!!touched.email && !!errors.email}
                helperText={touched.email && errors.email}
                sx={{
                  gridColumn: 'span 2',
                  '& .MuiInputBase-root': {
                    fontFamily: 'Poppins, sans-serif',
                    backgroundColor: '#f0f4f8',
                    borderRadius: '8px',
                  },
                }}
              />
              <FormControl
                variant="filled"
                error={!!touched.department && !!errors.department}
                sx={{
                  gridColumn: 'span 2',
                  '& .MuiInputBase-root': {
                    fontFamily: 'Poppins, sans-serif',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '8px',
                  }
                }}
              >
                <InputLabel>Department</InputLabel>
                <Select
                  name="department"
                  value={values.department}
                  onChange={handleChange}
                  onBlur={handleBlur}
                >
                  <MenuItem value="" disabled>Select Department</MenuItem>
                  {departments.map(d => (
                    <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>
                  ))}
                </Select>
                {touched.department && errors.department && (
                  <FormHelperText>{errors.department}</FormHelperText>
                )}
              </FormControl>
            </Box>

            <Box display="flex" justifyContent="end" mt="30px">
              <Button
                type="submit"
                color="primary"
                variant="contained"
                disabled={!values.tag_id.trim() || !values.name.trim()}
                sx={{
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '10px',
                  px: '20px',
                  py: '10px',
                }}
              >
                Register New Tag
              </Button>
            </Box>
          </form>
        )}
      </Formik>


    </Box>
  );
};

export default Form;