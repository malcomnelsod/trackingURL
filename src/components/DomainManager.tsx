import React, { useState, useEffect } from 'react';
import { Plus, Globe, CheckCircle, XCircle, Shield, AlertTriangle } from 'lucide-react';
import { Domain } from '../types';
import { api } from '../lib/api';

export default function DomainManager() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    domain: ''
  });

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      const data = await api.getDomains();
      setDomains(data);
    } catch (error) {
      console.error('Failed to load domains:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createDomain(formData);
      setShowForm(false);
      setFormData({ domain: '' });
      loadDomains();
    } catch (error) {
      console.error('Failed to create domain:', error);
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Custom Domains</h1>
          <p className="text-gray-600">Add and manage your custom domains for link tracking</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Domain
        </button>
      </div>

      {/* Add Domain Form */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add Custom Domain</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Domain Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="links.yourdomain.com"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Enter the subdomain you want to use for link tracking
                  </p>
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
                    Add Domain
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Domains List */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Your Domains</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {domains.map((domain) => (
            <div key={domain.id} className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Globe className="h-8 w-8 text-blue-600 mr-3" />
                  <div>
                    <h4 className="text-lg font-medium text-gray-900">{domain.domain}</h4>
                    <div className="flex items-center space-x-4 mt-1">
                      <div className="flex items-center">
                        {domain.is_verified ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 mr-1" />
                        )}
                        <span className={`text-sm ${domain.is_verified ? 'text-green-600' : 'text-red-600'}`}>
                          {domain.is_verified ? 'Verified' : 'Not Verified'}
                        </span>
                      </div>
                      <div className="flex items-center">
                        {domain.ssl_enabled ? (
                          <Shield className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mr-1" />
                        )}
                        <span className={`text-sm ${domain.ssl_enabled ? 'text-green-600' : 'text-yellow-600'}`}>
                          {domain.ssl_enabled ? 'SSL Enabled' : 'SSL Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    domain.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {domain.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {!domain.is_verified && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                  <h5 className="text-sm font-medium text-yellow-800 mb-2">Domain Verification Required</h5>
                  <p className="text-sm text-yellow-700 mb-3">
                    Add the following DNS records to verify your domain:
                  </p>
                  <div className="space-y-2">
                    <div className="bg-white p-3 rounded border">
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <strong>Type:</strong> CNAME
                        </div>
                        <div>
                          <strong>Name:</strong> {domain.domain}
                        </div>
                        <div>
                          <strong>Value:</strong> linktracker.app
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <strong>Type:</strong> TXT
                        </div>
                        <div>
                          <strong>Name:</strong> _linktracker
                        </div>
                        <div>
                          <strong>Value:</strong> linktracker-verification=abc123
                        </div>
                      </div>
                    </div>
                  </div>
                  <button className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium">
                    Check Verification Status
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {domains.length === 0 && (
        <div className="text-center py-12">
          <Globe className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No custom domains</h3>
          <p className="mt-1 text-sm text-gray-500">
            Add a custom domain to personalize your short links.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Domain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}