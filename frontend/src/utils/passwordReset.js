export async function requestPasswordReset(authInstance, email, resetFn) {
  // Validate email presence and basic format
  if (!email || !email.includes('@')) {
    throw new Error('Invalid email address.');
  }

  const normalised = email.trim().toLowerCase();
  const isAutEmail = normalised.endsWith('@aut.ac.nz') || normalised.endsWith('@autuni.ac.nz');
  if (!isAutEmail) {
    throw new Error('You must use a valid AUT email address (@aut.ac.nz or @autuni.ac.nz).');
  }
  
  // Call the injected Firebase function
  await resetFn(authInstance, email);
  
  return true;
}
