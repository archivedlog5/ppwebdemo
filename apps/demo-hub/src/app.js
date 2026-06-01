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
app.use(v6, require('./routes/paypal/jssdk-v6/buttons'))

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
