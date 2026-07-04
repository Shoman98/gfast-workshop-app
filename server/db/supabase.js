/**
 * SUPABASE CONNECTOR
 * Shared database connection (same project as wreck-vision)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('\n❌ CRITICAL ERROR: Supabase credentials not found!');
  console.error('Create .env.local with:');
  console.error('  SUPABASE_URL=https://xxx.supabase.co');
  console.error('  SUPABASE_ANON_KEY=eyJhbGci...\n');
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase connected');
