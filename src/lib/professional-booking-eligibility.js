// Receipt truth and service eligibility are separate. Never discard a provider
// receipt because verification changed while payment was in flight.
export function isProfessionalBookable(pro) {
  return pro?.verified === true && pro?.verification_status === 'approved';
}

export async function readProfessionalBookability(supabase, professionalId) {
  if (!professionalId) return false;
  try {
    const { data, error } = await supabase.from('professionals')
      .select('verified,verification_status').eq('id', professionalId).maybeSingle();
    return !error && isProfessionalBookable(data);
  } catch { return false; }
}

export function bookingNeedsVerificationReview(booking) {
  return booking?.status === 'upcoming' && booking?.professionalBookable === false;
}
