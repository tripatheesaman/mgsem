import { ApiResponse } from '../types';

const API_BASE_URL = '/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const text = await response.text();

      if (!text) {
        return { success: false, error: 'Empty response from server' };
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          error: `Invalid JSON response (${response.status})`,
        };
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async getBlob(endpoint: string): Promise<{ ok: boolean; blob?: Blob; filename?: string; status: number; }> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(url, { method: 'GET', headers });
    const cd = resp.headers.get('Content-Disposition') || '';
    const match = /filename\s*=\s*"?([^";]+)"?/i.exec(cd || '');
    const filename = match ? decodeURIComponent(match[1]) : undefined;
    if (!resp.ok) {
      return { ok: false, status: resp.status };
    }
    const blob = await resp.blob();
    return { ok: true, blob, filename, status: resp.status };
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
