import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Exercise the real native HTMLRewriter in workerd, not a DOM mock in Node.
export async function createSourceRuntime() {
  const bundle = await build({stdin:{contents:`
    import { fetchLiveReadings } from './worker/source';
    export default { async fetch(request) {
      try {
        const response = new Response(request.body, {status:Number(request.headers.get('x-status') ?? 200),
          headers:{'content-type':request.headers.get('content-type') ?? ''}});
        return Response.json(await fetchLiveReadings(async () => response));
      } catch(error) { return Response.json({error:error.message}, {status:502}); }
    }};`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
  const runtime = new Miniflare(convertV4MiniflareOptions({name:'native-parser',compatibilityDate:'2026-09-10',
    modules:true,script:bundle.outputFiles[0].text}));
  return {
    dispose: () => runtime.dispose(),
    async parse(response: Response) {
      const result = await runtime.dispatchFetch('http://parser/', {method:'POST',body:await response.arrayBuffer(),
        headers:{'x-status':String(response.status),'content-type':response.headers.get('content-type') ?? ''}});
      const data = await result.json() as {error?:string};
      if (!result.ok) throw new Error(data.error);
      return data;
    },
  };
}
