import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://hljygplhebcafhynpnlr.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsanlncGxoZWJjYWZoeW5wbmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjU3MDksImV4cCI6MjA5NjEwMTcwOX0.iP2f8j-odh5Jsa3-UmvuhaVBNrb-ju5UTwsisRlF2oI";

if (!supabaseUrl || !supabaseAnonKey) {
  // Vite exposes env vars only when they start with VITE_.
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
