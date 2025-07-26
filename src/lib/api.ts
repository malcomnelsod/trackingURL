const API_BASE_URL = import.meta.env.DEV ? '' : '';

class ApiClient {
  private baseURL: string;
  private token: string | null;

  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = localStorage.getItem('authToken');
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseURL}/api${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      console.log('Making request to:', url);
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(error.error || 'Request failed');
      }

      return response.json();
    } catch (error) {
      console.error('API request failed:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Unable to connect to server. Please ensure the server is running.');
      }
      throw error;
    }
  }

  // Auth methods
  async login(email: string, password: string) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    this.token = data.token;
    localStorage.setItem('authToken', data.token);
    return data;
  }

  async register(email: string, password: string, name: string) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    
    this.token = data.token;
    localStorage.setItem('authToken', data.token);
    return data;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  // Links methods
  async getLinks() {
    return this.request('/links');
  }

  async createLink(linkData: any) {
    return this.request('/links', {
      method: 'POST',
      body: JSON.stringify(linkData),
    });
  }

  // Campaigns methods
  async getCampaigns() {
    return this.request('/campaigns');
  }

  async createCampaign(campaignData: any) {
    return this.request('/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaignData),
    });
  }

  // Domains methods
  async getDomains() {
    return this.request('/domains');
  }

  async createDomain(domainData: any) {
    return this.request('/domains', {
      method: 'POST',
      body: JSON.stringify(domainData),
    });
  }

  // Analytics methods
  async getAnalytics() {
    return this.request('/analytics');
  }
}

export const api = new ApiClient();