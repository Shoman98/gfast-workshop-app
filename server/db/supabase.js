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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase;

if (!SUPABASE_URL || SUPABASE_URL.includes('fake') || !SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_KEY.includes('fake')) {
  console.log('\n📦 Using MOCK DATABASE for local testing');
  console.log('   Workshop ID: test-workshop-1');
  console.log('   PIN: 1234\n');
  supabase = mockSupabase;
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('✅ Supabase connected');
}

export { supabase };
