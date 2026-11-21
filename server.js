import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';

// Route Imports
import adminRoutes from './routes/adminRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import blogRoutes from './routes/blogRoutes.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Trust proxy (Required for Render, Railway, Vercel, Nginx rate-limiting)
app.set('trust proxy', 1);

// 1. Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. Proper Dynamic CORS Configuration
const allowedOrigins = process.env.CLIENT_URLS
  ? process.env.CLIENT_URLS.split(',').map((url) => url.trim().replace(/\/$/, ''))
  : ['http://localhost:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., Postman, curl, mobile apps, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/$/, '');

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    } else {
      console.warn(`Blocked by CORS: ${origin}`);
      return callback(new Error(`CORS policy violation: Origin ${origin} is not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200, // Legacy browser support for preflight OPTIONS
};

app.use(cors(corsOptions));

// Explicitly handle preflight OPTIONS requests across all routes
app.options('*', cors(corsOptions));

// 3. Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Max 200 requests per IP per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 contact form submissions per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many inquiries submitted. Please try again after an hour.',
  },
});

app.use('/api', apiLimiter);

// 5. Health Check Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Genesys API Server is running smoothly.',
    timestamp: new Date().toISOString(),
  });
});

// 6. API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactLimiter, contactRoutes);
app.use('/api/blogs', blogRoutes);

// 7. 404 Not Found Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

// 8. Global Error Handler (Catches CORS, Multer, and Server errors cleanly)
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);

  // Handle CORS Errors
  if (err.message && err.message.startsWith('CORS policy violation')) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  // Handle Multer File Upload Errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File is too large. Maximum allowed size is 5MB.',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed CORS Origins:`, allowedOrigins);
});