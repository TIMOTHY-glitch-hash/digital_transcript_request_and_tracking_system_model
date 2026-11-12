import { supabase } from './client.js';

const { count, error } = await supabase
  .from('transcript_requests')
  .select('*', { count: 'exact', head: true });

if (error) {
  console.error('FAILED:', error.message);
  process.exit(1);
}
console.log('Connected. Rows in transcript_requests:', count);
