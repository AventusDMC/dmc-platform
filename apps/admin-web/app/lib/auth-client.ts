'use client';

function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return '';
  }

  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

export function getSessionToken() {
  return readCookie('dmc_session');
}

export function buildAuthHeaders(headers: HeadersInit = {}) {
  const token = getSessionToken();

  if (!token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}
