/**
 * SUPABASE CONNECTOR
 * Shared database connection (same project as wreck-vision)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase as mockSupabase } from './mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';

let supabase;

// Use mock database for local testing (development mode with fake credentials)
if (NODE_ENV === 'development' && (SUPABASE_URL?.includes('fake') || !SUPABASE_URL)) {
  console.log('\n📦 Using MOCK DATABASE for local testing');
  console.log('   Workshop ID: test-workshop-1');
  console.log('   PIN: 1234\n');
  supabase = mockSupabase;
} else {
  // Use real Supabase for production/staging
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('\n❌ CRITICAL ERROR: Supabase credentials not found!');
    console.error('Create .env.local with:');
    console.error('  SUPABASE_URL=https://xxx.supabase.co');
    console.error('  SUPABASE_ANON_KEY=eyJhbGci...\n');
    process.exit(1);
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('✅ Supabase connected');
}

export { supabase };
