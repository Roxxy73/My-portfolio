# Automatic WhatsApp contact notifications

The contact form uses a Cloudflare Worker to send a WhatsApp template notification. The portfolio can stay on GitHub Pages; the WhatsApp access token is kept in Cloudflare and is never sent to the browser.

## 1. Set up WhatsApp Cloud API

In Meta for Developers, create an app with the WhatsApp product and connect a WhatsApp Business phone number. In WhatsApp Manager, create and wait for approval of a utility template named `new_portfolio_message` with this body:

> New portfolio message from {{1}} ({{2}}). Subject: {{3}}. Message: {{4}}

Use four text parameters, in this order: sender name, sender email, subject, and message. Configure the recipient number to receive WhatsApp messages from the business and satisfy Meta's opt-in requirements. Business-initiated notifications need an approved template; a normal free-form message cannot be sent outside WhatsApp's customer-service window.

From the Meta app's WhatsApp API setup, note the permanent access token, phone number ID, and supported Graph API version. Do not put the token in this repository or in `index.html`.

## 2. Deploy the Worker

Install Wrangler and authenticate with the Cloudflare account that will host the Worker. From the project directory, set the values in `wrangler.jsonc`:

- `ALLOWED_ORIGIN`: the exact HTTPS origin serving the site, with no trailing slash (for example, `https://yourname.github.io`).
- `GRAPH_API_VERSION`: a currently supported version from Meta, in the form `vNN.0`.
- `WHATSAPP_PHONE_NUMBER_ID`: the ID for the business sender phone number.
- `WHATSAPP_RECIPIENT`: the destination number in international format using digits only, including country code.
- `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANGUAGE`: the approved template name and language code.

Set the access token as a Cloudflare Worker secret, not as a plain variable:

```sh
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler deploy
```

Wrangler prints the deployed Worker URL. In Cloudflare, configure a rate-limit rule for the Worker endpoint to reduce automated submissions.

## 3. Connect the contact form

Set the form's `data-endpoint` in `index.html` to the deployed Worker URL, for example:

```html
<form class="contact-form" id="contact-form" data-endpoint="https://portfolio-whatsapp-notifications.YOUR-SUBDOMAIN.workers.dev">
```

The Worker accepts requests only from the exact `ALLOWED_ORIGIN`. Deploy the updated site after setting the endpoint. If Meta or Cloudflare is not configured, the form reports an error rather than claiming the message was sent.
