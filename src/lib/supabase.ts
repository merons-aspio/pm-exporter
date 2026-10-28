import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ozbnducbpvbdewyerbkn.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96Ym5kdWNicHZiZGV3eWVyYmtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNDkyNDcsImV4cCI6MjEwODcyNTI0N30.sv93r3oCq2LkN-RCv1HgyNJxRSZY25y_ZZOSB_Bk0dU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
