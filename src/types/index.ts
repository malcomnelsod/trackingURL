export interface User {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface Link {
  id: string;
  user_id: string;
  original_url: string;
  short_code: string;
  title?: string;
  description?: string;
  campaign_id?: string;
  domain_id?: string;
  is_cloaked: boolean;
  cloak_title?: string;
  cloak_description?: string;
  password_hash?: string;
  expires_at?: string;
  is_active: boolean;
  click_count: number;
  created_at: string;
  updated_at: string;
}

export interface Click {
  id: string;
  link_id: string;
  campaign_id?: string;
  ip_address: string;
  user_agent: string;
  referer?: string;
  country?: string;
  city?: string;
  device_type: string;
  browser: string;
  os: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  total_clicks: number;
  unique_clicks: number;
  conversion_rate: number;
  created_at: string;
  updated_at: string;
}

export interface Domain {
  id: string;
  user_id: string;
  domain: string;
  is_verified: boolean;
  ssl_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Analytics {
  totalClicks: number;
  uniqueClicks: number;
  topLinks: Array<{
    short_code: string;
    title: string;
    clicks: number;
  }>;
  deviceTypes: Array<{
    device: string;
    clicks: number;
  }>;
  clicksByDay: Array<{
    date: string;
    clicks: number;
  }>;
}