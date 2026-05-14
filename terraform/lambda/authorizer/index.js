/**
 * MH4 — Lambda Authorizer cho API Gateway HTTP API
 * Kiểm tra header: x-api-key
 * - Có key đúng → trả về isAuthorized: true → API Gateway cho qua (200)
 * - Không có key / sai key → isAuthorized: false → API Gateway trả 403
 */
exports.handler = async (event) => {
  console.log("Authorizer invoked:", JSON.stringify({
    routeKey: event.routeKey,
    headers: Object.keys(event.headers || {}),
  }));

  const validKey = process.env.VALID_API_KEY;
  const providedKey = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"];

  if (providedKey && providedKey === validKey) {
    console.log("Authorization: ALLOWED");
    return { isAuthorized: true };
  }

  console.log("Authorization: DENIED — invalid or missing x-api-key");
  return { isAuthorized: false };
};
