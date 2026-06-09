(function () {
  'use strict';
  var CFG = window.DEMO || {};

  // ── result helper ─────────────────────────────────────────────────────
  function showResult(msg, type) {
    var el = document.getElementById('demo-result');
    if (!el) { console.log(msg); return; }
    el.textContent = msg;
    el.className = 'result-msg' + (type ? ' ' + type : '');
  }

  // ── DOM refs ──────────────────────────────────────────────────────────
  var form              = document.getElementById('fl-form');
  var stepCustomer      = document.getElementById('step-customer');
  var stepShipping      = document.getElementById('step-shipping');
  var stepBilling       = document.getElementById('step-billing');
  var stepPayment       = document.getElementById('step-payment');
  var emailSubmitBtn    = document.getElementById('email-submit-button');
  var shippingSubmitBtn = document.getElementById('shipping-submit-button');
  var billingSubmitBtn  = document.getElementById('billing-submit-button');
  var checkoutBtn       = document.getElementById('checkout-button');
  var customerSummary   = document.getElementById('customer-summary');
  var shippingSummary   = document.getElementById('shipping-summary');
  var billingSummary    = document.getElementById('billing-summary');

  // ── state ─────────────────────────────────────────────────────────────
  var identity, profile, FastlaneCardComponent, FastlaneWatermarkComponent;
  var fastlaneCardComponent; // rendered card component instance
  var memberAuthenticated = false;
  var memberHasSavedCard  = false;
  var email, shippingAddress, billingAddress, paymentToken;
  var prefillTel, prefillZip, prefillCardholderName;
  var activeSection = stepCustomer;

  // ── section state helpers ─────────────────────────────────────────────
  function setActive(section) {
    if (activeSection) activeSection.classList.remove('fl-active');
    section.classList.add('fl-active');
    activeSection = section;
  }

  function markVisited(section) {
    section.classList.add('fl-visited');
  }

  // ── address helpers ───────────────────────────────────────────────────
  // getAddressSummary: supports both shipping (nested) and billing (flat) structures
  function getAddressSummary(a) {
    a = a || {};
    var addr = a.address || a; // shipping has .address wrapper; billing is flat
    var name = a.name || {};
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
    if (shippingSummary) shippingSummary.innerText = getAddressSummary(a || {});
  }

  function setBillingSummary(a) {
    if (!billingSummary) return;
    a = a || {};
    var cityStateZip = [
      a.adminArea2,
      [a.adminArea1, a.postalCode].filter(Boolean).join(' '),
      a.countryCode,
    ].filter(Boolean).join(', ');
    var lines = [a.addressLine1, a.addressLine2, cityStateZip].filter(Boolean);
    billingSummary.innerText = lines.join('\n');
  }

  // render member saved card summary in #selected-card
  function renderSelectedCard(token) {
    var el = document.getElementById('selected-card');
    if (!el) return;
    var lastDigits = token &&
      token.paymentSource &&
      token.paymentSource.card &&
      token.paymentSource.card.lastDigits;
    el.innerText = lastDigits ? '💳 •••• ' + lastDigits : '💳 Saved card';
    el.style.display = 'block';
  }

  // ── field validation ──────────────────────────────────────────────────
  // Copied from fastlane-pui (D3 decision: keep products self-contained)
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

  // ── phone formatter ───────────────────────────────────────────────────
  // Converts 10-digit national number to xxx-xxx-xxxx for FastlaneCardComponent prefill
  function formatPhone(national) {
    var digits = (national || '').replace(/\D/g, '');
    if (digits.length === 10) {
      return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    }
    return digits;
  }

  // ── Fastlane init ─────────────────────────────────────────────────────
  async function initFastlane() {
    if (!window.paypal || !window.paypal.Fastlane) {
      throw new Error('PayPal SDK loaded but no Fastlane module — check components param (needs fastlane,three-domain-secure)');
    }
    var fl = await window.paypal.Fastlane({
      metadata: { geoLocOverride: 'US' },
      styles: { root: { backgroundColor: 'transparent' } },
    });
    // inspect: log Fastlane object to confirm FastlaneCardComponent vs FastlanePaymentComponent availability
    console.log('[fastlane-fp] Fastlane init result:', fl);
    identity                  = fl.identity;
    profile                   = fl.profile;
    FastlaneCardComponent     = fl.FastlaneCardComponent;     // Flexible — card only
    FastlaneWatermarkComponent = fl.FastlaneWatermarkComponent;
    console.log('[fastlane-fp] FastlaneCardComponent:', FastlaneCardComponent);
    console.log('[fastlane-fp] FastlaneWatermarkComponent:', FastlaneWatermarkComponent);
  }

  async function renderEmailWatermark() {
    var wm = await FastlaneWatermarkComponent({ includeAdditionalInfo: true });
    wm.render('#watermark-container');
  }

  // ── Step 1: Email → lookup + auth ────────────────────────────────────
  async function onEmailSubmit() {
    if (!validateFields(['email'])) return;
    emailSubmitBtn.setAttribute('disabled', '');
    try {
      email = form.elements['email'].value;

      // reset all state for re-submit
      memberAuthenticated = false;
      memberHasSavedCard  = false;
      shippingAddress     = undefined;
      billingAddress      = undefined;
      paymentToken        = undefined;
      fastlaneCardComponent = undefined;
      prefillTel = prefillZip = prefillCardholderName = undefined;

      // reset step UI
      [stepShipping, stepBilling, stepPayment].forEach(function (s) {
        s.classList.remove('fl-visited', 'fl-active');
      });
      stepBilling.removeAttribute('hidden');
      if (shippingSummary) shippingSummary.innerText = '';
      if (billingSummary)  billingSummary.innerText  = '';
      var cardEl = document.getElementById('card-component');
      if (cardEl) cardEl.innerHTML = '';
      var wmEl = document.getElementById('payment-watermark');
      if (wmEl) wmEl.innerHTML = '';
      var scEl = document.getElementById('selected-card');
      if (scEl) { scEl.innerText = ''; scEl.style.display = 'none'; }
      showResult('');

      var ctx = await identity.lookupCustomerByEmail(email);
      // inspect: confirm customerContextId field name and shape
      console.log('[fastlane-fp] lookupCustomerByEmail result:', ctx);

      if (ctx && ctx.customerContextId) {
        var auth = await identity.triggerAuthenticationFlow(ctx.customerContextId);
        // inspect: confirm authenticationState / profileData.shippingAddress / profileData.card / card.paymentSource.card.billingAddress / lastDigits
        console.log('[fastlane-fp] triggerAuthenticationFlow result:', auth);
        if (auth && auth.authenticationState === 'succeeded') {
          memberAuthenticated = true;
          shippingAddress     = auth.profileData && auth.profileData.shippingAddress;
          paymentToken        = auth.profileData && auth.profileData.card;
          // inspect: confirm billingAddress path in card profile
          billingAddress = paymentToken &&
            paymentToken.paymentSource &&
            paymentToken.paymentSource.card &&
            paymentToken.paymentSource.card.billingAddress;
          memberHasSavedCard = !!paymentToken;
          console.log('[fastlane-fp] member shippingAddress:', shippingAddress);
          console.log('[fastlane-fp] member paymentToken (card):', paymentToken);
          console.log('[fastlane-fp] member billingAddress from card:', billingAddress);
        }
      } else {
        console.log('[fastlane-fp] no customerContextId — guest flow');
      }

      if (customerSummary) customerSummary.innerText = email;
      markVisited(stepCustomer);

      if (memberAuthenticated) {
        // member: shipping address already in profile
        setShippingSummary(shippingAddress);
        markVisited(stepShipping);

        if (memberHasSavedCard) {
          // member with saved card: hide billing step, show card summary in payment
          stepBilling.setAttribute('hidden', '');
          renderSelectedCard(paymentToken);
          var pmWm = await FastlaneWatermarkComponent({ includeAdditionalInfo: false });
          pmWm.render('#payment-watermark');
          setActive(stepPayment);
          markVisited(stepPayment); // show Edit button so user can switch cards
        } else {
          // member without saved card: show billing step
          setActive(stepBilling);
        }
      } else {
        // guest: expand shipping form
        setActive(stepShipping);
      }
    } catch (e) {
      console.error('[fastlane-fp] email submit error:', e);
      showResult('✗ ' + e.message, 'error');
    } finally {
      emailSubmitBtn.removeAttribute('disabled');
    }
  }

  // ── Step 2: Shipping submit (guest / member-no-card) ──────────────────
  async function onShippingSubmit() {
    var required = form.elements['shipping-required'].checked;
    if (!required) {
      shippingAddress = undefined;
      setShippingSummary({});
      markVisited(stepShipping);
      setActive(stepBilling);
      return;
    }

    if (!validateFields([
      'given-name', 'family-name', 'address-line1',
      'address-level2', 'address-level1', 'postal-code', 'country',
      'tel-country-code', 'tel-national',
    ])) return;

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

    // record prefills for FastlaneCardComponent
    prefillTel            = formatPhone(telNational);
    prefillZip            = postalCode;
    prefillCardholderName = shippingAddress.name.fullName;

    setShippingSummary(shippingAddress);
    markVisited(stepShipping);
    setActive(stepBilling);
  }

  // ── Step 3: Billing submit (Flexible — guest / member-no-card) ────────
  async function onBillingSubmit() {
    if (!validateFields([
      'billing-address-line1',
      'billing-address-level2', 'billing-address-level1',
      'billing-postal-code', 'billing-country',
    ])) return;

    // assemble flat billing address (what getPaymentToken({ billingAddress }) expects)
    billingAddress = {
      addressLine1: form.elements['billing-address-line1'].value,
      addressLine2: form.elements['billing-address-line2'].value,
      adminArea2:   form.elements['billing-address-level2'].value,
      adminArea1:   form.elements['billing-address-level1'].value,
      postalCode:   form.elements['billing-postal-code'].value,
      countryCode:  form.elements['billing-country'].value,
    };

    setBillingSummary(billingAddress);
    markVisited(stepBilling);

    // render FastlaneCardComponent with prefills from shipping
    var cardOpts = {
      fields: {
        phoneNumber:    { prefill: prefillTel || '' },
        postalCode:     { prefill: prefillZip || billingAddress.postalCode || '' },
        cardholderName: { prefill: prefillCardholderName || '', enabled: true },
      },
    };
    fastlaneCardComponent = await FastlaneCardComponent(cardOpts);
    // inspect: confirm fastlaneCardComponent shape and getPaymentToken method
    console.log('[fastlane-fp] FastlaneCardComponent instance:', fastlaneCardComponent);
    fastlaneCardComponent.render('#card-component');

    var pmWm = await FastlaneWatermarkComponent({ includeAdditionalInfo: false });
    pmWm.render('#payment-watermark');

    setActive(stepPayment);
  }

  // ── Edit buttons ──────────────────────────────────────────────────────
  async function onShippingEdit() {
    if (memberAuthenticated) {
      // member: use Fastlane address selector popup
      var sel = await profile.showShippingAddressSelector();
      // inspect: confirm selectionChanged / selectedAddress fields
      console.log('[fastlane-fp] showShippingAddressSelector result:', sel);
      if (sel && sel.selectionChanged) {
        shippingAddress = sel.selectedAddress;
        setShippingSummary(shippingAddress);
      }
    } else {
      setActive(stepShipping);
    }
  }

  async function onPaymentEdit() {
    if (memberHasSavedCard) {
      // member with saved card: use Fastlane card selector popup
      var sel = await profile.showCardSelector();
      // inspect: confirm selectionChanged / selectedCard fields
      console.log('[fastlane-fp] showCardSelector result:', sel);
      if (sel && sel.selectionChanged) {
        paymentToken = sel.selectedCard;
        renderSelectedCard(paymentToken);
      }
    } else {
      setActive(stepPayment);
    }
  }

  // ── helper: send create-order request ─────────────────────────────────
  async function createOrder(token, flow, shipping, amount) {
    var body = {
      paymentToken:    token,
      threeDSFlow:     flow,
      amount:          amount,
    };
    if (shipping) body.shippingAddress = shipping;
    if (billingAddress) body.billingAddress = billingAddress;

    var resp = await fetch(CFG.urls.createOrder, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var order = await resp.json();
    // inspect: log full order response to confirm captures path or PAYER_ACTION_REQUIRED + payer-action link
    console.log('[fastlane-fp] createOrder response (flow=' + flow + '):', order);
    return order;
  }

  // ── helper: inline success/fail judgment (Rule 13) ────────────────────
  function judgeInline(order) {
    var capture = order &&
      order.purchase_units &&
      order.purchase_units[0] &&
      order.purchase_units[0].payments &&
      order.purchase_units[0].payments.captures &&
      order.purchase_units[0].payments.captures[0];

    if (!capture || capture.status !== 'COMPLETED') {
      showResult('✗ Capture failed · status: ' + (capture ? capture.status : (order && order.error) || 'unknown'), 'error');
      return false;
    }
    showResult('✓ ' + capture.status + ' · Capture ID: ' + capture.id, 'success');
    // lock entire form — refresh to retry
    ['email-edit-button', 'shipping-edit-button', 'billing-edit-button', 'payment-edit-button'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.setAttribute('disabled', '');
    });
    return true;
  }

  // ── helper: create-order then inline judgment ─────────────────────────
  async function createAndJudge(token, flow, shipping, amount) {
    var order = await createOrder(token, flow, shipping, amount);
    judgeInline(order);
  }

  // ── Step 4: Checkout (two 3DS paths) ─────────────────────────────────
  async function onCheckout() {
    checkoutBtn.setAttribute('disabled', '');
    var succeeded = false;
    try {
      var threeDSFlow = document.getElementById('three-ds-flow').value; // 'jssdk' | 'api'
      var amount = document.getElementById('demo-amount').value;

      // get payment token (member-has-card uses profile token; others call getPaymentToken)
      if (!memberHasSavedCard) {
        if (!fastlaneCardComponent) {
          showResult('✗ Card component not initialized — complete Billing step first', 'error');
          return;
        }
        paymentToken = await fastlaneCardComponent.getPaymentToken({ billingAddress: billingAddress });
        // inspect: confirm paymentToken.id and paymentSource.card.lastDigits
        console.log('[fastlane-fp] getPaymentToken result:', paymentToken);
      }

      // ── None / When Required — direct payment, no 3DS enforcement ──────
      if (threeDSFlow === 'none') {
        await createAndJudge(paymentToken, 'none', shippingAddress, amount);
        succeeded = true;
      }
      // ── A. JSSDK 3DS flow ─────────────────────────────────────────────
      else if (threeDSFlow === 'jssdk') {
        if (!window.paypal || !window.paypal.ThreeDomainSecureClient) {
          showResult('✗ ThreeDomainSecureClient not available — check SDK components includes three-domain-secure', 'error');
          return;
        }
        var tds = window.paypal.ThreeDomainSecureClient;
        // inspect: log ThreeDomainSecureClient to confirm it's a singleton or constructor
        console.log('[fastlane-fp] ThreeDomainSecureClient:', tds);

        var tdsParams = {
          amount:             amount,
          currency:           'USD',
          nonce:              paymentToken.id,
          verificationMethod: 'SCA_ALWAYS',
          transactionContext: {
            experience_context: {
              brand_name:  'Demo Hub US Store',
              locale:      'en-US',
              return_url:  'https://example.com/return',  // placeholder (JSSDK 3DS is client-side)
              cancel_url:  'https://example.com/cancel',
            },
            transaction_context: { soft_descriptor: 'Demo Hub Fastlane' },
          },
        };

        var eligible = await tds.isEligible(tdsParams);
        // inspect: confirm isEligible return type (boolean) and params structure
        console.log('[fastlane-fp] ThreeDomainSecureClient.isEligible result:', eligible);

        if (eligible) {
          var results = await tds.show();
          // inspect: confirm authenticationState / liabilityShift / nonce field names
          console.log('[fastlane-fp] ThreeDomainSecureClient.show() result:', results);

          if (results && results.authenticationState === 'succeeded' && results.liabilityShift === 'POSSIBLE') {
            paymentToken.id = results.nonce; // replace with 3DS nonce before create-order
            await createAndJudge(paymentToken, 'jssdk', shippingAddress, amount);
            succeeded = true;
          } else {
            showResult(
              '✗ 3DS not authenticated · state: ' + (results ? results.authenticationState : 'unknown') +
              ' · liabilityShift: ' + (results ? results.liabilityShift : 'unknown'),
              'error'
            );
          }
        } else {
          // not eligible for 3DS — proceed directly
          console.log('[fastlane-fp] 3DS not eligible — proceeding without 3DS challenge');
          await createAndJudge(paymentToken, 'jssdk', shippingAddress, amount);
          succeeded = true;
        }
      }
      // ── B. API 3DS flow (full-page redirect) ─────────────────────────
      else if (threeDSFlow === 'api') {
        var order = await createOrder(paymentToken, 'api', shippingAddress, amount);

        if (order.status === 'PAYER_ACTION_REQUIRED') {
          // find payer-action link and redirect (inspect confirms link rel name)
          var links = order.links || [];
          var payerActionLink = null;
          for (var i = 0; i < links.length; i++) {
            if (links[i].rel === 'payer-action') { payerActionLink = links[i].href; break; }
          }
          if (payerActionLink) {
            console.log('[fastlane-fp] redirecting to payer-action:', payerActionLink);
            window.location.href = payerActionLink; // full-page redirect → return page does server capture
            return; // keep button disabled during redirect
          } else {
            showResult('✗ No payer-action link in order response', 'error');
          }
        } else {
          // API 3DS not triggered — judge inline (e.g. non-3DS eligible card)
          console.log('[fastlane-fp] API 3DS: no PAYER_ACTION_REQUIRED — judging inline');
          var inlineOk = judgeInline(order);
          if (inlineOk) succeeded = true;
        }
      }
    } catch (e) {
      console.error('[fastlane-fp] checkout error:', e);
      showResult('✗ ' + e.message, 'error');
    } finally {
      if (!succeeded) checkoutBtn.removeAttribute('disabled');
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  async function load() {
    try {
      await initFastlane();
      await renderEmailWatermark();

      // enable email Continue once Fastlane ready and email has value
      var emailInput = form.elements['email'];
      function syncEmailBtn() {
        emailSubmitBtn.disabled = !emailInput.value.trim();
      }
      emailInput.addEventListener('input', syncEmailBtn);
      syncEmailBtn();

      // shipping checkbox: toggle address fields visibility
      var shippingCheckbox   = document.getElementById('shipping-required-checkbox');
      var shippingAddrFields = document.getElementById('shipping-address-fields');
      shippingCheckbox.addEventListener('change', function () {
        shippingAddrFields.style.display = this.checked ? 'block' : 'none';
      });

      // bind step buttons
      emailSubmitBtn.addEventListener('click', onEmailSubmit);
      document.getElementById('email-edit-button').addEventListener('click', function () {
        setActive(stepCustomer);
      });

      shippingSubmitBtn.addEventListener('click', onShippingSubmit);
      document.getElementById('shipping-edit-button').addEventListener('click', onShippingEdit);

      billingSubmitBtn.addEventListener('click', onBillingSubmit);
      document.getElementById('billing-edit-button').addEventListener('click', function () {
        setActive(stepBilling);
      });

      document.getElementById('payment-edit-button').addEventListener('click', onPaymentEdit);
      checkoutBtn.addEventListener('click', onCheckout);
    } catch (e) {
      console.error('[fastlane-fp] load error:', e);
      showResult('✗ ' + e.message, 'error');
    }
  }

  load();
})();
