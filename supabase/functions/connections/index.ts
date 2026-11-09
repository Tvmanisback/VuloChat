import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SPOTIFY_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
const STEAM_KEY = Deno.env.get("STEAM_WEB_API_KEY") || "";
const CALLBACK = SUPABASE_URL + "/functions/v1/connections";
const APP = "https://vulochat.com/";
const admin = createClient(SUPABASE_URL, SERVICE);
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" };
const reply = (data: unknown, status=200, headers:Record<string,string>={}) => new Response(JSON.stringify(data), {status,headers:{...cors,"Content-Type":"application/json",...headers}});
async function currentUser(req:Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i,"");
  if (!token) return null;
  const {data,error} = await admin.auth.getUser(token);
  return error ? null : data.user;
}
// The sign-in state is a signed token that carries the user, the provider and an expiry time.
// Checking it needs no database lookup, so it cannot fail just because a stored row is missing.
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/")), (c) => c.charCodeAt(0));
let stateKeyPromise: Promise<CryptoKey> | null = null;
function stateKey(): Promise<CryptoKey> {
  stateKeyPromise ??= crypto.subtle.importKey("raw", enc.encode("vulo-oauth-state:" + SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return stateKeyPromise;
}
async function makeState(userId:string,provider:string){
  const payload = b64url(enc.encode(JSON.stringify({u:userId,p:provider,e:Date.now()+10*60*1000,n:b64url(crypto.getRandomValues(new Uint8Array(12)))})));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await stateKey(), enc.encode(payload)));
  return payload + "." + b64url(sig);
}
async function takeState(state:string,provider:string): Promise<string | null> {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await stateKey(), fromB64url(sig), enc.encode(payload));
    if (!valid) { console.error("connections: sign-in state signature does not match"); return null; }
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as {u:string;p:string;e:number};
    if (data.p !== provider) { console.error("connections: sign-in state is for another provider"); return null; }
    if (!(data.e > Date.now())) { console.error("connections: sign-in state has expired"); return null; }
    return data.u;
  } catch (e) {
    console.error("connections: could not read sign-in state", e);
    return null;
  }
}
async function spotifyRefresh(userId:string){
  const {data:account}=await admin.schema("connections_private").from("accounts").select("*").eq("user_id",userId).eq("provider","spotify").maybeSingle();
  if(!account?.refresh_token) return;
  let access=account.access_token, expiry=account.expires_at ? new Date(account.expires_at).getTime() : 0;
  if(expiry < Date.now()+60000){
    const auth=btoa(SPOTIFY_ID+":"+SPOTIFY_SECRET);
    const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Authorization":"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:account.refresh_token})});
    if(!r.ok) throw new Error("spotify_refresh_failed");
    const t=await r.json(); access=t.access_token; expiry=Date.now()+Number(t.expires_in)*1000;
    await admin.schema("connections_private").from("accounts").update({access_token:access,refresh_token:t.refresh_token||account.refresh_token,expires_at:new Date(expiry).toISOString()}).eq("user_id",userId).eq("provider","spotify");
  }
  const r=await fetch("https://api.spotify.com/v1/me/player/currently-playing",{headers:{Authorization:"Bearer "+access}});
  if(r.status===204){
    await admin.from("profile_activity").upsert({user_id:userId,provider:"spotify",title:"Not listening",subtitle:null,image_url:null,external_url:null,provider_username:account.display_name||account.provider_user_id,provider_profile_url:"https://open.spotify.com/user/"+encodeURIComponent(account.provider_user_id),is_public:true,updated_at:new Date().toISOString()});
    return;
  }
  if(!r.ok) return;
  const d=await r.json(); const item=d.item;
  if(!item){
    await admin.from("profile_activity").upsert({user_id:userId,provider:"spotify",title:"Not listening",subtitle:null,image_url:null,external_url:null,provider_username:account.display_name||account.provider_user_id,provider_profile_url:"https://open.spotify.com/user/"+encodeURIComponent(account.provider_user_id),is_public:true,updated_at:new Date().toISOString()});
    return;
  }
  const artists=(item.artists||[]).map((a:any)=>a.name).join(", ");
  await admin.from("profile_activity").upsert({user_id:userId,provider:"spotify",title:item.name,subtitle:artists,image_url:item.album?.images?.[0]?.url||null,external_url:item.external_urls?.spotify||null,provider_username:account.display_name||account.provider_user_id,provider_profile_url:"https://open.spotify.com/user/"+encodeURIComponent(account.provider_user_id),is_public:true,updated_at:new Date().toISOString()});
}
async function refreshSteam(userId:string){
  if(!STEAM_KEY) throw new Error("steam_key_not_configured");
  const {data:account}=await admin.schema("connections_private").from("accounts").select("provider_user_id").eq("user_id",userId).eq("provider","steam").maybeSingle();
  if(!account?.provider_user_id) return;
  const r=await fetch("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key="+encodeURIComponent(STEAM_KEY)+"&steamids="+encodeURIComponent(account.provider_user_id));
  if(!r.ok) throw new Error("steam_api_failed");
  const d=await r.json(); const p=d.response?.players?.[0];
  if(!p) throw new Error("steam_profile_unavailable");
  await admin.schema("connections_private").from("accounts").update({display_name:p.personaname||account.provider_user_id}).eq("user_id",userId).eq("provider","steam");
  if(p.gameextrainfo){
    const gameId=p.gameid||"";
    await admin.from("profile_activity").upsert({user_id:userId,provider:"steam",title:p.gameextrainfo,subtitle:"Playing on Steam",image_url:gameId?"https://cdn.cloudflare.steamstatic.com/steam/apps/"+gameId+"/header.jpg":null,external_url:gameId?"https://store.steampowered.com/app/"+gameId:"https://steamcommunity.com/profiles/"+account.provider_user_id,is_public:true,updated_at:new Date().toISOString()});
  } else {
    await admin.from("profile_activity").delete().eq("user_id",userId).eq("provider","steam");
  }
}
async function callback(req:Request,provider:string){
  const u=new URL(req.url);
  const state=u.searchParams.get("state");
  if(!state) return reply({error:"missing_state"},400);
  const userId=await takeState(state,provider);
  if(!userId) return reply({error:"invalid_or_expired_state"},400);
  if(provider==="spotify"){
    const error=u.searchParams.get("error"), code=u.searchParams.get("code");
    if(error||!code) return Response.redirect(APP+"?connection_error=spotify",302);
    const tokenRes=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Authorization":"Basic "+btoa(SPOTIFY_ID+":"+SPOTIFY_SECRET),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:CALLBACK})});
    if(!tokenRes.ok) return reply({error:"spotify_token_exchange_failed"},502);
    const t=await tokenRes.json();
    const meRes=await fetch("https://api.spotify.com/v1/me",{headers:{Authorization:"Bearer "+t.access_token}});
    if(!meRes.ok) return reply({error:"spotify_profile_failed"},502);
    const me=await meRes.json();
    await admin.schema("connections_private").from("accounts").upsert({user_id:userId,provider:"spotify",provider_user_id:me.id,access_token:t.access_token,refresh_token:t.refresh_token,expires_at:new Date(Date.now()+t.expires_in*1000).toISOString(),display_name:me.display_name||me.id});
    await admin.from("profile_activity").upsert({user_id:userId,provider:"spotify",title:"Not listening",subtitle:null,image_url:null,external_url:null,provider_username:me.display_name||me.id,provider_profile_url:me.external_urls?.spotify||"https://open.spotify.com/user/"+encodeURIComponent(me.id),is_public:true,updated_at:new Date().toISOString()});
    await spotifyRefresh(userId);
    return Response.redirect(APP+"?connection=spotify",302);
  }
  const claimed=u.searchParams.get("openid.claimed_id")||"";
  const identity=claimed.match(/\/openid\/id\/(\d+)$/)?.[1];
  if(!identity) return reply({error:"invalid_steam_identity"},400);
  const params=new URLSearchParams(u.searchParams);params.set("openid.mode","check_authentication");
  const verify=await fetch("https://steamcommunity.com/openid/login",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
  const text=await verify.text();
  if(!text.includes("is_valid:true")) return reply({error:"steam_verification_failed"},400);
  await admin.schema("connections_private").from("accounts").upsert({user_id:userId,provider:"steam",provider_user_id:identity,display_name:identity});
  if(STEAM_KEY) { try { await refreshSteam(userId); } catch(e) { console.error("Initial Steam activity refresh failed",e); } }
  return Response.redirect(APP+"?connection=steam",302);
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const u=new URL(req.url);
  if(req.method==="GET" && u.searchParams.has("openid.mode")) return callback(req,"steam");
  if(req.method==="GET" && u.searchParams.has("code")) return callback(req,"spotify");
  if(req.method!=="POST") return reply({error:"method_not_allowed"},405);
  const user=await currentUser(req); if(!user) return reply({error:"unauthorized"},401);
  let body:any;try{body=await req.json()}catch{return reply({error:"bad_request"},400)}
  if(body.action==="connect_spotify"){
    if(!SPOTIFY_ID||!SPOTIFY_SECRET)return reply({error:"spotify_not_configured"},503);
    const state=await makeState(user.id,"spotify");
    const params=new URLSearchParams({client_id:SPOTIFY_ID,response_type:"code",redirect_uri:CALLBACK,scope:"user-read-currently-playing user-read-playback-state",state});
    return reply({url:"https://accounts.spotify.com/authorize?"+params.toString()});
  }
  if(body.action==="connect_steam"){
    const state=await makeState(user.id,"steam");
    const returnTo=CALLBACK+"?state="+encodeURIComponent(state);
    const realm=new URL(CALLBACK).origin;
    const params=new URLSearchParams({"openid.ns":"http://specs.openid.net/auth/2.0","openid.mode":"checkid_setup","openid.return_to":returnTo,"openid.realm":realm,"openid.identity":"http://specs.openid.net/auth/2.0/identifier_select","openid.claimed_id":"http://specs.openid.net/auth/2.0/identifier_select"});
    return reply({url:"https://steamcommunity.com/openid/login?"+params.toString()});
  }
  if(body.action==="status"){
    const {data}=await admin.schema("connections_private").from("accounts").select("provider,display_name").eq("user_id",user.id);
    return reply({connections:data||[]});
  }
  if(body.action==="refresh_spotify"){
    try{await spotifyRefresh(user.id);return reply({ok:true})}catch{return reply({error:"spotify_refresh_failed"},502)}
  }
  if(body.action==="refresh_steam"){
    try{await refreshSteam(user.id);return reply({ok:true})}
    catch(e){return reply({error:e instanceof Error?e.message:"steam_refresh_failed"},e instanceof Error&&e.message==="steam_key_not_configured"?503:502)}
  }
  if(body.action==="disconnect" && ["spotify","steam"].includes(body.provider)){
    await admin.schema("connections_private").from("accounts").delete().eq("user_id",user.id).eq("provider",body.provider);
    await admin.from("profile_activity").delete().eq("user_id",user.id).eq("provider",body.provider);
    return reply({ok:true});
  }
  if(body.action==="set_visibility" && ["spotify","steam"].includes(body.provider)){
    const {error}=await admin.from("profile_activity").update({is_public:!!body.is_public}).eq("user_id",user.id).eq("provider",body.provider);
    if(error)return reply({error:"visibility_update_failed"},500);
    return reply({ok:true});
  }
  return reply({error:"unknown_action"},400);
});
