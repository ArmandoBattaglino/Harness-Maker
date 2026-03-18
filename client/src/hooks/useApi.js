const MUTATION_HEADER = { 'X-Requested-With': 'ClaudeCodeManager' };

async function handleResponse(res) {
  if (res.ok) {
    // 204 No Content — return null
    if (res.status === 204) return null;
    return res.json();
  }
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body && body.error) message = body.error;
    else if (body && body.message) message = body.message;
  } catch (_) {
    // ignore parse error, use default message
  }
  throw new Error(message);
}

export async function apiGet(path) {
  const res = await fetch(path);
  return handleResponse(res);
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...MUTATION_HEADER,
    },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiDelete(path) {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: MUTATION_HEADER,
  });
  return handleResponse(res);
}

export async function apiDeleteWithBody(path, body) {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...MUTATION_HEADER,
    },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiPut(path, body) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...MUTATION_HEADER,
    },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}
