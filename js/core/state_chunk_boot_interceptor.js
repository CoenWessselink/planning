/* CWS Planning V127 — pre-store D1 chunk boot interceptor.
   Server compatibility fix: older /api/state builds treat a missing chunkIndex as chunk 0
   because Number("") === 0. Therefore every manifest/raw boot probe explicitly sends chunk=-1.
   This prevents the app from booting on a truncated 180000-char chunk and falling back to stale local data. */
(function(){
  const MARKER = "v127-pre-store-d1-chunk-boot-interceptor-force-nonchunk";
  if(window.__cwsV127StateChunkBootInterceptorInstalled) return;

  const nativeFetch = window.fetch.bind(window);

  function stateUrl(input){
    try{
      const rawUrl = typeof input === "string" ? input : String(input?.url || "");
      return new URL(rawUrl, location.origin);
    }catch(_){ return null; }
  }

  function isStateBootRequest(input){
    const url = stateUrl(input);
    if(!url) return false;
    return url.pathname === "/api/state" &&
      url.searchParams.get("payload") === "raw-state" &&
      !url.searchParams.has("chunkIndex") &&
      !url.searchParams.has("chunk");
  }

  function withExplicitNonChunk(input){
    const url = stateUrl(input);
    if(!url) return input;
    if(url.pathname === "/api/state" && !url.searchParams.has("chunkIndex") && !url.searchParams.has("chunk")){
      url.searchParams.set("chunk", "-1");
      url.searchParams.set("cacheBust", String(Date.now()));
      return url.pathname + url.search;
    }
    return input;
  }

  function isManifestText(text){
    if(!text || typeof text !== "string" || text.length > 5000) return false;
    try{
      const parsed = JSON.parse(text);
      return Boolean(parsed?.__cwsChunkedState || parsed?.__cwsStateChunkManifest);
    }catch(_){ return false; }
  }

  function parseManifest(text){
    const parsed = JSON.parse(text || "{}");
    if(parsed?.stateJson && typeof parsed.stateJson === "string"){
      try{ return JSON.parse(parsed.stateJson); }catch(_){ }
    }
    return parsed;
  }

  function isClearlyTruncatedChunk(text){
    if(typeof text !== "string" || !text) return false;
    if(text.length >= 179900 && text.length <= 180100) return true;
    try{ JSON.parse(text); return false; }
    catch(error){ return /Unterminated string|Unexpected end of JSON|position\s+180000/i.test(String(error.message || error)); }
  }

  async function fetchText(url, options){
    const response = await nativeFetch(url, options || {});
    const text = await response.text();
    if(!response.ok){
      let message = `Fetch mislukt ${url} (${response.status})`;
      try{ const data = JSON.parse(text || "{}"); if(data?.error) message = data.error; }catch(_){ }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return { response, text };
  }

  async function fetchManifest(existingText, existingResponse){
    if(isManifestText(existingText)){
      return { manifest:parseManifest(existingText), response:existingResponse };
    }
    const fresh = await fetchText(`/api/state?payload=raw-state&chunks=manifest&chunk=-1&cacheBust=${Date.now()}`, {
      headers:{ "Accept":"application/json", "X-CWS-State-Response":"chunk-manifest", "Cache-Control":"no-cache" }
    });
    return { manifest:parseManifest(fresh.text), response:fresh.response };
  }

  async function fetchFullStateFromChunks(existingText, existingResponse){
    const { manifest, response:manifestResponse } = await fetchManifest(existingText, existingResponse);
    const version = Number(manifest?.version || manifestResponse.headers.get("X-CWS-Version") || 0);
    const chunkCount = Number(manifest?.chunkCount || manifestResponse.headers.get("X-CWS-Chunk-Count") || 0);
    if(!version || !chunkCount){
      throw new Error("D1 chunk manifest mist version/chunkCount.");
    }

    const chunks = new Array(chunkCount);
    for(let i = 0; i < chunkCount; i += 1){
      const chunk = await fetchText(`/api/state?payload=raw-state&chunkIndex=${encodeURIComponent(String(i))}&version=${encodeURIComponent(String(version))}&cacheBust=${Date.now()}`, {
        headers:{ "Accept":"application/json", "X-CWS-State-Response":"raw-state", "Cache-Control":"no-cache" }
      });
      chunks[i] = chunk.text;
    }

    const full = chunks.join("");
    try{ JSON.parse(full); }
    catch(error){ throw new Error(`D1 chunks vormen samen geen geldige JSON (${error.message}).`); }

    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    headers.set("X-CWS-OK", "true");
    headers.set("X-CWS-State-Exists", "1");
    headers.set("X-CWS-Version", String(version));
    headers.set("X-CWS-Bytes", String(full.length));
    headers.set("X-CWS-Chunked", "0");
    headers.set("X-CWS-Chunked-Manifest", "0");
    headers.set("X-CWS-Chunk-Count", String(chunkCount));
    headers.set("X-CWS-V127", MARKER);
    for(const key of ["X-CWS-User-Email", "X-CWS-User-Role", "X-CWS-User-Display-Name", "X-CWS-Updated-At", "X-CWS-Updated-By"]){
      const value = manifestResponse.headers.get(key) || existingResponse?.headers?.get?.(key);
      if(value) headers.set(key, value);
    }
    return new Response(full, { status:200, statusText:"OK", headers });
  }

  window.fetch = async function(input, init){
    if(!isStateBootRequest(input)) return nativeFetch(input, init);
    const bootInput = withExplicitNonChunk(input);
    const response = await nativeFetch(bootInput, init);
    try{
      const clone = response.clone();
      const text = await clone.text();
      const shouldRecover = response.headers.get("X-CWS-Chunked-Manifest") === "1" || isManifestText(text) || isClearlyTruncatedChunk(text);
      if(!shouldRecover) return response;
      const recovered = await fetchFullStateFromChunks(text, response);
      try{
        window.__cwsV127RecoveredD1ChunkBoot = {
          at:new Date().toISOString(),
          marker:MARKER,
          originalLength:text.length,
          originalChunkedManifest:response.headers.get("X-CWS-Chunked-Manifest") || "",
          forcedNonChunk:true
        };
      }catch(_){ }
      return recovered;
    }catch(error){
      console.warn("CWS V127 D1 chunk boot interceptor failed", error);
      return response;
    }
  };

  window.__cwsV127StateChunkBootInterceptorInstalled = true;
  window.__cwsV127StateChunkBootInterceptorMarker = MARKER;
})();
