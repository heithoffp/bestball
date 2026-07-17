// checkout-return — landing route for the bbexposures://checkout-return deep
// link (ADR-027). The normal checkout path never navigates here: the auth
// browser session intercepts the redirect and dismisses the sheet. This route
// only fires if the user broke out into plain Safari and tapped the return
// link, so it just lands them on the Account tab where the subscription
// status (and realtime tier flip) lives.
import React from 'react';
import { Redirect } from 'expo-router';

export default function CheckoutReturn() {
  return <Redirect href="/account" />;
}
