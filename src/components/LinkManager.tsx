import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Copy, 
  Eye, 
  EyeOff, 
  Edit, 
  Trash2,
  ExternalLink,
  Calendar,
  Shield
} from 'lucide-react';
import { Link, Campaign, Domain } from '../types';
import { api } from '../lib/api';

export default function LinkManager() {
  const [links, setLinks] = useState<Link[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    original_url: '',
    title: '',
    description: '',
    campaign_id: '',
    domain_id: '',
    is_cloaked: false,
    cloak_title: '',
    cloak_description: '',
    password: '',
    expires_at: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [linksData, campaignsData, domainsData] = await Promise.all([
        api.getLinks(),
        api.getCampaigns(),
        api.getDomains()
      ]);
      setLinks(linksData);
      setCampaigns(campaignsData);
      setDomains(domainsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createLink(formData);
      setShowForm(false);
      setFormData({
        original_url: '',
        title: '',
        description: '',
        campaign_id: '',
        domain_id: '',
        is_cloaked: false,
        cloak_title: '',
        cloak_description: '',
        password: '',
        expires_at: ''
      });
      loadData();
    } catch (error) {
      console.error('Failed to create link:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getShortUrl = (link: Link) => {
    const domain = link.domain_id && domains.find(d => d.id === link.domain_id);
    const baseUrl = domain ? `https://${domain.domain}` : window.location.origin;
    return `${baseUrl}/${link.short_code}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Links</h1>
          <p className="text-gray-600">Manage your shortened and cloaked links</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Link
        </button>
      </div>

      {/* Create Link Form */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Link</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Original URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={formData.original_url}
                    onChange={(e) => setFormData({ ...formData, original_url: e.target.value })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://example.com"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Campaign</label>
                    <select
                      value={formData.campaign_id}
                      onChange={(e) => setFormData({ ...formData, campaign_id: e.target.value })}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select Campaign</option>
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_cloaked"
                    checked={formData.is_cloaked}
                    onChange={(e) => setFormData({ ...formData, is_cloaked: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_cloaked" className="ml-2 block text-sm text-gray-900">
                    Enable link cloaking
                  </label>
                </div>

                {formData.is_cloaked && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Cloak Title</label>
                      <input
                        type="text"
                        value={formData.cloak_title}
                        onChange={(e) => setFormData({ ...formData, cloak_title: e.target.value })}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Cloak Description</label>
                      <input
                        type="text"
                        value={formData.cloak_description}
                        onChange={(e) => setFormData({ ...formData, cloak_description: e.target.value })}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Password Protection</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Optional password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Expires At</label>
                    <input
                      type="datetime-local"
                      value={formData.expires_at}
                      onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Create Link
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Links List */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Your Links</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {links.map((link) => (
            <div key={link.id} className="p-6 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {link.title || link.original_url}
                    </h4>
                    {link.is_cloaked && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        <EyeOff className="w-3 h-3 mr-1" />
                        Cloaked
                      </span>
                    )}
                    {link.password_hash && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Shield className="w-3 h-3 mr-1" />
                        Protected
                      </span>
                    )}
                    {link.expires_at && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <Calendar className="w-3 h-3 mr-1" />
                        Expires
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center space-x-2">
                    <code className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {getShortUrl(link)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(getShortUrl(link))}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 truncate">{link.original_url}</p>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-500">
                    <span className="font-medium">{link.click_count}</span> clicks
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => window.open(getShortUrl(link), '_blank')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    <button className="text-gray-400 hover:text-gray-600">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button className="text-gray-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}