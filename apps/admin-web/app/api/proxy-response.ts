import { NextResponse } from 'next/server';

function isJsonContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return normalized.includes('application/json') || normalized.includes('+json');
}

function buildProxyErrorMessage(response: Response, bodyText: string) {
  const location = response.headers.get('location');

  if (response.status >= 300 && response.status < 400) {
    return location
      ? `Upstream returned a redirect to ${location} instead of JSON.`
      : 'Upstream returned a redirect instead of JSON.';
  }

  if (bodyText && !bodyText.trim().startsWith('<')) {
    return bodyText;
  }

  return response.statusText || 'Upstream returned a non-JSON response.';
}

export async function forwardProxyJsonResponse(response: Response) {
  if (response.status === 204 || response.status === 205) {
    return new NextResponse(null, { status: response.status });
  }

  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text();

  if (isJsonContentType(contentType)) {
    return new NextResponse(bodyText, {
      status: response.status,
      headers: {
        'content-type': contentType,
      },
    });
  }

  return NextResponse.json(
    {
      message: buildProxyErrorMessage(response, bodyText),
    },
    { status: response.status },
  );
}

export async function forwardProxyContentResponse(response: Response) {
  if (response.status === 204 || response.status === 205) {
    return new NextResponse(null, { status: response.status });
  }

  const body = await response.arrayBuffer();
  const headers = new Headers();

  for (const headerName of ['content-type', 'content-disposition', 'content-length', 'cache-control']) {
    const value = response.headers.get(headerName);

    if (value) {
      headers.set(headerName, value);
    }
  }

  return new NextResponse(body, {
    status: response.status,
    headers,
  });
}
