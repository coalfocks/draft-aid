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
const clientBuildPath = path.join(__dirname, 'client/build');
app.use(express.static(clientBuildPath));

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

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'draft-aid', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  const indexPath = path.join(clientBuildPath, 'index.html');
  res.sendFile(indexPath, (error) => {
    if (error) {
      res.status(404).json({
        error: 'No web client is bundled in this repo. Load the Chrome extension from the extension/ folder.'
      });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
