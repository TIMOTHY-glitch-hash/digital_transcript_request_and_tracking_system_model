   import 'dotenv/config';
   import { createClient } from '@supabase/supabase-js';
   import ws from 'ws';

   const url = process.env.SUPABASE_URL;
   const key = process.env.SUPABASE_SECRET_KEY;

   if (!url || !key) {
     throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
   }

   export const supabase = createClient(url, key, {
     auth: { persistSession: false },
     // Node 20 has no built-in WebSocket, so give i gave  Supabase the "ws" package
     realtime: { transport: ws },
   });