import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  email: string;
  username: string | null;
  tokens: number;
  founded_city_id: string | null;
  referral_code: string;
  referred_by: string | null;
  last_visit_bonus: string | null;
  created_at: string;
};

export type City = {
  id: string;
  name: string;
  name_ru: string | null;
  slug: string;
  founder_id: string | null;
  created_at: string;
};

export type Block = {
  id: string;
  city_id: string;
  x: number;
  y: number;
  owner_id: string | null;
  image_url: string | null;
  link_url: string | null;
  title: string | null;
  tokens_paid: number;
  expires_at: string | null;
  is_founder_block: boolean;
  created_at: string;
};

export type Auction = {
  id: string;
  city_id: string;
  block_x: number;
  block_y: number;
  start_tokens: number;
  current_tokens: number;
  current_bidder_id: string | null;
  ends_at: string;
  is_active: boolean;
  created_at: string;
};