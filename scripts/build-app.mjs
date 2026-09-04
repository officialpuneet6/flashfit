import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const apps = {
  customer: { domain: "flashfit.online" },
  shop: { domain: "shop.flashfit.online" },
  delivery: { domain: "delivery.flashfit.online" },
  admin: { domain: "admin.flashfit.online" }
};
const requested = process.argv[2];
const names = requested === "all" ? Object.keys(apps) : [requested];
if (!names.every((name) => apps[name])) throw new Error("Use one of: customer, shop, delivery, admin, all.");

function parseEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([^#=\s]+)=(.*)$/);
    return match ? [[match[1], match[2].trim()]] : [];
  }));
}
function publicConfig(app, env) {
  const required = ["FLASHFIT_ENV", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PROJECT_REF", "FLASHFIT_PRODUCTION_PROJECT_REF", "FLASHFIT_STAGING_PROJECT_REF"];
  for (const key of required) if (!env[key] || env[key].includes("REPLACE_WITH")) throw new Error(`Missing public build variable: ${key}`);
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== "https:" || url.hostname !== `${env.SUPABASE_PROJECT_REF}.supabase.co`) throw new Error("SUPABASE_URL must match SUPABASE_PROJECT_REF over HTTPS.");
  if (env.FLASHFIT_ENV === "staging" && env.SUPABASE_PROJECT_REF !== env.FLASHFIT_STAGING_PROJECT_REF) throw new Error("Refusing staging build with a non-staging project.");
  if (env.FLASHFIT_ENV === "production" && env.SUPABASE_PROJECT_REF !== env.FLASHFIT_PRODUCTION_PROJECT_REF) throw new Error("Refusing production build with a non-production project.");
  if (!["development", "staging", "production"].includes(env.FLASHFIT_ENV)) throw new Error("FLASHFIT_ENV must be development, staging, or production.");
  return { environment: env.FLASHFIT_ENV, app, domain: apps[app].domain, supabaseUrl: env.SUPABASE_URL, supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY, analyticsId: env.PUBLIC_ANALYTICS_ID || "", featureConfig: {} };
}
async function build(app) {
  const appRoot = path.join(root, app);
  const env = { ...parseEnv(path.join(appRoot, ".env")), ...process.env };
  const config = publicConfig(app, env);
  const out = path.join(appRoot, "dist");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  // The four app roots are the active source of truth. Keep generated output,
  // local environment files, and inactive duplicate backups out of the bundle.
  for (const entry of await readdir(appRoot, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name.startsWith(".env") || entry.name.endsWith(" copy.js")) continue;
    await cp(path.join(appRoot, entry.name), path.join(out, entry.name), {
      recursive: true,
      filter: (source) => !source.endsWith(" copy.js")
    });
  }
  const publicRuntime = `window.__FLASHFIT_PUBLIC_CONFIG__=${JSON.stringify(config)};Object.freeze(window.__FLASHFIT_PUBLIC_CONFIG__);`;
  await writeFile(path.join(out, "flashfit-public-config.js"), publicRuntime, "utf8");
  await cp(path.join(root, "shared", "ui-safe", "theme.css"), path.join(out, "flashfit-theme.css"));
  await cp(path.join(root, "shared", "config", "dynamic-platform-ui.js"), path.join(out, "flashfit-dynamic-theme.js"));
  await cp(path.join(root, "shared", "runtime", "flashfit-app-identity.js"), path.join(out, "flashfit-app-identity.js"));
  await cp(path.join(root, "shared", "runtime", "supabase-client.js"), path.join(out, "supabase-client.js"));
  await cp(path.join(root, "shared", "runtime", "notification-service.js"), path.join(out, "notification-service.js"));
  await cp(path.join(root, "shared", "runtime", "flashfit-business-extension.js"), path.join(out, "flashfit-business-extension.js"));
  await cp(path.join(root, "shared", "runtime", "admin-visibility-extension.js"), path.join(out, "admin-visibility-extension.js"));
  await transformTree(out, config);
  console.log(`Built ${app} from its active app root for ${config.environment}.`);
}
async function transformTree(dir, config) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await transformTree(file, config);
    else if (/\.(?:html|js)$/i.test(entry.name)) {
      let text = await readFile(file, "utf8");
      const legacyUrl = "https://ydbmdiywsalkkxrqzjtx.supabase.co";
      text = text.replaceAll(`"${legacyUrl}/functions/v1/send-web-push"`, "window.__FLASHFIT_PUBLIC_CONFIG__.supabaseUrl + \"/functions/v1/send-web-push\"");
      text = text.replaceAll(`"${legacyUrl}"`, "window.__FLASHFIT_PUBLIC_CONFIG__.supabaseUrl");
      text = text.replaceAll(`'${legacyUrl}'`, "window.__FLASHFIT_PUBLIC_CONFIG__.supabaseUrl");
      text = text.replaceAll(`\`${legacyUrl}`, "`${window.__FLASHFIT_PUBLIC_CONFIG__.supabaseUrl}");
      text = text.replaceAll('"sb_publishable_udYL-2aM5WhzB5tu_gb4sA_RHnQC8Au"', "window.__FLASHFIT_PUBLIC_CONFIG__.supabasePublishableKey");
      if (/\.html$/i.test(entry.name)) {
        text = text.replace(/<head([^>]*)>/i, `<head$1><script src="flashfit-public-config.js"></script><script src="flashfit-app-identity.js"></script><link rel="stylesheet" href="flashfit-theme.css"><script src="flashfit-dynamic-theme.js"></script>`);
        text = text.replace(/<body([^>]*)>/i, (tag, attributes) => {
          if (/\bff-app\b/.test(attributes)) return tag;
          if (/\bclass=(['"])(.*?)\1/i.test(attributes)) {
            return `<body${attributes.replace(/\bclass=(['"])(.*?)\1/i, (match, quote, classes) => `class=${quote}${classes} ff-app ff-${config.app}${quote}`)}>`;
          }
          return `<body${attributes} class="ff-app ff-${config.app}">`;
        });
      }
      await writeFile(file, text, "utf8");
    }
  }
}
for (const app of names) await build(app);
