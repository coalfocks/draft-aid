const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3031;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'client/build')));

const upload = multer({ dest: 'uploads/' });

const openaiRoutes = require('./routes/openai');
const draftRoutes = require('./routes/draft');

app.use('/api/openai', openaiRoutes);
app.use('/api/draft', draftRoutes);

app.post('/api/upload-screenshot', upload.single('screenshot'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({ 
    message: 'Screenshot uploaded successfully',
    filename: req.file.filename,
    path: req.file.path
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});