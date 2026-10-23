import {
  Application,
  Router,
  normalizePathnameMiddleware,
} from "@cfworker/web";
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

/*
 * Secrets (configure with wrangler secret put ...):
 *   PASS          - 图床列表页登录密码
 *   UPLOAD_TOKEN  - 上传 / 删除接口的 Bearer Token
 *
 * In the service-worker runtime these secrets are exposed as globals.
 */
const env = {
  PASS: typeof PASS === "undefined" ? "" : PASS,
  UPLOAD_TOKEN: typeof UPLOAD_TOKEN === "undefined" ? "" : UPLOAD_TOKEN,
};

const router = new Router();

async function randomString(len) {
  //随机链接生成
  len = len || 6;
  let $chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678"; /****默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1****/
  let maxPos = $chars.length;
  let result = "";
  for (let i = 0; i < len; i++) {
    result += $chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return result;
}

function isAuthorized(req) {
  if (!env.UPLOAD_TOKEN) return true; // 未配置 token 时保持旧行为
  const auth = req.headers.get("authorization") || "";
  const token = req.headers.get("x-upload-token") || "";
  const pass = req.headers.get("x-upload-pass") || "";
  return (
    auth === `Bearer ${env.UPLOAD_TOKEN}` ||
    token === env.UPLOAD_TOKEN ||
    (env.PASS !== "" && pass === env.PASS)
  );
}

//静态资源路由
addEventListener("fetch", async (event) => {
  let pathname = new URL(event.request.url);
  let asset = new RegExp("/assets/.*", "i");
  let index = new RegExp("/index.*", "i");
  let list = new RegExp("/list.*", "i");
  if (
    asset.test(pathname.pathname) ||
    index.test(pathname.pathname) ||
    list.test(pathname.pathname)
  ) {
    event.respondWith(handleEvent(event));
  }
});

async function handleEvent(event) {
  return getAssetFromKV(event);
}

//首页跳转
router.get("/", ({ res }) => {
  res.redirect("/index.html");
});

let header = new Headers();
header.set("access-control-allow-origin", "*");

//上传api
router.post("/api", async ({ req, res }) => {
  if (!isAuthorized(req)) {
    res.status = 401;
    res.headers = header;
    res.body = { info: "未授权" };
    return;
  }

  let form = req.body.formData();
  let img = (await form).get("U2FsdGVkX18Qfauxf4okHrzqmGXdmWHh");
  if (!img) {
    res.status = 400;
    res.headers = header;
    res.body = { info: "缺少图片字段" };
    return;
  }

  const img_check = new RegExp(
    "(.*?).(png|jpe?g|gif|bmp|psd|tiff|tga|webp)",
    "i"
  );

  //文件格式验证
  if (img_check.test(img.name)) {
    let url = await randomString();
    let check = await LINK.get(url);
    if (check !== null) {
      url = await randomString();
    }
    let stream = img.stream();
    await LINK.put(url, stream, {
      metadata: {
        size: img.size,
        name: url,
        type: img.type,
        date: new Date().getTime(),
      },
    });
    res.headers = header;
    res.body = {
      link: req.url + "/img/" + url,
    };
  } else {
    res.status = 400;
    res.headers = header;
    res.body = {
      info: "非图片文件404",
    };
  }
});

//获取图片
router.get("/api/img/:p", async ({ req, res }) => {
  const record = await LINK.getWithMetadata(req.params.p, {
    cacheTtl: 864000,
    type: "stream",
  });

  if (!record || !record.value) {
    res.status = 404;
    res.headers = header;
    res.body = { info: "404" };
    return;
  }

  if (req.headers.has("If-None-Match")) {
    return (res.status = 304);
  }

  const metadata = record.metadata || {};
  res.headers = header;
  res.headers.set("Cache-Control", "public, max-age=864000");
  res.type = metadata.type || "application/octet-stream";
  res.etag = metadata.size;
  res.body = record.value;
});

//删除图片（需要 UPLOAD_TOKEN）
router.delete("/api/img/:p", async ({ req, res }) => {
  res.headers = header;

  if (!env.UPLOAD_TOKEN) {
    res.status = 503;
    res.body = { info: "删除未启用：未配置 UPLOAD_TOKEN" };
    return;
  }
  if (!isAuthorized(req)) {
    res.status = 401;
    res.body = { info: "未授权" };
    return;
  }

  const name = req.params.p;
  if (!name) {
    res.status = 400;
    res.body = { info: "缺少图片名" };
    return;
  }

  await LINK.delete(name);
  res.body = { ok: true, name };
});

//简易登陆验证
router.get("/query", async ({ req, res }) => {
  res.headers = header;

  if (!env.PASS) {
    res.status = 500;
    res.body = { info: "PASS 未配置" };
    return;
  }

  const paramas = req.url.searchParams;
  if (paramas.get("pass") === env.PASS) {
    const key = await LINK.list();
    res.body = key;
  } else {
    res.status = 401;
    res.body = { info: "密码错误" };
  }
});

// Compose the application
new Application()
  .use(normalizePathnameMiddleware)
  .use(router.middleware)
  .listen();
