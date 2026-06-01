const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const videoRoutes = require('./routes/videoRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend development server
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// Parsers for requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure required directories exist on startup
const uploadsDir = path.join(__dirname, '../uploads');
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`Created uploads directory at: ${uploadsDir}`);
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created server data directory at: ${dataDir}`);
}

// Initial empty JSON data file if not present
const dbPath = path.join(dataDir, 'videos.json');
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
  console.log(`Created metadata JSON file at: ${dbPath}`);
}

// Routes
app.use('/api', videoRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Secure Video Player Backend running on port ${PORT}`);
});
