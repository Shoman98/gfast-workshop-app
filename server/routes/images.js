import express from 'express';
import { supabase } from '../db/supabase.js';

const router = express.Router();

/**
 * GET /api/images?estimate_id=xxx
 * Fetch all images for an estimate
 */
router.get('/', async (req, res) => {
  try {
    const { estimate_id } = req.query;
    if (!estimate_id) return res.status(400).json({ error: 'Missing estimate_id' });

    const { data, error } = await supabase
      .from('estimate_images')
      .select('*')
      .eq('estimate_id', estimate_id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    res.json({ images: data || [] });
  } catch (err) {
    console.error('Images fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/images
 * Save image reference to database
 * Body: { estimate_id, cloudinary_public_id, cloudinary_url, uploaded_by }
 */
router.post('/', async (req, res) => {
  try {
    const { estimate_id, cloudinary_public_id, cloudinary_url, uploaded_by } = req.body;
    if (!estimate_id || !cloudinary_public_id || !cloudinary_url) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('estimate_images')
      .insert([{
        estimate_id,
        cloudinary_public_id,
        cloudinary_url,
        uploaded_by
      }])
      .select();

    if (error) throw error;
    res.json({ image: data[0] });
  } catch (err) {
    console.error('Image save error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/images/:id
 * Delete image reference
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('estimate_images')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Image delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
