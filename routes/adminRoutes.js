import express from 'express';
import jwt from 'jsonwebtoken';
import cloudinary from '../config/cloudinary.js';
import Contact from '../models/Contact.js';
import Blog from '../models/Blog.js';
import { protectAdmin } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Helper: Upload image buffer directly to Cloudinary
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'genesys-blogs',
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

// Helper: Generate clean SEO slug
const createSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

// ==========================================
// 1. ADMIN AUTHENTICATION
// ==========================================

// @route   POST /api/admin/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Invalid admin email or password',
  });
});

// ==========================================
// 2. DASHBOARD STATS
// ==========================================

// @route   GET /api/admin/stats
router.get('/stats', protectAdmin, async (req, res, next) => {
  try {
    const [totalLeads, newLeads, totalBlogs, publishedBlogs] = await Promise.all([
      Contact.countDocuments(),
      Contact.countDocuments({ status: 'New' }),
      Blog.countDocuments(),
      Blog.countDocuments({ status: 'Published' }),
    ]);

    res.status(200).json({
      success: true,
      data: { totalLeads, newLeads, totalBlogs, publishedBlogs },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 3. CONTACT LEADS MANAGEMENT
// ==========================================

// @route   GET /api/admin/contacts
router.get('/contacts', protectAdmin, async (req, res, next) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: contacts.length, data: contacts });
  } catch (error) {
    next(error);
  }
});

// @route   PATCH /api/admin/contacts/:id
router.patch('/contacts/:id', protectAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    const updated = await Contact.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/admin/contacts/:id
router.delete('/contacts/:id', protectAdmin, async (req, res, next) => {
  try {
    const deleted = await Contact.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    res.status(200).json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 4. CLOUDINARY IMAGE UPLOAD & BLOG MANAGEMENT
// ==========================================

// @route   POST /api/admin/upload-image
// @desc    Upload inline or cover image to Cloudinary
router.post(
  '/upload-image',
  protectAdmin,
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please select an image file' });
      }

      const result = await uploadToCloudinary(req.file.buffer);

      res.status(200).json({
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   GET /api/admin/blogs (Includes Drafts & Published)
router.get('/blogs', protectAdmin, async (req, res, next) => {
  try {
    const blogs = await Blog.find().sort({ publishedDate: -1, createdAt: -1 });
    res.status(200).json({ success: true, count: blogs.length, data: blogs });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/admin/blogs
// @desc    Create a new blog post (supports direct file upload OR coverImage URL)
router.post(
  '/blogs',
  protectAdmin,
  upload.single('coverImage'),
  async (req, res, next) => {
    try {
      const {
        title,
        excerpt,
        content,
        category,
        tags,
        author,
        readTime,
        status,
        coverImageUrl,
        publishedDate,
      } = req.body;

      if (!title || !excerpt || !content) {
        return res.status(400).json({
          success: false,
          message: 'Title, excerpt, and content are required.',
        });
      }

      let finalImageUrl = coverImageUrl || '';
      let finalPublicId = '';

      if (req.file) {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        finalImageUrl = uploadResult.secure_url;
        finalPublicId = uploadResult.public_id;
      }

      if (!finalImageUrl) {
        return res.status(400).json({
          success: false,
          message: 'Please upload a cover image.',
        });
      }

      // Ensure unique slug
      let slug = createSlug(title);
      const existingSlug = await Blog.findOne({ slug });
      if (existingSlug) {
        slug = `${slug}-${Date.now().toString().slice(-4)}`;
      }

      // Parse tags if sent as comma-separated string or JSON string
      let parsedTags = [];
      if (Array.isArray(tags)) {
        parsedTags = tags;
      } else if (typeof tags === 'string' && tags.trim()) {
        parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
      }

      const newBlog = await Blog.create({
        title,
        slug,
        excerpt,
        content,
        coverImage: finalImageUrl,
        coverImagePublicId: finalPublicId,
        category: category || 'Software Engineering',
        tags: parsedTags,
        author: author || 'Genesys Editorial Team',
        readTime: readTime || '5 min read',
        status: status || 'Published',
        publishedDate: publishedDate ? new Date(publishedDate) : Date.now(),
      });

      res.status(201).json({
        success: true,
        message: 'Blog published successfully!',
        data: newBlog,
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   PUT /api/admin/blogs/:id
// @desc    Update existing blog post (replaces old Cloudinary image if new file uploaded)
router.put(
  '/blogs/:id',
  protectAdmin,
  upload.single('coverImage'),
  async (req, res, next) => {
    try {
      const blog = await Blog.findById(req.params.id);
      if (!blog) {
        return res.status(404).json({ success: false, message: 'Blog not found' });
      }

      const {
        title,
        excerpt,
        content,
        category,
        tags,
        author,
        readTime,
        status,
        publishedDate,
      } = req.body;

      if (req.file) {
        // Delete previous image from Cloudinary if exists
        if (blog.coverImagePublicId) {
          await cloudinary.uploader.destroy(blog.coverImagePublicId);
        }
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        blog.coverImage = uploadResult.secure_url;
        blog.coverImagePublicId = uploadResult.public_id;
      }

      if (title && title !== blog.title) {
        blog.title = title;
        let newSlug = createSlug(title);
        const slugExists = await Blog.findOne({ slug: newSlug, _id: { $ne: blog._id } });
        blog.slug = slugExists ? `${newSlug}-${Date.now().toString().slice(-4)}` : newSlug;
      }

      if (excerpt) blog.excerpt = excerpt;
      if (content) blog.content = content;
      if (category) blog.category = category;
      if (author) blog.author = author;
      if (readTime) blog.readTime = readTime;
      if (status) blog.status = status;
      if (publishedDate) blog.publishedDate = new Date(publishedDate);

      if (tags !== undefined) {
        blog.tags = Array.isArray(tags)
          ? tags
          : tags.split(',').map((t) => t.trim()).filter(Boolean);
      }

      const updatedBlog = await blog.save();
      res.status(200).json({
        success: true,
        message: 'Blog updated successfully!',
        data: updatedBlog,
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   DELETE /api/admin/blogs/:id
// @desc    Delete blog post & remove cover image from Cloudinary
router.delete('/blogs/:id', protectAdmin, async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    if (blog.coverImagePublicId) {
      await cloudinary.uploader.destroy(blog.coverImagePublicId);
    }

    await blog.deleteOne();
    res.status(200).json({ success: true, message: 'Blog deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;