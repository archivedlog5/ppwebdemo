(function () {
  'use strict';
  var CFG = window.DEMO || {};

  // ── result helper ────────────────────────────────────────────────────
  function showResult(msg, type) {
    var el = document.getElementById('demo-result');
    if (!el) { console.log(msg); return; }
    el.textContent = msg;
    el.className = 'result-msg' + (type ? ' ' + type : '');
  }

  // ── DOM refs ──────────────────────────────────────────────────────────
  var form             = document.getElementById('fl-form');
  var stepCustomer     = document.getElementById('step-customer');
  var stepShipping     = document.getElementById('step-shipping');
  var stepPayment      = document.getElementById('step-payment');
  var emailSubmitBtn   = document.getElementById('email-submit-button');
  var shippingSubmitBtn= document.getElementById('shipping-submit-button');
  var checkoutBtn      = document.getElementById('checkout-button');
  var customerSummary  = document.getElementById('customer-summary');
  var shippingSummary  = document.getElementById('shipping-summary');

  // ── state ─────────────────────────────────────────────────────────────
  var identity, profile, FastlanePaymentComponent, FastlaneWatermarkComponent;
  var paymentComponent;
  var memberAuthenticated, email, shippingAddress, paymentToken;
  var activeSection = stepCustomer;

  // ── section helpers ───────────────────────────────────────────────────
  function setActive(section) {
    activeSection.classList.remove('fl-active');
    section.classList.add('fl-active');
    activeSection = section;
  }

  function markVisited(section) {
    section.classList.add('fl-visited');
  }

  // ── address summary ───────────────────────────────────────────────────
  function getAddressSummary(a) {
    a = a || {};
    var addr = a.address || {}, name = a.name || {}, ph = a.phoneNumber || {};
    var ne = function (f) { return !!f; };
    var fullName = name.fullName || [name.firstName, name.lastName].filter(ne).join(' ');
    var lines = [
      fullName,
      [addr.addressLine1, addr.addressLine2].filter(ne).join(', '),
      [addr.adminArea2, [addr.adminArea1, addr.postalCode].filter(ne).join(' '), addr.countryCode].filter(ne).join(', '),
    ];
    return lines.filter(ne).join('\n');
  }

  function setShippingSummary(a) {
    if (shippingSummary) shippingSummary.innerText = getAddressSummary(a);
  }

  // ── field validation ──────────────────────────────────────────────────
  function validateFields(names) {
    var ok = true, firstBad = null;
    (names || []).forEach(function (n) {
      var el = form.elements[n];
      if (!el) return;
      if (!el.value || !el.checkValidity()) {
        ok = false;
        el.classList.add('input-invalid');
        if (!firstBad) firstBad = el;
      } else {
        el.classList.remove('input-invalid');
      }
    });
    if (firstBad) firstBad.focus();
    return ok;
  }

  // ── Fastlane init ─────────────────────────────────────────────────────
  async function initFastlane() {
    if (!window.paypal || !window.paypal.Fastlane) {
      throw new Error('PayPal SDK loaded but no Fastlane module — check components param');
    }
    var fl = await window.paypal.Fastlane({
      metadata: { geoLocOverride: 'US' },
      styles: { root: { backgroundColor: 'transparent' } }
    });
    console.log('[fastlane] components:', fl);
    identity = fl.identity;
    profile  = fl.profile;
    FastlanePaymentComponent  = fl.FastlanePaymentComponent;
    FastlaneWatermarkComponent = fl.FastlaneWatermarkComponent;
  }

  async function renderWatermark() {
    (await FastlaneWatermarkComponent({ includeAdditionalInfo: true })).render('#watermark-container');
  }

  // ── Step 1: Email → lookup + auth ────────────────────────────────────
  async function onEmailSubmit() {
    if (!validateFields(['email'])) return;
    emailSubmitBtn.setAttribute('disabled', '');
    try {
      // reset state
      email = form.elements['email'].value;
      memberAuthenticated = false;
      shippingAddress = undefined;
      paymentToken = undefined;
      paymentComponent = undefined;
      document.getElementById('payment-component').innerHTML = '';
      stepShipping.classList.remove('fl-visited', 'fl-active');
      stepPayment.classList.remove('fl-visited', 'fl-active');
      if (shippingSummary) shippingSummary.innerText = '';
      showResult('');

      var ctx = await identity.lookupCustomerByEmail(email);
      console.log('[fastlane] lookupCustomerByEmail:', ctx);

      if (ctx && ctx.customerContextId) {
        var auth = await identity.triggerAuthenticationFlow(ctx.customerContextId);
        console.log('[fastlane] authResponse:', auth);
        if (auth && auth.authenticationState === 'succeeded') {
          memberAuthenticated = true;
          shippingAddress = auth.profileData && auth.profileData.shippingAddress;
          paymentToken    = auth.profileData && auth.profileData.card;
        }
      } else {
        console.log('[fastlane] no customerContextId — guest flow');
      }

      // Update customer summary
      if (customerSummary) customerSummary.innerText = email;
      markVisited(stepCustomer);

      if (memberAuthenticated) {
        // Member: address already in profileData — mark shipping visited with summary
        if (shippingAddress) setShippingSummary(shippingAddress);
        markVisited(stepShipping);
        paymentComponent = await FastlanePaymentComponent();
        console.log('[fastlane] paymentComponent (member):', paymentComponent);
        paymentComponent.render('#payment-component');
        setActive(stepPayment);
      } else {
        // Guest: expand shipping form for address entry
        setActive(stepShipping);
      }
    } catch (e) {
      console.error(e);
      showResult('✗ ' + e.message, 'error');
    } finally {
      emailSubmitBtn.removeAttribute('disabled');
    }
  }

  // ── Step 2: Shipping submit ───────────────────────────────────────────
  async function onShippingSubmit() {
    var required = form.elements['shipping-required'].checked;
    if (!required) {
      shippingAddress = undefined;
      setShippingSummary({});
      markVisited(stepShipping);
      await ensurePaymentComponent(null, null, null);
      setActive(stepPayment);
      return;
    }

    if (!validateFields(['given-name', 'family-name', 'address-line1', 'address-level2', 'address-level1', 'postal-code', 'country', 'tel-country-code', 'tel-national'])) return;

    var firstName   = form.elements['given-name'].value;
    var lastName    = form.elements['family-name'].value;
    var telNational = form.elements['tel-national'].value;
    var postalCode  = form.elements['postal-code'].value;

    shippingAddress = {
      address: {
        addressLine1: form.elements['address-line1'].value,
        addressLine2: form.elements['address-line2'].value,
        adminArea2:   form.elements['address-level2'].value,
        adminArea1:   form.elements['address-level1'].value,
        postalCode:   postalCode,
        countryCode:  form.elements['country'].value,
      },
      name: {
        firstName: firstName,
        lastName:  lastName,
        fullName:  [firstName, lastName].filter(Boolean).join(' '),
      },
      phoneNumber: {
        countryCode:    form.elements['tel-country-code'].value,
        nationalNumber: telNational,
      },
    };

    setShippingSummary(shippingAddress);
    markVisited(stepShipping);

    await ensurePaymentComponent(telNational, postalCode, shippingAddress.name.fullName);
    if (paymentComponent.setShippingAddress) {
      paymentComponent.setShippingAddress(shippingAddress);
    }
    setActive(stepPayment);
  }

  async function ensurePaymentComponent(tel, zip, name) {
    if (paymentComponent) {
      if (tel && paymentComponent.updatePrefills) paymentComponent.updatePrefills({ phoneNumber: tel });
      return;
    }
    var opts = {};
    if (tel || zip || name) {
      opts.fields = {};
      if (tel)  opts.fields.phoneNumber    = { prefill: tel };
      if (zip)  opts.fields.postalCode     = { prefill: zip };
      if (name) opts.fields.cardholderName = { prefill: name };
    }
    paymentComponent = await FastlanePaymentComponent(opts);
    console.log('[fastlane] paymentComponent (guest):', paymentComponent);
    paymentComponent.render('#payment-component');
  }

  // ── Shipping edit ─────────────────────────────────────────────────────
  async function onShippingEdit() {
    if (memberAuthenticated) {
      // Member: use Fastlane address selector popup
      var sel = await profile.showShippingAddressSelector();
      console.log('[fastlane] showShippingAddressSelector:', sel);
      if (sel && sel.selectionChanged) {
        shippingAddress = sel.selectedAddress;
        setShippingSummary(shippingAddress);
        if (paymentComponent && paymentComponent.setShippingAddress) {
          paymentComponent.setShippingAddress(shippingAddress);
        }
      }
    } else {
      // Guest: expand shipping form
      setActive(stepShipping);
    }
  }

  // ── Step 3: Checkout ──────────────────────────────────────────────────
  async function onCheckout() {
    checkoutBtn.setAttribute('disabled', '');
    var succeeded = false;
    try {
      paymentToken = await paymentComponent.getPaymentToken();
      console.log('[fastlane] paymentToken:', paymentToken);

      var required = form.elements['shipping-required'].checked;
      var body = {
        paymentToken: paymentToken,
        amount: document.getElementById('demo-amount').value,
      };
      if (required && shippingAddress) body.shippingAddress = shippingAddress;

      var resp = await fetch(CFG.urls.createOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var order = await resp.json();
      console.log('[fastlane] create-order response:', order);

      // Rule 13: must check captures[0].status === 'COMPLETED'
      var capture = order &&
        order.purchase_units &&
        order.purchase_units[0] &&
        order.purchase_units[0].payments &&
        order.purchase_units[0].payments.captures &&
        order.purchase_units[0].payments.captures[0];

      if (!capture || capture.status !== 'COMPLETED') {
        showResult('✗ Capture failed · status: ' + (capture ? capture.status : (order.error || 'unknown')), 'error');
        return;
      }
      showResult('✓ ' + capture.status + ' · Capture ID: ' + capture.id, 'success');
      succeeded = true;
      // Lock the entire form — refresh to retry
      ['email-edit-button', 'shipping-edit-button', 'payment-edit-button'].forEach(function (id) {
        var btn = document.getElementById(id);
        if (btn) btn.setAttribute('disabled', '');
      });
    } catch (e) {
      console.error(e);
      showResult('✗ ' + e.message, 'error');
    } finally {
      if (!succeeded) checkoutBtn.removeAttribute('disabled');
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  async function load() {
    try {
      await initFastlane();
      await renderWatermark();

      // Enable email continue once Fastlane is ready
      var emailInput = form.elements['email'];
      function syncEmailBtn() {
        emailSubmitBtn.disabled = !emailInput.value.trim();
      }
      emailInput.addEventListener('input', syncEmailBtn);
      syncEmailBtn();

      emailSubmitBtn.addEventListener('click', onEmailSubmit);
      document.getElementById('email-edit-button').addEventListener('click', function () { setActive(stepCustomer); });
      // Checkbox toggles address fields visibility
      var shippingCheckbox    = document.getElementById('shipping-required-checkbox');
      var shippingAddrFields  = document.getElementById('shipping-address-fields');
      shippingCheckbox.addEventListener('change', function () {
        shippingAddrFields.style.display = this.checked ? 'block' : 'none';
      });

      shippingSubmitBtn.addEventListener('click', onShippingSubmit);
      document.getElementById('shipping-edit-button').addEventListener('click', onShippingEdit);
      document.getElementById('payment-edit-button').addEventListener('click', function () { setActive(stepPayment); });
      checkoutBtn.addEventListener('click', onCheckout);
    } catch (e) {
      console.error(e);
      showResult('✗ ' + e.message, 'error');
    }
  }

  load();
})();
