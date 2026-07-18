-- Create estimate_images table to track Cloudinary images
CREATE TABLE IF NOT EXISTS estimate_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id TEXT NOT NULL REFERENCES estimates(estimate_id) ON DELETE CASCADE,
  cloudinary_public_id TEXT NOT NULL,
  cloudinary_url TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by TEXT,
  CONSTRAINT fk_estimate FOREIGN KEY (estimate_id) REFERENCES estimates(estimate_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_estimate_images_estimate_id
  ON estimate_images(estimate_id);

-- Enable RLS
ALTER TABLE estimate_images ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read images
CREATE POLICY "Allow read all images" ON estimate_images
  FOR SELECT USING (true);

-- Allow authenticated users to insert images
CREATE POLICY "Allow insert images" ON estimate_images
  FOR INSERT WITH CHECK (true);
