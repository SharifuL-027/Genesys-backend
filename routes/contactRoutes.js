import express from 'express';
import Contact from '../models/Contact.js';

const router = express.Router();

// @route   POST /api/contact
// @desc    Submit a new contact inquiry from website
// @access  Public
router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, service, budget, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required.',
      });
    }

    const newInquiry = await Contact.create({
      name,
      email,
      phone,
      service,
      budget,
      message,
    });

    res.status(201).json({
      success: true,
      message: 'Thank you! Your message has been received.',
      data: newInquiry,
    });
  } catch (error) {
    next(error);
  }
});

export default router;