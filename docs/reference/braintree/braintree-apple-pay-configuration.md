---
title: Configuration
slug: /docs/guides/apple-pay/configuration/javascript/v3/
createTime: "2025-04-02T01:24:20.533Z"
updateTime: "2025-04-09T05:43:40.697Z"
---

# Configuration

To finish your configuration, you will only need to complete the iCloud account and domain registration steps below.

## iCloud account setup

When testing, you will need to be logged into an iCloud account that corresponds to your environment. Testing in sandbox requires you to be logged into an[iTunes Connect sandbox tester account](https://developer.apple.com/support/apple-pay-sandbox/), which you can create with an[Apple Developer account](https://developer.apple.com/programs/how-it-works/). Similarly, you will need to be logged into a production iCloud account when testing in production.

## Specify an icon

When using Apple Pay on the web, users will be presented with your site'sapple-touch-icon, if present. It is recommended that you add anapple-touch-iconto your website if you do not already have one. Consult[Apple's guidelines on configuring web applications](https://developer.apple.com/library/content/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)for more information.

## Domain registration

In order to test and accept Apple Pay on the web, you'll need to register any domains you plan to use with Apple. You can do this through the Braintree Control Panel using the instructions below, or via the API using[Apple Pay: Register Domain](/braintree/docs/reference/request/apple-pay/register-domain). You should not register your domain through the Apple Developer Portal. Additionally, you will not need to generate and upload a Payment Processing Certificate for Apple Pay on the web, as these transactions will be processed using our shared certificate.

### Sandbox environment

Register your sandbox domain name in the Braintree Control Panel:

- Log into your[sandbox Control Panel](https://sandbox.braintreegateway.com/)
- Click on the gear icon in the top right corner
- Click**Account Settings**from the drop-down menu
- Scroll to the**Payment Methods**section
- Next to**Apple Pay**, click the**Options**link
- Scroll to the**Web Domains (Safari)**section
- Click the**+Add**link to the right
- Enter your fully qualified sandbox domain name
- The value you enter must match your fully qualified domain name exactly – including thewww.if applicable

- Click the**Agree & Add Domain**button

### Production environment

Register your production domain name in the Braintree Control Panel:

- Log into your[production Control Panel](https://www.braintreegateway.com/login)
- Click on the gear icon in the top right corner
- Click**Processing**from the drop-down menu
- Scroll to the**Payment Methods**section
- Next to**Apple Pay**, click the**Options**link
- Scroll to the**Web Domains (Safari)**section
- Click the**+Add**link to the right
- Enter your fully qualified production domain name
- The value you enter must match your fully qualified domain name exactly – including thewww.if applicable

- Download the[domain association file](https://assets.braintreegateway.com/web/static/apple-pay/apple-developer-merchantid-domain-association)and host it at/.well-known/apple-developer-merchantid-domain-associationon your site
- Click**Agree & Add Domain**

When Apple verifies a domain, it makes a request to retrieve the domain verification file. Ensure that:

- The file is not served with a 3xx status code. Apple does not support HTTP URL redirects for the domain association file.
- This file is served via HTTPS 1.1
- The HTTP response for this request returns this file as a binary object and not as HTML or plain text
  **IMPORTANT**
  This file should be served with Content-Type: application/octet-stream to indicate that this is a binary file download.

- Access to this file is not behind a firewall (see[Apple documentation](https://developer.apple.com/documentation/apple_pay_on_the_web/setting_up_your_server)on allowing Apple IP addresses)
