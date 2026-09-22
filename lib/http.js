export function json(res, status, data) {
  return res.status(status).json(data);
}

export function methodNotAllowed(res, methods = []) {
  res.setHeader("Allow", methods.join(", "));
  return json(res, 405, {
    ok: false,
    error: "Method not allowed.",
  });
}

export function requireMethod(req, res, method) {
  if (req.method !== method) {
    methodNotAllowed(res, [method]);
    return false;
  }

  return true;
}
