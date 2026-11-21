import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Blog title is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    excerpt: {
      type: String,
      required: [true, 'Short excerpt is required'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Blog content is required'],
    },
    coverImage: {
      type: String,
      required: [true, 'Cover image URL is required'],
    },
    coverImagePublicId: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      required: true,
      default: 'Software Engineering',
    },
    tags: {
      type: [String],
      default: [],
    },
    author: {
      type: String,
      default: 'Genesys Editorial Team',
    },
    readTime: {
      type: String,
      default: '5 min read',
    },
    status: {
      type: String,
      enum: ['Draft', 'Published'],
      default: 'Published',
    },
    publishedDate: {
    type: Date,
    default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Blog', blogSchema);