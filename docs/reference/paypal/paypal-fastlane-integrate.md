# Integrate Fastlane by PayPal

> Source: https://developer.paypal.com/studio/checkout/fastlane/integrate
> Fetched: 2026-06-08

Before beginning your integration, you need to [set up your development environment](https://developer.paypal.com/studio/checkout/fastlane/getstarted#setup-dev-environment). You can [refer to this flow diagram](https://www.paypalobjects.com/devdoc/SwimlaneDiagram.png), and [watch a video](https://youtu.be/5nf78OuCqjE) demonstrating how to integrate PayPal Fastlane.

Start your integration by grabbing the [sample code from PayPal's GitHub repo](https://github.com/paypaldevso/Fastlane), or [open in GitHub Codespaces](https://github.com/paypaldevso/Fastlane). [Read the Codespaces guide](https://developer.paypal.com/api/rest/sandbox/codespaces/) for more information.

---

## 1. Integrate front end [CLIENT]

Set up your front end to integrate Fastlane.

### Front-end process

1. Your app shows Fastlane Payment component.
2. Your app calls server endpoints to create the order and capture payment.

### Step 1: Generate client token

To instantiate the JavaScript SDK and the Fastlane components, use a server-side call to generate a client token and then pass the token into the SDK.

1. Replace `CLIENT_ID` with your client ID.
2. Replace `CLIENT_SECRET` with your client secret. [Get your client ID and secret](https://developer.paypal.com/api/rest/?_ga=2.150971572.368875705.1720450729-1774217071.1701640500&_gac=1.82635492.1720023622.Cj0KCQjw7ZO0BhDYARIsAFttkCgWb0D7wzz0Xq70uhuDYTv5e8bPDEwnDYKG8Gavy5V6iIaMfCL4y7IaAoW1EALw_wcB#link-getclientidandclientsecret).
3. Replace `example.com`, `example2.com` with your own domains. Provide the root domain name only. No subdomains such as `sub.example.com`. No wildcard characters such as `*.example.com`. No protocols such as `http` or `https`.

**Server-side code (Node.js) to generate a client token:**

```javascript
async function getClientToken() {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error("Missing API credentials");
    }

    const url = `${PAYPAL_API_BASE_URL}/v1/oauth2/token`;

    const headers = new Headers();

    const auth = Buffer.from(
      `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    headers.append("Authorization", `Basic ${auth}`);
    headers.append("Content-Type", "application/x-www-form-urlencoded");

    const searchParams = new URLSearchParams();
    searchParams.append("grant_type", "client_credentials");
    searchParams.append("response_type", "client_token");
    searchParams.append("intent", "sdk_init");
    searchParams.append("domains[]", DOMAINS);

    const options = {
      method: "POST",
      headers,
      body: searchParams,
    };

    const response = await fetch(url, options);
    const data = await response.json();

    return data.access_token;
  } catch (error) {
    console.error(error);
    return "";
  }
}
```

### Step 2: Initialize PayPal JS SDK and Fastlane

First, initialize the SDK through a script tag on your HTML page.

The fields required to initialize the PayPal JS SDK are:

- `client-id`: client-id of your application.
- `data-sdk-client-token`: generated from the token initialization.

```html
<script
  src="{sdk_url}"
  data-sdk-client-token="{client_access_token}"
  data-sdk-integration-source="developer-studio"
  defer
></script>
```

Fastlane is initialized with a call to `paypal.Fastlane` in the init-fastlane.js file. You must pass a configuration object during initialization.

#### Specify locale

You can specify the language in which the Fastlane components are rendered. After you initialize the Fastlane component, you can set the locale.

Fastlane supports the following languages: `en_us` (English, default), `es_us` (Spanish), `fr_us` (French), and `zh_us` (Mandarin).

```javascript
const {
  identity,
  profile,
  FastlanePaymentComponent,
  FastlaneWatermarkComponent,
} = await window.paypal.Fastlane({
  metadata: { geoLocOverride: "{geoLocOverride}" },
  // shippingAddressOptions: {
  //   allowedLocations: [],
  // },
  // cardOptions: {
  //   allowedBrands: [],
  // },
  /*{configureStyles}*/
});
```

### Step 3: Capture user email address

You'll need to render your own email field to capture the payer's email address.

Because the email address will be shared with PayPal, it is crucial to inform the payer. We recommend displaying the Fastlane watermark below the email field.

> **Privacy**
>
> PayPal is a data controller and business under the California Consumer Privacy Act. You'll be sharing consumer's email addresses with PayPal. We recommend you make PayPal known to your consumers by leveraging our SDK to render the "Powered by Fastlane" logo and information tooltip. If you have any questions about this feature or your compliance with data protection laws, consult your legal advisors.

After collecting the email address, PayPal determines whether the email is associated with a Fastlane profile or if it belongs to a PayPal member.

#### Authenticate profile with one-time password

If the user is identified with a Fastlane profile, they need to authenticate before Fastlane retrieves their saved payment and address information. The user is presented with a screen to authenticate themselves by entering a one-time password sent to their registered mobile number.

The `triggerAuthenticationFlow()` method returns an `AuthenticatedCustomerResult` object. Use the `authenticationState` property in the `AuthenticatedCustomerResult` object to check if the payer has authenticated.

On authentication:
- The Fastlane member's card details and default shipping address are returned with the `profileData` object contents.
- The `renderFastlaneMemberExperience` is set to `True`.

If a user fails or declines to authenticate, render the same experience as you would for a guest payer.

### Step 4: Render shipping address

This step is **not required** for:
- Fastlane members without a shipping address.
- Fastlane members with a shipping address in a region you don't support.
- Guest payers

Continue to render your own shipping address collection form and pass it into the server-side transaction request.

For Fastlane members with a shipping address, you'll need to render:
- Shipping address returned from profile data on successful authentication.
- Fastlane watermark.
- Fastlane by PayPal logo.
- Change address button that invokes `showShippingAddressSelector()`. This provides a payer with the option to change or add a new address.

> **Note:**
> - Fastlane is only available for US-based customers. However, PayPal doesn't have restrictions on shipping addresses, so the merchant can decide who they want to ship to. This can be done using the `allowedShippingLocations` parameter in the SDK. The merchant can disallow either countries or regions, states, or provinces and PayPal will honor that in our shipping address component and forms.
> - If the user adds a new address to Fastlane profile, send the new address in the Orders v2 server-side request.

### Step 5: Accept payments

Fastlane offers two different integration patterns to accept payments: **Quick Start** and **Flexible**.

#### Quick Start

The quick start payment integration loads a pre-built template form to collect payments, requiring less integration effort. The quick start integration is PCI DSS compliant, ensuring that customer payment information is handled securely.

The ready-made payment UI component will automatically render the following:
- Selected card for the Fastlane member.
- "Change card" link which allows payers to change the selection or add a new card.
- Card fields for guest users or for Fastlane members that don't have a card in their profile.
- Billing address fields.

After you have received the `paymentTokenId` from the `paymentToken` object, it should be sent to your server to create a transaction with it.

#### Flexible

The flexible integration allows you to build your own checkout form while leveraging Fastlane's card component and watermark components individually.

```javascript
const cardComponent = await FastlaneCardComponent();
const paymentWatermark = await FastlaneWatermarkComponent({
  includeAdditionalInfo: false,
});
```

#### Render watermark

When displaying the card from payer's Fastlane profile, you must inform them about it by displaying the Fastlane watermark below the card.

For a better payer experience of Fastlane, preload the watermark asset by adding the following code to the `<head>` section of the page:

```html
<link rel="preload" href="https://www.paypalobjects.com/fastlane-v1/assets/fastlane-with-tooltip_en_sm_light.0808.svg" as="image" type="image/avif" />
```

```javascript
(
  await FastlaneWatermarkComponent({
    includeAdditionalInfo: true,
  })
).render('#watermark-container');
```

### Step 6: Configure the styling of the Fastlane component [OPTIONAL]

When styling the Fastlane components to match the look and feel of your checkout page, here are some guidelines to provide an accessible and transparent experience to your payer:

- Ensure that there is adequate contrast between the `backgroundColor` and `textColor` to ensure that all text, especially the legal text under the opt-in, is clear and legible. If the contrast ratio between the two is not 4.5:1 or greater, PayPal will automatically set the contrast to their default values.
- Ensure there is adequate contrast between the `borderColor`, which drives the consent toggle coloring, and the `backgroundColor`.

To override the default style settings for your page, use a `StyleOptions` object inside the Fastlane component:

```javascript
styles: {
  root: {
    backgroundColor: '#faf8f5',
    // errorColor: '',
    // fontFamily: '',
    // textColorBase: '',
    // fontSizeBase: '',
    // padding: '',
    // primaryColor: '',
  },
  // input: {
  //   backgroundColor: '',
  //   borderRadius: '',
  //   borderColor: '',
  //   borderWidth: '',
  //   textColorBase: '',
  //   focusBorderColor: '',
  // },
},
```

Visit the [Reference page](https://developer.paypal.com/docs/checkout/fastlane/reference/) for more details about additional customization and style options.

---

## 2. Integrate back end [SERVER]

This section explains how to set up your back end to integrate standard checkout payments.

### Back-end process

Your app creates and confirms an order on the back end by calling the Create Orders V2 API endpoint.

### Create order

On your server, you need to create an order by invoking the PPCP Orders API and passing the single use token, along with the item details and the shipping address.

**Intent:** `CAPTURE` | `AUTHORIZE`

**Amount:** Currency code and value for the order.

**Order payload:**

```javascript
const payload = {
  intent: "{order_intent}",
  payment_source: {
    card: {
      single_use_token: paymentToken.id,
    },
  },
  purchase_units: [
    {
      amount: {
        currency_code: "{order_currency_code}",
        value: "{order_value}",
      },
      ...(shippingAddress && {
        shipping: {
          type: "SHIPPING",
          ...(fullName && {
            name: {
              full_name: fullName,
            },
          }),
          company_name: shippingAddress.companyName || null,
          address: {
            address_line_1: shippingAddress.address.addressLine1,
            address_line_2: shippingAddress.address.addressLine2,
            admin_area_2: shippingAddress.address.adminArea2,
            admin_area_1: shippingAddress.address.adminArea1,
            postal_code: shippingAddress.address.postalCode,
            country_code: shippingAddress.address.countryCode,
          },
          ...(countryCode &&
            nationalNumber && {
              phone_number: {
                country_code: countryCode,
                national_number: nationalNumber,
              },
            }),
        },
      }),
    },
  ],
};
```

**Create order endpoint:**

```javascript
async function createOrder(req, res) {
  try {
    const { paymentToken, shippingAddress } = req.body;

    const url = `${PAYPAL_API_BASE_URL}/v2/checkout/orders`;

    const headers = new Headers();
    const accessToken = await getAccessToken();
    headers.append("PayPal-Request-Id", Date.now().toString());
    headers.append("Authorization", `Bearer ${accessToken}`);
    headers.append("Content-Type", "application/json");

    const { fullName } = shippingAddress?.name ?? {};
    const { countryCode, nationalNumber } = shippingAddress?.phoneNumber ?? {};
    /*{createOrderPayload}*/

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    res.status(response.status).json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
```

> **Note:** Providing detailed item descriptions and product images for each item creates a better user experience. It helps email communications and streamlines any potential dispute resolution.

### Special use-cases

**Store pick-up:** If the buyer is picking up item from a storefront, modify the shipping type parameter in the call and ensure the shipping method is set to `PICKUP_IN_STORE`. This ensures that buyer profiles aren't created with the address of your store as their shipping address.

**Vaulting:** Make sure you have configured your REST app to enable vault. You can vault a payment method with or without a transaction.

- **Vault with transaction:** If you want to save the `paymentToken` returned by the Fastlane SDK at the time of transaction, you can do so only when using the `store_in_vault` attribute in the request to `/v2/orders` on your server. This returns a vault ID, which can be saved and used for future captures. See the [Orders v2 documentation](https://developer.paypal.com/docs/api/orders/v2/) for more details.
- **Vault without transaction:** If you want to save the `paymentToken` returned by the Fastlane SDK without completing the transaction, then the payment token is generated but the Fastlane profile is not created for the customer. The Fastlane profile is created only for vaulting customers if they also complete a transaction during checkout.

---

## 3. Test integration

You'll need to test your integration for guest payers, Fastlane members, and PayPal members. If you're using the flexible integration, make sure your address and payment form fields render as expected.

### Card numbers for testing

Use any of the following card numbers as test cards:

| Brand          | Test Number        |
|----------------|--------------------|
| Visa           | 4005 5192 0000 0004 |
| Visa           | 4012 0000 3333 0026 |
| Visa           | 4012 0000 7777 7777 |
| Mastercard     | 5555 5555 5555 4444 |
| American Express | 3782 822463 10005 |

[View all test cards](https://developer.paypal.com/studio/checkout/fastlane/integrate#test-cards)

### Test guest payers

Before you test guest payers, make sure you:

- **Create a new email address:** Provide a new email address which is not associated with a sandbox Fastlane account.
- **Ensure opt-in toggle is ON:** Go through the checkout process using one of the card numbers available for testing. Be sure that the opt-in toggle is in the "on" state.
- **Enter any valid phone number for sandbox:** Make sure to pass a valid area code and prefix. A Fastlane profile is not created if you pass an invalid number such as 111-111-1111. No SMS is sent in sandbox mode. Upon completing the transaction, a Fastlane profile is created. Use that profile to test subsequent transactions as a Fastlane member.

Test guest payer flows with the consent toggle both on and off. If the consent toggle is off, the payment completes successfully and no Fastlane profile is created.

### Test Fastlane members

Before you test Fastlane payers, make sure you:

- **Create a Fastlane Member profile:** Go through the previous step and register a new Fastlane account. Be sure to remember the email address used when you created the account so that you can use it for additional testing.
- **Use OTP for testing:** When the authentication modal appears and you are prompted for a one-time password (OTP) use `111111` to trigger a successful authentication and any other 6-digit number to simulate a failed authentication.
- **Test updating payment method and shipping addresses to existing Fastlane Profiles:** Make sure that you test the payer's ability to update shipping addresses and cards associated with their profile.

Test the Fastlane member scenario as the member toggles all the options such as adding or changing an address or card, or failing the OTP.

### Test PayPal members

PayPal members that choose not to save their profile will be treated as guest users.

PayPal members that choose to save their profile will be treated as returning Fastlane member for future transactions.

PayPal members do not require any additional handling within your integration because our client SDK handles this use case for you in the following ways:

- After performing the `lookupCustomerByEmail` method, we will return a `customerContextId` as if this were a Fastlane member.
- When you call the `triggerAuthenticationFlow` method, our SDK will display a call to action to the customer explaining that they can create a Fastlane profile populated with information from their PayPal account with one click.
- If the consumer clicks yes, we will return `profileData` exactly as we would for a Fastlane member.
- If the consumer closes the dialog, we will return an empty `profileData` object and you would handle this as you would any Fastlane guest member.

Visit the [Reference page](https://developer.paypal.com/docs/checkout/fastlane/reference/) for more details about [troubleshooting](https://developer.paypal.com/docs/checkout/fastlane/reference/#link-troubleshooting), [best practices](https://developer.paypal.com/docs/checkout/fastlane/reference/#link-bestpractices), [customization](https://developer.paypal.com/docs/checkout/fastlane/reference/#link-customize) and [style options](https://developer.paypal.com/docs/checkout/fastlane/reference/#link-style).

---

## 4. Go live

If you have fulfilled the requirements for accepting card payments via Fastlane for your [business account](https://www.paypal.com/signin?returnUri=https%3A%2F%2Fwww.paypal.com%2Fmyaccount%2Fbundle%2Fbusiness%2Fupgrade), review [Move your app to production](https://developer.paypal.com/api/rest/production/) to test and go live.

If this is your first time testing in a live environment, follow these steps:

1. Log into the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) with your PayPal business account.
2. Complete [production onboarding](https://www.paypal.com/unifiedonboarding/entry?country.x=US&locale.x=en_US&products=EXPRESS_CHECKOUT) so you can process card payments with your live PayPal business account.
3. Request [Advanced Credit and Debit Card Payments](https://www.paypal.com/signin/client?flow=provisionUser&country.x=US&locale.x=en_US&_ga=1.95899167.248280996.1670866755) for your business account if you are not using cards currently with PayPal. Fastlane will be enabled along with the Advanced Credit and Debit Card payments processing.

---

## Full Code Samples

### checkout.html

```html
<!DOCTYPE html>
<html lang="en">
<title>{{title}}</title>

<head>
  <link rel="stylesheet" href="{{stylesheetPath}}" />

  <script
    src="https://www.paypal.com/sdk/js?client-id=YOUR_CLIENT_ID&components=buttons%2Cfastlane"
    data-sdk-client-token="{{client_access_token}}"
    data-sdk-integration-source="developer-studio"
    defer
  ></script>
  <script src="init-fastlane.js" defer></script>
</head>

<body>
  <form>
    <h1>{{title}}</h1>

    <section id="customer" class="active visited">
      <div class="header">
        <h2>Customer</h2>
        <button id="email-edit-button" type="button" class="edit-button">Edit</button>
      </div>
      <div class="summary"></div>
      <div class="email-container">
        <fieldset class="email-input-with-watermark">
          <input id="email-input" name="email" type="email" placeholder="Email" autocomplete="email" />
          <div id="watermark-container"></div>
        </fieldset>
        <button id="email-submit-button" type="button" class="submit-button" disabled>Continue</button>
      </div>
    </section>

    <hr />

    <section id="shipping">
      <div class="header">
        <h2>Shipping</h2>
        <button id="shipping-edit-button" type="button" class="edit-button">Edit</button>
      </div>
      <div class="summary"></div>
      <fieldset>
        <span>
          <input id="shipping-required-checkbox" name="shipping-required" type="checkbox" checked />
          <label for="shipping-required-checkbox">This purchase requires shipping</label>
        </span>
        <input name="given-name" placeholder="First name" autocomplete="given-name" />
        <input name="family-name" placeholder="Last name" autocomplete="family-name" />
        <input name="address-line1" placeholder="Street address" autocomplete="address-line1" />
        <input name="address-line2" placeholder="Apt., ste., bldg. (optional)" autocomplete="address-line2" />
        <input name="address-level2" placeholder="City" autocomplete="address-level2" />
        <input name="address-level1" placeholder="State" autocomplete="address-level1" />
        <input name="postal-code" placeholder="ZIP code" autocomplete="postal-code" />
        <input name="country" placeholder="Country" autocomplete="country" />
        <input name="tel-country-code" placeholder="Country calling code" autocomplete="tel-country-code" />
        <input name="tel-national" type="tel" placeholder="Phone number" autocomplete="tel-national" />
      </fieldset>
      <button id="shipping-submit-button" type="button" class="submit-button">Continue</button>
    </section>

    <hr />

    <section id="payment">
      <div class="header">
        <h2>Payment</h2>
        <button id="payment-edit-button" type="button" class="edit-button">Edit</button>
      </div>
      <fieldset>
        <div id="payment-component"></div>
      </fieldset>
    </section>

    <button id="checkout-button" type="button" class="submit-button">Checkout</button>
  </form>
</body>
</html>
```

### init-fastlane.js (Quick Start)

```javascript
async function initFastlane() {
  try {
    /* ######################################################################
     * Initialize Fastlane components
     * ###################################################################### */

    if (!window.paypal.Fastlane) {
      throw new Error('PayPal script loaded but no Fastlane module');
    }

    const {
      identity,
      profile,
      FastlanePaymentComponent,
      FastlaneWatermarkComponent,
    } = await window.paypal.Fastlane({
      metadata: { geoLocOverride: 'US' },
    });

    const paymentComponent = await FastlanePaymentComponent();

    (
      await FastlaneWatermarkComponent({
        includeAdditionalInfo: true,
      })
    ).render('#watermark-container');

    /* ######################################################################
     * State & data required for Fastlane
     * ###################################################################### */

    let memberAuthenticatedSuccessfully;
    let email;
    let shippingAddress;
    let paymentToken;

    /* ######################################################################
     * Checkout form helpers
     * (this will be different for individual websites and will depend on how
     * your own checkout flow functions)
     * ###################################################################### */

    const form = document.querySelector('form');
    const customerSection = document.getElementById('customer');
    const emailSubmitButton = document.getElementById('email-submit-button');
    const shippingSection = document.getElementById('shipping');
    const paymentSection = document.getElementById('payment');
    const checkoutButton = document.getElementById('checkout-button');
    let activeSection = customerSection;

    const setActiveSection = (section) => {
      activeSection.classList.remove('active');
      section.classList.add('active', 'visited');
      activeSection = section;
    };

    const getAddressSummary = ({
      companyName,
      address: {
        addressLine1,
        addressLine2,
        adminArea2,
        adminArea1,
        postalCode,
        countryCode,
      } = {},
      name: { firstName, lastName, fullName } = {},
      phoneNumber: { countryCode: telCountryCode, nationalNumber } = {},
    }) => {
      const isNotEmpty = (field) => !!field;
      const summary = [
        fullName || [firstName, lastName].filter(isNotEmpty).join(' '),
        companyName,
        [addressLine1, addressLine2].filter(isNotEmpty).join(', '),
        [
          adminArea2,
          [adminArea1, postalCode].filter(isNotEmpty).join(' '),
          countryCode,
        ]
          .filter(isNotEmpty)
          .join(', '),
        [telCountryCode, nationalNumber].filter(isNotEmpty).join(''),
      ];
      return summary.filter(isNotEmpty).join('\n');
    };

    const setShippingSummary = (address) => {
      shippingSection.querySelector('.summary').innerText =
        getAddressSummary(address);
    };

    const validateFields = (form, fields = []) => {
      if (fields.length <= 0) return true;

      let valid = true;
      const invalidFields = [];

      for (let i = 0; i < fields.length; i++) {
        const currentFieldName = fields[i];
        const currentFieldElement = form.elements[currentFieldName];
        const isCurrentFieldValid = currentFieldElement.checkValidity();

        if (!isCurrentFieldValid) {
          valid = false;
          invalidFields.push(currentFieldName);
          currentFieldElement.classList.add('input-invalid');
          continue;
        }

        currentFieldElement.classList.remove('input-invalid');
      }

      if (invalidFields.length > 0) {
        const [firstInvalidField] = invalidFields;
        form.elements[firstInvalidField].reportValidity();
      }

      return valid;
    };

    /* ######################################################################
     * Checkout form interactable elements
     * ###################################################################### */

    emailSubmitButton.addEventListener('click', async () => {
      // Checks if email is empty or in a invalid format
      const isEmailValid = validateFields(form, ['email']);

      if (!isEmailValid) {
        return;
      }

      // disable button until authentication succeeds or fails
      emailSubmitButton.setAttribute('disabled', '');

      // reset form & state
      email = form.elements['email'].value;
      form.reset();
      document.getElementById('email-input').value = email;
      shippingSection.classList.remove('visited');
      setShippingSummary({});
      paymentSection.classList.remove('visited', 'pinned');

      memberAuthenticatedSuccessfully = undefined;
      shippingAddress = undefined;
      paymentToken = undefined;

      // render payment component
      paymentComponent.render('#payment-component');

      try {
        // identify and authenticate Fastlane members
        const { customerContextId } =
          await identity.lookupCustomerByEmail(email);

        if (customerContextId) {
          const authResponse =
            await identity.triggerAuthenticationFlow(customerContextId);
          console.log('Auth response:', authResponse);

          // save profile data
          if (authResponse?.authenticationState === 'succeeded') {
            memberAuthenticatedSuccessfully = true;
            shippingAddress = authResponse.profileData.shippingAddress;
            paymentToken = authResponse.profileData.card;
          }
        } else {
          // user was not recognized
          console.log('No customerContextId');
        }

        // update form UI
        customerSection.querySelector('.summary').innerText = email;
        if (shippingAddress) {
          setShippingSummary(shippingAddress);
        }
        if (memberAuthenticatedSuccessfully) {
          shippingSection.classList.add('visited');
          paymentSection.classList.add('pinned');
          setActiveSection(paymentSection);
        } else {
          setActiveSection(shippingSection);
        }
      } finally {
        // re-enable button once authentication succeeds or fails
        emailSubmitButton.removeAttribute('disabled');
      }
    });

    // enable button after adding click event listener
    emailSubmitButton.removeAttribute('disabled');

    document
      .getElementById('email-edit-button')
      .addEventListener('click', () => setActiveSection(customerSection));

    document
      .getElementById('shipping-submit-button')
      .addEventListener('click', () => {
        const isShippingRequired = form.elements['shipping-required'].checked;

        if (!isShippingRequired) {
          shippingAddress = undefined;
          setActiveSection(paymentSection);
          setShippingSummary({});
          return;
        }

        const isShippingFormValid = validateFields(form, [
          'given-name',
          'family-name',
          'address-line1',
          'address-level2',
          'address-level1',
          'postal-code',
          'country',
          'tel-country-code',
          'tel-national',
        ]);

        if (!isShippingFormValid) {
          return;
        }

        // extract form values
        const firstName = form.elements['given-name'].value;
        const lastName = form.elements['family-name'].value;
        const company = form.elements['company'].value;
        const addressLine1 = form.elements['address-line1'].value;
        const addressLine2 = form.elements['address-line2'].value;
        const adminArea2 = form.elements['address-level2'].value;
        const adminArea1 = form.elements['address-level1'].value;
        const postalCode = form.elements['postal-code'].value;
        const countryCode = form.elements['country'].value;
        const telCountryCode = form.elements['tel-country-code'].value;
        const telNational = form.elements['tel-national'].value;

        // update state & form UI
        shippingAddress = {
          companyName: company,
          address: {
            addressLine1,
            addressLine2,
            adminArea2,
            adminArea1,
            postalCode,
            countryCode,
          },
          name: {
            firstName,
            lastName,
            fullName: [firstName, lastName]
              .filter((field) => !!field)
              .join(' '),
          },
          phoneNumber: {
            countryCode: telCountryCode,
            nationalNumber: telNational,
          },
        };
        setShippingSummary(shippingAddress);
        paymentComponent.setShippingAddress(shippingAddress);
        setActiveSection(paymentSection);
      });

    document
      .getElementById('shipping-edit-button')
      .addEventListener('click', async () => {
        if (memberAuthenticatedSuccessfully) {
          // open Shipping Address Selector for Fastlane members
          const { selectionChanged, selectedAddress } =
            await profile.showShippingAddressSelector();

          if (selectionChanged) {
            // selectedAddress contains the new address
            console.log('New address:', selectedAddress);

            // update state & form UI
            shippingAddress = selectedAddress;
            setShippingSummary(shippingAddress);
            paymentComponent.setShippingAddress(shippingAddress);
          } else {
            // selection modal was dismissed without selection
          }
        } else {
          setActiveSection(shippingSection);
        }
      });

    document
      .getElementById('payment-edit-button')
      .addEventListener('click', () => setActiveSection(paymentSection));

    checkoutButton.addEventListener('click', async () => {
      // disable button until transaction succeeds or fails
      checkoutButton.setAttribute('disabled', '');

      try {
        // get payment token
        paymentToken = await paymentComponent.getPaymentToken();
        console.log('Payment token:', paymentToken);

        // send transaction details to back-end
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        const isShippingRequired = form.elements['shipping-required'].checked;
        const body = JSON.stringify({
          ...(isShippingRequired && { shippingAddress }),
          paymentToken,
        });
        const response = await fetch('transaction', {
          method: 'POST',
          headers,
          body,
        });
        const { result, error } = await response.json();

        if (error) {
          console.error(error);
        } else {
          if (result.id) {
            const message = `Order ${result.id}: ${result.status}`;
            console.log(message);
            alert(message);
          } else {
            console.error(result);
          }
        }
      } finally {
        // re-enable button once transaction succeeds or fails
        checkoutButton.removeAttribute('disabled');
      }
    });
  } catch (error) {
    console.error(error);
  }
}

initFastlane();
```

### server.js (Node.js)

```javascript
import "dotenv/config";
import engines from "consolidate";
import express from "express";
import cors from "cors";

const {
  PAYPAL_API_BASE_URL = "https://api-m.sandbox.paypal.com", // use https://api-m.paypal.com for production environment
  PAYPAL_SDK_BASE_URL = "https://www.sandbox.paypal.com", // use https://www.paypal.com for production environment
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  DOMAINS,
  PAYPAL_MERCHANT_ID,
  PAYPAL_BN_CODE,
} = process.env;

/* ######################################################################
 * Token generation helpers
 * ###################################################################### */

function getAuthAssertionToken(clientId, merchantId) {
  const header = {
    alg: "none",
  };
  const body = {
    iss: clientId,
    payer_id: merchantId,
  };
  const signature = "";
  const jwtParts = [header, body, signature];

  const authAssertion = jwtParts
    .map((part) => part && btoa(JSON.stringify(part)))
    .join(".");

  return authAssertion;
}

async function getClientToken() {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error("Missing API credentials");
    }

    const url = `${PAYPAL_API_BASE_URL}/v1/oauth2/token`;

    const headers = new Headers();

    const auth = Buffer.from(
      `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    headers.append("Authorization", `Basic ${auth}`);
    headers.append("Content-Type", "application/x-www-form-urlencoded");

    const searchParams = new URLSearchParams();
    searchParams.append("grant_type", "client_credentials");
    searchParams.append("response_type", "client_token");
    searchParams.append("intent", "sdk_init");
    searchParams.append("domains[]", DOMAINS);

    const options = {
      method: "POST",
      headers,
      body: searchParams,
    };

    const response = await fetch(url, options);
    const data = await response.json();

    return data.access_token;
  } catch (error) {
    console.error(error);

    return "";
  }
}

async function getAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("Missing API credentials");
  }

  const url = `${PAYPAL_API_BASE_URL}/v1/oauth2/token`;

  const headers = new Headers();
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  headers.append("Authorization", `Basic ${auth}`);
  headers.append("Content-Type", "application/x-www-form-urlencoded");
  if (PAYPAL_MERCHANT_ID) {
    headers.append("PayPal-Partner-Attribution-ID", PAYPAL_BN_CODE);
    headers.append(
      "PayPal-Auth-Assertion",
      getAuthAssertionToken(PAYPAL_CLIENT_ID, PAYPAL_MERCHANT_ID)
    );
  }

  const searchParams = new URLSearchParams();
  searchParams.append("grant_type", "client_credentials");

  const options = {
    method: "POST",
    headers,
    body: searchParams,
  };

  const response = await fetch(url, options);
  const data = await response.json();

  return data.access_token;
}

/* ######################################################################
 * Serve checkout page
 * ###################################################################### */

function getPayPalSdkUrl() {
  const sdkUrl = new URL("/sdk/js", PAYPAL_SDK_BASE_URL);
  const sdkParams = new URLSearchParams({
    "client-id": PAYPAL_CLIENT_ID,
    components: "buttons,fastlane",
  });
  sdkUrl.search = sdkParams.toString();

  return sdkUrl.toString();
}

async function renderCheckout(req, res) {
  const sdkUrl = getPayPalSdkUrl();
  const clientToken = await getClientToken();

  const locals = {
    title: "Fastlane - PayPal Integration",
    prerequisiteScripts: `
      <script
        src="${sdkUrl}"
        data-sdk-client-token="${clientToken}"
        defer
      ></script>
    `,
    initScriptPath: "init-fastlane.js",
    stylesheetPath: "styles.css",
  };

  res.render("checkout", locals);
}

/* ######################################################################
 * Process transactions
 * ###################################################################### */

async function createOrder(req, res) {
  try {
    const { paymentToken, shippingAddress } = req.body;

    const url = `${PAYPAL_API_BASE_URL}/v2/checkout/orders`;

    const headers = new Headers();
    const accessToken = await getAccessToken();
    headers.append("PayPal-Request-Id", Date.now().toString());
    headers.append("Authorization", `Bearer ${accessToken}`);
    headers.append("Content-Type", "application/json");

    const { fullName } = shippingAddress?.name ?? {};
    const { countryCode, nationalNumber } = shippingAddress?.phoneNumber ?? {};

    const payload = {
      intent: "CAPTURE",
      payment_source: {
        card: {
          single_use_token: paymentToken.id,
        },
      },
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: "10.00",
          },
          ...(shippingAddress && {
            shipping: {
              type: "SHIPPING",
              ...(fullName && {
                name: {
                  full_name: fullName,
                },
              }),
              company_name: shippingAddress.companyName || null,
              address: {
                address_line_1: shippingAddress.address.addressLine1,
                address_line_2: shippingAddress.address.addressLine2,
                admin_area_2: shippingAddress.address.adminArea2,
                admin_area_1: shippingAddress.address.adminArea1,
                postal_code: shippingAddress.address.postalCode,
                country_code: shippingAddress.address.countryCode,
              },
              ...(countryCode &&
                nationalNumber && {
                  phone_number: {
                    country_code: countryCode,
                    national_number: nationalNumber,
                  },
                }),
            },
          }),
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    res.status(response.status).json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Captures an authorized payment, by ID.
 * @see https://developer.paypal.com/docs/api/payments/v2/#authorizations_capture
 */
async function captureAuthorize(req, res) {
  try {
    const { authorizationId } = req.params;
    const url = `${PAYPAL_API_BASE_URL}/v2/payments/authorizations/${authorizationId}/capture`;
    const headers = new Headers();
    const accessToken = await getAccessToken();
    headers.append("PayPal-Request-Id", Date.now().toString());
    headers.append("Authorization", `Bearer ${accessToken}`);
    headers.append("Content-Type", "application/json");

    const response = await fetch(url, {
      method: "POST",
      headers,
    });
    const result = await response.json();

    res.status(response.status).json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

/* ######################################################################
 * Run the server
 * ###################################################################### */

function configureServer(app) {
  app.engine("html", engines.mustache);
  app.set("view engine", "html");
  app.set("views", "../shared/views");

  app.enable("strict routing");

  app.use(cors());
  app.use(express.json());

  app.get("/", renderCheckout);
  app.post("/transaction", createOrder);
  app.post("/orders/:authorizationId/captureAuthorize", captureAuthorize);

  app.get("/sdk/url", (_req, res) => {
    const sdkUrl = getPayPalSdkUrl();
    res.json({ url: sdkUrl });
  });

  app.get("/sdk/client-token", async (_req, res) => {
    const clientToken = await getClientToken();
    res.json({ clientToken });
  });

  app.use(express.static("../../client/html/src"));
}

const app = express();

configureServer(app);

const port = process.env.PORT ?? 8080;

app.listen(port, () => {
  console.log(`Fastlane Sample Application - Server listening at port ${port}`);
});
```
