import { createClient } from "@supabase/supabase-js";

// Replace these with your actual Supabase project URL and anon key
const SUPABASE_URL = "https://emylqqnhotwhfgqrdaci.supabase.co/rest/v1/";
const SUPABASE_PUBLIC_KEY = "sb_publishable_n3euqp6hqpqMPegTlfQd5A_smiA8aLD";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
