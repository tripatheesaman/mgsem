'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { WorkOrder } from '@/app/types';
import { Card } from '@/app/components/Card';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { apiClient } from '@/app/utils/api';
import { useToast } from '@/app/components/ToastContext';
import { useAuth } from '@/app/components/AuthProvider';

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

interface Filters {
  status: string;
  search: string;
  startDate: string;
  endDate: string;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
}

export default function AllWorkOrders() {
  const toast = useToast();
  const { user } = useAuth();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationData>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10
  });
  const [filters, setFilters] = useState<Filters>({
    status: '',
    search: '',
    startDate: '',
    endDate: '',
    sortBy: 'work_order_date',
    sortOrder: 'DESC'
  });


    const handleFiltersAndPagination = useCallback((workOrders: WorkOrder[], currentPage: number): {
      data: WorkOrder[];
      pagination: PaginationData;
    } => {
      let filtered = [...workOrders];

    // Apply filters
    if (filters.status) {
      filtered = filtered.filter((order: WorkOrder) => 
          order.status.toLowerCase() === filters.status.toLowerCase()
      );
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter((order: WorkOrder) => 
        order.work_order_no.toLowerCase().includes(searchLower) ||
        order.equipment_number.toLowerCase().includes(searchLower) ||
        (order.description || '').toLowerCase().includes(searchLower)
      );
    }

    if (filters.startDate) {
      filtered = filtered.filter((order: WorkOrder) => 
        order.work_order_date >= filters.startDate
      );
    }

    if (filters.endDate) {
      filtered = filtered.filter((order: WorkOrder) => 
        order.work_order_date <= filters.endDate
      );
    }

    // Sort data
    filtered.sort((a: WorkOrder, b: WorkOrder) => {
      const sortField = filters.sortBy as keyof WorkOrder;
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return filters.sortOrder === 'ASC' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      return 0;
    });

    // Apply pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pagination.itemsPerPage);
    const start = (currentPage - 1) * pagination.itemsPerPage;
    const end = start + pagination.itemsPerPage;
    const paginatedData = filtered.slice(start, end);

    return {
      data: paginatedData,
      pagination: {
        currentPage,
        totalPages,
        totalItems,
        itemsPerPage: pagination.itemsPerPage
      }
    };
    }, [filters, pagination.itemsPerPage]);

  const fetchWorkOrders = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const workOrdersResponse = await apiClient.get<WorkOrder[]>('/work-orders');
      
      if (!workOrdersResponse.success || !workOrdersResponse.data) {
        setError(workOrdersResponse.error || 'Failed to fetch work orders');
        toast.showError('Error', workOrdersResponse.error || 'Failed to fetch work orders');
        return;
      }

      const result = handleFiltersAndPagination(workOrdersResponse.data, page);
      setWorkOrders(result.data);
      setPagination(result.pagination);
    } catch {
      setError('Failed to fetch work orders');
      toast.showError('Error', 'Failed to fetch work orders');
    } finally {
      setLoading(false);
    }
  }, [handleFiltersAndPagination, toast]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchWorkOrders(1);
    }, 300);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [filters, fetchWorkOrders]);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'ongoing':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'completion_requested':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const renderPagination = useCallback((): React.ReactElement | null => {
    if (pagination.totalPages <= 1) return null;

  const pages: React.ReactElement[] = [];
    const maxVisiblePages = 5;
    const half = Math.floor(maxVisiblePages / 2);
    let startPage = Math.max(1, pagination.currentPage - half);
    const endPage = Math.min(pagination.totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => fetchWorkOrders(i)}
          disabled={pagination.currentPage === i}
          className={`px-3 py-1 mx-1 rounded ${
            pagination.currentPage === i
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          {i}
        </button>
      );
    }

    return (
      <div className="flex items-center justify-center space-x-2 mt-4">
        <button
          onClick={() => fetchWorkOrders(1)}
          disabled={pagination.currentPage === 1}
          className="px-3 py-1 rounded bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >⟪</button>
        <button
          onClick={() => fetchWorkOrders(Math.max(1, pagination.currentPage - 1))}
          disabled={pagination.currentPage === 1}
          className="px-3 py-1 rounded bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >◀</button>
        {pages}
        <button
          onClick={() => fetchWorkOrders(Math.min(pagination.totalPages, pagination.currentPage + 1))}
          disabled={pagination.currentPage === pagination.totalPages}
          className="px-3 py-1 rounded bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >▶</button>
        <button
          onClick={() => fetchWorkOrders(pagination.totalPages)}
          disabled={pagination.currentPage === pagination.totalPages}
          className="px-3 py-1 rounded bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >⟫</button>
      </div>
    );
  }, [pagination.currentPage, pagination.totalPages, fetchWorkOrders]);

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">All Work Orders</h1>
        <Link href="/work-orders/create" passHref>
          <Button>Create Work Order</Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="completion_requested">Completion Requested</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <Input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search work orders..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workOrders.map((order) => (
              <Card key={order.id} className="hover:shadow-lg transition-shadow h-full">
                <div className="p-4 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <Link href={`/work-orders/${order.id}`} className="font-semibold text-lg hover:underline">
                      {order.work_order_no}
                    </Link>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {order.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                  <div className="flex-grow space-y-2">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Date:</span>{' '}
                      {new Date(order.work_order_date).toLocaleDateString()}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Equipment:</span>{' '}
                      {order.equipment_number}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Type:</span>{' '}
                      {order.work_type}
                    </div>
                  </div>
                  {order.status === 'completed' && order.completion_approved_at && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs font-medium text-gray-700 mb-2">Signed Document:</div>
                      {order.signed_document ? (
                        <div className="flex flex-col space-y-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              window.open(`/${order.signed_document}`, '_blank');
                            }}
                            className="text-xs"
                          >
                            👁️ Preview
                          </Button>
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                if (file.type !== 'application/pdf') {
                                  toast.showError('Error', 'Only PDF files are allowed');
                                  return;
                                }

                                if (file.size > 10 * 1024 * 1024) {
                                  toast.showError('Error', 'File size too large. Maximum size is 10MB.');
                                  return;
                                }

                                try {
                                  const formData = new FormData();
                                  formData.append('file', file);

                                  const response = await apiClient.post(
                                    `/work-orders/${order.id}/signed-document`,
                                    formData
                                  );

                                  if (response.success) {
                                    fetchWorkOrders(pagination.currentPage);
                                    toast.showSuccess('Signed document replaced successfully');
                                  } else {
                                    toast.showError('Error', response.error || 'Failed to replace signed document');
                                  }
                                } catch (error) {
                                  console.error('Error replacing signed document:', error);
                                  toast.showError('Error replacing signed document');
                                }
                              }}
                            />
                            <span className="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 px-2 py-1 text-xs border-2 border-[#08398F] text-[#08398F] hover:bg-[#08398F] hover:text-white focus:ring-[#08398F]">
                              🔄 Replace
                            </span>
                          </label>
                          {user?.role === 'superadmin' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async (e) => {
                                e.preventDefault();
                                if (confirm('Are you sure you want to delete this signed document? This action cannot be undone.')) {
                                  try {
                                    const response = await apiClient.delete(`/work-orders/${order.id}/signed-document`);
                                    if (response.success) {
                                      fetchWorkOrders(pagination.currentPage);
                                      toast.showSuccess('Signed document deleted successfully');
                                    } else {
                                      toast.showError('Error', response.error || 'Failed to delete signed document');
                                    }
                                  } catch (error) {
                                    console.error('Error deleting signed document:', error);
                                    toast.showError('Error deleting signed document');
                                  }
                                }
                              }}
                              className="text-xs text-red-600 hover:text-red-700"
                            >
                              🗑️ Delete
                            </Button>
                          )}
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              if (file.type !== 'application/pdf') {
                                toast.showError('Error', 'Only PDF files are allowed');
                                return;
                              }

                              if (file.size > 10 * 1024 * 1024) {
                                toast.showError('Error', 'File size too large. Maximum size is 10MB.');
                                return;
                              }

                              try {
                                const formData = new FormData();
                                formData.append('file', file);

                                const response = await apiClient.post(
                                  `/work-orders/${order.id}/signed-document`,
                                  formData
                                );

                                if (response.success) {
                                  fetchWorkOrders(pagination.currentPage);
                                  toast.showSuccess('Signed document uploaded successfully');
                                } else {
                                  toast.showError('Error', response.error || 'Failed to upload signed document');
                                }
                              } catch (error) {
                                console.error('Error uploading signed document:', error);
                                toast.showError('Error uploading signed document');
                              }
                            }}
                          />
                          <span className="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 px-2 py-1 text-xs bg-[#08398F] text-white hover:bg-[#062a6b] focus:ring-[#08398F]">
                            📤 Upload PDF
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                  <div className="mt-3">
                    <Link href={`/work-orders/${order.id}`}>
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {workOrders.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              No work orders found
            </div>
          )}

          {workOrders.length > 0 && renderPagination()}
        </>
      )}
    </div>
  );
}