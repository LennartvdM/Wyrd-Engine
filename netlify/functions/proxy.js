const DEFAULT_REPO_SLUG =
  process.env.GITHUB_REPOSITORY ||
  parseRepositorySlug(process.env.REPOSITORY_URL) ||
  "LennartvdM/Wyrd-Engine";
const DEFAULT_BRANCH = process.env.COMMIT_REF || "main";

export async function handler(event) {
  try {
    const params = event.queryStringParameters || {};
    const targetUrl = params.url;
    const slug = params.slug || DEFAULT_REPO_SLUG;
    const branch = params.branch || DEFAULT_BRANCH;
    const path = params.path;

    if (!slug) {
      return jsonResponse(400, { error: "Missing repository slug." });
    }

    let urlToFetch = targetUrl;
    if (!urlToFetch) {
      if (!path) {
        return jsonResponse(400, { error: "Missing path." });
      }
      urlToFetch = buildRawUrl(slug, branch, path);
    }

    const response = await fetch(urlToFetch, { headers: buildForwardHeaders(event) });
    const body = await response.text();

    return {
      statusCode: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": response.headers.get("cache-control") || "no-store",
      },
      body,
    };
  } catch (error) {
    return jsonResponse(502, { error: "Proxy request failed.", details: error.message });
  }
}

function buildRawUrl(slug, branch, path) {
  const safeSlug = slug.replace(/^\/+|\/+$/g, "");
  const safeBranch = branch.replace(/^\/+|\/+$/g, "") || "main";
  const safePath = path.replace(/^\/+/, "");
  return `https://raw.githubusercontent.com/${safeSlug}/${safeBranch}/${safePath}`;
}

function parseRepositorySlug(repositoryUrl = "") {
  const match = repositoryUrl.match(/github.com[:/]([^\s]+?)(?:\.git)?$/i);
  return match ? match[1] : undefined;
}

function buildForwardHeaders(event) {
  const headers = new Headers();
  const sourceHeaders = event.headers || {};
  const allowed = ["if-none-match", "if-modified-since", "authorization"];
  for (const key of allowed) {
    if (sourceHeaders[key]) {
      headers.set(key, sourceHeaders[key]);
    }
  }
  return headers;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(payload),
  };
}
