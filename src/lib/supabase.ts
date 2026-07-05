import { createClient } from "@supabase/supabase-js";

// We use the credentials from test-supabase.js
const SUPABASE_URL = "https://emylqqnhotwhfgqrdaci.supabase.co";
const SUPABASE_PUBLIC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVteWxxcW5ob3R3aGZncXJkYWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMjg2NTMsImV4cCI6MjA5ODcwNDY1M30.WSU2ErgJeYO4lTPbyhAVuPOOAxuFcZvXj-dZuaYdhGY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
