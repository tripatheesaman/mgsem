'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card } from '../components/Card';
import { apiClient } from '../utils/api';
import { useToast } from '../components/ToastContext';
import { CheckingAuthority } from '../types';
import { ConfirmationModal } from '../components/ConfirmationModal';

export default function CheckingAuthoritiesPage() {
  const { user } = useAuth();
  const [authorities, setAuthorities] = useState<CheckingAuthority[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newAuthority, setNewAuthority] = useState({ name: '', designation: '' });
  const [editAuthority, setEditAuthority] = useState({ name: '', designation: '', is_active: true });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [authorityToDelete, setAuthorityToDelete] = useState<number | null>(null);
  const toast = useToast();

  // Redirect if not superadmin
  useEffect(() => {
    if (user && user.role !== 'superadmin') {
      window.location.href = '/dashboard';
    }
  }, [user]);

  const fetchAuthorities = useCallback(async () => {
    try {
      const response = await apiClient.get<CheckingAuthority[]>('/checking-authorities');
      if (response.success && response.data) {
        setAuthorities(response.data);
      }
    } catch (error) {
      console.error('Error fetching authorities:', error);
      toast.showError('Error fetching checking authorities');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user?.role === 'superadmin') {
      fetchAuthorities();
    }
  }, [user, fetchAuthorities]);

  const handleAdd = async () => {
    if (!newAuthority.name.trim() || !newAuthority.designation.trim()) {
      toast.showError('Validation Error', 'Name and designation are required');
      return;
    }

    try {
      const response = await apiClient.post<CheckingAuthority>('/checking-authorities', {
        name: newAuthority.name,
        designation: newAuthority.designation
      });

      if (response.success) {
        setNewAuthority({ name: '', designation: '' });
        setIsAdding(false);
        fetchAuthorities();
        toast.showSuccess('Checking authority added successfully');
      } else {
        toast.showError('Error', response.error || 'Failed to add checking authority');
      }
    } catch (error) {
      console.error('Error adding authority:', error);
      toast.showError('Error adding checking authority');
    }
  };

  const handleEdit = async (id: number) => {
    if (!editAuthority.name.trim() || !editAuthority.designation.trim()) {
      toast.showError('Validation Error', 'Name and designation are required');
      return;
    }

    try {
      const response = await apiClient.put<CheckingAuthority>(`/checking-authorities/${id}`, {
        name: editAuthority.name,
        designation: editAuthority.designation,
        is_active: editAuthority.is_active
      });

      if (response.success) {
        setEditingId(null);
        setEditAuthority({ name: '', designation: '', is_active: true });
        fetchAuthorities();
        toast.showSuccess('Checking authority updated successfully');
      } else {
        toast.showError('Error', response.error || 'Failed to update checking authority');
      }
    } catch (error) {
      console.error('Error updating authority:', error);
      toast.showError('Error updating checking authority');
    }
  };

  const handleDelete = async () => {
    if (!authorityToDelete) return;

    try {
      const response = await apiClient.delete(`/checking-authorities/${authorityToDelete}`);
      if (response.success) {
        fetchAuthorities();
        toast.showSuccess('Checking authority deactivated successfully');
      } else {
        toast.showError('Error', response.error || 'Failed to deactivate checking authority');
      }
    } catch (error) {
      console.error('Error deleting authority:', error);
      toast.showError('Error deactivating checking authority');
    } finally {
      setShowDeleteModal(false);
      setAuthorityToDelete(null);
    }
  };

  const startEdit = (authority: CheckingAuthority) => {
    setEditingId(authority.id);
    setEditAuthority({
      name: authority.name,
      designation: authority.designation,
      is_active: authority.is_active
    });
  };

  if (user?.role !== 'superadmin') {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Checking & Releasing Authorities</h1>
        <Button onClick={() => setIsAdding(true)}>➕ Add Authority</Button>
      </div>

      <Card>
        {isAdding && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h2 className="text-lg font-semibold mb-4">Add New Authority</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Name"
                value={newAuthority.name}
                onChange={(e) => setNewAuthority(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter authority name"
                required
              />
              <Input
                label="Designation"
                value={newAuthority.designation}
                onChange={(e) => setNewAuthority(prev => ({ ...prev, designation: e.target.value }))}
                placeholder="Enter designation"
                required
              />
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleAdd}>Add Authority</Button>
              <Button variant="outline" onClick={() => { setIsAdding(false); setNewAuthority({ name: '', designation: '' }); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-left">ID</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Name</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Designation</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {authorities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-gray-300 px-4 py-8 text-center text-gray-500">
                    No checking authorities found. Add one to get started.
                  </td>
                </tr>
              ) : (
                authorities.map((authority) => (
                  <tr key={authority.id} className={!authority.is_active ? 'bg-gray-50 opacity-60' : ''}>
                    {editingId === authority.id ? (
                      <>
                        <td className="border border-gray-300 px-4 py-2">{authority.id}</td>
                        <td className="border border-gray-300 px-4 py-2">
                          <Input
                            value={editAuthority.name}
                            onChange={(e) => setEditAuthority(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full"
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <Input
                            value={editAuthority.designation}
                            onChange={(e) => setEditAuthority(prev => ({ ...prev, designation: e.target.value }))}
                            className="w-full"
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editAuthority.is_active}
                              onChange={(e) => setEditAuthority(prev => ({ ...prev, is_active: e.target.checked }))}
                            />
                            <span>{editAuthority.is_active ? 'Active' : 'Inactive'}</span>
                          </label>
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleEdit(authority.id)}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditAuthority({ name: '', designation: '', is_active: true }); }}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border border-gray-300 px-4 py-2">{authority.id}</td>
                        <td className="border border-gray-300 px-4 py-2">{authority.name}</td>
                        <td className="border border-gray-300 px-4 py-2">{authority.designation}</td>
                        <td className="border border-gray-300 px-4 py-2">
                          <span className={`px-2 py-1 rounded text-sm ${authority.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {authority.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  const response = await apiClient.put<CheckingAuthority>(`/checking-authorities/${authority.id}`, {
                                    is_active: !authority.is_active
                                  });
                                  if (response.success) {
                                    fetchAuthorities();
                                    toast.showSuccess(`Checking authority ${!authority.is_active ? 'activated' : 'deactivated'} successfully`);
                                  } else {
                                    toast.showError('Error', response.error || 'Failed to update checking authority');
                                  }
                                } catch (error) {
                                  console.error('Error toggling authority status:', error);
                                  toast.showError('Error updating checking authority');
                                }
                              }}
                            >
                              {authority.is_active ? '⏸️ Deactivate' : '▶️ Activate'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => startEdit(authority)}>
                              ✏️ Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAuthorityToDelete(authority.id);
                                setShowDeleteModal(true);
                              }}
                            >
                              🗑️ Delete
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmationModal
        isOpen={showDeleteModal}
        onCancel={() => { setShowDeleteModal(false); setAuthorityToDelete(null); }}
        onConfirm={handleDelete}
        title="Deactivate Checking Authority"
        message="Are you sure you want to deactivate this checking authority? This will mark it as inactive but won't delete it from the system."
      />
    </div>
  );
}

