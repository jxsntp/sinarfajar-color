import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env");
const url = process.env.SUPABASE_URL;
if (process.env.APP_ENV !== "development" || url !== "http://127.0.0.1:25421") throw new Error("Local Compose configuration required");
const client = createClient(url, process.env.LOCAL_STORAGE_SERVICE_KEY, {auth:{persistSession:false}});
let ready = false;
for (let attempt=0; attempt<40; attempt++) {
  try { ready = (await fetch(url+"/storage/v1/status")).ok; } catch {}
  if (ready) break;
  await new Promise(resolve=>setTimeout(resolve,500));
}
if (!ready) throw new Error("Local Storage health check failed");
const {data,error}=await client.storage.listBuckets();
if(error) throw new Error("Local bucket listing failed: "+error.message);
if(!data.some(b=>b.name==="product-photos")){
  const result=await client.storage.createBucket("product-photos",{public:true,fileSizeLimit:4194304,allowedMimeTypes:["image/png","image/jpeg","image/webp"]});
  if(result.error) throw new Error("Local bucket creation failed: "+result.error.message);
}
console.log("Local product-photos bucket ready.");
