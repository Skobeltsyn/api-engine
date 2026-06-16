import ApiEngineError from "../models/ApiEngineError";

/**
 * Build the absolute request URL for a given base server and path. Pure so it
 * can be reused to rebuild a request against each server in a failover pool.
 *
 * - An external absolute path (http/https) is used as-is when
 *   `canUseOutsideLinks` is true; otherwise `path` is appended to `base`.
 * - Collapses accidental double slashes (but not the `://` in the scheme).
 * - Returns an {@link ApiEngineError} (`url_invalid`) instead of throwing on a
 *   malformed result.
 */
export function buildRequestUrl(base: string, path: string, canUseOutsideLinks: boolean): URL | ApiEngineError {
    const isExternal = (path.indexOf("https://") > -1) || (path.indexOf("http://") > -1);
    const raw = isExternal && canUseOutsideLinks
        ? path.replace(/([^:]\/)\/+/g, "$1")
        : `${base}/${path}`.replace(/([^:]\/)\/+/g, "$1");
    try {
        return new URL(raw);
    } catch (e) {
        return new ApiEngineError(
            "url_invalid",
            `Could not parse URL "${raw}": ${(e as Error).message}`
        );
    }
}
