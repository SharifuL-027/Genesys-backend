import express from 'express';
import Blog from '../models/Blog.js';

const router = express.Router();

// @route   GET /api/blogs
// @desc    Get all published blogs (supports ?category=... & ?search=...)
// @access  Public
router.get('/', async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const query = { status: 'Published' };

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const blogs = await Blog.find(query)
      .select('-content')
      .sort({ publishedDate: -1, createdAt: -1 }); // Sort by custom date first, then creation time

    res.status(200).json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/blogs/:slug
// @desc    Get single published blog by slug
// @access  Public
router.get('/:slug', async (req, res, next) => {
  try {
    const blog = await Blog.findOne({
      slug: req.params.slug,
      status: 'Published',
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog article not found.',
      });
    }

    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    next(error);
  }
});

export default router;