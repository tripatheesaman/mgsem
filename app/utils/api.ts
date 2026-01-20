import { ApiResponse } from '../types';


const BASE_PATH = "/mgsem";
const API_BASE = `${BASE_PATH}/api`;

class ApiClient {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isFormData: boolean = false
  ): Promise<ApiResponse<T>> {

    const url = `${API_BASE}${endpoint}`;

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Only set JSON content type when we're not sending FormData.
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

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

      if (!text || !text.trim()) {
        if (response.ok) {
          return { success: true } as ApiResponse<T>;
        }
        return {
          success: false,
          error: `Empty response (${response.status})`,
        };
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          error: `Invalid JSON (${response.status})`,
        };
      }

      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      return {
        success: false,
        error: `Network error: ${msg}`,
      };
    }
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown) {
    const isFormData = data instanceof FormData;
    return this.request<T>(
      endpoint,
      {
        method: 'POST',
        body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
      },
      isFormData
    );
  }

  put<T>(endpoint: string, data?: unknown) {
    const isFormData = data instanceof FormData;
    return this.request<T>(
      endpoint,
      {
        method: 'PUT',
        body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
      },
      isFormData
    );
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }


  

  async getBlob(endpoint: string): Promise<{ ok: boolean; blob?: Blob; filename?: string }> {
    const url = `${API_BASE}${endpoint}`;
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return { ok: false };
      }

      const blob = await response.blob();
      
      let filename: string | undefined;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      return {
        ok: true,
        blob,
        filename,
      };
    } catch (err) {
      return { ok: false };
    }
  }

  upload<T>(endpoint: string, formData: FormData) {
    return this.request<T>(
      endpoint,
      {
        method: 'POST',
        body: formData,
      },
      true
    );
  }
}

export const apiClient = new ApiClient();
