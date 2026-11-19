/**
 * A lightweight fetch wrapper for public and authenticated API calls.
 */
export async function apiClient(endpoint, { body, ...customConfig } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  const config = {
    method: body ? 'POST' : 'GET',
    ...customConfig,
    headers: {
      ...headers,
      ...customConfig.headers,
    },
  };

  // Remove Content-Type if explicitly set to undefined (e.g. for FormData)
  if (config.headers['Content-Type'] === undefined) {
    delete config.headers['Content-Type'];
  }

  if (body) {
    config.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(endpoint, config);
    
    // Handle successful responses
    if (response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      }
      return await response.text();
    }
    
    // Handle specific error statuses
    if (response.status === 401) {
      console.warn('API Unauthorized: Possible session expiry');
    }

    let errorData;
    const contentType = response.headers.get("content-type");
    
    try {
      if (contentType && (contentType.includes("application/json") || contentType.includes("application/problem+json"))) {
        errorData = await response.json();
      } else {
        const text = await response.text();
        errorData = { detail: text || `HTTP error! status: ${response.status}` };
      }
    } catch (e) {
      errorData = { detail: `HTTP error! status: ${response.status}` };
    }

    // Support both RFC 7807 (detail/title) and legacy formats (error/message)
    const errorMessage = errorData.detail || errorData.message || errorData.error || `HTTP error! status: ${response.status}`;
    
    const error = new Error(errorMessage);
    error.status = response.status;
    error.title = errorData.title;
    error.type = errorData.type;
    error.errors = errorData.errors || []; // Field-level validation errors
    error.data = errorData;
    
    console.error(`API Error [${response.status}] at ${endpoint}:`, error.message);
    throw error;
  } catch (err) {
    // If it's already an error object with status, just rethrow it
    if (err.status) throw err;
    
    const wrappedError = new Error(err.message || 'Network request failed');
    console.error(`API Network Error at ${endpoint}:`, wrappedError.message);
    throw wrappedError;
  }
}