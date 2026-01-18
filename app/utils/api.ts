import { ApiResponse } from '../types';


const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL
if (typeof window !== 'undefined' && !API_BASE_URL) {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_URL is not defined. ' +
    'It must be set when using Next.js basePath.'
  );
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No authentication token found in localStorage');
      }
      return token;
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
      if (response.redirected) {
        console.warn('API request was redirected:', {
          url,
          redirected: response.url,
          status: response.status
        });
      }

      let data;
      const contentType = response.headers.get('content-type') || '';
      
      try {
        const text = await response.text();
        
        if (text.trim()) {
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            console.error('Failed to parse JSON response:', {
              status: response.status,
              statusText: response.statusText,
              contentType,
              url,
              responsePreview: text.substring(0, 500)
            });
            
            return {
              success: false,
              error: response.ok 
                ? `Invalid response: server returned non-JSON content (${contentType})`
                : `Request failed: ${response.status} ${response.statusText}`,
            };
          }
        } else {
          // Empty response
          return {
            success: false,
            error: 'Empty response from server',
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error reading response',
        };
      }
      
      if (!response.ok && response.status === 401) {
        // Check if token exists but is invalid
        const token = this.getToken();
        if (process.env.NODE_ENV === 'development' && !endpoint.includes('/notifications')) {
          console.warn('Authentication error:', {
            hasToken: !!token,
            status: response.status,
            url: endpoint
          });
        }
      }
      
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
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

export const apiClient = new ApiClient(API_BASE_URL as string); 