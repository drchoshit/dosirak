// Drafts belong to the meal period, not the application deadline (which may be extended).
export function periodKey(policy) {
  return JSON.stringify([policy?.start_date || '', policy?.end_date || '']);
}

export function isInPeriod(date, policy) {
  return Boolean(policy && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && (!policy.start_date || date >= policy.start_date)
    && (!policy.end_date || date <= policy.end_date));
}

export function filterDraft(draft, policy) {
  const selected = Object.fromEntries(Object.entries(draft?.selected || {}).filter(([key, value]) => {
    const match = key.match(/^(\d{4}-\d{2}-\d{2})-(LUNCH|DINNER)$/);
    return match && isInPeriod(match[1], policy) && ['BASE', 'EXTRA', true].includes(value);
  }));
  const available = new Set((policy?.carryover_coupons || []).map(c => Number(c.id)));
  const assigned = new Set();
  const coupons = Object.fromEntries(Object.entries(draft?.coupons || {}).filter(([key, id]) => {
    const couponId = Number(id);
    if (!selected[key] || !available.has(couponId) || assigned.has(couponId)) return false;
    assigned.add(couponId);
    return true;
  }));
  return { selected, coupons };
}

export function readPeriodDraft(session, code, policy) {
  const periods = session.drafts?.[code];
  // Import the current dates from legacy storage once; keep the original data intact.
  const draft = periods
    ? periods[periodKey(policy)]
    : { selected: session.selections?.[code], coupons: session.coupons?.[code] };
  return filterDraft(draft, policy);
}

export function savePeriodDraft(session, code, policy, draft) {
  return {
    ...session,
    drafts: {
      ...session.drafts,
      [code]: { ...session.drafts?.[code], [periodKey(policy)]: draft },
    },
  };
}
