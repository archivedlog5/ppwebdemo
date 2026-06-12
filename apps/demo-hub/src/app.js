require("dotenv").config();
const express = require("express");
///
const https = require("https");
const fs = require("fs");
///
const path = require("path");
const { loadProductConfig } = require("./config/products");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ── Hostname-based routing ───────────────────────────────────────────
// pp.cwen5.com   → PayPal demos only
// bt.cwen5.com   → Braintree demos only
// demo.cwen5.com → home page (all demos listed)
// localhost/*    → unrestricted (dev)
app.use(function (req, res, next) {
  const host = req.hostname
  const p    = req.path
  function isAsset(p) {
    return p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/img/') || p.startsWith('/favicon')
  }

  // pp.cwen5.com → 只服务 PayPal + 静态资源
  if (host === 'pp.cwen5.com') {
    if (!p.startsWith('/paypal') && !isAsset(p)) return res.redirect(302, 'https://demo.cwen5.com/')
    return next()
  }

  // bt.cwen5.com → 只服务 Braintree + 静态资源
  if (host === 'bt.cwen5.com') {
    if (!p.startsWith('/braintree') && !isAsset(p)) return res.redirect(302, 'https://demo.cwen5.com/')
    return next()
  }

  // demo.cwen5.com → 首页；点击 demo 跳到对应子域名
  if (host === 'demo.cwen5.com') {
    if (p.startsWith('/paypal'))    return res.redirect(302, 'https://pp.cwen5.com' + req.originalUrl)
    if (p.startsWith('/braintree')) return res.redirect(302, 'https://bt.cwen5.com' + req.originalUrl)
    return next()
  }

  // localhost / 其他 → 不限制（本地开发）
  next()
})

// ── Routes ──────────────────────────────────────────────────────────
app.use("/", require("./routes/index"));

const v5 = "/paypal/jssdk-v5";
app.use(v5, require("./routes/paypal/jssdk-v5/spb-ecm"));
app.use(v5, require("./routes/paypal/jssdk-v5/spb-ecs"));
app.use(v5, require("./routes/paypal/jssdk-v5/buttons"));
app.use(v5, require("./routes/paypal/jssdk-v5/acdc"));
app.use(v5, require("./routes/paypal/jssdk-v5/applepay-ecm"));
app.use(v5, require("./routes/paypal/jssdk-v5/applepay-ecs"));
app.use(v5, require("./routes/paypal/jssdk-v5/googlepay-ecm"));
app.use(v5, require("./routes/paypal/jssdk-v5/googlepay-ecs"));
app.use(v5, require("./routes/paypal/jssdk-v5/vault-paypal-with-purchase"));
app.use(v5, require("./routes/paypal/jssdk-v5/vault-paypal-setup-only"));
app.use(v5, require("./routes/paypal/jssdk-v5/vault-acdc-with-purchase"));
app.use(v5, require("./routes/paypal/jssdk-v5/vault-acdc-setup-only"));
app.use(v5, require("./routes/paypal/jssdk-v5/vault-applepay-with-purchase"));
app.use(v5, require("./routes/paypal/jssdk-v5/vault-return"));
app.use(v5, require("./routes/paypal/jssdk-v5/plm-div"));
app.use(v5, require("./routes/paypal/jssdk-v5/plm-js"));
app.use(v5, require("./routes/paypal/jssdk-v5/fastlane-pui"));
app.use(v5, require("./routes/paypal/jssdk-v5/fastlane-fp"));
app.use(v5, require("./routes/paypal/jssdk-v5/shipping-module"));
app.use(v5, require("./routes/paypal/jssdk-v5/contact-module"));
app.use(v5, require("./routes/paypal/jssdk-v5/apm-jssdk"));
app.use(v5, require("./routes/paypal/jssdk-v5/apm-ordersv2"));

// ── PayPal JSSDK v6 ──────────────────────────────────────────────────────────
const v6 = '/paypal/jssdk-v6'
app.use(v6, require('./routes/paypal/jssdk-v6/paypal-ecm'));
app.use(v6, require('./routes/paypal/jssdk-v6/paypal-ecs'));
app.use(v6, require('./routes/paypal/jssdk-v6/paylater-ecm'));
app.use(v6, require('./routes/paypal/jssdk-v6/paylater-ecs'));
app.use(v6, require('./routes/paypal/jssdk-v6/venmo-ecm'));
app.use(v6, require('./routes/paypal/jssdk-v6/venmo-ecs'));
app.use(v6, require('./routes/paypal/jssdk-v6/bcdc-ecm'));
app.use(v6, require('./routes/paypal/jssdk-v6/bcdc-ecs'));
app.use(v6, require('./routes/paypal/jssdk-v6/acdc'));
app.use(v6, require('./routes/paypal/jssdk-v6/applepay-ecm'))
app.use(v6, require('./routes/paypal/jssdk-v6/applepay-ecs'))
app.use(v6, require('./routes/paypal/jssdk-v6/googlepay-ecm'))
app.use(v6, require('./routes/paypal/jssdk-v6/googlepay-ecs'))
app.use(v6, require('./routes/paypal/jssdk-v6/plm-html'))
app.use(v6, require('./routes/paypal/jssdk-v6/plm-js'))
app.use(v6, require('./routes/paypal/jssdk-v6/buttons'))
app.use(v6, require('./routes/paypal/jssdk-v6/vault-paypal-with-purchase'))
app.use(v6, require('./routes/paypal/jssdk-v6/vault-paypal-setup-only'))
app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-setup-only'))
app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-with-purchase'))

// ── Braintree server-sdk ─────────────────────────────────────────────
const btSdk = '/braintree/server-sdk'
app.use(btSdk, require('./routes/braintree/server-sdk/dropin-ui'))

app.use((req, res) => res.status(404).send("Route not found"));

// ── 导出供 gateway 复用 ──────────────────────────────────────────────
module.exports = { app, loadProductConfig };

// ── 独立运行（开发模式：node/nodemon src/app.js）────────────────────
if (require.main === module) {
  loadProductConfig()
    .then(() => {
      const port = process.env.PORT || 3000;
      const host = process.env.HOST || "127.0.0.1";
      //app.listen(port,host, () => console.log(`demo-hub running at http://${host}:${port}`))
      https
        .createServer(
          {
            key: fs.readFileSync("certs/server.key"),
            cert: fs.readFileSync("certs/server.cert"),
          },
          app
        )
        .listen(port, host, () => {
          console.log(`demo-hub running at http://${host}:${port}`);
        });
    })
    .catch((err) => {
      console.error("Startup failed:", err);
      process.exit(1);
    });
}
